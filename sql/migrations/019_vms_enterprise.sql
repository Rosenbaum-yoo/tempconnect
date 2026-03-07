-- Migration 019: VMS Enterprise – Organisationen, Rollen, Requisitions, Vendor Pool, Compliance Docs, Approvals
-- Add-only, keine Aenderungen an bestehenden Tabellen, rueckwaertskompatibel.

-- =============================================
-- A) ORGANISATIONEN / MANDANTEN
-- =============================================

-- A1) organizations – Mandantenfaehigkeit (Unternehmen oder Agentur als Org)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('company','agency')),
  billing_email TEXT,
  tax_id TEXT,
  logo_url TEXT,
  website TEXT,
  plan TEXT NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE','BASIS','PLUS','NOTDIENST','ENTERPRISE')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organizations_slug_idx ON organizations(slug);
CREATE INDEX IF NOT EXISTS organizations_type_idx ON organizations(type);

-- A2) org_locations – Standorte pro Organisation
CREATE TABLE IF NOT EXISTS org_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  street TEXT,
  city TEXT NOT NULL,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'DE',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_hq BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_locations_org_idx ON org_locations(org_id);
CREATE INDEX IF NOT EXISTS org_locations_city_idx ON org_locations(city);

-- A3) org_departments – Abteilungen / Bereiche pro Organisation
CREATE TABLE IF NOT EXISTS org_departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID REFERENCES org_locations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  cost_center TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_departments_org_idx ON org_departments(org_id);

-- A4) org_memberships – Nutzer-Zuordnung zu Org mit Rolle
CREATE TABLE IF NOT EXISTS org_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL DEFAULT 'member'
    CHECK (role_key IN ('owner','admin','program_manager','hiring_manager','supplier_manager','finance','member','supplier_user')),
  department_id UUID REFERENCES org_departments(id) ON DELETE SET NULL,
  location_id UUID REFERENCES org_locations(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS org_memberships_user_idx ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS org_memberships_org_role_idx ON org_memberships(org_id, role_key);

-- Users: optionale org_id Referenz (fuer schnellen Zugriff)
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_org_id_idx ON users(org_id) WHERE org_id IS NOT NULL;

-- =============================================
-- B) VENDOR POOL
-- =============================================

CREATE TABLE IF NOT EXISTS vendor_pool (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'SECONDARY'
    CHECK (tier IN ('PREFERRED','SECONDARY','TRIAL','RESTRICTED','BLOCKED')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','removed')),
  category TEXT,
  location_id UUID REFERENCES org_locations(id) ON DELETE SET NULL,
  department_id UUID REFERENCES org_departments(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_org_id, supplier_org_id, category, location_id, department_id)
);

CREATE INDEX IF NOT EXISTS vendor_pool_client_idx ON vendor_pool(client_org_id, tier, status);
CREATE INDEX IF NOT EXISTS vendor_pool_supplier_idx ON vendor_pool(supplier_org_id);

-- =============================================
-- C) REQUISITIONS (Suchauftraege / Bedarfsanforderungen)
-- =============================================

CREATE TABLE IF NOT EXISTS requisitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  location_id UUID REFERENCES org_locations(id) ON DELETE SET NULL,
  department_id UUID REFERENCES org_departments(id) ON DELETE SET NULL,

  -- Inhalt
  title TEXT NOT NULL,
  description TEXT,
  role TEXT NOT NULL,
  skill_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  headcount INT NOT NULL DEFAULT 1 CHECK (headcount >= 1),
  start_date DATE,
  end_date DATE,
  location_city TEXT,
  location_postal TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_km INT NOT NULL DEFAULT 25,
  shift_requirements JSONB,
  qualifications JSONB,
  budget_min_cents INT,
  budget_max_cents INT,
  urgency TEXT NOT NULL DEFAULT 'normal'
    CHECK (urgency IN ('normal','high','urgent','notdienst')),
  priority INT NOT NULL DEFAULT 0,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','OPEN','IN_REVIEW','SHORTLISTED','FILLED','CLOSED','CANCELLED')),
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  filled_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,

  -- SLA
  sla_minutes INT,
  sla_due_at TIMESTAMPTZ,
  sla_status TEXT CHECK (sla_status IN ('RUNNING','MET','BREACHED')),
  sla_met_at TIMESTAMPTZ,
  sla_breached_at TIMESTAMPTZ,

  -- Matching
  search_job_id UUID REFERENCES sla_search_jobs(id) ON DELETE SET NULL,
  demand_request_id UUID REFERENCES demand_requests(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS requisitions_org_status_idx ON requisitions(org_id, status);
CREATE INDEX IF NOT EXISTS requisitions_created_by_idx ON requisitions(created_by);
CREATE INDEX IF NOT EXISTS requisitions_status_idx ON requisitions(status);
CREATE INDEX IF NOT EXISTS requisitions_sla_scan_idx ON requisitions(sla_due_at)
  WHERE sla_status = 'RUNNING' AND status IN ('OPEN','IN_REVIEW');

-- C2) requisition_events – vollstaendiger Audit-Trail
CREATE TABLE IF NOT EXISTS requisition_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'CREATED','SUBMITTED_FOR_APPROVAL','APPROVED','REJECTED','OPENED',
      'CANDIDATE_ADDED','CANDIDATE_REMOVED','CANDIDATE_SHORTLISTED','CANDIDATE_REJECTED',
      'IN_REVIEW','SHORTLISTED','FILLED','CLOSED','CANCELLED','REOPENED',
      'COMMENT','NOTE','ASSIGNMENT_CHANGED','FIELD_CHANGED',
      'SLA_STARTED','SLA_MET','SLA_BREACHED'
    )),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS requisition_events_req_idx ON requisition_events(requisition_id);
CREATE INDEX IF NOT EXISTS requisition_events_created_idx ON requisition_events(created_at);

-- C3) requisition_candidates – Shortlist / Kandidatenverwaltung
CREATE TABLE IF NOT EXISTS requisition_candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  capacity_post_id UUID REFERENCES capacity_posts(id) ON DELETE SET NULL,
  supplier_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested','under_review','shortlisted','accepted','rejected','withdrawn')),
  match_score NUMERIC,
  match_reasons JSONB DEFAULT '[]'::JSONB,
  internal_notes TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejected_reason TEXT,
  shortlisted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requisition_id, capacity_post_id)
);

CREATE INDEX IF NOT EXISTS req_candidates_req_status_idx ON requisition_candidates(requisition_id, status);

-- =============================================
-- D) APPROVAL WORKFLOW
-- =============================================

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('requisition','offer','vendor_pool_change','compliance_override')),
  entity_id UUID NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired')),
  reason TEXT,
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_requests_entity_idx ON approval_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS approval_requests_org_status_idx ON approval_requests(org_id, status);
CREATE INDEX IF NOT EXISTS approval_requests_pending_idx ON approval_requests(status) WHERE status = 'pending';

-- =============================================
-- E) COMPLIANCE DOCUMENTS (Lieferanten-Dokumente)
-- =============================================

CREATE TABLE IF NOT EXISTS compliance_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN (
      'aueg_erlaubnis','unbedenklichkeit','uvv_nachweis','versicherung',
      'zertifikat','gewerbeanmeldung','handelsregister','datenschutz',
      'arbeitssicherheit','qualifikation','sonstige'
    )),
  doc_name TEXT NOT NULL,
  file_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected','expired')),
  valid_from DATE,
  valid_until DATE,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  reminder_sent_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS compliance_docs_org_idx ON compliance_documents(org_id);
CREATE INDEX IF NOT EXISTS compliance_docs_type_status_idx ON compliance_documents(doc_type, status);
CREATE INDEX IF NOT EXISTS compliance_docs_expiry_idx ON compliance_documents(valid_until)
  WHERE status = 'verified' AND valid_until IS NOT NULL;

-- =============================================
-- F) NOTIFICATIONS / HINWEISE
-- =============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN (
      'requisition_approval','requisition_filled','requisition_cancelled',
      'offer_received','offer_accepted','offer_rejected',
      'compliance_expiring','compliance_expired','compliance_verified',
      'sla_warning','sla_breached',
      'vendor_pool_change','vendor_pool_blocked',
      'general','system'
    )),
  title TEXT NOT NULL,
  message TEXT,
  entity_type TEXT,
  entity_id UUID,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','error','success')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id, is_read)
  WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at DESC);
