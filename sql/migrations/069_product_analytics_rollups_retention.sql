-- 069: Product analytics daily rollups + retention support

CREATE TABLE IF NOT EXISTS product_analytics_daily_rollups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rollup_date DATE NOT NULL,
  lifecycle_segment TEXT NOT NULL CHECK (lifecycle_segment IN ('demo', 'pilot', 'live')),
  event_name TEXT NOT NULL,
  flow_key TEXT,
  user_role TEXT,
  sessions_count INT NOT NULL DEFAULT 0,
  users_count INT NOT NULL DEFAULT 0,
  events_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rollup_date, lifecycle_segment, event_name, flow_key, user_role)
);

CREATE INDEX IF NOT EXISTS padr_date_segment_idx
  ON product_analytics_daily_rollups(rollup_date DESC, lifecycle_segment);

CREATE INDEX IF NOT EXISTS padr_flow_idx
  ON product_analytics_daily_rollups(flow_key, rollup_date DESC)
  WHERE flow_key IS NOT NULL;
