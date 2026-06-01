-- Migration 082: MFA/TOTP 2-Faktor-Authentifizierung
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_totp_enabled_idx
  ON users(totp_enabled) WHERE totp_enabled = TRUE;

COMMENT ON COLUMN users.totp_secret IS 'Base32-encoded TOTP secret for 2FA';
COMMENT ON COLUMN users.totp_enabled IS 'True when user has verified and enabled TOTP';

COMMIT;
