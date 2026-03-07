# TempConnect – Produktion auf Hetzner (TLS, Firewall, Ops)

Diese Datei fasst alle produktionsrelevanten Schritte für Hetzner (oder vergleichbare VMs) zusammen: TLS, Firewall, Reverse Proxy, Rate-Limiting-Store, Backups, Monitoring.

---

## 1. Netzwerk & Firewall

**Ziel:** Nur das Nötigste nach außen öffnen.

- Auf der VM (z. B. Ubuntu) UFW aktivieren:
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 22/tcp    # SSH
  sudo ufw allow 80/tcp    # HTTP (Redirect / ACME)
  sudo ufw allow 443/tcp   # HTTPS
  sudo ufw enable
  ```
- Keine weiteren Ports von außen öffnen – insbesondere **kein 5432**, kein 8080, kein interner Redis-Port.
- Bei **Hetzner Managed PostgreSQL**: In den DB-Einstellungen nur die IPs der App-Server zulassen (oder privates Netz).

---

## 2. Reverse Proxy & TLS (Caddy oder Nginx)

**Grundidee:** Container (Frontend/API) lauschen nur auf `127.0.0.1:8080`, TLS und HSTS enden auf dem Host.

### 2.1 Caddy (empfohlen – auto TLS)

1. Caddy installieren (z. B. über offizielle Anleitung).
2. `deploy/Caddyfile.example` nach `/etc/caddy/Caddyfile` kopieren und **`deine-domain.de`** ersetzen:
   ```bash
   deine-domain.de {
       reverse_proxy 127.0.0.1:8080
   }
   ```
3. Caddy starten/aktivieren:
   ```bash
   sudo systemctl enable --now caddy
   ```
- Caddy kümmert sich automatisch um:
  - Let's Encrypt Zertifikate
  - HTTP → HTTPS Redirect
  - HSTS (optional konfigurierbar)

### 2.2 Nginx (Alternative)

1. Nginx installieren:
   ```bash
   sudo apt install nginx
   ```
2. `deploy/nginx-ssl.example.conf` als Vorlage nutzen (nach `/etc/nginx/sites-available/tempconnect` kopieren), Domain ersetzen, in `sites-enabled` verlinken.
3. Let's Encrypt via certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d deine-domain.de
   ```
4. Nginx neu laden: `sudo systemctl reload nginx`.

### 2.3 HSTS-Hinweis

- Bei HSTS auf dem Reverse Proxy: Erst aktivieren, wenn HTTPS stabil läuft, sonst kann man sich aussperren.

---

## 3. Docker-Ports: nur intern

**Compose-Kombination für Produktion:**

- Immer mit `ports-internal` starten, damit Container nur auf `127.0.0.1` lauschen:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.managed.yml -f docker-compose.ports-internal.yml up -d --build
  ```
- Frontend hört dann nur auf `127.0.0.1:8080`; DB-Container (falls lokal genutzt) nur auf `127.0.0.1:5432`. Von außen erreichbar ist nur der Reverse Proxy (Caddy/Nginx) auf 80/443.

---

## 4. Rate-Limiting Store (memory vs. Redis)

**Problem:** `express-rate-limit` ohne Store ist **pro Instanz**. Bei mehreren API-Servern hinter einem Load Balancer sind Limits sonst inkonsistent.

**Umsetzung im Code (`api/server.js`):**

- ENV `RATE_LIMIT_STORE` (`memory` | `redis`), Default = `memory`.
- ENV `REDIS_URL` (z. B. `redis://:PASSWORT@host:6379/0`).
- Wenn `RATE_LIMIT_STORE=redis` und `REDIS_URL` fehlt oder Redis nicht erreichbar ist → `logger.fatal` + `process.exit(1)` (Fail-fast).
- Alle Rate-Limiter (`authLimiter`, `requestLimiter`, `apiLimiter`) nutzen optional einen gemeinsamen `RedisStore`.

**Empfehlung:**

- **Single-VM / kleine Last:** `RATE_LIMIT_STORE=memory` (Default) ist ok.
- **Mehrere App-Server / viele Kunden:** Redis (z. B. Hetzner Managed Redis oder Upstash) aufsetzen, dann:
  ```env
  RATE_LIMIT_STORE=redis
  REDIS_URL=redis://:PASSWORT@redis-host:6379/0
  ```

---

## 5. Datenbank: Pooling & SSL

**ENV-Variablen für den Pool (`api/server.js`):**

- `PGPOOL_MAX` – max. Verbindungen im Pool (Default: 20).
- `PGPOOL_IDLE_TIMEOUT_MS` – Idle-Timeout (Default: 30000 ms).
- `PGPOOL_CONN_TIMEOUT_MS` – Connection-Timeout (Default: 0 = kein Timeout).
- `PGSSLMODE` – wenn `require`, wird SSL aktiviert (`ssl: { rejectUnauthorized: false }`). Alternativ `?sslmode=require` direkt in der `DATABASE_URL` nutzen.

**Empfehlung bei Managed DB (viele Kunden):**

- Auf die max. Verbindungszahl der Managed DB achten (`max_connections`) und `PGPOOL_MAX` so wählen, dass alle App-Server zusammen darunter bleiben (z. B. 2 App-Server × 20 Verbindungen = 40).

---

## 6. Backups & Monitoring

Siehe auch `DEPLOYMENT.md` → Abschnitt „Datenbank-Backup“ und „Backup-Strategie“.

### 6.1 Backups (pg_dump)

- Manuelles Backup (laufender Docker-Stack, lokale DB):
  ```bash
  docker compose exec db pg_dump -U tempconnect tempconnect > backup_$(date +%Y%m%d_%H%M).sql
  ```
- Restore (vereinfacht):
  ```bash
  docker compose exec -T db psql -U tempconnect tempconnect < backup_20260223_1200.sql
  ```
- Cron-Job für tägliche Backups siehe `DEPLOYMENT.md` (Beispiel mit Aufbewahrung und automatischem Löschen alter Backups).

Bei Managed DB (Hetzner): Provider-Backups aktivieren **und** zusätzlich eigene `pg_dump`-Backups in ein getrenntes Storage-Verzeichnis schreiben.

### 6.2 Uptime-Monitoring

**Minimum:** Ein externer Health-Check auf `/health`, z. B. mit:

- [Uptime Kuma](https://github.com/louislam/uptime-kuma) auf eigener kleinen VM oder Docker-Container.
- Hetzner Monitoring / Checks.
- Beliebiger SaaS (Pingdom, BetterUptime, ...).

Empfehlung: Alle 30–60 Sekunden `https://deine-domain.de/health` prüfen, Timeout < 5 s, Alarm per E-Mail/Slack.

### 6.3 Load- und Smoke-Tests

**Smoke-Test:** In `DEPLOYMENT.md` beschrieben (Build → `docker compose up -d` → `/health` → 200 OK).

**Mini-Loadtest (k6):**

- Szenario: 10–50 gleichzeitige User, 1–5 Minuten Last auf typische Endpoints (Login, Dashboard, Anfrage erstellen).
- Beispiel (skizziert):
  ```bash
  k6 run loadtest.js
  ```
  In `loadtest.js` einfache `http.get`/`http.post`-Aufrufe gegen Staging-Umgebung (nicht Produktion), mit Checks auf 200er-Status.

Ziel: Grobe Sicherheit, dass App bei „vielen Kunden" (z. B. ~100 Firmen) unter normaler Tageslast stabil bleibt.

---

## 7. Docker-Log-Rotation

Damit Container-Logs nicht unbegrenzt wachsen:

**Option A – docker-compose (pro Service):**

In `docker-compose.yml` pro Service z. B.:

```yaml
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
```

**Option B – Docker-Daemon (global):**

In `/etc/docker/daemon.json` (danach `systemctl restart docker`):

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

**Option C – logrotate für Datei-Logs:**

Falls die App in Dateien schreibt (z. B. Pino-Transport in eine Datei): klassisches logrotate für dieses Verzeichnis einrichten (z. B. täglich rotieren, 7 Tage aufbewahren).

