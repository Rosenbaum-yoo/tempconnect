-- Migration 038: offer_assets für demand_requests erweitern
-- offer_id wird nullable, demand_request_id als alternative FK ergänzt.
-- CHECK: genau einer der beiden FKs muss gesetzt sein.

-- 1) offer_id nullable machen
ALTER TABLE offer_assets ALTER COLUMN offer_id DROP NOT NULL;

-- 2) demand_request_id Spalte hinzufügen
ALTER TABLE offer_assets
  ADD COLUMN IF NOT EXISTS demand_request_id UUID REFERENCES demand_requests(id) ON DELETE CASCADE;

-- 3) CHECK: genau einer von offer_id / demand_request_id muss gesetzt sein
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offer_assets_entity_check'
  ) THEN
    ALTER TABLE offer_assets
      ADD CONSTRAINT offer_assets_entity_check
      CHECK (
        (offer_id IS NOT NULL AND demand_request_id IS NULL)
        OR
        (offer_id IS NULL AND demand_request_id IS NOT NULL)
      );
  END IF;
END $$;

-- 4) Index für demand_request_id
CREATE INDEX IF NOT EXISTS offer_assets_demand_idx ON offer_assets(demand_request_id)
  WHERE demand_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS offer_assets_demand_type_idx ON offer_assets(demand_request_id, asset_type)
  WHERE demand_request_id IS NOT NULL;

DO $$ BEGIN
  RAISE NOTICE '038_offer_assets_demand_support.sql: Migration erfolgreich angewendet.';
END $$;
