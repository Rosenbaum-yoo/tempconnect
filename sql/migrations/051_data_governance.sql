-- 051: DSGVO Data Governance — Anfragen-Tracking
-- Nachvollziehbare DSGVO-Anfragen (Export, Löschung, Anonymisierung, Auskunft)

CREATE TABLE IF NOT EXISTS data_governance_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_type    TEXT NOT NULL CHECK (request_type IN ('export','deletion','anonymization','retention_review','inquiry')),
  subject_type    TEXT NOT NULL CHECK (subject_type IN ('user','worker','organization')),
  subject_id      UUID,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','rejected','cancelled')),
  requested_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at    TIMESTAMPTZ,
  result_summary  JSONB,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dgr_org_status ON data_governance_requests (org_id, status);
CREATE INDEX IF NOT EXISTS idx_dgr_subject    ON data_governance_requests (subject_id);
CREATE INDEX IF NOT EXISTS idx_dgr_created    ON data_governance_requests (created_at DESC);
