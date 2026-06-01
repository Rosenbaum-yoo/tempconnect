-- =============================================================================
-- Migration 074: Tariff & Contract Model — Demo/Pilot/Live Trennung
-- Adds: billing_mode, target_plan, company_size_class, employee_count on organizations.
-- Adds: Guardrail CHECK on users to prevent demo+pilot overlap.
-- Extends subscription plan CHECK for INDIVIDUAL plan.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. organizations: Vertrags- und Abrechnungsfelder
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

COMMENT ON COLUMN organizations.billing_mode IS 'Abrechnungsmodus: standard_catalog (Katalogpreise), pilot_contract (Pilotvertrag), individual_contract (Individualvertrag)';
COMMENT ON COLUMN organizations.target_plan_after_pilot IS 'Zieltarif nach Pilotphasen-Ende (z.B. PLUS, PRO, ENTERPRISE, INDIVIDUAL)';
COMMENT ON COLUMN organizations.company_size_class IS 'Unternehmensgroessenklasse: I (1-30), II (31-250), III (251-999), IV (1000+)';
COMMENT ON COLUMN organizations.employee_count_approx IS 'Geschaetzte Mitarbeiterzahl fuer Staffelberechnung';
COMMENT ON COLUMN organizations.individual_contract_note IS 'Freitext fuer Sonderkonditionen, SLA-Vereinbarungen, Volumen-Agreements';

-- ---------------------------------------------------------------------------
-- 2. subscriptions: INDIVIDUAL Plan-Typ erlauben
-- ---------------------------------------------------------------------------
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

-- Erlaube alle bestehenden + neuen INDIVIDUAL Plan
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (
    plan IN ('FREE', 'DEMO', 'BASIS', 'PLUS', 'PRO', 'ENTERPRISE', 'INDIVIDUAL')
  );

-- ---------------------------------------------------------------------------
-- 3. Guardrail: Demo-User duerfen nie customer_stage='pilot' haben
-- ---------------------------------------------------------------------------
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_demo_pilot_guardrail;

ALTER TABLE users
  ADD CONSTRAINT users_demo_pilot_guardrail CHECK (
    NOT (is_demo = TRUE AND customer_stage = 'pilot')
  );

COMMENT ON CONSTRAINT users_demo_pilot_guardrail ON users IS 'Verhindert dass Demo-Accounts versehentlich als Pilotkunden gefuehrt werden';

-- ---------------------------------------------------------------------------
-- 4. Index fuer billing_mode Queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS organizations_billing_mode_idx
  ON organizations(billing_mode)
  WHERE billing_mode != 'standard_catalog';

COMMIT;
