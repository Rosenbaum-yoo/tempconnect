# TempConnect – DevOps-Zusammenfassung (Hetzner-ready + sicher + skalierbar)

Diese Datei ist die **Output-Zusammenfassung** der umgesetzten DevOps-/Produktions-Maßnahmen für Marktstart (viele Kunden). Alle Änderungen sind automatisiert im Code/Config/Docs umgesetzt.

---

## 1. Geänderte Dateien

| Datei | Änderung |
|------|----------|
| `.gitignore` | Bereits vollständig: `node_modules/`, `**/node_modules/`, `.env`, `.env.*`, `*.log`, `dist/`, `build/`, `coverage/`, `docker-compose.override.yml`, `*.sql.backup` – keine Änderung nötig. |
| `api/server.js` | Production Safety: Bei `NODE_ENV=production` → `process.exit(1)` wenn `SESSION_SECRET` oder `JWT_SECRET` fehlen/unsicher. Cookie: `secure`, `httpOnly`, `sameSite: "lax"`. `app.set("trust proxy", 1)`. Rate-Limit: `RATE_LIMIT_STORE=memory|redis`, Fail-fast wenn Redis gewählt aber `REDIS_URL` fehlt. Pool: `PGPOOL_MAX`, `PGPOOL_IDLE_TIMEOUT_MS`, `PGPOOL_CONN_TIMEOUT_MS`, `PGSSLMODE`. |
| `docker-compose.yml` | Log-Rotation für Service `api`: `logging.driver: json-file`, `max-size: 50m`, `max-file: 5`. Healthcheck für API bereits vorhanden (`/health`). |
| `docker-compose.ports-internal.yml` | Ports nur auf `127.0.0.1` (Frontend 8080, DB 5432) – für Produktion empfohlen. |
| `docs/PROD_HETZNER.md` | UFW (22/80/443), Caddy/Nginx Reverse Proxy, HSTS, Rate-Limit Redis, Pool/SSL, Backups (pg_dump, Cron, Restore), Uptime Kuma, k6. **Neu:** Abschnitt 7 „Docker-Log-Rotation“ (Compose, Daemon, logrotate). |
| `.env.example` | Dokumentation: `RATE_LIMIT_STORE`, `REDIS_URL`, Hinweis Fail-fast bei Redis ohne URL. |
| `.env.prod.example` | Dokumentation: `RATE_LIMIT_STORE`, `REDIS_URL`, `PGPOOL_*`, `PGSSLMODE`. |

---

## 2. Neue Dateien (durch diese Umsetzung)

| Datei | Zweck |
|-------|--------|
| `docs/DEVOPS-ZUSAMMENFASSUNG.md` | Diese Zusammenfassung (geänderte/neue Dateien, Start-Befehle, ENV-Checkliste). |

Bereits vorhanden (keine neuen Dateien für diese Aufgaben nötig): `deploy/Caddyfile.example`, `deploy/nginx-ssl.example.conf`, `docs/PROD_HETZNER.md`, `docker-compose.ports-internal.yml`, `api/.dockerignore`.

---

## 3. Lokal starten (Entwicklung)

- **Mit lokaler DB und Mailpit:**
  ```bash
  cp .env.example .env
  # .env anpassen: POSTGRES_PASSWORD, ggf. SESSION_SECRET/JWT_SECRET für Tests
  docker compose --profile dev up -d --build
  ```
  → Frontend: http://localhost:8080, API: http://localhost:8080 (Nginx leitet API-Requests weiter), Mailpit: http://localhost:8025

- **Nur Stack ohne Mailpit:**
  ```bash
  docker compose up -d --build
  ```

- **Health prüfen:**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health
  ```
  → Erwartung: **200**

---

## 4. Produktiv auf Hetzner starten (exakte Befehle)

- **Mit externer Managed DB (Hetzner Managed PostgreSQL), Ports nur intern (empfohlen):**
  ```bash
  cp .env.prod.example .env.prod
  # .env.prod ausfüllen: DATABASE_URL, SESSION_SECRET, JWT_SECRET, CORS_ORIGIN, BASE_URL, SMTP, Stripe etc.
  docker compose -f docker-compose.yml -f docker-compose.managed.yml -f docker-compose.ports-internal.yml up -d --build
  ```

- **Migrations einmalig ausführen (Managed DB):**
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.managed.yml run --rm migrate
  ```

- **Mit lokaler DB im Container (z. B. kleine VM):**
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.ports-internal.yml up -d --build
  ```

Danach auf dem **Host**: Caddy oder Nginx für 80/443 einrichten, Proxy auf `127.0.0.1:8080`. Siehe `docs/PROD_HETZNER.md` und `deploy/Caddyfile.example` / `deploy/nginx-ssl.example.conf`.

---

## 5. ENV-Keys – Checkliste (zwingend / empfohlen)

### In Produktion zwingend (Fail-fast wenn fehlend)

| Key | Beschreibung |
|-----|--------------|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | Langer zufälliger String (z. B. `openssl rand -hex 32`). Darf **nicht** `dev_secret_change_me` sein. |
| `JWT_SECRET` | Langer zufälliger String (z. B. `openssl rand -hex 32`). |
| `DATABASE_URL` | Oder `DB_HOST` + `POSTGRES_*` – mindestens eine Variante muss gesetzt sein. |

### In Produktion stark empfohlen

| Key | Beschreibung |
|-----|--------------|
| `CORS_ORIGIN` | z. B. `https://deine-domain.de` |
| `BASE_URL` | z. B. `https://deine-domain.de` (mit https für Secure-Cookie) |
| SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) | Für E-Mail-Versand (Verifizierung, Benachrichtigungen) |
| Stripe (wenn Zahlungen): `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENT_MODE=live` | Für Live-Zahlungen |

### Optional (Skalierung / viele Kunden)

| Key | Beschreibung |
|-----|--------------|
| `RATE_LIMIT_STORE` | `memory` (Default) oder `redis` – bei Redis **muss** `REDIS_URL` gesetzt sein (sonst process.exit(1)). |
| `REDIS_URL` | z. B. `redis://:PASSWORT@host:6379/0` (bei `RATE_LIMIT_STORE=redis`) |
| `PGPOOL_MAX` | Max. DB-Verbindungen im Pool (Default 20) |
| `PGPOOL_IDLE_TIMEOUT_MS` | Idle-Timeout (Default 30000) |
| `PGPOOL_CONN_TIMEOUT_MS` | Connection-Timeout (Default 0) |
| `PGSSLMODE` | `require` für Managed DB mit SSL |

### Nicht committen

- `.env`, `.env.local`, `.env.dev`, `.env.prod` sind in `.gitignore`. Nur `.env.example` und `.env.prod.example` liegen im Repo.

---

## 6. Repo-Cleanup (Regel)

- **node_modules** gehören nicht ins Repo und nicht in Deploy-ZIPs. `.gitignore` und `api/.dockerignore` schließen sie aus. Vor Deploy: Kein `api/node_modules` mitpacken; auf dem Server wird mit `docker compose ... up -d --build` gebaut (`npm ci` im Image).

---

*Stand: Februar 2026*
