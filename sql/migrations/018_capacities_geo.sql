-- Migration 018: Geo-Felder fuer Kapazitaeten (capacities)
-- Ziel: Umkreissuche (Haversine) pro Kapazitaet

ALTER TABLE capacities
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS radius_km INT NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Partial Index fuer aktive Kapazitaeten mit Geo-Daten
CREATE INDEX IF NOT EXISTS capacities_geo_active_idx
  ON capacities(latitude, longitude)
  WHERE is_active = TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index fuer Stadt-basierte Suche
CREATE INDEX IF NOT EXISTS capacities_city_idx ON capacities(city) WHERE city IS NOT NULL;
