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
- Queue metrics are exported to Prometheus (see unten).

### Queue Prometheus Metriken

| Metrik | Typ | Labels | Zweck |
|---|---|---|---|
| `queue_jobs_completed_total` | Counter | queue | Abgeschlossene Jobs pro Queue |
| `queue_jobs_failed_total` | Counter | queue | Fehlgeschlagene Jobs pro Queue |
| `queue_jobs_duration_seconds` | Histogram | queue | Job-Verarbeitungsdauer (Buckets: 50ms–60s) |
| `queue_jobs_waiting` | Gauge | queue | Aktuell wartende Jobs (per Scrape via BullMQ API) |
| `queue_jobs_active` | Gauge | queue | Aktuell verarbeitete Jobs |

Queues: `email`, `match`, `capacity`. Worker-Instrumentierung erfolgt automatisch beim Start (`workers/index.js`).

---

## Prometheus Metriken

TempConnect exportiert operative Metriken im Prometheus-Text-Format unter `GET /metrics` (geschützt durch ADMIN_SECRET).

### Metriken-Referenz

#### HTTP Metriken (automatisch via Middleware)

| Metrik | Typ | Labels | Zweck |
|---|---|---|---|
| `http_requests_total` | Counter | method, route, status_code | Request-Rate, Fehlerquote |
| `http_request_duration_seconds` | Histogram | method, route, status_code | Latenz (p50, p95, p99). Buckets: 10ms–10s |
| `http_requests_in_flight` | Gauge | — | Gleichzeitige Requests |

#### Datenbank-Metriken

| Metrik | Typ | Labels | Zweck |
|---|---|---|---|
| `db_pool_total_count` | Gauge | — | DB-Pool: aktive + idle Connections |
| `db_pool_idle_count` | Gauge | — | DB-Pool: idle Connections |
| `db_pool_waiting_count` | Gauge | — | DB-Pool: wartende Queries |
| `db_query_errors_total` | Counter | operation | Fehlgeschlagene DB-Queries (SELECT, INSERT, etc.) |
| `db_query_duration_seconds` | Histogram | operation, status | Query-Dauer. Buckets: 1ms–5s |
| `db_connection_errors_total` | Counter | — | Pool-Level Verbindungsfehler |

#### Node.js System-Metriken (prom-client defaults)

| Metrik | Typ | Zweck |
|---|---|---|
| `nodejs_heap_size_used_bytes` | Gauge | Verwendeter Heap-Speicher |
| `nodejs_heap_size_total_bytes` | Gauge | Gesamter Heap-Speicher |
| `nodejs_eventloop_lag_seconds` | Gauge | Event-Loop-Lag (CPU-Bottleneck) |
| `process_cpu_seconds_total` | Counter | CPU-Nutzung |
| `process_uptime_seconds` | Gauge | Uptime |

Route-Normalisierung verhindert Label-Explosion: UUIDs und numerische IDs werden automatisch durch `:id` ersetzt.

### DB-Query-Instrumentierung

Alle `pool.query()`-Aufrufe werden automatisch instrumentiert via `wrapPoolWithMetrics(pool)` in `app.js`. Die SQL-Operation (SELECT, INSERT, UPDATE, DELETE, etc.) wird als Label extrahiert. Keine Änderungen in Service-Dateien nötig.

### Lokale Prüfanleitung

```bash
# Metriken abrufen
curl -H "X-Admin-Secret: DEIN_SECRET" http://localhost:3000/metrics

# Oder via Query-Parameter
curl "http://localhost:3000/metrics?secret=DEIN_SECRET"

# Prüfen ob HTTP-Flows korrekt erfasst werden
curl http://localhost:8080/api/ready
curl -s "http://localhost:3000/metrics?secret=DEIN_SECRET" | grep http_requests_total

# DB-Query-Metriken prüfen
curl -s "http://localhost:3000/metrics?secret=DEIN_SECRET" | grep db_query
```

---

## Monitoring-Stack starten

```bash
# Dev mit Monitoring
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Prod mit Monitoring
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d
```

| Service | URL | Credentials |
|---|---|---|
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | admin / admin |
| Alertmanager | http://localhost:9093 | — |
| API Metrics | http://localhost:3000/metrics | X-Admin-Secret Header |

**Wichtig**: In `monitoring/prometheus.yml` den Platzhalter `HIER_ADMIN_SECRET_EINTRAGEN` durch den echten ADMIN_SECRET aus `.env` ersetzen.

---

## Grafana Dashboards

### 1. TempConnect — Operations (`tempconnect-ops`)

Operatives Übersichts-Dashboard:

| Panel | Beantwortet |
|---|---|
| Request Rate (req/s) | Wie viele Requests laufen? |
| Error Rate (%) | Wie hoch ist die Fehlerquote? |
| Latenz p50/p95/p99 | Wie ist die Response-Zeit? |
| In-Flight Requests | Ist die App überlastet? |
| Uptime | Ist die App erreichbar? |
| Top Routes | Welche Routen werden meistgenutzt? |
| DB Connection Pool | Ist die Datenbank unter Druck? |
| Event Loop Lag | Ist die CPU überlastet? |
| Queue Job Rate (jobs/s) | Wie viele Jobs werden verarbeitet? |
| Queue Depth (Jobs) | Stauen sich Jobs in den Queues? |

### 2. TempConnect — Alerts & SLO (`tempconnect-alerts`)

SLO- und Alert-fokussiertes Dashboard:

| Panel | Beantwortet |
|---|---|
| Error Budget Gauge (24h) | Wie viel Fehler-Budget ist verbraucht? Ziel: >99.5% |
| Latenz-SLO Gauge | Wie viele Requests unter 500ms? Ziel: >95% |
| Service-Status (UP/DOWN) | Ist der Service erreichbar? |
| Aktive Alerts | Wie viele Alerts feuern aktuell? |
| DB Connection Errors/s | Gibt es Pool-Verbindungsprobleme? |
| DB Query Errors/s | Welche DB-Operationen schlagen fehl? |
| DB Query Duration p50/p95/p99 | Wie schnell ist die Datenbank? |
| Error Rate Timeline | Wie entwickelt sich die Fehlerrate? |
| DB Query Duration by Operation | Welche Operationen sind langsam? |

---

## Alerting

### Architektur

```
Prometheus → (evaluiert alerts.rules.yml alle 15s) → Alertmanager → Webhook/Slack/PagerDuty
```

### Alert-Regeln (monitoring/alerts.rules.yml)

#### API-Alerts

| Alert | Bedingung | Dauer | Severity |
|---|---|---|---|
| **HighErrorRate** | 5xx-Rate > 5% | 5min | critical |
| **HighLatencyP95** | p95 > 1s | 5min | warning |
| **HighLatencyP99** | p99 > 2.5s | 5min | critical |
| **ServiceDown** | up == 0 | 1min | critical |
| **TooManyInFlightRequests** | in-flight > 100 | 2min | warning |

#### Datenbank-Alerts

| Alert | Bedingung | Dauer | Severity |
|---|---|---|---|
| **DbQueryErrorsHigh** | Fehlerrate > 0.5/s | 3min | critical |
| **DbPoolExhausted** | waiting > 5 | 3min | warning |
| **DbPoolNoIdle** | idle == 0 | 5min | warning |

#### System-Alerts

| Alert | Bedingung | Dauer | Severity |
|---|---|---|---|
| **HighMemoryUsage** | Heap > 512MB | 5min | warning |
| **EventLoopLagHigh** | Lag > 500ms | 2min | warning |

#### Queue-Alerts

| Alert | Bedingung | Dauer | Severity |
|---|---|---|---|
| **QueueJobFailureRateHigh** | Fehlerrate > 0.1/s pro Queue | 5min | warning |
| **QueueStalled** | Wartende Jobs > 50 pro Queue | 10min | warning |

### Alertmanager-Konfiguration (monitoring/alertmanager.yml)

**Routing:**
- `critical` → `critical-webhook` (Wiederholung: 1h)
- `warning` → `default-webhook` (Wiederholung: 4h)
- Gruppierung: alertname, service, severity

**Inhibition:** Wenn `ServiceDown` feuert, werden alle `warning`-Alerts für denselben Service unterdrückt.

**Receiver anpassen:** Die Webhook-URLs in `alertmanager.yml` sind Platzhalter. Ersetzen durch:
- **Slack**: `slack_configs` mit Webhook-URL
- **PagerDuty**: `pagerduty_configs` mit Integration Key
- **OpsGenie**: `opsgenie_configs` mit API Key
- **E-Mail**: `email_configs` mit SMTP-Einstellungen

---

## Runbooks

> **Vollständiges Incident Runbook:** Für umfassende Incident-Abläufe, Eskalationspfade und Post-Incident-Reviews siehe [docs/INCIDENT_RUNBOOK.md](INCIDENT_RUNBOOK.md).
> Die folgenden Kurzanleitungen dienen der schnellen Erstreaktion auf spezifische Alerts.

### HighErrorRate
1. Grafana "Operations" → Error Rate Panel prüfen
2. Betroffene Routen über "Top Routes" Panel identifizieren
3. API-Logs: `docker logs tempconnect-api --since=5m | grep "server_error"`
4. Häufige Ursachen: DB-Ausfall, fehlerhaftes Deployment, OOM
5. Rollback erwägen wenn nach Deployment aufgetreten

### HighLatency
1. "Response Latenz" Panel — welche Perzentile betroffen?
2. "DB Query Duration" im Alerts-Dashboard — DB langsam?
3. "Event Loop Lag" — CPU-Engpass?
4. "In-Flight Requests" — zu viele gleichzeitige Requests?
5. `docker stats tempconnect-api` für Container-Ressourcen

### ServiceDown
1. `docker ps | grep tempconnect-api` — läuft der Container?
2. `docker logs tempconnect-api --tail=50` — Crash-Logs prüfen
3. `curl http://localhost:3000/health` — Erreichbarkeit testen
4. Container neustarten: `docker compose restart api`
5. Wenn wiederkehrend: Memory/OOM prüfen, Container-Limits anpassen

### DbQueryErrors
1. "DB Query Errors" Panel — welche Operationen betroffen?
2. API-Logs nach DB-Fehlern filtern
3. `docker exec tempconnect-db psql -U postgres -c "SELECT * FROM pg_stat_activity WHERE state != 'idle'"`
4. Prüfe ob Migrations ausstehen: `/api/admin/status` (mit Admin-Secret)
5. DB-Verbindung testen: `/api/health`

### DbPoolExhausted
1. "DB Connection Pool" Panel — Total vs Idle vs Waiting
2. Langlaufende Queries identifizieren: `pg_stat_activity`
3. Pool-Größe anpassen: `PGPOOL_MAX` in `.env` (Default: 20)
4. Prüfe auf Connection Leaks (nicht geschlossene Transaktionen)

### HighMemory
1. `docker stats tempconnect-api` — aktueller Memory-Verbrauch
2. Heap-Trend über "Node.js Heap" Panel prüfen
3. Container-Restart als kurzfristige Lösung
4. Langfristig: Memory-Profiling, Leak identifizieren

### EventLoopLag
1. CPU-Nutzung prüfen: `docker stats tempconnect-api`
2. Hohe Request-Rate als Ursache? → "Request Rate" Panel
3. Synchrone Operationen in der Codebase suchen
4. Horizontales Scaling erwägen (mehrere API-Instanzen)

### TooManyRequests
1. "In-Flight Requests" Panel — wie viele gleichzeitig?
2. "Request Rate" Panel — DDoS oder Lastspitze?
3. Rate-Limiter-Konfiguration prüfen (middleware/rateLimit.js)
4. Horizontal Scaling oder Rate-Limit verschärfen

---

## Dateistruktur

```
api/utils/metrics.js                            — Prometheus Client + Middleware + DB-Instrumentierung
monitoring/
├── prometheus.yml                              — Scrape Config + Alert Rules + Alertmanager
├── alerts.rules.yml                            — Prometheus Alert-Regeln (10 Regeln, 3 Gruppen)
├── alertmanager.yml                            — Alertmanager Routing + Receiver
└── grafana/provisioning/
    ├── datasources/prometheus.yml               — Auto-Datasource
    └── dashboards/
        ├── dashboards.yml                       — Provider Config
        └── json/
            ├── tempconnect-operations.json      — Operations Dashboard (8 Panels)
            └── tempconnect-alerts.json          — Alerts & SLO Dashboard (10 Panels)
docker-compose.monitoring.yml                    — Prometheus + Grafana + Alertmanager
```

---

## Empfehlungen (weitere Ausbaustufen)

- **Sentry**: Alert Rules für Error Spikes, neue Issues, Performance Regressions konfigurieren
- **External Uptime**: `/health` von externem Service monitoren (UptimeRobot, Hetzner Monitoring)
- **Log Aggregation**: pino JSON Logs an ELK, Loki, oder Datadog liefern
- **Node Exporter**: Host-Level-Metriken (CPU, Disk, Network)
- **PostgreSQL Exporter**: Detaillierte DB-Metriken (Query-Performance, Locks)
- **Loki**: Log-Aggregation als Ergänzung zu Prometheus
- **Bull Board**: Web-UI für Queue-Monitoring (https://github.com/felixmosh/bull-board)

---

## Runbooks (Queue)

### QueueJobFailure
1. Grafana "Operations" → "Queue Job Rate" Panel prüfen — welche Queue betroffen?
2. API-Logs: `docker logs tempconnect-api --since=10m | grep "job failed"`
3. Häufige Ursachen: Redis-Verbindung unterbrochen, E-Mail-Provider down (email-Queue), DB-Fehler (match/capacity-Queue)
4. Worker neustarten: `docker compose restart api`

### QueueStalled
1. Grafana "Operations" → "Queue Depth" Panel — steigt die Warteschlange?
2. Prüfen ob Workers laufen: `docker logs tempconnect-api --since=5m | grep "Background workers"`
3. Redis-Verbindung prüfen: `docker exec tempconnect_redis redis-cli ping`
4. Bei dauerhaftem Stau: Worker-Concurrency erhöhen oder horizontales Scaling
