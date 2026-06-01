-- =============================================================================
-- 027_timesheets.sql – Stundenzettel / Timesheet-Modul
-- =============================================================================
-- Baut auf assignments auf. Zugriff nur fuer PRO / ENTERPRISE Plaene.
-- Statusmodell: draft -> submitted -> approved | rejected | cancelled
-- =============================================================================

-- Haupt-Timesheet-Tabelle (Wochenstundenzettel pro Worker + Assignment)
CREATE TABLE IF NOT EXISTS timesheets (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Org-Scoping: Kundenorg + Lieferantenorg
  org_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Verknuepfung zu Assignment (FK, nullable fuer Legacy-Kompatibilitaet)
  assignment_id     UUID        REFERENCES assignments(id) ON DELETE SET NULL,

  -- Worker-Identifikation
  worker_name       TEXT        NOT NULL,
  worker_identifier TEXT,                            -- Personalnum. / externe ID, optional

  -- Abrechnungszeitraum
  week_start        DATE        NOT NULL,
  week_end          DATE        NOT NULL,

  -- Stunden (serverseitig aus timesheet_entries berechnet/validiert)
  total_hours       NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (total_hours >= 0),
  overtime_hours    NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),

  -- Lifecycle-Status
  status            TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','submitted','approved','rejected','cancelled')),

  -- Einreichung
  submitted_at      TIMESTAMPTZ,
  submitted_by      UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- Freigabe
  approved_at       TIMESTAMPTZ,
  approved_by       UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- Ablehnung
  rejected_at       TIMESTAMPTZ,
  rejected_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason  TEXT,

  -- Stornierung
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- Allgemein
  notes             TEXT,
  created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Kein doppelter Stundenzettel fuer dieselbe Woche + Worker + Org
  CONSTRAINT timesheets_unique_week_worker
    UNIQUE NULLS NOT DISTINCT (org_id, supplier_org_id, assignment_id, worker_identifier, week_start)
);

-- Tages-Eintraege pro Timesheet
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id    UUID        NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,

  work_date       DATE        NOT NULL,
  hours_regular   NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (hours_regular   >= 0 AND hours_regular   <= 24),
  hours_overtime  NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (hours_overtime  >= 0 AND hours_overtime  <= 24),
  break_minutes   INT          NOT NULL DEFAULT 0 CHECK (break_minutes   >= 0),

  shift_start     TIME,
  shift_end       TIME,

  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Nur ein Eintrag pro Tag pro Stundenzettel
  CONSTRAINT timesheet_entries_unique_date UNIQUE (timesheet_id, work_date)
);

-- Indizes fuer haeufige Abfragen
CREATE INDEX IF NOT EXISTS timesheets_org_status_idx
  ON timesheets (org_id, status, week_start DESC);

CREATE INDEX IF NOT EXISTS timesheets_supplier_status_idx
  ON timesheets (supplier_org_id, status, week_start DESC);

CREATE INDEX IF NOT EXISTS timesheets_assignment_idx
  ON timesheets (assignment_id, week_start DESC);

CREATE INDEX IF NOT EXISTS timesheets_status_idx
  ON timesheets (status, created_at DESC);

CREATE INDEX IF NOT EXISTS timesheet_entries_sheet_date_idx
  ON timesheet_entries (timesheet_id, work_date ASC);
