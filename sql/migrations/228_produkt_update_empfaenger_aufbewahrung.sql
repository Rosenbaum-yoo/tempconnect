-- Migration 228: Empfaengerlisten der Produkt-Mails werden nach 12 Monaten geloescht
-- =============================================================================
-- OWNER-ENTSCHEID (2026-10-01, woertlich): „Listen nach 12 Monaten löschen"
--
-- Die Empfaengerliste je Mitteilung (`product_release_mail_empfaenger`, Migration
-- 227) belegt, wer welche Produkt-Mail bekommen hat. Sie traegt keine Adresse,
-- aber sie verbindet Menschen mit Mailings — und wird nach dem Versand nur noch
-- gebraucht, solange jemand nachfragen koennte, was er bekommen hat. Zwoelf
-- Monate decken das ab; danach ist sie Datenballast (Datensparsamkeit).
--
-- WAS GELOESCHT WIRD: alle Zeilen, deren Liste vor mehr als 12 Monaten
-- eingefroren wurde (`angelegt_am`). Eine Liste wird in EINER Anweisung
-- eingefroren, alle ihre Zeilen tragen denselben Zeitpunkt — sie verschwindet
-- also als Ganzes, nie zur Haelfte.
--
-- WAS BLEIBT: die Mitteilung selbst und ihr Stempel `email_sent_at` („gesendet am
-- …"). Das Staff CC zeigt danach „Empfängerliste nicht (mehr) gespeichert" —
-- es erfindet keine Zahlen.
--
-- DIE REGEL STEHT HIER, IN DER DATENBANK — wie bei `worker_status_events_aufraeumen`
-- (Migration 179): dort, wo die Daten liegen, und genau einmal. Der Anwendungscode
-- ruft die Funktion nur auf (taeglich, Betriebstakt `produkt-update-aufbewahrung`);
-- er kennt die Frist nicht, damit es keine zweite Zahl gibt, die irgendwann die
-- falsche ist. Ohne Redis laeuft der Takt nicht — dann von Hand:
--   SELECT produkt_update_empfaenger_aufraeumen();
--
-- ROLLBACK / RUECKNAHME:
--   DROP FUNCTION IF EXISTS produkt_update_empfaenger_aufraeumen();
-- und den Takt `produkt-update-aufbewahrung` aus api/workers/index.js nehmen.
-- Bereits geloeschte Listen kommen dadurch nicht zurueck.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION produkt_update_empfaenger_aufraeumen()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_geloescht INTEGER;
BEGIN
  DELETE FROM product_release_mail_empfaenger
   WHERE angelegt_am < NOW() - INTERVAL '12 months';
  GET DIAGNOSTICS v_geloescht = ROW_COUNT;
  RETURN v_geloescht;
END $$;

COMMENT ON FUNCTION produkt_update_empfaenger_aufraeumen() IS
  'Owner-Entscheid 2026-10-01: Empfaengerlisten der Produkt-Mails werden 12 Monate nach dem Einfrieren geloescht. Taeglich ausgeloest vom Betriebstakt produkt-update-aufbewahrung; liefert die Zahl der geloeschten Zeilen.';

COMMIT;
