-- Model B: Live capacity feed (agency-centric). Option A: reserve does NOT change capacities; ACCEPT reduces available_workers.
-- UUID: use uuid_generate_v4() (uuid-ossp, already in init.sql). For gen_random_uuid() enable pgcrypto or use PG 13+.

-- 1) capacities
CREATE TABLE IF NOT EXISTS capacities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  region TEXT NOT NULL,
  available_from DATE NOT NULL,
  available_workers INT NOT NULL CHECK (available_workers >= 0),
  tags TEXT[],
  hourly_rate_cents INT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS capacities_agency_id_idx ON capacities(agency_id);
CREATE INDEX IF NOT EXISTS capacities_region_role_active_idx ON capacities(region, role, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS capacities_available_from_idx ON capacities(available_from) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS capacities_agency_active_idx ON capacities(agency_id, is_active);

-- 2) capacity_reservations (TTL 30 min; only status='active' counts for available_effective)
CREATE TABLE IF NOT EXISTS capacity_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capacity_id UUID NOT NULL REFERENCES capacities(id) ON DELETE CASCADE,
  request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
  quantity INT NOT NULL CHECK (quantity >= 1),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','converted','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS capacity_reservations_capacity_status_idx ON capacity_reservations(capacity_id, status);
CREATE INDEX IF NOT EXISTS capacity_reservations_expires_at_idx ON capacity_reservations(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS capacity_reservations_request_id_idx ON capacity_reservations(request_id) WHERE request_id IS NOT NULL;

-- 3) requests: make listing_id nullable and add capacity_id + Model B columns; CHECK exactly one of (capacity_id, listing_id)
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS capacity_id UUID REFERENCES capacities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS quantity INT CHECK (quantity IS NULL OR quantity >= 1),
  ADD COLUMN IF NOT EXISTS location_text TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS duration_days INT CHECK (duration_days IS NULL OR duration_days >= 1),
  ADD COLUMN IF NOT EXISTS shift_schedule JSONB,
  ADD COLUMN IF NOT EXISTS qualification_tags TEXT[],
  ADD COLUMN IF NOT EXISTS required_certifications TEXT[],
  ADD COLUMN IF NOT EXISTS max_hourly_rate_cents INT,
  ADD COLUMN IF NOT EXISTS urgency TEXT CHECK (urgency IS NULL OR urgency IN ('normal','high','urgent')),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS deal_id UUID;

-- Ensure listing_id is nullable (for capacity-only requests)
ALTER TABLE requests ALTER COLUMN listing_id DROP NOT NULL;

-- CHECK: exactly one of capacity_id, listing_id must be set
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_capacity_listing_xor;
ALTER TABLE requests ADD CONSTRAINT requests_capacity_listing_xor CHECK (
  (capacity_id IS NOT NULL AND listing_id IS NULL) OR (capacity_id IS NULL AND listing_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS requests_capacity_id_idx ON requests(capacity_id) WHERE capacity_id IS NOT NULL;
