# Requisition Workflow

## Overview
Requisitions are the core VMS entity — a buyer's formal request for temporary staff. TempConnect implements a 9-state machine with event sourcing.

## Headcount is not a single worker-link

For `quantity/headcount > 1`, TempConnect now separates commercial demand from operational staffing:

- the **requisition / demand** remains the buyer-side need definition
- the accepted marketplace/deal step only secures the commercial lane
- the downstream **assignment** is the operational staffing container with:
  - `requested_quantity`
  - `filled_quantity`
  - `reserved_quantity`
  - `open_quantity`
  - `staffing_status`
- final worker-specific execution still happens in `worker_assignment_links`

This removes the former domain error `1 Bedarf = 1 Assignment = 1 Worker`.

## State Machine

```
draft → pending_approval → approved → published → sourcing → filled → closed
                 ↓                                                ↓
              rejected                                        cancelled
```

### States
1. **draft** — initial creation, editable
2. **pending_approval** — submitted for approval (if org requires approval workflows)
3. **approved** — approval granted, ready to publish
4. **published** — visible to suppliers
5. **sourcing** — candidates and/or staffing campaigns are actively covering open slots
6. **filled** — all requested slots are staffed
7. **closed** — completed lifecycle
8. **rejected** — approval denied
9. **cancelled** — withdrawn at any stage

## Events
Every state transition emits a `requisition_events` record:
- `event_type`: transition name (e.g. `submitted`, `approved`, `published`)
- `actor_id`: user who triggered the transition
- `details`: JSONB payload with context

## Candidates (requisition_candidates)
Suppliers submit candidates against published requisitions:
- `status`: submitted → shortlisted → interviewed → offered → accepted / rejected / withdrawn
- `charge_rate_cents`, `markup_percent`, `supplier_notes` — submission pricing
- `submitted_at`, `evaluated_at` — timeline tracking

## Marketplace / deal handoff to staffing

After a marketplace offer is accepted:

- `demand_requests.status` moves to `partially_covered`, not immediately to `fulfilled`
- the supplier-side commercial commitment is done, but operational staffing may still be partially open
- one assignment container is created for the deal/supplier combination
- multiple invites, reservations and final worker links can belong to that same assignment

`fulfilled` only becomes correct once the requested slots are actually covered.

## Operational staffing objects after award

The post-award staffing chain is now:

1. **Assignment container** — the operational need for this supplier/deal
2. **Worker suggestions** — ranked shortlist with explainable fit reasons
3. **Staffing campaign / bulk invites** — one request context, many workers
4. **Reservations** — accepted workers temporarily occupy slots
5. **Final worker assignment links** — only after slot availability + conflict checks + business rules allow final placement

Manual single-worker assignment remains available, but it no longer bypasses the slot logic.

## Approval Integration
When `org_settings.approval_required = true`:
- `draft → pending_approval` creates an `approval_requests` record
- Approvers use the Approvals API to approve/reject
- On approval: state transitions to `approved`
- On rejection: state transitions to `rejected` with reason

## API Endpoints
Existing requisition routes handle full CRUD and state transitions. The approval overlay is handled by the Approvals API (`/api/approvals/*`).

## Notification Events
- `requisition.submitted` — notifies approvers
- `requisition.approved` / `requisition.rejected` — notifies requester
- `requisition.published` — notifies matching suppliers
- `candidate.submitted` — notifies hiring manager
- `candidate.shortlisted` / `candidate.rejected` — notifies supplier

## Extension markers for later optimization

The workflow is intentionally prepared for further expansion without changing the core separation:

- richer worker eligibility rules (language, licenses, compliance blocks, rest-time)
- automated backfill / waitlist logic for expired or withdrawn reservations
- smarter campaign pacing and batching
- stronger cross-assignment conflict arbitration for workers with multiple parallel requests
