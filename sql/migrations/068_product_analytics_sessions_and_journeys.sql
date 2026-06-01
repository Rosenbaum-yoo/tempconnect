-- 068: Product Analytics sessions + journeys + funnel definitions
-- Extends existing product_analytics_events table (066) without touching audit/platform monitoring structures.

CREATE TABLE IF NOT EXISTS product_analytics_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL UNIQUE,
  anonymous_id TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  membership_id UUID REFERENCES org_memberships(id) ON DELETE SET NULL,
  user_role TEXT,
  org_role TEXT,
  org_type TEXT,
  lifecycle_segment TEXT NOT NULL DEFAULT 'live'
    CHECK (lifecycle_segment IN ('demo', 'pilot', 'live')),
  app_area TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  referrer TEXT,
  entry_path TEXT,
  exit_path TEXT,
  replay_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  consent_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (consent_status IN ('unknown', 'granted', 'denied')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS product_analytics_journeys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL REFERENCES product_analytics_sessions(session_id) ON DELETE CASCADE,
  flow_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  outcome TEXT
    CHECK (outcome IN ('completed', 'abandoned', 'interrupted')),
  dropoff_step TEXT,
  lifecycle_segment TEXT NOT NULL DEFAULT 'live'
    CHECK (lifecycle_segment IN ('demo', 'pilot', 'live')),
  context JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS product_analytics_funnel_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  funnel_key TEXT NOT NULL UNIQUE,
  flow_name TEXT NOT NULL,
  title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_analytics_funnel_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  funnel_id UUID NOT NULL REFERENCES product_analytics_funnel_definitions(id) ON DELETE CASCADE,
  step_order INT NOT NULL CHECK (step_order >= 1),
  step_name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  is_completion BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (funnel_id, step_order),
  UNIQUE (funnel_id, step_name)
);

ALTER TABLE product_analytics_events
  ADD COLUMN IF NOT EXISTS event_category TEXT,
  ADD COLUMN IF NOT EXISTS journey_id TEXT,
  ADD COLUMN IF NOT EXISTS route_name TEXT,
  ADD COLUMN IF NOT EXISTS component_name TEXT,
  ADD COLUMN IF NOT EXISTS step_name TEXT,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS importance TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_analytics_events_journey_fk'
  ) THEN
    ALTER TABLE product_analytics_events
      ADD CONSTRAINT product_analytics_events_journey_fk
      FOREIGN KEY (journey_id) REFERENCES product_analytics_journeys(journey_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pas_lifecycle_last_seen_idx
  ON product_analytics_sessions(lifecycle_segment, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS paj_flow_started_idx
  ON product_analytics_journeys(flow_name, started_at DESC);

CREATE INDEX IF NOT EXISTS pae_journey_time_idx
  ON product_analytics_events(journey_id, occurred_at DESC)
  WHERE journey_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pae_flow_step_time_idx
  ON product_analytics_events(flow_key, step_name, occurred_at DESC)
  WHERE flow_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS pae_event_category_time_idx
  ON product_analytics_events(event_category, occurred_at DESC)
  WHERE event_category IS NOT NULL;

INSERT INTO product_analytics_funnel_definitions (funnel_key, flow_name, title)
VALUES
  ('onboarding', 'onboarding', 'Onboarding'),
  ('enterprise_configuration', 'enterprise_configuration', 'Enterprise Configuration'),
  ('request_creation', 'request_creation', 'Request Creation'),
  ('deal_cooperation', 'deal_cooperation', 'Deal Cooperation'),
  ('contract_interest', 'contract_interest', 'Contract Interest'),
  ('worker_timesheet', 'worker_timesheet', 'Worker Timesheet'),
  ('login_invitation_activation', 'login_invitation_activation', 'Login/Invitation/Activation')
ON CONFLICT (funnel_key) DO NOTHING;

WITH f AS (
  SELECT id, funnel_key
  FROM product_analytics_funnel_definitions
)
INSERT INTO product_analytics_funnel_steps (funnel_id, step_order, step_name, event_name, is_completion)
SELECT f.id, s.step_order, s.step_name, s.event_name, s.is_completion
FROM f
JOIN (
  VALUES
    ('onboarding', 1, 'start', 'onboarding_started', FALSE),
    ('onboarding', 2, 'complete', 'onboarding_completed', TRUE),
    ('enterprise_configuration', 1, 'start', 'enterprise_config_started', FALSE),
    ('enterprise_configuration', 2, 'request_created', 'requisition_created', FALSE),
    ('enterprise_configuration', 3, 'rate_card_created', 'rate_card_created', TRUE),
    ('request_creation', 1, 'start', 'request_created', FALSE),
    ('request_creation', 2, 'submitted', 'request_sent', TRUE),
    ('deal_cooperation', 1, 'start', 'deal_started', FALSE),
    ('deal_cooperation', 2, 'completed', 'deal_completed', TRUE),
    ('contract_interest', 1, 'start', 'contract_started', FALSE),
    ('contract_interest', 2, 'interest_submitted', 'contract_interest_submitted', TRUE),
    ('worker_timesheet', 1, 'invite', 'worker_invite_sent', FALSE),
    ('worker_timesheet', 2, 'register', 'worker_registered', FALSE),
    ('worker_timesheet', 3, 'timesheet_start', 'timesheet_started', FALSE),
    ('worker_timesheet', 4, 'timesheet_submit', 'timesheet_submitted', TRUE),
    ('login_invitation_activation', 1, 'signup_started', 'signup_started', FALSE),
    ('login_invitation_activation', 2, 'signup_completed', 'signup_completed', FALSE),
    ('login_invitation_activation', 3, 'login_success', 'login_success', TRUE)
) AS s(funnel_key, step_order, step_name, event_name, is_completion)
  ON s.funnel_key = f.funnel_key
ON CONFLICT DO NOTHING;
