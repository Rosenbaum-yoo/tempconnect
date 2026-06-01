-- 065: Internal Control Center foundation (Phase 1)
-- Purpose: explicit internal roles for internal-only control center access.
-- Add-only, backward compatible.

CREATE TABLE IF NOT EXISTS internal_user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  internal_role_key TEXT NOT NULL CHECK (
    internal_role_key IN (
      'platform_owner',
      'developer_admin',
      'support_agent',
      'support_lead',
      'ops_manager',
      'audit_readonly'
    )
  ),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, internal_role_key)
);

CREATE INDEX IF NOT EXISTS internal_user_roles_user_idx
  ON internal_user_roles(user_id, is_active);

CREATE INDEX IF NOT EXISTS internal_user_roles_role_idx
  ON internal_user_roles(internal_role_key, is_active);

COMMENT ON TABLE internal_user_roles IS 'Internal-only role assignments for Internal Control Center access';
