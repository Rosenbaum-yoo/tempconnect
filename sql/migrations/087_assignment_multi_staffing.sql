-- =============================================================================
-- Migration 087: Assignment-centric multi-staffing orchestration
-- Adds slot-aware staffing counters to assignments plus campaign/invite/reservation
-- tables so quantity > 1 no longer degenerates into a single worker link.
-- =============================================================================

BEGIN;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS demand_request_id UUID REFERENCES demand_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_quantity INT,
  ADD COLUMN IF NOT EXISTS filled_quantity INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_quantity INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_quantity INT,
  ADD COLUMN IF NOT EXISTS staffing_status TEXT NOT NULL DEFAULT 'open'
    CHECK (staffing_status IN ('open','sourcing','partially_filled','filled','closed','cancelled')),
  ADD COLUMN IF NOT EXISTS staffing_last_recalculated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staffing_notes JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_requested_quantity_check;

ALTER TABLE assignments
  ADD CONSTRAINT assignments_requested_quantity_check
  CHECK (
    requested_quantity IS NULL
    OR (
      requested_quantity >= 1
      AND filled_quantity >= 0
      AND reserved_quantity >= 0
      AND (open_quantity IS NULL OR open_quantity >= 0)
    )
  );

UPDATE assignments a
SET offer_id = COALESCE(
      a.offer_id,
      (SELECT o.id FROM offers o WHERE o.assignment_id = a.id LIMIT 1)
    ),
    demand_request_id = COALESCE(
      a.demand_request_id,
      (SELECT o.demand_request_id FROM offers o WHERE o.assignment_id = a.id LIMIT 1)
    );

UPDATE assignments a
SET requested_quantity = COALESCE(
      a.requested_quantity,
      (SELECT o.offered_quantity FROM offers o WHERE o.assignment_id = a.id LIMIT 1),
      (SELECT dr.required_total_count FROM demand_requests dr WHERE dr.id = a.demand_request_id LIMIT 1),
      (SELECT dr.headcount FROM demand_requests dr WHERE dr.id = a.demand_request_id LIMIT 1),
      a.worker_count,
      1
    )
WHERE a.requested_quantity IS NULL;

ALTER TABLE assignments
  ALTER COLUMN requested_quantity SET DEFAULT 1;

UPDATE assignments
SET requested_quantity = 1
WHERE requested_quantity IS NULL;

ALTER TABLE assignments
  ALTER COLUMN requested_quantity SET NOT NULL;

UPDATE assignments
SET worker_count = requested_quantity
WHERE worker_count IS DISTINCT FROM requested_quantity;

UPDATE assignments a
SET filled_quantity = COALESCE((
      SELECT COUNT(*)::INT
      FROM worker_assignment_links wal
      WHERE wal.assignment_id = a.id
        AND wal.is_active = TRUE
        AND wal.worker_confirmation_status IN ('auto_confirmed','worker_confirmed')
    ), 0),
    reserved_quantity = COALESCE((
      SELECT COUNT(*)::INT
      FROM worker_assignment_links wal
      WHERE wal.assignment_id = a.id
        AND wal.is_active = TRUE
        AND wal.worker_confirmation_status = 'pending_confirmation'
    ), 0),
    staffing_last_recalculated_at = NOW();

UPDATE assignments
SET open_quantity = GREATEST(requested_quantity - filled_quantity - reserved_quantity, 0),
    staffing_status = CASE
      WHEN status = 'cancelled' THEN 'cancelled'
      WHEN status = 'completed' THEN 'closed'
      WHEN filled_quantity >= requested_quantity THEN 'filled'
      WHEN filled_quantity > 0 THEN 'partially_filled'
      WHEN reserved_quantity > 0 THEN 'sourcing'
      ELSE 'open'
    END,
    staffing_last_recalculated_at = NOW();

CREATE INDEX IF NOT EXISTS assignments_staffing_open_idx
  ON assignments(supplier_org_id, staffing_status, open_quantity, start_date)
  WHERE status IN ('planned','active','extended');

CREATE INDEX IF NOT EXISTS assignments_demand_request_idx
  ON assignments(demand_request_id)
  WHERE demand_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assignments_offer_idx
  ON assignments(offer_id)
  WHERE offer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS assignment_staffing_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','completed','auto_stopped','cancelled')),
  promotion_mode TEXT NOT NULL DEFAULT 'auto_finalize'
    CHECK (promotion_mode IN ('auto_finalize','manual_review')),
  reservation_window_minutes INT NOT NULL DEFAULT 30
    CHECK (reservation_window_minutes BETWEEN 1 AND 10080),
  target_quantity INT CHECK (target_quantity IS NULL OR target_quantity >= 1),
  sent_count INT NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  viewed_count INT NOT NULL DEFAULT 0 CHECK (viewed_count >= 0),
  interested_count INT NOT NULL DEFAULT 0 CHECK (interested_count >= 0),
  accepted_count INT NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  declined_count INT NOT NULL DEFAULT 0 CHECK (declined_count >= 0),
  expired_count INT NOT NULL DEFAULT 0 CHECK (expired_count >= 0),
  cancelled_count INT NOT NULL DEFAULT 0 CHECK (cancelled_count >= 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staffing_campaigns_assignment_idx
  ON assignment_staffing_campaigns(assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS staffing_campaigns_supplier_status_idx
  ON assignment_staffing_campaigns(supplier_org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS assignment_staffing_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES assignment_staffing_campaigns(id) ON DELETE CASCADE,
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','viewed','interested','declined','accepted','expired','cancelled')),
  score NUMERIC(6,2),
  score_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  personal_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  interested_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  response_note TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, worker_user_id)
);

CREATE INDEX IF NOT EXISTS staffing_invites_assignment_idx
  ON assignment_staffing_invites(assignment_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS staffing_invites_worker_idx
  ON assignment_staffing_invites(worker_user_id, status, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS staffing_invites_assignment_worker_open_uniq
  ON assignment_staffing_invites(assignment_id, worker_user_id)
  WHERE status IN ('sent','viewed','interested','accepted');

CREATE TABLE IF NOT EXISTS assignment_staffing_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  invite_id UUID UNIQUE REFERENCES assignment_staffing_invites(id) ON DELETE SET NULL,
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','released','promoted','expired','cancelled')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  promoted_at TIMESTAMPTZ,
  release_reason TEXT,
  promoted_link_id UUID REFERENCES worker_assignment_links(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staffing_reservations_assignment_idx
  ON assignment_staffing_reservations(assignment_id, status, reserved_at DESC);

CREATE INDEX IF NOT EXISTS staffing_reservations_worker_idx
  ON assignment_staffing_reservations(worker_user_id, status, reserved_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS staffing_reservations_assignment_worker_reserved_uniq
  ON assignment_staffing_reservations(assignment_id, worker_user_id)
  WHERE status = 'reserved';

CREATE TABLE IF NOT EXISTS assignment_staffing_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  invite_id UUID REFERENCES assignment_staffing_invites(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES assignment_staffing_reservations(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
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
      'assignment_auto_stopped'
    )
  ),
  old_values JSONB,
  new_values JSONB,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staffing_events_assignment_idx
  ON assignment_staffing_events(assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS staffing_events_campaign_idx
  ON assignment_staffing_events(campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

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
      'general','system'
    )
  );

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '087_assignment_multi_staffing.sql: multi-staffing structures applied.';
END $$;
