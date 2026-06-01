-- 066: Product Analytics foundation (demo/pilot/live segmentation + behavior analytics)
-- Add-only migration. Keeps existing platform_events/audit/metrics untouched.

CREATE TABLE IF NOT EXISTS product_analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  session_id TEXT NOT NULL,
  anonymous_id TEXT,

  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  user_role TEXT,
  org_role TEXT,
  user_plan TEXT,
  customer_segment TEXT NOT NULL DEFAULT 'live'
    CHECK (customer_segment IN ('demo','pilot','live')),

  page_path TEXT,
  flow_key TEXT,
  source TEXT NOT NULL DEFAULT 'web'
    CHECK (source IN ('web','api','worker')),

  feature_context TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS pae_event_name_time_idx
  ON product_analytics_events(event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS pae_page_time_idx
  ON product_analytics_events(page_path, occurred_at DESC)
  WHERE page_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS pae_session_time_idx
  ON product_analytics_events(session_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS pae_segment_time_idx
  ON product_analytics_events(customer_segment, occurred_at DESC);

CREATE INDEX IF NOT EXISTS pae_org_time_idx
  ON product_analytics_events(org_id, occurred_at DESC)
  WHERE org_id IS NOT NULL;

COMMENT ON TABLE product_analytics_events IS 'Product analytics events for behavior/funnel/session diagnostics';
