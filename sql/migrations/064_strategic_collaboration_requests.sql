-- 064_strategic_collaboration_requests.sql
-- Qualified B2B cooperation interest capture (no direct contract closure).

CREATE TABLE IF NOT EXISTS strategic_collaboration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  target_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  target_org_id UUID NULL REFERENCES organizations(id) ON DELETE SET NULL,
  source_context TEXT NOT NULL CHECK (source_context IN ('public_profile', 'enterprise_config')),
  requester_company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NULL,
  region_scope TEXT NULL,
  site_count INTEGER NULL CHECK (site_count IS NULL OR site_count > 0),
  expected_volume TEXT NULL,
  needs_enterprise_multi_site BOOLEAN NOT NULL DEFAULT FALSE,
  interest_enterprise_support BOOLEAN NOT NULL DEFAULT TRUE,
  interest_framework_conditions BOOLEAN NOT NULL DEFAULT TRUE,
  interest_strategic_cooperation BOOLEAN NOT NULL DEFAULT TRUE,
  message TEXT NULL,
  requested_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'neu' CHECK (
    status IN ('neu', 'qualifiziert', 'in_pruefung', 'kontaktiert', 'in_abstimmung', 'abgeschlossen', 'verworfen')
  ),
  status_updated_at TIMESTAMPTZ NULL,
  status_updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scr_requester_org_created
  ON strategic_collaboration_requests (requester_org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scr_target_org_created
  ON strategic_collaboration_requests (target_org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scr_status_created
  ON strategic_collaboration_requests (status, created_at DESC);

