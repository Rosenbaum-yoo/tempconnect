-- =============================================================================
-- Migration 034: Worker Assignment Confirmation + Capacity-Post-Herkunft
-- Erweitert worker_assignment_links um Bestätigungsstatus (Worker kann
-- zugewiesene Einsätze bestätigen/ablehnen) und Kapazitätsherkunft.
-- Keine Breaking Changes. Alle neuen Spalten sind NULLABLE mit DEFAULT.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. worker_assignment_links: Bestätigungs-Status
-- ---------------------------------------------------------------------------
-- Default 'auto_confirmed' = rückwärtskompatibel für bestehende Datensätze
ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS worker_confirmation_status TEXT
    NOT NULL DEFAULT 'auto_confirmed'
    CHECK (worker_confirmation_status = ANY (ARRAY[
      'auto_confirmed',          -- Disponent hat direkt zugewiesen (kein Worker-Confirm nötig)
      'pending_confirmation',    -- Worker muss bestätigen
      'worker_confirmed',        -- Worker hat bestätigt
      'worker_declined'          -- Worker hat abgelehnt
    ]));

ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS worker_declined_reason TEXT;

ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS worker_confirmed_at TIMESTAMPTZ;

ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS worker_declined_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. worker_assignment_links: Kapazitätsherkunft (FK zu capacity_posts)
-- ---------------------------------------------------------------------------
ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS capacity_post_id UUID
    REFERENCES capacity_posts(id) ON DELETE SET NULL;

-- Index für Lookup: welche Kapazitätsangebote wurden schon zugewiesen?
CREATE INDEX IF NOT EXISTS wal_capacity_post_idx
  ON worker_assignment_links(capacity_post_id) WHERE capacity_post_id IS NOT NULL;

-- Index für Bestätigungsstatus-Queries (z.B. offene Bestätigungen eines Workers)
CREATE INDEX IF NOT EXISTS wal_confirmation_status_idx
  ON worker_assignment_links(worker_user_id, worker_confirmation_status)
  WHERE worker_confirmation_status = 'pending_confirmation';

-- ---------------------------------------------------------------------------
-- 3. worker_submission_events: Neue Event-Typen für erweiterten Review-Flow
-- ---------------------------------------------------------------------------
ALTER TABLE worker_submission_events
  DROP CONSTRAINT IF EXISTS worker_submission_events_event_type_check;

ALTER TABLE worker_submission_events
  ADD CONSTRAINT worker_submission_events_event_type_check CHECK (
    event_type = ANY (ARRAY[
      -- bestehende Typen
      'created','submitted','review_started','correction_requested',
      'corrected','accepted','rejected','superseded','comment_added',
      -- neue Typen für erweiterten Flow
      'approved_internal','sent_to_customer',
      'customer_confirmed','customer_rejected','posted_to_timesheet'
    ])
  );

-- ---------------------------------------------------------------------------
-- 4. worker_time_submissions: Erweiterte Status für Kundenfreigabe-Flow
-- ---------------------------------------------------------------------------
ALTER TABLE worker_time_submissions
  DROP CONSTRAINT IF EXISTS worker_time_submissions_status_check;

ALTER TABLE worker_time_submissions
  ADD CONSTRAINT worker_time_submissions_status_check CHECK (
    status = ANY (ARRAY[
      -- bestehende Status
      'draft','submitted','under_review',
      'needs_correction','accepted_into_timesheet',
      'rejected','superseded',
      -- neue Status für Kundenfreigabe-Pipeline
      'approved_internal',       -- intern geprüft
      'sent_to_customer',        -- an Kunden gesendet
      'customer_confirmed',      -- Kunde hat bestätigt
      'customer_rejected',       -- Kunde hat abgelehnt
      'posted_to_timesheet'      -- in Abrechnung gebucht
    ])
  );

-- Neue Spalten für Kundenfreigabe
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS approved_internal_at   TIMESTAMPTZ;
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS approved_internal_by   UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS sent_to_customer_at    TIMESTAMPTZ;
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS customer_contact_name  TEXT;
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS customer_contact_email TEXT;
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS customer_confirmed_at  TIMESTAMPTZ;
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS customer_confirmed_by  TEXT;  -- freitext: Name Ansprechpartner Kunde
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS customer_rejected_at   TIMESTAMPTZ;
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS customer_note          TEXT;
ALTER TABLE worker_time_submissions
  ADD COLUMN IF NOT EXISTS posted_to_timesheet_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 5. notifications: Neue Worker-Typen für Einsatzbestätigung
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
      -- bestehende Enterprise-Typen
      'requisition_approval','requisition_filled','requisition_cancelled',
      'offer_received','offer_accepted','offer_rejected',
      'compliance_expiring','compliance_expired','compliance_verified',
      'sla_warning','sla_breached',
      'vendor_pool_change','vendor_pool_blocked',
      'capacity_interest','capacity_expiring','capacity_match','capacity_stale',
      'deal_confirmed','deal_assignment_started','deal_completed',
      'supplier_invited','supplier_reputation_updated',
      'distribution_stage_advanced',
      'general','system',
      -- bestehende Worker-Typen
      'worker_assignment_new','worker_assignment_changed',
      'worker_submission_correction_requested',
      'worker_submission_accepted','worker_submission_rejected',
      'worker_shift_reminder',
      -- neue Typen für Einsatzbestätigung
      'worker_assignment_pending_confirmation',
      'worker_assignment_confirmed',
      'worker_assignment_declined'
    ])
  );

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '034_worker_assignment_confirmation.sql: Migration erfolgreich angewendet.';
END $$;
