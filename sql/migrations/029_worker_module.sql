-- ==========================================================
-- Migration 029: Worker Self-Service Modul
-- Erweiterung: users.role + org_memberships.role_key um 'worker'
-- Neue Tabellen: worker_profiles, worker_invites,
--   worker_assignment_links, worker_time_submissions,
--   worker_time_submission_entries, worker_submission_events,
--   billing_usage_metrics, worker_billing_snapshots, plan_usage_rules
-- ==========================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) CHECK-Erweiterungen
-- ─────────────────────────────────────────────────────────────

-- users.role: company | agency | worker
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['company'::text, 'agency'::text, 'worker'::text]));

-- org_memberships.role_key: bestehende Rollen + worker
ALTER TABLE org_memberships DROP CONSTRAINT org_memberships_role_key_check;
ALTER TABLE org_memberships ADD CONSTRAINT org_memberships_role_key_check
  CHECK (role_key = ANY (ARRAY[
    'owner','admin','program_manager','hiring_manager',
    'supplier_manager','finance','member','supplier_user',
    'platform_admin','recruiter','dispatcher','viewer','worker'
  ]));

-- ─────────────────────────────────────────────────────────────
-- 2) worker_profiles  — personenbezogene Daten der Arbeitnehmer
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_profiles (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  supplier_org_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name        TEXT        NOT NULL,
  last_name         TEXT        NOT NULL,
  personnel_number  TEXT,                        -- interne Personalnummer der Zeitarbeitsfirma
  phone             TEXT,
  street            TEXT,
  postal_code       TEXT,
  city              TEXT,
  country           TEXT        NOT NULL DEFAULT 'DE',
  date_of_birth     DATE,
  iban_last4        TEXT,                        -- letzte 4 Stellen IBAN (kein Vollspeicher)
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  preferred_locale  TEXT        NOT NULL DEFAULT 'de',
  notes             TEXT,                        -- interne Notizen der Zeitarbeitsfirma
  created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS worker_profiles_supplier_idx
  ON worker_profiles(supplier_org_id, is_active);
CREATE INDEX IF NOT EXISTS worker_profiles_user_idx
  ON worker_profiles(user_id);

-- ─────────────────────────────────────────────────────────────
-- 3) worker_invites  — Einladungstoken-System für Arbeitnehmer
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_invites (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_org_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  first_name      TEXT        NOT NULL,
  last_name       TEXT        NOT NULL,
  personnel_number TEXT,
  token           TEXT        NOT NULL UNIQUE,   -- crypto-secure 48 Byte hex
  token_hash      TEXT        NOT NULL,          -- SHA-256 Hash des Tokens
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  worker_user_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status = ANY (ARRAY['pending','accepted','expired','revoked'])),
  resend_count    SMALLINT    NOT NULL DEFAULT 0,
  last_sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS worker_invites_supplier_status_idx
  ON worker_invites(supplier_org_id, status);
CREATE INDEX IF NOT EXISTS worker_invites_email_idx
  ON worker_invites(email);
CREATE INDEX IF NOT EXISTS worker_invites_token_hash_idx
  ON worker_invites(token_hash);

-- ─────────────────────────────────────────────────────────────
-- 4) worker_assignment_links  — Zuweisung Arbeitnehmer ↔ Einsatz
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_assignment_links (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id    UUID        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  org_id           UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL DEFAULT 'primary'
                   CHECK (role = ANY (ARRAY['primary','backup'])),
  -- Erwartetes Schichtmodell (optional, für Vorbelegung)
  default_hours_per_day  NUMERIC(4,2)  DEFAULT 8.0,
  default_shift_start    TIME,
  default_shift_end      TIME,
  default_break_minutes  SMALLINT      DEFAULT 30,
  start_date       DATE        NOT NULL,
  end_date         DATE,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_user_id, assignment_id)
);

CREATE INDEX IF NOT EXISTS wal_worker_active_idx
  ON worker_assignment_links(worker_user_id, is_active);
CREATE INDEX IF NOT EXISTS wal_assignment_idx
  ON worker_assignment_links(assignment_id);
CREATE INDEX IF NOT EXISTS wal_supplier_idx
  ON worker_assignment_links(supplier_org_id, is_active);

-- ─────────────────────────────────────────────────────────────
-- 5) worker_time_submissions  — Einreichungen (Input-Layer)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_time_submissions (
  id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_assignment_link_id UUID     REFERENCES worker_assignment_links(id) ON DELETE SET NULL,
  org_id                 UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assignment_id          UUID        REFERENCES assignments(id) ON DELETE SET NULL,
  week_start             DATE        NOT NULL,
  week_end               DATE        NOT NULL,
  total_hours            NUMERIC(6,2) NOT NULL DEFAULT 0
                         CHECK (total_hours >= 0),
  overtime_hours         NUMERIC(6,2) NOT NULL DEFAULT 0
                         CHECK (overtime_hours >= 0),
  status                 TEXT        NOT NULL DEFAULT 'draft'
                         CHECK (status = ANY (ARRAY[
                           'draft','submitted','under_review',
                           'needs_correction','accepted_into_timesheet',
                           'rejected','superseded'
                         ])),
  worker_comment         TEXT,
  reviewer_comment       TEXT,
  correction_note        TEXT,                  -- Hinweis bei needs_correction
  timesheet_id           UUID        REFERENCES timesheets(id) ON DELETE SET NULL,
  submitted_at           TIMESTAMPTZ,
  submitted_by           UUID        REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at            TIMESTAMPTZ,
  reviewed_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  accepted_at            TIMESTAMPTZ,
  accepted_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  rejected_at            TIMESTAMPTZ,
  rejected_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Einzigartige Einreichung pro Worker/Assignment/Woche
  CONSTRAINT wts_unique_week UNIQUE NULLS NOT DISTINCT (worker_user_id, assignment_id, week_start)
);

CREATE INDEX IF NOT EXISTS wts_worker_status_idx
  ON worker_time_submissions(worker_user_id, status, week_start DESC);
CREATE INDEX IF NOT EXISTS wts_supplier_status_idx
  ON worker_time_submissions(supplier_org_id, status, week_start DESC);
CREATE INDEX IF NOT EXISTS wts_org_status_idx
  ON worker_time_submissions(org_id, status, week_start DESC);
CREATE INDEX IF NOT EXISTS wts_assignment_idx
  ON worker_time_submissions(assignment_id, week_start DESC);
CREATE INDEX IF NOT EXISTS wts_reviewed_by_idx
  ON worker_time_submissions(reviewed_by) WHERE reviewed_by IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 6) worker_time_submission_entries  — Tageseinträge
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_time_submission_entries (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id   UUID        NOT NULL REFERENCES worker_time_submissions(id) ON DELETE CASCADE,
  work_date       DATE        NOT NULL,
  hours_regular   NUMERIC(4,2) NOT NULL DEFAULT 0
                  CHECK (hours_regular >= 0 AND hours_regular <= 24),
  hours_overtime  NUMERIC(4,2) NOT NULL DEFAULT 0
                  CHECK (hours_overtime >= 0 AND hours_overtime <= 24),
  break_minutes   SMALLINT    NOT NULL DEFAULT 0
                  CHECK (break_minutes >= 0),
  shift_start     TIME,
  shift_end       TIME,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, work_date)
);

CREATE INDEX IF NOT EXISTS wtse_submission_idx
  ON worker_time_submission_entries(submission_id, work_date);

-- ─────────────────────────────────────────────────────────────
-- 7) worker_submission_events  — Audit-Trail / Statushistorie
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_submission_events (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID        NOT NULL REFERENCES worker_time_submissions(id) ON DELETE CASCADE,
  actor_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type    TEXT        NOT NULL
                CHECK (event_type = ANY (ARRAY[
                  'created','submitted','review_started','correction_requested',
                  'corrected','accepted','rejected','superseded','comment_added'
                ])),
  note          TEXT,
  meta          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wse_submission_idx
  ON worker_submission_events(submission_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 8) billing_usage_metrics  — abrechnungsrelevante Metriken
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_usage_metrics (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_date DATE        NOT NULL,
  metric_type TEXT        NOT NULL
              CHECK (metric_type = ANY (ARRAY[
                'active_workers','active_assignments','worker_seats',
                'submitted_timesheets','approved_timesheets'
              ])),
  value       INTEGER     NOT NULL DEFAULT 0
              CHECK (value >= 0),
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, metric_date, metric_type)
);

CREATE INDEX IF NOT EXISTS bum_org_date_idx
  ON billing_usage_metrics(org_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS bum_type_date_idx
  ON billing_usage_metrics(metric_type, metric_date DESC);

-- ─────────────────────────────────────────────────────────────
-- 9) worker_billing_snapshots  — monatliche Worker-Seat-Snapshots
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_billing_snapshots (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_month  TEXT        NOT NULL,    -- YYYY-MM
  active_workers  INTEGER     NOT NULL DEFAULT 0,
  active_seats    INTEGER     NOT NULL DEFAULT 0,
  submitted_ts    INTEGER     NOT NULL DEFAULT 0,   -- eingereichte Timesheets
  approved_ts     INTEGER     NOT NULL DEFAULT 0,
  plan            TEXT,
  billing_note    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, snapshot_month)
);

CREATE INDEX IF NOT EXISTS wbs_org_month_idx
  ON worker_billing_snapshots(org_id, snapshot_month DESC);

-- ─────────────────────────────────────────────────────────────
-- 10) plan_usage_rules  — konfigurierbare Staffellogik
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_usage_rules (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan            TEXT        NOT NULL,
  metric_type     TEXT        NOT NULL,
  included_units  INTEGER     NOT NULL DEFAULT 0,   -- inkludierte Einheiten
  overage_price_cents INTEGER DEFAULT NULL,         -- Preis je zusätzliche Einheit
  max_units       INTEGER     DEFAULT NULL,         -- hard limit (NULL = unlimitiert)
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan, metric_type)
);

-- Standardregeln eintragen
INSERT INTO plan_usage_rules (plan, metric_type, included_units, max_units, notes) VALUES
  ('PLUS',      'active_workers',       25,  100, 'PLUS: bis 25 Worker inklusive, max 100'),
  ('NOTDIENST', 'active_workers',       -1, NULL, 'NOTDIENST: unlimitierte Worker'),
  ('PLUS',      'worker_seats',         25,  100, 'PLUS: bis 25 aktive Seats'),
  ('NOTDIENST', 'worker_seats',         -1, NULL, 'NOTDIENST: unlimitierte Seats'),
  ('PLUS',      'submitted_timesheets', -1, NULL, 'Keine Limits für Einreichungen'),
  ('NOTDIENST', 'submitted_timesheets', -1, NULL, 'Keine Limits für Einreichungen')
ON CONFLICT (plan, metric_type) DO NOTHING;

COMMIT;
