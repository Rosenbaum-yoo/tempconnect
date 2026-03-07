-- Migration 020: Enterprise VMS Phase 2
-- Add-only: contracts, assignments, org_settings, org model extensions, audit_log org_id.
-- No existing tables modified destructively. Fully backward-compatible.

-- =============================================
-- A) EXTEND ORGANIZATIONS
-- =============================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS commercial_register TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_contact TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- =============================================
-- B) EXTEND ROLE_KEY ON ORG_MEMBERSHIPS
-- =============================================
-- Drop old constraint and recreate with expanded set.
-- Safe: only adds new allowed values; existing rows remain valid.

ALTER TABLE org_memberships DROP CONSTRAINT IF EXISTS org_memberships_role_key_check;
ALTER TABLE org_memberships ADD CONSTRAINT org_memberships_role_key_check
  CHECK (role_key IN (
    'owner','admin','program_manager','hiring_manager','supplier_manager',
    'finance','member','supplier_user',
    'platform_admin','recruiter','dispatcher','viewer'
  ));

-- =============================================
-- C) CONTRACTS / FRAMEWORK AGREEMENTS
-- =============================================

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('msa','framework','sla','pricing','nda','other')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','expired','terminated')),
  terms_summary TEXT,
  file_ref TEXT,
  valid_from DATE,
  valid_until DATE,
  internal_notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  terminated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  terminated_at TIMESTAMPTZ,
  termination_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contracts_buyer_idx ON contracts(buyer_org_id, status);
CREATE INDEX IF NOT EXISTS contracts_supplier_idx ON contracts(supplier_org_id, status);
CREATE INDEX IF NOT EXISTS contracts_expiry_idx ON contracts(valid_until)
  WHERE status = 'active' AND valid_until IS NOT NULL;

-- =============================================
-- D) ASSIGNMENTS (Post-Deal Fulfillment Foundation)
-- =============================================

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  requisition_id UUID REFERENCES requisitions(id) ON DELETE SET NULL,
  supplier_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  deal_request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  worker_description TEXT,
  worker_count INT NOT NULL DEFAULT 1 CHECK (worker_count >= 1),
  start_date DATE NOT NULL,
  planned_end_date DATE,
  actual_end_date DATE,
  hourly_rate_cents INT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','active','completed','cancelled','extended')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assignments_org_status_idx ON assignments(org_id, status);
CREATE INDEX IF NOT EXISTS assignments_requisition_idx ON assignments(requisition_id);
CREATE INDEX IF NOT EXISTS assignments_supplier_idx ON assignments(supplier_org_id, status);
CREATE INDEX IF NOT EXISTS assignments_start_date_idx ON assignments(start_date)
  WHERE status IN ('planned','active');

-- =============================================
-- E) ORG_SETTINGS (Enterprise Configuration)
-- =============================================

CREATE TABLE IF NOT EXISTS org_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_supplier_only BOOLEAN NOT NULL DEFAULT FALSE,
  auto_match_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_radius_km INT NOT NULL DEFAULT 25,
  compliance_strictness TEXT NOT NULL DEFAULT 'standard'
    CHECK (compliance_strictness IN ('relaxed','standard','strict')),
  notification_preferences JSONB NOT NULL DEFAULT '{}'::JSONB,
  branding JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- F) EXTEND AUDIT_LOG
-- =============================================

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS audit_log_org_idx ON audit_log(org_id) WHERE org_id IS NOT NULL;

-- =============================================
-- G) SUBMISSION WORKFLOW (Supplier Offers as First-Class)
-- =============================================
-- Extend requisition_candidates with submission-specific fields

ALTER TABLE requisition_candidates ADD COLUMN IF NOT EXISTS charge_rate_cents INT;
ALTER TABLE requisition_candidates ADD COLUMN IF NOT EXISTS markup_percent NUMERIC(5,2);
ALTER TABLE requisition_candidates ADD COLUMN IF NOT EXISTS availability_date DATE;
ALTER TABLE requisition_candidates ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE requisition_candidates ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'pending'
  CHECK (compliance_status IN ('pending','cleared','flagged'));
ALTER TABLE requisition_candidates ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE requisition_candidates ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE requisition_candidates ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;

-- Add 'expired' to candidate status if not already present
ALTER TABLE requisition_candidates DROP CONSTRAINT IF EXISTS requisition_candidates_status_check;
ALTER TABLE requisition_candidates ADD CONSTRAINT requisition_candidates_status_check
  CHECK (status IN ('suggested','draft','submitted','under_review','shortlisted','accepted','rejected','withdrawn','expired'));
