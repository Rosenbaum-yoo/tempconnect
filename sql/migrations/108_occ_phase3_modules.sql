-- =============================================================================
-- Migration 108: OCC Phase 3 Modules
--
-- Enthält:
--   - Warp Hosts / Runbooks / Executions
--   - Automation Jobs
--   - OCC Decisions Modell-Erweiterung (Request-Workflow)
--   - Risk Signals + Deployments + Commercial Offers (Source-of-Truth-Bausteine)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Warp Hosts Registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warp_hosts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,
  role             TEXT NOT NULL DEFAULT 'primary'
                   CHECK (role IN ('primary','worker','db','cache','proxy','backup','staging')),
  env              TEXT NOT NULL DEFAULT 'production'
                   CHECK (env IN ('production','staging','testing','development')),
  status           TEXT NOT NULL DEFAULT 'unknown',
  ip               TEXT,
  region           TEXT,
  ssh_ready        BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_actions  TEXT[] NOT NULL DEFAULT '{}',
  risk_state       TEXT NOT NULL DEFAULT 'unknown'
                   CHECK (risk_state IN ('ok','low','medium','high','critical','unknown')),
  tags             TEXT[] NOT NULL DEFAULT '{}',
  last_checked_at  TIMESTAMPTZ,
  last_error       TEXT,
  last_used_at     TIMESTAMPTZ,
  last_used_by     TEXT,
  connection_notes TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE warp_hosts
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS risk_state TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE warp_hosts
  DROP CONSTRAINT IF EXISTS warp_hosts_risk_state_check;

ALTER TABLE warp_hosts
  ADD CONSTRAINT warp_hosts_risk_state_check
  CHECK (risk_state IN ('ok','low','medium','high','critical','unknown'));

-- ---------------------------------------------------------------------------
-- Warp Runbooks Registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warp_runbooks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,
  category              TEXT NOT NULL DEFAULT 'maintenance',
  risk_level            TEXT NOT NULL DEFAULT 'medium'
                        CHECK (risk_level IN ('low','medium','high','critical')),
  requires_confirm      BOOLEAN NOT NULL DEFAULT TRUE,
  requires_reason       BOOLEAN NOT NULL DEFAULT TRUE,
  target_hosts          TEXT[] NOT NULL DEFAULT '{}',
  steps                 JSONB NOT NULL DEFAULT '[]',
  preconditions         TEXT[] NOT NULL DEFAULT '{}',
  estimated_duration_s  INTEGER,
  last_executed_at      TIMESTAMPTZ,
  last_status           TEXT,
  is_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE warp_runbooks
  ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_status TEXT,
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- Deployments (für Infrastructure/Hetzner Übersicht)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deployments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env             TEXT NOT NULL DEFAULT 'production',
  version         TEXT,
  status          TEXT NOT NULL DEFAULT 'unknown'
                  CHECK (status IN ('pending','running','success','failed','rolled_back','unknown')),
  deployed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deployed_by     TEXT,
  duration_ms     INTEGER,
  rollback_ready  BOOLEAN NOT NULL DEFAULT FALSE,
  post_checks     JSONB NOT NULL DEFAULT '[]',
  risk_level      TEXT NOT NULL DEFAULT 'low'
                  CHECK (risk_level IN ('low','medium','high','critical')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Warp / Automation Executions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warp_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runbook_id      UUID REFERENCES warp_runbooks(id) ON DELETE SET NULL,
  runbook_name    TEXT NOT NULL,
  actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email     TEXT NOT NULL,
  host_name       TEXT,
  status          TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('started','running','success','failed','dry_run')),
  dry_run         BOOLEAN NOT NULL DEFAULT FALSE,
  trigger_source  TEXT NOT NULL DEFAULT 'manual'
                  CHECK (trigger_source IN ('manual','scheduled','event_based','owner_confirmed','automation')),
  reason          TEXT NOT NULL,
  risk_level      TEXT NOT NULL DEFAULT 'medium'
                  CHECK (risk_level IN ('low','medium','high','critical')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INTEGER,
  step_results    JSONB NOT NULL DEFAULT '[]',
  audit_id        BIGINT REFERENCES audit_log(id) ON DELETE SET NULL,
  incident_id     UUID,
  deployment_id   UUID REFERENCES deployments(id) ON DELETE SET NULL,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_warp_executions_status
  ON warp_executions(status);
CREATE INDEX IF NOT EXISTS idx_warp_executions_actor
  ON warp_executions(actor_id);
CREATE INDEX IF NOT EXISTS idx_warp_executions_started
  ON warp_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_warp_executions_trigger_source
  ON warp_executions(trigger_source, started_at DESC);

-- ---------------------------------------------------------------------------
-- Automation Jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  category          TEXT NOT NULL DEFAULT 'maintenance',
  trigger           TEXT NOT NULL DEFAULT 'manual'
                    CHECK (trigger IN ('manual','scheduled','event_based','owner_confirmed')),
  schedule          TEXT,
  status            TEXT NOT NULL DEFAULT 'enabled'
                    CHECK (status IN ('enabled','disabled','running','failed')),
  risk_level        TEXT NOT NULL DEFAULT 'low'
                    CHECK (risk_level IN ('low','medium','high','critical')),
  runbook_id        UUID REFERENCES warp_runbooks(id) ON DELETE SET NULL,
  last_run_at       TIMESTAMPTZ,
  last_run_status   TEXT,
  next_run_at       TIMESTAMPTZ,
  retry_on_failure  BOOLEAN NOT NULL DEFAULT TRUE,
  max_retries       INTEGER NOT NULL DEFAULT 3,
  requires_confirm  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Commercial Offers (Source-of-Truth für OCC Commercial Decisions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commercial_offers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occ_decision_id           UUID UNIQUE REFERENCES occ_decisions(id) ON DELETE SET NULL,
  org_id                    UUID REFERENCES organizations(id) ON DELETE SET NULL,
  org_name                  TEXT,
  title                     TEXT,
  status                    TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','active','rejected','cancelled')),
  requested_users           INTEGER,
  requested_price_eur       INTEGER,
  current_price_eur         INTEGER,
  contract_duration_months  INTEGER,
  billing_cycle             TEXT,
  special_conditions        TEXT,
  revenue_impact_eur        INTEGER,
  source                    TEXT NOT NULL DEFAULT 'occ',
  approved_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commercial_offers_status
  ON commercial_offers(status, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Risk Signals (Source-of-Truth für OCC Risk)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_signals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area               TEXT NOT NULL,
  level              TEXT NOT NULL DEFAULT 'medium'
                     CHECK (level IN ('low','medium','high','critical')),
  title              TEXT NOT NULL,
  message            TEXT NOT NULL,
  entity_type        TEXT,
  entity_id          TEXT,
  source             TEXT,
  recommended_action TEXT,
  drilldown_path     TEXT,
  audit_id           BIGINT REFERENCES audit_log(id) ON DELETE SET NULL,
  decision_id        UUID REFERENCES occ_decisions(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_risk_signals_active
  ON risk_signals(level, created_at DESC)
  WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- Extend occ_decisions for full request model
-- ---------------------------------------------------------------------------
ALTER TABLE occ_decisions
  ADD COLUMN IF NOT EXISTS subtype                TEXT,
  ADD COLUMN IF NOT EXISTS priority               TEXT NOT NULL DEFAULT 'normal'
                                                  CHECK (priority IN ('urgent','high','normal','low')),
  ADD COLUMN IF NOT EXISTS source                 TEXT NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS user_id                UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_name           TEXT,
  ADD COLUMN IF NOT EXISTS contact_email          TEXT,
  ADD COLUMN IF NOT EXISTS summary                TEXT,
  ADD COLUMN IF NOT EXISTS details                TEXT,
  ADD COLUMN IF NOT EXISTS requested_action       TEXT,
  ADD COLUMN IF NOT EXISTS owner_review_required  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_decision_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS assigned_to            UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_deadline           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_outcome       TEXT,
  ADD COLUMN IF NOT EXISTS feature_context        JSONB,
  ADD COLUMN IF NOT EXISTS approval_context       JSONB,
  ADD COLUMN IF NOT EXISTS operational_context    JSONB,
  ADD COLUMN IF NOT EXISTS support_context        JSONB,
  ADD COLUMN IF NOT EXISTS related_entities       JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS sla_state              TEXT DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS tags                   TEXT[] NOT NULL DEFAULT '{}';

UPDATE occ_decisions
   SET status = 'waiting_for_owner_decision'
 WHERE status = 'pending';

UPDATE occ_decisions
   SET user_id = COALESCE(user_id, requestor_id),
       contact_email = COALESCE(contact_email, requestor_email),
       summary = COALESCE(summary, description)
 WHERE user_id IS NULL
    OR contact_email IS NULL
    OR summary IS NULL;

ALTER TABLE occ_decisions
  DROP CONSTRAINT IF EXISTS occ_decisions_status_check;

ALTER TABLE occ_decisions
  ADD CONSTRAINT occ_decisions_status_check CHECK (
    status IN (
      'new',
      'triaged',
      'waiting_for_owner_decision',
      'approved',
      'rejected',
      'deferred',
      'waiting_for_reply',
      'assigned',
      'closed',
      'cancelled'
    )
  );

ALTER TABLE occ_decisions
  ALTER COLUMN status SET DEFAULT 'waiting_for_owner_decision';

DROP INDEX IF EXISTS idx_occ_decisions_status;

CREATE INDEX IF NOT EXISTS idx_occ_decisions_status_pending_owner
  ON occ_decisions(status, created_at DESC)
  WHERE status = 'waiting_for_owner_decision';

CREATE INDEX IF NOT EXISTS idx_occ_decisions_type_status
  ON occ_decisions(type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_occ_decisions_priority_status
  ON occ_decisions(priority, status, created_at DESC);

COMMIT;
