-- =============================================================================
-- 193_ersatz_anfrage_verfaellt.sql — die Anfrage bekommt eine Uhr (Plan I, 8.2)
-- =============================================================================
-- OWNER-ENTSCHEID (I_AUDIT_ZUWEISUNG_SUPPORT.md, Entscheidungen 2026-08-21):
--   "Frist einer Ersatz-Anfrage: 4 Stunden, dann verfaellt sie automatisch;
--    Erinnerung nach 2 h. [...] danach wird der Einsatz wieder offen und der
--    Knopf erscheint erneut."
--
-- BEFUND, der die Spalten noetig macht (gemessen 2026-08-23 an Repo + DB):
--   `worker_assignment_links` hat 41 Spalten und KEINE Frist-, Ablauf- oder
--   Erinnerungsspalte (information_schema, %expire%/%frist%/%remind%/%deadline%
--   = 0 Zeilen). Eine unbeantwortete Ersatz-Anfrage blockiert den Einsatz
--   unbegrenzt: sie zaehlt als `pending_quantity`, haelt `open_quantity` auf 0
--   und sperrt ueber REPLACEMENT_PENDING jeden zweiten Anlauf — und sieht dabei
--   versorgt aus.
--
-- WARUM EIGENE SPALTEN STATT created_at + 4h:
--   Der ON-CONFLICT-Zweig der Ersatz-Zuweisung recycelt eine bestehende Zeile
--   und fasst `created_at` nicht an (nur `updated_at`). Eine aus `created_at`
--   abgeleitete Frist waere beim zweiten Anlauf auf dasselbe Paar
--   (worker_user_id, assignment_id) bei der Geburt schon abgelaufen.
--   `erinnerung_faellig_am` absolut statt gerechnet: eine spaetere Aenderung
--   der 2-Stunden-Politik darf laufende Anfragen nicht rueckwirkend umstellen.
--
-- WARUM EIN EIGENER STATUSWERT `expired` (statt worker_declined mitzubenutzen):
--   Verfall ist keine Absage. Wer die beiden zusammenwirft, schreibt jedem
--   Arbeiter, der eine Anfrage schlicht nicht sah, eine Ablehnung in die
--   Historie — jede spaetere Zuverlaessigkeitsauswertung waere vergiftet.
--   Englisch, weil die fuenf Bestandswerte englisch sind; die Nachbartabelle
--   assignment_staffing_invites hat sich fuer denselben Wert entschieden.
--
-- NULL = KEINE FRIST: Altbestand (10 pending-Zeilen, aelteste 134 Tage) und
--   alle regulaeren Zuweisungen bleiben unberuehrt — dieselbe Linie wie in
--   188 ("Die neue Regel gilt ab der naechsten Ersatz-Zuweisung").
--
-- RESILIENZ: kein umschliessendes BEGIN; jeder Schritt per to_regclass.
-- IDEMPOTENZ: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS; die
--   CHECK-Erweiterungen lesen den Bestand und haengen nur Fehlendes an
--   (Muster 184, bricht laut ab statt eine Liste zu raten).
-- ROLLBACK:
--   Spalten: ALTER TABLE worker_assignment_links DROP COLUMN frist_bis,
--     DROP COLUMN erinnerung_faellig_am, DROP COLUMN erinnert_am,
--     DROP COLUMN verfallen_am; kein Bestandsverlust (alle vier NULL im Altbestand).
--   Status-CHECK: vorher UPDATE worker_assignment_links
--     SET worker_confirmation_status='worker_declined'
--     WHERE worker_confirmation_status='expired'; dann CHECK auf die
--     Fuenferliste zuruecksetzen.
--   notifications-CHECK: neue Typen sind additiv; Rueckbau nur noetig, wenn
--     Zeilen mit diesen Typen geloescht werden sollen.
-- =============================================================================

SET client_min_messages TO WARNING;

-- ── 1. Die vier Uhr-Spalten ─────────────────────────────────────────────────

DO $frist_spalten$
BEGIN
  IF to_regclass('public.worker_assignment_links') IS NULL THEN
    RAISE NOTICE '193: worker_assignment_links fehlt — uebersprungen.'; RETURN;
  END IF;

  ALTER TABLE worker_assignment_links
    ADD COLUMN IF NOT EXISTS frist_bis             TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS erinnerung_faellig_am TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS erinnert_am           TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verfallen_am          TIMESTAMPTZ;

  COMMENT ON COLUMN worker_assignment_links.frist_bis IS
    'Verfallszeitpunkt einer Ersatz-Anfrage (Owner-Entscheid: 4 h ab dem Anlegen). NULL = keine '
    'Frist — Altbestand und regulaere Zuweisungen bleiben unberuehrt. Gesetzt NUR von '
    'replaceAssignmentWorker; geprueft vom Sweep (verfalleneErsatzAnfragen) UND als Riegel direkt '
    'in confirmAssignment/declineAssignment, damit die Frist auch ohne Takt gilt.';
  COMMENT ON COLUMN worker_assignment_links.erinnerung_faellig_am IS
    'Absoluter Erinnerungszeitpunkt (Owner-Entscheid: nach 2 h). Absolut statt aus frist_bis '
    'gerechnet, damit eine spaetere Politikaenderung laufende Anfragen nicht rueckwirkend umstellt.';
  COMMENT ON COLUMN worker_assignment_links.erinnert_am IS
    'Wann die Erinnerung rausging. Die Doppelversand-Bremse: der Sweep markiert und sendet in '
    'DERSELBEN Transaktion.';
  COMMENT ON COLUMN worker_assignment_links.verfallen_am IS
    'Wann die Anfrage verfallen ist. Traegt zusammen mit worker_confirmation_status=''expired'' '
    'den Unterschied zwischen "nicht geantwortet" und "abgelehnt" — eine Absage, die niemand '
    'ausgesprochen hat, darf in keiner Zuverlaessigkeitsauswertung auftauchen.';

  RAISE NOTICE '193: frist_bis / erinnerung_faellig_am / erinnert_am / verfallen_am angelegt.';
END $frist_spalten$;

-- ── 2. Zwei Teilindizes fuer den Sweep ──────────────────────────────────────
-- Teilindex, weil die Spalten fuer die grosse Mehrheit NULL bleiben (Vorbild
-- 188). Der vorhandene wal_confirmation_status_idx fuehrt mit worker_user_id
-- und traegt einen Sweep ohne Nutzer-Einschraenkung nicht.

DO $frist_indizes$
BEGIN
  IF to_regclass('public.worker_assignment_links') IS NULL THEN RETURN; END IF;

  CREATE INDEX IF NOT EXISTS idx_wal_frist
    ON worker_assignment_links (frist_bis)
    WHERE frist_bis IS NOT NULL AND worker_confirmation_status = 'pending_confirmation';

  CREATE INDEX IF NOT EXISTS idx_wal_erinnerung
    ON worker_assignment_links (erinnerung_faellig_am)
    WHERE erinnerung_faellig_am IS NOT NULL AND erinnert_am IS NULL;

  RAISE NOTICE '193: Teilindizes idx_wal_frist / idx_wal_erinnerung angelegt.';
END $frist_indizes$;

-- ── 3. Statuswert 'expired' (additiv, Muster 184) ───────────────────────────

DO $status_check$
DECLARE
  bestand TEXT[];
  neu     TEXT[] := ARRAY['expired'];
  gesamt  TEXT[];
  vorher  INT;
  nachher INT;
  def     TEXT;
  roh     TEXT;
BEGIN
  IF to_regclass('public.worker_assignment_links') IS NULL THEN RETURN; END IF;

  SELECT pg_get_constraintdef(oid)
    INTO def
    FROM pg_constraint
   WHERE conrelid = 'worker_assignment_links'::regclass
     AND conname  = 'worker_assignment_links_worker_confirmation_status_check';

  IF def IS NULL THEN
    RAISE EXCEPTION '193: worker_confirmation_status-CHECK nicht gefunden — abgebrochen, '
                    'lieber laut scheitern als eine Statusliste raten';
  END IF;

  roh := (regexp_match(def, '''(\{.*\})''::text\[\]'))[1];
  IF roh IS NOT NULL THEN
    bestand := roh::TEXT[];
  ELSE
    SELECT array_agg(m[1] ORDER BY ord)
      INTO bestand
      FROM regexp_matches(def, '''([a-z_]+)''', 'g') WITH ORDINALITY AS a(m, ord);
  END IF;

  IF bestand IS NULL OR array_length(bestand, 1) IS NULL THEN
    RAISE EXCEPTION '193: Statusliste nicht lesbar (%) — abgebrochen', left(def, 120);
  END IF;

  vorher := array_length(bestand, 1);
  gesamt := bestand;
  FOR i IN 1 .. array_length(neu, 1) LOOP
    IF NOT (neu[i] = ANY (gesamt)) THEN
      gesamt := gesamt || neu[i];
    END IF;
  END LOOP;
  nachher := array_length(gesamt, 1);

  IF nachher < vorher THEN
    RAISE EXCEPTION '193: Statusliste waere geschrumpft (% -> %) — abgebrochen', vorher, nachher;
  END IF;

  EXECUTE 'ALTER TABLE worker_assignment_links DROP CONSTRAINT worker_assignment_links_worker_confirmation_status_check';
  EXECUTE format(
    'ALTER TABLE worker_assignment_links ADD CONSTRAINT worker_assignment_links_worker_confirmation_status_check CHECK (worker_confirmation_status = ANY (%L::text[]))',
    gesamt
  );

  RAISE NOTICE '193: worker_confirmation_status kennt jetzt % Werte (vorher %).', nachher, vorher;
END $status_check$;

-- ── 4. Drei Benachrichtigungstypen (additiv, Muster 184) ────────────────────
-- Ein Typ, der nicht im CHECK steht, scheitert NICHT laut: notifyWorker stuft
-- ihn still auf 'general' herab und die Meldung verliert im Portal ihre
-- Zusage-/Absage-Knoepfe. Migration und Code werden deshalb zusammen
-- ausgeliefert; der erweiterte Waechter benachrichtigungsSpiegel haelt
-- SEVERITY_MAP und CHECK ab jetzt gegeneinander.

DO $typen_check$
DECLARE
  bestand TEXT[];
  neu     TEXT[] := ARRAY[
    'worker_assignment_reminder',    -- an den Arbeiter: "noch 2 h, bitte antworten"
    'worker_assignment_expired',     -- an den Arbeiter: "die Anfrage ist verfallen"
    'worker_replacement_expired'     -- an die Disponenten (worker.manage): "Bedarf wieder offen"
  ];
  gesamt  TEXT[];
  vorher  INT;
  nachher INT;
  def     TEXT;
  roh     TEXT;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN RETURN; END IF;

  SELECT pg_get_constraintdef(oid)
    INTO def
    FROM pg_constraint
   WHERE conrelid = 'notifications'::regclass
     AND conname  = 'notifications_type_check';

  IF def IS NULL THEN
    RAISE EXCEPTION '193: notifications_type_check nicht gefunden — abgebrochen';
  END IF;

  roh := (regexp_match(def, '''(\{.*\})''::text\[\]'))[1];
  IF roh IS NOT NULL THEN
    bestand := roh::TEXT[];
  ELSE
    SELECT array_agg(m[1] ORDER BY ord)
      INTO bestand
      FROM regexp_matches(def, '''([a-z_]+)''', 'g') WITH ORDINALITY AS a(m, ord);
  END IF;

  IF bestand IS NULL OR array_length(bestand, 1) IS NULL THEN
    RAISE EXCEPTION '193: Typliste nicht lesbar (%) — abgebrochen', left(def, 120);
  END IF;

  vorher := array_length(bestand, 1);
  gesamt := bestand;
  FOR i IN 1 .. array_length(neu, 1) LOOP
    IF NOT (neu[i] = ANY (gesamt)) THEN
      gesamt := gesamt || neu[i];
    END IF;
  END LOOP;
  nachher := array_length(gesamt, 1);

  IF nachher < vorher THEN
    RAISE EXCEPTION '193: Typliste waere geschrumpft (% -> %) — abgebrochen', vorher, nachher;
  END IF;

  EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT notifications_type_check';
  EXECUTE format(
    'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (%L::text[]))',
    gesamt
  );

  RAISE NOTICE '193: notifications.type kennt jetzt % Typen (vorher %).', nachher, vorher;
END $typen_check$;
