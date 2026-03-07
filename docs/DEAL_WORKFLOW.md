# Deal Workflow

## Overview
A "deal" in TempConnect is a request from a company to an agency (or vice versa) that progresses through a defined lifecycle. The workflow is enforced by a strict state machine (`api/services/stateMachine.js`) and wrapped with business logic in `api/services/dealWorkflow.js`.

## Request Lifecycle

```
SENT ──→ ACCEPTED ──→ FILLED ──→ FINALIZED
  │         │
  │         └──→ FINALIZED
  │
  └──→ DECLINED
  
Any non-terminal ──→ CANCELED
```

### States
- **SENT**: Initial state. Company or agency has sent a request.
- **ACCEPTED**: Receiver has accepted the request. Work can begin.
- **DECLINED**: Receiver has declined. Terminal state.
- **FILLED**: The position has been filled / workers assigned.
- **FINALIZED**: Deal is completed and closed.
- **CANCELED**: Canceled by either party before completion.

### Transition Rules (enforced by `assertTransition`)
- `SENT` → `ACCEPTED`, `DECLINED`, `CANCELED`
- `ACCEPTED` → `FINALIZED`, `FILLED`, `CANCELED`
- `DECLINED`, `FILLED`, `FINALIZED`, `CANCELED` → (terminal, no further transitions)

## Deal Workflow Service (`api/services/dealWorkflow.js`)
High-level API for deal transitions:

- `acceptRequest(pool, requestId, actorId, opts)` — SENT → ACCEPTED
- `declineRequest(pool, requestId, actorId, opts)` — SENT → DECLINED
- `fillRequest(pool, requestId, actorId, opts)` — ACCEPTED → FILLED
- `finalizeRequest(pool, requestId, actorId, opts)` — ACCEPTED → FINALIZED
- `cancelRequest(pool, requestId, actorId, opts)` — any non-terminal → CANCELED

Each function:
1. Reads current status from DB
2. Validates via `assertTransition()` (throws `TransitionError` if invalid)
3. Updates the `requests` table
4. Writes an audit log entry via `logTransition()`
5. Logs the transition with pino

## Audit Trail
Every transition is logged to the `audit_log` table with:
- `action`: `state_machine.transition`
- `entity_type`: `request`
- `entity_id`: request UUID
- `actor_id`: user who triggered the transition
- `details`: `{ from, to, message? }`

## Related State Machines
The same pattern is used for:
- **Reservations**: `active` → `converted` | `expired`
- **Requisitions**: `DRAFT` → `PENDING_APPROVAL` → `APPROVED` → `OPEN` → `IN_REVIEW` → `SHORTLISTED` → `FILLED` → `CLOSED` (with `CANCELLED` from most states)

See `api/services/stateMachine.js` for the full transition maps.
