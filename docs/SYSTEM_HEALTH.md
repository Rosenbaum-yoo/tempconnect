# System Health Diagnostics

Konsolidiertes Echtzeit-Diagnostik-Panel für Plattform-Administratoren. Kombiniert Live-Messungen mit Prometheus-Metriken in einer einzigen Ansicht.

## Architektur

```
Frontend (system-health.html)
  └── GET /api/admin/system-health
        └── healthService.getSystemDiagnostics(pool)
              ├── DB Ping (timed SELECT 1)
              ├── Pool Stats (pg Pool API)
              ├── Redis Ping (wenn konfiguriert)
              ├── Process Metrics (Node.js APIs)
              └── Prometheus Registry (HTTP Histogram/Counter)
```

**Prinzip:** Keine neue Infrastruktur — nutzt die bestehende Prometheus-Instrumentierung (`metrics.js`), den bestehenden Admin-Guard (`admin.js`) und den bestehenden Health-Service (`healthService.js`).

## API

### `GET /api/admin/system-health`
**Auth:** `requireAuth` + `requireAdmin` (owner, admin, platform_admin)  
**Rate Limit:** Standard API-Limiter

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok | degraded | critical",
    "checked_at": "2026-03-16T12:30:00.000Z",
    "response_ms": 12,
    "version": "1.0.0",
    "components": {
      "api": {
        "status": "ok",
        "requests_total": 15420,
        "requests_in_flight": 3,
        "error_rate_pct": 0.12,
        "latency": { "p50_ms": 12, "p95_ms": 85, "p99_ms": 210 }
      },
      "database": {
        "status": "ok",
        "latency_ms": 2,
        "pool": { "total": 10, "idle": 8, "waiting": 0, "utilization_pct": 20 }
      },
      "redis": {
        "status": "ok | unconfigured | critical",
        "latency_ms": 1
      },
      "process": {
        "status": "ok",
        "uptime_s": 86400,
        "started_at": "2026-03-15T12:30:00.000Z",
        "memory": { "rss_mb": 120, "heap_used_mb": 65, "heap_total_mb": 90, "external_mb": 8 },
        "cpu": { "user_ms": 45000, "system_ms": 12000 },
        "node_version": "v20.x.x",
        "pid": 1
      }
    }
  }
}
```

## Komponenten-Status

| Status | Bedeutung | Trigger |
|--------|-----------|---------|
| `ok` | Alles operational | Alle Checks bestanden |
| `degraded` | Einschränkungen | DB-Latenz > 1s, Error Rate > 5%, RSS > 512 MB |
| `critical` | Ausfall | DB unreachable, Redis Ping fehlgeschlagen |

**Overall-Status:** Wird aus allen Komponenten-Status abgeleitet. `critical` übersteuert `degraded`.

## Metriken-Quellen

### API Latency (p50/p95/p99)
Berechnet aus dem `http_request_duration_seconds` Prometheus-Histogram via lineare Interpolation der Bucket-Grenzen. Buckets: 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s.

### Error Rate
Anteil der HTTP-Responses mit Status ≥ 500 an `http_requests_total`.

### DB Latency
Live-Messung: `Date.now()` vor/nach `SELECT 1`.

### DB Pool Utilization
`(totalCount - idleCount) / totalCount * 100` aus pg Pool API.

### Redis Latency
Live-Messung: `Date.now()` vor/nach `conn.ping()`. Nur wenn `REDIS_URL` gesetzt.

### Process Metrics
Node.js `process.memoryUsage()`, `process.cpuUsage()`, `process.uptime()`.

## Frontend

`/public/system-health.html` — Admin-Dashboard mit:
- **Status-Badge:** Overall Health (ok/degraded/critical) mit Farb-Indikator
- **API Card:** Requests Total, In-Flight, Error Rate, Latency Percentiles
- **Database Card:** Latency, Pool Stats mit Utilization-Bar
- **Redis Card:** Connection Status, Latency
- **Process Card:** Uptime, Memory (RSS, Heap), CPU Usage, Heap-Bar
- **Auto-Refresh:** Alle 30 Sekunden
- **Farbschwellen:** Grün → Gelb → Rot je nach Metrik-Wert

Patterns: `enterprise.css` Dark-Theme, `esc()` XSS-Schutz, 401-Redirect, 403-Handling.

## Sicherheit

- **RBAC:** Nur `owner`, `admin`, `platform_admin` Rollen
- **Keine Secrets:** Kein DB-Passwort, keine Connection-Strings, keine API-Keys
- **Keine sensiblen Pfade:** Keine File-System-Pfade, keine Config-Werte
- **Rate Limited:** Standard API-Limiter verhindert Überlastung

## Tests

`api/test/systemHealth.test.js` — 12 Tests in 3 Suites:
- percentileFromBuckets (6 Tests): Korrekte Interpolation, Edge Cases
- Service Exports (4 Tests): Alle Funktionen exportiert
- Admin Router (2 Tests): Export + Route registriert

## Bestehende Health-Endpoints (Referenz)

| Endpoint | Auth | Zweck |
|----------|------|-------|
| `GET /health` | Keine | LB Probe (200 OK) |
| `GET /api/health` | Keine | DB-Ping |
| `GET /api/ready` | Keine | Readiness |
| `GET /api/service-status` | Keine | Komponent-Status (public) |
| `GET /api/public/system-status` | Keine | Trust Center |
| `GET /api/admin/status` | Admin-Secret | Detaillierter Status |
| `GET /api/admin/system-health` | Session+RBAC | **NEU** — Diagnostics Panel |
| `GET /metrics` | Admin-Secret | Prometheus Scrape |

## Dateien

| Datei | Typ | Status |
|-------|-----|--------|
| `api/utils/metrics.js` | Utility | GEÄNDERT (Registry-Export) |
| `api/services/healthService.js` | Service | GEÄNDERT (+getSystemDiagnostics, +percentileFromBuckets) |
| `api/routes/admin.js` | Router | GEÄNDERT (+GET /admin/system-health) |
| `frontend/public/system-health.html` | Frontend | NEU |
| `api/test/systemHealth.test.js` | Tests | NEU |
| `docs/SYSTEM_HEALTH.md` | Doku | NEU |
