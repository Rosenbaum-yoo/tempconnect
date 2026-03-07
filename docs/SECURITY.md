# TempConnect – Security Guide

## 1. Secret Management

### Pflicht-Secrets (Produktion)
- `SESSION_SECRET` – mind. 64 Zeichen, `openssl rand -hex 32`
- `JWT_SECRET` – mind. 64 Zeichen, eigener Wert
- `INTERNAL_CRON_SECRET` – für `/api/internal/*` Endpoints
- `ADMIN_SECRET` – für `/api/health/status`
- `STRIPE_SECRET_KEY` – Stripe Live Key
- `STRIPE_WEBHOOK_SECRET` – Stripe Webhook Signing Secret

### Secret Rotation
1. Neuen Wert generieren: `openssl rand -hex 32`
2. In `.env` auf dem Server ersetzen
3. `./scripts/prod-update.sh` (API startet neu, liest neue Secrets)
4. **SESSION_SECRET ändern:** Alle User werden ausgeloggt (Sessions invalidiert)
5. **JWT_SECRET ändern:** Alle ausgegebenen Tokens werden ungültig
6. **Empfehlung:** Alle 90 Tage rotieren, sofort bei Verdacht auf Kompromittierung

### Placeholder Detection
Die API erkennt unsichere Platzhalter (`HIER_`, `DEIN_`, `PLACEHOLDER`, leere Strings) und beendet sich in Produktion sofort (`process.exit(1)`).

## 2. Cookie-Sicherheit

Implementiert in `app.js`:
- `httpOnly: true` – kein JavaScript-Zugriff auf Session-Cookie
- `secure: true` – nur über HTTPS (automatisch bei `NODE_ENV=production` oder `BASE_URL=https://...`)
- `sameSite: "lax"` – CSRF-Schutz
- `path: "/"` – Cookie gilt für gesamte Domain
- Session-TTL: 14 Tage (rolling)

## 3. CSRF-Schutz

- Alle schreibenden API-Requests (`POST/PUT/PATCH/DELETE`) erfordern `X-CSRF-Token` Header
- Token wird über `GET /api/csrf` ausgeliefert
- Zusätzlich: `Idempotency-Key` Header auf allen Schreiboperationen

## 4. Datenbank – kein öffentlicher Zugriff

- Produktion: Managed PostgreSQL (Hetzner) – IP-Whitelist auf App-Server
- Docker: DB-Container lauscht nur auf `127.0.0.1` (nie `0.0.0.0`)
- UFW Firewall: Port 5432 ist NICHT geöffnet
- `docker-compose.prod.yml` enthält keinen DB-Container

## 5. Idempotency

- Alle schreibenden Requests erfordern `Idempotency-Key` Header
- Keys werden in PostgreSQL gespeichert (TTL 24h)
- Verhindert doppelte Zahlungen, doppelte Anfragen, Race Conditions
- Cleanup: `/api/internal/cleanup-idempotency` (per Scheduler alle 6h)

## 6. Rate Limiting

- **API global:** 200 Requests / 5 Min pro IP
- **Auth-Endpoints:** 50 Requests / 60s (Login, Register)
- **Request-Endpoints:** 30 Requests / 10 Min
- **Store:** Redis (empfohlen bei HA), Memory (single-instance)
- Konfigurierbar via ENV: `RATE_LIMIT_STORE`, `RATE_LIMIT_API_MAX`, etc.

## 7. Stripe Webhook-Sicherheit

- Webhook-Endpoint: `POST /api/payment/webhook/stripe`
- Signaturprüfung: `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`
- Raw Body erforderlich: `express.raw({ type: "application/json" })`
- Idempotent: Bereits abgeschlossene Payments werden ignoriert

## 8. Deployment-Sicherheit

- `node_modules/` nie im Repo (`.gitignore` + `.dockerignore`)
- `.env` nie im Repo (nur `.env.example`, `.env.prod.example`)
- Docker Images: `npm ci --omit=dev` (keine devDependencies)
- `docker-compose.override.yml` in `.gitignore` – existiert auf Prod nicht
- Prod-Scripts nutzen immer explizite `-f` Flags
