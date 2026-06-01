-- ==========================================================
-- Migration 061: Customer Bundle Flow for Worker Submissions
-- Adds bundling metadata for grouped customer transmission/billing prep.
-- ==========================================================

BEGIN;

ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS customer_bundle_key         TEXT,
  ADD COLUMN IF NOT EXISTS customer_bundle_ref         TEXT,
  ADD COLUMN IF NOT EXISTS customer_bundle_status      TEXT
    CHECK (customer_bundle_status = ANY (ARRAY['prepared','sent','partially_confirmed','confirmed','rejected'])),
  ADD COLUMN IF NOT EXISTS customer_bundle_period_from DATE,
  ADD COLUMN IF NOT EXISTS customer_bundle_period_to   DATE,
  ADD COLUMN IF NOT EXISTS customer_bundle_sent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_bundle_sent_by     UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS wts_customer_bundle_key_idx
  ON worker_time_submissions(supplier_org_id, customer_bundle_key)
  WHERE customer_bundle_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS wts_customer_bundle_period_idx
  ON worker_time_submissions(supplier_org_id, org_id, customer_bundle_period_from, customer_bundle_period_to);

COMMIT;
