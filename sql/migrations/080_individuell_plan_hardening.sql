-- =============================================================================
-- Migration 080: Plan Model Hardening — INDIVIDUELL + Pilot/Demo Trennung
-- Fixes: subscription plan CHECK für INDIVIDUELL, employee_count auf users,
--        org-level individual_tier_auto, feature_bundle, account_type.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. subscriptions: INDIVIDUELL als Plan-Wert erlauben
--    Migration 074 liess nur INDIVIDUAL zu, aber changePlan() schreibt INDIVIDUELL.
-- ---------------------------------------------------------------------------
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (
    plan IN ('FREE', 'DEMO', 'BASIS', 'PLUS', 'PRO', 'ENTERPRISE', 'INDIVIDUAL', 'INDIVIDUELL')
  );

-- ---------------------------------------------------------------------------
-- 2. users: employee_count für Betriebsgröße bei Registrierung
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_count INT
    CHECK (employee_count IS NULL OR employee_count >= 1);

COMMENT ON COLUMN users.employee_count IS 'Ungefähre Beschäftigtenzahl, bei Registrierung oder Profilpflege erfasst';

-- ---------------------------------------------------------------------------
-- 3. organizations: Enrichment-Spalten für Individual-Tier + Feature-Bundle
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS individual_tier_auto TEXT
    CHECK (individual_tier_auto IS NULL OR individual_tier_auto IN (
      'individuell_s', 'individuell_m', 'individuell_l', 'individuell_enterprise'
    ));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS feature_bundle TEXT
    NOT NULL DEFAULT 'standard'
    CHECK (feature_bundle IN ('standard', 'enterprise_full'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS account_type TEXT
    NOT NULL DEFAULT 'live'
    CHECK (account_type IN ('live', 'demo', 'internal'));

COMMENT ON COLUMN organizations.individual_tier_auto IS 'Automatisch erkannte Größenklasse: individuell_s/m/l/enterprise';
COMMENT ON COLUMN organizations.feature_bundle IS 'Feature-Bundle: standard (planbasiert) oder enterprise_full (Pilot/Individuell)';
COMMENT ON COLUMN organizations.account_type IS 'Kontotyp: live (echtes Konto), demo (Demo-Modus), internal (internes Testkonto)';

-- ---------------------------------------------------------------------------
-- 4. Index für schnelle Feature-Bundle-Abfragen
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS organizations_feature_bundle_idx
  ON organizations(feature_bundle)
  WHERE feature_bundle = 'enterprise_full';

CREATE INDEX IF NOT EXISTS organizations_account_type_idx
  ON organizations(account_type)
  WHERE account_type != 'live';

COMMIT;
