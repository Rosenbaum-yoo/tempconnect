# TempConnect — Enterprise Platform Audit

**Audit Version:** 1.0  
**Date:** 2026-03-09  
**Scope:** Full repository review (API, Frontend, Infrastructure, Database, Security)  
**Classification:** Internal – Engineering & Investor Use

---

## Executive Summary

TempConnect is a B2B SaaS platform for the temporary staffing market, combining a **marketplace**, a **Vendor Management System (VMS)**, and a **Workforce Extension module** (worker portal + timesheets). The codebase has been built with strong enterprise patterns — multi-tenancy, state machines, RBAC, idempotency, audit logging — significantly beyond what is typical for a solo or small-team project at this stage.

**Key Strengths:**
- PostgreSQL data model is production-grade (29 migrations, proper constraints, UUID PKs)
- RBAC system with 8 roles, 30+ permissions, and role-hierarchy inheritance
- State machines for all critical domain objects (Request, Requisition, Deal, Submission)
- Idempotency keys prevent duplicate processing in payment and mutation flows
- Structured logging (pino), Sentry integration, correlation IDs, request tracing
- Docker Compose deployment with health checks, migration runner, Redis, Mailpit (dev)

**Critical Gaps (must address before investor-grade launch):**
1. No TypeScript — no compile-time safety for a 43-service, 50-route codebase
2. Test coverage estimated at ~8% — only 6 test files for 48 services
3. No invoice generation system — essential for B2B SaaS revenue recognition
4. Email templates are plain-text only — not acceptable for enterprise clients
5. No Row-Level Security at database layer — defense-in-depth gap
6. Stripe is configured for demo mode — production payment flow needs Price IDs
7. Frontend is ~50 Vanilla JS HTML pages — maintainability bottleneck at scale

---

## 1. Architecture Overview

### System Topology

```
┌──────────────────────────────────────────────────────────────────┐
│                         Client Browser                           │
│        Static HTML/Vanilla JS (50+ pages, Nginx-served)          │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTP/HTTPS
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Nginx (reverse proxy)                     │
│             Static files + proxy_pass /api → API container       │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Node.js 20 API (Express 4)                     │
│                   ESM modules, port 3000                         │
│                                                                  │
│  Middleware stack (in order):                                    │
│  1. express.json (1 MB limit)                                    │
│  2. correlationMiddleware (X-Request-ID / X-Correlation-ID)      │
│  3. Request logger (pino, structured JSON)                       │
│  4. Helmet (CSP, HSTS, referrer-policy)                         │
│  5. CORS (allowlist-based)                                       │
│  6. express-session (PostgreSQL store, 14-day TTL)               │
│  7. csrfProtect (token-per-session, skip GET/HEAD/OPTIONS)       │
│  8. idempotencyMiddleware (PostgreSQL-backed)                    │
│  9. orgContextMiddleware (resolves org from session)             │
│  10. auditWriteMiddleware (async audit trail)                    │
│  11. rateLimiters (Redis-backed, per-route limits)               │
│                                                                  │
│  54 Route modules, 48 Service modules                            │
│  4 Background Workers (BullMQ/Redis)                             │
└──────────┬──────────────────────────────────┬────────────────────┘
           │                                  │
           ▼                                  ▼
┌──────────────────┐                ┌─────────────────────────┐
│   PostgreSQL 16  │                │   Redis 7               │
│   (Primary DB)   │                │   (Sessions, Rate Limit │
│   29 migrations  │                │    BullMQ job queues)   │
│   ~55 tables     │                └─────────────────────────┘
│   Managed via    │
│   migrate.sh     │
└──────────────────┘
```

### Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Node.js | 20 LTS | ESM modules (`"type": "module"`) |
| Web Framework | Express | 4.19 | Standard, battle-tested |
| Database | PostgreSQL | 16 | Managed Hetzner recommended |
| Cache / Queue | Redis | 7 | Rate limiting + BullMQ |
| Job Queue | BullMQ | 5.x | Email, Match, Capacity, Worker queues |
| Session Store | connect-pg-simple | 10.x | PostgreSQL-backed sessions |
| Security | Helmet 7 | 7.x | CSP, HSTS, frame protection |
| Auth | bcryptjs | 2.4 | Password hashing, cost factor 10 |
| Validation | Zod | 3.23 | Schema validation |
| Email | Nodemailer | 6.9 | SMTP with connection pooling |
| Payments | Stripe SDK | 14.x | Checkout + Webhooks |
| Monitoring | Pino 9 + Sentry | latest | Structured logs + error tracking |
| Search (opt.) | Meilisearch | — | Optional full-text search |
| Container | Docker Compose | v2 | Multi-service stack |
| Reverse Proxy | Nginx | alpine | Static files + API proxy |

---

## 2. Database Structure Summary

### Migration History

| Migration | Module | Key Tables |
|-----------|--------|-----------|
| 001–005 | Core | users, listings, requests, subscriptions, proofs |
| 006–010 | Ratings, DSGVO, SLA | ratings, sla_events, gdpr_exports |
| 011–015 | Payments, Geo | payment_sessions, geo_cache |
| 016–020 | Enterprise Hardening | session, idempotency_keys, audit_log |
| 021–023 | Marketplace V2 | capacity_posts, demand_requests, capacity_reservations |
| 024 | Matching | capacity_offers, sla_search_jobs |
| 025 | VMS Core | organizations, org_memberships, vendor_pool, requisitions, requisition_events, requisition_candidates |
| 026 | VMS Compliance | compliance_documents, requisition_compliance_links |
| 027 | Timesheets | timesheets, timesheet_entries, timesheet_events |
| 028 | Enterprise Plan | plan upgrades, capacity_exchange |
| 029 | Worker Module | worker_profiles, worker_invites, worker_assignment_links, worker_time_submissions, worker_time_submission_entries, worker_submission_events, billing_usage_metrics |

### Key Design Patterns

**Multi-tenancy:** All org-scoped tables carry `org_id` (UUID FK to `organizations`). The `orgContextMiddleware` resolves the active org from the session and attaches it to `req`. Service layer enforces `WHERE org_id = $n` on all queries.

**Audit Trail:** `audit_log` table receives every state-changing operation via `auditWriteMiddleware`. Captures: `action`, `entity_type`, `entity_id`, `actor_id`, `old_values`, `new_values`, `details`.

**State Machines:** Defined in `stateMachine.js` for:
- `REQUEST`: SENT → ACCEPTED/DECLINED/CANCELED → FINALIZED/FILLED/CANCELED
- `REQUISITION`: DRAFT → PENDING_APPROVAL → APPROVED → OPEN → IN_REVIEW → SHORTLISTED → FILLED → CLOSED/CANCELLED
- `DEAL`: CREATED → OFFER_SENT → ACCEPTED → CONFIRMED → ASSIGNMENT_STARTED → COMPLETED/CANCELLED
- `SUBMISSION`: DRAFT → SUBMITTED → UNDER_REVIEW → ACCEPTED/REJECTED/WITHDRAWN
- `CAPACITY_POST`: draft → active → paused/filled/expired → archived

**Idempotency:** `idempotency_keys` table prevents duplicate mutations. BullMQ jobs use idempotency keys. Payment confirmations check for duplicate session processing.

### Critical Indexes (existing)

```sql
-- Users
idx on users(email) – login lookup
-- Requests  
idx on requests(listing_id, status)
idx on requests(requester_id, status)
-- Audit Log
idx on audit_log(actor_id, created_at)
-- Worker submissions
idx on worker_time_submissions(worker_user_id, status, week_start DESC)
idx on worker_time_submissions(supplier_org_id, status, week_start DESC)
```

### Missing Indexes (Performance Risk)

See `sql/migrations/032_performance_indexes.sql` for additions:
- `requisitions(org_id, status)` WHERE status NOT IN terminal states
- `capacity_posts(is_active, role, location_city)` — matching query hot path
- `org_memberships(user_id, is_active)` — frequently resolved per request
- `worker_assignment_links(supplier_org_id, is_active)` — timesheet lookups

---

## 3. Service Layer Description

### Core Services (48 total)

**Authentication & Users**
- `authService.js` — register, login, password reset, email verification
- `userService.js` — getUserAndPlan, profile updates, PLAN_LIMITS constants, data export

**Organization & RBAC**
- `organizationService.js` — org CRUD, member management, locations, departments
- `rbacService.js` — PERMISSIONS matrix (30+ permissions), ROLE_HIERARCHY, checkPermission, getMembership
- `settingsService.js` — org-level settings

**Marketplace**
- `listingService.js` — listings CRUD, notdienst flag
- `requestService.js` — send, accept, decline, finalize requests, SLA event injection
- `marketplaceService.js` — search, broadcast, filtering
- `dealWorkflow.js` — deal state transitions, contact exchange

**VMS**
- `requisitionService.js` — full requisition lifecycle, approval workflow, event history
- `vendorPoolService.js` — vendor pool CRUD, tier management (PREFERRED/STANDARD/RESTRICTED/BLOCKED)
- `approvalService.js` — approval chains, approve/reject decisions
- `complianceDocService.js` — document upload, traffic-light status logic (11 doc types)
- `contractService.js` — contract CRUD, termination
- `assignmentService.js` — assignment lifecycle, capacity link

**Workforce Extension**
- `workerService.js` — worker profile CRUD, invitation management (token system, SHA-256 hash)
- `workerSubmissionService.js` — timesheet submission lifecycle (7-state machine)
- `workerNotificationService.js` — worker-facing notification system

**Capacity Exchange**
- `capacityExchangeService.js` — capacity post CRUD, interest expression
- `capacityDiscoveryService.js` — discovery with geo-scoring
- `capacityService.js` — legacy capacity management

**Matching**
- `matchingEngine.js` — 6-factor scoring (role 30%, skills 25%, location 25%, availability 10%, verified 5%, vendorPool 5%), batch matching, reverse matching
- `slaSearchService.js` — SLA-based search jobs

**Analytics & Reporting**
- `reportingService.js` — executive dashboard, vendor metrics
- `analyticsService.js` — activity analytics
- `platformMetricsService.js` — platform-wide KPIs
- `supplierMetricsService.js` — supplier performance metrics

**Infrastructure**
- `slaService.js` — SLA event recording, BREACHED scan, Notdienst escalation
- `idempotencyService.js` — idempotency key management
- `auditLog.js` — audit write, structured logging
- `emailService.js` — Nodemailer wrapper
- `paymentService.js` — payment session CRUD, plan activation
- `healthService.js` — component health checks

### Background Workers (BullMQ)

| Worker | Queue | Jobs |
|--------|-------|------|
| `emailWorker.js` | `email` | Send transactional emails async |
| `matchWorker.js` | `match` | Auto-match requisitions to capacity |
| `capacityWorker.js` | `capacity` | Expire capacity reservations, cleanup |
| `workerWorker.js` | `worker` | Worker-portal notification processing |

---

## 4. Security Posture

### Authentication
- Session-based auth (not JWT for primary auth). `express-session` with PostgreSQL store.
- Session cookie: `httpOnly: true`, `sameSite: lax`, `secure: true` in production, 14-day TTL.
- `bcryptjs` password hashing, cost factor 10 (adequate; consider 12 for future).
- Email verification required before login.
- Password reset via crypto-secure 48-byte hex tokens with 1h expiry.

### CSRF Protection
- Custom token-per-session implementation in `auth.js`.
- All state-changing requests (POST/PUT/PATCH/DELETE) require `X-CSRF-Token` header.
- Token refreshed on 403 CSRF_INVALID response (auto-retry in frontend).
- **Gap:** Standard CSRF library (`csurf`) would add timing-safe comparison; current implementation uses `===` string comparison. Low risk with HTTPS but worth addressing.

### Content Security Policy (Helmet)
```
default-src: 'self'
script-src:  'self'
style-src:   'self', 'unsafe-inline'   ← (improvement: use nonce-based)
img-src:     'self', data:
connect-src: 'self'
frame-ancestors: 'self'
```
**Gap:** `unsafe-inline` for styles allows potential CSS injection. Nonce-based CSP would be more secure.

### Role-Based Access Control
- 8 roles: `platform_admin`, `owner`, `admin`, `program_manager`, `hiring_manager`, `supplier_manager`, `finance`, `recruiter`, `dispatcher`, `member`, `supplier_user`, `viewer`, `worker`
- Role inheritance via `ROLE_HIERARCHY` map
- 30+ declared permissions in `PERMISSIONS` matrix
- `requirePermission()` middleware enforces org-scoped permission check per request
- **Gap:** Legacy users without org memberships pass through RBAC unchecked (backward compatibility mode). All new routes should explicitly require org membership.

### Rate Limiting
- Redis-backed (production) or in-memory (dev) via `express-rate-limit`
- Auth endpoints: 5 attempts / 15 min
- Request sending: 30 / 10 min
- API general: 200 / 5 min
- **Gap:** No IP-based blocking for repeated failed auth attempts (only rate limit, no ban).

### Idempotency
- `idempotency_keys` table (TTL: 24h, auto-cleanup cron)
- `Idempotency-Key` header supported on POST/PUT/PATCH
- Prevents duplicate payments and double-processing

### Secrets Management
- Production validation at startup: fails fast if `SESSION_SECRET`, `JWT_SECRET`, `INTERNAL_CRON_SECRET`, `ADMIN_SECRET` are unset or placeholder values
- SMTP, Stripe keys validated when respective features are enabled
- `.env.example` provided; actual `.env` should never be committed

### Internal Endpoints
- `/api/internal/*` (SLA scan, escalation, cleanup) protected by `X-Internal-Secret` header
- IP allowlist configurable via `INTERNAL_CRON_ALLOWED_IPS`

---

## 5. Technical Debt

### High Priority

| Item | Impact | Effort |
|------|--------|--------|
| No TypeScript | High – no compile-time safety for 48 services | Medium |
| Test coverage ~8% | High – regressions undetected | Medium |
| No invoice generation | High – can't bill B2B clients properly | Medium |
| Plain-text emails | Medium – not enterprise-presentable | Low |
| Vanilla JS frontend | High – 50 files, hard to maintain and refactor | Very High |

### Medium Priority

| Item | Impact | Effort |
|------|--------|--------|
| No database-level RLS | Medium – defense-in-depth gap | Medium |
| CSRF uses `===` comparison | Low/Medium – timing attack theoretically possible | Low |
| `unsafe-inline` in CSP | Low – allows CSS injection | Low |
| bcrypt cost factor 10 | Low – consider upgrading to 12 | Low |
| Duplicate REQUISITION_TRANSITIONS (defined in both stateMachine.js and requisitionService.js) | Low | Low |
| Missing cursor-based pagination (most lists use LIMIT only) | Medium | Medium |

### Low Priority

| Item | Impact | Effort |
|------|--------|--------|
| No cursor pagination | Medium | Medium |
| No request timeout middleware | Low | Low |
| Worker queues lack DLQ monitoring | Low | Low |
| `pool.js` hardcodes `rejectUnauthorized: false` for SSL | Low | Low |
| Config doesn't support `DATABASE_URL` SSL CA cert | Low | Medium |

---

## 6. Missing Enterprise Capabilities

### Payment & Billing
- **Invoice generation**: No `invoices` or `invoice_items` tables. B2B clients need proper invoices (DE-compliant, VAT, PDF export). → See `sql/migrations/030_invoicing.sql`
- **Stripe Price IDs**: Current implementation creates inline `price_data`. For production subscription management, Stripe Price objects should be pre-created and referenced by ID.
- **Payment portal**: No customer portal for subscription management (upgrades, cancellations, billing history via Stripe Portal).

### Data & Security
- **Row-Level Security**: No PostgreSQL RLS policies. Application-layer isolation works but DB-level is defense-in-depth standard for enterprise. → See `sql/migrations/031_rls_prep.sql`
- **Data retention policies**: No automated data archival or GDPR-compliant deletion scheduling.
- **Encryption at rest**: Relies on managed database encryption (Hetzner). No application-layer field encryption for PII.

### API & Developer Experience
- **OpenAPI / Swagger**: API not formally documented. Essential for enterprise integrations. → See `docs/API.md` and `api/openapi/spec.json`
- **API versioning**: No `/v1/` prefix. Breaking changes would affect all clients simultaneously.
- **Webhook outbox**: No customer webhook system (notify clients of events like deal completions, SLA breaches).

### Operations
- **Automated database backups**: Not scripted; relies on managed DB provider.
- **Migration rollback**: No down-migration scripts.
- **Blue/green deployment**: Not configured.
- **Prometheus metrics**: Health endpoints exist but no `/metrics` endpoint for Prometheus scraping.
- **Alerting**: Sentry for errors, but no alerting on business metrics (e.g. queue depth, failed payments).

---

## 7. Scalability Risks

### Current Constraints

| Component | Current Limit | Recommended Action |
|-----------|-------------|-------------------|
| Node.js process | Single process, single core | Add PM2 cluster mode or horizontal scaling |
| PostgreSQL | Single instance, pool max=20 | Hetzner Managed DB with read replica for analytics |
| Redis | Single instance, 64 MB limit | Increase limit; add Redis Sentinel for HA |
| BullMQ workers | Single process | Scale workers independently as separate containers |
| Session store | PostgreSQL-based (co-located) | Acceptable to ~10k active sessions |
| Rate limiting | Redis-backed (correct) | Scales with Redis |
| File uploads | Not implemented (no upload endpoint) | N/A until needed |

### Estimated Capacity (Current Architecture)
- **0–500 concurrent users**: Current stack handles without changes
- **500–2,000 concurrent users**: Add PM2 cluster (utilize all CPU cores)
- **2,000–10,000 concurrent users**: Horizontal scaling + Hetzner LB + read replica
- **10,000+ concurrent users**: Kubernetes, CDN for static assets, Redis Sentinel

### Database Query Patterns to Watch
1. `matchRequisition()` — loads ALL active capacity posts (`SELECT * FROM capacity_posts WHERE is_active = TRUE`). At scale (10k+ posts), this becomes a full table scan. Add composite index + pagination.
2. `listRequisitions()` — no cursor pagination, LIMIT-only. Add cursor-based pagination.
3. `getPaymentHistory()` — no index on `payment_sessions.user_id`. Add index.

---

## 8. Recommendations (Priority Order)

### Immediate (before first enterprise client)
1. **Generate real invoices** — implement `030_invoicing.sql` + `invoiceService.js`
2. **HTML email templates** — replace plain-text with branded HTML
3. **Stripe Price IDs** — configure `STRIPE_PRICE_IDS` in env, use in checkout
4. **Test coverage to 40%** — minimum for enterprise due diligence
5. **Add composite performance indexes** — `032_performance_indexes.sql`

### Short-term (investor-grade)
6. **TypeScript migration** — start with services/, then routes/, then middleware/
7. **OpenAPI documentation** — expose Swagger UI at `/api/docs`
8. **RLS policies** — enable at DB level as defense-in-depth
9. **API versioning** — add `/api/v1/` prefix with backward compatibility
10. **Stripe Customer Portal** — let customers manage subscriptions self-service

### Medium-term (Series A readiness)
11. **Frontend framework migration** — React or Vue for the ~50 HTML pages
12. **Webhook outbox** — customer webhooks for events
13. **Prometheus metrics endpoint** — `/api/metrics`
14. **Database migration rollback** — add `down` scripts
15. **SOC 2 Type I preparation** — audit trail review, access logging

---

*Report generated by engineering team audit. All findings reflect codebase state as of 2026-03-09.*
