-- 016: Offers erweitern + Match-Alerts
-- Add-only, kompatibel mit bestehender Architektur.

-- A) offers Tabelle erweitern
ALTER TABLE offers ADD COLUMN IF NOT EXISTS offered_quantity INT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS offered_hourly_rate NUMERIC;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS start_confirmed DATE;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS surcharges JSONB;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS validity_until TIMESTAMPTZ;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS replacement_sla_minutes INT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS cancellation_policy JSONB;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS compliance_check JSONB;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS min_hours_per_shift NUMERIC;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS billing_unit TEXT CHECK (billing_unit IN ('hourly','daily','weekly','monthly'));
ALTER TABLE offers ADD COLUMN IF NOT EXISTS response_time_minutes INT;

-- Status erweitern: withdrawn + countered
ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_status_check;
ALTER TABLE offers ADD CONSTRAINT offers_status_check
  CHECK (status IN ('draft','sent','accepted','rejected','withdrawn','countered'));

-- B) match_alerts – Benachrichtigungen bei neuen Matches
CREATE TABLE IF NOT EXISTS match_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES sla_search_jobs(id) ON DELETE CASCADE,
  match_count INT NOT NULL DEFAULT 0,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS match_alerts_user_unread_idx
  ON match_alerts(user_id, is_read) WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS match_alerts_job_idx
  ON match_alerts(job_id);
