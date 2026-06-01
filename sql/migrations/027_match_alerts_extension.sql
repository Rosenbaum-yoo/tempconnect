-- 027: Extend match_alerts for general match alert support (beyond SLA search jobs).
-- Adds source_type, source_id, match_score, match_reasons, severity.
-- Makes job_id nullable so alerts can exist without an SLA search job context.

-- A) Make job_id nullable (was NOT NULL REFERENCES sla_search_jobs)
ALTER TABLE match_alerts ALTER COLUMN job_id DROP NOT NULL;

-- B) Add new columns
ALTER TABLE match_alerts ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE match_alerts ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE match_alerts ADD COLUMN IF NOT EXISTS match_score INT;
ALTER TABLE match_alerts ADD COLUMN IF NOT EXISTS match_reasons JSONB;
ALTER TABLE match_alerts ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';

-- C) Indexes for deduplication and filtering
CREATE INDEX IF NOT EXISTS match_alerts_source_dedup_idx
  ON match_alerts(user_id, source_type, source_id, created_at);

CREATE INDEX IF NOT EXISTS match_alerts_severity_idx
  ON match_alerts(severity) WHERE severity = 'urgent';
