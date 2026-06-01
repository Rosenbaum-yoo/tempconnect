-- Migration 044: Reputation & Ranking System
-- Extends supplier_reputation with composite scores for marketplace feed ranking.
-- Add-only. Fully backward-compatible.

-- =============================================
-- A) REPUTATION SCORE (Composite 0-100)
-- =============================================
-- Formula: avg_stars_pct * 0.5 + deal_success_rate * 0.3 + response_time_score * 0.2

ALTER TABLE supplier_reputation
  ADD COLUMN IF NOT EXISTS reputation_score NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN supplier_reputation.reputation_score
  IS 'Composite reputation 0-100. stars*0.5 + deal_success*0.3 + response_speed*0.2';

-- =============================================
-- B) DEAL SUCCESS RATE
-- =============================================
-- completed / (completed + cancelled + declined) * 100. NULL when < 3 deals.

ALTER TABLE supplier_reputation
  ADD COLUMN IF NOT EXISTS deal_success_rate NUMERIC(5,2) DEFAULT NULL;

ALTER TABLE supplier_reputation
  ADD COLUMN IF NOT EXISTS total_deals INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN supplier_reputation.deal_success_rate
  IS 'Percentage of successfully completed deals. NULL when total_deals < 3.';

COMMENT ON COLUMN supplier_reputation.total_deals
  IS 'Total deals started (denominator for deal_success_rate).';

-- =============================================
-- C) ACTIVITY SCORE
-- =============================================
-- 0-100 based on active listings (max 50) + response rate last 90d (max 50).

ALTER TABLE supplier_reputation
  ADD COLUMN IF NOT EXISTS activity_score NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN supplier_reputation.activity_score
  IS 'Activity index 0-100: active listings (50) + response rate 90d (50).';

-- =============================================
-- D) PRE-AGGREGATED RANKING SCORE
-- =============================================
-- Used by browseFeed() for sort order. Recomputed on reputation refresh.

ALTER TABLE supplier_reputation
  ADD COLUMN IF NOT EXISTS ranking_score NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN supplier_reputation.ranking_score
  IS 'Pre-aggregated feed ranking score 0-100. reputation*0.30 + response*0.15 + deal_success*0.15 + activity*0.10 + base boost.';

CREATE INDEX IF NOT EXISTS supplier_reputation_ranking_idx
  ON supplier_reputation(ranking_score DESC NULLS LAST)
  WHERE ranking_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS supplier_reputation_score_idx
  ON supplier_reputation(reputation_score DESC NULLS LAST)
  WHERE reputation_score IS NOT NULL;
