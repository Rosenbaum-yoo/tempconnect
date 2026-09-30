-- =============================================================================
-- 191_ein_meldeweg_weniger.sql — die Tabelle `reports` faellt weg (Plan I, 10)
-- =============================================================================
-- OWNER-ENTSCHEIDUNG vom 2026-08-23: Personen-Meldungen ueber `POST /reports`
-- entfallen ersatzlos. Wer sich ueber eine Person beschweren will, nutzt den
-- Support-Trichter mit der Fallart `complaint` — der seit dem 2026-08-22 einen
-- Eingang hat und bei einem echten Menschen landet.
--
-- WARUM ENTFERNEN UND NICHT ZUSAMMENFUEHREN
--   Die Route hatte NULL Aufrufer im gesamten Repo (drei unabhaengige
--   Suchmerkmale: Pfad `/reports`, Nutzlast `reported_user_id`, Vokabular
--   `betrug|belaestigung` — je 0 Treffer unter frontend/) und NULL Zeilen in der
--   Datenbank. Es gab nie einen Knopf dafuer.
--
--   Sie in `profile_abuse_reports` zu ueberfuehren haette zuerst zwei Blocker
--   gekostet, die beide nicht technisch loesbar sind:
--     * 144 von 395 Nutzern sind KEINER Organisation zuzuordnen —
--       `profile_abuse_reports.reported_org_id` ist NOT NULL und der
--       Staff-Posteingang verbindet ueber einen INNER JOIN. Eine Meldung ohne
--       Organisation waere unsichtbar.
--     * Die Grund-Vokabulare ueberschneiden sich nur bei `spam`. `betrug` und
--       `belaestigung` haben KEINE Entsprechung, und sie in `other`
--       einzuschmelzen loescht genau die Unterscheidung, wegen der man meldet.
--
--   Eine Flaeche, die niemand nutzt, gegen zwei ungeloeste Fragen einzutauschen,
--   waere die naechste halb gebaute Flaeche gewesen.
--
-- DER RIEGEL UNTEN IST DER EIGENTLICHE INHALT DIESER MIGRATION.
--   `DROP TABLE` ist nicht rueckholbar. Dass die Tabelle HIER leer ist, sagt
--   nichts ueber Staging oder Produktion. Die Migration zaehlt deshalb selbst
--   nach und BRICHT AB, wenn auch nur eine Zeile darin steht — dann hat jemand
--   die Route doch benutzt, und diese Entscheidung gehoert neu getroffen, nicht
--   automatisch vollzogen.
--
-- RESILIENZ: kein umschliessendes BEGIN; to_regclass vor jedem Schritt.
-- IDEMPOTENZ: laeuft die Migration ein zweites Mal, ist die Tabelle bereits
--   weg und der Block endet still.
-- ROLLBACK: `sql/migrations/007_reports.sql` legt die Tabelle wieder an. Der
--   INHALT ist nicht wiederherstellbar — deshalb der Riegel. Der Code
--   (api/routes/reports.js, api/services/reportService.js) kommt aus der
--   Versionsgeschichte zurueck; der Registereintrag stand zuletzt auf `BEFUND`.
-- =============================================================================

SET client_min_messages TO WARNING;

DO $meldeweg$
DECLARE
  anzahl BIGINT;
BEGIN
  IF to_regclass('public.reports') IS NULL THEN
    RAISE NOTICE '191: Tabelle reports gibt es nicht (mehr) — uebersprungen.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM reports' INTO anzahl;

  IF anzahl > 0 THEN
    RAISE EXCEPTION
      '191 ABGEBROCHEN: reports enthaelt % Zeile(n). Die Entfernung wurde unter der '
      'gemessenen Annahme entschieden, dass die Route nie benutzt wurde (0 Aufrufer, '
      '0 Zeilen). Hier stimmt das nicht. Diese Zeilen sind echte Missbrauchsmeldungen '
      'von Nutzern — sie zu verwerfen waere der teuerste denkbare Fehler dieser Welle. '
      'Bitte den Bestand sichern und die Entscheidung neu treffen.', anzahl;
  END IF;

  DROP TABLE reports;
  RAISE NOTICE '191: reports entfernt (war leer).';
END $meldeweg$;
