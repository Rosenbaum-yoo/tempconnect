-- =============================================================================
-- Migration 073: Worker Lifecycle Completion
-- Adds: worker_unavailable status, submission notification types, correction detection support.
-- Preserves ALL existing types. Add-only. Fully backward-compatible.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. worker_assignment_links: new confirmation status 'worker_unavailable'
-- ---------------------------------------------------------------------------
ALTER TABLE worker_assignment_links
  DROP CONSTRAINT IF EXISTS worker_assignment_links_worker_confirmation_status_check;

ALTER TABLE worker_assignment_links
  ADD CONSTRAINT worker_assignment_links_worker_confirmation_status_check CHECK (
    worker_confirmation_status = ANY (ARRAY[
      'auto_confirmed',
      'pending_confirmation',
      'worker_confirmed',
      'worker_declined',
      'worker_unavailable'
    ])
  );

ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS unavailable_from DATE;
ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS unavailable_reason TEXT;
ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS unavailable_reported_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. worker_submission_events: new event types
-- ---------------------------------------------------------------------------
ALTER TABLE worker_submission_events
  DROP CONSTRAINT IF EXISTS worker_submission_events_event_type_check;

ALTER TABLE worker_submission_events
  ADD CONSTRAINT worker_submission_events_event_type_check CHECK (
    event_type = ANY (ARRAY[
      -- existing
      'created','submitted','review_started','correction_requested',
      'corrected','accepted','rejected','superseded','comment_added',
      'approved_internal','sent_to_customer',
      'customer_confirmed','customer_rejected','posted_to_timesheet',
      -- new: worker unavailability
      'worker_unavailable',
      -- new: correction snapshot
      'correction_snapshot'
    ])
  );

-- ---------------------------------------------------------------------------
-- 3. worker_time_submissions: add sent_to_customer_by column if missing
-- ---------------------------------------------------------------------------
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS sent_to_customer_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. notifications: add new worker lifecycle types
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
      -- enterprise core
      'requisition_approval','requisition_filled','requisition_cancelled',
      'offer_received','offer_accepted','offer_rejected',
      'offer_counter_received','offer_withdrawn',
      'compliance_expiring','compliance_expired','compliance_verified',
      'sla_warning','sla_breached',
      'vendor_pool_change','vendor_pool_blocked',
      'capacity_interest','capacity_expiring','capacity_match','capacity_stale',
      'deal_confirmed','deal_assignment_started','deal_completed',
      'deal_offer_sent','deal_accepted',
      'demand_match',
      'supplier_invited','supplier_reputation_updated',
      'distribution_stage_advanced',
      -- worker module (from 071)
      'worker_assignment_new','worker_assignment_changed',
      'worker_assignment_pending_confirmation',
      'worker_assignment_confirmed','worker_assignment_declined',
      'worker_submission_correction_requested',
      'worker_submission_accepted','worker_submission_rejected',
      'worker_shift_reminder',
      -- NEW: worker lifecycle completion (073)
      'worker_unavailable_reported',
      'worker_submission_submitted',
      'worker_submission_corrected',
      'worker_submission_sent_to_customer',
      -- generic
      'general','system'
    )
  );

COMMIT;
