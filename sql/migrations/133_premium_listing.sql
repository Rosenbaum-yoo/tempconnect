-- 133_premium_listing.sql — Premium-Anzeige im Marktplatz (einmalige In-App-Gebuehr,
-- wird auf der naechsten Monatsrechnung addiert — manual-first, KEIN Sofort-Charge).
-- placement_boost_level wurde vom Feed-Ranker (capacityExchangeService) bereits gelesen,
-- existierte aber nie als Spalte (immer 0) — wird hiermit real. Add-only/idempotent.
-- Rollback: DROP TABLE premium_listing_charges; Spalten featured_until/placement_boost_level droppen.

ALTER TABLE capacity_posts  ADD COLUMN IF NOT EXISTS placement_boost_level INT NOT NULL DEFAULT 0;
ALTER TABLE capacity_posts  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;
ALTER TABLE demand_requests ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS premium_listing_charges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  listing_type text NOT NULL CHECK (listing_type IN ('capacity', 'demand')),
  listing_id   uuid NOT NULL,
  description  text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency     text NOT NULL DEFAULT 'EUR',
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'cancelled')),
  invoice_id   uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  invoiced_at  timestamptz
);

-- Monats-Aggregation liest offene Posten je Org.
CREATE INDEX IF NOT EXISTS plc_org_pending_idx ON premium_listing_charges (org_id, status) WHERE status = 'pending';
