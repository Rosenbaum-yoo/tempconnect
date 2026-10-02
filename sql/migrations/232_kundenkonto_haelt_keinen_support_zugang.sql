-- =============================================================================
-- Migration 232: ein Kundenkonto haelt keinen Support-Zugang (Owner-Punkt 15)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DER BEFUND
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `demo@firma.de` ist ein KUNDENKONTO: `users.role = 'company'`, eine
-- Org-Mitgliedschaft bei „Demo GmbH". Dasselbe Konto hielt einen AKTIVEN
-- `external_support_agent`-Zugang beim Dienstleister „India Support BPO"
-- (`scope = 'external'`, `data_scope = 'vendor_scoped'`, angelegt 2026-06-19).
--
-- `support_vendors` sind laut Migration 110 „BPO / Callcenter Partner" — FREMDE
-- Firmen, die Support uebernehmen. Ein `external_support_agent` ist ein Mensch
-- DORT, kein Kunde. Und `support_agents` steht im Kopf von 110 ausdruecklich
-- „getrennt von Org-RBAC". Ein Konto in beiden Welten ist damit genau die
-- Vermischung, die `docs/FLAECHEN.md` und CLAUDE.md verbieten
-- („Keine Vermischung von Session-/Berechtigungswelten").
--
-- WARUM KEIN WAECHTER DAS GEFUNDEN HAT: der vorhandene
-- `staffNieAusDerPlattform.test.js` prueft LINKS — keinen Weg von der
-- Kundenplattform in eine interne Flaeche. Er kann nicht sehen, dass ein KONTO in
-- beiden Welten sitzt. Der Befund wurde bei Welle Y4 gemeldet
-- (`sql/seeds/y4-flaechen.sql`, Kopf, Befund 1) und ausdruecklich NICHT
-- angefasst, weil er einen bestehenden Demo-Weg betrifft und damit einen
-- Anmeldeweg. Owner-Freigabe dazu: 2026-10-02.
--
-- GEMESSEN am 2026-10-02, vor dem Lauf:
--
--   betroffene Konten                                     1 (demo@firma.de)
--   davon mit Owner-Zugang                                0
--   Owner-Konten MIT Org-Mitgliedschaft                   0 (beide)
--   Support-Faelle/Notizen/Ereignisse an dieser Zeile      0 / 0 / 0
--   aktive externe Agenten OHNE Org-Mitgliedschaft danach  0  <-- siehe unten
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WAS DIESE MIGRATION TUT — UND WAS SIE BEWUSST NICHT TUT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SIE WIDERRUFT, SIE LOESCHT NICHT. `is_active = FALSE`, und das ist keine
-- Stilfrage: SECHS Tabellen zeigen auf `support_agents.id`, alle mit
-- `ON DELETE SET NULL` — `support_cases.assigned_to_agent_id`,
-- `support_case_notes.author_agent_id`, `support_case_events.actor_agent_id`,
-- beide Spalten von `support_escalations` und `support_audit_log.agent_id`. Ein
-- DELETE wuerde still den AKTEUR EINES AUDIT-EINTRAGS auf NULL setzen. Ein
-- Aufraeumen, das ein Protokoll anonymisiert, ist schlimmer als die Zeile, die es
-- aufraeumt. (Dass heute null Faelle daran haengen, aendert die Regel nicht: sie
-- darf nicht davon abhaengen, dass eine Tabelle gerade leer ist.)
--
-- SIE FASST OWNER-KONTEN NICHT AN. Wer einen wirksamen `occ_owner_access` hat,
-- bleibt unberuehrt — auch wenn er eine Org-Mitgliedschaft hat. Zwei Gruende:
-- erstens ist „das Team ist eine Person" (CLAUDE.md) die bewusste Lage, der
-- Eigentuemer traegt Staff, Support und Owner gleichzeitig. Zweitens ist ein
-- Eingriff in den eigenen Anmeldeweg eine Owner-Entscheidung, keine Migration.
-- Heute greift die Ausnahme nicht (beide Owner-Konten haben 0 Mitgliedschaften);
-- sie ist ein Netz, nicht eine Notwendigkeit. Ohne das Netz waere dies derselbe
-- Fehler wie in Migration 230 vor ihrer Korrektur: eine Bedingung, die den Fall
-- „der Handelnde ist der Eigentuemer" nicht mitdenkt.
--
-- SIE BEREINIGT NUR, WAS GEMESSEN DA IST — und deckt bewusst NICHT
-- `tempconnect_staff` und `occ_owner_access` mit ab, obwohl die Regel dort
-- genauso gilt. Gemessen gibt es dort keinen Fall. Eine Migration, die auch
-- kuenftige Faelle still wegraeumt, versteckt den naechsten Vorfall: niemand
-- erfaehrt, dass jemand ein Kundenkonto zum Staff gemacht hat, weil es beim
-- naechsten Lauf verschwindet. Die Regel fuer ALLE drei Flaechen steht deshalb in
-- einem WAECHTER, der ROT wird: `api/test/keineDoppelrolle.test.js`.
--
-- UND SIE LAESST DEN EXTERNEN WEG NICHT LEER. Nach diesem Lauf gibt es gemessen
-- NULL aktive externe Agenten. Den Halter bringt `sql/seeds/y4-flaechen.sql`
-- mit (Konto Nr. 10, `support.extern@probebuehne.tempconnect.de`, beim eigenen
-- Buehnen-Dienstleister). Die Saat laeuft NACH den Migrationen; diese Datei kann
-- den Halter deshalb nicht pruefen, und sie behauptet es auch nicht. Geprueft
-- wird er im Waechter.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK-STRATEGIE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Es gibt keinen automatischen Rueckweg, und das ist Absicht: die Zeilen wieder
-- einzuschalten heisst, ein Kundenkonto wieder in die Support-Welt zu lassen.
-- Wer das will, tut es benannt und einzeln:
--
--   UPDATE support_agents SET is_active = TRUE, updated_at = NOW()
--    WHERE id = '<die eine Kennung>';   -- NICHT ueber eine Bedingung
--
-- Die betroffenen Kennungen stehen danach als WARNUNG dieses Laufs (nicht als
-- NOTICE: oben steht `SET client_min_messages TO WARNING`, und ein Rueckweg, der
-- im Rauschfilter verschwindet, ist keiner - gemessen beim ersten Lauf). In der
-- Entwicklungsdatenbank am 2026-10-02 war es genau eine:
-- `3302e269-928c-4839-9325-135d2d665487` (demo@firma.de, India Support BPO).
-- Ein Rollback per Bedingung („alle, die 232 angefasst hat") gibt es nicht,
-- weil diese Bedingung genau die Vermischung wiederherstellen wuerde, die der
-- Waechter danach rot melden wird.
--
-- Owner-Punkt 15 — 2026-10-02
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

DO $trennung$
DECLARE
  betroffen int;
  kennungen text;
  rest int;
BEGIN
  /* Erst benennen, dann handeln: wer wird angefasst? Das NOTICE ist der einzige
     Weg zurueck (siehe Rollback-Strategie), also muss es VOR dem UPDATE
     eingesammelt werden. */
  SELECT count(*), coalesce(string_agg(a.id::text || ' (' || u.email || ')', ', '), '-')
    INTO betroffen, kennungen
    FROM support_agents a
    JOIN users u ON u.id = a.user_id
   WHERE a.is_active = TRUE
     AND EXISTS (SELECT 1 FROM org_memberships m WHERE m.user_id = a.user_id)
     AND NOT EXISTS (SELECT 1 FROM occ_owner_access o
                      WHERE o.user_id = a.user_id AND o.revoked_at IS NULL);

  UPDATE support_agents a
     SET is_active = FALSE, updated_at = NOW()
   WHERE a.is_active = TRUE
     AND EXISTS (SELECT 1 FROM org_memberships m WHERE m.user_id = a.user_id)
     AND NOT EXISTS (SELECT 1 FROM occ_owner_access o
                      WHERE o.user_id = a.user_id AND o.revoked_at IS NULL);

  /* RAISE WARNING, NICHT NOTICE - und das war ein echter Defekt dieser Datei.
     ─────────────────────────────────────────────────────────────────────────
     Hier stand `RAISE NOTICE`. Oben steht `SET client_min_messages TO WARNING`
     (Hausstil, damit die Kette nicht im Rauschen untergeht) - und das
     UNTERDRUECKT jedes NOTICE. Gemessen beim ersten Lauf am 2026-10-02: die
     Migration raeumte eine Zeile auf und gab NICHTS aus.
     Das ist nicht kosmetisch: die Rollback-Strategie im Kopf sagt, dieses
     Meldungstext sei der EINZIGE Weg zurueck, weil es die betroffenen Kennungen
     nennt. Ein Rueckweg, der im Rauschfilter verschwindet, ist keiner. Der eine
     Satz, der etwas aufbewahrt, gehoert also ueber die Schwelle. */
  IF betroffen > 0 THEN
    RAISE WARNING '232: % Support-Zugang/-Zugaenge von Kundenkonten widerrufen (is_active = FALSE, KEIN DELETE): %', betroffen, kennungen;
    RAISE WARNING '232: Rueckweg nur einzeln und benannt - UPDATE support_agents SET is_active = TRUE WHERE id = ''<eine der Kennungen oben>'';';
  ELSE
    RAISE NOTICE '232: kein Kundenkonto hielt einen aktiven Support-Zugang - nichts zu tun (No-Op).';
  END IF;

  /* NOTBREMSE 1 · die Wirkung, nicht die Absicht. Bleibt eine Zeile uebrig, hat
     die Bedingung sie nicht erfasst, und die Vermischung besteht weiter. */
  SELECT count(*) INTO rest
    FROM support_agents a
   WHERE a.is_active = TRUE
     AND EXISTS (SELECT 1 FROM org_memberships m WHERE m.user_id = a.user_id)
     AND NOT EXISTS (SELECT 1 FROM occ_owner_access o
                      WHERE o.user_id = a.user_id AND o.revoked_at IS NULL);
  IF rest <> 0 THEN
    RAISE EXCEPTION '232: % Kundenkonto/-konten halten weiter einen aktiven Support-Zugang. Die Bedingung hat sie nicht erfasst - die Vermischung besteht.', rest;
  END IF;

  /* NOTBREMSE 2 · das Netz hat gehalten. Ein wirksamer Owner-Zugang darf diesen
     Lauf ueberlebt haben, auch mit Org-Mitgliedschaft. Wuerde hier 0 stehen,
     haette die Migration den eigenen Anmeldeweg angefasst - genau das, was sie
     nicht darf. Geprueft wird die Zahl der Owner-Zugaenge, nicht ihre Rolle: die
     Flaeche muss offen bleiben. */
  SELECT count(*) INTO rest FROM occ_owner_access WHERE revoked_at IS NULL;
  IF rest < 1 THEN
    RAISE EXCEPTION '232: kein wirksamer Owner-Zugang mehr. Diese Migration darf Owner-Konten NICHT anfassen.';
  END IF;

  /* NOTBREMSE 3 · die Probe prueft ueberhaupt etwas. Gibt es keine einzige
     Org-Mitgliedschaft, ist Notbremse 1 leer erfuellt und beweist nichts. Auf
     einem FRISCHINSTALL ist das der normale Zustand - dann sagt es das, statt zu
     werfen (die Lehre aus Migration 230). */
  SELECT count(*) INTO rest FROM org_memberships;
  IF rest = 0 THEN
    /* Auch das MUSS ueber die Schwelle: eine unterdrueckte Meldung "ich habe
       nichts nachgewiesen" ist genau die Falle, die sie benennen soll. */
    RAISE WARNING '232: keine Org-Mitgliedschaften vorhanden (Frischinstall) - die Pruefung ist leer erfuellt und hat NICHTS nachgewiesen. Der Waechter api/test/keineDoppelrolle.test.js prueft die Regel am Bestand.';
  END IF;
END $trennung$;

COMMIT;
