-- =============================================================================
-- Migration 148: Stundenzettel-Einreichfrist (P2.1)
-- Fügt worker_time_submissions eine weiche Einreichfrist (submission_deadline)
-- + ein Late-Flag (submitted_late) hinzu. Weiche Frist: Einreichen bleibt jederzeit
-- möglich (geleistete Stunden dürfen nie blockiert werden), verspätete Abgaben
-- werden sichtbar markiert. Add-only, NULLABLE/DEFAULT, voll rückwärtskompatibel.
-- =============================================================================

BEGIN;

ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS submission_deadline DATE;

ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS submitted_late BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: Frist = Wochenende + 3 Tage (Standard TIMESHEET_DEADLINE_DAYS).
UPDATE worker_time_submissions
   SET submission_deadline = (week_end + INTERVAL '3 days')::date
 WHERE submission_deadline IS NULL
   AND week_end IS NOT NULL;

-- Backfill: bereits eingereichte Zettel als verspätet markieren, wenn nach Frist abgegeben.
UPDATE worker_time_submissions
   SET submitted_late = TRUE
 WHERE submitted_at IS NOT NULL
   AND submission_deadline IS NOT NULL
   AND submitted_at::date > submission_deadline
   AND submitted_late = FALSE;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '148_timesheet_submission_deadline.sql: Migration erfolgreich angewendet.';
END $$;
