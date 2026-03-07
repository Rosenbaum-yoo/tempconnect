# Idempotency – curl examples

Idempotency is **scoped per (user, key)**. Same key for different users does **not** replay; keys **expire after 24h**. Cleanup: `POST /api/internal/cleanup-idempotency` (internal secret).

## Prerequisites

- API base URL, e.g. `BASE=http://localhost:3000`
- Session cookie from login (for write endpoints). Get CSRF and login first:
  ```bash
  CSRF=$(curl -s -c cookies.txt "$BASE/api/csrf" | jq -r .token)
  curl -s -b cookies.txt -c cookies.txt -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
    -d '{"email":"…","password":"…"}' 
  ```

---

## 1) Same user + same key → replay

First request runs the handler and stores the response. Second request with the **same** `Idempotency-Key` (and same user/session) returns the **stored** response without running the handler again.

```bash
KEY="idem-$(date +%s)"
CSRF=$(curl -s -b cookies.txt "$BASE/api/csrf" | jq -r .token)

# First request – creates resource, stored under (user, KEY)
curl -s -b cookies.txt -X POST "$BASE/api/listings" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -H "Idempotency-Key: $KEY" \
  -d '{"category":"Test","region":"Berlin","qty":1}'

# Second request – same key, same user → replayed response (same body, 200/201)
curl -s -b cookies.txt -X POST "$BASE/api/listings" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -H "Idempotency-Key: $KEY" \
  -d '{"category":"Other","region":"Hamburg","qty":2}'
# → Same response as first (e.g. same listing id); handler not run again
```

---

## 2) Different user + same key → NOT replay

User A and User B each use the same idempotency key. They must **not** see each other’s response: each gets their own.

```bash
KEY="shared-key-123"
# Login as user A, create with KEY
# Login as user B (different session), same KEY → must get B’s own response (or new request), not A’s
# Implement by using two cookie files: cookies_a.txt and cookies_b.txt
```

So: **replay is per (user_id, key)**. Different `user_id` (different session) ⇒ different scope ⇒ no replay.

---

## 3) Expired key → treated as new

After **24 hours**, a key is no longer considered valid. The next request with that key is treated as **new** (handler runs, new response stored).

- In tests you can set `expires_at` in the past in the DB and send the same key again → handler runs.
- Or wait 24h and resend the same key → new response.

---

## 4) Missing header on write → warning, request continues

Write requests (POST/PATCH/PUT/DELETE) **without** `Idempotency-Key` still run; the server logs a **warning**. No replay is possible.

```bash
curl -s -b cookies.txt -X POST "$BASE/api/listings" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"category":"Test","region":"Berlin","qty":1}'
# No Idempotency-Key → request is processed; check logs for warning
```

---

## 5) Cleanup expired idempotency rows (internal)

Call the internal cleanup endpoint with the cron secret. Deletes rows where `expires_at < NOW()`.

```bash
SECRET="your-INTERNAL_CRON_SECRET"
curl -s -X POST "$BASE/api/internal/cleanup-idempotency" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: $SECRET" \
  -d '{"batch_size":1000}'
# → { "ok": true, "deleted": N }
```

Schedule this e.g. daily (cron) so the table does not grow indefinitely.
