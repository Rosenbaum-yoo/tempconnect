# Vor Geldfluss – Checkliste (strategisch)

> **Hinweis:** Diese Datei ist veraltet. Die aktuelle, konsolidierte Go-Live-Checkliste ist **[docs/GO_LIVE_FINAL.md](./docs/GO_LIVE_FINAL.md)**.

Bevor Zahlungen fließen oder produktive Daten anfallen: Diese Punkte abarbeiten und abhaken.

---

## 1. node_modules entfernen

| Status | Maßnahme |
|--------|----------|
| ✅ | **Nicht im Repo:** `.gitignore` enthält `node_modules/` und `**/node_modules/`. |
| ✅ | **Nicht im Docker-Build:** `api/.dockerignore` schließt `node_modules` aus; Image baut mit `npm ci`. |
| [ ] | **Vor Deploy prüfen:** Kein `node_modules`-Ordner in ZIP/Repo haben. Deploy nur mit Code (ohne node_modules), auf dem Server `docker compose up -d --build`. |

Siehe auch: [DEPLOYMENT.md](./DEPLOYMENT.md) → „Deploy / ZIP: node_modules nicht mitpacken“.

---

## 2. .env aufteilen (.env.dev / .env.prod)

| Status | Maßnahme |
|--------|----------|
| ✅ | **Templates:** `.env.dev.example` (Entwicklung) und `.env.prod.example` (Produktion) angelegt. |
| ✅ | **Nicht committen:** `.env`, `.env.dev`, `.env.prod` in `.gitignore`. |
| [ ] | **Lokal:** `copy .env.dev.example .env.dev` (oder als `.env`), Werte anpassen. |
| [ ] | **Server:** `copy .env.prod.example .env.prod`, alle Platzhalter durch echte Werte ersetzen; Compose mit `env_file: .env.prod` oder `.env` (von .env.prod) nutzen. |

Siehe auch: [DEPLOYMENT.md](./DEPLOYMENT.md) → „Umgebung aufteilen (.env.dev / .env.prod)“.

---

## 3. Health-Route einbauen

| Status | Maßnahme |
|--------|----------|
| ✅ | **API:** `GET /health` → `200` + `"OK"` (ohne DB, für Load Balancer). |
| ✅ | **Optional:** `GET /api/health` mit DB-Check für Monitoring. |
| ✅ | **Nginx (Frontend):** `/health` liefert 200. Docker-Healthcheck nutzt `/health`. |

Keine weitere Aktion nötig.

---

## 4. restart: always prüfen

| Status | Maßnahme |
|--------|----------|
| ✅ | **docker-compose.yml:** `restart: always` für `db`, `api`, `frontend`, `mailpit`. |
| ✅ | **migrate:** `restart: "no"` (Einmal-Job). |

Keine weitere Aktion nötig.

---

## 5. DB auf externe Struktur vorbereiten

| Status | Maßnahme |
|--------|----------|
| ✅ | **Code:** API und Migrations nutzen `DATABASE_URL` bzw. `DB_HOST`/`POSTGRES_*`. |
| ✅ | **Compose:** `docker-compose.managed.yml` für Betrieb ohne Container-DB (z. B. Hetzner Managed PostgreSQL). |
| [ ] | **Produktion:** Externe Managed DB anlegen, `DATABASE_URL` in `.env.prod` eintragen, Migrations einmal ausführen. |

Siehe auch: [DEPLOYMENT.md](./DEPLOYMENT.md) → „Hetzner: Managed DB“, „Migrations bei Managed DB“.

---

## 6. Reverse-Proxy-Plan erstellen

| Status | Maßnahme |
|--------|----------|
| ✅ | **Dokumentiert:** Abschnitt „Reverse-Proxy-Plan“ in DEPLOYMENT.md (Caddy/Nginx auf Host, SSL, 80/443 → 127.0.0.1:8080, Ports nur intern). |
| [ ] | **Umsetzen:** Auf dem Server Caddy oder Nginx installieren, Caddyfile/Config anlegen, Let's Encrypt, `docker-compose.ports-internal.yml` nutzen. |

Siehe auch: [DEPLOYMENT.md](./DEPLOYMENT.md) → „Reverse-Proxy-Plan“, „Server & SSL“.

---

## 7. Backup-Strategie definieren

| Status | Maßnahme |
|--------|----------|
| ✅ | **Definiert:** Ziele, Verantwortung, Zeitplan, Aufbewahrung, Restore-Test in DEPLOYMENT.md. |
| ✅ | **Befehle:** Manuelles Backup, Wiederherstellung und Cron-Beispiel dokumentiert. |
| [ ] | **Umsetzen:** Verantwortung festlegen, Cron (oder Managed-DB-Backups) einrichten, mind. 1× Restore-Test durchführen. |

Siehe auch: [DEPLOYMENT.md](./DEPLOYMENT.md) → „Datenbank-Backup“, „Backup-Strategie“.

---

## Kurzüberblick

| # | Thema | Erledigt (Code/Repo) | Deine Aktion |
|---|--------|----------------------|--------------|
| 1 | node_modules entfernen | ✅ | Deploy ohne node_modules; vor Go-Live prüfen. |
| 2 | .env aufteilen | ✅ Templates | .env.dev / .env.prod anlegen und nutzen. |
| 3 | Health-Route | ✅ | – |
| 4 | restart: always | ✅ | – |
| 5 | DB extern vorbereiten | ✅ | Managed DB anlegen, DATABASE_URL setzen. |
| 6 | Reverse-Proxy-Plan | ✅ Dokumentation | Caddy/Nginx auf Host einrichten. |
| 7 | Backup-Strategie | ✅ Definition + Befehle | Verantwortung + Cron + Restore-Test. |
| 8 | E-Mail (SendGrid) | ✅ SMTP in Code, .env.example | [docs/SENDGRID-EINRICHTEN.md](docs/SENDGRID-EINRICHTEN.md) – API-Key, .env setzen, `docker compose up -d --build api`. |

Wenn alle Punkte abgehakt sind, ist die Basis für den Geldfluss (Go-Live, Zahlungen, produktive Daten) gelegt.

---

## Schnellcheck: Läuft alles?

Nach Änderungen: Build + Start + Health prüfen. Siehe [DEPLOYMENT.md](./DEPLOYMENT.md) → **„Smoke-Test: Läuft alles?“** (Schritte: .env → `docker compose build api` → `docker compose up -d` → http://localhost:8080/health → 200 OK).
