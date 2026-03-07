-- Enterprise Hardening: idempotency, audit log, indexes, no schema breaks.

-- 1) Idempotency keys: store and replay responses for write operations
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  response_status INT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx ON idempotency_keys(created_at);

-- 2) Append-only audit log (no UPDATE/DELETE on this table)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  request_id UUID,
  capacity_id UUID,
  reservation_id UUID
);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS audit_log_request_id_idx ON audit_log(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_capacity_id_idx ON audit_log(capacity_id) WHERE capacity_id IS NOT NULL;

COMMENT ON TABLE audit_log IS 'Append-only. Do not UPDATE or DELETE.';

-- 3) Search scalability: composite index for reservation expiry + availability queries
CREATE INDEX IF NOT EXISTS capacity_reservations_capacity_status_expires_idx
  ON capacity_reservations(capacity_id, status, expires_at)
  WHERE status = 'active';
