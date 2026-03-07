# Vor Hetzner & Go-Live – in der richtigen Reihenfolge

Was ihr **zunächst** machen solltet, bevor ihr auf Hetzner geht und für echte Kunden live seid. Alles aus ROADMAP, MARKTSTART-CHECKLISTE, VOR-GELDFLUSS und DEPLOYMENT zusammengefasst.

---

## Phase 0: Noch vor dem Server (lokal / Vorbereitung)

### 0.1 E-Mail (SendGrid) – schon erledigt ✓
- SendGrid mit verifizierter Absender-Adresse läuft.
- Für Produktion: In der **.env.prod** (auf dem Server) dieselben SMTP-Werte eintragen (oder eine eigene Absender-Adresse für die Live-Domain, sobald ihr eine habt).

### 0.2 .env für Produktion vorbereiten
- Aus **.env.prod.example** (oder .env.example) eine **.env.prod** anlegen (oder die Werte notieren).
- **Nicht** ins Git committen – .env ist in .gitignore und wird nie ins Deploy-Paket übernommen.
- Für den Server später: Alle Platzhalter durch echte Werte ersetzen (siehe Liste unten). Schlüssel rotieren: **`docs/SECURITY-CONFIG.md`**.

### 0.3 Deploy-Paket ohne node_modules
- Vor dem ersten Upload prüfen: **Kein** Ordner **node_modules** im ZIP oder im gepackten Projekt (weder im Root noch in `api/`).
- Auf dem Server wird mit `docker compose up -d --build` gebaut – node_modules entstehen im Image.

### 0.4 Rechtliche Platzhalter ersetzen (vor echten Kunden)
- **Impressum, Datenschutz, AGB, Kontakt:** Aktuell Muster-Texte mit `[Firmenname]`, `[E-Mail-Adresse]` etc.
- Vor Go-Live: Echte Firmendaten eintragen und **von Anwalt prüfen lassen** (empfohlen).

---

## Phase 1: Hetzner – Server & Umgebung

### 1.1 Domain & Server
- **Domain** registrieren (z. B. tempconnect.de) und auf die spätere Server-IP zeigen lassen (A-Record), sobald die VM steht.
- **Hetzner Cloud:** Eine **VM** anlegen (z. B. Ubuntu 22.04), SSH-Zugang einrichten.
- **Optional:** **Hetzner Managed PostgreSQL** anlegen – dann habt ihr die DB extern und müsst sie auf der VM nicht selbst betreiben. Connection-URL notieren.

### 1.2 Docker auf der VM
- Auf der VM: **Docker** und **Docker Compose** installieren (z. B. `apt install docker.io docker-compose-plugin`).
- Projekt auf den Server bringen (Git clone oder ZIP **ohne node_modules**).

### 1.3 .env auf dem Server (Produktion)
- Auf dem Server: **.env** oder **.env.prod** anlegen (z. B. aus .env.prod.example kopieren).
- **Pflicht-Werte** eintragen:

| Variable | Bedeutung | Beispiel |
|----------|-----------|----------|
| NODE_ENV | production | `production` |
| DATABASE_URL | DB-Verbindung (Managed DB oder lokale DB) | `postgres://user:pass@host:5432/tempconnect` |
| SESSION_SECRET | Langer Zufallsstring (niemals Default!) | `openssl rand -hex 32` |
| JWT_SECRET | Langer Zufallsstring | `openssl rand -hex 32` |
| BASE_URL | Öffentliche URL der App | `https://tempconnect.de` |
| CORS_ORIGIN | Erlaubter Origin (Frontend-URL) | `https://tempconnect.de` |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM | SendGrid (wie lokal) | wie in eurer .env |
| ADMIN_SECRET | Optional: Geheimer Schlüssel für Admin-Status (DB + Migrations prüfen) | `openssl rand -hex 24` |
| INTERNAL_CRON_SECRET | Pflicht für interne Cron-Jobs (expire-reservations, sla-scan, etc.) | `openssl rand -hex 24` |
| INTERNAL_CRON_ALLOWED_IPS | Optional: Komma-getrennte IPs, die Cron aufrufen dürfen (z. B. Cron-Server) | `127.0.0.1` oder leer = Secret reicht |
| RATE_LIMIT_STORE | Optional: `memory` (Standard) oder `redis` bei mehreren API-Instanzen | `memory` |
| REDIS_URL | Nur wenn RATE_LIMIT_STORE=redis (z. B. bei Load Balancer) | `redis://…` |
| STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET | Nur wenn ihr Stripe für Abos nutzt | aus Stripe-Dashboard |
| PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET | Nur wenn ihr PayPal nutzt | aus PayPal Developer |

- **Wichtig:** In Produktion bricht die API ab, wenn `SESSION_SECRET` oder `JWT_SECRET` fehlen oder noch der Dev-Default/Platzhalter sind. Schlüssel-Rotation: siehe **`docs/SECURITY-CONFIG.md`** (How to rotate keys).

### 1.4 Datenbank & Migrations
- Wenn **Managed DB:** `DATABASE_URL` in .env eintragen.
- **Migrations einmal ausführen** (auf dem Server oder von einem Rechner mit Zugriff auf die DB):
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.managed.yml run --rm migrate
  ```
- Wenn ihr **ohne** Managed DB startet (DB-Container auf der VM): dann normal `docker compose up -d` und migrate läuft beim ersten Start mit.
- **Hinweis:** Enthalten sind u. a. Migration 009 (Model B: Capacities), 010 (Idempotency, Audit), 011 (Enterprise: SLA, Compliance, Supplier Scorecard) und **012 (Idempotency Enterprise:** Scope pro User, Ablauf 24h, `request_hash`, Cleanup). Nach 011/012 sollten interne Cron-Jobs laufen:
  - `POST /api/internal/expire-reservations` (Reservierungs-Ablauf)
  - `POST /api/internal/sla-scan` (SLA-Breaches)
  - `POST /api/internal/cleanup-idempotency` (abgelaufene Idempotency-Keys löschen, z. B. täglich, optional `batch_size`)
  - optional: `POST /api/internal/recompute-supplier-metrics`, `POST /api/internal/recompute-compliance`  
  Alle mit Header **`X-Internal-Secret`** (z. B. `INTERNAL_CRON_SECRET` in .env). Details: `docs/ENTERPRISE-SALES-STORY-VERIFICATION.md`. Idempotency: `api/docs/IDEMPOTENCY-CURL.md`.

### 1.5 App starten (Ports nur intern)
- Auf dem Server **nicht** mit offenen Ports nach außen starten – nur Reverse-Proxy soll von außen erreichbar sein.
- Start-Befehl für Produktion:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.managed.yml -f docker-compose.ports-internal.yml up -d --build
  ```
- Damit lauschen Frontend/API nur auf 127.0.0.1; von außen kommt später nur Caddy/Nginx (80/443).

### 1.6 SSL (HTTPS) auf dem Host
- **Caddy** oder **Nginx** auf der VM installieren (nicht im Container – auf dem Host).
- **Let's Encrypt** für eure Domain einrichten (Caddy macht das automatisch, bei Nginx mit certbot).
- **Reverse-Proxy:** Port 80/443 → Weiterleitung auf 127.0.0.1:8080 (oder den Port, auf dem euer Frontend-Container lauscht).
- Vorlagen im Repo: **deploy/Caddyfile.example**, **deploy/nginx-ssl.example.conf**.
- Danach: **BASE_URL** und **CORS_ORIGIN** in .env auf **https://eure-domain.de** setzen und API ggf. neu starten.

### 1.7 Firewall
- Auf der VM (z. B. UFW): **Nur 22 (SSH), 80, 443** von außen erlauben.
- **Nicht** 5432 (DB) oder 8080 (App) von außen öffnen – alles läuft über den Reverse-Proxy.

---

## Phase 2: Direkt vor Go-Live für Kunden

### 2.1 Smoke-Test
- **https://eure-domain.de/health** im Browser aufrufen → **200 OK**.
- Registrierung testen → Verifizierungs-Mail soll ankommen (SendGrid).
- Login, eine Anfrage, Deal – einmal durchklicken.
- **Enterprise-UI (optional):** Nach Login **„Kapazität & SLA“** in der Sidebar klicken → **https://eure-domain.de/public/enterprise.html**. Von dort: Kapazitätssuche, Meine Anfragen, Eingang, Lieferanten-Bewertung und Anfrage-Detail prüfen (SLA-Countdown, Compliance-Badge, Scorecard). Details und 2+2 Tests: **`docs/ENTERPRISE-UI-DELIVERABLES.md`**.

### 2.2 Backup
- **Datenbank-Backup** einrichten (Cron mit `pg_dump` oder Nutzung der Hetzner Managed-DB-Backups).
- Einmal **Restore testen**, damit ihr wisst, dass es funktioniert.

### 2.3 Monitoring (optional, aber sinnvoll)
- **Uptime-Check** auf **https://eure-domain.de/health** (z. B. Uptime Kuma, Hetzner Monitoring, Pingdom) – liefert nur **200 OK** ohne DB-Check (ideal für Load Balancer).
- **Tieferer Check inkl. DB:** **GET https://eure-domain.de/api/health** → `{ "ok": true, "service": "api" }` bei funktionierender DB.
- **Admin-Status (DB + Migrations):** **GET https://eure-domain.de/api/admin/status** mit Header **`X-Admin-Secret: <ADMIN_SECRET>`** (oder `?secret=…`) – zeigt DB-Status und angewendete Migrationen. Nur mit gültigem Secret, sonst 404.
- Bei Ausfall: Benachrichtigung erhalten.

### 2.4 Zahlungen (wenn ihr Abos verkaufen wollt)
- **Stripe:** Echte API-Keys in .env eintragen (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`).
- **Webhook-URL in Stripe** exakt setzen: **`https://eure-domain.de/api/payment/webhook/stripe`** (nicht nur `/api/payment/webhook`). Im Stripe-Dashboard unter „Webhooks“ → Endpunkt hinzufügen → Signing Secret in .env als `STRIPE_WEBHOOK_SECRET`.
- **PayPal** (optional): Webhook-URL `https://eure-domain.de/api/payment/webhook/paypal`; `PAYPAL_CLIENT_ID` und `PAYPAL_CLIENT_SECRET` in .env.
- Testzahlung durchführen.

---

## API-Struktur & Endpoints (nach Refactoring)

Die API liegt unter **`tempconnect_docker/api/`** in modularer Struktur:

- **`server.js`** – Einstieg, startet die App.
- **`app.js`** – Baut die Express-App (Middleware, Route-Mounts).
- **`config/`** – Umgebungsvariablen, Validierung (z. B. Produktion-Secrets).
- **`db/`** – Datenbank-Pool.
- **`middleware/`** – Auth, CSRF, Rate-Limit, Idempotenz.
- **`routes/`** – Pro Ressource eine Datei (auth, health, me, listings, capacities, internal, requests, ratings, payment, …).
- **`services/`** – Geschäftslogik (User, Geo, Capacity, SLA, Compliance, Audit, …).

**Vollständige Endpoint-Liste:** **`api/docs/ENDPOINTS.md`** (alle Pfade unverändert zum bisherigen Stand).

**Registrierte Routen prüfen:** Im Ordner **`api/`** ausführen: **`npm run list-routes`** (baut die App einmal und gibt alle Methoden + Pfade aus).

| Endpoint | Zweck |
|----------|--------|
| **GET /health** | Load-Balancer / Uptime: nur 200 OK, keine DB. |
| **GET /api/health** | Health inkl. DB-Check → `{ "ok": true }` oder Fehler. |
| **GET /api/admin/status** | DB + Migrations (nur mit Header `X-Admin-Secret`). |

---

## Kurz: Reihenfolge für euch

| Schritt | Was |
|--------|-----|
| 1 | SendGrid läuft (habt ihr) ✓ |
| 2 | .env.prod / Werte für Server vorbereiten (Secrets, BASE_URL, CORS, SMTP, DB) |
| 3 | Domain + Hetzner-VM (+ optional Managed DB) |
| 4 | Docker + Projekt auf Server, .env mit echten Werten |
| 5 | Migrations ausführen, App mit ports-internal starten |
| 6 | Caddy/Nginx + Let's Encrypt (SSL), Firewall (nur 22/80/443) |
| 7 | BASE_URL/CORS auf https setzen, Smoke-Test, Backup einrichten |
| 8 | Rechtliche Texte (Impressum etc.) mit echten Daten, dann Go-Live |

**Referenzen im Repo:**  
- [MARKTSTART-CHECKLISTE.md](../MARKTSTART-CHECKLISTE.md) – Security/Blocker (A1–A6).  
- [VOR-GELDFLUSS.md](../VOR-GELDFLUSS.md) – node_modules, .env, DB, Reverse-Proxy, Backup.  
- [DEPLOYMENT.md](../DEPLOYMENT.md) – „Vor dem Launch“, „Hetzner Single VM in 5 Schritten“, Backup-Befehle.  
- [api/docs/ENDPOINTS.md](../api/docs/ENDPOINTS.md) – Vollständige API-Endpoint-Liste (nach Refactoring).  
- [api/docs/IDEMPOTENCY-CURL.md](../api/docs/IDEMPOTENCY-CURL.md) – Idempotency (Scope pro User, Ablauf, Cleanup), curl-Beispiele.  
- [ENTERPRISE-UI-DELIVERABLES.md](ENTERPRISE-UI-DELIVERABLES.md) – Enterprise-Frontend: Dateien, drei Screens (SLA, Compliance, Scorecard), URLs, API pro Seite, 2+2 Verifikation (Tests 1–4).
