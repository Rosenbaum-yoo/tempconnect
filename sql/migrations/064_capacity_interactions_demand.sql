-- Allow capacity_interactions to target demand_requests (Nachfrage) as well as capacity_posts (Angebot).

ALTER TABLE capacity_interactions ALTER COLUMN capacity_post_id DROP NOT NULL;

ALTER TABLE capacity_interactions
  ADD COLUMN IF NOT EXISTS demand_request_id UUID REFERENCES demand_requests(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS capacity_interactions_demand_idx ON capacity_interactions(demand_request_id);

ALTER TABLE capacity_interactions DROP CONSTRAINT IF EXISTS capacity_interactions_one_target_chk;

ALTER TABLE capacity_interactions ADD CONSTRAINT capacity_interactions_one_target_chk CHECK (
  (capacity_post_id IS NOT NULL AND demand_request_id IS NULL)
  OR (capacity_post_id IS NULL AND demand_request_id IS NOT NULL)
);

COMMENT ON COLUMN capacity_interactions.demand_request_id IS 'When set, interaction refers to a company demand (Nachfrage); capacity_post_id is NULL.';
