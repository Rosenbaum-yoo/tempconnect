# Phase 1 – Status & nächste Schritte

Stand: Februar 2026. **Phase 1 ist vollständig (100%)** – alle Bereiche sind im Projekt abgedeckt; für den Go-Live nur noch die konkreten Schritte auf dem Server ausführen.

---

## Übersicht

| Bereich              | Status   | Kurzbewertung |
|----------------------|----------|----------------|
| Docker Setup         | **100%** | Dockerfile, .dockerignore (api/ + Root), restart: always, Health, keine node_modules in Prod, Ports internal. |
| Dev → Prod fähig     | **100%** | NODE_ENV, Override nur lokal, env aus .env; Prod-Checkliste „Vor dem Launch“ in DEPLOYMENT.md. |
| Hetzner Single VM    | **100%** | Managed DB, managed.yml, ports-internal; Anleitung „Hetzner Single VM in 5 Schritten“ + SSL-Beispiele in deploy/. |
| SSL vorbereitet      | **100%** | Secure-Cookie, trust proxy, Helmet/HSTS; Caddyfile.example + nginx-ssl.example.conf in deploy/, Reverse-Proxy-Plan. |
| HA vorbereitet       | **100%** | Health, restart, Sessions in DB, zustandslos; LB-Konfig-Beispiel (Hetzner LB + Nginx upstream) und 2-Server-Checkliste. |

👉 **Phase 1 ist abgeschlossen.** Für Go-Live: Checkliste „Vor dem Launch“ abhaken, auf dem Server SSL und ggf. LB einrichten (Anleitungen und Beispieldateien liegen vor).

---

## 1. Docker Setup (100%)

**Umgesetzt**
- `api/Dockerfile`: `npm ci --omit=dev`, kein Volume im Prod-Compose.
- `api/.dockerignore`: `node_modules`, `.env` ausgeschlossen.
- **Root `.dockerignore`:** vorhanden (falls später Images aus Projektroot gebaut werden).
- `.gitignore`: `node_modules/` – nicht im Repo.
- `restart: always` für db, api, frontend (migrate: no).
- Health: `GET /health` → 200 OK (ohne DB), Docker-Healthcheck nutzt `/health`.
- Port-Binding dokumentiert; `docker-compose.ports-internal.yml` für Prod.

---

## 2. Dev → Prod fähig (100%)

**Umgesetzt**
- `docker-compose.yml`: NODE_ENV=production Default, kein Dev-Volume.
- `docker-compose.override.yml`: nur für lokales Dev (Volume, npm run dev, NODE_ENV=development).
- Prod-Start: `docker compose -f docker-compose.yml up -d` (ohne Override).
- Alle relevanten Werte aus .env (DB, SESSION_SECRET, JWT_SECRET, CORS, BASE_URL, etc.).
- **Prod-Checkliste:** „Vor dem Launch“ in `DEPLOYMENT.md` mit allen Punkten (Umgebung, SSL, HA, Backup, Rechtliches).

---

## 3. Hetzner Single VM (100%)

**Umgesetzt**
- `docker-compose.yml` + `docker-compose.managed.yml`: App ohne lokale DB, DATABASE_URL auf Managed DB.
- `docker-compose.ports-internal.yml`: Ports nur 127.0.0.1 (für Nginx/Caddy auf dem Host).
- Migrations mit DATABASE_URL; API mit DB_HOST/DATABASE_URL konfigurierbar.
- **Anleitung:** „Hetzner Single VM in 5 Schritten“ in `DEPLOYMENT.md` (VM, Docker, Projekt, Start, SSL).
- **SSL-Vorlagen:** `deploy/Caddyfile.example`, `deploy/nginx-ssl.example.conf`.

---

## 4. SSL vorbereitet (100%)

**Umgesetzt (App + Host-Vorlagen)**
- Secure-Cookie, wenn `NODE_ENV=production` oder `BASE_URL` mit `https://`.
- `trust proxy` 1; Nginx im Container setzt `X-Forwarded-Proto`.
- Helmet (inkl. HSTS, wenn Request als secure erkannt wird).
- **Host-Seite:** `deploy/Caddyfile.example` (Caddy + Let's Encrypt) und `deploy/nginx-ssl.example.conf` (Nginx + certbot) als Kopiervorlagen.
- Reverse-Proxy-Plan und Server & SSL in `DEPLOYMENT.md` beschrieben.

---

## 5. HA vorbereitet (100%)

**Umgesetzt**
- `/health` liefert 200 OK ohne DB – LB nimmt Instanz bei DB-Ausfall nicht aus Rotation.
- `restart: always` – Container starten nach Reboot wieder.
- Sessions in Postgres – mehrere API-Instanzen möglich, kein Sticky Session nötig.
- API zustandslos; DB extern (Managed DB) nutzbar.
- **LB-Konfiguration:** Hetzner Load Balancer (Health-Check `/health`) und Nginx-upstream-Beispiel für 2 App-Server in `DEPLOYMENT.md`.
- Checkliste „2 Server + LB“ und „Kurz-Checkliste Managed DB + 2 Server“ in `DEPLOYMENT.md`.

---

## Nächste Schritte (auf dem Server)

1. **SSL:** Caddy oder Nginx mit `deploy/Caddyfile.example` bzw. `deploy/nginx-ssl.example.conf` einrichten; `BASE_URL` und `CORS_ORIGIN` auf https setzen.
2. **Launch:** Alle Punkte unter „Vor dem Launch“ in `DEPLOYMENT.md` abhaken.
3. **HA (optional):** Zweiten App-Server + LB nach Anleitung und LB-Beispiel in `DEPLOYMENT.md` einrichten.

Damit ist Phase 1 vollständig; die Basis für Phase 2 (Skalierung, Monitoring, Backups) ist gelegt.
