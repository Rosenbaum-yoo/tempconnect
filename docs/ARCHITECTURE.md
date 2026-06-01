# TempConnect — System Architecture

## Overview

TempConnect is a multi-tenant B2B SaaS platform connecting staffing suppliers with employers in the temporary workforce market. The system is designed as a containerized, cloud-native application with clear separation of concerns across three primary layers: API, frontend, and persistence.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Tier                              │
│  Browser SPA (Vanilla JS/HTML)  ·  Mobile (future)             │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTPS / REST
┌───────────────────────▼─────────────────────────────────────────┐
│                    Application Tier                             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Nginx Reverse Proxy (port 80/443)                      │   │
│  │  TLS termination · Static files · API proxying          │   │
│  └───────────────────────┬─────────────────────────────────┘   │
│                          │                                      │
│  ┌───────────────────────▼─────────────────────────────────┐   │
│  │  Node.js API (Express, ESM, Node 20)  [port 3000]       │   │
│  │  • 54+ REST endpoints                                   │   │
│  │  • Session-based auth (connect-pg-simple)               │   │
│  │  • Rate limiting (Redis or memory fallback)             │   │
│  │  • CSRF protection · Helmet · CORS                      │   │
│  │  • Idempotency middleware (DB-backed keys)              │   │
│  │  • Org-context middleware (multi-tenancy)               │   │
│  │  • Audit-write middleware (immutable trail)             │   │
│  └───────────────────────┬─────────────────────────────────┘   │
│                          │                                      │
│  ┌───────────────────────▼─────────────────────────────────┐   │
│  │  Background Jobs (BullMQ / Redis)                       │   │
│  │  • SLA matching  · Email queue  · Overdue invoices      │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                    Data Tier                                    │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │  PostgreSQL 15       │    │  Redis 7                     │  │
│  │  • Session store     │    │  • Rate limiting             │  │
│  │  • Idempotency keys  │    │  • Job queues (BullMQ)       │  │
│  │  • All domain data   │    │  • Cache (optional)          │  │
│  │  • RLS policies      │    └──────────────────────────────┘  │
│  │  • Audit log         │                                      │
│  └──────────────────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Application Components

### API Layer (`/api`)

| Component | Description |
|-----------|-------------|
| `app.js` | Express app factory — creates app, wires all middleware and routers |
| `server.js` | Entry point — starts HTTP server, graceful shutdown |
| `config/index.js` | Centralized env-var configuration with production validation |
| `routes/` | 30+ Express routers, one domain per file |
| `services/` | Business logic, DB queries, external integrations |
| `middleware/` | Auth, CSRF, rate limit, idempotency, org-context, audit, validation |
| `queue/` | BullMQ job definitions and Redis connection |
| `utils/` | Logger (pino), monitoring (Sentry), correlation IDs |
| `db/pool.js` | pg.Pool singleton with connection pooling |

### Middleware Stack (in order)

1. `express.json` — body parsing, 1 MB limit
2. `correlationMiddleware` — attaches X-Correlation-ID to every request
3. Request logger — structured pino logging with duration, status, IP
4. `helmet` — security headers (CSP, HSTS, X-Frame-Options, etc.)
5. `cors` — allowlist-based origin checking, credentials: true
6. `express-session` + `connect-pg-simple` — server-side sessions in PostgreSQL
7. `csrfProtect` — CSRF double-submit token on all /api/ routes
8. `idempotencyMiddleware` — prevents duplicate POST/PATCH mutations
9. `orgContextMiddleware` — resolves active org from session → `req.orgId`
10. `auditWriteMiddleware` — persists `res.locals.audit` entries post-response
11. Rate limiters — per-IP and per-user limits via Redis/memory store

### Frontend (`/public`)

Single-page application using Vanilla JS/HTML. No build step required. Communicates exclusively with `/api/` endpoints. Key pages:

- `index.html` — dashboard / landing
- `sla_abo.html` — subscription / payment page
- `admin.html` — admin panel
- `swagger-ui.html` — embedded API documentation

## Multi-Tenancy Model

TempConnect uses a **shared-schema, org‑ID‑isolated** multi‑tenancy model:

- Every tenant (organisation) has a row in `organizations`
- All tenant data references `org_id` (foreign key)
- `orgContextMiddleware` resolves the **active org** via `X-Org-Id` → session cache → primary org
- `POST /api/me/active-org` sets the session cache for org switching
- Row-Level Security (RLS) policies on critical tables enforce isolation at the DB layer (see `sql/migrations/031_rls_prep.sql`)
- Service layer always passes `org_id` to queries to enforce boundaries

## Authentication & Authorization

- **Authentication**: Session-based (HTTP-only cookies, SameSite=Lax, secure in production)
- **Authorization**: Role-based (RBAC) with roles: ADMIN, MEMBER, VIEWER, FINANCE, WORKER
- **Permission matrix**: Defined in `services/rbacService.js` — covers all domain actions
- **Org boundary**: All sensitive operations check that the requesting user belongs to the target org

## External Integrations

| Service | Purpose | Config Var |
|---------|---------|------------|
| Stripe | Subscription payments, webhook events | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| SMTP (any) | Transactional emails | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |
| Sentry | Error tracking, performance | `SENTRY_DSN` |
| Redis | Rate limiting, job queues | `REDIS_URL` |
| PayPal | Alternative payment (stub) | `PAYPAL_CLIENT_ID` |

## Scalability Design

- **Stateless API**: Sessions stored in PostgreSQL — horizontally scalable
- **Connection pooling**: pg.Pool with configurable `max` connections
- **Background jobs**: BullMQ on Redis — decoupled, retryable, observable
- **Indexes**: Comprehensive composite indexes on all hot query paths (migration 032)
- **RLS**: DB-enforced tenant isolation — scales without application-layer overhead
- **Caching**: Redis available for hot-path caching (not yet implemented — documented in backlog)

## Data Flow: Requisition Lifecycle

```
Employer → POST /api/requisitions → OPEN
    ↓
Matching Engine (matchingService.js)
    → Scores capacity posts by: distance, qualification, availability,
      response_rate, capacity_fit, urgency_bonus
    ↓
Supplier notified → POST /api/requisitions/:id/submit → SUBMITTED
    ↓
Employer reviews → POST /api/requisitions/:id/accept → ACCEPTED
    ↓
Deal created (deals table) → ACTIVE
    ↓
Timesheets submitted weekly → APPROVED
    ↓
Invoice generated (invoices table) → SENT → PAID
```

## Deployment Architecture

See `docs/DEPLOYMENT.md` for full deployment guide. Summary:

- **Container**: Docker Compose (dev + prod configs)
- **Services**: `api` + `postgres` + `redis` + `nginx`
- **Migrations**: SQL files in `sql/migrations/`, applied via `scripts/migrate.js`
- **Health checks**: `GET /health` (LB), `GET /api/health` (DB), `GET /api/service-status` (components)
- **Graceful shutdown**: SIGTERM handler in `server.js` drains connections before exit
