# TempConnect – Security Guide

## 1. Secret Management

### Pflicht-Secrets (Produktion)
- `SESSION_SECRET` – mind. 64 Zeichen, `openssl rand -hex 32`
- `JWT_SECRET` – mind. 64 Zeichen, eigener Wert
- `INTERNAL_CRON_SECRET` – für `/api/internal/*` Endpoints
- `ADMIN_SECRET` – für `/api/health/status`
- `STRIPE_SECRET_KEY` – Stripe Live Key
- `STRIPE_WEBHOOK_SECRET` – Stripe Webhook Signing Secret

### Secret Rotation
1. Neuen Wert generieren: `openssl rand -hex 32`
2. In `.env` auf dem Server ersetzen
3. `./scripts/prod-update.sh` (API startet neu, liest neue Secrets)
4. **SESSION_SECRET ändern:** Alle User werden ausgeloggt (Sessions invalidiert)
5. **JWT_SECRET ändern:** Alle ausgegebenen Tokens werden ungültig
6. **Empfehlung:** Alle 90 Tage rotieren, sofort bei Verdacht auf Kompromittierung

### Placeholder Detection
Die API erkennt unsichere Platzhalter (`HIER_`, `DEIN_`, `PLACEHOLDER`, leere Strings) und beendet sich in Produktion sofort (`process.exit(1)`).

## 2. Cookie-Sicherheit

Implementiert in `app.js`:
- `httpOnly: true` – kein JavaScript-Zugriff auf Session-Cookie
- `secure: true` – nur über HTTPS (automatisch bei `NODE_ENV=production` oder `BASE_URL=https://...`)
- `sameSite: "lax"` – CSRF-Schutz
- `path: "/"` – Cookie gilt für gesamte Domain
- Session-TTL: 14 Tage (rolling)

## 3. CSRF-Schutz

- Alle schreibenden API-Requests (`POST/PUT/PATCH/DELETE`) erfordern `X-CSRF-Token` Header
- Token wird über `GET /api/csrf` ausgeliefert
- Zusätzlich: `Idempotency-Key` Header auf allen Schreiboperationen

## 4. Datenbank – kein öffentlicher Zugriff

- Produktion: Managed PostgreSQL (Hetzner) – IP-Whitelist auf App-Server
- Docker: DB-Container lauscht nur auf `127.0.0.1` (nie `0.0.0.0`)
- UFW Firewall: Port 5432 ist NICHT geöffnet
- `docker-compose.prod.yml` enthält keinen DB-Container

## 5. Idempotency

- Alle schreibenden Requests erfordern `Idempotency-Key` Header
- Keys werden in PostgreSQL gespeichert (TTL 24h)
- Verhindert doppelte Zahlungen, doppelte Anfragen, Race Conditions
- Cleanup: `/api/internal/cleanup-idempotency` (per Scheduler alle 6h)

## 6. Rate Limiting

- **API global:** 200 Requests / 5 Min pro IP
- **Auth-Endpoints:** 50 Requests / 60s (Login, Register)
- **Request-Endpoints:** 30 Requests / 10 Min
- **Store:** Redis (empfohlen bei HA), Memory (single-instance)
- Konfigurierbar via ENV: `RATE_LIMIT_STORE`, `RATE_LIMIT_API_MAX`, etc.

## 7. Stripe Webhook-Sicherheit

- Webhook-Endpoint: `POST /api/payment/webhook/stripe`
- Signaturprüfung: `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`
- Raw Body erforderlich: `express.raw({ type: "application/json" })`
- Idempotent: Bereits abgeschlossene Payments werden ignoriert

## 8. Deployment-Sicherheit

- `node_modules/` nie im Repo (`.gitignore` + `.dockerignore`)
- `.env` nie im Repo (nur `.env.example`, `.env.prod.example`)
- Docker Images: `npm ci --omit=dev` (keine devDependencies)
- `docker-compose.override.yml` in `.gitignore` – existiert auf Prod nicht
- Prod-Scripts nutzen immer explizite `-f` Flags

---

## Security Hardening (Go-Live Finalisierung)

### SEC-001: Session Fixation Prevention
Alle Login-Flows (Login, Register, Worker-Invite-Accept) regenerieren die Session (`req.session.regenerate()`) **vor** Setzen der userId. Verhindert Session-Fixation-Angriffe.

### SEC-002: Org-Boundary Hardening
- List-Endpoints (`/timesheets`, `/assignments`, `/contracts`) ignorieren client-seitige `org_id`-Query-Parameter und verwenden ausschließlich den server-resolved `req.orgId`.
- `/assignments/:id/transition` und `/assignments/:id/complete` prüfen jetzt Org-Boundary vor Ausführung.

### SEC-003: RBAC Response Sanitization
403-Fehlermeldungen enthalten keine internen Rollennamen, Permissions oder Reason-Codes mehr. Nur generische Fehlermeldung an Client, Details werden serverseitig geloggt.

### SEC-004: CORS Production Lockdown
In `NODE_ENV=production` werden keine localhost-Origins mehr in die CORS-Allowlist aufgenommen. Nur `CORS_ORIGIN` aus ENV.

### SEC-005: Permissions-Policy Header
Neuer HTTP-Header `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()` auf allen Responses.

### SEC-006: Error Code Sanitization
5xx-Fehler geben immer `SERVER_ERROR` zurück, niemals interne System-Codes (ECONNREFUSED, ENOENT etc.).

### SEC-007: bcrypt-Kosten-Konsistenz
Alle Passwort-Hashing-Operationen (Register, Login, Change-Password, Reset) verwenden einheitlich bcrypt cost 12.

### SEC-008: Demo-Login Rate Limiting
`/auth/demo-login` ist jetzt durch `authLimiter` geschützt (max. 5 Versuche / 15 Min in Produktion).

---

## Enterprise Security Additions (Phase 10–12)

### 9. Row-Level Security (RLS)

PostgreSQL RLS policies enforce tenant isolation at the database layer, providing a second line of defence if application-layer org-boundary checks are bypassed.

**Tables with RLS**: `requisitions`, `timesheets`, `invoices`, `org_memberships`, `vendor_pool_entries`, `compliance_documents`

**Policy**: `USING (org_id = current_org_id())`

**Activation**: Before each transaction, the API sets `SET LOCAL app.current_org_id = $1` using the resolved `req.orgId`. The `current_org_id()` function reads this session variable.

**Bypass**: Only the `postgres` superuser and explicit `BYPASSRLS` roles can bypass. Application service user has no bypass privilege.

### 10. Zod Request Validation (`api/middleware/validate.js`)

All critical endpoints now have Zod schema validation:
- Input sanitized and coerced before business logic executes
- Unknown fields stripped by default (`strip` mode)
- Validation errors return structured `400 VALIDATION_ERROR` with field-level messages
- No user input reaches DB queries without schema validation

**Pre-defined schemas**: `register`, `login`, `organizationCreate`, `requisitionCreate`, `capacityPostCreate`, `timesheetSubmit`, `invoiceCreate`, `paymentCheckout`, `dealCreate`, `inviteMember`

### 11. Audit Trail

Immutable audit log captures all create/update/delete actions:
- `action`: dot-notation (e.g. `invoice.void`, `deal.accept`, `org.member.invite`)
- `old_values` / `new_values`: JSONB diff for compliance
- `user_id`, `org_id`, `ip_address`, `user_agent`
- Set via `res.locals.audit` in route handlers; written post-response by `auditWriteMiddleware`
- No UPDATE or DELETE on `audit_log` table exposed via API

### 12. Security Rating Summary

> **Vollständiger Audit-Report:** [docs/SECURITY_AUDIT.md](SECURITY_AUDIT.md) — Detaillierte Prüfung aller 7 Sicherheitsbereiche mit Findings und Fixes.

| Category | Status | Score |
|----------|--------|-------|
| Authentication | Session-based, bcrypt(12), rolling TTL | A |
| Authorization | RBAC + org-boundary + RLS | A |
| Transport | TLS, HSTS, CORS allowlist | A |
| Input Validation | Zod middleware on all critical routes | A- |
| Injection Prevention | Parameterised queries, no dynamic SQL | A |
| CSRF Protection | Double-submit token (crypto.randomBytes) | A |
| Rate Limiting | 4-tier, per-IP, Redis-backed | A- |
| Upload Security | MIME/ext whitelist, Helmet headers, dotfiles deny | B+ |
| Audit & Monitoring | Audit log + Sentry + Prometheus + structured logs | A |
| Secrets Management | Fail-fast validation, placeholder detection, log redaction | A |
| **Overall** | | **A** |

**Path to A+**: MFA for owner/admin, external pen-test, reset-token hashing, signed download URLs, SOC 2 prep.
