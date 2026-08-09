-- 167_bounty_kampagnenzeitraum.sql
-- P9 Spur A / Welle A2 — Zuschaltbarkeit, Teil 2: befristete Bounties
--
-- WARUM DIESE MIGRATION
-- Migration 166 hat den Dauer-Schalter gebracht (`is_active`). Damit laesst sich ein
-- Bounty an- und abschalten, aber nur von Hand und nur zum Zeitpunkt des Klicks.
-- Ein Kampagnen-Bounty ("Gruendungsmitglied-Aktion bis Ende Oktober") braucht ein
-- Ende, das von selbst eintritt — sonst muss jemand daran denken, und genau das
-- passiert an einem Freitagabend nicht.
--
-- DATE, nicht TIMESTAMPTZ, und bewusst so:
-- Eine Marketing-Kampagne laeuft in Tagen, nicht in Sekunden. Der Vergleichstag wird
-- vom Dienst als Parameter uebergeben (`todayDE()` aus api/utils/dateDE.js) und NICHT
-- ueber `CURRENT_DATE` gebildet. Sonst haengt die Gueltigkeit an der Zeitzone des
-- Datenbankservers, und eine Kampagne endet fuer einen Teil der Nutzer einen Tag zu
-- frueh — derselbe Off-by-one, den die DACH-first-Regel im Projekt schon einmal
-- geschlossen hat.
--
-- Beide Spalten sind NULL-bar, und NULL heisst "keine Grenze". Ein Dauer-Bounty
-- traegt zweimal NULL und verhaelt sich exakt wie bisher.
--
-- ROLLBACK
--   ALTER TABLE bounties DROP CONSTRAINT IF EXISTS bounties_zeitraum_check;
--   ALTER TABLE bounties DROP COLUMN IF EXISTS available_until;
--   ALTER TABLE bounties DROP COLUMN IF EXISTS available_from;

BEGIN;

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS available_from  DATE,
  ADD COLUMN IF NOT EXISTS available_until DATE;

-- Ein Zeitraum, der vor seinem Beginn endet, ist keine Konfiguration, sondern ein
-- Tippfehler. Der faellt hier auf und nicht erst, wenn sich Nutzer beschweren,
-- dass ein beworbenes Bounty nie erscheint.
ALTER TABLE bounties
  DROP CONSTRAINT IF EXISTS bounties_zeitraum_check;
ALTER TABLE bounties
  ADD CONSTRAINT bounties_zeitraum_check
  CHECK (
    available_from IS NULL
    OR available_until IS NULL
    OR available_until >= available_from
  );

COMMENT ON COLUMN bounties.available_from IS
  'Kampagnenbeginn (Europe/Berlin, einschliesslich). NULL = keine untere Grenze.';
COMMENT ON COLUMN bounties.available_until IS
  'Kampagnenende (Europe/Berlin, einschliesslich). NULL = laeuft unbefristet. Nach Ablauf verhaelt sich das Bounty wie abgeschaltet: keine Vergabe, keine Anzeige, kein Rabatt.';

COMMIT;
