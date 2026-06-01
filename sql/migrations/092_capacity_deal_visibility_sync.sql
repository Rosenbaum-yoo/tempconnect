-- =============================================================================
-- Migration 092: Canonical capacity-deal visibility sync
-- Adds offer -> capacity linkage and extends capacity status workflow with
-- reserved so deal-bound capacity remains visible to owners/counterparties.
-- =============================================================================

BEGIN;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS capacity_post_id UUID
    REFERENCES capacity_posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS offers_capacity_post_idx
  ON offers(capacity_post_id)
  WHERE capacity_post_id IS NOT NULL;

ALTER TABLE capacity_posts
  DROP CONSTRAINT IF EXISTS capacity_posts_status_check;

ALTER TABLE capacity_posts
  ADD CONSTRAINT capacity_posts_status_check
  CHECK (status IN ('draft','active','paused','expired','filled','archived','reserved'));

CREATE INDEX IF NOT EXISTS capacity_posts_status_reserved_idx
  ON capacity_posts(status, updated_at DESC)
  WHERE status = 'reserved';

WITH inferred_capacity_origin AS (
  SELECT
    o.id AS offer_id,
    cp.id AS capacity_post_id,
    ROW_NUMBER() OVER (
      PARTITION BY o.id
      ORDER BY cp.updated_at DESC NULLS LAST, cp.created_at DESC NULLS LAST
    ) AS rn
  FROM offers o
  JOIN demand_requests d
    ON d.id = o.demand_request_id
  JOIN capacity_posts cp
    ON cp.supplier_company_id = o.supplier_company_id
   AND cp.role = d.role
   AND COALESCE(cp.location_city, '') = COALESCE(d.location_city, '')
   AND cp.title = regexp_replace(d.title, '^(Zustimmung|Verhandlung):\s*', '')
  WHERE o.capacity_post_id IS NULL
    AND d.title ~ '^(Zustimmung|Verhandlung):\s*'
)
UPDATE offers o
SET capacity_post_id = inferred.capacity_post_id
FROM inferred_capacity_origin inferred
WHERE o.id = inferred.offer_id
  AND inferred.rn = 1;

WITH commercial_commitments AS (
  SELECT
    o.capacity_post_id,
    COALESCE(SUM(GREATEST(COALESCE(o.offered_quantity, d.headcount, 0), 0)), 0)::INT AS committed_headcount
  FROM offers o
  JOIN demand_requests d
    ON d.id = o.demand_request_id
  WHERE o.capacity_post_id IS NOT NULL
    AND o.status = 'accepted'
    AND COALESCE(o.agreement_status, 'none') NOT IN ('cancelled', 'expired')
  GROUP BY o.capacity_post_id
)
UPDATE capacity_posts cp
SET status = CASE
      WHEN COALESCE(cc.committed_headcount, 0) >= COALESCE(cp.headcount, 0)
        THEN 'reserved'
      ELSE 'active'
    END,
    is_active = CASE
      WHEN COALESCE(cc.committed_headcount, 0) >= COALESCE(cp.headcount, 0)
        THEN FALSE
      ELSE TRUE
    END,
    updated_at = NOW()
FROM commercial_commitments cc
WHERE cp.id = cc.capacity_post_id
  AND cp.status IN ('active', 'reserved');

COMMIT;
