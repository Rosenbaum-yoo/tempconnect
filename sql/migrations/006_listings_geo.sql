-- Migration 006: Geo-Felder fuer Angebote (listings)
-- Ziel: Umkreissuche pro Angebot, unabhaengig vom Firmensitz

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Optionaler Index fuer haeufige Filter (Region + Stadt)
CREATE INDEX IF NOT EXISTS listings_region_city_idx ON listings(region, city);

