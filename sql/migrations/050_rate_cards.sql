-- =============================================================================
-- 050_rate_cards.sql — Rate Card Management (VMS-Kernmodul)
-- =============================================================================
-- Governance-Schicht für verbindliche Stundensätze pro Rolle/Region/Vendor.
-- Ermöglicht Ist-vs-Soll-Vergleich, Maverick-Spending-Schutz, Compliance.
-- Komplementär zu Smart Pricing (Marktdaten ≠ Governance).
-- =============================================================================

-- 1) rate_cards — Ziel-/Max-Sätze pro Rolle×Region×Vendor
CREATE TABLE IF NOT EXISTS rate_cards (
  id                      UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Buyer-Org (Eigentümer der Rate Card)
  org_id                  UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Vendor-Scope (NULL = alle Vendoren / Wildcard)
  supplier_org_id         UUID          REFERENCES organizations(id) ON DELETE CASCADE,

  -- Optionale Vertragsbindung
  contract_id             UUID          REFERENCES contracts(id) ON DELETE SET NULL,

  -- Dimensions
  role_category           TEXT          NOT NULL,                          -- z.B. "Schweisser", "Elektriker", "Lagerist"
  region                  TEXT,                                            -- Stadt/PLZ/Bundesland (NULL = alle Regionen)
  location_id             UUID          REFERENCES org_locations(id) ON DELETE SET NULL,
  department_id           UUID          REFERENCES org_departments(id) ON DELETE SET NULL,

  -- Rate Limits (in Cent, EUR)
  min_rate_cents          INT           CHECK (min_rate_cents IS NULL OR min_rate_cents >= 0),
  target_rate_cents       INT           NOT NULL CHECK (target_rate_cents > 0),
  max_rate_cents          INT           NOT NULL CHECK (max_rate_cents > 0),
  currency                TEXT          NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR','USD','GBP')),

  -- Zuschläge
  overtime_surcharge_pct  NUMERIC(5,2)  NOT NULL DEFAULT 25.0 CHECK (overtime_surcharge_pct >= 0),
  emergency_surcharge_pct NUMERIC(5,2)  NOT NULL DEFAULT 0    CHECK (emergency_surcharge_pct >= 0),

  -- Gültigkeit
  valid_from              DATE          NOT NULL,
  valid_to                DATE,                                           -- NULL = unbefristet

  -- Lifecycle
  status                  TEXT          NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','active','expired','archived')),

  -- Metadaten
  notes                   TEXT,
  created_by              UUID          REFERENCES users(id) ON DELETE SET NULL,
  updated_by              UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Business Rules
  CONSTRAINT rate_cards_min_lte_target CHECK (min_rate_cents IS NULL OR min_rate_cents <= target_rate_cents),
  CONSTRAINT rate_cards_target_lte_max CHECK (target_rate_cents <= max_rate_cents),
  CONSTRAINT rate_cards_valid_range    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- Composite Indexes for Lookup-Performance
CREATE INDEX IF NOT EXISTS rate_cards_org_status_idx
  ON rate_cards(org_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS rate_cards_lookup_idx
  ON rate_cards(org_id, role_category, status, valid_from DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS rate_cards_supplier_idx
  ON rate_cards(supplier_org_id)
  WHERE supplier_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rate_cards_valid_to_idx
  ON rate_cards(valid_to)
  WHERE status = 'active' AND valid_to IS NOT NULL;

-- Prevent duplicate active cards for same dimension combination
CREATE UNIQUE INDEX IF NOT EXISTS rate_cards_unique_active_idx
  ON rate_cards(
    org_id,
    COALESCE(supplier_org_id, '00000000-0000-0000-0000-000000000000'),
    role_category,
    COALESCE(region, ''),
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'),
    valid_from
  )
  WHERE status IN ('draft', 'active');


-- 2) rate_card_checks — Ist-vs-Soll-Compliance-Ergebnisse (persistent)
CREATE TABLE IF NOT EXISTS rate_card_checks (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  rate_card_id      UUID          NOT NULL REFERENCES rate_cards(id) ON DELETE CASCADE,
  org_id            UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Was wurde geprüft
  entity_type       TEXT          NOT NULL CHECK (entity_type IN ('offer','assignment','requisition_candidate')),
  entity_id         UUID          NOT NULL,

  -- Ergebnis
  actual_rate_cents INT           NOT NULL CHECK (actual_rate_cents >= 0),
  target_rate_cents INT           NOT NULL,
  max_rate_cents    INT           NOT NULL,
  compliance_status TEXT          NOT NULL CHECK (compliance_status IN ('compliant','warning','non_compliant')),
  deviation_cents   INT           NOT NULL DEFAULT 0,
  deviation_pct     NUMERIC(6,2)  NOT NULL DEFAULT 0,

  -- Kontext
  role_category     TEXT,
  supplier_org_id   UUID          REFERENCES organizations(id) ON DELETE SET NULL,

  checked_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  checked_by        UUID          REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS rate_card_checks_org_status_idx
  ON rate_card_checks(org_id, compliance_status, checked_at DESC);

CREATE INDEX IF NOT EXISTS rate_card_checks_entity_idx
  ON rate_card_checks(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS rate_card_checks_card_idx
  ON rate_card_checks(rate_card_id, checked_at DESC);
