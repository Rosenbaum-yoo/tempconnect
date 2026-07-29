-- 156: Herkunft eines Stundenzettels sichtbar machen (Audit-Backlog C-1, Owner-Freigabe 2026-07-26).
--
-- WORUM ES GEHT
-- Es gibt zwei Wege in die Abrechnungsschicht `timesheets`:
--   (a) aus einer freigegebenen Worker-Meldung (`worker_time_submissions`) — die Kraft hat
--       die Stunden selbst gemeldet, es existiert ein Nachweis;
--   (b) manuell ueber `POST /api/timesheets` — der Name der Kraft ist Freitext, es gibt
--       keine Gegenmeldung.
--
-- Beides ist legitim: nicht jede Agentur hat ihre Kraefte im Portal. Aber in der Abrechnung
-- und erst recht im Streitfall ist der Unterschied entscheidend — und war bisher nur
-- indirekt erkennbar (ueber ein LEFT JOIN auf worker_time_submissions.timesheet_id).
-- Wer die Zeile ansieht, soll sofort wissen, worauf sie beruht.
--
-- BACKFILL
-- Bestandszeilen werden nicht geraten: jede Zeile, auf die eine Worker-Meldung zeigt, ist
-- nachweisbar (b) ausgeschlossen und wird 'worker_submission'; alles Uebrige 'manual'.
-- Das ist die konservative Richtung — im Zweifel "kein Nachweis" statt faelschlich "geprueft".
--
-- Rollback:
--   ALTER TABLE timesheets DROP CONSTRAINT IF EXISTS timesheets_source_check;
--   ALTER TABLE timesheets DROP COLUMN IF EXISTS source;

BEGIN;

SET client_min_messages TO WARNING;

ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS source TEXT;

-- Backfill vor dem NOT NULL: erst die nachweisbaren, dann der Rest.
UPDATE timesheets ts
   SET source = 'worker_submission'
 WHERE ts.source IS NULL
   AND EXISTS (SELECT 1 FROM worker_time_submissions s WHERE s.timesheet_id = ts.id);

UPDATE timesheets SET source = 'manual' WHERE source IS NULL;

ALTER TABLE timesheets ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE timesheets ALTER COLUMN source SET NOT NULL;

ALTER TABLE timesheets DROP CONSTRAINT IF EXISTS timesheets_source_check;
ALTER TABLE timesheets ADD CONSTRAINT timesheets_source_check
  CHECK (source = ANY (ARRAY['manual', 'worker_submission']::text[]));

COMMENT ON COLUMN timesheets.source IS
  'Herkunft: worker_submission = aus einer freigegebenen Worker-Meldung (Nachweis vorhanden), manual = direkt erfasst (kein Gegennachweis). Neuer Wert = neue Migration, sonst scheitert der INSERT still.';

-- Der Filter "zeig mir alle ohne Nachweis" ist der Grund fuer die Spalte; partiell, weil
-- 'manual' die Minderheit sein sollte, sobald das Worker-Portal genutzt wird.
CREATE INDEX IF NOT EXISTS timesheets_source_manual_idx
  ON timesheets(org_id, week_start DESC)
  WHERE source = 'manual';

COMMIT;
