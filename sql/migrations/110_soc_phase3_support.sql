-- =============================================================================
-- Migration 110: SOC Phase 3 Support Operations Center
--
-- Enthält:
--   - Support-RBAC Domain (vendors, agents, queues, cases, notes, events, knowledge, audit)
--   - Escalation Tracking
--   - Owner-Control-Access Audit Trail
--   - Infrastructure Snapshots (für Hetzner Telemetrie / Critical Signals)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Support Vendors (BPO / Callcenter Partner)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  contract_ref  VARCHAR(100),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  scope_policy  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_vendors_name_unique
  ON support_vendors (LOWER(name));

-- ---------------------------------------------------------------------------
-- Support Agents (Plattform-Rollen, getrennt von Org-RBAC)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_agents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                VARCHAR(50) NOT NULL CHECK (role IN (
                        'internal_support_agent',
                        'internal_support_lead',
                        'external_support_agent',
                        'external_support_supervisor',
                        'support_auditor'
                      )),
  scope               VARCHAR(20) NOT NULL DEFAULT 'internal'
                      CHECK (scope IN ('internal', 'external')),
  vendor_id           UUID REFERENCES support_vendors(id) ON DELETE SET NULL,
  allowed_queues      TEXT[] NOT NULL DEFAULT '{}',
  allowed_case_types  TEXT[] NOT NULL DEFAULT '{}',
  allowed_actions     TEXT[] NOT NULL DEFAULT '{}',
  data_scope          VARCHAR(30) NOT NULL DEFAULT 'assigned_only'
                      CHECK (data_scope IN ('full_internal', 'assigned_only', 'vendor_scoped')),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_agents_scope_role_consistency CHECK (
    (scope = 'internal' AND role IN ('internal_support_agent', 'internal_support_lead', 'support_auditor'))
    OR
    (scope = 'external' AND role IN ('external_support_agent', 'external_support_supervisor'))
  ),
  CONSTRAINT support_agents_external_vendor_required CHECK (
    scope <> 'external' OR vendor_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_agents_user_active
  ON support_agents(user_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_support_agents_role_scope
  ON support_agents(role, scope, is_active);

CREATE INDEX IF NOT EXISTS idx_support_agents_vendor
  ON support_agents(vendor_id, is_active);

-- ---------------------------------------------------------------------------
-- Support Queues
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_queues (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   VARCHAR(100) NOT NULL,
  type                   VARCHAR(50),
  description            TEXT,
  sla_first_response_h   INTEGER NOT NULL DEFAULT 24,
  sla_resolution_h       INTEGER NOT NULL DEFAULT 72,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_queues_name_unique
  ON support_queues(LOWER(name));

-- ---------------------------------------------------------------------------
-- Support Case sequence (SC-YYYY-00001)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS support_case_seq START 1 INCREMENT 1;

-- ---------------------------------------------------------------------------
-- Support Cases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_cases (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number                  VARCHAR(20) NOT NULL UNIQUE
                               DEFAULT (
                                 'SC-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('support_case_seq')::text, 5, '0')
                               ),
  subject                      VARCHAR(500) NOT NULL,
  description                  TEXT,
  status                       VARCHAR(50) NOT NULL DEFAULT 'new'
                               CHECK (status IN (
                                 'new', 'open', 'in_progress', 'waiting_customer', 'waiting_internal',
                                 'escalated', 'escalated_decisions', 'escalated_commercial', 'escalated_ops',
                                 'resolved', 'closed', 'reopened'
                               )),
  priority                     VARCHAR(20) NOT NULL DEFAULT 'normal'
                               CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'critical')),
  case_type                    VARCHAR(50) NOT NULL DEFAULT 'general'
                               CHECK (case_type IN (
                                 'general', 'verification', 'invite', 'onboarding', 'login_access',
                                 'billing', 'feature_question', 'bug_report', 'complaint', 'other'
                               )),
  queue_id                     UUID REFERENCES support_queues(id) ON DELETE SET NULL,
  assigned_to_agent_id         UUID REFERENCES support_agents(id) ON DELETE SET NULL,
  reporter_user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  reporter_org_id              UUID REFERENCES organizations(id) ON DELETE SET NULL,
  sla_first_response_deadline  TIMESTAMPTZ,
  sla_resolution_deadline      TIMESTAMPTZ,
  sla_first_responded_at       TIMESTAMPTZ,
  sla_resolved_at              TIMESTAMPTZ,
  is_escalated                 BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_target            VARCHAR(50)
                               CHECK (escalation_target IN ('decisions_requests', 'commercial', 'ops', 'owner')),
  escalation_case_id           UUID REFERENCES support_cases(id) ON DELETE SET NULL,
  related_occ_request_id       UUID REFERENCES occ_decisions(id) ON DELETE SET NULL,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at                    TIMESTAMPTZ
);

ALTER TABLE support_cases
  ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES support_queues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_agent_id UUID REFERENCES support_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reporter_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sla_first_response_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_resolution_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_first_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escalation_target VARCHAR(50),
  ADD COLUMN IF NOT EXISTS escalation_case_id UUID REFERENCES support_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_occ_request_id UUID REFERENCES occ_decisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_support_cases_status
  ON support_cases(status);
CREATE INDEX IF NOT EXISTS idx_support_cases_priority
  ON support_cases(priority);
CREATE INDEX IF NOT EXISTS idx_support_cases_assigned
  ON support_cases(assigned_to_agent_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_queue
  ON support_cases(queue_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_reporter_org
  ON support_cases(reporter_org_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_reporter_user
  ON support_cases(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_created_desc
  ON support_cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_sla_resolution_deadline
  ON support_cases(sla_resolution_deadline)
  WHERE status NOT IN ('resolved', 'closed');

-- ---------------------------------------------------------------------------
-- Case Notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_case_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  author_agent_id  UUID REFERENCES support_agents(id) ON DELETE SET NULL,
  note_type        VARCHAR(20) NOT NULL DEFAULT 'internal'
                   CHECK (note_type IN ('internal', 'external', 'system')),
  body             TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_case_notes_case
  ON support_case_notes(case_id);

-- ---------------------------------------------------------------------------
-- Case Timeline Events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_case_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  actor_agent_id   UUID REFERENCES support_agents(id) ON DELETE SET NULL,
  event            VARCHAR(100) NOT NULL,
  detail           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_case_events_case
  ON support_case_events(case_id);

-- ---------------------------------------------------------------------------
-- Knowledge Base
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_knowledge (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category       VARCHAR(100) NOT NULL,
  title          VARCHAR(300) NOT NULL,
  body           TEXT NOT NULL,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  allowed_roles  TEXT[] NOT NULL DEFAULT '{internal_support_agent,internal_support_lead}',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_knowledge_category_active
  ON support_knowledge(category)
  WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- Support Audit Log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID REFERENCES support_agents(id) ON DELETE SET NULL,
  case_id       UUID REFERENCES support_cases(id) ON DELETE SET NULL,
  action        VARCHAR(100) NOT NULL,
  reason        TEXT,
  before_state  JSONB,
  after_state   JSONB,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_audit_log_agent
  ON support_audit_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_support_audit_log_case
  ON support_audit_log(case_id);
CREATE INDEX IF NOT EXISTS idx_support_audit_log_created_desc
  ON support_audit_log(created_at DESC);

-- ---------------------------------------------------------------------------
-- Support Escalations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_escalations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  target                 VARCHAR(50) NOT NULL
                         CHECK (target IN ('decisions_requests', 'commercial', 'ops', 'owner')),
  reason                 TEXT NOT NULL,
  priority               VARCHAR(20) NOT NULL
                         CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'critical')),
  summary                TEXT NOT NULL,
  status                 VARCHAR(30) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'acknowledged', 'resolved', 'rejected')),
  created_by_agent_id    UUID REFERENCES support_agents(id) ON DELETE SET NULL,
  resolved_by_agent_id   UUID REFERENCES support_agents(id) ON DELETE SET NULL,
  related_occ_request_id UUID REFERENCES occ_decisions(id) ON DELETE SET NULL,
  resolution_note        TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_escalations_status_created
  ON support_escalations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_escalations_target_status
  ON support_escalations(target, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_escalations_case
  ON support_escalations(case_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Owner Control Access Audit (grant/revoke/list)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owner_control_access_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  action         VARCHAR(30) NOT NULL
                 CHECK (action IN ('grant', 'revoke', 'list', 'access_denied')),
  performed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  note           TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_control_access_audit_user
  ON owner_control_access_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_control_access_audit_action
  ON owner_control_access_audit(action, created_at DESC);

-- ---------------------------------------------------------------------------
-- Infrastructure snapshots for Hetzner telemetry and critical signals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS infrastructure_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_name              TEXT NOT NULL,
  env                    TEXT NOT NULL DEFAULT 'production',
  cpu_percent            NUMERIC(5,2),
  ram_percent            NUMERIC(5,2),
  disk_percent           NUMERIC(5,2),
  docker_running_count   INTEGER NOT NULL DEFAULT 0,
  docker_unhealthy_count INTEGER NOT NULL DEFAULT 0,
  tls_days_remaining     INTEGER,
  backup_age_h           NUMERIC(8,2),
  deployment_version     TEXT,
  deployment_status      TEXT,
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  collected_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_infrastructure_snapshots_host_collected
  ON infrastructure_snapshots(host_name, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_infrastructure_snapshots_collected_desc
  ON infrastructure_snapshots(collected_at DESC);

-- ---------------------------------------------------------------------------
-- Development seed data (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO support_queues (name, type, sla_first_response_h, sla_resolution_h)
SELECT 'Allgemein', 'general', 8, 48
WHERE NOT EXISTS (SELECT 1 FROM support_queues WHERE LOWER(name) = 'allgemein');

INSERT INTO support_queues (name, type, sla_first_response_h, sla_resolution_h)
SELECT 'Verifikation', 'verification', 4, 24
WHERE NOT EXISTS (SELECT 1 FROM support_queues WHERE LOWER(name) = 'verifikation');

INSERT INTO support_queues (name, type, sla_first_response_h, sla_resolution_h)
SELECT 'Billing', 'billing', 4, 24
WHERE NOT EXISTS (SELECT 1 FROM support_queues WHERE LOWER(name) = 'billing');

INSERT INTO support_knowledge (category, title, body, allowed_roles)
SELECT
  'Verifikation',
  'Verifikationsmail erneut senden',
  'Sehr geehrte/r Nutzer/in,\n\nwir senden Ihnen hiermit eine neue Verifikations-E-Mail zu...',
  '{internal_support_agent,internal_support_lead,external_support_agent,external_support_supervisor}'::text[]
WHERE NOT EXISTS (
  SELECT 1
    FROM support_knowledge
   WHERE category = 'Verifikation'
     AND title = 'Verifikationsmail erneut senden'
);

COMMIT;
