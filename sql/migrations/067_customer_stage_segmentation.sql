-- 067: Explicit customer stage segmentation (demo/pilot/live)
-- Enables durable segmentation without name-based heuristics.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS customer_stage TEXT
  CHECK (customer_stage IN ('demo','pilot','live'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS customer_stage TEXT
  CHECK (customer_stage IN ('demo','pilot','live'));

CREATE INDEX IF NOT EXISTS users_customer_stage_idx
  ON users(customer_stage)
  WHERE customer_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS organizations_customer_stage_idx
  ON organizations(customer_stage)
  WHERE customer_stage IS NOT NULL;

COMMENT ON COLUMN users.customer_stage IS 'Explicit lifecycle stage: demo, pilot, live';
COMMENT ON COLUMN organizations.customer_stage IS 'Explicit lifecycle stage: demo, pilot, live';
