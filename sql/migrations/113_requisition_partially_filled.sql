-- Migration 113: Requisition PARTIALLY_FILLED Status
-- Adds PARTIALLY_FILLED to the requisitions.status enum.
-- This enables tracking headcount where some (but not all) positions are filled.
--
-- State machine (new):
--   OPEN/IN_REVIEW/SHORTLISTED → PARTIALLY_FILLED
--   PARTIALLY_FILLED → FILLED | OPEN | IN_REVIEW | CLOSED | CANCELLED
--
-- Idempotent: drops and recreates the named constraint.
-- Safe to run on live DB — no data migration needed (no existing rows have this status).

-- 1. Drop existing status constraint
ALTER TABLE requisitions DROP CONSTRAINT IF EXISTS requisitions_status_check;

-- 2. Add updated constraint including PARTIALLY_FILLED
ALTER TABLE requisitions
  ADD CONSTRAINT requisitions_status_check
  CHECK (status = ANY (ARRAY[
    'DRAFT'::text,
    'PENDING_APPROVAL'::text,
    'APPROVED'::text,
    'OPEN'::text,
    'IN_REVIEW'::text,
    'SHORTLISTED'::text,
    'PARTIALLY_FILLED'::text,
    'FILLED'::text,
    'CLOSED'::text,
    'CANCELLED'::text
  ]));

-- 3. Add index for PARTIALLY_FILLED queries (filled-at reporting)
CREATE INDEX IF NOT EXISTS requisitions_partial_fill_idx
  ON requisitions(org_id, status)
  WHERE status = 'PARTIALLY_FILLED';
