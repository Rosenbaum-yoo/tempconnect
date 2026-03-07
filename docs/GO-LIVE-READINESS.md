# Go-Live Readiness (Premium Upgrade)

Stand: 03.03.2026

---

## 1) Prozentstatus Go-Live Readiness

| Bereich | Status | Anmerkung |
|--------|--------|-----------|
| A) Technik – SLA Tracking | **umgesetzt** | Messpunkte in DB + Code, Events an richtigen Stellen, Cron BREACHED, Pulse-Report-Endpoint |
| B) Recht – SLA/AGB/Disclaimer | **umgesetzt** | Docs angeglichen, Landing Pulse-safe, Footer mit Impressum/Datenschutz/AGB/SLA, Disclaimer in Modals |
| C) Produkt – Notdienst/UX | **umgesetzt** | Differenzierungstext + Abo-Feature-Vergleich; Notdienst-Eskalation Stufe 2 (10 min) / Stufe 3 (20 min) via Cron `POST /api/internal/notdienst-escalate` |
| D) Hetzner – Docker/DB/Dev | **umgesetzt** | DB-Port standardmäßig 127.0.0.1, .gitignore uploads/tmp, /ready Endpoint, Managed-Compose dokumentiert |
| E) Feature-Gating | **vorhanden** | Legacy/SLA wie spezifiziert, alle SLA-Cards vorhanden |

**Gesamt: MVP Go-Live sicher umsetzbar.** Keine harten Stopper. Mittelrisiken: Notdienst-Eskalation Stufe 2/3 (Cron) optional nach Go-Live.

---

## 2) Liste geänderter/neu erstellter Dateien (mit Begründung)

| Datei | Änderung / Begründung |
|-------|------------------------|
| **api/services/requestService.js** | `createCapacityRequest`: INSERT setzt `sla_started_at`, `sla_status='RUNNING'` für sofortige Pulse-Tracking-Basis. |
| **api/services/slaService.js** | `recordSlaStarted`, `recordMatchingAttempt`, `recordNotificationSent`, `markSlaMet` (idempotent); `slaScan` sucht RUNNING+OK, schreibt Event `SLA_BREACHED`. |
| **api/routes/requests.js** | Nach Erstellung Kapazitätsanfrage: SLA_STARTED, MATCHING_ATTEMPT, E-Mail an Agentur, NOTIFICATION_SENT, ggf. MET. Neuer Endpoint `GET /requests/:id/sla-report` (JSON). |
| **api/routes/health.js** | `GET /api/ready` für DB-Connectivity-Check (z. B. LB/K8s). |
| **api/routes/internal.js** | `POST /api/internal/notdienst-escalate` für Notdienst-Stufen 2/3 (10 min / 20 min). |
| **api/services/slaService.js** | `notdienstEscalationScan`: RUNNING NOTDIENST nach 10/20 min escalation_level 1/2 + Event `escalated` (stage 2/3). |
| **docker-compose.yml** | DB-Ports standardmäßig `127.0.0.1:…`, Prod nicht versehentlich ins Internet. |
| **.gitignore** | `uploads/`, `tmp/`, `**/uploads/`, `**/tmp/` ergänzt. |
| **docs/SLA_LEISTUNGSBESCHREIBUNG.md** | Abschnitt 3.4 Technische Messpunkte (Feld- und Event-Definitionen) ergänzt. |
| **frontend/index.html** | Headline Pulse-safe ("Schneller Matching-Versuch und unterstützte Kapazitätssuche"); Footer-Link SLA + Modal-Inhalt SLA; kein Erfolgsversprechen. |

---

## 3) Harte Stopper und Mittelrisiken

- **Harte Stopper:** 0. Alle geschützten APIs nutzen `requireFeature`; Pulse-Events und Cron sind umgesetzt; DB standardmäßig nur localhost.
- **Mittelrisiken:**
  - PDF-Export Pulse-Report: aktuell JSON; PDF optional später.

---

## 4) Schritt-für-Schritt Testplan

### 4.1 Pläne simulieren

- In DB: `INSERT INTO subscriptions (user_id, plan, status) VALUES ('<user-uuid>', 'PLUS', 'active');` (oder NOTDIENST, BASIS, FREE).
- Oder nach Login: `POST /api/me/plan` mit Body `{ "plan": "PLUS" }` (CSRF + Session erforderlich).

### 4.2 SLA-Request erstellen

1. Als Unternehmen (company) mit Plan PLUS einloggen.
2. Kapazitätssuche öffnen, eine Kapazität auswählen, Anfrage senden (capacity_id, role, quantity, start_date, end_date oder duration_days).
3. Erwartung: 201, Response enthält `sla_started_at`, `sla_status: 'RUNNING'` (oder nach E-Mail + MET sofort `sla_status: 'MET'`).

### 4.3 Matching Attempt / Notification Event

- Beim obigen Request: Nach Erstellung werden `recordSlaStarted`, `recordMatchingAttempt`, E-Mail an Agentur, `recordNotificationSent` ausgeführt.
- Prüfen: `GET /api/requests/:id` (id der neuen Anfrage) → `sla_events` enthält SLA_STARTED, MATCHING_ATTEMPT, NOTIFICATION_SENT; ggf. SLA_MET.

### 4.4 Cron Scan (BREACHED)

1. In DB eine Anfrage mit `sla_status = 'RUNNING'`, `sla_respond_by` in der Vergangenheit setzen.
2. Cron aufrufen:  
   `curl -X POST http://localhost:3000/api/internal/sla-scan -H "Content-Type: application/json" -H "X-Internal-Secret: <INTERNAL_CRON_SECRET>" -d '{"batch_size":10}'`
3. Erwartung: 200, `{ "ok": true, "breached": 1 }`. Anfrage hat `sla_status='BREACHED'`, `sla_breached_at` gesetzt, Event SLA_BREACHED in sla_events.

### 4.5 Paywall / Locked Cards

- Mit Plan FREE/BASIS: `/public/enterprise.html` aufrufen → Paywall mit "Abo ansehen".
- Mit Plan PLUS/NOTDIENST: `/` (Legacy) → Legacy-Hinweis "Zum Pulse-Dashboard"; Suche/Anbieten/Anfragen zeigen Legacy-Locked-View.
- Pulse-Dashboard: Karten "Angebote", "Hilfe", "Abo", "Profil", "Nachweise" sichtbar; bei FREE/BASIS als locked mit "Upgrade ansehen".

### 4.6 DB-Ports

- `docker compose up -d` (ohne Override): `127.0.0.1:5432` → von außen nicht erreichbar.
- Mit `docker-compose.ports-internal.yml`: gleiches Verhalten für DB/Frontend auf localhost.

### 4.7 Health / Ready

- `GET /health` → 200 OK.
- `GET /api/health` → 200, `{ "ok": true, "service": "api" }` (mit DB-Check).
- `GET /api/ready` → 200, `{ "ok": true, "ready": true }` oder 503 bei DB-Ausfall.

### 4.8 Pulse-Report

- `GET /api/requests/:id/sla-report` (mit Session, id = eigene Anfrage) → JSON mit request_id, sla_started_at, sla_respond_by, sla_status, sla_events, etc.

---

## 5) Hetzner Prod Runbook (Kurz-Checkliste)

- [ ] **Domain** – DNS auf App-Server (oder LB) zeigen.
- [ ] **Caddy/Nginx** – Reverse Proxy für 80/443; Proxy zu Frontend (z. B. 127.0.0.1:8080) und API (z. B. 127.0.0.1:3000).
- [ ] **Managed DB** – Hetzner Managed PostgreSQL; `DATABASE_URL` in .env; kein lokaler DB-Container in Prod (`docker compose -f docker-compose.yml -f docker-compose.managed.yml`).
- [ ] **Umgebungsvariablen** – SESSION_SECRET, INTERNAL_CRON_SECRET, SMTP, ggf. Stripe, CORS_ORIGIN, BASE_URL setzen.
- [ ] **NODE_ENV=production** – im Prod-Compose/Env gesetzt.
- [ ] **Backups** – Managed-DB-Backups bei Hetzner aktivieren; optional zusätzliche Log-/Snapshot-Strategie.
- [ ] **Cron** – Server-Cron (z. B. alle 5 Min):  
  `curl -X POST https://<domain>/api/internal/sla-scan -H "X-Internal-Secret: $INTERNAL_CRON_SECRET"`  
  Optional: `notdienst-escalate` (NOTDIENST Stufe 2/3), expire-reservations, cleanup-idempotency, recompute-supplier-metrics, recompute-compliance.
- [ ] **Monitoring** – Uptime-Check auf `/health` bzw. `/api/health`; optional `/api/ready` für Readiness.
- [ ] **Sicherheit** – Keine node_modules/.env im Repo/ZIP; INTERNAL_CRON_SECRET nur auf dem Runner; DB nicht öffentlich gebunden (nur 127.0.0.1 oder kein Port-Mapping bei Managed).

---

## 6) Wichtigste Entscheidungen (Kurz)

- **SLA erfüllt (MET):** Sobald innerhalb der Frist ein MATCHING_ATTEMPT oder NOTIFICATION_SENT erfolgt ist; bei Kapazitätsanfrage direkt nach Erstellung (E-Mail an Agentur) als MET markiert, da Frist noch nicht abgelaufen.
- **Cron BREACHED:** Nur RUNNING (und Rückwärtskompatibel OK); nach Update wird ausschließlich Event `SLA_BREACHED` geschrieben (zusätzlich `escalated` für Metriken).
- **DB-Port:** Standard-Bind 127.0.0.1 im Basis-Compose; Dev kann per Override 0.0.0.0 nutzen.
- **Kein Erfolgsversprechen:** Landing-Headline und alle SLA-Texte ohne "garantiert"/"sofort passend"; Disclaimer in Modals und Pulse-Bereich.
- **Feature-Gating:** Unverändert; Legacy (FREE/BASIS) vs. SLA (PLUS/NOTDIENST) wie zuvor umgesetzt; alle SLA-Cards im Dashboard vorhanden und Pulse-safe formuliert.
