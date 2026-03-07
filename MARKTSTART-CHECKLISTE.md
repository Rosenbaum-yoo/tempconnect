# Muss-To-dos vor Marktstart (wichtig)

Checkliste in Reihenfolge: zuerst A (Sofort / Go-Live-Blocker), dann B (Skalierung).

---

## A) Sofort (Security / Go-Live-Blocker)

### A1) Secrets nicht optional (Sicherheitslücke geschlossen)

- **Umsetzung im Code:** In `api/server.js` bricht die API in Produktion (`NODE_ENV=production`) mit `process.exit(1)` ab, wenn:
  - `SESSION_SECRET` fehlt oder dem Dev-Default entspricht (`dev_secret_change_me`),
  - `JWT_SECRET` fehlt oder leer ist.
- **Was du tun musst:** In Produktion in `.env` / `.env.prod` **immer** setzen:
  - `SESSION_SECRET` = langer zufälliger String (z. B. `openssl rand -hex 32`),
  - `JWT_SECRET` = langer zufälliger String.

### A2) node_modules nicht im Repo/ZIP

- **Umsetzung:** `.gitignore` und `api/.dockerignore` schließen `node_modules` aus; Deploy ohne node_modules, Build auf dem Server mit `docker compose up -d --build`.
- **Was du tun musst:** Vor jedem Deploy prüfen: Kein `node_modules`-Ordner im ZIP/Repo. Siehe DEPLOYMENT.md → „Deploy / ZIP: node_modules nicht mitpacken“.

### A3) Produktion nur mit ports-internal (keine offenen Ports nach außen)

- **Umsetzung:** `docker-compose.ports-internal.yml` bindet nur `127.0.0.1` (Frontend, DB).
- **Was du tun musst:** In Produktion **immer** mit starten:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.managed.yml -f docker-compose.ports-internal.yml up -d
  ```
  So sind 5432/8080 nicht von außen erreichbar; nur der Reverse Proxy auf dem Host spricht mit 127.0.0.1:8080.

### A4) TLS/HTTPS Pflicht (nicht nur HTTP)

- **Umsetzung:** App ist SSL-ready (Secure-Cookie, trust proxy, Helmet/HSTS). Container-Nginx lauscht intern auf 80; TLS wird **auf dem Host** beendet.
- **Was du tun musst:**
  - Caddy oder Nginx auf dem **Host** für 80/443 einrichten (Let's Encrypt).
  - HSTS mindestens auf dem Reverse Proxy aktiv (Caddy/Nginx).
  - Vorlage: `deploy/Caddyfile.example`, `deploy/nginx-ssl.example.conf`.
  - Siehe DEPLOYMENT.md → „Server & SSL“, „Reverse-Proxy-Plan“.

### A5) Firewall / Ports härten

- **Was du tun musst:** Auf der VM (Hetzner/Ubuntu):
  - **Nur 22 (SSH), 80, 443** von außen offen (z. B. UFW: `ufw allow 22,80,443/tcp; ufw enable`).
  - DB-Port (5432) **nicht** von außen; bei Managed DB: Firewall so, dass nur deine App-Server (oder deine VM-IP) zugreifen dürfen.

---

## B) Kurz danach (Skalierung / viele Kunden)

### B1) Rate-Limit bei Load Balancer (mehrere API-Instanzen)

- **Aktuell:** `express-rate-limit` nutzt Memory (pro Instanz) → bei mehreren API-Servern hinter LB inkonsistent.
- **Was du tun musst:** Für „viele Kunden“ / 2+ App-Server: Rate-Limit-Store auf **Redis** (oder Upstash/Managed Redis) umstellen (z. B. `rate-limit-redis`). Optional: Bot/DDoS-Schutz über Cloudflare.
- **Im Code:** Hinweis in `api/server.js` bei den Rate-Limitern; konkrete Redis-Integration als nächster Schritt.

### B2) Datenbank: Pool-Tuning & Indizes

- **Umsetzung im Code:**
  - Pool-Parameter aus ENV: `PGPOOL_MAX`, `PGPOOL_IDLE_TIMEOUT_MS` in `api/server.js`.
  - Migration `004_performance_indexes.sql`: Indizes für Listings (Filter aktiv/type/region/category) und Requests (status, created_at, requester/receiver + status).
- **Was du tun musst:**
  - In .env bei Bedarf setzen: `PGPOOL_MAX=20`, `PGPOOL_IDLE_TIMEOUT_MS=30000` (oder Werte passend zu Managed-DB-Limits).
  - Migrations ausführen (inkl. 004) – dann sind die Indizes aktiv.

### B3) Logging / Monitoring / Backups

- **Umsetzung:** Pino-Logging; DEPLOYMENT.md mit Backup-Strategie, Cron-Beispiel, Restore.
- **Was du tun musst:**
  - **Log-Rotation:** Docker-Logs oder Journald + Rotation (logrotate); oder zentrale Logs (z. B. Grafana Loki, Datadog).
  - **Uptime-Monitoring:** Externer Health-Check auf `/health` (z. B. Uptime Kuma, Hetzner Monitoring, Pingdom).
  - **Automatische DB-Backups:** Cron wie in DEPLOYMENT.md; bei Managed DB zusätzlich Provider-Backups prüfen.

---

## Phase 2 „viele Kunden“ (>100 Firmen / gleichzeitig aktiv)

Empfohlene Mindest-Architektur:

- 2 App-Server + Hetzner Load Balancer
- Managed DB (bereits vorgesehen)
- Redis (Rate-Limit + optional Sessions/Jobs/Cache)
- Host-TLS-Reverse-Proxy (bereits vorgesehen)
- Monitoring + Alerts (Uptime Kuma / Hetzner Monitoring / später Grafana)
- Staging-Umgebung (klein, aber vorhanden)

---

## Kurzüberblick

| Nr | Thema | Code/Repo | Deine Aktion |
|----|--------|-----------|--------------|
| A1 | Secrets nicht optional | ✅ server.js exit bei fehlendem Secret in Prod | SESSION_SECRET + JWT_SECRET in .env.prod setzen |
| A2 | node_modules raus | ✅ .gitignore, .dockerignore | Vor Deploy prüfen |
| A3 | Ports nur internal | ✅ ports-internal.yml | Produktion nur mit ports-internal starten |
| A4 | TLS Pflicht | ✅ Doku + deploy/*.example | Caddy/Nginx + Let's Encrypt auf Host |
| A5 | Firewall | Doku | UFW: nur 22/80/443 |
| A6 | E-Mail (SendGrid) | ✅ SMTP in server.js, .env.example | [docs/SENDGRID-EINRICHTEN.md](docs/SENDGRID-EINRICHTEN.md) – API-Key + .env, dann API neu starten |
| B1 | Rate-Limit Redis | Hinweis im Code | Bei LB: Redis-Store einbauen |
| B2 | DB Pool & Indizes | ✅ ENV + 004_performance_indexes | ENV setzen, Migration laufen lassen |
| B3 | Logging/Monitoring/Backup | ✅ Doku + Backup-Befehle | Rotation, Uptime-Check, Cron-Backup |

**E-Mail vor Go-Live:** SendGrid in wenigen Minuten: [docs/SENDGRID-EINRICHTEN.md](docs/SENDGRID-EINRICHTEN.md) (Account, API-Key, .env, Terminal-Befehle).

Siehe auch: [DEPLOYMENT.md](./DEPLOYMENT.md), [VOR-GELDFLUSS.md](./VOR-GELDFLUSS.md).
