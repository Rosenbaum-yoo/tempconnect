# Monitoring & Error Tracking

## Overview
TempConnect uses a layered monitoring approach: structured logging (pino), error tracking (Sentry-ready), health endpoints, and platform metrics.

## Structured Logging (pino)
- All logs are JSON in production, pretty-printed in development (`pino-pretty`).
- Log level controlled via `LOG_LEVEL` env var (default: `info`).
- Request middleware logs method, path, status, and duration for every HTTP request.

## Error Tracking (Sentry)
- Configured via `SENTRY_DSN` environment variable.
- If `SENTRY_DSN` is empty, Sentry is disabled — no errors, no overhead.
- `api/utils/monitoring.js` provides:
  - `initMonitoring()` — called once at startup in `server.js`
  - `captureException(err, context)` — wraps Sentry.captureException
  - `captureMessage(msg, level)` — wraps Sentry.captureMessage
  - `sentryErrorHandler` — Express error middleware (wired before custom handler in `app.js`)
- Unhandled rejections and uncaught exceptions are forwarded to Sentry in `server.js`.

### Setup
1. Create a Sentry project at https://sentry.io
2. Set `SENTRY_DSN=https://...@sentry.io/...` in `.env`
3. Restart the API — Sentry init is logged at startup

## Health Endpoints
| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | None | Load balancer probe — returns `{ ok: true }` if DB reachable |
| `GET /ready` | None | Readiness check for orchestrators |
| `GET /admin/status` | `x-admin-secret` header | DB status, migrations, queue status, uptime, Node version |
| `GET /admin/metrics` | `x-admin-secret` header | Platform-wide KPIs (users, listings, requests, subscriptions, ratings) |

## Platform Metrics (`/admin/metrics`)
Returns aggregated counts for:
- **Users**: total, companies, agencies, verified, new in last 7 days
- **Listings**: total, active, supply vs. demand
- **Requests**: total, by status, new in last 7 days
- **Subscriptions**: by plan (FREE/BASIS/PLUS/NOTDIENST), active count
- **Ratings**: total, average score
- **Capacity Posts**: total, active
- **Audit Log**: total entries, entries in last 24 hours

## BullMQ Queue Monitoring
- Queue status is reported in `/admin/status` (`queue: "configured" | "unavailable"`).
- Workers log job start/complete/fail events to pino.
- For production dashboards, consider [Bull Board](https://github.com/felixmosh/bull-board) or Grafana.

## Alerting Recommendations
- **Sentry**: Configure alert rules for error spikes, new issues, and performance regressions.
- **Health endpoint**: Monitor `/health` from an external uptime service (e.g. UptimeRobot, Hetzner monitoring).
- **Log aggregation**: Ship pino JSON logs to ELK, Loki, or Datadog for centralized search.
