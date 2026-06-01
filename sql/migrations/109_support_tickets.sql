-- =============================================================================
-- Migration 109: Support Tickets (OCC Support Oversight)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS support_tickets (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                TEXT UNIQUE,
  title                    TEXT NOT NULL,
  org_id                   UUID REFERENCES organizations(id) ON DELETE SET NULL,
  org_name                 TEXT,
  contact_email            TEXT,
  severity                 TEXT NOT NULL DEFAULT 'medium'
                           CHECK (severity IN ('critical','high','medium','low')),
  status                   TEXT NOT NULL DEFAULT 'open',
  escalated                BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_to              UUID REFERENCES users(id) ON DELETE SET NULL,
  sla_state                TEXT DEFAULT 'ok',
  sla_deadline             TIMESTAMPTZ,
  owner_decision_required  BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_reason        TEXT,
  affected_users           INTEGER,
  first_response_at        TIMESTAMPTZ,
  closed_at                TIMESTAMPTZ,
  reopened_count           INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at              TIMESTAMPTZ
);

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_support_tickets_escalated
  ON support_tickets(escalated, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_deadline
  ON support_tickets(sla_deadline)
  WHERE sla_deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets(status, updated_at DESC);

COMMIT;
