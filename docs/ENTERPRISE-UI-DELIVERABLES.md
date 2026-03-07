# Enterprise UI – Deliverables (Model B + SLA, Scorecard, Compliance)

Statisches HTML/JS-Frontend für die drei Enterprise-Features: **Pulse-Timer + Eskalation**, **Compliance-Ampel (GREEN/YELLOW/RED)** und **Supplier Scorecard (Note A/B/C + Fill-rate, On-time, Quality, Pulse-Bruchrate)**. Alle Seiten nutzen die bestehende API; Auth per Session-Cookie, CSRF für Schreibzugriffe.

---

## A) File list (paths under frontend)

| Action | Path |
|--------|------|
| Add | `frontend/public/css/enterprise.css` |
| Add | `frontend/public/capacity_search.html` |
| Add | `frontend/public/request_detail.html` |
| Add | `frontend/public/agency_inbox.html` |
| Add | `frontend/public/js/agency_inbox.js` |
| Add | `frontend/public/company_requests.html` |
| Add | `frontend/public/supplier_scorecard.html` |
| Add | `frontend/public/enterprise.html` |
| Add | `frontend/public/js/footer.js` (gemeinsamer Footer mit Legal-Links) |
| Add | `frontend/public/legal/impressum.html` |
| Add | `frontend/public/legal/datenschutz.html` |
| Add | `frontend/public/legal/agb.html` (inkl. Verweis auf TempConnect Pulse SLA-Anlage) |
| Add | `frontend/public/legal/sla.html` (Anlage 1 – SLA, Prozessnachweis) |
| Add | `frontend/public/legal/kontakt.html` |
| Add (geplant) | `frontend/public/sla_search_job_detail.html` (Detailansicht Suchauftrag) |
| Modify | `frontend/index.html` (one nav link added) |

All pages are served by Nginx under `/public/` (e.g. `/public/capacity_search.html`).  
**Navigation vom Haupt-Frontend:** In `frontend/index.html` existiert der Menüpunkt **„Kapazität & SLA“** (Sidebar) → Link auf **`/public/enterprise.html`** (Enterprise-Hub).

---

## B) Die drei Enterprise-Screens (wo sichtbar)

| Screen | Inhalt | Wo sichtbar |
|--------|--------|-------------|
| **1) Pulse-Timer + Eskalation** | Countdown bis `sla_respond_by` (grün >15 min, gelb ≤15 min, rot abgelaufen/BREACHED); Liste der `sla_events` (created, breached, resolved). | **company_requests.html** (Badge pro Zeile), **agency_inbox.html** (Badge), **request_detail.html** (großer Timer + Karte „SLA & Escalation“). |
| **2) Compliance-Ampel** | Status GREEN / YELLOW / RED; aufklappbare Gründe (`compliance_reasons`). | **company_requests.html** (Badge), **agency_inbox.html** (Badge), **request_detail.html** (Badge + „Warum? (klicken)“ Accordion). |
| **3) Supplier Scorecard** | Note A/B/C; Fill-rate, On-time, Quality (avg_rating), Pulse-Bruchrate; optional Totals. | **supplier_scorecard.html** (eigene Seite mit Zeitraum/Agency-ID); **request_detail.html** (Karte „Supplier Scorecard“ mit Grade + 4 KPIs, wenn `scorecard` in GET `/api/requests/:id` geliefert wird). |

---

## C) API calls per screen

| Screen | Endpoints | Expected JSON (summary) |
|--------|-----------|--------------------------|
| **capacity_search.html** | GET `/api/capacities?region=&role=&available_from=&available_min=&limit=50` | `{ items: [{ id, role, region, available_effective, available_workers, agency_company_name, ... }], total, page, limit }` |
| | POST `/api/requests` (from modal) | Body: `capacity_id, role, quantity, location_text, region, start_date, end_date or duration_days, message, priority`. Response: `{ id, ... }` (201). |
| | GET `/api/csrf` | `{ token }` (for POST) |
| **request_detail.html** | GET `/api/me` | `{ id, ... }` |
| | GET `/api/requests/:id` | Request object plus `compliance_status`, `compliance_reasons`, `sla_respond_by`, `sla_status`, `sla_events`, `scorecard` (grade, fill_rate, on_time_rate, avg_rating, sla_breach_rate) |
| | PATCH `/api/requests/:id/status` | Body: `{ status: "ACCEPTED"|"DECLINED" }`. Response: updated request. |
| | GET `/api/csrf` | `{ token }` |
| **agency_inbox.html** | GET `/api/my/requests/received` | Array of requests with `id, status, role, capacity_role, listing_category, requester_company, requester_email, sla_respond_by, sla_status, compliance_status` |
| | PATCH `/api/requests/:id/status` | Body: `{ status }`. |
| | GET `/api/csrf` | `{ token }` |
| **company_requests.html** | GET `/api/my/requests/sent` | Array of requests with `id, status, role, receiver_company, sla_respond_by, sla_status, compliance_status, compliance_reasons` |
| **supplier_scorecard.html** | GET `/api/me` | `{ id }` (to resolve own agency_id if empty) |
| | GET `/api/suppliers/:agencyId/scorecard?window=30` | `{ grade, fill_rate, on_time_rate, avg_rating, sla_breach_rate, totals: { requests_received, requests_accepted, requests_finalized } }` |
| **enterprise.html** | None (static links) | – |

Keine neuen API-Endpunkte; alle nutzen die bestehende API. **GET /api/requests/:id** liefert u. a. `sla_respond_by`, `sla_status`, `compliance_status`, `compliance_reasons`, `sla_events`, `scorecard` (grade, fill_rate, on_time_rate, avg_rating, sla_breach_rate).

**Hinweis Status-Änderung:** PATCH `/api/requests/:id/status` kann bei ungültigem Übergang **409** mit Body `{ "error": "invalid_transition", "entityType": "REQUEST", "from": "...", "to": "..." }` zurückgeben. UI sollte diese Antwort anzeigen (z. B. Fehlermeldung).

---

## D) CSS

- **Reuse:** `frontend/public/css/enterprise.css` defines the same `:root` variables and core classes (`.wrap`, `.topbar`, `.btn`, `.card`, `.tag`, `.empty`, `.modal`, etc.) as the main app for consistency.
- No framework; plain HTML/CSS/JS. Zusätzliche Klassen: `.muted`, `.table`, `.kpi-row` für Scorecard-Darstellung.

---

## E) Auth

- Every fetch uses `credentials: "include"` (session cookie).
- On 401, pages redirect to `/` (start page).
- For POST/PATCH, CSRF token is fetched via GET `/api/csrf` and sent in header `X-CSRF-Token`.
- **Idempotency (empfohlen für Schreib-Requests):** Für POST/PATCH (z. B. Anfrage erstellen, Status ändern) kann der Client einen Header **`Idempotency-Key: <eindeutige Zeichenkette>`** mitsenden. Bei wiederholtem Request mit gleichem Key (gleicher User) liefert die API die gespeicherte Antwort zurück (kein doppelter Eintrag). Pro User getrennt; Keys laufen nach 24h ab. Details und curl-Beispiele: [api/docs/IDEMPOTENCY-CURL.md](../api/docs/IDEMPOTENCY-CURL.md).

---

## F) URLs (Übersicht)

| Seite | URL (relativ zur App-Basis) |
|-------|-----------------------------|
| Enterprise-Hub | `/public/enterprise.html` |
| Kapazitätssuche | `/public/capacity_search.html` |
| Meine Anfragen (Company) | `/public/company_requests.html` |
| Eingang (Agency) | `/public/agency_inbox.html` |
| Anfrage-Detail | `/public/request_detail.html?id=<UUID>` |
| Lieferanten-Bewertung | `/public/supplier_scorecard.html` |

**Einstieg aus der Haupt-App:** Sidebar-Link **„Kapazität & SLA“** → `/public/enterprise.html`. Von dort aus alle weiteren Seiten verlinkt.

---

## G) 2+2 test steps

### Test 1: Capacity search → create request → see in company list and detail (SLA + compliance)

1. **Login** as a company user on `/` (main app).
2. **Open** `/public/enterprise.html` (or click “Kapazität & SLA” in the sidebar).
3. **Click** “Kapazitätssuche” → `/public/capacity_search.html`.
4. **Submit** search (optionally fill role, region, date) → results from GET `/api/capacities` appear; cards show `available_effective`.
5. **Click** “Kapazität anfragen” on one row → modal opens. Fill role, quantity, location, region, **start_date**, and either **end_date** or **duration_days**. Submit → POST `/api/requests` → redirect to `/public/request_detail.html?id=<id>`.
6. **On request detail:** SLA countdown (or “SLA nicht konfiguriert” if no `sla_respond_by`), compliance badge (GREEN/YELLOW/RED) and “Warum?” accordion, optional supplier scorecard. Data comes from GET `/api/requests/:id`.

**Curl (after login, replace COOKIE and CSRF):**

```bash
# Search capacities
curl -s -b "tc.sid=COOKIE" "http://localhost:3000/api/capacities?limit=5"

# Create request (company, replace CAPACITY_UUID)
curl -s -X POST -b "tc.sid=COOKIE" -H "Content-Type: application/json" -H "X-CSRF-Token: CSRF" \
  -d '{"capacity_id":"CAPACITY_UUID","role":"Fachkraft","quantity":1,"location_text":"Stuttgart","region":"Stuttgart","start_date":"2026-03-01","end_date":"2026-03-08","priority":"NORMAL"}' \
  http://localhost:3000/api/requests

# Get request (SLA, compliance, scorecard)
curl -s -b "tc.sid=COOKIE" "http://localhost:3000/api/requests/REQUEST_ID"
```

---

### Test 2: Agency inbox → accept/decline → supplier scorecard

1. **Login** as an agency user.
2. **Open** `/public/agency_inbox.html`. List loads from GET `/api/my/requests/received`; each row shows SLA countdown (green/yellow/red).
3. **Click** “Annehmen” or “Ablehnen” on a SENT request → PATCH `/api/requests/:id/status` with `ACCEPTED` or `DECLINED` → list refreshes.
4. **Open** `/public/supplier_scorecard.html`. Leave agency ID empty (own scorecard) or enter another agency UUID. Select window 30 or 90, click “Bewertung laden” → GET `/api/suppliers/:id/scorecard?window=30` → grade, fill_rate, on_time_rate, sla_breach_rate, totals shown.

**Curl:**

```bash
# Inbox
curl -s -b "tc.sid=COOKIE" "http://localhost:3000/api/my/requests/received"

# Set status (agency)
curl -s -X PATCH -b "tc.sid=COOKIE" -H "Content-Type: application/json" -H "X-CSRF-Token: CSRF" \
  -d '{"status":"ACCEPTED"}' "http://localhost:3000/api/requests/REQUEST_ID/status"

# Scorecard
curl -s -b "tc.sid=COOKIE" "http://localhost:3000/api/suppliers/AGENCY_UUID/scorecard?window=30"
```

---

### Test 3: SLA timer + escalation visibility (request detail)

1. Open a request that has `sla_respond_by` set (e.g. after POST `/api/requests/:id/sla` with `sla_minutes`) via `/public/request_detail.html?id=<id>`.
2. Verify the large countdown shows remaining time (e.g. "45 min verbleibend") and colour: green (>15 min), yellow (≤15 min), red (expired or BREACHED).
3. Verify the "SLA & Escalation" card lists `sla_events` (e.g. created, breached, resolved) with event type and timestamp.

### Test 4: Compliance traffic light + reasons and supplier grade

1. Open `/public/request_detail.html?id=<id>` for a request that has compliance evaluated (request_compliance row).
2. Verify the Compliance card shows a badge GREEN / YELLOW / RED and the "Warum? (klicken)" accordion expands to show `compliance_reasons` (list of messages).
3. Verify the "Supplier Scorecard" card shows Grade A/B/C and the four KPIs: Fill-rate, On-time, Quality (avg_rating), SLA breach rate.
4. Open `/public/supplier_scorecard.html`, load scorecard for an agency: Grade (A/B/C) and KPIs Fill-rate, On-time, SLA breach rate, Quality (avg rating) are visible.

---

**Visible** means: opening the HTML page (logged in) shows data from the API; empty states show a short message (e.g. "Keine Kapazitäten gefunden", "Noch keine Anfragen").

---

## Referenzen (weitere Docs)

| Dokument | Inhalt |
|----------|--------|
| [api/docs/ENDPOINTS.md](../api/docs/ENDPOINTS.md) | Vollständige API-Endpoint-Liste. |
| [api/docs/IDEMPOTENCY-CURL.md](../api/docs/IDEMPOTENCY-CURL.md) | Idempotency (Scope pro User, Ablauf, Cleanup), curl-Beispiele. |
| [VOR-HETZNER-GO-LIVE.md](VOR-HETZNER-GO-LIVE.md) | Go-Live-Checkliste; Smoke-Test erwähnt Enterprise-UI unter `/public/enterprise.html`. |
| [ENTERPRISE-FEATURES-FOR-KI.md](ENTERPRISE-FEATURES-FOR-KI.md) | Backend/Frontend-Übersicht, drei Enterprise-Features, Cron, State Machine. |
| [ENTERPRISE-HARDENING-PATCH.md](ENTERPRISE-HARDENING-PATCH.md) | Idempotency, Audit, Status-Maschine (409 invalid_transition), Cron. |
| [README.md](README.md) | Dokumentations-Übersicht mit Links zu allen Docs. |
