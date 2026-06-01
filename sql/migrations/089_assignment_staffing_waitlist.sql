-- =============================================================================
-- Migration 089: Assignment staffing waitlist / Nachrücker queue
-- Adds a persistent assignment-level candidate queue between suggestion and invite
-- so follow-up waves and auto-backfill can consume the same ranked chain.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS assignment_staffing_waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  root_campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  source_campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  current_campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  current_invite_id UUID REFERENCES assignment_staffing_invites(id) ON DELETE SET NULL,
  current_reservation_id UUID REFERENCES assignment_staffing_reservations(id) ON DELETE SET NULL,
  promoted_link_id UUID REFERENCES worker_assignment_links(id) ON DELETE SET NULL,
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','invited','reserved','assigned','removed')),
  queue_rank INT NOT NULL CHECK (queue_rank >= 1),
  score NUMERIC(6,2),
  soft_score NUMERIC(6,2),
  hard_match BOOLEAN NOT NULL DEFAULT FALSE,
  is_selectable BOOLEAN NOT NULL DEFAULT TRUE,
  hard_failures JSONB NOT NULL DEFAULT '[]'::JSONB,
  missing_requirements JSONB NOT NULL DEFAULT '[]'::JSONB,
  factor_scores JSONB NOT NULL DEFAULT '[]'::JSONB,
  match_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  last_evaluated_at TIMESTAMPTZ,
  queued_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ,
  reserved_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  removal_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, worker_user_id)
);

CREATE INDEX IF NOT EXISTS staffing_waitlist_assignment_status_idx
  ON assignment_staffing_waitlist(assignment_id, status, queue_rank, updated_at DESC);

CREATE INDEX IF NOT EXISTS staffing_waitlist_root_status_idx
  ON assignment_staffing_waitlist(root_campaign_id, status, queue_rank, updated_at DESC)
  WHERE root_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS staffing_waitlist_worker_idx
  ON assignment_staffing_waitlist(worker_user_id, status, updated_at DESC);

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

COMMIT;
