-- Migration 147: Worker-Offer Hard-Reserve (Welle 4b)
-- =============================================================================
-- Verhindert Doppelbuchung eines Arbeiters über seine vielen Angebote. Ist ein
-- Arbeiter im Einsatz (aktiver worker_assignment_link), werden seine aktiven
-- worker-spezifischen Angebote (offer_kind single_skill/bundle) automatisch
-- pausiert und mit worker_reserved=TRUE markiert. Wird er frei, reaktiviert der
-- Sweep (workerOfferReservationService) genau diese wieder.
--
-- worker_reserved unterscheidet Auto-Reservierung von manueller Pause: nur
-- worker_reserved=TRUE-Angebote werden automatisch reaktiviert.
-- Add-only, rückwärtskompatibel.
--
-- Rollback:
--   DROP INDEX IF EXISTS capacity_posts_worker_reserved_idx;
--   ALTER TABLE capacity_posts
--     DROP COLUMN IF EXISTS worker_reserved, DROP COLUMN IF EXISTS worker_reserved_at;
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

ALTER TABLE capacity_posts
  ADD COLUMN IF NOT EXISTS worker_reserved    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS worker_reserved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS capacity_posts_worker_reserved_idx
  ON capacity_posts(worker_reserved) WHERE worker_reserved = TRUE;

COMMIT;
