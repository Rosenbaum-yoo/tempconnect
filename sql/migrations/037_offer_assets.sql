-- Migration 037: Offer Assets — Bilder und Dokumente pro Angebot
-- Neue Tabelle fuer Logo, Sicherheitshinweise, Galerie, Compliance-Dokumente.
-- Add-only, keine Breaking Changes.

CREATE TABLE IF NOT EXISTS offer_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES capacity_posts(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL
    CHECK (asset_type IN ('logo','safety','gallery','compliance')),
  file_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INT,
  source_type TEXT NOT NULL DEFAULT 'offer'
    CHECK (source_type IN ('offer','compliance_card')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS offer_assets_offer_idx ON offer_assets(offer_id);
CREATE INDEX IF NOT EXISTS offer_assets_offer_type_idx ON offer_assets(offer_id, asset_type);

DO $$ BEGIN
  RAISE NOTICE '037_offer_assets.sql: Migration erfolgreich angewendet.';
END $$;
