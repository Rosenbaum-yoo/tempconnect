-- Migration 021: Capacity Exchange with Availability Autopilot
-- Extends capacity_posts with professional status workflow, expiry, freshness,
-- shift/employment metadata, compliance signals, and interaction tracking.
-- Add-only. Fully backward-compatible with existing marketplace queries.

-- =============================================
-- A) EXTEND capacity_posts
-- =============================================

-- Status workflow (replaces simple is_active boolean)
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('draft','active','paused','expired','filled','archived'));

-- Backfill: map is_active to status
UPDATE capacity_posts SET status = 'active'  WHERE is_active = TRUE  AND status = 'active';
UPDATE capacity_posts SET status = 'archived' WHERE is_active = FALSE AND status = 'active';

-- Category & classification
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS worker_category TEXT;
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS availability_type TEXT DEFAULT 'immediate'
  CHECK (availability_type IN ('immediate','scheduled','flexible'));
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS shift_model TEXT
  CHECK (shift_model IS NULL OR shift_model IN ('day','night','rotating','flexible','weekend','on_call'));
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'temporary'
  CHECK (employment_type IN ('temporary','contract','temp_to_perm','project','on_call'));

-- Location enrichment
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'DE';
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS mobility_notes TEXT;

-- Qualifications & compliance
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS qualification_summary TEXT;
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS certifications_summary TEXT;
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'unknown'
  CHECK (compliance_status IN ('unknown','pending','partial','complete'));
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS notes TEXT;

-- Visibility & priority
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS visibility_status TEXT DEFAULT 'public'
  CHECK (visibility_status IN ('public','plan_gated','vendor_pool_only','private'));
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS priority_level TEXT DEFAULT 'normal'
  CHECK (priority_level IN ('normal','elevated','urgent'));

-- Expiry & freshness
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS last_confirmed_at TIMESTAMPTZ;

-- Organization linkage (for enterprise multi-location)
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES org_departments(id) ON DELETE SET NULL;
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Price hint (text-based for display, supplements existing price_type/min/max)
ALTER TABLE capacity_posts ADD COLUMN IF NOT EXISTS price_hint TEXT;

-- Indexes for capacity exchange queries
CREATE INDEX IF NOT EXISTS capacity_posts_status_idx ON capacity_posts(status);
CREATE INDEX IF NOT EXISTS capacity_posts_status_active_idx ON capacity_posts(status, updated_at DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS capacity_posts_valid_until_idx ON capacity_posts(valid_until)
  WHERE status = 'active' AND valid_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS capacity_posts_worker_category_idx ON capacity_posts(worker_category)
  WHERE status = 'active' AND worker_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS capacity_posts_org_idx ON capacity_posts(org_id)
  WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS capacity_posts_priority_idx ON capacity_posts(priority_level, updated_at DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS capacity_posts_last_confirmed_idx ON capacity_posts(last_confirmed_at)
  WHERE status = 'active';

-- =============================================
-- B) CAPACITY INTERACTIONS (Company <-> Entry)
-- =============================================

CREATE TABLE IF NOT EXISTS capacity_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capacity_post_id UUID NOT NULL REFERENCES capacity_posts(id) ON DELETE CASCADE,
  company_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL
    CHECK (interaction_type IN ('interest','offer_request','question','save','requisition_link','deal_start','contact')),
  message TEXT,
  requisition_id UUID REFERENCES requisitions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS capacity_interactions_post_idx ON capacity_interactions(capacity_post_id);
CREATE INDEX IF NOT EXISTS capacity_interactions_company_idx ON capacity_interactions(company_user_id);
CREATE INDEX IF NOT EXISTS capacity_interactions_type_idx ON capacity_interactions(capacity_post_id, interaction_type);

-- =============================================
-- C) EXTEND NOTIFICATIONS TYPE (add capacity-related types)
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
    'general','system'
  ));
