-- Two-Sided Marketplace: capacity_posts (Angebot), demand_requests (Nachfrage), matches, offers, demand_sla_events.
-- Add-only, kompatibel mit bestehender Architektur.

-- A) capacity_posts – Angebote der Zeitarbeitsfirmen
CREATE TABLE IF NOT EXISTS capacity_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_company_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  role TEXT NOT NULL,
  skill_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  headcount INT NOT NULL DEFAULT 1,
  availability_from DATE NOT NULL,
  availability_to DATE,
  location_city TEXT NOT NULL,
  location_postal TEXT,
  location_lat NUMERIC,
  location_lng NUMERIC,
  radius_km INT NOT NULL DEFAULT 25,
  price_type TEXT CHECK (price_type IN ('hourly','daily','fixed')),
  price_min NUMERIC,
  price_max NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_search_agent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS capacity_posts_supplier_idx ON capacity_posts(supplier_company_id);
CREATE INDEX IF NOT EXISTS capacity_posts_city_idx ON capacity_posts(location_city);
CREATE INDEX IF NOT EXISTS capacity_posts_active_idx ON capacity_posts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS capacity_posts_search_agent_idx ON capacity_posts(is_search_agent) WHERE is_search_agent = TRUE;
CREATE INDEX IF NOT EXISTS capacity_posts_skill_tags_gin ON capacity_posts USING GIN (skill_tags);
CREATE INDEX IF NOT EXISTS capacity_posts_availability_idx ON capacity_posts(availability_from, availability_to);

-- B) demand_requests – Bedarfe der Unternehmen
CREATE TABLE IF NOT EXISTS demand_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_company_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  role TEXT NOT NULL,
  skill_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  headcount INT NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE,
  location_city TEXT NOT NULL,
  location_postal TEXT,
  location_lat NUMERIC,
  location_lng NUMERIC,
  radius_km INT NOT NULL DEFAULT 25,
  shifts JSONB,
  requirements JSONB,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal','plus','notdienst')),
  budget_min NUMERIC,
  budget_max NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','closed')),
  sla_started_at TIMESTAMPTZ,
  sla_minutes INT,
  sla_due_at TIMESTAMPTZ,
  sla_status TEXT CHECK (sla_status IN ('RUNNING','MET','BREACHED')),
  sla_met_at TIMESTAMPTZ,
  sla_breached_at TIMESTAMPTZ,
  first_matching_attempt_at TIMESTAMPTZ,
  first_notification_sent_at TIMESTAMPTZ,
  escalation_level INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS demand_requests_requester_idx ON demand_requests(requester_company_id);
CREATE INDEX IF NOT EXISTS demand_requests_city_idx ON demand_requests(location_city);
CREATE INDEX IF NOT EXISTS demand_requests_status_idx ON demand_requests(status);
CREATE INDEX IF NOT EXISTS demand_requests_sla_scan_idx ON demand_requests(sla_due_at)
  WHERE sla_status = 'RUNNING' AND status = 'open';
CREATE INDEX IF NOT EXISTS demand_requests_skill_tags_gin ON demand_requests USING GIN (skill_tags);

-- C) matches – Verbindung Nachfrage <-> Angebot
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  demand_request_id UUID NOT NULL REFERENCES demand_requests(id) ON DELETE CASCADE,
  capacity_post_id UUID NOT NULL REFERENCES capacity_posts(id) ON DELETE CASCADE,
  match_score NUMERIC,
  reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested','notified','responded','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (demand_request_id, capacity_post_id)
);

CREATE INDEX IF NOT EXISTS matches_demand_idx ON matches(demand_request_id);
CREATE INDEX IF NOT EXISTS matches_capacity_idx ON matches(capacity_post_id);

-- D) offers – Angebote zu einer Nachfrage
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  demand_request_id UUID NOT NULL REFERENCES demand_requests(id) ON DELETE CASCADE,
  supplier_company_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price_type TEXT CHECK (price_type IN ('hourly','daily','fixed')),
  price_value NUMERIC,
  price_min NUMERIC,
  price_max NUMERIC,
  notes TEXT,
  attachments JSONB,
  terms JSONB,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS offers_demand_idx ON offers(demand_request_id);
CREATE INDEX IF NOT EXISTS offers_supplier_idx ON offers(supplier_company_id);

-- E) proofs – Trust-Layer (Nachweise pro Firma)
CREATE TABLE IF NOT EXISTS proofs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  file_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS proofs_company_idx ON proofs(company_id);
CREATE INDEX IF NOT EXISTS proofs_verified_idx ON proofs(company_id) WHERE status = 'verified';

-- F) demand_sla_events – Audit-Trail für SLA (Demand)
CREATE TABLE IF NOT EXISTS demand_sla_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  demand_request_id UUID NOT NULL REFERENCES demand_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('SLA_STARTED','MATCHING_ATTEMPT','NOTIFICATION_SENT','ESCALATION_STAGE','SLA_MET','SLA_BREACHED')),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS demand_sla_events_demand_idx ON demand_sla_events(demand_request_id);
CREATE INDEX IF NOT EXISTS demand_sla_events_created_idx ON demand_sla_events(created_at);
