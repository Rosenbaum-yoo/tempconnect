-- Migration 022: Strategic Platform Layer
-- Adds: requisition distribution stages, platform events, supplier reputation,
-- extended deal statuses, vendor pool invite tracking.
-- Add-only. Fully backward-compatible.

-- =============================================
-- A) REQUISITION DISTRIBUTION STAGES
-- =============================================
-- Allows stage-based distribution: preferred → regional → open platform.

CREATE TABLE IF NOT EXISTS requisition_distribution_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  stage_number INT NOT NULL CHECK (stage_number >= 1),
  pool_tier TEXT NOT NULL CHECK (pool_tier IN ('PREFERRED','SECONDARY','TRIAL','OPEN')),
  label TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','completed','skipped')),
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  auto_advance_hours INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requisition_id, stage_number)
);

CREATE INDEX IF NOT EXISTS dist_stages_req_idx ON requisition_distribution_stages(requisition_id, stage_number);
CREATE INDEX IF NOT EXISTS dist_stages_status_idx ON requisition_distribution_stages(status)
  WHERE status IN ('pending','active');

-- =============================================
-- B) PLATFORM EVENTS (Structured Analytics Events)
-- =============================================

CREATE TABLE IF NOT EXISTS platform_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'supplier_invited','supplier_approved','supplier_blocked',
      'requisition_created','requisition_distributed','requisition_filled',
      'offer_submitted','deal_completed','deal_cancelled',
      'rating_submitted',
      'capacity_published','capacity_expired','capacity_filled',
      'assignment_started','assignment_completed'
    )),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id UUID,
  target_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_events_type_idx ON platform_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_events_org_idx ON platform_events(org_id, created_at DESC)
  WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_events_actor_idx ON platform_events(actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_events_created_idx ON platform_events(created_at DESC);

-- =============================================
-- C) SUPPLIER REPUTATION (Aggregated Scores)
-- =============================================

CREATE TABLE IF NOT EXISTS supplier_reputation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  total_ratings INT NOT NULL DEFAULT 0,
  avg_stars NUMERIC(3,2) DEFAULT 0,
  avg_reliability NUMERIC(3,2) DEFAULT 0,
  avg_communication NUMERIC(3,2) DEFAULT 0,
  avg_quality NUMERIC(3,2) DEFAULT 0,
  completed_deals INT NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'UNRATED'
    CHECK (grade IN ('UNRATED','BRONZE','SILVER','GOLD','PLATINUM')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supplier_reputation_grade_idx ON supplier_reputation(grade)
  WHERE grade != 'UNRATED';

-- =============================================
-- D) EXTEND DEAL (REQUEST) STATUSES
-- =============================================
-- Add intermediate statuses for full deal lifecycle.

ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_status_check
  CHECK (status IN (
    'CREATED','SENT','OFFER_SENT',
    'ACCEPTED','DECLINED',
    'CONFIRMED','ASSIGNMENT_STARTED',
    'FILLED','FINALIZED','COMPLETED',
    'CANCELED'
  ));

-- =============================================
-- E) EXTEND VENDOR_POOL (Invitation Tracking)
-- =============================================

ALTER TABLE vendor_pool ADD COLUMN IF NOT EXISTS invitation_email TEXT;
ALTER TABLE vendor_pool ADD COLUMN IF NOT EXISTS invitation_status TEXT DEFAULT 'none'
  CHECK (invitation_status IN ('none','sent','accepted','expired'));
ALTER TABLE vendor_pool ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;
ALTER TABLE vendor_pool ADD COLUMN IF NOT EXISTS notes TEXT;

-- =============================================
-- F) EXTEND NOTIFICATIONS (add event types)
-- =============================================

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
    'general','system'
  ));
