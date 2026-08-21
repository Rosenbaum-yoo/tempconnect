-- 185_severity_zurueck_auf_die_vier.sql
-- Befund M0-B9 — die laufende Datenbank war weiter als jede Migration
--
-- WARUM DIESE MIGRATION
-- `notifications.severity` wurde in Migration 019 mit VIER Werten angelegt:
--     CHECK (severity IN ('info','warning','error','success'))
-- In der laufenden Datenbank steht aber:
--     CHECK (severity = ANY ('{info,warning,error,success,urgent}'::text[]))
--
-- Ein fuenfter Wert, `urgent`, den KEINE Migration je gewaehrt hat. Gesucht
-- wurde in allen 184 Migrationen, in `init.sql` und in den Seeds — die Spalte
-- wird an genau einer Stelle definiert, und dort stehen vier Werte. Der fuenfte
-- ist von Hand entstanden, an `sql/` vorbei.
--
-- DAS IST DER EIGENTLICHE BEFUND, nicht der fehlende Wert: das Schema war aus
-- `sql/` nicht mehr reproduzierbar. Eine frische Installation und die laufende
-- Datenbank haetten sich unterschieden — und niemand haette es gemerkt, weil
-- nichts den Unterschied prueft. Der Test, der ihn haette finden sollen
-- (`g4bKundenMeldung.flow.test.js`), war seit Wochen rot, aber aus einem
-- ANDEREN Grund: er verglich Zeichenketten mit einer Schreibweise, die Postgres
-- so nicht ausgibt. Er meldete also richtig und wurde falsch verstanden.
--
-- WARUM ZURUECK STATT VOR
-- `urgent` hat keinen Nutzer:
--   * Kein Dienst schreibt es nach `notifications` (gesucht ueber alle
--     INSERT INTO notifications).
--   * Keine einzige der 765 Zeilen traegt es (gemessen: warning 660, info 54,
--     success 50, error 1).
--   * Das Frontend kennt es nicht — weder in den Toast-Varianten noch in der
--     Stufen-Abbildung. Eine `urgent`-Zeile waere dort nicht darstellbar.
--   * `match_alerts.severity` ist eine ANDERE Spalte (Migration 027) und
--     benutzt `urgent` sehr wohl. Dort bleibt alles, wie es ist.
--
-- Ein Wert, den niemand schreibt, niemand hat und niemand anzeigen kann, ist
-- keine Faehigkeit — er ist eine Luecke in der Zusicherung. Die Datenbank
-- verspricht damit weniger, als der Code annimmt.
--
-- ROLLBACK
--   ALTER TABLE notifications DROP CONSTRAINT notifications_severity_check;
--   ALTER TABLE notifications ADD CONSTRAINT notifications_severity_check
--     CHECK (severity = ANY ('{info,warning,error,success,urgent}'::text[]));
-- Gefahrlos: die Bedingung wird dadurch WEITER, bestehende Zeilen bleiben
-- gueltig. Wer `urgent` in `notifications` wirklich braucht, nimmt diesen
-- Rollback UND traegt den Wert in `ERLAUBTE_SEVERITY`
-- (`api/services/notificationMatrix.js`) sowie in die Toast-Varianten und die
-- Stufen-Abbildung des Frontends ein — sonst entsteht dieselbe Luecke neu.

BEGIN;

-- Sicherheitsnetz: Sollte wider Erwarten doch eine Zeile `urgent` tragen,
-- bricht die Migration hier ab, statt den Constraint scheitern zu lassen —
-- mit einer Meldung, die sagt, was zu tun ist.
DO $$
DECLARE
  betroffen INT;
BEGIN
  SELECT COUNT(*) INTO betroffen FROM notifications WHERE severity = 'urgent';
  IF betroffen > 0 THEN
    RAISE EXCEPTION
      'Migration 185: % Benachrichtigung(en) tragen severity=''urgent''. '
      'Erst entscheiden, was aus ihnen wird (auf ''warning'' heben oder den Wert '
      'offiziell einfuehren), dann diese Migration erneut fahren.', betroffen;
  END IF;
END $$;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_severity_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_severity_check
  CHECK (severity IN ('info', 'warning', 'error', 'success'));

COMMIT;
