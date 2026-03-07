# Enterprise Hardening Patch – Summary

Non-breaking hardening for Model B: idempotency, audit log, reserve lock-down, strict status machine, search indexes, secure cron. Existing APIs unchanged except reserve now requires `request_id` and validates request.

---

## A) Migration SQL

**File:** `sql/migrations/010_enterprise_hardening.sql`

- **idempotency_keys:** `key` (PK), `user_id`, `method`, `path`, `response_status`, `response_body` (JSONB), `created_at`. Index on `created_at`.
- **audit_log:** Append-only. `id`, `created_at`, `actor_id`, `action`, `entity_type`, `entity_id`, `details` (JSONB), `request_id`, `capacity_id`, `reservation_id`. Indexes on `created_at`, `(entity_type, entity_id)`, `actor_id`, `request_id`, `capacity_id`.
- **Index:** `capacity_reservations_capacity_status_expires_idx` on `(capacity_id, status, expires_at)` WHERE `status = 'active'` for search/expiry.

Run once: `docker compose run --rm migrate` (or your migrate command).

---

## B) Code changes (routes / services)

- **Idempotency:** `api/middleware/idempotency.js` – middleware checks `Idempotency-Key` header; if key exists in DB, replays stored response; else runs handler and stores status + JSON body on finish. Applied globally in `server.js` after CSRF.
- **Audit:** `api/services/auditLog.js` – `writeAudit(pool, { action, entity_type, entity_id, details, request_id, capacity_id, reservation_id, actor_id })`. Called from:
  - Capacity: create, update, deactivate (PATCH with `is_active: false`).
  - Reservation: active (reserve + POST /api/requests with capacity_id), converted (accept), expired (decline/cancel + expiry batch).
  - Request: status_change (PATCH listing and capacity), request.accept, request.finalize.
- **Reserve lock-down:** `POST /api/capacities/:capacityId/reserve` now **requires** `request_id` in body; validates request exists, `requester_id = caller`, `capacity_id` matches URL, `status = SENT`, quantity matches, no existing active reservation for that request. Returns 400/403/409 otherwise.
- **Status machine:** Zentrale Logik in **`api/services/stateMachine.js`**: `assertTransition(entityType, fromStatus, toStatus)` für REQUEST, OFFER, RESERVATION; bei ungültigem Übergang wird **409** mit Body `{ "error": "invalid_transition", "entityType": "REQUEST", "from": "...", "to": "..." }` zurückgegeben. Alle Statusänderungen (Requests, Capacity-Reservations) nutzen die State Machine; Transitions werden in `audit_log` geloggt (action `state_machine.transition`). Tests: `api/test/stateMachine.test.js`.
- **Cron:** `POST /api/internal/expire-reservations` – optional `INTERNAL_CRON_ALLOWED_IPS` (comma-separated), `INTERNAL_CRON_SECRET` (rotation-friendly: change env and update caller), rate limit 30/min per IP, structured logging (path, clientIp, expired, batchSize; errors logged). Audit event `reservation.expiry_batch` when expired > 0.

---

## C) Tests

- **File:** `api/test/enterprise-hardening.test.js`
  - Status machine: SENT → ACCEPTED/DECLINED/CANCELED allowed; SENT → FINALIZED rejected; ACCEPTED → FINALIZED/CANCELED allowed; terminal states reject any change.
  - Idempotency path normalization (UUID → :id).
- **File:** `api/test/capacities.test.js` (existing) – reserve NOT_FOUND, search shape, expiry batch.
- Concurrency: reserve/accept still covered by capacity service transactions (SELECT FOR UPDATE); duplicate reserve for same request returns 409 ALREADY_RESERVED.

Run: `npm test` in `api/`.

---

## D) 2+2 verification (curl)

**File:** `docs/ENTERPRISE-HARDENING-VERIFICATION.md`

1. **Idempotency (2):** (1) POST capacity with `Idempotency-Key: test-capacity-create-001`, then same request again → same 201 and same body. (2) PATCH capacity with `Idempotency-Key: test-capacity-patch-001`, then same again → same 200 and body.
2. **Invalid transitions (2):** (3) PATCH request to `FINALIZED` from `SENT` (as requester) → 409 `INVALID_STATUS_TRANSITION`. (4) PATCH request to `ACCEPTED` when already `ACCEPTED` → 409.

Optional: reserve without `request_id` → 400; cron without secret / from disallowed IP → 403; rate limit → 429.

---

## Env (optional)

- `INTERNAL_CRON_SECRET` – required for cron if set; rotation-friendly.
- `INTERNAL_CRON_ALLOWED_IPS` – comma-separated IPs; if set, only these can call expire-reservations.

No new env required for idempotency or audit.

---

## E) Idempotency Enterprise (Migration 012)

**Erweiterung** der Idempotency-Logik (nach 010):

- **Migration:** `sql/migrations/012_idempotency_enterprise.sql`
  - Idempotency pro **(User, Key)** statt global pro Key: Spalte `scope` (= `user_id::text` oder `''`), Unique `(scope, key)`.
  - **Ablauf:** Spalte `expires_at` (Default: NOW() + 24h); abgelaufene Keys werden nicht mehr replayed.
  - **Audit:** Optionale Spalte `request_hash` (SHA-256 des Request-Body).
  - Alte PK auf `key` entfernt, neue Eindeutigkeit über `(scope, key)`.

- **Middleware** (`api/middleware/idempotency.js`):
  - Lookup: `WHERE scope = $1 AND key = $2 AND expires_at > NOW()`.
  - Fehlender Header bei Schreib-Requests: Request wird ausgeführt, **Warnung** ins Log.
  - Speicherung bei Erfolg (2xx): `scope`, `key`, `method`, `path`, `request_hash`, `response_status`, `response_body`, `expires_at`.

- **Cleanup:** `POST /api/internal/cleanup-idempotency` (gleiche Absicherung wie andere Cron-Jobs: `X-Internal-Secret`, optional IP-Allowlist). Löscht Zeilen mit `expires_at < NOW()` (Batch z. B. 1000). Empfehlung: täglich per Cron aufrufen.

- **Tests:** `api/test/idempotency.test.js` (Scope, Replay, unterschiedliche User, abgelaufener Key).
- **Curl/Manuell:** [api/docs/IDEMPOTENCY-CURL.md](../api/docs/IDEMPOTENCY-CURL.md).
