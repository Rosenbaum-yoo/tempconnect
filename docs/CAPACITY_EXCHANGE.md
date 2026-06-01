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

### Demand Side (Nachfrage) — Interaction Continuity

- `POST /api/marketplace/demand-requests/:id/interactions` — Agency/partner submits structured response on an open demand (interest, offer_request, question, contact, ...)
- `GET /api/marketplace/demand-requests/:id/interactions` — Requester side view for the same interaction stream

This closes the detail-page action flow for both market directions:

- Capacity detail (`status=active`) stays on `capacity-exchange/entries/:id/interactions`
- Demand detail (`status=open`) now uses `marketplace/demand-requests/:id/interactions`

So the right action panel is no longer coupled to capacity-only status/paths.

### Interaction Hardening (Enterprise-safe)

- **Server-side policy matrix** (`capacityInteractionPolicy.js`) enforces role/self/status checks before writes.
- **Status-safe behavior**:
  - Capacity interactions only on `status=active`
  - Demand interactions only on `status=open`
- **Self-contact blocked** on both directions.
- **Deduplication window** on interaction inserts (`10 minutes`, same actor + same target + same type + same message) to prevent accidental spam/double submits.

## Background Jobs

The capacity worker processes two job types:

- `capacity-expiry`: Auto-expires entries past `valid_until`, notifies suppliers
- `capacity-stale-check`: Finds entries needing reconfirmation (>7 days since `last_confirmed_at`), sends reminders

Jobs are enqueued via the existing BullMQ infrastructure (`queue/queues.js`).

## Backward Compatibility

- Existing `/api/capacities` routes: **untouched**
- Existing `/api/marketplace/capacity-posts` routes: **untouched** — they still read `is_active` which is synced with the new `status` field
- Existing `matchingEngine.scoreMatch()`: **preserved** — the new `matchCapacityToRequisitions()` reuses it

## Listing Preview Image Logic (Feed, Detail, Form)

The Capacity/Marketplace UI uses one consistent image priority across all relevant pages:

1. **Entry image** (uploaded through existing `offer_assets` pipeline, `asset_type=logo`)
2. **Company logo fallback** (`organizations.logo_url` or `company_profiles.logo_url`)
3. **Neutral placeholder** (UI fallback, no broken layout)

### Reused Components

- Upload/read/delete endpoints remain the existing `offer-assets` routes:
  - `POST /api/offer-assets/:offerId/upload`
  - `GET /api/offer-assets/:offerId`
  - `GET /api/offer-assets/batch-logos`
  - `DELETE /api/offer-assets/:assetId`
- No parallel asset table or alternate upload pipeline was introduced.

### Feed Rendering

- `capacity_exchange_feed.html` + `marketplaceFeed.js` now render a stable left preview block per card.
- Batch logo endpoint now resolves:
  - entry-specific logo from `offer_assets`
  - fallback company/org logo if no entry logo exists
- If image loading fails client-side, the card falls back to a neutral placeholder.

### Detail Rendering

- `capacity_exchange_detail.html` + `capacityExchangeDetail.js` include a visible hero preview block.
- Priority on detail:
  - first gallery image
  - logo asset
  - supplier/company logo (`supplier_logo_url`)
  - fallback placeholder

### Form Upload

- `capacity_exchange_form.html` + `capacityExchangeForm.js` support optional image upload with:
  - MIME/type checks (`png`, `jpg/jpeg`, `webp`)
  - max size `5 MB`
  - local preview
  - remove/replace behavior
- Save flow stays incremental:
  - create/update entry first
  - upload image via existing `offer-assets` endpoint
  - if no image is uploaded, company-logo fallback remains active automatically.

## Detail Action Zone (Conversion -> Operations)

The right-side interaction area on `capacity_exchange_detail.html` is implemented as a structured action zone (not a loose button list).

### Supported action modals

- `interest` — structured initial interest
- `offer_request` — qualified request with timeframe/scope
- `question` — contextual clarification
- `contact` — preferred contact path alignment

All modal submissions still use the existing endpoint:

- `POST /api/capacity-exchange/entries/:id/interactions`

No parallel interaction storage was introduced. Structured modal fields are serialized into the existing `message` payload and stay covered by current audit + notification behavior.

### Field model in modal flows

Depending on action type:

- start/end date
- scope/headcount
- location context
- response deadline
- contact preference
- topic (for question/contact)
- requirements
- message

### UX/Process intent

The action zone is designed to guide users into the operational chain without forcing all steps on one screen:

1. Interest / request
2. Contact and qualification
3. Deal preparation
4. Assignment and worker confirmation
5. Timesheet and review/invoicing follow-up

This keeps interactions enterprise-grade and process-oriented while remaining compatible with existing role/RBAC and multi-tenant logic.

## Feed Ranking: Matching-Coupled Hierarchy

The Capacity feed now uses one coupled relevance model (no separate competing feed logic):

1. **Counterparty priority (hard cluster)**
   - `agency` viewers: demand entries first
   - `company` viewers: supply entries first
   - same-side items remain visible but clearly secondary
2. **Matching relevance (matchingEngine core)**
   - role/skills/location/availability are scored via `matchingEngine.scoreMatch()`
3. **Urgency / Notdienst**
   - `notdienst` / urgent entries receive a strong boost, but within relevant clusters
4. **Enterprise / Premium visibility**
   - plan boost is relevance-gated so weak enterprise matches cannot displace strong standard matches
5. **Trust + freshness**
   - reputation/deal success + recency contribute additional score

### Explainability in UI

Feed cards expose concise ranking labels (`rank_labels`) such as:

- `Fuer Sie priorisiert`
- `Top-Treffer`
- `Notdienst`
- `Enterprise` / `Premium`

This makes "why this appears first" understandable without visual clutter.

### Matching Results Coupling

`matching_results.html` remains the deeper analysis surface and continues to read matching reasons from the same matching engine factors. Feed and matching results therefore rely on the same scoring primitives instead of divergent rule sets.

## Optional Enterprise Inter-Agency Mode

Standard marketplace behavior remains unchanged:

- companies primarily see agency capacity offers
- agencies primarily see company demand

Enterprise customers can enable an optional Inter-Agency extension via org security settings:

- `inter_agency_matching_enabled`
- `inter_agency_supply_visible`

### Activation rules

Inter-Agency is active only when all are true:

1. user role is `agency`
2. plan allows `inter_agency_matching` (Enterprise feature)
3. org setting `inter_agency_matching_enabled = true`

### Feed behavior

- standard mode (`off`): agency viewers only get company demand in primary flow
- inter-agency mode (`on`): agency viewers also get agency demand, clearly labeled `Inter-Agency`
- agency supply visibility to other agencies is optional via `inter_agency_supply_visible`
- core counterparty-first ranking remains intact to prevent feed chaos

### UI transparency

Feed context and card labels clarify:

- whether Inter-Agency mode is active
- whether an item is from a company or an agency
- when an item is an Inter-Agency result
