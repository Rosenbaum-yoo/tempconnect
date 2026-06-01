-- =============================================================================
-- Migration 105: org_active_addons + harte Entitlement-Limitspalten
--
-- `org_active_addons` ist die dedizierte Live-Wahrheit fuer Add-ons je
-- Organisation. Aktivierung erfolgt aus genehmigten Subscription Requests bzw.
-- Staff-Aktivierungen; alte Reads aus subscription_requests sind nur noch ein
-- temporaerer Backfill-/Compatibility-Fallback im Entitlement-Service.
--
-- Die optionalen custom_limit_*-Spalten erlauben Staff, individuelle Verträge
-- und Multi-Org-Slots sauber zu hinterlegen, ohne Plan-Katalogwerte zu
-- ueberschreiben.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS org_active_addons (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  addon_key           TEXT NOT NULL,
  addon_name          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  price_cents         INTEGER NULL CHECK (price_cents IS NULL OR price_cents >= 0),
  interval            TEXT NULL,
  source              TEXT NOT NULL DEFAULT 'subscription_request'
    CHECK (source IN ('subscription_request','staff_activation','manual')),
  source_request_id   UUID NULL REFERENCES subscription_requests(id) ON DELETE SET NULL,
  activated_by        UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  activated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_by      UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  deactivated_at      TIMESTAMPTZ NULL,
  expires_at          TIMESTAMPTZ NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, addon_key)
);

CREATE INDEX IF NOT EXISTS idx_org_active_addons_org_active
  ON org_active_addons(org_id, addon_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_org_active_addons_source_request
  ON org_active_addons(source_request_id)
  WHERE source_request_id IS NOT NULL;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS custom_limit_users INTEGER NULL
    CHECK (custom_limit_users IS NULL OR custom_limit_users = -1 OR custom_limit_users >= 0),
  ADD COLUMN IF NOT EXISTS custom_limit_sites INTEGER NULL
    CHECK (custom_limit_sites IS NULL OR custom_limit_sites = -1 OR custom_limit_sites >= 0),
  ADD COLUMN IF NOT EXISTS custom_limit_listings INTEGER NULL
    CHECK (custom_limit_listings IS NULL OR custom_limit_listings = -1 OR custom_limit_listings >= 0),
  ADD COLUMN IF NOT EXISTS custom_limit_suppliers INTEGER NULL
    CHECK (custom_limit_suppliers IS NULL OR custom_limit_suppliers = -1 OR custom_limit_suppliers >= 0),
  ADD COLUMN IF NOT EXISTS custom_limit_multi_org_slots INTEGER NULL
    CHECK (custom_limit_multi_org_slots IS NULL OR custom_limit_multi_org_slots = -1 OR custom_limit_multi_org_slots >= 1);

CREATE INDEX IF NOT EXISTS organizations_parent_active_idx
  ON organizations(parent_org_id, is_active)
  WHERE parent_org_id IS NOT NULL;

COMMENT ON TABLE org_active_addons IS 'Live active add-ons per organization; source of truth for entitlementService.';
COMMENT ON COLUMN org_active_addons.source_request_id IS 'Approved/activated subscription_request that last set this add-on.';
COMMENT ON COLUMN organizations.custom_limit_multi_org_slots IS 'Optional staff-set multi-org slot limit including parent org; -1 = unlimited.';

COMMIT;
