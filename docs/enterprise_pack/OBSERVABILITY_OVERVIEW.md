# TempConnect — Observability Overview

> Erstellt: 2026-05-28 | Enterprise Pack | WAVE_13
> Abdeckung: Error-Tracking, Metriken, Logging, Health-Checks, Alerting

---

## 1. Error-Tracking (Sentry)

**Service:** `api/utils/monitoring.js`
**Status:** Vollständig integriert (WAVE_13 ✅)

| Konfiguration | Wert |
|---|---|
| Provider | Sentry (Self-Hosted oder SaaS) |
| DSN | `SENTRY_DSN` ENV-Variable (optional) |
| PII-Schutz | `sendDefaultPii: false` |
| PII-Scrubbing | cookies, authorization, x-csrf-token, x-admin-secret werden aus Headers entfernt |
| Sampling | `tracesSampleRate: 0.1` (10 % in Prod) |
| Init-Guard | Nur wenn `SENTRY_DSN` gesetzt — kein Error bei fehlendem DSN |

**PII-Scrubbing-Implementierung:**
```js
beforeSend(event) {
  const SENSITIVE_HEADERS = ['cookie', 'authorization', 'x-csrf-token', 'x-admin-secret'];
  if (event.request?.headers) {
    SENSITIVE_HEADERS.forEach(h => delete event.request.headers[h]);
  }
  return event;
}
```

**Integration in server.js:** `initMonitoring()` wird beim Server-Start aufgerufen.

---

## 2. Metriken (Prometheus)

**Konfigurationsdatei:** `monitoring/prometheus.yml`, `monitoring/start-prometheus.sh`
**Status:** ENV-gesteuerte Substitution implementiert (B-03 ✅)

| Konfiguration | Wert |
|---|---|
| Metrics-Endpunkt | `GET /api/metrics` (via rate-limited, secret-gesichertem Header) |
| Secret | `PROMETHEUS_METRICS_SECRET` ENV-Variable |
| Substitution | `start-prometheus.sh` ersetzt `PROMETHEUS_METRICS_SECRET_PLACEHOLDER` per `sed` |
| Warnung | Script warnt wenn `PROMETHEUS_METRICS_SECRET` nicht gesetzt |

**Verfügbare Metriken:**
- HTTP Request/Response Latenz (per Route)
- Error-Rate (4xx/5xx)
- Node.js Memory/GC
- Datenbank-Connection-Pool-Auslastung

---

## 3. Structured Logging (Pino)

**Service:** `api/utils/logger.js`

| Konfiguration | Wert |
|---|---|
| Format | JSON (strukturiert, maschinenlesbar) |
| Level | `LOG_LEVEL` ENV (default: info) |
| Context-Enrichment | userId, orgId werden in req.log nach Session/OrgContext injiziert (`api/app.js:251`) |
| Keine sensiblen Daten | Passwords, Tokens, Session-IDs werden nicht geloggt |

---

## 4. Health-Checks

| Endpunkt | Beschreibung | Authentifizierung |
|---|---|---|
| `GET /health` | Basis-Health (HTTP 200) | Keine |
| `GET /ready` | Readiness (DB-Connection) | Keine |
| `GET /live` | Liveness | Keine |
| `GET /api/admin/system-health` | Erweiterte System-Health | `requireAdmin` |
| `GET /public/system-status` | Öffentliche Status-Seite | Keine |

---

## 5. Audit-Log

**Tabelle:** `audit_log`
**Abdeckung:** 335/335 Endpunkte (Audit-Gate B-02 ✅)

| Feld | Typ | Beschreibung |
|---|---|---|
| `action` | String | Namespace + Aktion (z.B. `subscription.lifecycle.trial_ended`) |
| `entity_type` | String | Betroffener Entitätstyp |
| `entity_id` | UUID/String | ID der betroffenen Entität |
| `actor_user_id` | UUID | Wer hat die Aktion ausgelöst |
| `details` | JSONB | Kontextdaten inkl. `responsible_actor_user_id` |
| `created_at` | Timestamp | Zeitstempel (unveränderlich) |

**Kein Delete-Endpunkt** für Audit-Logs — Read-Only-Zugriff via Admin-Panel.

---

## 6. Alerting (geplant)

| Alert | Schwellwert | Kanal |
|---|---|---|
| Error-Rate > 5 % | 5 Minuten Fenster | Sentry Alert |
| SLA-Compliance < 80 % | Executive Dashboard | In-App (geplant, P3-D) |
| Subscription-Lifecycle-Failures | failed[] > 0 | Sentry Alert |
| DB-Connection-Pool-Sättigung | > 80 % | Prometheus → Alertmanager |

---

## 7. Deployment-Monitoring

**CI-Chain:** GitHub Actions → docker-build → health-check (implizit via docker-compose healthcheck)
**Lifecycle-Cron:** `runLifecycleTick()` — 5 Phasen (expiry, activation, cancellation, trialEnds, hardLocks)
**Cron-Ergebnis:** `{ ok: true, ts, processed, transitioned/locked, failed[] }` — maschinenlesbar

---

## Referenzen

- `api/utils/monitoring.js` — Sentry-Integration
- `monitoring/prometheus.yml` — Prometheus-Config
- `monitoring/start-prometheus.sh` — Secret-Substitution
- `docs/MONITORING.md` — ausführliche Monitoring-Doku
- `docs/OBSERVABILITY.md` — Observability-Konzept
- `docs/LOGGING.md` — Logging-Konzept
