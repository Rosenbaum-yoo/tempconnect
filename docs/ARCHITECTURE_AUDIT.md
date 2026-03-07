# TempConnect – Architecture Audit (Production Readiness)

**Datum:** 2026-03-05
**Auditor:** Automated SaaS Architect Audit
**Version:** 1.0

---

## 1. System Architecture Overview

### Stack
- **Backend:** Node.js 20 (Express 4, ESM modules)
- **Database:** PostgreSQL 16 (Alpine)
- **Cache/Rate-Limit:** Redis 7 (Alpine)
- **Frontend:** Static HTML/CSS/JS, served by Nginx
- **Reverse Proxy:** Nginx (API unter `/api/`, Frontend unter `/`)
- **Payment:** Stripe (demo + live), PayPal (vorbereitet)
- **E-Mail:** SMTP (SendGrid, Mailpit dev, diverse Provider)
- **Containerization:** Docker Compose (dev + prod)

### Service-Architektur (Docker Compose)
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend    │────▶│   Nginx     │────▶│   API       │
│  (Static)    │     │  :80        │     │  :3000      │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                         ┌─────────────────────┼─────────────────────┐
                         │                     │                     │
                    ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
                    │ Postgres │          │  Redis  │          │ Mailpit │
                    │  :5432   │          │  :6379  │          │ :8025   │
                    └──────────┘          └─────────┘          └─────────┘
```

### API-Struktur (55+ Routes)
- **15 Router-Module:** auth, capacities, csrf, geo, health, internal, listings, marketplace, me, payment, plans, proofs, ratings, reports, requests, slaSearchJobs
- **12+ Service-Module:** authService, capacityService, complianceService, geoService, healthService, idempotencyService, listingService, marketplaceService, paymentService, ratingService, reportService, requestService, slaService, slaSearchService, supplierMetricsService, stateMachine, auditLog
- **Middleware:** auth (session + CSRF), rateLimit (Redis-backed), idempotency, featureGate

### Datenbank-Schema (17 Migrations)
- **Core:** users, subscriptions, listings, requests
- **Enterprise:** ratings, payment_sessions, capacities, capacity_reservations
- **SLA/Compliance:** request_compliance, sla_events, supplier_metrics, idempotency_keys
- **Marketplace:** capacity_posts, demand_requests, matches, offers, proofs, demand_sla_events
- **Search:** sla_search_jobs, sla_search_events, sla_search_matches, match_alerts

---

## 2. Security Assessment

### ✅ Bereits implementiert
| Bereich | Status | Details |
|---------|--------|---------|
| Session-Verwaltung | ✅ | connect-pg-simple, httpOnly, sameSite=lax, secure in Prod |
| CSRF-Schutz | ✅ | x-csrf-token Header, Skip für GET/HEAD/OPTIONS |
| Rate-Limiting | ✅ | Redis-backed (auth: 5/15min, API: 200/5min, Cron: 30/min) |
| Passwort-Hashing | ✅ | bcryptjs, 10 Rounds |
| XSS-Schutz (Frontend) | ✅ | esc() in allen HTML-Seiten |
| Idempotency | ✅ | Idempotency-Key Header, 24h TTL, scope per user |
| Secret-Validation | ✅ | Fail-fast bei fehlendem SESSION_SECRET, JWT_SECRET, INTERNAL_CRON_SECRET, ADMIN_SECRET |
| Stripe Webhook | ✅ | constructEvent() mit Signature-Verification |
| Helmet | ⚠️ | Aktiv, aber CSP deaktiviert (contentSecurityPolicy: false) |
| CORS | ✅ | Whitelist-basiert, credentials: true |
| Input-Validation | ⚠️ | Zod auf auth/capacities/listings — nicht auf allen Routes |

### ⚠️ Verbesserungsbedarf
1. **Helmet CSP deaktiviert** — sollte mit passender Policy für das Static-Frontend aktiviert werden
2. **Kein DATABASE_URL-Check in Produktion** — Server startet ohne DB-Config
3. **Kein SMTP-Check in Produktion** — E-Mails schlagen still fehl
4. **Dockerfile läuft als root** — Sicherheitsrisiko im Container
5. **Nginx: server_tokens aktiv** — gibt Nginx-Version preis
6. **Keine Referrer-Policy/Permissions-Policy** im Nginx

### 🔴 Risiken
1. **OneDrive als Projektpfad** — Docker File-Locking möglich (bekannt)
2. **Demo-User mit festen Passwort-Hashes** in init.sql — in Produktion entfernen oder deaktivieren
3. **PayPal-Webhook ist Stub** — POST /payment/webhook/paypal gibt immer `{received: true}` zurück

---

## 3. Deployment Readiness

### ✅ Bereit
- docker-compose.prod.yml mit Managed DB Support (DATABASE_URL)
- Migrations-System mit idempotenten SQL-Dateien
- prod-up.sh / prod-down.sh / prod-logs.sh / prod-update.sh Skripte
- Healthchecks auf allen Services
- nginx-ssl.example.conf + Caddyfile.example für SSL
- FRONTEND_PORT nur auf 127.0.0.1 in Prod (hinter Reverse Proxy)

### ⚠️ Fehlend
- Kein graceful shutdown (SIGTERM-Handler) im API-Server
- Kein request logging middleware (pino-http)
- Keine Prometheus/Grafana Metrics
- Kein centralized error handler
- Keine standardisierte API-Response-Struktur

---

## 4. Missing Best Practices

1. **Centralized Error Handler** — Jede Route hat eigenen try/catch mit individueller Fehlerbehandlung
2. **Standard API Response Format** — Mix aus `{error: "..."}`, `{ok: true}`, `{success: true}`
3. **Unhandled Rejection Handler** — process.on('unhandledRejection') fehlt
4. **Request Logging** — Kein pino-http für automatisches Request/Response Logging
5. **Graceful Shutdown** — SIGTERM/SIGINT nicht behandelt, offene DB-Connections werden nicht geschlossen
6. **API Versioning** — Keine Versionierung (akzeptabel für MVP, sollte geplant werden)

---

## 5. Scalability Concerns

### Gut
- Connection Pool konfigurierbar (PGPOOL_MAX, PGPOOL_IDLE_TIMEOUT_MS)
- Redis für Rate-Limiting (multi-instance ready)
- Stateless API (Sessions in PostgreSQL)
- Indexed queries überall

### Potentielle Engpässe
- **Geocoding via Nominatim** — Rate-Limited, kein Caching
- **Matching-Algorithmus in JS** — Lädt alle capacity_posts für jede Demand-Request in Memory
- **SLA-Scan als HTTP-Cron** — Keine echte Job-Queue (Bull/BullMQ)
- **Einzelne API-Instanz** — Kein Load Balancing konfiguriert (aber Docker Compose skalierbar)

---

## 6. Potential Bugs

1. **payment.js Zeile 103:** Stripe Webhook Route verwendet `express.raw()`, aber app.js hat `express.json()` global — die Route muss VOR dem globalen JSON-Parser registriert werden oder die Reihenfolge muss stimmen (aktuell korrekt, da Router die spezifische Middleware hat)
2. **capacityService.searchCapacities:** Parameter-Indexierung bei `available_min` Filter kann bei bestimmten Kombinationen falsch zählen (Edge Case)
3. **Idempotency-Middleware:** `res.json` wird überschrieben, aber `res.send` nicht — Non-JSON-Responses werden nicht gecaptured

---

## 7. Risk Analysis

| Risiko | Schwere | Wahrscheinlichkeit | Mitigation |
|--------|---------|---------------------|------------|
| Secret-Leak via .env | Hoch | Niedrig | .gitignore korrekt, Rotation-Doku erstellen |
| DDoS ohne WAF | Mittel | Mittel | Rate-Limiting aktiv, Hetzner Firewall nutzen |
| DB-Connection Exhaustion | Mittel | Niedrig | Pool konfiguriert, Monitoring einrichten |
| OneDrive File-Locking | Niedrig | Mittel | Projekt vor Deployment auf lokale Disk kopieren |
| Unhandled Promise Rejection | Mittel | Mittel | Handler hinzufügen (Step 4) |

---

## 8. Empfehlungen (Priorisiert)

1. **P0 (Sofort):** Centralized Error Handler, Graceful Shutdown, Dockerfile non-root
2. **P1 (Vor Go-Live):** Helmet CSP, Request Logging, Secret Rotation Doku
3. **P2 (Nach Go-Live):** Prometheus/Grafana, Job-Queue für Cron, API Versioning
4. **P3 (Roadmap):** Frontend Build-System (Vite/Webpack), E2E-Tests, CDN
