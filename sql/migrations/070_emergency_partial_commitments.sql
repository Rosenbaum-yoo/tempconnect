-- Emergency partial fulfillment: add commitment ledger + additive demand fields.

ALTER TABLE demand_requests
  ADD COLUMN IF NOT EXISTS required_total_count INT,
  ADD COLUMN IF NOT EXISTS currently_committed_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_open_count INT,
  ADD COLUMN IF NOT EXISTS partial_fulfillment_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS overfill_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_response_at TIMESTAMPTZ;

UPDATE demand_requests
SET required_total_count = COALESCE(required_total_count, headcount),
    remaining_open_count = COALESCE(remaining_open_count, GREATEST(COALESCE(headcount, 1) - COALESCE(currently_committed_count, 0), 0));

ALTER TABLE demand_requests
  ALTER COLUMN required_total_count SET DEFAULT 1;

UPDATE demand_requests SET required_total_count = 1 WHERE required_total_count IS NULL;

ALTER TABLE demand_requests
  ALTER COLUMN required_total_count SET NOT NULL;

ALTER TABLE demand_requests
  DROP CONSTRAINT IF EXISTS demand_requests_status_check;

ALTER TABLE demand_requests
  ADD CONSTRAINT demand_requests_status_check
  CHECK (status IN ('open', 'partially_covered', 'fulfilled', 'closed', 'cancelled', 'paused', 'expired'));

CREATE INDEX IF NOT EXISTS demand_requests_remaining_idx
  ON demand_requests(status, remaining_open_count, urgency);

CREATE TABLE IF NOT EXISTS emergency_provider_commitments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  demand_request_id UUID NOT NULL REFERENCES demand_requests(id) ON DELETE CASCADE,
  supplier_company_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  committed_quantity INT NOT NULL CHECK (committed_quantity > 0),
  status TEXT NOT NULL DEFAULT 'committed'
    CHECK (status IN ('proposed', 'committed', 'rejected', 'withdrawn', 'expired')),
  note TEXT,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emergency_provider_commitments_demand_idx
  ON emergency_provider_commitments(demand_request_id, status, committed_at DESC);

CREATE INDEX IF NOT EXISTS emergency_provider_commitments_supplier_idx
  ON emergency_provider_commitments(supplier_company_id, status, committed_at DESC);

CREATE TABLE IF NOT EXISTS emergency_provider_commitment_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  commitment_id UUID NOT NULL REFERENCES emergency_provider_commitments(id) ON DELETE CASCADE,
  demand_request_id UUID NOT NULL REFERENCES demand_requests(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'commitment_created',
      'commitment_updated',
      'commitment_withdrawn',
      'commitment_rejected',
      'commitment_expired'
    )
  ),
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emergency_provider_commitment_events_demand_idx
  ON emergency_provider_commitment_events(demand_request_id, created_at DESC);
