-- =============================================================================
-- Migration 035: Deal-to-Assignment Bridge
-- Erweitert worker_assignment_links um deal_request_id (FK → requests),
-- damit die Herkunft eines Einsatzes nachvollziehbar ist:
-- capacity_post_id = aus Kapazitätsbörse
-- deal_request_id  = aus Marktplatz-Annahme (Bedarf → Annahme → Einsatz)
-- Keine Breaking Changes. Neue Spalte ist NULLABLE.
-- =============================================================================

BEGIN;

-- 1. worker_assignment_links: Deal-Herkunft
ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS deal_request_id UUID
    REFERENCES requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS wal_deal_request_idx
  ON worker_assignment_links(deal_request_id)
  WHERE deal_request_id IS NOT NULL;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '035_deal_assignment_bridge.sql: Migration erfolgreich angewendet.';
END $$;
