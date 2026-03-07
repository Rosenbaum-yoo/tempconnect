# Capacity Exchange — Matching Logic

## Overview

The matching engine supports bidirectional matching:

1. **Demand → Capacity**: Find capacity posts matching a requisition or demand request (existing)
2. **Capacity → Demand**: Find open requisitions/demands matching a capacity post (new)

Both directions reuse the same `scoreMatch()` function for consistency.

## Scoring Factors

| Factor | Weight | Max Points | Description |
|---|---|---|---|
| Role | 30 | 30 | Exact match = 30, partial = 15, none = 0 |
| Skills/Tags | 25 | 25 | Tag overlap: (matching/total) × 25, max 5 tags |
| Location | 25 | 25 | Haversine distance within radius, fallback to city match (15) |
| Availability | 10 | 10 | Date range overlap |
| Verified | 5 | 5 | Supplier has verified proofs |
| Vendor Pool | 5 | 5 | In client's vendor pool (PREFERRED = 5, other = 2.5) |

**Total max score: 100**

## Forward Matching (Demand → Capacity)

Used when: A company creates a demand_request or requisition.

Function: `matchingEngine.matchRequisition(pool, demandData, opts)`

- Loads all active capacity_posts (`is_active = TRUE`)
- Scores each against the demand using `scoreMatch()`
- Returns top-N matches sorted by score

## Reverse Matching (Capacity → Demand)

Used when: A supplier wants to see which open requisitions match their capacity entry.

Function: `matchingEngine.matchCapacityToRequisitions(pool, capacityPostId, opts)`

- Loads the capacity_post
- Loads all open requisitions (`status IN OPEN, IN_REVIEW, SHORTLISTED`)
- Loads all open demand_requests (`status = 'open'`)
- Normalizes fields and scores each demand against the capacity post
- Returns combined list sorted by score

## Feed Ordering

The capacity feed (`browseFeed`) uses a priority-aware ordering:

1. Priority level: urgent > elevated > normal
2. Last confirmed at (fresher = higher)
3. Updated at (recent = higher)

This ensures fresh, high-priority entries appear first.

## Trust Signal Enrichment

Feed entries include computed trust signals:

- `supplier_verified` — has verified proofs
- `compliance_complete` — all compliance docs verified
- `active_subscriber` — not on FREE plan
- `completed_deals` — number of finalized deals
- `recently_confirmed` — confirmed within last 48h
- `profile_completeness` — percentage (0-100)

## Extensibility

The matching engine is designed for future improvements:

- Weighted scoring per use case (weights parameter)
- Machine learning score adjustments
- Industry/sector matching
- Historical success rate boosting
- Real-time availability confirmation
