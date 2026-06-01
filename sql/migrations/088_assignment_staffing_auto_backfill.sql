-- =============================================================================
-- Migration 088: Assignment staffing auto-backfill controls
-- Adds opt-in automation fields so bulk staffing campaigns can trigger safe
-- follow-up outreach through the existing maintenance/cron infrastructure.
-- =============================================================================

BEGIN;

ALTER TABLE assignment_staffing_campaigns
  ADD COLUMN IF NOT EXISTS auto_backfill_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_auto_backfill_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS staffing_campaigns_auto_backfill_idx
  ON assignment_staffing_campaigns(auto_backfill_enabled, assignment_id, created_at DESC)
  WHERE auto_backfill_enabled = TRUE;

CREATE INDEX IF NOT EXISTS staffing_campaigns_source_idx
  ON assignment_staffing_campaigns(source_campaign_id)
  WHERE source_campaign_id IS NOT NULL;

COMMIT;
