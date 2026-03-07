-- Enterprise Sales Story: SLA timer, supplier scorecard, compliance traffic light.
-- Add-only: no renames/removals. Compatible with Model B.

-- 1) SLA on requests
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS sla_minutes INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS sla_status TEXT NOT NULL DEFAULT 'OK' CHECK (sla_status IN ('OK','BREACHED','RESOLVED')),
  ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_level INT;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS sla_respond_by TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '60 minutes');
UPDATE requests SET sla_respond_by = created_at + (COALESCE(sla_minutes, 60) || ' minutes')::INTERVAL;
ALTER TABLE requests ALTER COLUMN sla_respond_by SET DEFAULT (NOW() + INTERVAL '60 minutes');
ALTER TABLE requests ALTER COLUMN sla_respond_by SET NOT NULL;

CREATE INDEX IF NOT EXISTS requests_sla_scan_idx ON requests(receiver_id, status, sla_respond_by) WHERE sla_status = 'OK' AND status = 'SENT';
CREATE INDEX IF NOT EXISTS requests_receiver_status_created_idx ON requests(receiver_id, status, created_at DESC);

-- 2) SLA events (append-only)
CREATE TABLE IF NOT EXISTS sla_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('deadline_set','breached','resolved','escalated')),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sla_events_request_id_idx ON sla_events(request_id);
CREATE INDEX IF NOT EXISTS sla_events_created_at_idx ON sla_events(created_at);

-- 3) Supplier metrics (materialized summary)
CREATE TABLE IF NOT EXISTS supplier_metrics (
  agency_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_days INT NOT NULL,
  requests_received INT NOT NULL DEFAULT 0,
  offers_submitted INT NOT NULL DEFAULT 0,
  requests_accepted INT NOT NULL DEFAULT 0,
  requests_finalized INT NOT NULL DEFAULT 0,
  sla_breaches INT NOT NULL DEFAULT 0,
  avg_rating NUMERIC(5,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agency_id, window_days)
);
CREATE INDEX IF NOT EXISTS supplier_metrics_agency_window_idx ON supplier_metrics(agency_id, window_days);

-- 4) Compliance policies (per company or global)
CREATE TABLE IF NOT EXISTS compliance_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_pattern TEXT,
  required_fields JSONB,
  required_certifications JSONB,
  strict_mode BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_policies_company_id_idx ON compliance_policies(company_id);

-- 5) Request compliance (computed snapshot)
CREATE TABLE IF NOT EXISTS request_compliance (
  request_id UUID PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('GREEN','YELLOW','RED')),
  reasons JSONB NOT NULL DEFAULT '[]',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
