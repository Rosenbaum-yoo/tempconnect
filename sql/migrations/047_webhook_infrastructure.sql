-- Migration 047: Webhook Infrastructure
-- Adds: webhook_deliveries table for delivery tracking/retry,
-- signing_secret column on org_integrations for HMAC-SHA256 payload signing.
-- Backward-compatible, add-only.

-- =============================================
-- A) WEBHOOK DELIVERY LOG
-- =============================================
-- Tracks every outbound webhook delivery attempt for auditability and retry.

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES org_integrations(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','success','failed','retrying')),
  http_status INT,
  error_message TEXT,
  attempt INT NOT NULL DEFAULT 1,
  max_attempts INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS webhook_del_integration_idx
  ON webhook_deliveries(integration_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_del_retry_idx
  ON webhook_deliveries(status, next_retry_at)
  WHERE status IN ('pending','retrying');

-- =============================================
-- B) SIGNING SECRET ON ORG_INTEGRATIONS
-- =============================================
-- HMAC-SHA256 secret per integration for payload verification by consumers.

ALTER TABLE org_integrations
  ADD COLUMN IF NOT EXISTS signing_secret TEXT;
