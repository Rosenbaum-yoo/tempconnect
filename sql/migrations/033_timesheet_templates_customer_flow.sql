-- ==========================================================
-- Migration 033: Timesheet-Templates + Kundenfreigabe-Flow
--
-- Neue Tabellen:
--   timesheet_templates          — Template-Definitionen (Agentur-seitig)
--   timesheet_template_fields    — Konfigurierende Felder je Template
--   timesheet_template_assignments — Zuweisung Template ↔ Einsatz/Kunde
--
-- Erweiterungen:
--   worker_time_submissions      — Kundenflow-Spalten + erweitertes Status-Enum
-- ==========================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) worker_time_submissions — Kundenflow-Spalten ergänzen
-- ─────────────────────────────────────────────────────────────

-- Status-Constraint erweitern: sent_to_customer, customer_confirmed,
-- customer_rejected, posted_to_timesheet
ALTER TABLE worker_time_submissions
  DROP CONSTRAINT IF EXISTS worker_time_submissions_status_check;

ALTER TABLE worker_time_submissions
  ADD CONSTRAINT worker_time_submissions_status_check
  CHECK (status = ANY (ARRAY[
    'draft',
    'submitted',
    'under_review',
    'needs_correction',
    'approved_internal',
    'sent_to_customer',
    'customer_confirmed',
    'customer_rejected',
    'rejected',
    'posted_to_timesheet',
    'accepted_into_timesheet',  -- Legacy-Kompatibilität
    'superseded'
  ]));

-- Kundenflow-Spalten
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS approved_internal_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_internal_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_to_customer_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_to_customer_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS customer_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_confirmed_by  TEXT,        -- Name des Kundenkontakts (extern, kein FK)
  ADD COLUMN IF NOT EXISTS customer_rejected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_note          TEXT,        -- Rückmeldung Einsatzunternehmen
  ADD COLUMN IF NOT EXISTS posted_to_timesheet_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_to_timesheet_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id            UUID;        -- FK wird nach Tabellenerstellung gesetzt

-- Neuer Event-Type für Kundenflow
ALTER TABLE worker_submission_events
  DROP CONSTRAINT IF EXISTS worker_submission_events_event_type_check;

ALTER TABLE worker_submission_events
  ADD CONSTRAINT worker_submission_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'created', 'submitted', 'review_started', 'correction_requested',
    'corrected', 'approved_internal', 'sent_to_customer',
    'customer_confirmed', 'customer_rejected',
    'accepted', 'rejected', 'posted_to_timesheet',
    'superseded', 'comment_added'
  ]));

-- ─────────────────────────────────────────────────────────────
-- 2) timesheet_templates — Template-Definitionen
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheet_templates (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_org_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name             TEXT        NOT NULL,               -- z.B. "Standardwoche Logistik"
  description      TEXT,
  template_type    TEXT        NOT NULL DEFAULT 'weekly'
                   CHECK (template_type IN ('daily', 'weekly')),

  -- Standardwerte (werden als Vorbelegung an den Worker gesendet)
  default_shift_start   TIME,
  default_shift_end     TIME,
  default_break_minutes SMALLINT DEFAULT 30,
  default_hours_per_day NUMERIC(4,2) DEFAULT 8.0,

  -- Optionale Felder aktivieren/deaktivieren
  show_overtime         BOOLEAN NOT NULL DEFAULT TRUE,
  show_night_surcharge  BOOLEAN NOT NULL DEFAULT FALSE,  -- Nachtzuschlag
  show_sunday_surcharge BOOLEAN NOT NULL DEFAULT FALSE,  -- Sonntagszuschlag
  show_holiday_surcharge BOOLEAN NOT NULL DEFAULT FALSE, -- Feiertagszuschlag
  show_activity         BOOLEAN NOT NULL DEFAULT FALSE,  -- Tätigkeit/Kostenstelle
  show_cost_center      BOOLEAN NOT NULL DEFAULT FALSE,
  show_customer_sign    BOOLEAN NOT NULL DEFAULT FALSE,  -- Unterschrift Ansprechpartner

  -- Pflichtfelder
  require_shift_times   BOOLEAN NOT NULL DEFAULT TRUE,
  require_break         BOOLEAN NOT NULL DEFAULT TRUE,
  require_notes         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Status
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  version               INTEGER NOT NULL DEFAULT 1,

  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tt_supplier_active_idx
  ON timesheet_templates(supplier_org_id, is_active);

-- ─────────────────────────────────────────────────────────────
-- 3) timesheet_template_fields — individuelle Feldkonfiguration
--    (für spätere Erweiterung: Custom-Felder pro Template)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheet_template_fields (
  id           UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id  UUID    NOT NULL REFERENCES timesheet_templates(id) ON DELETE CASCADE,
  field_key    TEXT    NOT NULL,  -- z.B. 'activity', 'cost_center', 'note'
  field_label  TEXT    NOT NULL,
  field_type   TEXT    NOT NULL DEFAULT 'text'
               CHECK (field_type IN ('text','number','time','boolean','select')),
  is_required  BOOLEAN NOT NULL DEFAULT FALSE,
  default_value TEXT,
  options      JSONB,             -- für select-Felder
  sort_order   SMALLINT DEFAULT 0,
  UNIQUE (template_id, field_key)
);

-- ─────────────────────────────────────────────────────────────
-- 4) timesheet_template_assignments — Zuweisung Template ↔ Einsatz/Kunde
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timesheet_template_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id     UUID NOT NULL REFERENCES timesheet_templates(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Zuweisung kann auf verschiedenen Ebenen erfolgen (exklusiv)
  assignment_id   UUID REFERENCES assignments(id) ON DELETE CASCADE,   -- spezifischer Einsatz
  org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE, -- ganzer Kunde
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,  -- Fallback wenn kein spezifischeres passt

  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Nur eine Zuweisung pro Einsatz
  CONSTRAINT tta_unique_assignment UNIQUE NULLS NOT DISTINCT (assignment_id, template_id)
);

CREATE INDEX IF NOT EXISTS tta_assignment_idx ON timesheet_template_assignments(assignment_id);
CREATE INDEX IF NOT EXISTS tta_supplier_default_idx ON timesheet_template_assignments(supplier_org_id, is_default);

-- ─────────────────────────────────────────────────────────────
-- 5) FK nachsetzen: worker_time_submissions.template_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE worker_time_submissions
  ADD CONSTRAINT wts_template_fk
  FOREIGN KEY (template_id) REFERENCES timesheet_templates(id) ON DELETE SET NULL;

-- Indizes für Kundenflow-Abfragen
CREATE INDEX IF NOT EXISTS wts_sent_to_customer_idx
  ON worker_time_submissions(supplier_org_id, sent_to_customer_at)
  WHERE sent_to_customer_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS wts_customer_confirmed_idx
  ON worker_time_submissions(supplier_org_id, customer_confirmed_at)
  WHERE customer_confirmed_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 6) Standardtemplate für bestehende Orgs (keine automatische
--    Zuweisung — nur Vorlage als Default)
-- ─────────────────────────────────────────────────────────────
-- Wird per Anwendungscode beim ersten Login der Agentur erzeugt.
-- Kein Seed hier, da supplier_org_id unbekannt.

COMMIT;
