-- =============================================================================
-- Migration 093: Subscription Cancellation Lifecycle
-- Adds canceling status + cancellation metadata for self-service cancel flows.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) subscriptions: status check erweitern (canceling)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'subscriptions'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  ) LOOP
    EXECUTE 'ALTER TABLE subscriptions DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'subscriptions'::regclass AND conname = 'subscriptions_status_check'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
      CHECK (status IN ('active', 'past_due', 'canceling', 'canceled'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) subscriptions: cancellation metadata + billing period tracking
-- ---------------------------------------------------------------------------
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_requested_by UUID;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_source TEXT;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- ---------------------------------------------------------------------------
-- 3) Backfill: set billing period if missing
-- ---------------------------------------------------------------------------
UPDATE subscriptions
SET current_period_start = COALESCE(current_period_start, created_at),
    current_period_end = COALESCE(
      current_period_end,
      CASE
        WHEN plan IN ('FREE', 'DEMO') THEN created_at + INTERVAL '14 days'
        ELSE created_at + INTERVAL '1 month'
      END
    )
WHERE current_period_start IS NULL OR current_period_end IS NULL;

-- ---------------------------------------------------------------------------
-- 4) Index for cancel-at lookups (cron / batch)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS subscriptions_cancel_at_idx
  ON subscriptions(cancel_at)
  WHERE status = 'canceling';

COMMIT;
