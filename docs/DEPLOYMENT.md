# TempConnect — Deployment Guide

**Target audience:** DevOps, Engineering, Investors (due diligence)  
**Environments covered:** Docker Compose (local/dev), Production (VPS/Hetzner/Cloud)

---

## Architecture Overview

```
[Internet] → Nginx (80/443) → Node.js API (3000) → PostgreSQL (5432)
                                        ↕
                                   Redis (6379)
```

All services run in Docker containers managed by Docker Compose. The stack is deployable on any Linux host with Docker Engine 24+ and Docker Compose v2.

---

## Prerequisites

- Docker Engine 24+
- Docker Compose v2 (`docker compose`, not `docker-compose`)
- 2 GB RAM minimum (4 GB recommended)
- PostgreSQL client tools (optional, for DB access)
- Domain + SSL certificate (Let's Encrypt via Certbot recommended)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values. The API refuses to start in production if critical secrets are placeholders.

### Required in Production

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Must be `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Min 64 chars random — `openssl rand -hex 32` |
| `INTERNAL_CRON_SECRET` | For `/api/internal/*` endpoints |
| `ADMIN_SECRET` | For `/api/admin/*` endpoints |
| `BASE_URL` | Public URL, e.g. `https://app.tempconnect.de` |

### Payment (Stripe)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe live secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe live publishable key |
| `STRIPE_WEBHOOK_SECRET` | From Stripe dashboard → Webhooks |
| `STRIPE_SUCCESS_URL` | Redirect after successful payment |
| `STRIPE_CANCEL_URL` | Redirect after cancelled payment |

### Email (SMTP)

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | e.g. `smtp.sendgrid.net` |
| `SMTP_PORT` | `587` (TLS) or `465` (SSL) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password / API key |
| `SMTP_FROM` | From address, e.g. `noreply@tempconnect.de` |

### Optional / Infrastructure

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | e.g. `redis://localhost:6379` |
| `SENTRY_DSN` | Sentry error tracking DSN |
| `CORS_ORIGIN` | Additional allowed CORS origin |
| `PAYMENT_MODE` | `stripe` or `demo` (default) |

---

## Local Development

```bash
# 1. Clone and install
git clone <repo>
cd tempconnect_docker
cp api/.env.example api/.env

# 2. Start all services
docker compose up -d

# 3. Apply migrations
docker compose exec api node scripts/migrate.js

# 4. Access
# Frontend: http://localhost:8080
# API:      http://localhost:8080/api/health
```

---

## Production Deployment

### Initial Setup

```bash
# 1. On the server, clone repo
git clone <repo> /opt/tempconnect
cd /opt/tempconnect

# 2. Configure secrets
cp api/.env.example api/.env.prod
# Edit api/.env.prod — fill in all required variables

# 3. Build and start
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file api/.env.prod up -d --build

# 4. Apply migrations
docker compose exec api node scripts/migrate.js

# 5. Verify health
curl http://localhost/api/health
curl http://localhost/api/service-status
```

### Zero-Downtime Update

> **Vollständiger Release-Prozess:** Für den kompletten Release-Ablauf inkl. QA-Checkliste, Smoke Tests, Monitoring-Check und Rollback siehe [../RELEASE.md](../RELEASE.md).

```bash
# Pull latest changes
 git pull origin main

# Rebuild API container (Nginx and DB unchanged)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --no-deps api

# Migrations run automatically on startup (or manually):
docker compose exec api node scripts/migrate.js
```

---

## Container Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `nginx` | nginx:alpine | 80, 443 | Reverse proxy, static files |
| `api` | Custom (Node 20) | 3000 (internal) | Application API |
| `postgres` | postgres:15 | 5432 (internal) | Primary database |
| `redis` | redis:7-alpine | 6379 (internal) | Rate limiting, queues |

**External exposure**: Only ports 80 and 443 on the Nginx container are exposed to the host. All other services communicate on the internal Docker network.

---

## Database Migrations

Migrations are SQL files in `sql/migrations/` applied by `scripts/migrate.js`.

```bash
# Apply all pending migrations
node api/scripts/migrate.js

# Check applied migrations
psql $DATABASE_URL -c "SELECT name, applied_at FROM migrations ORDER BY id"
```

Migration naming: `NNN_description.sql` where NNN is zero-padded (e.g. `033_new_feature.sql`).

Never modify applied migrations — add new migrations instead.

---

## Health Checks

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `GET /health` | LB health (no DB) | None |
| `GET /api/health` | DB connectivity | None |
| `GET /api/ready` | Readiness probe | None |
| `GET /api/service-status` | Full component status | None |
| `GET /api/admin/status` | Detailed admin status | `X-Admin-Secret` header |
| `GET /api/admin/metrics` | Platform metrics | `X-Admin-Secret` header |

### `/api/service-status` Response Example

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime_s": 3600,
  "components": {
    "database": { "status": "ok", "latency_ms": 2 },
    "redis": { "status": "ok", "latency_ms": 1 },
    "smtp": { "status": "configured", "host": "smtp.sendgrid.net" },
    "stripe": { "status": "configured", "webhook_secret": true },
    "search": { "status": "ok", "engine": "postgres-fts" }
  }
}
```

---

## Backup & Recovery

### Database Backup

```bash
# Manual backup
docker compose exec postgres pg_dump -U postgres tempconnect > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T postgres psql -U postgres tempconnect < backup_20260101.sql
```

**Recommended**: Automated daily backups via cron + offsite storage (S3, Hetzner Storage Box).

### Redis

Redis data is ephemeral (sessions, rate limit counters, job queues). No backup required — sessions are also stored in PostgreSQL.

---

## Scaling

### Horizontal API Scaling

The API is stateless — sessions are stored in PostgreSQL. Multiple API containers can run behind a load balancer (Nginx upstream):

```nginx
upstream api {
  server api1:3000;
  server api2:3000;
}
```

Ensure all API containers share the same `DATABASE_URL` and `REDIS_URL`.

### Database Scaling

- **Read replicas**: Configure `DATABASE_URL_READONLY` for analytics queries
- **Connection pooling**: PgBouncer recommended for 100+ concurrent connections
- **Managed DB**: Hetzner Managed PostgreSQL, AWS RDS, or Supabase

---

## Monitoring Stack

| Tool | Purpose | Setup |
|------|---------|-------|
| Sentry | Error tracking | Set `SENTRY_DSN` |
| Pino | Structured JSON logs | Built-in, pipe to Loki/CloudWatch |
| `/api/service-status` | Uptime monitoring | Poll every 30s from UptimeRobot |
| `/api/admin/metrics` | Platform KPIs | Custom dashboard |

---

## Security Checklist (Pre-Launch)

- [ ] `SESSION_SECRET` is 64+ random chars (not a placeholder)
- [ ] `NODE_ENV=production`
- [ ] Nginx serving HTTPS with valid TLS certificate
- [ ] All DB ports firewalled (no external access to 5432)
- [ ] Redis not exposed externally
- [ ] `STRIPE_WEBHOOK_SECRET` configured and tested
- [ ] CORS origin locked to production domain
- [ ] Sentry DSN configured
- [ ] Automated DB backups enabled
- [ ] Log shipping configured (Loki, CloudWatch, etc.)

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| API returns 503 | `GET /api/health` — DB connection |
| Payments not activating | Check `STRIPE_WEBHOOK_SECRET`, inspect Stripe dashboard events |
| Emails not sending | `GET /api/service-status` → `smtp` component |
| Sessions expiring early | Verify `SESSION_SECRET` is set and stable across restarts |
| High memory | Check `GET /api/admin/status` → `memory` field |
| Migration errors | Check `migrations` table, review migration SQL for conflicts |
