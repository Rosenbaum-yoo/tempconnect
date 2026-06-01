-- Migration 045: Reputation Visibility Enhancements
-- Adds timesheet_reliability_score to supplier_reputation.
-- Add-only. Fully backward-compatible.

-- =============================================
-- A) TIMESHEET RELIABILITY SCORE
-- =============================================
-- Computed from approved/(approved+rejected) timesheets over 12 months.
-- NULL when < 3 timesheets (insufficient data).

ALTER TABLE supplier_reputation
  ADD COLUMN IF NOT EXISTS timesheet_reliability_score NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN supplier_reputation.timesheet_reliability_score
  IS 'Timesheet approval rate 0-100. approved/(approved+rejected)*100. NULL when < 3 timesheets.';
