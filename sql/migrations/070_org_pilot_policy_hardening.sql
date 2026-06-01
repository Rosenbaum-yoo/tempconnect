-- Migration 070: Org-level pilot lifecycle hardening (one-time pilot, exceptions, parent-child scope)

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS parent_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pilot_status TEXT NOT NULL DEFAULT 'eligible'
    CHECK (pilot_status IN ('eligible', 'active', 'ended', 'converted', 'blocked', 'exception')),
  ADD COLUMN IF NOT EXISTS has_used_pilot BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pilot_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pilot_ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pilot_exception_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pilot_exception_reason TEXT,
  ADD COLUMN IF NOT EXISTS pilot_exception_granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pilot_exception_granted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS organizations_parent_org_id_idx
  ON organizations(parent_org_id)
  WHERE parent_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organizations_pilot_status_idx
  ON organizations(pilot_status);

CREATE INDEX IF NOT EXISTS organizations_has_used_pilot_idx
  ON organizations(has_used_pilot)
  WHERE has_used_pilot = TRUE;

COMMENT ON COLUMN organizations.parent_org_id IS 'Optional parent organization for enterprise group scoping';
COMMENT ON COLUMN organizations.pilot_status IS 'Pilot lifecycle status: eligible|active|ended|converted|blocked|exception';
COMMENT ON COLUMN organizations.has_used_pilot IS 'True after first pilot activation, never reset automatically';
COMMENT ON COLUMN organizations.pilot_started_at IS 'Timestamp when pilot was first activated';
COMMENT ON COLUMN organizations.pilot_ended_at IS 'Timestamp when pilot ended without conversion';
COMMENT ON COLUMN organizations.converted_at IS 'Timestamp when pilot converted to paid/live';
COMMENT ON COLUMN organizations.pilot_exception_allowed IS 'Internal admin override to allow another pilot run';
