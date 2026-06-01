-- =============================================================================
-- Migration 086: customer_stage erweitert um contract_requested
-- Ziel:
--   - direkte Vertrags-/INDIVIDUELL-Registrierung konsistent modellieren
--   - Drift zwischen Auth-Flow und DB-Check-Constraints beheben
-- =============================================================================

BEGIN;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_customer_stage_check;

ALTER TABLE users
  ADD CONSTRAINT users_customer_stage_check
  CHECK (customer_stage IN ('demo', 'contract_requested', 'pilot', 'live'));

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_customer_stage_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_customer_stage_check
  CHECK (customer_stage IN ('demo', 'contract_requested', 'pilot', 'live'));

COMMENT ON COLUMN users.customer_stage IS 'Explicit lifecycle stage: demo, contract_requested, pilot, live';
COMMENT ON COLUMN organizations.customer_stage IS 'Explicit lifecycle stage: demo, contract_requested, pilot, live';

COMMIT;
