-- =============================================================================
-- Migration 085: INDIVIDUELL Commercial Truth Model
-- Ziel:
--   - Kommerzielle Preisquelle für INDIVIDUELL sauber modellieren
--   - KPI-Wahrheit (contract/pilot/pending) ermöglichen
--   - Plan-Checks für subscriptions/organizations/invoices kompatibel halten
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Organizations: Vertrags-/Preiswahrheit (inkl. Drift-Recovery aus 074)
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_mode TEXT
    NOT NULL DEFAULT 'standard_catalog'
    CHECK (billing_mode IN ('standard_catalog', 'pilot_contract', 'individual_contract'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS target_plan_after_pilot TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS company_size_class TEXT
    CHECK (company_size_class IS NULL OR company_size_class IN ('I', 'II', 'III', 'IV'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS employee_count_approx INT
    CHECK (employee_count_approx IS NULL OR employee_count_approx >= 0);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS individual_contract_note TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS individual_contract_price_cents INT
    CHECK (individual_contract_price_cents IS NULL OR individual_contract_price_cents >= 0);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS pilot_price_cents INT
    CHECK (pilot_price_cents IS NULL OR pilot_price_cents >= 0);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS custom_quote_pending BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN organizations.billing_mode IS 'Abrechnungsmodus: standard_catalog, pilot_contract, individual_contract';
COMMENT ON COLUMN organizations.individual_contract_price_cents IS 'Monatlicher Vertragspreis netto in Cent fuer individual_contract';
COMMENT ON COLUMN organizations.pilot_price_cents IS 'Monatlicher Pilotpreis netto in Cent fuer pilot_contract';
COMMENT ON COLUMN organizations.custom_quote_pending IS 'TRUE wenn kein finaler Preis vertraglich freigegeben ist (Angebot offen)';

CREATE INDEX IF NOT EXISTS organizations_contract_price_idx
  ON organizations(individual_contract_price_cents)
  WHERE individual_contract_price_cents IS NOT NULL;

CREATE INDEX IF NOT EXISTS organizations_pilot_price_idx
  ON organizations(pilot_price_cents)
  WHERE pilot_price_cents IS NOT NULL;

CREATE INDEX IF NOT EXISTS organizations_custom_quote_pending_idx
  ON organizations(custom_quote_pending)
  WHERE custom_quote_pending = TRUE;

-- Bestehende Individual-Contract-Organisationen ohne Preis explizit als "pending" markieren.
UPDATE organizations
SET custom_quote_pending = TRUE,
    updated_at = NOW()
WHERE billing_mode = 'individual_contract'
  AND individual_contract_price_cents IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Plan-Checks (compat): subscriptions + organizations + invoices
-- ---------------------------------------------------------------------------
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (
    plan IN ('FREE', 'DEMO', 'BASIS', 'PLUS', 'PRO', 'NOTDIENST', 'ENTERPRISE', 'INDIVIDUAL', 'INDIVIDUELL')
  );

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check CHECK (
    plan IN ('FREE', 'DEMO', 'BASIS', 'PLUS', 'PRO', 'NOTDIENST', 'ENTERPRISE', 'INDIVIDUAL', 'INDIVIDUELL')
  );

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_plan_check;
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_plan_check CHECK (
        plan IN ('FREE', 'DEMO', 'BASIS', 'PLUS', 'PRO', 'NOTDIENST', 'ENTERPRISE', 'INDIVIDUAL', 'INDIVIDUELL')
      );
  END IF;
END $$;

COMMIT;
