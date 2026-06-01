-- =============================================================================
-- Migration 099: subscription_requests + status_history
--
-- Zentralisiert ALLE Subscription-State-Aenderungs-Anfragen:
--   - new_individual: neue Individuell-Anfrage (Konfigurator, Public-Lead OK)
--   - pilot:          Pilot-Conversion-Wunsch (PlatformAdmin/StaffSeite)
--   - upgrade:        Wunsch nach hoeherem Plan
--   - downgrade:      Wunsch nach niedrigerem Plan
--   - cancellation:   Kuendigungswunsch (mit Approval-Pflicht fuer Individuell)
--
-- Verhaeltnis zu bestehenden Strukturen:
--   - `subscriptions` (init.sql + 002 + 028 + 080 + 093) bleibt der Live-State
--     pro User. `organizations.plan` bleibt der org-effektive Plan.
--   - `strategic_collaboration_requests` (064 + 094 + 098) bleibt der
--     Lead-Inbox fuer qualifizierte B2B-Kooperations-Interessen. Wenn ein
--     Lead in eine echte Subscription-Aenderung umgewandelt wird,
--     referenziert `subscription_requests.source_strategic_request_id`
--     die urspruengliche Inquiry.
--
-- Statusmodell (10 Werte):
--   draft, submitted, under_review, needs_clarification, offered,
--   accepted, active, rejected, cancelled, expired
--
-- Status-Audit:
--   `subscription_request_status_history` haelt jede Statusaenderung mit
--   Aktor + Begruendung + Detail-JSON; ergaenzend zum platform-weiten
--   `audit_log` (das den High-Level-Action-Track speichert).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) subscription_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Typ + Status (siehe State-Machine im Service)
  request_type                TEXT NOT NULL
    CHECK (request_type IN (
      'new_individual','pilot','upgrade','downgrade','cancellation'
    )),
  status                      TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN (
      'draft','submitted','under_review','needs_clarification','offered',
      'accepted','active','rejected','cancelled','expired'
    )),

  -- Bindung (alle nullable - public-leads erlaubt fuer new_individual/pilot)
  org_id                      UUID NULL REFERENCES organizations(id) ON DELETE SET NULL,
  user_id                     UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  contact_email               TEXT NOT NULL,
  contact_name                TEXT NULL,
  contact_phone               TEXT NULL,
  requester_company_name      TEXT NULL,

  -- Optional: Verbindung zu strategic_collaboration_requests
  source_strategic_request_id UUID NULL
    REFERENCES strategic_collaboration_requests(id) ON DELETE SET NULL,

  -- Aktueller Tarif-Snapshot (bei upgrade/downgrade/cancellation befuellt)
  current_plan                TEXT NULL,
  current_individual_tier     TEXT NULL,

  -- Wunsch-Tarif (bei new_individual/pilot/upgrade/downgrade befuellt)
  desired_plan                TEXT NULL,
  desired_individual_tier     TEXT NULL
    CHECK (desired_individual_tier IS NULL OR desired_individual_tier IN (
      'individuell_s','individuell_m','individuell_l','individuell_enterprise'
    )),
  desired_features            JSONB NOT NULL DEFAULT '[]'::jsonb,
  desired_addons              JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Bedarfs-Dimensionen
  employee_count              INTEGER NULL CHECK (employee_count IS NULL OR employee_count >= 1),
  user_count                  INTEGER NULL CHECK (user_count IS NULL OR user_count >= 1),
  site_count                  INTEGER NULL CHECK (site_count IS NULL OR site_count >= 1),
  supplier_count              INTEGER NULL CHECK (supplier_count IS NULL OR supplier_count >= 0),
  monthly_volume              TEXT NULL,
  region_scope                TEXT NULL,
  industry                    TEXT NULL,
  expected_start_date         DATE NULL,
  expected_end_date           DATE NULL,

  -- Staff-Felder
  assigned_staff_id           UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  assigned_at                 TIMESTAMPTZ NULL,
  staff_notes                 TEXT NULL,
  proposed_price_cents        INTEGER NULL CHECK (proposed_price_cents IS NULL OR proposed_price_cents >= 0),
  proposed_term_months        INTEGER NULL CHECK (proposed_term_months IS NULL OR proposed_term_months > 0),

  -- Approval-Audit
  approved_by                 UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at                 TIMESTAMPTZ NULL,
  rejected_by                 UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  rejected_at                 TIMESTAMPTZ NULL,
  rejection_reason            TEXT NULL,

  -- Aktivierung (Spiegel zu subscriptions.activated_at)
  activated_at                TIMESTAMPTZ NULL,

  -- Self-Service-Routing
  is_self_service             BOOLEAN NOT NULL DEFAULT FALSE,
  requires_staff_approval     BOOLEAN NOT NULL DEFAULT TRUE,

  -- Meta
  context                     JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_ip                TEXT NULL,
  submitted_user_agent        TEXT NULL,

  -- Lifecycle-Timestamps
  status_updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_updated_by           UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Konsistenz-Checks (entweder Org oder Public-Lead)
  CHECK (
    -- new_individual und pilot duerfen public sein -> org/user nullable
    request_type IN ('new_individual','pilot')
    OR
    -- upgrade/downgrade/cancellation MUESSEN entweder org_id ODER user_id haben
    (org_id IS NOT NULL OR user_id IS NOT NULL)
  )
);

-- Maximal 1 offene Anfrage pro Org je request_type (verhindert Doppel-Pending)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscription_requests_open_per_org_type
  ON subscription_requests(org_id, request_type)
  WHERE status NOT IN ('rejected','cancelled','expired','active') AND org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_requests_status_created
  ON subscription_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_type_status
  ON subscription_requests(request_type, status);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_org
  ON subscription_requests(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_assigned_staff
  ON subscription_requests(assigned_staff_id, status)
  WHERE assigned_staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_requests_email
  ON subscription_requests(LOWER(contact_email), created_at DESC);

-- ---------------------------------------------------------------------------
-- 2) subscription_request_status_history (Audit-Trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_request_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES subscription_requests(id) ON DELETE CASCADE,
  from_status     TEXT NULL,
  to_status       TEXT NOT NULL,
  changed_by      UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  reason          TEXT NULL,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subreq_history_request_created
  ON subscription_request_status_history(request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_subreq_history_to_status
  ON subscription_request_status_history(to_status, created_at DESC);

COMMIT;
