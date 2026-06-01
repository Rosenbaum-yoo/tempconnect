-- Migration 049: Organization API Keys
-- Adds org-scoped API key management for external integrations.
-- Keys are stored as SHA-256 hashes (never in plaintext).
-- Prefix (first 8 chars) stored for identification in logs/UI.
-- ================================================================

CREATE TABLE IF NOT EXISTS org_api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT '',
  key_prefix    TEXT NOT NULL,
  key_hash      TEXT NOT NULL,
  scopes        TEXT[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schneller Lookup: aktive Keys einer Org
CREATE INDEX IF NOT EXISTS idx_api_keys_org_active
  ON org_api_keys(org_id, is_active) WHERE is_active = TRUE;

-- Zukuenftige Auth: Key-Hash Lookup (fuer API-Key-basierte Authentifizierung)
CREATE INDEX IF NOT EXISTS idx_api_keys_hash
  ON org_api_keys(key_hash) WHERE is_active = TRUE;

COMMENT ON TABLE org_api_keys IS 'Org-scoped API keys for external integrations. Keys stored as SHA-256 hash.';
COMMENT ON COLUMN org_api_keys.key_prefix IS 'First 8 characters of the key for identification (e.g. tc_live_a1b2c3d4)';
COMMENT ON COLUMN org_api_keys.key_hash IS 'SHA-256 hash of the full API key. Plaintext key is only shown once at creation.';
COMMENT ON COLUMN org_api_keys.scopes IS 'Permitted API scopes (e.g. read:timesheets, write:requisitions). Empty = full access.';
