# Go-Live Test Matrix

This document defines the test scenarios to be verified before each production
deployment. Tests are organized by domain with risk level ratings.

Risk levels:
- **CRITICAL** — Blocking for go-live; data integrity or security impact
- **HIGH** — Must pass; direct revenue or UX impact
- **MEDIUM** — Should pass; degraded but functional service if failing
- **LOW** — Nice to have; cosmetic or edge-case

---

## 1. Authentication & Session Security

| # | Test | Expected Result | Risk | Coverage |
|---|------|----------------|------|----------|
| 1.1 | Register new user with valid credentials | 201, session created, confirmation email queued | CRITICAL | Integration: auth.flow |
| 1.2 | Register with existing email | 409 ALREADY_EXISTS | CRITICAL | Integration: auth.flow |
| 1.3 | Register with password < 8 chars | 400 validation error | HIGH | Integration: auth.flow |
| 1.4 | Login with correct credentials | 200, session cookie set | CRITICAL | Integration: auth.flow |
| 1.5 | Login with wrong password | 401 INVALID_CREDENTIALS | CRITICAL | Integration: auth.flow |
| 1.6 | Login with unknown email | 401 INVALID_CREDENTIALS | CRITICAL | Integration: auth.flow |
| 1.7 | `GET /api/auth/me` with valid session | 200, user data returned | HIGH | Integration: auth.flow |
| 1.8 | `GET /api/auth/me` without session | 401 | HIGH | Integration: auth.flow, rbac.flow |
| 1.9 | Logout with valid CSRF token | 200, session destroyed | HIGH | Integration: auth.flow |
| 1.10 | Logout without CSRF token | 403 | CRITICAL | Integration: auth.flow |
| 1.11 | bcrypt cost factor = 12 | Passwords hashed with cost 12 | CRITICAL | Unit: auth |
| 1.12 | Password reset flow (request → token → reset) | Password updated, old sessions invalidated | HIGH | Manual |

---

## 2. CSRF Protection

| # | Test | Expected Result | Risk | Coverage |
|---|------|----------------|------|----------|
| 2.1 | POST without CSRF header | 403 CSRF_INVALID | CRITICAL | Integration: rbac.flow |
| 2.2 | POST with wrong CSRF token | 403 CSRF_INVALID | CRITICAL | Integration: auth.flow |
| 2.3 | POST with valid CSRF token | Request proceeds normally | CRITICAL | Integration: multiple flows |
| 2.4 | CSRF token changes after logout/re-login | New token issued | HIGH | Manual |
| 2.5 | CSRF token tied to session | Cross-session token rejected | CRITICAL | Integration: rbac.flow |

---

## 3. Authorization & RBAC

| # | Test | Expected Result | Risk | Coverage |
|---|------|----------------|------|----------|
| 3.1 | Unauthenticated access to `/api/invoices` | 401 | CRITICAL | Integration: rbac.flow |
| 3.2 | Unauthenticated access to `/api/requisitions` | 401 | CRITICAL | Integration: rbac.flow |
| 3.3 | Unauthenticated access to `/api/payment/history` | 401 | CRITICAL | Integration: rbac.flow |
| 3.4 | User A cannot read User B's invoices | 403 or empty result | CRITICAL | Integration: invoice.flow |
| 3.5 | User A cannot read User B's requisitions | 403 or empty result | CRITICAL | Integration: requisition.flow |
| 3.6 | `/api/admin/status` without secret | 401 or 403 | CRITICAL | Integration: rbac.flow |
| 3.7 | `/api/admin/status` with wrong secret | 401 or 403 | CRITICAL | Integration: rbac.flow |
| 3.8 | `/api/admin/status` with correct secret | 200, status data | HIGH | Integration: rbac.flow |

---

## 4. Public Endpoints

| # | Test | Expected Result | Risk | Coverage |
|---|------|----------------|------|----------|
| 4.1 | `GET /api/health` (no auth) | 200, `{ status: "ok" }` | HIGH | Integration: rbac.flow |
| 4.2 | `GET /api/service-status` (no auth) | 200, service status object | MEDIUM | Integration: rbac.flow |
| 4.3 | `GET /api/csrf` (no auth) | 200, CSRF token returned | HIGH | Integration: auth.flow |

---

## 5. Requisition Lifecycle

| # | Test | Expected Result | Risk | Coverage |
|---|------|----------------|------|----------|
| 5.1 | Create requisition with valid body | 201, requisition object | HIGH | Integration: requisition.flow |
| 5.2 | Create requisition without CSRF | 403 | CRITICAL | Integration: rbac.flow |
| 5.3 | Create requisition unauthenticated | 401 | CRITICAL | Integration: requisition.flow |
| 5.4 | Create requisition with invalid body | 400 validation error | HIGH | Integration: requisition.flow |
| 5.5 | List own requisitions | 200, array or paged result | HIGH | Integration: requisition.flow |
| 5.6 | Get requisition by ID (owner) | 200, full object | HIGH | Integration: requisition.flow |
| 5.7 | Get requisition by ID (other org) | 404 or 403 | CRITICAL | Integration: requisition.flow |
| 5.8 | PATCH status: valid transition | 200, new status | HIGH | Integration: requisition.flow |
| 5.9 | PATCH status: invalid transition | 409 INVALID_TRANSITION | HIGH | Integration: requisition.flow |
| 5.10 | Org isolation: list returns only own items | Other org's items absent | CRITICAL | Integration: requisition.flow |

---

## 6. Payment & Invoicing

| # | Test | Expected Result | Risk | Coverage |
|---|------|----------------|------|----------|
| 6.1 | `GET /api/payment/config` returns plans | 200, mode + plans | MEDIUM | Integration: invoice.flow |
| 6.2 | Checkout (demo) with valid plan | 200, `checkout_id` returned | HIGH | Integration: invoice.flow |
| 6.3 | Checkout with invalid plan | 400 | HIGH | Integration: invoice.flow |
| 6.4 | Confirm with valid checkout_id | 200, `ok: true`, plan activated | CRITICAL | Integration: invoice.flow |
| 6.5 | Confirm same checkout_id twice | 400 ALREADY_COMPLETED | HIGH | Integration: invoice.flow |
| 6.6 | Invoice created after confirm | Invoice visible in `/api/invoices` | CRITICAL | Integration: invoice.flow |
| 6.7 | List invoices (authenticated) | 200, array/paged result | HIGH | Integration: invoice.flow |
| 6.8 | List invoices (unauthenticated) | 401 | CRITICAL | Integration: invoice.flow |
| 6.9 | Get invoice detail (owner) | 200, invoice data | MEDIUM | Integration: invoice.flow |
| 6.10 | Void invoice (valid state) | 200, status = voided | HIGH | Integration: invoice.flow |
| 6.11 | Void invoice (already voided) | 400 or 409 | MEDIUM | Manual |
| 6.12 | Payment history after checkout | Checkout visible in history | MEDIUM | Integration: invoice.flow |
| 6.13 | Stripe webhook validates signature | Unsigned webhook rejected | CRITICAL | Unit: payment |

---

## 7. Email Notifications

| # | Test | Expected Result | Risk | Coverage |
|---|------|----------------|------|----------|
| 7.1 | Registration triggers welcome email | Email queued/sent | HIGH | Unit: emailHtmlTemplates |
| 7.2 | Password reset email rendered correctly | Valid HTML, token present | HIGH | Unit: emailHtmlTemplates |
| 7.3 | Invoice created email rendered correctly | Valid HTML, amount present | HIGH | Unit: emailHtmlTemplates |
| 7.4 | SMTP nicht konfiguriert wirft keinen Fehler | Emails werden uebersprungen, kein Crash | MEDIUM | Unit: emailHtmlTemplates |
|| 7.5 | Keine Emails im Test-Modus | `SMTP_HOST` leer oder nicht gesetzt | HIGH | Env config |

---

## 8. Data Integrity & Security

| # | Test | Expected Result | Risk | Coverage |
|---|------|----------------|------|----------|
| 8.1 | SQL injection attempt in login | 401 (not 500) | CRITICAL | Manual / SAST |
| 8.2 | XSS payload in requisition title | Stored escaped, not executed | HIGH | Manual |
| 8.3 | Rate limiting on auth endpoints | 429 after threshold | HIGH | Manual |
| 8.4 | `node --check` on all JS files | Zero syntax errors | CRITICAL | CI: lint-typecheck |
| 8.5 | RLS migration applied (`031_rls_prep.sql`) | Row-level security active | CRITICAL | DB verification |
| 8.6 | Performance indexes applied (`032_*`) | Query plans use indexes | MEDIUM | DB `EXPLAIN ANALYZE` |
| 8.7 | SESSION_SECRET length ≥ 32 chars | Config validates on startup | CRITICAL | Unit: config |
| 8.8 | Secrets not logged or exposed in error bodies | No secrets in responses | CRITICAL | Code review |

---

## 9. Infrastructure & Observability

| # | Test | Expected Result | Risk | Coverage |
|---|------|----------------|------|----------|
| 9.1 | App starts without error | Process exits 0 on `node --check` | HIGH | CI |
| 9.2 | DB connection pool established | No connection errors at boot | CRITICAL | Manual smoke test |
| 9.3 | Health endpoint reflects DB connectivity | `db: "ok"` in service-status | HIGH | Integration: rbac.flow |
| 9.4 | Graceful shutdown on SIGTERM | In-flight requests complete | MEDIUM | Manual |
| 9.5 | Error responses never expose stack traces | `NODE_ENV=production` set | HIGH | Config |
| 9.6 | HTTPS-only cookies in production | `secure: true` on session cookie | CRITICAL | Manual / Config |

---

## Pre-Deploy Checklist

Before every production deployment, confirm:

- [ ] `npm run verify` passes (syntax + unit tests)
- [ ] All CRITICAL items above have passed in staging
- [ ] Database migrations applied and verified
- [ ] `NODE_ENV=production` set in environment
- [ ] `SESSION_SECRET` is at least 32 random characters
- [ ] `PAYMENT_MODE` is set correctly (`demo` or `stripe`)
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set if `PAYMENT_MODE=stripe`
- [ ] `SMTP_HOST` ist auf echten Mail-Provider gesetzt (nicht leer)
- [ ] `ADMIN_SECRET` is a strong, random value
- [ ] Integration test suite passed against staging DB
- [ ] No new critical security advisories in `npm audit`

---

## Regression Baseline

After any significant feature change, re-run this matrix against staging before
promoting to production. All CRITICAL and HIGH items must pass without exception.
