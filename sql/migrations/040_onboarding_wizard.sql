-- Migration 040: Onboarding Wizard State
-- Adds onboarding_completed flag to users table.
-- Back-fills TRUE for users who already have platform activity or are demo accounts.

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill: mark existing active users as onboarded
UPDATE users SET onboarding_completed = TRUE
WHERE id IN (
  SELECT DISTINCT requester_id FROM requests
  UNION
  SELECT DISTINCT owner_id FROM listings WHERE is_active = TRUE
)
OR is_demo = TRUE;
