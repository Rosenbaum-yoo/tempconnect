-- Migration 048: Persistent Onboarding Progress
-- Adds granular step-level tracking for user onboarding checklists.
-- Extends the existing users.onboarding_completed boolean with per-step persistence.
-- ================================================================

CREATE TABLE IF NOT EXISTS user_onboarding_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id        UUID REFERENCES organizations(id) ON DELETE SET NULL,
  step_key      TEXT NOT NULL,
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  auto_detected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_onboarding_step UNIQUE (user_id, step_key)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_user_completed
  ON user_onboarding_progress(user_id, completed);

CREATE INDEX IF NOT EXISTS idx_onboarding_org
  ON user_onboarding_progress(org_id) WHERE org_id IS NOT NULL;

-- Back-fill: users who already have profile data
INSERT INTO user_onboarding_progress (user_id, step_key, completed, completed_at, auto_detected)
SELECT id, 'profile_complete', TRUE, NOW(), TRUE
FROM users
WHERE company_name IS NOT NULL AND city IS NOT NULL AND phone IS NOT NULL
  AND TRIM(company_name) != '' AND TRIM(city) != '' AND TRIM(phone) != ''
ON CONFLICT (user_id, step_key) DO NOTHING;

-- Back-fill: users who have org memberships
INSERT INTO user_onboarding_progress (user_id, org_id, step_key, completed, completed_at, auto_detected)
SELECT om.user_id, om.org_id, 'org_configured', TRUE, NOW(), TRUE
FROM org_memberships om
JOIN organizations o ON o.id = om.org_id AND o.is_active = TRUE
WHERE om.is_active = TRUE
ON CONFLICT (user_id, step_key) DO NOTHING;

-- Back-fill: users with listings or capacity posts (first_capacity)
INSERT INTO user_onboarding_progress (user_id, step_key, completed, completed_at, auto_detected)
SELECT DISTINCT owner_id, 'first_capacity', TRUE, NOW(), TRUE
FROM listings WHERE is_active = TRUE
ON CONFLICT (user_id, step_key) DO NOTHING;

INSERT INTO user_onboarding_progress (user_id, step_key, completed, completed_at, auto_detected)
SELECT DISTINCT created_by, 'first_capacity', TRUE, NOW(), TRUE
FROM capacity_posts WHERE is_active = TRUE AND created_by IS NOT NULL
ON CONFLICT (user_id, step_key) DO NOTHING;

-- Back-fill: users with requests (first_request)
INSERT INTO user_onboarding_progress (user_id, step_key, completed, completed_at, auto_detected)
SELECT DISTINCT requester_id, 'first_request', TRUE, NOW(), TRUE
FROM requests
ON CONFLICT (user_id, step_key) DO NOTHING;

-- Back-fill: users with completed deals (first_deal)
INSERT INTO user_onboarding_progress (user_id, step_key, completed, completed_at, auto_detected)
SELECT DISTINCT r.requester_id, 'first_deal', TRUE, NOW(), TRUE
FROM requests r
WHERE r.status IN ('accepted', 'completed', 'finalized')
ON CONFLICT (user_id, step_key) DO NOTHING;

COMMENT ON TABLE user_onboarding_progress IS 'Persistent step-level tracking for user onboarding checklists';
COMMENT ON COLUMN user_onboarding_progress.step_key IS 'Step identifier: profile_complete, org_configured, first_capacity, first_request, first_deal, team_invited, platform_explored';
COMMENT ON COLUMN user_onboarding_progress.auto_detected IS 'TRUE if step was auto-completed by detection probe, FALSE if manually completed';
