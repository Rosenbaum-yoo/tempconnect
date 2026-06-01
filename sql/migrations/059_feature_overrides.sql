-- 059: Admin Feature Overrides
-- Allows platform admins to override feature flags per organization or globally.

CREATE TABLE IF NOT EXISTS feature_overrides (
  id            SERIAL PRIMARY KEY,
  org_id        UUID REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key   VARCHAR(100) NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  reason        TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  UNIQUE(org_id, feature_key)
);

-- Global overrides: org_id IS NULL means applies to all orgs
CREATE INDEX IF NOT EXISTS idx_feature_overrides_org ON feature_overrides(org_id);
CREATE INDEX IF NOT EXISTS idx_feature_overrides_key ON feature_overrides(feature_key);

COMMENT ON TABLE feature_overrides IS 'Admin-gesteuertes Feature-Flag Override pro Org oder global';
