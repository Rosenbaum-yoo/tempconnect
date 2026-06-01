-- Migration 043: Marketplace Mechanics Optimization
-- Adds: response_time_score to supplier_reputation,
--        extended notification types for deal flow + demand matching.
-- Add-only. Fully backward-compatible.

-- =============================================
-- A) SUPPLIER REPUTATION: Response Time Score
-- =============================================
-- Computed from average response time on requests.
-- Scale: 0-100 (higher = faster). NULL = not yet computed.

ALTER TABLE supplier_reputation
  ADD COLUMN IF NOT EXISTS response_time_score NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN supplier_reputation.response_time_score
  IS 'Speed score 0-100 derived from avg response time. <1h=100, <4h=75, <12h=50, <24h=25, >24h=10.';

CREATE INDEX IF NOT EXISTS supplier_reputation_speed_idx
  ON supplier_reputation(response_time_score DESC NULLS LAST)
  WHERE response_time_score IS NOT NULL;

-- =============================================
-- B) EXTEND NOTIFICATION TYPES
-- =============================================
-- Add deal lifecycle + demand match notification types.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'requisition_approval','requisition_filled','requisition_cancelled',
    'offer_received','offer_accepted','offer_rejected',
    'compliance_expiring','compliance_expired','compliance_verified',
    'sla_warning','sla_breached',
    'vendor_pool_change','vendor_pool_blocked',
    'capacity_interest','capacity_expiring','capacity_match','capacity_stale',
    'deal_confirmed','deal_assignment_started','deal_completed',
    'supplier_invited','supplier_reputation_updated',
    'distribution_stage_advanced',
    -- NEW: deal lifecycle notifications
    'deal_offer_sent','deal_accepted',
    -- NEW: demand matching notification
    'demand_match',
    'general','system'
  ));
