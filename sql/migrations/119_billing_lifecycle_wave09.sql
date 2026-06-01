-- =============================================================================
-- Migration 119: Billing Lifecycle – Trial + Hard-Lock Automation (WAVE_09)
--
-- Ziele:
--   1. trial_mode / trial_ends_at: Subscription kann als Testphase
--      gekennzeichnet werden. WAVE_09-Cron transitioniert automatisch auf
--      past_due wenn trial_ends_at abgelaufen ist.
--   2. Automatischer Hard-Lock: WAVE_09-Cron finalisiert past_due-
--      Subscriptions nach Ablauf der Kulanzfrist (BILLING_GRACE_PERIOD_DAYS)
--      als canceled + resets org.plan auf DEMO.
--
-- Verweis auf Service-Logik:
--   api/services/subscriptionLifecycleService.js
--     applyTrialEnds()  – Cron 4: active trial -> past_due
--     applyHardLocks()  – Cron 5: past_due (grace expired) -> canceled
--   api/services/entitlementService.js
--     computeSubscriptionStatus() – BILLING_GRACE_PERIOD_DAYS = 14
--       past_due + innerhalb Kulanzfrist -> active=true (Soft-Lock + Warnbanner)
--       past_due + Kulanzfrist abgelaufen -> active=false (Hard-Lock)
--
-- Bewusst NICHT angefasst:
--   - CHECK-Constraint auf status: 'active','past_due','canceling','canceled'
--     bleibt unveraendert (trial_mode wird per Spalte abgebildet,
--     kein neues status-Enum noetig)
--   - current_period_end: bereits in init.sql, wird vom Hard-Lock-Cron gelesen
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) trial_mode + trial_ends_at
-- ---------------------------------------------------------------------------

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_mode BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN subscriptions.trial_mode IS
  'TRUE = Subscription befindet sich in Testphase. Kein Zahlungseingang erwartet '
  'bis trial_ends_at. WAVE_09-Cron setzt status auf past_due wenn trial_ends_at <= NOW().';

COMMENT ON COLUMN subscriptions.trial_ends_at IS
  'Ende der Testphase. Relevant nur wenn trial_mode = TRUE. '
  'Nach diesem Zeitpunkt: Cron applyTrialEnds() -> status = past_due -> '
  'Kulanzfrist laeuft -> Cron applyHardLocks() -> status = canceled.';

-- ---------------------------------------------------------------------------
-- 2) Cron-Indexes fuer WAVE_09 Billing Lifecycle
-- ---------------------------------------------------------------------------

-- Cron 4: Trial-End Detection
-- Selektiert active+trial_mode Subscriptions deren Testphase abgelaufen ist.
CREATE INDEX IF NOT EXISTS idx_subs_trial_expiry
  ON subscriptions(trial_ends_at)
  WHERE trial_mode = TRUE
    AND trial_ends_at IS NOT NULL
    AND status = 'active';

-- Cron 5: Hard-Lock Enforcement
-- Selektiert past_due Subscriptions fuer Grace-Period-Prüfung.
-- (Grace-Berechnung: current_period_end + 14 Tage <= NOW wird im Service gemacht)
CREATE INDEX IF NOT EXISTS idx_subs_hard_lock_due
  ON subscriptions(current_period_end)
  WHERE status = 'past_due'
    AND current_period_end IS NOT NULL;

COMMIT;
