-- SLA-Suchaufträge (Search Jobs) für den SLA-/Marketplace-Bereich.
-- Add-only, kompatibel mit bestehender Architektur.

-- A) sla_search_jobs – persistente Suchaufträge
CREATE TABLE IF NOT EXISTS sla_search_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_company_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('COMPANY','AGENCY')),
  target_type TEXT NOT NULL CHECK (target_type IN ('CAPACITY','DEMAND')),
  title TEXT NOT NULL,
  role TEXT,
  skill_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  headcount INT NOT NULL DEFAULT 1,
  location_city TEXT,
  location_postal TEXT,
  location_lat NUMERIC,
  location_lng NUMERIC,
  radius_km INT NOT NULL DEFAULT 25,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal','plus','notdienst')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paused','closed')),
  -- SLA-Prozessnachweis (Best-Effort, kein Erfolgsversprechen)
  sla_started_at TIMESTAMPTZ,
  sla_minutes INT,
  sla_due_at TIMESTAMPTZ,
  sla_status TEXT CHECK (sla_status IN ('RUNNING','MET','BREACHED')),
  sla_met_at TIMESTAMPTZ,
  sla_breached_at TIMESTAMPTZ,
  first_matching_attempt_at TIMESTAMPTZ,
  first_notification_sent_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sla_search_jobs_owner_status_idx
  ON sla_search_jobs(owner_company_id, status);

CREATE INDEX IF NOT EXISTS sla_search_jobs_target_status_idx
  ON sla_search_jobs(target_type, status);

CREATE INDEX IF NOT EXISTS sla_search_jobs_city_idx
  ON sla_search_jobs(location_city);

CREATE INDEX IF NOT EXISTS sla_search_jobs_sla_scan_idx
  ON sla_search_jobs(sla_due_at)
  WHERE sla_status = 'RUNNING' AND status = 'open';


-- B) sla_search_events – Audit-Trail für SLA-Suchaufträge
CREATE TABLE IF NOT EXISTS sla_search_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_job_id UUID NOT NULL REFERENCES sla_search_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'SLA_STARTED',
      'MATCHING_ATTEMPT',
      'NOTIFICATION_SENT',
      'ESCALATION_STAGE',
      'SLA_MET',
      'SLA_BREACHED',
      'JOB_CLOSED'
    )),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sla_search_events_job_idx
  ON sla_search_events(search_job_id);

CREATE INDEX IF NOT EXISTS sla_search_events_created_idx
  ON sla_search_events(created_at);


-- C) sla_search_matches – Treffer pro Suchauftrag
CREATE TABLE IF NOT EXISTS sla_search_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_job_id UUID NOT NULL REFERENCES sla_search_jobs(id) ON DELETE CASCADE,
  capacity_post_id UUID REFERENCES capacity_posts(id) ON DELETE CASCADE,
  demand_request_id UUID REFERENCES demand_requests(id) ON DELETE CASCADE,
  match_score NUMERIC,
  reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested','notified','responded','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (capacity_post_id IS NOT NULL AND demand_request_id IS NULL)
    OR (capacity_post_id IS NULL AND demand_request_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS sla_search_matches_job_idx
  ON sla_search_matches(search_job_id);

CREATE INDEX IF NOT EXISTS sla_search_matches_capacity_idx
  ON sla_search_matches(capacity_post_id)
  WHERE capacity_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sla_search_matches_demand_idx
  ON sla_search_matches(demand_request_id)
  WHERE demand_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sla_search_matches_job_capacity_uniq
  ON sla_search_matches(search_job_id, capacity_post_id)
  WHERE capacity_post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sla_search_matches_job_demand_uniq
  ON sla_search_matches(search_job_id, demand_request_id)
  WHERE demand_request_id IS NOT NULL;

