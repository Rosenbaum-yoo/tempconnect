-- Idempotency enterprise-correct: scope by (user_id, key), expires_at, request_hash, cleanup-friendly.
-- Run after 010 (idempotency_keys exists).

-- 1) Scope column: one row per (scope, key). scope = user_id::text or '' for anonymous.
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT '';
UPDATE idempotency_keys SET scope = COALESCE(user_id::text, '') WHERE scope = '';
ALTER TABLE idempotency_keys ALTER COLUMN scope SET DEFAULT '';

-- 2) Request hash (optional, for auditing/safety: same key + same body = same intent)
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS request_hash TEXT;

-- 3) Expiration: keys expire after 24h so storage does not grow unbounded.
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours');
-- Backfill existing rows: expire 24h after their creation (so cleanup can remove old ones)
UPDATE idempotency_keys SET expires_at = created_at + INTERVAL '24 hours';

-- 4) Drop old primary key (key alone)
ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_pkey;

-- 5) Unique on (scope, key) so same key for different users does not collide
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_scope_key_unique UNIQUE (scope, key);

-- 6) Index for cleanup job: delete where expires_at < NOW()
CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx ON idempotency_keys(expires_at);

COMMENT ON COLUMN idempotency_keys.scope IS 'user_id::text or empty string for unauthenticated; idempotency is scoped per scope+key';
COMMENT ON COLUMN idempotency_keys.request_hash IS 'Optional hash of request body for audit; replay is by scope+key only';
COMMENT ON COLUMN idempotency_keys.expires_at IS 'After this time the key is treated as new; cleanup job deletes expired rows';
