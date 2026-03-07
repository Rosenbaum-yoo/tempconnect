# Platform Overview

## What is TempConnect?
TempConnect is a B2B marketplace connecting companies (buyers) with staffing agencies (suppliers) for temporary workforce placement. It supports listings, requests, capacity management, SLA contracts, and a matching engine.

## Architecture

### Stack
- **Backend**: Node.js + Express (ES modules), PostgreSQL
- **Frontend**: Static HTML/CSS/JS served via Nginx
- **Infrastructure**: Docker Compose (API + DB + Nginx), deployable to Hetzner Cloud
- **Queue**: BullMQ + Redis for background jobs (email, matching)

### Key Components
- `api/` — Express API server
  - `config/` — Centralized configuration, pino logger, production validation
  - `routes/` — ~20 route modules (auth, listings, requests, capacities, health, etc.)
  - `services/` — ~25 service modules (business logic, no HTTP concerns)
  - `middleware/` — Auth guards, rate limiting, CSRF
  - `db/` — PostgreSQL pool, migration runner
  - `queue/` — BullMQ connection and queue definitions
  - `workers/` — Background job processors (email, match)
  - `utils/` — Geo helpers, monitoring, shared utilities
- `public/` — Static HTML pages (company dashboard, agency inbox, SLA pages, etc.)
- `sql/migrations/` — Numbered SQL migrations (001–019+)
- `docs/` — 50+ documentation files

## Business Models
1. **Model A (Listings)**: Agencies post supply listings, companies post demand listings. Matching happens via search and requests.
2. **Model B (Capacities)**: Agencies publish capacity posts with skills, location, and availability. Companies search and reserve capacity.
3. **SLA Contracts**: Premium tiers (BASIS, PLUS, NOTDIENST) with response-time guarantees, priority matching, and escalation support.

## Core Workflows
1. **Registration → Verification → Login** (session-based)
2. **Listing/Capacity creation → Search → Request → Accept/Decline → Fill → Finalize**
3. **SLA subscription → Priority badge → Escalation on SLA breach**
4. **Matching engine**: Multi-factor scoring (role, skills, location, availability, vendor pool) — see `MATCHING_ENGINE.md`

## Key Integrations
- **Stripe**: Subscription payments (demo mode by default)
- **SMTP/Nodemailer**: Transactional emails
- **Sentry**: Error tracking (optional, via `SENTRY_DSN`)
- **Redis**: Rate limiting store + BullMQ queues

## Related Documentation
- `ARCHITECTURE_OVERVIEW.md` — Detailed component architecture
- `DATABASE_MODEL.md` — Schema reference
- `SECURITY_MODEL.md` — Auth, CSRF, rate limiting, secrets
- `MONITORING.md` — Logging, health checks, metrics
- `DEAL_WORKFLOW.md` — Request lifecycle state machine
- `MATCHING_ENGINE.md` — Scoring algorithm details
