-- =============================================================================
-- Migration 031: Einsatzportal — Worker-Experience Upgrade
-- Keine Breaking Changes. Alle neuen Spalten sind NULLABLE mit DEFAULT.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. worker_assignment_links: Anzeige- und Kontaktfelder für das Einsatzportal
-- ---------------------------------------------------------------------------
ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS client_name       TEXT,          -- sichtbarer Kundenname (ggf. anonymisiert)
  ADD COLUMN IF NOT EXISTS location_address  TEXT,          -- Einsatzadresse (Straße, PLZ, Ort)
  ADD COLUMN IF NOT EXISTS location_lat      NUMERIC(10,7), -- optional für Karten-CTA
  ADD COLUMN IF NOT EXISTS location_lng      NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS meeting_point     TEXT,          -- "Haupteingang, Pforte B, ..."
  ADD COLUMN IF NOT EXISTS instructions      TEXT,          -- allgemeine Einsatzanweisungen
  ADD COLUMN IF NOT EXISTS dress_code        TEXT,          -- "Sicherheitsschuhe, Warnweste, ..."
  ADD COLUMN IF NOT EXISTS contact_name      TEXT,          -- Ansprechpartner vor Ort
  ADD COLUMN IF NOT EXISTS contact_phone     TEXT,
  ADD COLUMN IF NOT EXISTS contact_email     TEXT,
  ADD COLUMN IF NOT EXISTS dispatcher_name   TEXT,          -- zuständiger Disponent
  ADD COLUMN IF NOT EXISTS dispatcher_phone  TEXT,
  ADD COLUMN IF NOT EXISTS dispatcher_email  TEXT;

-- ---------------------------------------------------------------------------
-- 2. notifications: link_path für Deep-Links + Worker-Notification-Typen
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link_path TEXT;  -- z.B. "/einsatzportal-stundenzettel.html?id=..."

-- CHECK-Constraint erweitern: Worker-Typen hinzufügen
-- PostgreSQL erfordert DROP + ADD
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
      -- bestehende Enterprise-Typen
      'requisition_approval',
      'requisition_filled',
      'requisition_cancelled',
      'offer_received',
      'offer_accepted',
      'offer_rejected',
      'compliance_expiring',
      'compliance_expired',
      'compliance_verified',
      'sla_warning',
      'sla_breached',
      'vendor_pool_change',
      'vendor_pool_blocked',
      'capacity_interest',
      'capacity_expiring',
      'capacity_match',
      'capacity_stale',
      'deal_confirmed',
      'deal_assignment_started',
      'deal_completed',
      'supplier_invited',
      'supplier_reputation_updated',
      'distribution_stage_advanced',
      'general',
      'system',
      -- neue Worker-Typen
      'worker_assignment_new',
      'worker_assignment_changed',
      'worker_submission_correction_requested',
      'worker_submission_accepted',
      'worker_submission_rejected',
      'worker_shift_reminder'
    ])
  );

-- ---------------------------------------------------------------------------
-- 3. Demo-Daten: Assignment-Links mit Einsatzportal-Feldern befüllen
--    (nur wenn die Demo-Links existieren, idempotent)
-- ---------------------------------------------------------------------------
UPDATE worker_assignment_links
SET
  client_name      = 'Mustermann Logistik GmbH',
  location_address = 'Musterstraße 12, 50667 Köln',
  meeting_point    = 'Haupteingang Tor A – bitte Personalausweis mitbringen',
  instructions     = 'Bitte 10 Minuten vor Schichtbeginn erscheinen. Arbeitsmittel werden vor Ort gestellt. Bei Fragen direkt an den Einsatzleiter wenden.',
  dress_code       = 'Sicherheitsschuhe (Stahlkappe) und Warnweste erforderlich. Wird bei Ersteinweisung ausgegeben.',
  contact_name     = 'Thomas Berger',
  contact_phone    = '+49 221 1234567',
  contact_email    = 'thomas.berger@mustermann-logistik.de',
  dispatcher_name  = 'Sandra Meier',
  dispatcher_phone = '+49 30 9876543',
  dispatcher_email = 'sandra.meier@demo-zeitarbeit.de'
WHERE org_id = 'aaaa0001-0000-0000-0000-000000000001'
  AND supplier_org_id = 'bbbb0001-0000-0000-0000-000000000001'
  AND client_name IS NULL;

-- Migration abgeschlossen
DO $$ BEGIN
  RAISE NOTICE '031_einsatzportal.sql: Migration erfolgreich angewendet.';
END $$;
