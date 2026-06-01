-- =============================================================================
-- Migration 036: Unique Deal-Assignment Constraint
-- Verhindert, dass aus einem Deal mehrere aktive Assignments entstehen.
-- =============================================================================

BEGIN;

-- Nur ein aktives Assignment pro deal_request_id (Race-Condition-Schutz)
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_deal_request
  ON assignments(deal_request_id)
  WHERE deal_request_id IS NOT NULL
    AND status NOT IN ('cancelled');

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '036_unique_deal_assignment.sql: Migration erfolgreich angewendet.';
END $$;
