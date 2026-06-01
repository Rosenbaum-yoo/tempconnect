-- =============================================================================
-- Migration 091: Worker staffing choice sets / preference selection
-- Adds a worker-centric grouping layer above existing staffing invites so
-- multiple assignment options can be presented, ranked and finalized without
-- replacing the protected invite/reservation/assignment flow.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS assignment_staffing_choice_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'options_presented'
    CHECK (status IN (
      'options_presented',
      'preference_submitted',
      'preference_ranked',
      'manual_override',
      'assigned',
      'declined',
      'expired',
      'cancelled'
    )),
  choice_mode TEXT NOT NULL DEFAULT 'preference_only'
    CHECK (choice_mode IN ('preference_only','ranked_choice','free_choice')),
  title TEXT,
  message TEXT,
  response_deadline_at TIMESTAMPTZ,
  worker_note TEXT,
  manual_override_note TEXT,
  final_assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  final_link_id UUID REFERENCES worker_assignment_links(id) ON DELETE SET NULL,
  presented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  manual_override_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staffing_choice_sets_worker_status_idx
  ON assignment_staffing_choice_sets(worker_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS staffing_choice_sets_supplier_status_idx
  ON assignment_staffing_choice_sets(supplier_org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS assignment_staffing_choice_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  choice_set_id UUID NOT NULL REFERENCES assignment_staffing_choice_sets(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  invite_id UUID NOT NULL UNIQUE REFERENCES assignment_staffing_invites(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  option_order INT NOT NULL CHECK (option_order >= 1),
  worker_response TEXT NOT NULL DEFAULT 'pending'
    CHECK (worker_response IN ('pending','preferred','acceptable','ranked','selected','declined')),
  worker_rank INT CHECK (worker_rank IS NULL OR worker_rank >= 1),
  worker_note TEXT,
  worker_responded_at TIMESTAMPTZ,
  dispatcher_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (dispatcher_state IN ('pending','assigned','manual_override','withdrawn')),
  dispatcher_note TEXT,
  dispatcher_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (choice_set_id, assignment_id),
  UNIQUE (choice_set_id, option_order)
);

CREATE INDEX IF NOT EXISTS staffing_choice_options_assignment_idx
  ON assignment_staffing_choice_options(assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS staffing_choice_options_choice_set_idx
  ON assignment_staffing_choice_options(choice_set_id, option_order, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS staffing_choice_options_rank_uniq
  ON assignment_staffing_choice_options(choice_set_id, worker_rank)
  WHERE worker_rank IS NOT NULL;

ALTER TABLE assignment_staffing_choice_sets
  ADD COLUMN IF NOT EXISTS final_choice_option_id UUID REFERENCES assignment_staffing_choice_options(id) ON DELETE SET NULL;

ALTER TABLE assignment_staffing_events
  ADD COLUMN IF NOT EXISTS choice_set_id UUID REFERENCES assignment_staffing_choice_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS choice_option_id UUID REFERENCES assignment_staffing_choice_options(id) ON DELETE SET NULL;

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
      'waitlist_removed',
      'choice_set_created',
      'choice_preference_submitted',
      'choice_ranking_submitted',
      'choice_option_selected',
      'choice_set_declined',
      'choice_manual_override',
      'choice_assigned',
      'choice_cancelled',
      'choice_expired'
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
      'worker_staffing_choice_request',
      'worker_staffing_choice_submitted',
      'worker_staffing_choice_declined',
      'general','system'
    )
  );

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '091_assignment_staffing_choice_sets.sql: staffing choice set structures applied.';
END $$;
