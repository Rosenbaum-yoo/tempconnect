-- Migration: 004_performance_indexes
-- Indizes fuer haeufige Queries (Marktplatz/Filter, Anfragen, viele Kunden)

-- Listings: Filter nach aktiv + Typ + Region/Kategorie (Marktplatz-Suche)
CREATE INDEX IF NOT EXISTS listings_active_type_region_idx ON listings(is_active, type, region) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS listings_active_type_category_idx ON listings(is_active, type, category) WHERE is_active = TRUE;

-- Requests: Status + Zeit (Dashboard, Listen)
CREATE INDEX IF NOT EXISTS requests_status_created_idx ON requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_requester_status_idx ON requests(requester_id, status);
CREATE INDEX IF NOT EXISTS requests_receiver_status_idx ON requests(receiver_id, status);
