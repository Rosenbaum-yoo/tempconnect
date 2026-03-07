# Requisition Workflow

## Overview
Requisitions are the core VMS entity — a buyer's formal request for temporary staff. TempConnect implements a 9-state machine with event sourcing.

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
5. **sourcing** — candidates being submitted/reviewed
6. **filled** — position staffed
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
