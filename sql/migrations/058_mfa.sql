-- 058_mfa.sql: Multi-Factor Authentication (TOTP)
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[];

-- Org-Level MFA enforcement
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enforce_mfa BOOLEAN DEFAULT FALSE;
