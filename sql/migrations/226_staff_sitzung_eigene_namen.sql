-- Migration 226: die Staff-Sitzung bekommt eigene Namen (W-E10, gefunden 2026-10-01)
-- =============================================================================
-- BEFUND (am laufenden System belegt, frische Datenbank):
--   POST /staff/api/auth/login  ->  500 "relation \"session_pkey\" already exists"
--
-- Beide Sitzungsspeicher (`api/app.js`) nutzen `connect-pg-simple` mit
-- `createTableIfMissing: true` — die Plattform die Tabelle `session`, das Staff
-- Control Center `staff_session`. Die Bibliothek (10.0.0) ersetzt in ihrer
-- Vorlage `table.sql` nur den Tabellennamen `"session"`; der Name des
-- Primaerschluessels `"session_pkey"` und des Index `"IDX_session_expire"` bleiben
-- stehen. Wer zuerst kommt, belegt beide Namen, und die ZWEITE Tabelle laesst sich
-- danach nie mehr anlegen — die Anlage scheitert bei jedem Versuch neu.
--
-- Auf einer frischen Datenbank meldet sich in aller Regel zuerst ein Kunde an.
-- Danach ist das Staff Control Center dauerhaft unerreichbar (jeder Login 500).
-- Bestehende Installationen merken nichts, weil ihre Tabellen schon da sind —
-- der Fehler trifft genau den Livegang auf einer neuen Datenbank.
--
-- Diese Migration legt beide Tabellen VORHER an, mit eigenen Namen. Die
-- Bibliothek findet sie danach vor und legt nichts mehr an.
--
-- ROLLBACK / RUECKNAHME: nicht noetig und nicht sinnvoll — es sind Sitzungen. Im Notfall
-- `DROP TABLE staff_session;` (alle Staff-Mitglieder melden sich neu an).
-- =============================================================================

BEGIN;

-- 1. Hat die Staff-Tabelle die Namen schon belegt (sie kam zuerst), bekommt sie
--    ihre eigenen — sonst kann die Plattform-Tabelle nicht entstehen.
DO $$
BEGIN
  IF to_regclass('public.staff_session') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'session_pkey' AND conrelid = 'public.staff_session'::regclass) THEN
      ALTER TABLE staff_session RENAME CONSTRAINT session_pkey TO staff_session_pkey;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes
                WHERE schemaname = 'public' AND tablename = 'staff_session'
                  AND indexname = 'IDX_session_expire') THEN
      ALTER INDEX "IDX_session_expire" RENAME TO "IDX_staff_session_expire";
    END IF;
  END IF;
END $$;

-- 2. Plattform-Sitzung — dieselbe Form, die connect-pg-simple anlegen wuerde.
CREATE TABLE IF NOT EXISTS session (
  sid    varchar NOT NULL COLLATE "default",
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);

-- 3. Staff-Sitzung — eigene Namen fuer Schluessel und Index.
CREATE TABLE IF NOT EXISTS staff_session (
  sid    varchar NOT NULL COLLATE "default",
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT staff_session_pkey PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS "IDX_staff_session_expire" ON staff_session (expire);

COMMENT ON TABLE staff_session IS
  'Sitzungen des Staff Control Center (connect-pg-simple, Cookie tc.staff.sid). Migration 226: eigene Namen fuer Schluessel und Index — die Vorlage der Bibliothek benennt sie fest nach "session" und blockierte so die zweite Tabelle.';

COMMIT;
