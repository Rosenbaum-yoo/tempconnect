# Model B (Live Capacity + Extended Request Flow) – Architecture Proposal

**No code yet.** This document states how Model B is understood, then proposes schema, transactions, API, performance, and security. Implementation follows only after this is agreed.

---

## 1. How Model B is understood (before schema review)

Because there is no explicit "Model B" spec in the repo, the following interpretation is assumed. **Please correct if your vision differs.**

### Current state (today)
- **listings**: Have `qty` (integer). A request references one listing; on ACCEPTED/FINALIZED the listing is logically "used" but `qty` is not reduced; multiple requests can reference the same listing until the receiver accepts one, then others are set to FILLED.
- **requests**: One request = one listing, one requester, one receiver; status flow SENT → ACCEPTED/DECLINED; requester can FINALIZE one ACCEPTED request (deal); other ACCEPTED for same listing get FILLED.
- There is **no** separate `deals` table; a deal = request with status FINALIZED.
- **No** concept of "reservation" (time-limited hold) or "partial capacity" (e.g. request for 3 of 10).

### Model B (assumed direction)
- **Live capacity:** Listings have a "live" capacity (e.g. available quantity) that is reduced when capacity is reserved or committed. So `listings.qty` becomes "total" and we need a notion of "available" (total minus reserved/allocated).
- **Extended request flow:** A request can ask for a **partial** quantity (e.g. 3 of 10). Flow might include: create request → (optional) create **reservation** (time-limited hold on capacity) → receiver accepts → requester finalizes (deal) → capacity is committed; or reservation expires and capacity is released.
- **Reservations:** Short-lived holds on a listing’s capacity (e.g. 15–30 minutes) so that two users don’t "double book" the same capacity. When a reservation expires, the capacity goes back to available; when a deal is finalized, reserved capacity turns into "sold/allocated" and no longer available.

### Open points to align on
- Is "capacity" the same as `listings.qty`, or do we introduce separate `capacity_total` / `capacity_available` (or derive available from reservations/deals)?
- One reservation per request, or multiple reservations per listing (e.g. multiple requesters with temporary holds)?
- Reservation duration: fixed (e.g. 15 min) or configurable per listing/tenant?
- Partial requests: Can a requester ask for less than `qty` (e.g. request 3 from a listing with qty 10)? If yes, we need `request.qty_requested` and logic to reduce "available" by that amount.

---

## 2. Schema review and suggestions (assuming the above)

### 2.1 Proposed / assumed new structures (to be confirmed)

- **Capacities (live):**  
  Either (a) keep `listings.qty` as "total" and add `listings.capacity_available` (updated by app logic), or (b) add a `capacity` or `listing_capacity` table (listing_id, total, reserved, allocated) for clearer audit and locking.  
  **Suggestion:** Option (b) is clearer for concurrency: one row per listing to lock with `SELECT FOR UPDATE` when reserving/allocating.

- **Extended requests:**  
  Add to `requests`: e.g. `quantity_requested INT`, `quantity_accepted INT` (nullable until accepted). So one request = "I want up to X from this listing."

- **Reservations:**  
  New table e.g. `reservations`: id, listing_id, request_id (nullable if reserve-before-request), user_id, quantity, expires_at, status (active|converted|expired), created_at.  
  "Converted" = reservation was turned into an accepted/finalized deal; "expired" = TTL passed and capacity was released.

### 2.2 Normalization

- **Reservations:** Normalized: one row per reservation; link to `request_id` when the reservation is tied to a request. Avoid storing "reserved quantity" only on listing (hard to attribute and to clean up on expiry).
- **Capacity:** Prefer one row per listing (in a `listing_capacity` table or listing-level columns) so we don’t over-normalize into "capacity events" for the first version; that can be a later audit/analytics layer.

### 2.3 Indexing

- **reservations:**  
  - `(listing_id, status)` where status IN ('active','converted') for "how much is reserved for this listing".  
  - `(expires_at)` where status = 'active' for expiry cleanup job.  
  - `(request_id)` if lookups by request are frequent.
- **listing_capacity (or listings):**  
  - Existing listing indexes; if we add `capacity_available`, consider composite index for search (e.g. `(is_active, type, region)` already; add `capacity_available` only if we often filter "available > 0" in the same query).
- **requests:**  
  - Index on `(listing_id, status)` for "all active requests for this listing" when checking capacity.

### 2.4 Concurrency

- **Race:** Two users reserve the same capacity at the same time. Mitigation: lock the listing’s capacity row (or listing row) with `SELECT FOR UPDATE` inside a transaction before computing new reserved/available and inserting the reservation.
- **Double booking:** Only allow reserving/accepting if `available >= quantity_requested` at commit time; use a single transaction that locks listing capacity, checks availability, inserts/updates reservation and updates capacity.

### 2.5 Performance under scale

- **100k+ listings:** Search (e.g. by region, category, type, available > 0) must use indexes; avoid full table scan. Keep filters on indexed columns; "available > 0" as a filter is acceptable if we have an index that supports it (e.g. partial index `WHERE capacity_available > 0` or composite with is_active).
- **Reservation cleanup:** Run a scheduled job (cron or pg_cron) that sets `status = 'expired'` and releases capacity for reservations where `expires_at < NOW()`. Batch by expires_at to avoid long locks.
- **High contention on one listing:** Serialize changes to that listing’s capacity in the DB (transactions + `SELECT FOR UPDATE`); keep reservation windows short to reduce lock time.

---

## 3. Handling specific behaviours

### 3.1 Capacity reservations – race conditions

- **Strategy:** Use a single DB transaction per "create reservation" operation.
- **Steps:** BEGIN; SELECT listing capacity row FOR UPDATE; check `available >= quantity_requested`; INSERT reservation (status active); UPDATE capacity (reserved += quantity, available -= quantity); COMMIT. If any step fails (e.g. available &lt; quantity), ROLLBACK.
- **Result:** Only one transaction per listing’s capacity row at a time; no over-allocation.

### 3.2 Double booking prevention

- **At reserve time:** As above; only reserve if available >= quantity.
- **At accept time:** Re-check: reservation still active, listing capacity still has enough "reserved" for this request (or re-check available if we don’t tie accept to a prior reservation). Use the same locking (SELECT FOR UPDATE on capacity row).
- **At finalize time:** Convert reservation to "allocated" (or delete reservation and reduce available permanently); again in a transaction with lock on capacity.

### 3.3 Reservation expiry cleanup

- **Option A – Job:** Every 1–5 minutes, run a job: find reservations with `status = 'active'` AND `expires_at < NOW()`; in a transaction per listing (or batch of reservations for same listing), set reservation to 'expired', and add quantity back to available / subtract from reserved.
- **Option B – DB trigger / function:** Less recommended for first version; harder to reason about and to monitor.
- **Recommendation:** Option A (application-level job or small worker) with a small batch size to avoid long locks.

### 3.4 Partial capacity requests

- **Schema:** `requests.quantity_requested` (and optionally `quantity_accepted` when receiver can accept less).
- **Reservation:** Reserve exactly `quantity_requested` (or the accepted amount once known).
- **Listing display:** "Available" = total − reserved − allocated; show "X of Y available" in UI. Search can filter listings with `available >= 1` (or user’s desired min).

---

## 4. Transaction strategy

### 4.1 Operations that must be in a transaction

- **Create reservation:** Lock listing capacity (SELECT FOR UPDATE); check available; insert reservation; update capacity. One transaction.
- **Accept request (with reservation):** Lock listing capacity; verify reservation still valid and quantity; update request status; optionally convert reservation to "allocated" or keep until finalize. One transaction.
- **Finalize deal:** Lock listing capacity; mark reservation as converted (or remove it); reduce available / increase allocated for that listing; update request status to FINALIZED; update other requests (e.g. FILLED) as today. One transaction.
- **Expiry cleanup (per listing or per batch of same listing):** Lock listing capacity; mark reservations expired; update capacity (reserved -= qty, available += qty). One transaction per listing to avoid deadlocks.

### 4.2 Where to use SELECT FOR UPDATE

- **Listing capacity row** (or the listing row if capacity is on it): whenever we read capacity to decide "can I reserve/accept/finalize" and then update it. So: reserve, accept, finalize, and expiry job.
- **Request row:** Only if we need to serialize status changes for the same request (e.g. prevent two concurrent "accept" calls). Optional; if the only state change is receiver accepts once, a unique constraint plus status check may be enough.

### 4.3 What not to wrap in one transaction

- Sending emails (after commit): do after successful commit so we don’t hold the transaction open for I/O.
- Search/listing read-only queries: no transaction needed for simple SELECTs; only when we do "reserve in same request" we combine read + write in one transaction.

---

## 5. API structure

### 5.1 Controller separation

- Keep **one API** (Express); no need to split into multiple services for Model B.
- **Route grouping:** E.g. `POST /api/listings/:id/reserve`, `POST /api/requests/:id/accept`, `PATCH /api/requests/:id/status` (for finalize). Optional: `GET /api/listings/:id/capacity` for available/reserved/allocated.
- **Handlers:** Can remain in `server.js` or be split into route files (e.g. `routes/capacity.js`, `routes/requests.js`) that call into shared logic. Splitting is for readability, not required for correctness.

### 5.2 Service layer

- **Recommendation:** Introduce a small **service layer** for capacity and reservations (e.g. `services/capacity.js`, `services/reservation.js`) that encapsulate:
  - Transaction boundaries (begin, lock, read, write, commit).
  - Business rules (e.g. "can reserve only if available >= qty", "reservation expires in 15 min").
- Handlers (controllers) then: validate input → call service → return result. Keeps SQL and locking in one place and eases testing.

### 5.3 Validation

- **Input:** Validate `quantity_requested` (min 1, max listing’s total or a global max); validate listing exists and is active; validate user is allowed to request (role check). Use the same pattern as today (e.g. Zod schemas) for request body and query params.
- **Idempotency (optional):** For reserve, consider idempotency key (e.g. client sends `X-Idempotency-Key: uuid`) so duplicate clicks don’t create two reservations; store key in DB or cache and reject duplicate.

---

## 6. Search performance at 100k+ rows

- **Indexes:** Composite indexes on (is_active, type, region), (is_active, type, category), and geo if used; add partial index `WHERE capacity_available > 0` (or equivalent) if we filter by "has availability" often.
- **Avoid:** Full table scan on listings; avoid heavy JSON aggregation in the same query that does filtering.
- **Pagination:** Cursor or offset limit (e.g. LIMIT 20 OFFSET) for listing search; keep page size bounded (e.g. 20–50).
- **Capacity column:** If "available" is a column updated by app, keep it simple (integer); if we compute it on the fly (total − reserved − allocated), use a materialized view or a small summary table updated in the same transaction as reserve/expiry, so search doesn’t need to SUM reservations in real time.

---

## 7. Security risks

- **Over-reservation / abuse:** A user could create many reservations and let them expire, causing churn and locking capacity briefly. Mitigation: rate limit reservation creation per user (e.g. max N active reservations per user, or per user per listing); short TTL (e.g. 15 min) to limit impact.
- **Authorization:** Ensure only the requester can finalize their own request; only the receiver can accept; only the listing owner (or system) can release reservations. Check `request.requester_id` / `receiver_id` and `listing.owner_id` in every operation.
- **Input:** quantity_requested must be <= listing total and within allowed range; prevent negative or huge numbers (validation + DB CHECK if needed).
- **Information leakage:** Don’t expose other users’ active reservations in listing search; only expose "available count" or "X available". Optional: expose "reserved until T" without user identity if product needs it.

---

## 8. Proposed refined schema and flow (summary)

### 8.1 Schema (additions / changes)

- **listings:** Keep `qty` as "total capacity". Optionally add `listing_capacity table: listing_id (PK/FK), total, reserved, allocated, updated_at. Or keep reserved/allocated on listing as columns; both are workable, table is slightly cleaner for locking.
- **requests:** Add `quantity_requested INT NOT NULL DEFAULT 1`, `quantity_accepted INT` (nullable until accept). Optionally `reservation_id UUID` FK to tie request to a reservation.
- **reservations:** id, listing_id, request_id (nullable), user_id, quantity, expires_at, status (active|converted|expired), created_at. Indexes: (listing_id, status), (expires_at) WHERE status = 'active', (request_id).
- **Capacity representation:** Either `listings.reserved`, `listings.allocated` and derived `available = qty - reserved - allocated`, or a single `listing_capacity row per listing with total, reserved, allocated.

### 8.2 Flow (high level)

1. **Requester creates request** (with quantity_requested). Option A: create reservation in same transaction (if "reserve on request" product rule). Option B: create request first; separate "reserve" call that creates reservation linked to request.
2. **Reservation expiry job:** Periodically set active reservations with expires_at < NOW() to expired and increase available (decrease reserved) for that listing.
3. **Receiver accepts:** In transaction: lock capacity; ensure reservation still valid (or check available); update request (status ACCEPTED, quantity_accepted); convert reservation to "allocated" (or mark converted) and update capacity (reserved -= qty, allocated += qty).
4. **Requester finalizes:** In transaction: lock capacity; update request to FINALIZED; ensure capacity already moved to allocated at accept time (no extra step if we did it at accept). Mark other requests for same listing as FILLED as today.
5. **If receiver declines or request is cancelled:** Release reservation (reserved -= qty, available += qty); set reservation status expired/converted as appropriate.

### 8.3 What is not in scope in this proposal

- Full code (as requested).
- Exact API request/response shapes (can be added in a follow-up).
- Migration file content (only structure and flow are proposed).

---

## Next step

Once you confirm or adjust this understanding (especially capacity model, reservation TTL, and partial-request semantics), the next step is to add:
- Exact migration SQL (new tables/columns and indexes), and
- API endpoint list and request/response shapes.

After that, implementation can follow in code.
