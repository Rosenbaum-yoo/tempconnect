# Enterprise-Features – Übersicht für KI und Menschen

**Zweck dieses Dokuments:** Eine andere KI (oder ein Mensch) soll ohne Kontext verstehen, **was hier implementiert wurde** und **wo was liegt**. Kein Vorwissen zu TempConnect nötig.

---

## 1. Kontext in einem Satz

**TempConnect** ist eine Plattform für Zeitarbeit: Unternehmen stellen Anfragen, Agenturen bieten Kapazitäten an. Es gab bereits **Model B** (Kapazitäten, Reservierungen, erweiterte Anfragen). **Darauf wurden drei „Enterprise“-Features gebaut:** Pulse-Timer mit Eskalation, Lieferanten-Scorecard (Fill Rate, Pünktlichkeit, Note) und eine Compliance-Ampel (grün/gelb/rot) pro Anfrage.

---

## 2. Die drei Enterprise-Features (kurz)

| Feature | Was es macht | Wo sichtbar |
|--------|----------------|-------------|
| **Pulse-Timer + Eskalation** | Jede Anfrage hat eine „Antwort bis“-Frist (`sla_respond_by`). Läuft sie ab, ohne dass die Agentur antwortet → Status „BREACHED“, Eintrag in `sla_events`. Ein Cron-Job findet solche Anfragen und markiert sie. | UI: Countdown (grün >15 min, gelb ≤15 min, rot bei Breach) auf Listen und auf der Anfrage-Detailseite. |
| **Supplier Scorecard** | Pro Agentur werden Kennzahlen berechnet: Fill Rate (angenommen/erhalten), Pünktlichkeit, Pulse-Bruchrate, Durchschnittsbewertung. Daraus eine Note A/B/C. | UI: Seite „Lieferanten-Bewertung“; optional auf der Anfrage-Detailseite als Badge. API: `GET /api/suppliers/:id/scorecard?window=30`. |
| **Compliance-Ampel** | Pro Anfrage wird automatisch geprüft: Sind Pflichtfelder gesetzt (Ort, Schicht, Startdatum, Menge …)? Fehlen Zertifikate oder Hinweise? Ergebnis: GREEN / YELLOW / RED plus Begründungen. | UI: Badge auf Listen und auf der Detailseite; „Warum?“ aufklappbar mit Liste der Gründe. |

---

## 3. Backend – was wurde geändert/hinzugefügt

### 3.1 Datenbank (Migration 011)

- **Datei:** `sql/migrations/011_enterprise_sla_scorecard_compliance.sql`
- **Anfragen-Tabelle `requests`:** Neue Spalten (nur ergänzt, nichts umbenannt):
  - `sla_minutes`, `sla_respond_by`, `sla_status` (OK | BREACHED | RESOLVED), `sla_breached_at`, `escalation_level`
- **Neue Tabellen:**
  - `sla_events` – Protokoll: deadline_set, breached, resolved, escalated pro Anfrage
  - `supplier_metrics` – Aggregation pro Agentur und Zeitfenster (30/90 Tage): requests_received, requests_accepted, sla_breaches, avg_rating usw.
  - `compliance_policies` – pro Firma (company_id) konfigurierbar: required_fields, required_certifications
  - `request_compliance` – pro Anfrage: status (GREEN|YELLOW|RED), reasons (JSONB)

**Wichtig:** Keine bestehenden Tabellen/Spalten umbenannt oder entfernt. Nur ergänzt.

### 3.1.1 Datenbank – SLA-Suchaufträge (Migration 015, Marketplace-Erweiterung)

Für den Marketplace-/Pulse-Bereich gibt es zusätzliche Tabellen, um **persistente Suchaufträge** zu speichern, die als „DB-Füller“ für das Matching dienen:

- **Datei:** `sql/migrations/015_sla_search_jobs.sql` (geplant/neu)
- **Tabellen:**
  - `sla_search_jobs`
    - `id UUID PRIMARY KEY`
    - `owner_company_id UUID` (FK `users(id)`)
    - `owner_type` TEXT CHECK (`'COMPANY'` / `'AGENCY'`)
    - `target_type` TEXT CHECK (`'CAPACITY'` / `'DEMAND'`)
    - `title`, `role`, `skill_tags` (TEXT[]), `headcount`
    - Standortfelder: `location_city`, `location_postal`, `location_lat`, `location_lng`, `radius_km`
    - `urgency` TEXT CHECK (`'normal'|'plus'|'notdienst'`) DEFAULT `'normal'`
    - Status: `status` TEXT CHECK (`'open'|'paused'|'closed'`) DEFAULT `'open'`, `closed_at`
    - SLA-Felder (Prozessnachweis, kein Erfolgsversprechen): `sla_started_at`, `sla_minutes`, `sla_due_at`, `sla_status` (`'RUNNING'|'MET'|'BREACHED'`), `sla_met_at`, `sla_breached_at`, `first_matching_attempt_at`, `first_notification_sent_at`
    - Timestamps: `created_at`, `updated_at`
  - `sla_search_events`
    - `id UUID PRIMARY KEY`
    - `search_job_id UUID` (FK `sla_search_jobs(id)`)
    - `event_type` TEXT (z. B. `SLA_STARTED`, `MATCHING_ATTEMPT`, `NOTIFICATION_SENT`, `ESCALATION_STAGE`, `SLA_MET`, `SLA_BREACHED`, `JOB_CLOSED`)
    - `payload` JSONB
    - `created_at` TIMESTAMPTZ
  - `sla_search_matches` (analog zu `matches`, aber für Suchaufträge)
    - `id UUID PRIMARY KEY`
    - `search_job_id UUID` (FK `sla_search_jobs(id)`)  
    - `capacity_post_id UUID NULL` (für `target_type='CAPACITY'`)  
    - `demand_request_id UUID NULL` (für `target_type='DEMAND'`)  
    - `match_score` NUMERIC, `reasons` JSONB, `status` (`'suggested'|'notified'|'responded'|'accepted'|'rejected'`)
    - `created_at`, `updated_at`, UNIQUE-Constraint je nach Kombination (`(search_job_id, capacity_post_id)` bzw. `(search_job_id, demand_request_id)`).

Indexes:

- `CREATE INDEX` auf `(owner_company_id, status)`, `(target_type, status)`, `(location_city)`, `(sla_due_at)` (nur RUNNING).

### 3.2 Services (Logik)

| Datei | Aufgabe |
|-------|---------|
| `api/services/slaService.js` | SLA setzen (`setSla`), Breach-Scan (`slaScan`), als erledigt markieren (`markSlaResolved`). |
| `api/services/supplierMetricsService.js` | Metriken für ein Zeitfenster berechnen (`recomputeForWindow`), Scorecard für eine Agentur lesen/berechnen (`getScorecard`), Note A/B/C. |
| `api/services/complianceService.js` | Compliance für eine Anfrage berechnen (`computeForRequest`), Batch-Recompute (`recomputeBatch`). Regeln: RED z. B. bei fehlendem Schichtplan/Startdatum/Ort/Menge; YELLOW z. B. bei fehlenden Zertifikaten. |
| `api/services/marketplaceService.js` | Marketplace-Tabellen (`capacity_posts`, `demand_requests`, `matches`, `offers`, `demand_sla_events`); Matching und SLA für Marketplace-Demands. |
| `api/services/slaSearchService.js` (neu) | CRUD für `sla_search_jobs`, Pulse-Events (`sla_search_events`), Matching gegen `capacity_posts` oder `demand_requests` (je nach `target_type`), Speicherung in `sla_search_matches`. |

### 3.3 API-Routen (modulare Struktur unter `api/`)

- **Struktur (Refactoring):** Einstieg `server.js` → `app.js` (Middleware + Route-Mounts). Routen in `api/routes/*.js` (auth, health, me, listings, capacities, internal, requests, ratings, payment, …), Konfiguration `api/config/`, DB-Pool `api/db/`, Middleware `api/middleware/`, Logik `api/services/`. Vollständige Endpoint-Liste: **`api/docs/ENDPOINTS.md`**.
- **Idempotency (Enterprise, Migration 012):** Idempotency-Key pro **(User, Key)** gespeichert (`scope` + `key`), Ablauf nach 24h (`expires_at`). Cleanup: `POST /api/internal/cleanup-idempotency`. Details: **`api/docs/IDEMPOTENCY-CURL.md`**, Tests: `api/test/idempotency.test.js`.
- **Bestehende Routen erweitert (nur zusätzliche Daten, keine Breaking Changes):**
  - `GET /api/requests/:id` – liefert zusätzlich: `compliance_status`, `compliance_reasons`, `sla_events`, `scorecard` (Kurzinfo), sowie die neuen Request-Spalten (`sla_respond_by`, `sla_status` …).
  - `GET /api/my/requests/sent` und `GET /api/my/requests/received` – SELECT um `sla_respond_by`, `sla_status`, `compliance_status`, `compliance_reasons` ergänzt (JOIN/Spalten).
- **Neue Routen (nur additiv):**
  - `POST /api/requests/:id/sla` – (Company) SLA-Minuten setzen, `sla_respond_by` neu berechnen.
  - `GET /api/suppliers/:agencyId/scorecard?window=30` – Scorecard (Fill Rate, Note, …). Agency darf nur eigene ID abfragen; Company darf beliebige Agency.
  - `POST /api/policies/compliance` – (Company) Compliance-Policy anlegen (required_fields, required_certifications, …).

### 3.4 Interne Cron-Endpunkte (für Jobs, nicht für Browser)

Alle mit Header **`X-Internal-Secret`** (z. B. aus `INTERNAL_CRON_SECRET`), Rate-Limit und strukturiertem Log.

| Endpunkt | Aufgabe |
|----------|---------|
| `POST /api/internal/expire-reservations` | (war schon da) Abgelaufene Reservierungen auf `expired` setzen. |
| `POST /api/internal/sla-scan` | Anfragen mit Status SENT/OK und `sla_respond_by < now` suchen → `sla_status=BREACHED`, `sla_breached_at` setzen, Einträge in `sla_events` (breached, escalated). Nur einmal pro Anfrage breachen. |
| `POST /api/internal/recompute-supplier-metrics` | `supplier_metrics` für 30 und 90 Tage neu berechnen. |
| `POST /api/internal/recompute-compliance` | `request_compliance` für eine Batch-Anzahl von Anfragen neu berechnen (Query-Parameter `batch`). |
| `POST /api/internal/cleanup-idempotency` | Abgelaufene Idempotency-Keys löschen (`expires_at < NOW()`), optional Body `{ "batch_size": 1000 }`. Nach Migration 012; empfohlen täglich. |
| `POST /api/internal/demand-sla-scan` | SLA-Breach-Scan für Marketplace-Demands (`demand_requests`), setzt `sla_status='BREACHED'` und `demand_sla_events`. |
| `POST /api/internal/demand-notdienst-escalate` | Eskalation für Marketplace-Notdienst-Demands (Radius-Erweiterung, Events `ESCALATION_STAGE`). |
| `POST /api/internal/sla-search-scan` (neu) | SLA-Fristen für offene `sla_search_jobs` prüfen (`sla_status='RUNNING'` & `sla_due_at < NOW()`), auf `BREACHED` setzen, `SLA_BREACHED`-Events in `sla_search_events` schreiben. |
| `POST /api/internal/sla-search-run` (neu) | Für offene `sla_search_jobs` Matching anstoßen (gegen `capacity_posts` oder `demand_requests`), `MATCHING_ATTEMPT`- und ggf. `NOTIFICATION_SENT`-Events schreiben; bei Erfolg innerhalb Frist → `SLA_MET`. |

### 3.5 Verhalten bei Statusänderung

- Wenn eine Anfrage auf **ACCEPTED** oder **DECLINED** gesetzt wird (PATCH `/api/requests/:id/status`), wird im Backend **`slaService.markSlaResolved`** aufgerufen → `sla_status=RESOLVED`, Eintrag in `sla_events`.
- Beim **Anlegen** einer capacity-basierten Anfrage (POST `/api/requests` mit `capacity_id`) werden `sla_minutes` und `sla_respond_by` gesetzt und danach **`complianceService.computeForRequest`** ausgeführt.

---

## 4. Frontend – was wurde hinzugefügt

- **Alle neuen Seiten liegen unter** `frontend/public/` und werden von Nginx unter der URL **`/public/...`** ausgeliefert.
- **Auth:** Wie im Rest der App: Session-Cookie (`credentials: "include"`), bei 401 Redirect auf `/`. Für POST/PATCH: zuerst `GET /api/csrf`, dann Header `X-CSRF-Token`.
- **Kein Framework:** Nur HTML, CSS, JS (fetch).

### 4.1 Dateien (genaue Pfade)

| Datei | Zweck |
|-------|--------|
| `frontend/public/css/enterprise.css` | Gemeinsame Variablen und Klassen (wie Haupt-App: `.card`, `.btn`, `.tag`, Farben). |
| `frontend/public/enterprise.html` | **Hub:** Links zu Kapazitätssuche, Meine Anfragen, Eingang, Lieferanten-Bewertung. |
| `frontend/public/capacity_search.html` | Formular (Rolle, Region, Verfügbar ab, Mindestanzahl) → GET `/api/capacities`. Ergebnis: Karten mit `available_effective`. Button „Kapazität anfragen“ öffnet **Modal** mit Formular → POST `/api/requests` (capacity_id, role, quantity, location_text, region, start_date, end_date oder duration_days, …). |
| `frontend/public/company_requests.html` | Liste der **gesendeten** Anfragen: GET `/api/my/requests/sent`. Anzeige: SLA-Badge (grün/gelb/rot), Compliance-Badge, Link zu `request_detail.html?id=...`. |
| `frontend/public/agency_inbox.html` | Liste der **empfangenen** Anfragen: GET `/api/my/requests/received`. SLA-Countdown pro Zeile; Buttons Annehmen/Ablehnen → PATCH `/api/requests/:id/status`. Script in `frontend/public/js/agency_inbox.js`. |
| `frontend/public/request_detail.html` | Eine Anfrage: GET `/api/requests/:id`. Anzeige: großer SLA-Countdown (oder „SLA nicht konfiguriert“), Compliance-Badge + „Warum?“ (Accordion mit `compliance_reasons`), optional Lieferanten-Scorecard-Badge, Buttons Annehmen/Ablehnen für Empfänger, Aktivitätsliste aus `sla_events`. |
| `frontend/public/supplier_scorecard.html` | Eingabe: Agency-ID (leer = eigene), Zeitraum 30/90 Tage. GET `/api/suppliers/:id/scorecard?window=...` → Anzeige Note, Fill Rate, Pünktlichkeit, Pulse-Bruchrate, Totals. |

### 4.2 Navigation in der bestehenden App

- In **`frontend/index.html`** wurde **ein** Menüpunkt ergänzt: **„Kapazität & SLA“** (Sidebar) mit Link auf **`/public/enterprise.html`**. Keine anderen Änderungen an der bestehenden Startseite/Dashboard-Logik. Von dort aus sind verlinkt: Kapazitätssuche, Meine Anfragen, Eingang, Lieferanten-Bewertung; Anfrage-Detail unter **`/public/request_detail.html?id=<UUID>`**.

### 4.3 Die drei sichtbaren Enterprise-Screens

| Screen | Was angezeigt wird | Seiten |
|--------|--------------------|--------|
| **Pulse-Timer + Eskalation** | Countdown bis `sla_respond_by` (grün/gelb/rot); Liste `sla_events` (created, breached, resolved). | company_requests, agency_inbox (Badge); request_detail (großer Timer + Karte „SLA & Escalation“). |
| **Compliance-Ampel** | GREEN / YELLOW / RED; aufklappbare Gründe (`compliance_reasons`). | company_requests, agency_inbox (Badge); request_detail (Badge + „Warum?“ Accordion). |
| **Supplier Scorecard** | Note A/B/C; Fill-rate, On-time, Quality (avg_rating), Pulse-Bruchrate. | supplier_scorecard.html (eigene Seite); request_detail (Karte mit Grade + 4 KPIs). |

Vollständige Beschreibung inkl. URLs und 2+2 Tests: **`docs/ENTERPRISE-UI-DELIVERABLES.md`**.

---

## 5. Was du (KI) beachten solltest

- **Nichts umbenennen/entfernen:** Bestehende Tabellen, Spalten und API-Routen unverändert lassen. Nur ergänzen.
- **SLA-Breach nur einmal:** Der Cron `sla-scan` darf eine Anfrage nur einmal auf BREACHED setzen (wird in `slaService.slaScan` durch Abfrage von `sla_status` sichergestellt).
- **Compliance:** Wird bei Request-Erstellung/Update und optional per Cron neu berechnet; Ergebnis in `request_compliance` gespeichert. GET `/api/requests/:id` joined diese Tabelle.
- **Scorecard:** Agentur darf nur die **eigene** Agency-ID bei `GET /api/suppliers/:id/scorecard` anfragen; Unternehmen dürfen beliebige IDs anfragen.
- **Sicherheit/Konfiguration:** Keine Secrets (API-Keys, Passwörter) in Code oder Doku. Konfiguration nur über Umgebungsvariablen bzw. `.env` (die Datei steht in `.gitignore` und wird nie committet oder ins Docker-Image kopiert). In Produktion verweigert die API den Start, wenn `SESSION_SECRET` oder `JWT_SECRET` fehlen oder wie Platzhalter aussehen (z. B. `dev_secret_change_me`, `HIER_`, `DEIN_`). Siehe `docs/SECURITY-CONFIG.md` (Schlüssel-Rotation) und `docs/SECURITY-VERIFICATION.md` (Prüfbefehle).

---

## 6. Weitere Dokumente (Referenzen)

| Dokument | Inhalt |
|----------|--------|
| `docs/ENTERPRISE-UI-DELIVERABLES.md` | Enterprise-Frontend: Dateiliste, **drei Screens** (Pulse-Timer, Compliance-Ampel, Supplier Scorecard), URLs, API pro Seite, Auth/CSRF/Idempotency, 2+2 Verifikation (Tests 1–4). Einstieg: „Kapazität & SLA“ → `/public/enterprise.html`. |
| `docs/ENTERPRISE-SALES-STORY-VERIFICATION.md` | Backend-Verifikation: SLA-Breach-Flow, Scorecard-Flow, curl-Beispiele, Cron-Aufrufe. |
| `docs/MODEL-B-IMPLEMENTATION.md` | Model B (Capacities, Reservierungen, Request-Flow); verweist am Ende auf die Enterprise-UI-Doku. |
| `docs/VOR-HETZNER-GO-LIVE.md` | Go-Live-Checkliste; Abschnitt 1.4 erwähnt Migration 011 und die internen Cron-Jobs. |
| `docs/SECURITY-CONFIG.md` | Sichere Konfiguration, **How to rotate keys** (SendGrid, Stripe, SESSION_SECRET, JWT_SECRET, INTERNAL_CRON_SECRET, Admin, DB). |
| `docs/SECURITY-VERIFICATION.md` | Prüfbefehle (grep/PowerShell), damit keine Secrets in getrackten Dateien stehen. |
| `README.md` (Projektroot) | Einstieg, Sicherheitshinweis „Rotate SendGrid key now“, Links zu Doku. |

---

## 7. Schnell-Check: „Wo steht was?“

- **Pulse-Logik** → `api/services/slaService.js`; Cron → in `api/server.js` nach „sla-scan“ suchen.
- **Scorecard / Metriken** → `api/services/supplierMetricsService.js`; Route → `api/routes/requests.js` (GET `/api/suppliers/:agencyId/scorecard`).
- **Status-Maschine (Request/Reservation)** → `api/services/stateMachine.js`; 409 bei ungültigem Übergang: `{ error: "invalid_transition", entityType, from, to }`; Tests → `api/test/stateMachine.test.js`.
- **Compliance-Regeln** → `api/services/complianceService.js`; Tabelle → `request_compliance`, Policy → `compliance_policies`.
- **Neue UI-Seiten** → alle unter `frontend/public/*.html` und `frontend/public/js/agency_inbox.js`; Einstieg → `/public/enterprise.html` oder Menü „Kapazität & SLA“ auf der Startseite.
- **Sicherheit / Konfiguration** → `docs/SECURITY-CONFIG.md` (Schlüssel-Rotation), `docs/SECURITY-VERIFICATION.md` (Verifikation); `.env` nie committen; Startup-Check in `api/server.js` (Suche nach `PLACEHOLDER_PATTERNS` / `looksLikePlaceholder`).

Damit kann eine andere KI (oder ein Mensch) verstehen, was gebaut wurde und wo sie ansetzen muss, ohne das gesamte Projekt zu kennen.
