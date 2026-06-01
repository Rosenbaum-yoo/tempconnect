-- =============================================================================
-- Migration 090: Structured worker staffing requests, delivery state and reminders
-- Extends assignment staffing invites with worker-visible request snapshots,
-- delivery/retry metadata and request-bound worker/dispatcher interactions.
-- =============================================================================

BEGIN;

ALTER TABLE assignment_staffing_invites
  ADD COLUMN IF NOT EXISTS request_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','queued','delivered','failed')),
  ADD COLUMN IF NOT EXISTS delivery_attempt_count INT NOT NULL DEFAULT 0
    CHECK (delivery_attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS delivery_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_last_error TEXT,
  ADD COLUMN IF NOT EXISTS remind_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count INT NOT NULL DEFAULT 0
    CHECK (reminder_count >= 0),
  ADD COLUMN IF NOT EXISTS last_worker_action_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS staffing_invites_delivery_idx
  ON assignment_staffing_invites(delivery_status, sent_at DESC)
  WHERE status IN ('sent','viewed','interested');

CREATE INDEX IF NOT EXISTS staffing_invites_reminder_due_idx
  ON assignment_staffing_invites(remind_after, status)
  WHERE remind_after IS NOT NULL
    AND status IN ('sent','viewed','interested');

CREATE TABLE IF NOT EXISTS assignment_staffing_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  invite_id UUID NOT NULL REFERENCES assignment_staffing_invites(id) ON DELETE CASCADE,
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL
    CHECK (sender_role IN ('worker','dispatcher','system')),
  message_type TEXT NOT NULL
    CHECK (message_type IN ('question','reminder_request','reminder_sent','status_update')),
  body TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staffing_messages_invite_idx
  ON assignment_staffing_messages(invite_id, created_at DESC);

CREATE INDEX IF NOT EXISTS staffing_messages_assignment_idx
  ON assignment_staffing_messages(assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS staffing_messages_worker_idx
  ON assignment_staffing_messages(worker_user_id, created_at DESC);

ALTER TABLE assignment_staffing_events
  DROP CONSTRAINT IF EXISTS assignment_staffing_events_event_type_check;

ALTER TABLE assignment_staffing_events
  ADD CONSTRAINT assignment_staffing_events_event_type_check CHECK (
    event_type IN (
      'campaign_created',
      'invite_sent',
      'invite_viewed',
      'invite_interested',
      'invite_declined',
      'invite_accepted',
      'invite_expired',
      'invite_cancelled',
      'invite_delivery_queued',
      'invite_delivered',
      'invite_delivery_failed',
      'invite_reminder_requested',
      'invite_reminder_sent',
      'worker_question_asked',
      'reservation_created',
      'reservation_promoted',
      'reservation_expired',
      'reservation_released',
      'assignment_staffing_recalculated',
      'assignment_auto_stopped',
      'waitlist_queued',
      'waitlist_invited',
      'waitlist_reserved',
      'waitlist_assigned',
      'waitlist_removed'
    )
  );

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
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
      'worker_assignment_new','worker_assignment_changed',
      'worker_assignment_pending_confirmation',
      'worker_assignment_confirmed','worker_assignment_declined',
      'worker_submission_correction_requested',
      'worker_submission_accepted','worker_submission_rejected',
      'worker_shift_reminder',
      'worker_unavailable_reported',
      'worker_submission_submitted',
      'worker_submission_corrected',
      'worker_submission_sent_to_customer',
      'worker_document_verified',
      'worker_document_rejected',
      'worker_document_expiring',
      'worker_document_expired',
      'worker_staffing_request_new',
      'worker_staffing_request_reminder',
      'worker_staffing_request_question',
      'general','system'
    )
  );

COMMIT;
