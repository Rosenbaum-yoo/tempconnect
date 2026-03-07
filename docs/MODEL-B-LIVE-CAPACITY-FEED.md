# Model B – Live Capacity Feed (Agency-Centric)

**Aligned with:** capacities as primary pool (not listings.qty), search over capacities, rich requests for accept/decline without back-and-forth, capacity_reservations with 30 min TTL, transactions + SELECT FOR UPDATE on capacities row. Deal = request FINALIZED in Phase 1; design allows adding a `deals` table later without breaking APIs.

---

## 1) Refined schema

### 1.1 Table: `capacities`

Agency-published live capacity feed. One row = one capacity slot (role + region + available_from + headcount).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default uuid_generate_v4() | |
| agency_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE | Only `role = 'agency'` users |
| role | TEXT | NOT NULL | Job role / category (e.g. "Pflege", "Lager") |
| region | TEXT | NOT NULL | Region code or name |
| available_from | DATE | NOT NULL | First date this capacity is available |
| available_workers | INT | NOT NULL, CHECK (>= 0) | Headcount available (effective = this − active reservations) |
| tags | TEXT[] | nullable | Optional qualification/skill tags |
| hourly_rate_cents | INT | nullable | Optional; null = "on request" |
| note | TEXT | nullable | Short note |
| is_active | BOOLEAN | NOT NULL DEFAULT true | Soft on/off |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Indexes:**

- `capacities_agency_id_idx` ON capacities(agency_id)
- `capacities_region_role_active_idx` ON capacities(region, role, is_active) WHERE is_active = TRUE  — main search
- `capacities_available_from_idx` ON capacities(available_from) WHERE is_active = TRUE
- `capacities_agency_active_idx` ON capacities(agency_id, is_active) — agency’s own feed

**Effective availability:**  
`available_workers - COALESCE(SUM(capacity_reservations.quantity) WHERE capacity_reservations.capacity_id = capacities.id AND capacity_reservations.status = 'active', 0)`.  
Not stored on `capacities`; computed when reading or in API.

---

### 1.2 Table: `capacity_reservations`

Temporary hold on a capacity row. TTL 30 minutes. Used to compute effective availability and to prevent double booking.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default uuid_generate_v4() | |
| capacity_id | UUID | NOT NULL, FK → capacities(id) ON DELETE CASCADE | |
| request_id | UUID | nullable, FK → requests(id) ON DELETE SET NULL | Set when request is created and reservation is attached |
| quantity | INT | NOT NULL, CHECK (quantity >= 1) | Workers reserved |
| expires_at | TIMESTAMPTZ | NOT NULL | created_at + 30 min |
| status | TEXT | NOT NULL, CHECK (status IN ('active','converted','expired')) | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Indexes:**

- `capacity_reservations_capacity_status_idx` ON capacity_reservations(capacity_id, status) — effective availability per capacity
- `capacity_reservations_expires_at_idx` ON capacity_reservations(expires_at) WHERE status = 'active' — expiry job
- `capacity_reservations_request_id_idx` ON capacity_reservations(request_id) WHERE request_id IS NOT NULL

**Unique:** Optional: UNIQUE(capacity_id, request_id) WHERE request_id IS NOT NULL to prevent duplicate reservation per request (idempotency).

---

### 1.3 Table: `requests` (extended for Model B)

Keep existing columns for backward compatibility (listing_id can be nullable for capacity-only requests if desired; or keep NOT NULL and use a synthetic “capacity listing” per capacity later). Add capacity_id and rich fields so agencies can accept/decline without back-and-forth.

**Existing (keep):** id, listing_id, requester_id, receiver_id, message, priority, status, contact_email, contact_phone, created_at, updated_at.

**New columns (Model B):**

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| capacity_id | UUID | nullable, FK → capacities(id) ON DELETE SET NULL | Set when request targets a capacity; receiver_id = capacity.agency_id |
| role | TEXT | nullable | Job role (echo or override) |
| quantity | INT | nullable, CHECK (quantity >= 1) | Number of workers requested |
| location_text | TEXT | nullable | Free-text location (e.g. "Standort Hamburg Mitte") |
| region | TEXT | nullable | Region |
| start_date | DATE | nullable | First day |
| end_date | DATE | nullable | Last day (use either end_date or duration_days) |
| duration_days | INT | nullable, CHECK (duration_days >= 1) | If no end_date |
| shift_schedule | JSONB | nullable | e.g. {"mon":["08:00-16:00"],"tue":["08:00-12:00"]} |
| qualification_tags | TEXT[] | nullable | Required skills/tags |
| required_certifications | TEXT[] | nullable | e.g. ["Staplerschein","Erste-Hilfe"] |
| max_hourly_rate_cents | INT | nullable | Optional max rate |
| urgency | TEXT | nullable, CHECK (urgency IN ('normal','high','urgent')) | |
| notes | TEXT | nullable | Additional notes |
| deal_id | UUID | nullable | Phase 2: FK → deals(id); Phase 1 leave null. Enables adding deals table later without changing API contract (API still returns request; internally we can point to deal_id when present). |

**Indexes (add):**

- `requests_capacity_id_idx` ON requests(capacity_id) WHERE capacity_id IS NOT NULL
- `requests_status_created_idx` already exists; keep for FINALIZED = deal listing

**Note:** For Phase 1, `listing_id` can remain NOT NULL if you still create a “virtual” or placeholder listing per capacity for old flows; or make `listing_id` nullable and require either `listing_id` OR `capacity_id` (CHECK constraint or app rule). Document choice in migration.

---

### 1.4 Future `deals` table (Phase 2 – not created in Phase 1)

Design so that when added:

- Add table `deals (id, request_id UNIQUE, ...)` and set `requests.deal_id` when finalizing.
- API can keep returning “deal” as the request with status FINALIZED; or later return `deal_id` in the response. No breaking change if clients only rely on request id and status.

---

## 2) Exact API endpoints and request/response shapes

Base URL prefix: `/api` (e.g. `/api/capacities`). Auth: assume session or JWT; `req.user.id` = current user.

---

### 2.1 Search capacities (primary search – not listings)

**GET** `/api/capacities`

**Query params (all optional):**

- `region` (string)
- `role` (string)
- `available_from` (date, ISO)
- `available_min` (int) – filter capacities with effective available >= this
- `tags` (string, comma-separated) – filter by tags overlap
- `max_rate_cents` (int) – capacity with hourly_rate_cents <= this (or null)
- `page` (int, default 1), `limit` (int, default 20, max 100)

**Response 200:**

```json
{
  "items": [
    {
      "id": "uuid",
      "agency_id": "uuid",
      "agency_company_name": "string",
      "role": "string",
      "region": "string",
      "available_from": "date",
      "available_workers": 5,
      "available_effective": 3,
      "tags": ["tag1", "tag2"],
      "hourly_rate_cents": 4500,
      "note": "string",
      "is_active": true
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

`available_effective` = available_workers − active reservations (computed in query or in app from reservations).

---

### 2.2 Get single capacity

**GET** `/api/capacities/:id`

**Response 200:** Single object like one element of `items` above (with `available_effective`).  
**404** if not found or inactive and caller not owner.

---

### 2.3 Create capacity (agency only)

**POST** `/api/capacities`

**Body:**

```json
{
  "role": "string",
  "region": "string",
  "available_from": "date",
  "available_workers": 1,
  "tags": ["string"],
  "hourly_rate_cents": 4500,
  "note": "string"
}
```

**Response 201:** Created capacity object (same shape as single capacity).  
**400** validation errors; **403** if not agency.

---

### 2.4 Update / deactivate capacity

**PATCH** `/api/capacities/:id`

**Body (all optional):** Same fields as create; plus `is_active: boolean`.  
**Response 200:** Updated capacity. **403** if not owner. **404** if not found.

---

### 2.5 Create request (against a capacity)

**POST** `/api/requests`

**Body (capacity-based request):**

```json
{
  "capacity_id": "uuid",
  "role": "string",
  "quantity": 2,
  "location_text": "string",
  "region": "string",
  "start_date": "date",
  "end_date": "date",
  "duration_days": null,
  "shift_schedule": { "mon": ["08:00-16:00"], "tue": ["08:00-12:00"] },
  "qualification_tags": ["string"],
  "required_certifications": ["string"],
  "max_hourly_rate_cents": 5000,
  "urgency": "normal",
  "notes": "string",
  "message": "string",
  "contact_email": "string",
  "contact_phone": "string"
}
```

Either `end_date` or `duration_days` required (or both; validate consistency).  
`receiver_id` derived from capacity.agency_id server-side.

**Response 201:**

```json
{
  "id": "request-uuid",
  "capacity_id": "uuid",
  "requester_id": "uuid",
  "receiver_id": "uuid",
  "status": "SENT",
  "role": "string",
  "quantity": 2,
  "location_text": "string",
  "region": "string",
  "start_date": "date",
  "end_date": "date",
  "duration_days": null,
  "shift_schedule": { ... },
  "qualification_tags": [],
  "required_certifications": [],
  "max_hourly_rate_cents": 5000,
  "urgency": "normal",
  "notes": "string",
  "message": "string",
  "contact_email": "string",
  "contact_phone": "string",
  "created_at": "iso8601",
  "reservation": {
    "id": "reservation-uuid",
    "expires_at": "iso8601",
    "status": "active"
  }
}
```

If reserve-on-create is used, include `reservation`; otherwise omit or null.

---

### 2.6 Reserve capacity (optional separate step)

If reservation is not created at request creation, expose:

**POST** `/api/capacities/:capacityId/reserve`

**Body:**

```json
{
  "request_id": "uuid",
  "quantity": 2
}
```

**Response 201:**

```json
{
  "id": "reservation-uuid",
  "capacity_id": "uuid",
  "request_id": "uuid",
  "quantity": 2,
  "expires_at": "iso8601",
  "status": "active"
}
```

**409** if not enough effective availability; **404** if capacity or request not found.

---

### 2.7 Accept request (agency)

**POST** `/api/requests/:id/accept`

**Body (optional):**

```json
{
  "quantity_accepted": 2,
  "message": "string"
}
```

**Response 200:** Full request object with `status: "ACCEPTED"`. Reservation converted in same transaction.  
**409** if no longer enough capacity or reservation expired. **403** if not receiver.

---

### 2.8 Decline request

**POST** `/api/requests/:id/decline`

**Body:** `{ "message": "string" }`  
**Response 200:** Request with `status: "DECLINED"`. Any active reservation for this request is expired/released in same transaction.

---

### 2.9 Finalize request (deal – company)

**POST** `/api/requests/:id/finalize`

**Response 200:** Request with `status: "FINALIZED"`. Phase 1: no `deal_id` in response; Phase 2 can add `deal_id` without breaking clients that ignore it.

---

### 2.10 List requests (for requester / receiver)

**GET** `/api/requests?as=requester|receiver&status=SENT|ACCEPTED|...&page=1&limit=20`

**Response 200:** `{ "items": [ request objects ], "total", "page", "limit" }`. Same request shape as create/accept response (include `reservation` if active).

---

### 2.11 Get single request

**GET** `/api/requests/:id`

**Response 200:** Single request object. **404** if not found or no access.

---

## 3) Transaction pseudocode

### 3.1 Reserve (create capacity_reservation)

- **When:** On “Reserve” call (or inside “Create request” when reserve-on-create).
- **Input:** capacity_id, quantity, request_id (optional at reserve time).
- **TTL:** expires_at = NOW() + 30 minutes.

```
BEGIN
  1. SELECT * FROM capacities WHERE id = :capacity_id FOR UPDATE
     → 404 if not found
  2. effective = available_workers - SUM(capacity_reservations.quantity)
                 WHERE capacity_reservations.capacity_id = :capacity_id AND capacity_reservations.status = 'active'
  3. IF effective < quantity THEN ROLLBACK; return 409 "Insufficient capacity"
  4. INSERT INTO capacity_reservations (capacity_id, request_id, quantity, expires_at, status)
     VALUES (:capacity_id, :request_id, :quantity, NOW() + INTERVAL '30 minutes', 'active')
  5. COMMIT
RETURN 201 reservation
```

No UPDATE on capacities; availability is derived from reservations. Lock on capacities row prevents two concurrent reserves from both passing the effective check.

---

### 3.2 Accept request (convert reservation → committed capacity)

- **When:** Agency accepts a request that has an active reservation (or that has enough effective capacity if reservation expired and we allow accept-without-reservation policy).
- **Input:** request_id.

```
BEGIN
  1. SELECT * FROM requests WHERE id = :request_id FOR UPDATE
     → 404 if not found, 403 if current user != receiver_id
  2. IF status != 'SENT' THEN ROLLBACK; return 409 "Invalid state"
  3. Get capacity_id, quantity from request
  4. SELECT * FROM capacities WHERE id = :capacity_id FOR UPDATE
     → 404 if not found
  5. Find active capacity_reservation for this request (request_id = :request_id, status = 'active')
     - If found: effective = available_workers - SUM(active reservations for this capacity) + this_reservation.quantity
                 (we're converting this reservation so we "free" its quantity for the check then commit the reduction)
     - Simpler: effective = available_workers - SUM(active reservations WHERE capacity_id = :capacity_id AND id != this_reservation.id)
                 Then ensure effective >= quantity. Then mark this_reservation.status = 'converted'.
     - If no reservation: effective = available_workers - SUM(active reservations); IF effective < quantity ROLLBACK 409
  6. UPDATE capacity_reservations SET status = 'converted' WHERE request_id = :request_id AND status = 'active'
  7. UPDATE capacities SET available_workers = available_workers - quantity WHERE id = :capacity_id
     (So we reduce capacity permanently on accept; the "slot" is now committed.)
  8. UPDATE requests SET status = 'ACCEPTED', updated_at = NOW() WHERE id = :request_id
  9. COMMIT
RETURN 200 request
```

**Alternative (no stored reserved on capacities):** If we never store “committed” on capacities and only use reservations: then on accept we only convert reservation to 'converted' and do **not** reduce available_workers; “effective available” would be available_workers - SUM(quantity WHERE status = 'active'). So “converted” means “no longer counts against available”. That avoids updating capacities on accept and keeps a single source of truth (reservations). But then we need a notion of “allocated” for reporting (how many of available_workers are already taken by accepted requests). So either:
- **Option A:** On accept: reduce capacities.available_workers by quantity; reservation → converted. (Capacity row is source of truth for “remaining”.)
- **Option B:** Keep available_workers unchanged; effective = available_workers - active_reservations only; “converted” reservations are “committed” and we don’t reduce available_workers until we have a separate “allocations” table or we reduce on finalize.

For simplicity and to avoid double booking after accept: **Option A** is clearer: on accept we reduce available_workers and mark reservation as converted. So capacity row holds “current available” after all commits.

(If we don’t reduce on accept, two accepts could both pass the “effective >= quantity” check before either converts. So we must either reduce available_workers on accept (Option A) or lock and re-check “active reservations” and then insert a “commit” record and treat “effective = available_workers - active - converted_quantity” so that converted still “consumes” availability. That’s Option B with converted still reducing effective. Easiest: Option A – UPDATE capacities SET available_workers = available_workers - quantity on accept.)

---

### 3.3 Finalize request (deal – Phase 1)

- **When:** Company finalizes an ACCEPTED request.
- **Input:** request_id.

```
BEGIN
  1. SELECT * FROM requests WHERE id = :request_id FOR UPDATE
  2. IF status != 'ACCEPTED' THEN ROLLBACK; return 409
  3. (Optional) Mark other requests for same capacity as FILLED if business rule requires it
  4. UPDATE requests SET status = 'FINALIZED', updated_at = NOW() [ Phase 2: set deal_id when deals row created ]
  5. COMMIT
RETURN 200 request
```

No capacity row update at finalize if we already reduced available_workers at accept. Phase 2: insert into deals and set requests.deal_id in same transaction.

---

### 3.4 Decline / cancel request (release reservation)

- **When:** Agency declines or requester cancels; release any active reservation.

```
BEGIN
  1. SELECT * FROM requests WHERE id = :request_id FOR UPDATE
  2. Get capacity_id, quantity from request; get active reservation for this request if any
  3. UPDATE capacity_reservations SET status = 'expired' WHERE request_id = :request_id AND status = 'active'
  4. (No need to update capacities.available_workers if we never reduced it for a reservation – availability is effective = available_workers - active reservations. So just expiring the reservation is enough.)
  5. UPDATE requests SET status = 'DECLINED'|'CANCELED', updated_at = NOW()
  6. COMMIT
RETURN 200
```

If we had chosen to reduce available_workers on reserve (which we don’t in the schema above – we only compute effective), then on decline we wouldn’t need to add back. So current design: reserve doesn’t touch available_workers; only accept does. So decline: just expire reservation + update request.

---

### 3.5 Expiry job (batch)

- **When:** Every 1–5 minutes (cron or worker).
- **Goal:** Set status = 'expired' for active reservations where expires_at < NOW(). No capacity row update (availability is computed from active reservations only).

```
In a loop (or batch by capacity_id to limit lock time):
  BEGIN
    1. SELECT id, capacity_id, quantity FROM capacity_reservations
       WHERE status = 'active' AND expires_at < NOW()
       ORDER BY expires_at ASC
       LIMIT :batch_size
    2. For each row (or group by capacity_id):
       - SELECT * FROM capacities WHERE id = capacity_id FOR UPDATE
       - UPDATE capacity_reservations SET status = 'expired' WHERE id IN (:ids)
       - (No capacities.available_workers change – we didn’t reduce it on reserve)
    3. COMMIT
  END
```

If we had reduced available_workers on reserve, we would add back on expiry:  
`UPDATE capacities SET available_workers = available_workers + :quantity WHERE id = :capacity_id`.  
In the proposed schema, reserve does not change available_workers; only accept does, so expiry only flips status to 'expired'.

---

## 4) Consistency note: reserve vs capacity row

- **Recommended:** Reserve does **not** update `capacities.available_workers`. Effective availability = `available_workers - SUM(active reservations)`. On **accept**, do `UPDATE capacities SET available_workers = available_workers - quantity` and set reservation to 'converted'. So:
  - Reserve: lock capacity, check effective >= quantity, INSERT reservation.
  - Accept: lock capacity + request, convert reservation, reduce available_workers.
  - Expiry: only UPDATE reservation status to 'expired'; no capacity change.

This keeps a single place (capacity row) that holds “committed” headcount; reservations only hold “tentative” and are computed for effective availability.

---

## 5) Summary

| Item | Content |
|------|--------|
| **Schema** | `capacities` (agency_id, role, region, available_from, available_workers, tags, hourly_rate_cents, …), `capacity_reservations` (capacity_id, request_id, quantity, expires_at 30 min, status), `requests` extended (capacity_id, role, quantity, location_text, region, start_date, end_date/duration_days, shift_schedule, qualification_tags, required_certifications, max_hourly_rate_cents, urgency, notes, deal_id nullable). |
| **Search** | GET /api/capacities (query params); reads from capacities + effective availability from reservations. |
| **APIs** | Capacities CRUD, GET capacities search, POST request (rich body), reserve (optional), accept, decline, finalize, list/get requests. |
| **Transactions** | Reserve: lock capacity, check effective, INSERT reservation. Accept: lock request + capacity, convert reservation, reduce available_workers, update request. Finalize: lock request, set FINALIZED (Phase 2: create deal, set deal_id). Expiry: batch select active+expired, lock capacity, set status expired. |

No full code in this document; implementation is in the repo; see **`MODEL-B-IMPLEMENTATION.md`** for run instructions, code locations, and AI/future-development notes.

---

## 6) Empfehlungen und Hinweise für KI

*(Das Projekt wird mit KI-Unterstützung weiterentwickelt. Diese Punkte geben Architektur-Empfehlungen und Orientierung für KI und Menschen.)*

### Architektur-Empfehlungen

- **Option A beibehalten:** Reserve ändert nicht `capacities.available_workers`; nur Accept reduziert. Andere Varianten würden Doppelbuchungs- und Konsistenzregeln ändern – nur anpassen, wenn bewusst neu spezifiziert.
- **available_effective nur aus active:** Nur Reservierungen mit `status = 'active'` in die Berechnung von „verfügbar“ einbeziehen; `converted` und `expired` ignorieren. So bleibt eine einzige, klare Definition.
- **Transaktionen + SELECT FOR UPDATE:** Jede Änderung an Kapazität/Reservierung (reserve, accept, finalize, expiry) muss die betroffene Capacity-Zeile in einer Transaktion mit `SELECT FOR UPDATE` sperren, um Race Conditions und Doppelbuchung zu vermeiden. Keine Lock-Reihenfolge über mehrere Tabellen, die Deadlocks begünstigt (immer zuerst capacity, dann ggf. request).
- **Expiry als Batch:** Ablauf-Job in Batches (z. B. LIMIT 100) ausführen und pro Batch committen, um lange Locks zu vermeiden.

### Für KI / weitere Entwicklung

- **Implementierungs-Doku nutzen:** Für „Was tun, damit es läuft“, Code-Stellen, Empfehlungen und konkrete Hinweise für KI siehe **`docs/MODEL-B-IMPLEMENTATION.md`** (Abschnitte „Empfehlungen“, „Hinweise für KI / weitere Entwicklung“, „Nützliche Stellen im Code“).
- **Vor Änderungen Doku lesen:** Vor Änderungen an Schema, Reserve-/Accept-Logik oder API diese Datei und MODEL-B-IMPLEMENTATION.md lesen, damit Semantik und Constraints (z. B. CHECK capacity_id/listing_id) erhalten bleiben.
- **Neue Features:** Neue Capacity-/Reservierungs-Logik im Service-Layer (`capacityService.js`) implementieren; Routen nur Validierung und Aufruf. Neue Tabellen/Spalten nur per Migration in `sql/migrations/` anlegen.
