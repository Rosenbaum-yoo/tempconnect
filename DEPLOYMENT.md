# TempConnect – Produktions-Checkliste & Backup

Kurze Checkliste vor dem Go-Live und Anleitung für Datenbank-Backups.

**Phase-1-Status (Docker, Dev/Prod, Hetzner, SSL, HA):** siehe [PHASE1-STATUS.md](./PHASE1-STATUS.md).  
**Checkliste vor Geldfluss (node_modules, .env, Health, restart, DB, Reverse-Proxy, Backup):** siehe [VOR-GELDFLUSS.md](./VOR-GELDFLUSS.md).  
**Muss-To-dos vor Marktstart (Secrets, TLS, Firewall, Rate-Limit, DB-Tuning):** siehe [MARKTSTART-CHECKLISTE.md](./MARKTSTART-CHECKLISTE.md).

---

## Pflicht vor Marktstart (Kurzfassung)

- **Secrets:** In Produktion bricht die API ab, wenn `SESSION_SECRET` oder `JWT_SECRET` fehlen oder Default sind. Beide in `.env` setzen (z. B. `openssl rand -hex 32`).
- **TLS/HTTPS:** Pflicht. Container nur intern (80); **auf dem Host** Caddy oder Nginx mit Let's Encrypt für 80/443. HSTS auf dem Reverse Proxy. Siehe `deploy/Caddyfile.example`.
- **Produktion starten:** Nur mit `docker-compose.ports-internal.yml` → Ports nur auf 127.0.0.1 (kein 5432/8080 nach außen).
- **Firewall:** Nur 22 (SSH), 80, 443 von außen offen; DB-Port nicht öffentlich.

Details: [MARKTSTART-CHECKLISTE.md](./MARKTSTART-CHECKLISTE.md).

---

## Smoke-Test: Läuft alles?

Nach Code- oder Config-Änderungen kurz prüfen, ob Build und Start funktionieren.

1. **.env vorhanden:** Mindestens eine `.env` (z. B. von `.env.dev.example` kopieren), mit gültiger `DATABASE_URL` – für lokale DB z. B. `postgres://tempconnect:PASSWORT@db:5432/tempconnect`.
2. **Build:**  
   `docker compose -f docker-compose.yml build api`  
   → sollte ohne Fehler durchlaufen.
3. **Start:**  
   - Mit lokaler DB: `docker compose up -d`  
   - Ohne lokale DB (nur externe Managed DB): `docker compose -f docker-compose.yml -f docker-compose.managed.yml up -d`  
   → Container starten (db, migrate, api, frontend).
4. **Health prüfen:**  
   - Im Browser: **http://localhost:8080/health** → erwartet: **200** und Anzeige **„OK“**.  
   - Oder in der Konsole:  
     `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health`  
     → Ausgabe **200**.

Wenn ein Schritt fehlschlägt: Logs prüfen (`docker compose logs api`), Abschnitte zu DB, Ports und SSL in diesem Dokument durchgehen.

---

## Prüfung: Typische Cloud-Bugs (sind abgedeckt)

| Thema | Status |
|-------|--------|
| **DB-Constraints = Code/Frontend** | Plan (FREE/BASIS/PLUS/NOTDIENST) und Request-Status (SENT/ACCEPTED/DECLINED/FILLED/FINALIZED/CANCELED) sind in init.sql und API konsistent (UPPERCASE). Keine Migration mit lowercase-Status. |
| **Init vs Migrationen (Schema-Drift)** | Init = nur Basis (users, subscriptions, listings, requests). Alles Weitere in Migrations (001–003). Eine Quelle pro Tabelle/Spalte. Siehe `sql/README.md`. |
| **Prod-Setup** | Kein `npm install`/`npm run dev` in Prod: Dockerfile mit `npm ci`, `npm run start`, kein Code-Volume. Auf Hetzner: `docker compose -f docker-compose.yml up -d` (ohne Override). |

---

## Sicherheitsprüfung (vor Cloud-Gang)

Vor dem Einsatz in der Cloud müssen folgende Punkte erfüllt sein. **Alle sind im Projekt umgesetzt:**

| Prüfpunkt | Status | Umsetzung |
|-----------|--------|------------|
| **CORS nicht offen für "\*"** | ✅ | CORS erlaubt nur Whitelist: `localhost`, `127.0.0.1`, plus `CORS_ORIGIN` aus .env. Unbekannte Origins erhalten `false` (kein Zugriff). |
| **Rate Limiting** | ✅ | `express-rate-limit`: Auth (Login/Register/Reset) strikt (z. B. 5/15 Min), Anfragen-Senden begrenzt, allgemeiner API-Limiter. Konfigurierbar über `RATE_LIMIT_*` in .env. |
| **Helmet** | ✅ | `helmet()` aktiv (Security-Headers, HSTS bei HTTPS). CSP für API aus (Frontend setzt ggf. eigene CSP). |
| **Body Size Limit** | ✅ | `express.json({ limit: "1mb" })` für JSON-Body. Stripe-Webhook: `express.raw({ limit: "1mb" })` – verhindert DoS durch große Payloads. |
| **SQL Injection Schutz** | ✅ | Alle DB-Zugriffe über **parameterisierte Queries** (`pool.query(sql, [param1, param2, ...])` mit `$1`, `$2`, …). Keine String-Konkatenation von User-Input in SQL. |

→ **Vor Cloud-Gang:** Diese Liste einmal abhaken; bei Änderungen an CORS, Body-Parsing oder DB-Zugriffen erneut prüfen.

---

## Hetzner: Managed DB + 2 Server + Load Balancer + Firewall

### Was bereits passt

- **Managed PostgreSQL (Hetzner):** API und Migrations nutzen `DATABASE_URL`. Einfach in .env die Connection-URL der Managed DB eintragen. `sql/migrate.sh` unterstützt `DATABASE_URL` (kein `DB_HOST` nötig). Die API ist **extern konfigurierbar**: entweder `DATABASE_URL` oder Einzelparameter (`DB_HOST`, `DB_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`) – in `server.js` wird bei fehlender `DATABASE_URL` u. a. `host: process.env.DB_HOST` verwendet.
- **Zwei App-Server:** API ist zustandslos; Sessions liegen in Postgres (`connect-pg-simple`). Beide Instanzen teilen sich DB und Sessions – kein Sticky Session nötig. Auf beiden dieselbe .env (mind. `DATABASE_URL`, `SESSION_SECRET`).
- **Load Balancer:** Health-Checks: `GET /health` oder `GET /api/health`. `trust proxy` ist gesetzt (Cookie/Client-IP hinter LB).
- **Firewall:** Keine App-Änderung nötig. Empfehlung: Nur 80/443 (und SSH) von außen; Zugriff auf Managed DB nur aus dem privaten Netz bzw. von den App-Servern (Hetzner Firewall / DB „Allowed IPs“).

### Migrations bei Managed DB

- **Option A (Compose):** Mit `docker-compose.managed.yml` einmal Migrations laufen lassen:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.managed.yml run --rm migrate
  ```
  (`.env` mit `DATABASE_URL` auf Managed DB; Server muss die DB erreichen können.)
- **Option B (manuell):** Auf einem Rechner mit Zugriff auf die Managed DB: `sql/migrate.sh` ausführen, dabei `DATABASE_URL` setzen (oder `psql` direkt mit der URL).

### Zwei Server starten

- Auf Server 1 und Server 2: gleicher Code, gleiche .env (`DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGIN`, `BASE_URL`, etc.).
- Start ohne lokale DB: `docker compose -f docker-compose.yml -f docker-compose.managed.yml up -d --build`.
- Load Balancer vor die beiden Server (Round-Robin oder Health-basiert). Kein Sticky Session nötig.

### Kurz-Checkliste Managed DB + 2 Server

- [ ] Hetzner Managed PostgreSQL angelegt, Connection-URL in .env als `DATABASE_URL`
- [ ] Firewall: Managed DB nur von App-Servern (oder privatem Netz) erreichbar
- [ ] Migrations einmal ausgeführt (siehe oben)
- [ ] Auf beiden App-Servern dieselbe .env (inkl. `SESSION_SECRET`)
- [ ] LB leitet auf 80/443 der App-Server, Health-Check auf `/health` oder `/api/health`

### Port Binding (Dev vs. Produktion)

- **Dev:** `ports: "8080:80"` (bzw. `8080:8080` etc.) ist in Ordnung – direkter Zugriff auf Frontend/DB.
- **Produktion:** Hinter Nginx Reverse Proxy sollen Ports **nur intern** exponiert werden, nicht auf 0.0.0.0:
  - Frontend nur für lokalen Nginx: `127.0.0.1:8080:80` (statt `8080:80`).
  - DB nur für lokale Tools (falls nötig): `127.0.0.1:5432:5432`.
- Optional: Mit `docker-compose.ports-internal.yml` (siehe Repo) starten – dann sind alle Ports nur auf localhost gebunden.

### Hetzner Single VM in 5 Schritten

Eine einzige VM mit externer Managed DB und SSL – komplette Anleitung:

1. **VM anlegen** (Hetzner Cloud: Ubuntu 22.04 o. ä.), SSH-Zugang einrichten. Optional: Hetzner Managed PostgreSQL anlegen, Connection-URL notieren.
2. **Docker + Docker Compose** installieren (`apt install docker.io docker-compose-plugin` bzw. offizielle Docker-Installation).
3. **Projekt auf den Server** bringen (Git clone oder `git archive` / ZIP ohne node_modules). Auf der VM: `.env.prod` aus `.env.prod.example` anlegen, `DATABASE_URL` (Managed DB), `SESSION_SECRET`, `BASE_URL`, `CORS_ORIGIN`, SMTP, Stripe eintragen. Für Compose: `cp .env.prod .env` oder `env_file: .env.prod` nutzen.
4. **App starten (ohne lokale DB):** `docker compose -f docker-compose.yml -f docker-compose.managed.yml -f docker-compose.ports-internal.yml up -d --build`. Einmal Migrations: `docker compose -f docker-compose.yml -f docker-compose.managed.yml run --rm migrate`.
5. **SSL auf dem Host:** Caddy oder Nginx installieren. Caddy: `deploy/Caddyfile.example` nach `/etc/caddy/Caddyfile` anpassen (Domain eintragen), Caddy starten. Nginx: `deploy/nginx-ssl.example.conf` als Vorlage nutzen, Let's Encrypt mit certbot. Danach: Nur noch 80/443 (und SSH) von außen erreichbar; App läuft hinter HTTPS.

Siehe auch Abschnitt **Server & SSL** und **Reverse-Proxy-Plan**.

### Load-Balancer-Konfiguration (HA: 2 Server)

Konkretes Beispiel, damit der LB vor zwei App-Servern funktioniert:

- **Hetzner Load Balancer:** Service „HTTP“, Port 80/443; Ziele = die beiden App-Server (z. B. Port 8080 oder 80). Health Check: HTTP, Pfad `/health`, Intervall z. B. 10 s. Kein Sticky Session nötig.
- **Eigener Nginx als LB:** Beide Backends in einem `upstream`; `proxy_pass` auf diesen upstream; Nginx auf einem kleinen Front-Server oder auf einer der beiden App-Maschinen. Beispiel:
  ```nginx
  upstream tempconnect_backend {
    server 10.0.0.1:8080 max_fails=2 fail_timeout=30s;
    server 10.0.0.2:8080 max_fails=2 fail_timeout=30s;
  }
  server {
    listen 80;
    server_name deine-domain.de;
    location / {
      proxy_pass http://tempconnect_backend;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /health {
      proxy_pass http://tempconnect_backend;
      access_log off;
    }
  }
  ```
  (10.0.0.1/2 durch reale private IPs der App-Server ersetzen; SSL mit certbot oder Caddy davor.)

---

## Vor dem Launch (Checkliste)

### Umgebung (.env)

- [ ] `NODE_ENV=production` (in docker-compose.yml ist Production bereits der Default; bei Nutzung von docker-compose.override.yml lokal wird Development gesetzt.)
- [ ] `BASE_URL=https://deine-domain.de` (mit **https** – aktiviert Secure-Cookie automatisch)
- [ ] `SESSION_SECRET` – langer, zufälliger String (z. B. `openssl rand -hex 32`)
- [ ] `DATABASE_URL`, `POSTGRES_*` – Produktions-DB
- [ ] `CORS_ORIGIN=https://deine-domain.de`
- [ ] SMTP (SendGrid/Brevo/etc.) mit echten Zugangsdaten
- [ ] Stripe: echte Keys und `PAYMENT_MODE=live` (wenn Zahlungen live)

### Hetzner / Produktion starten

Ohne `docker-compose.override.yml` starten (API laeuft aus gebautem Image, kein npm install beim Start):

```bash
docker compose -f docker-compose.yml up -d --build
```

Mit Mailpit (nur fuer Tests, nicht fuer echte Produktion):

```bash
docker compose -f docker-compose.yml --profile dev up -d --build
```

Lokal am Laptop: Einfach `docker compose --profile dev up -d` – dann wird die Override-Datei genutzt (Volume + npm run dev).

### Deploy / ZIP: node_modules nicht mitpacken

- **node_modules** gehoeren nicht ins Repo und nicht in Deploy-ZIPs (unnötig gross, lange Pfade, „funktioniert nur bei mir“).
- Auf dem Server: Nur Code hochladen (ohne node_modules), dann `docker compose -f docker-compose.yml up -d --build` – im API-Image wird **npm ci** ausgeführt.
- Saubere ZIP ohne node_modules (aus Git):
  ```bash
  git archive -o tempconnect-deploy.zip HEAD
  ```
- Falls du ohne Git eine Ordner-ZIP erstellst: `api/node_modules` und alle anderen `node_modules`-Ordner aus dem ZIP ausnehmen.

### Server & SSL (Produktion)

Die App ist **SSL-ready**: Secure-Cookie und Helmet (inkl. HSTS) aktivieren sich, wenn der Request als HTTPS ankommt (`X-Forwarded-Proto: https`). SSL wird **auf dem Host** beendet, nicht im Container.

- [ ] **HTTPS auf dem Host:** Nginx oder Caddy vor Docker. Caddy mit Let's Encrypt (Beispiel):
  ```bash
  # Caddyfile (auf dem Host): deine-domain.de → localhost:8080
  deine-domain.de { reverse_proxy 127.0.0.1:8080 }
  ```
  Mit `docker-compose.ports-internal.yml` lauscht der Frontend-Container nur auf 127.0.0.1:8080 – Caddy/Nginx auf dem Host empfängt 80/443 und leitet weiter.
- [ ] **Umgebung:** `BASE_URL=https://deine-domain.de` und `CORS_ORIGIN=https://deine-domain.de` in .env (mit **https**).
- [ ] **Firewall:** Nur **22 (SSH), 80, 443** von außen (z. B. UFW); DB-Port (5432) nicht öffentlich. Bei Managed DB: Zugriff nur von App-Servern erlauben.

### HA (2 Server + Load Balancer)

Für Ausfallsicherheit: zwei App-Server, eine gemeinsame DB (z. B. Hetzner Managed PostgreSQL), Load Balancer davor.

- [ ] Beide Server: gleicher Code, gleiche .env (`DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGIN`, `BASE_URL`).
- [ ] Start ohne lokale DB: `docker compose -f docker-compose.yml -f docker-compose.managed.yml up -d --build`.
- [ ] LB Health-Check: `GET http://<server>:8080/health` (oder auf API-Port, wenn getrennt) → 200 OK. Kein Sticky Session nötig (Sessions in Postgres).
- [ ] Firewall: Managed DB nur von den beiden App-Servern (oder privatem Netz) erreichbar.

### Reverse-Proxy-Plan

Vor Geldfluss / Go-Live: Klarer Plan, wie Traffic vor die App kommt.

| Schritt | Beschreibung |
|--------|--------------|
| 1. Reverse Proxy auf dem Host | Caddy oder Nginx auf dem **Server** (nicht im Container) lauscht auf 80/443. |
| 2. SSL-Terminierung | Let's Encrypt (Caddy automatisch, Nginx + certbot). Kein SSL im App-Container. |
| 3. Weiterleitung | Proxy leitet auf `127.0.0.1:8080` (Frontend-Container). Mit `docker-compose.ports-internal.yml` lauscht der Container nur auf localhost. |
| 4. Header | Proxy setzt `X-Forwarded-Proto: https` und `X-Forwarded-For` (API nutzt `trust proxy`). |
| 5. Health | LB oder Monitoring kann `GET /health` auf dem Proxy-Port (80/443) oder direkt auf 8080 prüfen. |

Beispiel Caddyfile (Host): `deine-domain.de { reverse_proxy 127.0.0.1:8080 }`

### Umgebung aufteilen (.env.dev / .env.prod)

Vor Geldfluss: Keine gemeinsame .env für Dev und Prod – getrennte Konfiguration.

- **Lokal (Entwicklung):** `copy .env.dev.example .env.dev` (oder als `.env`), Werte anpassen. Docker: `env_file: .env` – dafür `.env` von `.env.dev.example` ableiten oder Symlink `.env` → `.env.dev`. Optional in `docker-compose.override.yml` fest `env_file: .env.dev` eintragen und lokal nur `.env.dev` pflegen.
- **Produktion (Server):** `copy .env.prod.example .env.prod` auf dem Server, alle Platzhalter durch echte Werte ersetzen (DATABASE_URL von Managed DB, SESSION_SECRET, SMTP, Stripe Live, etc.). Compose mit `env_file: .env.prod` oder `.env.prod` als `.env` auf dem Server nutzen.
- **Niemals committen:** `.env`, `.env.dev`, `.env.prod` stehen in `.gitignore`. Nur die Beispiel-Dateien `.env.example`, `.env.dev.example`, `.env.prod.example` liegen im Repo.

### Rechtliches

- [ ] Impressum, Datenschutz, AGB mit echten Firmendaten ersetzen
- [ ] Rechtliche Prüfung durch Anwalt

---

## Datenbank-Backup

### Backup-Strategie (vor Geldfluss definieren)

| Aspekt | Empfehlung |
|--------|------------|
| **Ziel** | Vollständige Wiederherstellung der DB nach Ausfall oder Fehländerung. |
| **Verantwortung** | Wer führt Backups durch / prüft Cron? Wer ist Ansprechpartner für Restore? |
| **Zeitplan** | Täglich automatisch (z. B. 3:00 Uhr); bei Managed DB ggf. Provider-Backups nutzen. |
| **Aufbewahrung** | Mind. 7 Tage lokal; optional länger (z. B. 30 Tage) auf separatem Speicher. |
| **Restore-Test** | Mind. 1× pro Jahr (oder vor großen Releases) Restore in Test-DB durchspielen. |
| **Managed DB** | Bei Hetzner Managed PostgreSQL: automatische Backups des Anbieters prüfen und ggf. zusätzlich eigene pg_dump-Sicherung (z. B. per Cron mit DATABASE_URL). |

Unten: konkrete Befehle für manuelles Backup, Wiederherstellung und Cron.

### Einmaliges Backup (manuell)

Mit laufendem Docker-Stack:

```bash
docker compose exec db pg_dump -U tempconnect tempconnect > backup_$(date +%Y%m%d_%H%M).sql
```

Ohne Docker (direkt auf dem Host, wenn DB lokal läuft):

```bash
PGPASSWORD=DEIN_PASS pg_dump -h localhost -U tempconnect tempconnect > backup_$(date +%Y%m%d_%H%M).sql
```

### Wiederherstellung

```bash
# Mit Docker
docker compose exec -T db psql -U tempconnect tempconnect < backup_20260223_1200.sql

# Oder: neue leere DB, dann Restore
docker compose exec -T db psql -U tempconnect tempconnect -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose exec -T db psql -U tempconnect tempconnect < backup_20260223_1200.sql
```

### Automatisches Backup (Cron)

Täglich um 3:00 Uhr, Backups 7 Tage aufbewahren:

```bash
# Crontab: crontab -e
0 3 * * * cd /pfad/zu/tempconnect && docker compose exec -T db pg_dump -U tempconnect tempconnect > /pfad/backups/tc_$(date +\%Y\%m\%d).sql && find /pfad/backups -name "tc_*.sql" -mtime +7 -delete
```

Ersetze `/pfad/zu/tempconnect` und `/pfad/backups` durch deine Pfade.

---

## Bereits umgesetzt (Code)

- **SSL/HTTPS-ready:** Secure-Cookie und Helmet (inkl. HSTS) aktivieren sich bei HTTPS (`X-Forwarded-Proto`). SSL-Terminierung erfolgt auf dem Host (Caddy/Nginx), siehe Abschnitt „Server & SSL“.
- **Secure Cookie:** Wird automatisch gesetzt, wenn `NODE_ENV=production` oder `BASE_URL` mit `https://` beginnt.
- **CSRF:** Token über `GET /api/csrf`, Header `X-CSRF-Token` bei POST/PUT/PATCH/DELETE.
- **Datenexport:** Nutzer können unter „Profil Informationen“ → „Meine Daten exportieren“ eine JSON-Datei herunterladen (DSGVO Art. 20).
- **Sessions in Postgres:** `connect-pg-simple` – Sessions ueberleben Restart, mehrere API-Instanzen moeglich, kein Memory-Store. Tabelle `session` wird bei Bedarf angelegt (`createTableIfMissing`).
- **Helmet:** Security-Headers (X-Content-Type-Options, X-Frame-Options, etc.) in der API.
- **Logging:** Strukturiert mit Pino (JSON in Prod, lesbar in Dev mit pino-pretty).
- **Rate Limiting:** Pro Route – Auth (Login/Register) strikter, API allgemein konfigurierbar ueber `RATE_LIMIT_*` in .env (siehe .env.example).
- **Admin-Status:** `GET /api/admin/status` mit Header `X-Admin-Secret: DEIN_SECRET` oder `?secret=DEIN_SECRET` – liefert DB-Health und Liste der angewendeten Migrationen. Nur nutzbar wenn `ADMIN_SECRET` in .env gesetzt ist.

---

*Stand: Februar 2026*
