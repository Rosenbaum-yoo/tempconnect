-- =============================================================================
-- Migration 083: Deal Agreement Flow
-- Erweitert offers um Agreement-Lifecycle (bindende Einsatzvereinbarung).
-- Erweitert emergency_provider_commitments um Sofortvereinbarungs-Brücke.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. offers: Agreement-Felder für bindenden Abschluss nach Verhandlung
-- ---------------------------------------------------------------------------
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS agreement_status TEXT
    CHECK (agreement_status IS NULL OR agreement_status IN (
      'none', 'agreement_created', 'pending_confirmation', 'confirmed', 'activated', 'cancelled', 'expired'
    ));

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS agreement_ref TEXT;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS agreement_snapshot JSONB;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS agreement_version INT NOT NULL DEFAULT 0;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS assignment_id UUID;

-- Default: alle bestehenden accepted offers erhalten 'none' als agreement_status
UPDATE offers SET agreement_status = 'none' WHERE agreement_status IS NULL;

COMMENT ON COLUMN offers.agreement_status IS 'Lifecycle: none → agreement_created → pending_confirmation → confirmed → activated';
COMMENT ON COLUMN offers.agreement_ref IS 'Eindeutige Referenznummer der Einsatzvereinbarung (z.B. EV-2026-000042)';
COMMENT ON COLUMN offers.agreement_snapshot IS 'Eingefrorener Konditions-Snapshot zum Zeitpunkt der Vereinbarungserstellung';
COMMENT ON COLUMN offers.confirmed_by IS 'User-ID der Gegenseite die die Vereinbarung bestätigt hat';
COMMENT ON COLUMN offers.confirmed_at IS 'Zeitpunkt der Gegenseitenbestätigung';
COMMENT ON COLUMN offers.activated_at IS 'Zeitpunkt der Aktivierung (= operativer Start)';
COMMENT ON COLUMN offers.assignment_id IS 'Verknüpfung zum erzeugten Assignment nach Aktivierung';

-- ---------------------------------------------------------------------------
-- 2. emergency_provider_commitments: Sofortvereinbarungs-Brücke
-- ---------------------------------------------------------------------------
ALTER TABLE emergency_provider_commitments
  ADD COLUMN IF NOT EXISTS agreement_offer_id UUID REFERENCES offers(id) ON DELETE SET NULL;

ALTER TABLE emergency_provider_commitments
  ADD COLUMN IF NOT EXISTS conditions_snapshot JSONB;

ALTER TABLE emergency_provider_commitments
  ADD COLUMN IF NOT EXISTS hourly_rate_cents INT;

ALTER TABLE emergency_provider_commitments
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;

ALTER TABLE emergency_provider_commitments
  ADD COLUMN IF NOT EXISTS response_time_minutes INT;

ALTER TABLE emergency_provider_commitments
  ADD COLUMN IF NOT EXISTS replacement_sla_minutes INT;

COMMENT ON COLUMN emergency_provider_commitments.agreement_offer_id IS 'Verknüpfung zu einem formellen Offer/Agreement (optional, für Sofortvereinbarung)';
COMMENT ON COLUMN emergency_provider_commitments.conditions_snapshot IS 'Strukturierte Sofortkonditionen als JSONB';
COMMENT ON COLUMN emergency_provider_commitments.hourly_rate_cents IS 'Angebotener Stundensatz in Cent';

-- ---------------------------------------------------------------------------
-- 3. Sequence für Agreement-Referenznummern
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS agreement_ref_seq START WITH 1;

-- ---------------------------------------------------------------------------
-- 4. Indices
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS offers_agreement_status_idx
  ON offers(agreement_status) WHERE agreement_status IS NOT NULL AND agreement_status != 'none';

CREATE INDEX IF NOT EXISTS emergency_commitments_agreement_idx
  ON emergency_provider_commitments(agreement_offer_id) WHERE agreement_offer_id IS NOT NULL;

COMMIT;
