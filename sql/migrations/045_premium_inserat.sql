-- Migration 045: Premium Inserat System — Listing Analytics
-- Tracks view/click/match/deal counts per capacity listing for the premium analytics dashboard.
-- Event types added to eventTrackingService: listing_viewed, listing_clicked, listing_matched

BEGIN;

-- ── listing_analytics: per-listing performance counters ──────────
CREATE TABLE IF NOT EXISTS listing_analytics (
    capacity_post_id UUID PRIMARY KEY REFERENCES capacity_posts(id) ON DELETE CASCADE,
    view_count       INT          NOT NULL DEFAULT 0,
    click_count      INT          NOT NULL DEFAULT 0,
    match_count      INT          NOT NULL DEFAULT 0,
    deal_count       INT          NOT NULL DEFAULT 0,
    last_viewed_at   TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE listing_analytics IS 'Per-listing performance counters for the Premium Inserat analytics dashboard.';

-- Fast lookup for supplier dashboard aggregation
CREATE INDEX IF NOT EXISTS idx_listing_analytics_updated
    ON listing_analytics (updated_at DESC);

COMMIT;
