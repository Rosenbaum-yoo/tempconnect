# Enterprise Hardening – Verification (2+2 curl steps)

After applying migration `010_enterprise_hardening.sql` and deploying the API, use these steps to verify idempotency, invalid transitions, and cron security. Base URL: your API root (e.g. `http://localhost:3000`). You need a valid session cookie for write endpoints (login first).

---

## 1) Idempotency (2 steps)

### 1.1 Same Idempotency-Key returns same response (POST)

1. Login and get session cookie (e.g. `Cookie: connect.sid=...`).
2. Create a capacity **once** with a fixed idempotency key:

```bash
curl -s -X POST "http://localhost:3000/api/capacities" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-capacity-create-001" \
  -H "Cookie: connect.sid=YOUR_SESSION" \
  -H "x-csrf-token: YOUR_CSRF" \
  -d '{"role":"Test","region":"Berlin","available_from":"2026-03-01","available_workers":2}'
```

Note the response (e.g. `id`, 201).

3. Send the **same** request again (same URL, same body, same `Idempotency-Key`).

**Expected:** Same HTTP status (201) and same body (same capacity `id`). The second request must not create a second capacity; it replays the stored response.

### 1.2 Replay on PATCH (optional second check)

1. PATCH the same capacity with an idempotency key:

```bash
curl -s -X PATCH "http://localhost:3000/api/capacities/CAPACITY_ID" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-capacity-patch-001" \
  -H "Cookie: connect.sid=YOUR_SESSION" \
  -H "x-csrf-token: YOUR_CSRF" \
  -d '{"note":"Updated"}'
```

2. Repeat the same PATCH with the same key.

**Expected:** Same status and same body (replayed).

---

## 2) Invalid status transitions (2 steps)

### 2.1 Finalize only from ACCEPTED (409)

1. Create a **capacity-based request** (POST /api/requests with `capacity_id`, etc.) so you have a request in status `SENT`.
2. As the **requester** (company), call PATCH to set status to `FINALIZED` **without** first accepting:

```bash
curl -s -X PATCH "http://localhost:3000/api/requests/REQUEST_ID" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=COMPANY_SESSION" \
  -H "x-csrf-token: YOUR_CSRF" \
  -d '{"status":"FINALIZED"}'
```

**Expected:** `409` with body containing `INVALID_STATUS_TRANSITION` and `from: "SENT"`, `to: "FINALIZED"`. Finalize is only allowed from ACCEPTED.

### 2.2 Accept only from SENT (409)

1. Use a request that is already **ACCEPTED** (or create one and accept it as agency).
2. As the **receiver** (agency), call PATCH again with status `ACCEPTED`:

```bash
curl -s -X PATCH "http://localhost:3000/api/requests/REQUEST_ID" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=AGENCY_SESSION" \
  -H "x-csrf-token: YOUR_CSRF" \
  -d '{"status":"ACCEPTED"}'
```

**Expected:** `409` with `INVALID_STATUS_TRANSITION` (from ACCEPTED to ACCEPTED not allowed).

---

## 2+2 summary

| # | What | Expected |
|---|------|----------|
| 1 | POST with Idempotency-Key, then same request again | Same 201 + same body (replay) |
| 2 | PATCH with Idempotency-Key, then same request again | Same 200 + same body (replay) |
| 3 | PATCH request to FINALIZED from SENT | 409 INVALID_STATUS_TRANSITION |
| 4 | PATCH request to ACCEPTED when already ACCEPTED | 409 INVALID_STATUS_TRANSITION |

---

## Optional: Reserve lock-down

Reserve endpoint requires `request_id` and validates request (SENT, capacity_id matches, etc.):

```bash
# Missing request_id -> 400
curl -s -X POST "http://localhost:3000/api/capacities/CAPACITY_ID/reserve" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION" \
  -H "x-csrf-token: YOUR_CSRF" \
  -d '{"quantity":1}'
# Expected: 400, message "request_id required for reserve"
```

---

## Optional: Cron security

- Without `X-Internal-Secret` (and with `INTERNAL_CRON_SECRET` set): `403 FORBIDDEN`.
- With wrong secret: `403 FORBIDDEN`.
- With `INTERNAL_CRON_ALLOWED_IPS` set, request from non-allowlisted IP: `403 IP not allowlisted`.
- Rate limit: many requests in 1 minute -> `429 CRON_RATE_LIMIT` (or 403 depending on rate-limit response).

Secret is rotation-friendly: change `INTERNAL_CRON_SECRET` in env and update the cron caller to send the new value; no dual-secret or downtime required.
