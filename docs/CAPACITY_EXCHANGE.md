# Capacity Exchange — Architecture & Overview

## Purpose

The Capacity Exchange transforms TempConnect from a passive request marketplace into an **active capacity exchange platform**. Staffing providers publish available workforce capacity; companies discover, filter, and interact with real availability in real time.

## Architecture

### Extension Strategy

The feature extends the existing `capacity_posts` table (migration 014) rather than creating a new table. This ensures:

- Existing marketplace queries (`marketplaceService.js`) continue to work
- The matching engine (`matchingEngine.js`) stays connected
- No duplicate data models

### New Files

| File | Purpose |
|---|---|
| `sql/migrations/021_capacity_exchange.sql` | Schema extension + capacity_interactions table |
| `api/services/capacityWorkflow.js` | Status transitions, validation, freshness logic |
| `api/services/capacityExchangeService.js` | Core business logic: CRUD, feed, trust signals, expiry, stats |
| `api/routes/capacityExchange.js` | REST endpoints at `/api/capacity-exchange/*` |
| `api/workers/capacityWorker.js` | Background jobs: auto-expiry, stale detection |

### Modified Files

| File | Change |
|---|---|
| `api/services/stateMachine.js` | Added `CAPACITY_POST_TRANSITIONS` map |
| `api/services/matchingEngine.js` | Added `matchCapacityToRequisitions()` reverse matching |
| `api/services/notificationMatrix.js` | Added 4 capacity exchange event types |
| `api/config/planFeatures.js` | Added 4 capacity_exchange_* feature keys |
| `api/queue/queues.js` | Added `capacityQueue()` accessor |
| `api/workers/index.js` | Registered capacity worker |
| `api/app.js` | Mounted capacity exchange router |

## API Endpoints

### Supplier Side

- `POST /api/capacity-exchange/entries` — Create entry
- `PATCH /api/capacity-exchange/entries/:id` — Update entry
- `POST /api/capacity-exchange/entries/:id/activate` — Activate (draft→active)
- `POST /api/capacity-exchange/entries/:id/pause` — Pause
- `POST /api/capacity-exchange/entries/:id/reactivate` — Reactivate
- `POST /api/capacity-exchange/entries/:id/fill` — Mark as filled
- `POST /api/capacity-exchange/entries/:id/archive` — Archive
- `POST /api/capacity-exchange/entries/:id/confirm` — Confirm freshness
- `GET /api/capacity-exchange/entries` — List own entries
- `GET /api/capacity-exchange/entries/:id` — Entry detail
- `GET /api/capacity-exchange/entries/:id/matches` — Matching requisitions
- `GET /api/capacity-exchange/entries/:id/interactions` — View interactions
- `GET /api/capacity-exchange/stats` — Dashboard stats

### Company Side

- `GET /api/capacity-exchange/feed` — Browse capacity feed (with filters)
- `GET /api/capacity-exchange/feed/:id` — Entry detail with trust signals
- `POST /api/capacity-exchange/entries/:id/interactions` — Express interest / request offer / etc.

## Background Jobs

The capacity worker processes two job types:

- `capacity-expiry`: Auto-expires entries past `valid_until`, notifies suppliers
- `capacity-stale-check`: Finds entries needing reconfirmation (>7 days since `last_confirmed_at`), sends reminders

Jobs are enqueued via the existing BullMQ infrastructure (`queue/queues.js`).

## Backward Compatibility

- Existing `/api/capacities` routes: **untouched**
- Existing `/api/marketplace/capacity-posts` routes: **untouched** — they still read `is_active` which is synced with the new `status` field
- Existing `matchingEngine.scoreMatch()`: **preserved** — the new `matchCapacityToRequisitions()` reuses it
