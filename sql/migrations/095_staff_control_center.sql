-- 095_staff_control_center.sql
-- Staff Control Center (SCC) — interne TempConnect-Steuerzentrale
-- ausschliesslich fuer das TempConnect-Betriebsteam (Elmira + Mitarbeiter).
-- NICHT fuer Abo-Kunden, NICHT fuer Org-Owner, NICHT fuer normale Plattform-Admins.
-- Getrennt vom normalen audit_log / RBAC / admin_panel / internal_control_center.

BEGIN;

-- ───────────────────────────────────────────────────────────────
-- Cleanup: pre-release owner-prefixed Tabellen aus Dev-Iterationen
-- (nur wirksam wenn sie lokal entstanden sind; auf Produktionsclustern no-op).
-- ───────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS owner_control_runbook_runs CASCADE;
DROP TABLE IF EXISTS owner_control_runbooks CASCADE;
DROP TABLE IF EXISTS owner_control_audit_log CASCADE;
DROP TABLE IF EXISTS owner_control_decisions CASCADE;
DROP TABLE IF EXISTS owner_control_feature_flags CASCADE;
DROP TABLE IF EXISTS tempconnect_owners CASCADE;

-- ───────────────────────────────────────────────────────────────
-- tempconnect_staff
-- Harte Allowlist: nur hier eingetragene User sind SCC-berechtigt.
-- Wird NIE ueber normale RBAC vergeben. Initiale Mitglieder per
-- ENV STAFF_USER_IDS (Komma-separierte UUIDs).
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tempconnect_staff (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  email             TEXT NOT NULL,
  display_name      TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  requires_step_up  BOOLEAN NOT NULL DEFAULT TRUE,
  totp_secret_hash  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES users(id),
  revoked_at        TIMESTAMPTZ,
  revoked_by        UUID REFERENCES users(id),
  last_access_at    TIMESTAMPTZ,
  notes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_tempconnect_staff_is_active
  ON tempconnect_staff(is_active) WHERE is_active = TRUE;

-- ───────────────────────────────────────────────────────────────
-- staff_control_audit_log
-- Getrennter Audit-Namespace "staff_control.*". Schreibpflicht
-- fuer jede mutierende SCC-Aktion.
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_control_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  area            TEXT NOT NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'ok',
  reason          TEXT,
  confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
  risk_level      TEXT NOT NULL DEFAULT 'low',
  step_up_at      TIMESTAMPTZ,
  ip              TEXT,
  user_agent      TEXT,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_staff_audit_actor_created
  ON staff_control_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_audit_area_action
  ON staff_control_audit_log(area, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_audit_risk_level
  ON staff_control_audit_log(risk_level, created_at DESC) WHERE risk_level IN ('high','critical');

-- ───────────────────────────────────────────────────────────────
-- staff_control_runbooks + runs
-- Deklarative Runbooks (JSON-Steps), KEINE beliebige Code-Ausfuehrung.
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_control_runbooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  steps           JSONB NOT NULL,
  risk_level      TEXT NOT NULL DEFAULT 'low',
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  requires_confirm BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_runbooks_key ON staff_control_runbooks(key);

CREATE TABLE IF NOT EXISTS staff_control_runbook_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runbook_id        UUID NOT NULL REFERENCES staff_control_runbooks(id) ON DELETE RESTRICT,
  runbook_key       TEXT NOT NULL,
  runbook_version   INTEGER NOT NULL,
  actor_id          UUID REFERENCES users(id),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'running',
  step_results      JSONB NOT NULL DEFAULT '[]'::jsonb,
  rollback_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  reason            TEXT,
  details           JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_staff_runbook_runs_started
  ON staff_control_runbook_runs(started_at DESC);

-- ───────────────────────────────────────────────────────────────
-- staff_control_decisions
-- Strategische Team-Entscheidungen mit Reversibilitaet + Begruendung.
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_control_decisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  decision              TEXT NOT NULL,
  reason                TEXT,
  confirmed_by          UUID NOT NULL REFERENCES users(id),
  confirmed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversible            BOOLEAN NOT NULL DEFAULT TRUE,
  reverted_at           TIMESTAMPTZ,
  reverted_by           UUID REFERENCES users(id),
  linked_entity_type    TEXT,
  linked_entity_id      TEXT,
  details               JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_staff_decisions_area_conf
  ON staff_control_decisions(area, confirmed_at DESC);

-- ───────────────────────────────────────────────────────────────
-- staff_control_feature_flags
-- Globale Kill-Switches / Maintenance-Modes.
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_control_feature_flags (
  flag_key        TEXT PRIMARY KEY,
  is_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  description     TEXT,
  risk_level      TEXT NOT NULL DEFAULT 'medium',
  updated_by      UUID REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT
);
INSERT INTO staff_control_feature_flags (flag_key, description, risk_level) VALUES
  ('platform.read_only_mode',     'Gesamtplattform auf read-only schalten (keine Writes).', 'critical'),
  ('platform.maintenance_banner', 'Global sichtbares Wartungs-Banner anzeigen.', 'low'),
  ('marketplace.new_offers_off',  'Neue Angebote marktweit deaktivieren.', 'high'),
  ('notdienst.force_manual',      'Notdienst-Auto-Match deaktiviert, rein manuell.', 'high'),
  ('registration.disabled',       'Neue Registrierungen deaktiviert.', 'medium')
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
