# TempConnect – Observability

## Aktueller Stand

### Structured Logging (pino)
- **Logger:** pino v9 mit JSON-Output in Production, pino-pretty in Development
- **Log-Level:** konfigurierbar via `LOG_LEVEL` (default: `info`)
- **Request Logging:** Jeder HTTP-Request wird automatisch geloggt mit:
  - `method`, `url`, `status`, `duration_ms`, `ip`
  - Health-Check-Requests werden nicht geloggt (weniger Noise)
- **Error Logging:** Alle Fehler werden mit `logger.error()` strukturiert geloggt
- **Docker Logs:** JSON-File Driver mit Rotation (50MB, 5 Dateien fuer API)

### Health Endpoints
- `GET /health` — Einfacher LB-Check (200 OK, kein DB-Zugriff)
- `GET /api/health` — API-Health mit DB-Ping
- `GET /api/ready` — Readiness-Check (DB erreichbar?)
- `GET /api/admin/status` — Detaillierter Status (erfordert X-Admin-Secret)

### Logs lesen
```bash
# Alle Logs
docker compose -f docker-compose.prod.yml logs -f api

# Nur Fehler (JSON jq-Filter)
docker compose -f docker-compose.prod.yml logs api | grep '"level":50'

# Letzte 100 Zeilen
docker compose -f docker-compose.prod.yml logs --tail=100 api
```

---

## Geplant: Prometheus + Grafana

### Architektur
```
API (Express) → /metrics Endpoint → Prometheus → Grafana Dashboard
```

### Schritt 1: prom-client installieren
```bash
npm install prom-client
```

### Schritt 2: Metrics Endpoint hinzufuegen
```javascript
// api/routes/metrics.js
import { register, collectDefaultMetrics, Histogram } from "prom-client";
collectDefaultMetrics();

const httpDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// Middleware: app.use(metricsMiddleware)
// Endpoint: app.get("/metrics", async (req, res) => res.set("Content-Type", register.contentType).end(await register.metrics()));
```

### Schritt 3: Prometheus Container
```yaml
# docker-compose.prod.yml (ergaenzen)
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./deploy/prometheus.yml:/etc/prometheus/prometheus.yml
  ports:
    - "127.0.0.1:9090:9090"
```

### Schritt 4: Grafana
```yaml
grafana:
  image: grafana/grafana:latest
  ports:
    - "127.0.0.1:3001:3000"
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
```

### Empfohlene Dashboards
- **Request Rate:** Requests/Sekunde nach Status
- **Latenz:** p50, p95, p99 Response Time
- **Error Rate:** 4xx/5xx pro Minute
- **DB Pool:** Aktive Connections, Idle, Waiting
- **Redis:** Memory Usage, Hits/Misses

---

## Alerting (Optional)

### Hetzner Cloud Alerts
- CPU > 80% fuer 5 Minuten
- Disk > 90%
- API Health-Check fehlgeschlagen

### Prometheus Alertmanager
```yaml
groups:
  - name: tempconnect
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
      - alert: APIDown
        expr: up{job="tempconnect-api"} == 0
        for: 1m
```
