-- =============================================================================
-- 197_altbestand_eingefrorene_anfragen.sql — die Zeilen, die nie antworten koennen
-- =============================================================================
-- OWNER-ENTSCHEID (I2_FRIST_REGULAERE_ZUWEISUNG.md, Entscheidung 3, Freigabe
--   2026-08-24): "nur die fuenf unbeantwortbaren" auf 'expired' setzen.
--
-- WARUM DER ALTBESTAND UEBERHAUPT LIEGENBLIEB:
--   Die Frist (Migration 195) gilt ab der naechsten Anfrage — `frist_bis IS NULL`
--   heisst "keine Frist", und der Sweep laesst solche Zeilen bewusst in Ruhe
--   (Linie aus 188/193). Neun regulaere pending-Zeilen aus der Zeit davor
--   erreicht damit keine Regel, egal wie lange sie schon warten.
--
-- WARUM NUR FUENF DAVON, NICHT ALLE NEUN:
--   Bei fuenf liegt das effektive Ende des Einsatzes in der Vergangenheit. Fuer
--   sie weisen `confirmAssignment` und `declineAssignment` JEDE Antwort mit
--   ASSIGNMENT_NOT_CURRENT ab (Lebenszyklus 'expired', gepueft VOR dem UPDATE) —
--   der Mensch KANN nicht mehr antworten, auch wenn er wollte, waehrend
--   recalcAssignmentStaffing die Zeile weiter als belegt zaehlt. Hier nimmt der
--   Eingriff nachweislich nichts weg.
--   Die uebrigen vier sind technisch beantwortbar (kein Enddatum oder eines in
--   der Zukunft). Sie bleiben stehen: eine Anfrage abzuraeumen, die jemand noch
--   annehmen koennte, waere eine Entscheidung ueber seinen Kopf hinweg.
--
-- WARUM 'expired' UND NICHT 'worker_declined':
--   Dieselbe Linie wie 193. Verfall ist keine Absage; wer beides zusammenwirft,
--   schreibt jedem, der eine Anfrage schlicht nicht sah, eine Ablehnung in die
--   Historie und vergiftet jede spaetere Zuverlaessigkeitsauswertung.
--
-- KEINE BENACHRICHTIGUNG. "Ihre Anfrage von vor vier Monaten ist verfallen"
--   erklaert nichts und weckt Fragen zu einem Einsatz, der laengst vorbei ist.
--   Der Vorgang gehoert ins Audit, nicht ins Postfach — deshalb Schritt 3.
--
-- DIE ZAHLEN MUESSEN MIT. Ohne Schritt 2 blieben die Einsaetze auf ihren alten
--   `reserved_quantity`/`open_quantity` stehen: die Zeile waere erledigt, der
--   Platz aber weiter blockiert. Die Formel spiegelt `recalcAssignmentStaffing`
--   (assignmentStaffingService.js) und das Vorbild aus Migration 087 — inklusive
--   der Ablaufpruefung bei Reservierungen und Einladungen, die der Dienst dort
--   ebenfalls anwendet.
--
-- RESILIENZ: kein umschliessendes BEGIN; jeder Schritt per to_regclass.
-- IDEMPOTENZ: Der WHERE-Filter entwertet sich selbst — nach dem ersten Lauf
--   traegt keine Zeile mehr 'pending_confirmation', ein zweiter Lauf trifft
--   nichts. Schritt 2 ist ohnehin eine Neuberechnung aus dem Ist-Zustand.
-- ROLLBACK: Die betroffenen Zeilen sind an `verfallen_am` erkennbar (die
--   Migration stempelt sie mit demselben Zeitpunkt):
--     UPDATE worker_assignment_links
--        SET worker_confirmation_status='pending_confirmation', is_active=TRUE,
--            verfallen_am=NULL
--      WHERE worker_confirmation_status='expired' AND frist_bis IS NULL
--        AND verfallen_am = '<Zeitpunkt aus dem Migrationslauf>';
--   danach Schritt 2 erneut ausfuehren.
-- =============================================================================

SET client_min_messages TO WARNING;

-- ── 1. Die unbeantwortbaren Zeilen schliessen ───────────────────────────────

DO $altbestand$
DECLARE
  getroffen INT;
  offen     INT;
BEGIN
  IF to_regclass('public.worker_assignment_links') IS NULL
     OR to_regclass('public.assignments') IS NULL THEN
    RAISE NOTICE '197: Tabellen fehlen — uebersprungen.'; RETURN;
  END IF;

  /* Das effektive Ende ist dasselbe wie im Lebenszyklus-Baustein
   * (assignmentLifecycleService.buildAssignmentEffectiveEndDateSql): das Ende
   * des LINKS gewinnt, sonst das des Einsatzes. Ist es NULL, laeuft der Einsatz
   * unbefristet — dann ist die Anfrage beantwortbar und bleibt in Ruhe. */
  WITH eingefroren AS (
    SELECT wal.id
      FROM worker_assignment_links wal
      JOIN assignments a ON a.id = wal.assignment_id
     WHERE wal.worker_confirmation_status = 'pending_confirmation'
       AND wal.is_active = TRUE
       AND wal.frist_bis IS NULL            -- nur Altbestand, nie eine laufende Frist
       AND COALESCE(
             wal.end_date,
             CASE WHEN a.status = 'completed'
                  THEN COALESCE(a.actual_end_date, a.planned_end_date)
                  ELSE COALESCE(a.planned_end_date, a.actual_end_date)
             END
           ) < CURRENT_DATE
  )
  UPDATE worker_assignment_links w
     SET worker_confirmation_status = 'expired',
         is_active    = FALSE,
         verfallen_am = NOW(),
         updated_at   = NOW()
    FROM eingefroren e
   WHERE w.id = e.id;

  GET DIAGNOSTICS getroffen = ROW_COUNT;

  SELECT count(*) INTO offen
    FROM worker_assignment_links
   WHERE worker_confirmation_status = 'pending_confirmation'
     AND is_active = TRUE AND frist_bis IS NULL;

  RAISE NOTICE '197: % eingefrorene Anfrage(n) geschlossen, % Altbestandszeile(n) '
               'bleiben beantwortbar und unberuehrt.', getroffen, offen;
END $altbestand$;

-- ── 2. Die Staffing-Zahlen der betroffenen Einsaetze nachziehen ─────────────

DO $zahlen$
DECLARE
  betroffen INT;
BEGIN
  IF to_regclass('public.assignments') IS NULL THEN RETURN; END IF;

  /* Nur die Einsaetze, an denen gerade eine Zeile geschlossen wurde — eine
   * plattformweite Neuberechnung waere ein viel groesserer Eingriff, als diese
   * Migration rechtfertigt. */
  CREATE TEMP TABLE _mig197_asg ON COMMIT DROP AS
    SELECT DISTINCT assignment_id AS id
      FROM worker_assignment_links
     WHERE worker_confirmation_status = 'expired'
       AND frist_bis IS NULL
       AND verfallen_am > NOW() - INTERVAL '5 minutes';

  UPDATE assignments a
     SET filled_quantity = COALESCE((
           SELECT COUNT(*)::INT FROM worker_assignment_links wal
            WHERE wal.assignment_id = a.id AND wal.is_active = TRUE
              AND wal.worker_confirmation_status IN ('auto_confirmed','worker_confirmed')), 0),
         reserved_quantity = COALESCE((
           SELECT COUNT(*)::INT FROM worker_assignment_links wal
            WHERE wal.assignment_id = a.id AND wal.is_active = TRUE
              AND wal.worker_confirmation_status = 'pending_confirmation'), 0)
           + COALESCE((
           SELECT COUNT(*)::INT FROM assignment_staffing_reservations r
            WHERE r.assignment_id = a.id AND r.status = 'reserved'
              AND (r.expires_at IS NULL OR r.expires_at > NOW())), 0),
         staffing_last_recalculated_at = NOW()
   WHERE a.id IN (SELECT id FROM _mig197_asg);

  UPDATE assignments a
     SET open_quantity = GREATEST(GREATEST(a.requested_quantity, 1) - a.filled_quantity - a.reserved_quantity, 0),
         staffing_status = CASE
           WHEN a.status = 'cancelled' THEN 'cancelled'
           WHEN a.status = 'completed' THEN 'closed'
           WHEN a.filled_quantity >= GREATEST(a.requested_quantity, 1) THEN 'filled'
           WHEN a.filled_quantity > 0 THEN 'partially_filled'
           WHEN a.reserved_quantity > 0
             OR EXISTS (SELECT 1 FROM assignment_staffing_invites i
                         WHERE i.assignment_id = a.id
                           AND i.status IN ('sent','viewed','interested','accepted')
                           AND (i.expires_at IS NULL OR i.expires_at > NOW()))
             THEN 'sourcing'
           ELSE 'open'
         END
   WHERE a.id IN (SELECT id FROM _mig197_asg);

  GET DIAGNOSTICS betroffen = ROW_COUNT;
  RAISE NOTICE '197: Staffing-Zahlen von % Einsatz/Einsaetzen nachgezogen.', betroffen;
END $zahlen$;

-- ── 3. Der Vorgang gehoert ins Audit ────────────────────────────────────────

DO $audit$
DECLARE
  anzahl INT;
BEGIN
  IF to_regclass('public.audit_log') IS NULL THEN
    RAISE NOTICE '197: audit_log fehlt — Eintrag uebersprungen.'; RETURN;
  END IF;

  SELECT count(*) INTO anzahl
    FROM worker_assignment_links
   WHERE worker_confirmation_status = 'expired' AND frist_bis IS NULL
     AND verfallen_am > NOW() - INTERVAL '5 minutes';

  IF anzahl = 0 THEN
    RAISE NOTICE '197: nichts geschlossen — kein Audit-Eintrag.'; RETURN;
  END IF;

  /* GENAU EIN EINTRAG, auch bei mehrfachem Einspielen. Das Zeitfenster oben
   * ("in den letzten fuenf Minuten gestempelt") trifft beim zweiten Lauf noch
   * immer zu — ohne diese Sperre entstuende ein zweites Protokoll ueber
   * dieselbe Datenwanderung. Beim Probelauf genau so passiert. */
  IF EXISTS (SELECT 1 FROM audit_log
              WHERE action = 'assignment.altbestand_anfragen_geschlossen'
                AND details->>'migration' = '197_altbestand_eingefrorene_anfragen') THEN
    RAISE NOTICE '197: Audit-Eintrag existiert bereits — nicht doppelt geschrieben.';
    RETURN;
  END IF;

  /* Ohne Akteur: es war kein Mensch, sondern eine Datenwanderung auf
   * Owner-Entscheid. Die Spalten werden defensiv gefuellt — welche eine
   * Umgebung genau hat, unterscheidet sich (siehe Migration 187). */
  INSERT INTO audit_log (action, entity_type, details)
  VALUES (
    'assignment.altbestand_anfragen_geschlossen',
    'worker_assignment_link',
    jsonb_build_object(
      'migration', '197_altbestand_eingefrorene_anfragen',
      'anzahl', anzahl,
      'grund', 'Einsatzzeitraum vorbei — Zusage und Absage waren serverseitig '
               || 'nicht mehr moeglich (ASSIGNMENT_NOT_CURRENT), die Zeile zaehlte '
               || 'aber weiter als belegt',
      'owner_entscheid', 'I2_FRIST_REGULAERE_ZUWEISUNG.md, Entscheidung 3, 2026-08-24',
      'keine_benachrichtigung', TRUE
    )
  );

  RAISE NOTICE '197: Audit-Eintrag fuer % geschlossene Anfrage(n) geschrieben.', anzahl;
EXCEPTION WHEN undefined_column OR not_null_violation THEN
  /* Ein abweichendes audit_log-Schema darf die Datenbereinigung nicht
   * zurueckrollen — die fachliche Wirkung steht bereits. */
  RAISE NOTICE '197: audit_log-Schema abweichend, Eintrag uebersprungen (%).', SQLERRM;
END $audit$;
