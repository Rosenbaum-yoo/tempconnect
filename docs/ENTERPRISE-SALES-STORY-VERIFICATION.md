# Enterprise Sales Story – Verifikation (2+2 Schritte)

Kurze Prüfschritte, um SLA, Compliance und Supplier Scorecard nach dem Deployment zu verifizieren.

**Voraussetzung:** API läuft (z. B. `http://localhost:3000` oder über Nginx), Datenbank-Migration `011_enterprise_sla_scorecard_compliance.sql` wurde ausgeführt. Für interne Cron-Aufrufe wird `X-Internal-Secret` benötigt (gleicher Wert wie in der Umgebung, z. B. `INTERNAL_CRON_SECRET`).

---

## Flow 1: Anfrage → Compliance → SLA-Countdown → SLA-Breach → sla_events

### 1.1 Anfrage erstellen (capacity-basiert)

- **Login** als Unternehmen (Company).
- **POST** eine capacity-basierte Anfrage (z. B. über UI oder curl mit Session-Cookie).

Beispiel (curl, Session-Cookie `tc.sid` und ggf. CSRF-Token aus Browser übernehmen):

```bash
# CSRF holen (Session-Cookie aus Browser setzen)
curl -s -b "tc.sid=DEIN_SESSION_COOKIE" http://localhost:3000/api/csrf

# Anfrage erstellen (capacity_id = eine gültige Kapazitäts-UUID)
curl -s -X POST -b "tc.sid=DEIN_SESSION_COOKIE" -H "Content-Type: application/json" \
  -H "X-CSRF-Token: DEIN_CSRF_TOKEN" \
  -d '{"capacity_id":"CAPACITY_UUID","role":"Fachkraft","quantity":1,"location_text":"Stuttgart","start_date":"2026-03-01","shift_schedule":"2-Schicht","sla_minutes":60}' \
  http://localhost:3000/api/requests
```

- Response enthält `id` der Anfrage (Request-UUID).

### 1.2 Compliance-Badge und SLA-Countdown prüfen

- **GET** Anfrage-Details:

```bash
curl -s -b "tc.sid=DEIN_SESSION_COOKIE" http://localhost:3000/api/requests/REQUEST_ID
```

- Erwartung:
  - `compliance_status`: `GREEN` / `YELLOW` / `RED`
  - `compliance_reasons`: Array mit kurzen Begründungen
  - `sla_respond_by`: Zeitstempel (z. B. created_at + 60 Minuten)
  - `sla_status`: `OK`

- **UI:** `company_requests.html` öffnen → Liste zeigt grünen/gelben SLA-Countdown und Compliance-Badge.  
- **UI:** `request_detail.html?id=REQUEST_ID` → großer Timer und Compliance-Bereich „Warum?“ mit Gründen.

### 1.3 SLA-Breach simulieren

- **Option A (Cron):** `sla_respond_by` in der DB auf einen Zeitpunkt in der Vergangenheit setzen (z. B. `UPDATE requests SET sla_respond_by = NOW() - interval '1 minute' WHERE id = 'REQUEST_ID'`).  
  Dann Cron aufrufen:

```bash
curl -s -X POST -H "X-Internal-Secret: DEIN_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"batch_size":100}' \
  http://localhost:3000/api/internal/sla-scan
```

- Erwartung: Response `{ "ok": true, "breached": 1 }` (oder höher, je nach weiteren offenen Anfragen).

### 1.4 sla_events prüfen

- **GET** erneut:

```bash
curl -s -b "tc.sid=DEIN_SESSION_COOKIE" http://localhost:3000/api/requests/REQUEST_ID
```

- Erwartung:
  - `sla_status`: `BREACHED`
  - `sla_breached_at`: gesetzt
  - `sla_events`: mindestens Einträge mit `event_type` `deadline_set`, `breached`, `escalated` (und ggf. `resolved` nach Reaktion des Empfängers).

---

## Flow 2: Supplier Metrics neu berechnen → Scorecard abrufen

### 2.1 Metriken neu berechnen (Cron)

```bash
curl -s -X POST -H "X-Internal-Secret: DEIN_INTERNAL_SECRET" \
  http://localhost:3000/api/internal/recompute-supplier-metrics
```

- Erwartung: `{ "ok": true }`.

### 2.2 Scorecard abrufen

- **Als Unternehmen** (oder als Anbieter für die eigene ID):

```bash
curl -s -b "tc.sid=DEIN_SESSION_COOKIE" "http://localhost:3000/api/suppliers/AGENCY_USER_UUID/scorecard?window=30"
```

- Erwartung: JSON mit z. B. `fill_rate`, `on_time_rate`, `avg_rating`, `sla_breach_rate`, `grade` (A/B/C), `totals` (requests_received, requests_accepted, requests_finalized).

- **UI:** `supplier_scorecard.html` → Agency-ID eintragen (oder leer für eigene Bewertung), Zeitraum 30/90 wählen, „Bewertung laden“ → Note und Kennzahlen werden angezeigt.

---

## Zusätzliche Prüfpunkte

- **Compliance-Batch:**  
  `POST /api/internal/recompute-compliance?batch=100` mit `X-Internal-Secret` → Response `{ "ok": true, "updated": N }`.
- **Idempotency-Cleanup (Migration 012):**  
  `POST /api/internal/cleanup-idempotency` mit `X-Internal-Secret`, optional Body `{ "batch_size": 1000 }` → löscht abgelaufene Idempotency-Keys (`expires_at < NOW()`). Response: `{ "ok": true, "deleted": N }`. Empfohlen: täglich per Cron.
- **Interne Cron-Routen** sind nur mit gültigem `X-Internal-Secret` aufrufbar (403 ohne Secret).
- **markSlaResolved:** Wenn der Empfänger die Anfrage auf ACCEPTED oder DECLINED setzt (PATCH `/api/requests/:id/status`), wird `sla_status` auf `RESOLVED` gesetzt und ein `resolved`-Eintrag in `sla_events` geschrieben.

Mit diesen 2+2 Flows sind Pulse-Timer/Eskalation, Compliance-Ampel und Supplier Scorecard abgedeckt.
