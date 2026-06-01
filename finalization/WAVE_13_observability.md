# WAVE_13 — Observability, Betrieb und Support

> **Phase:** Infra. **Prio:** P1. **WICHTIG:** Basis-Observability sollte schon ab WAVE_00 mitlaufen (siehe `CLAUDE.md` Anmerkung "frühe Observability").

---

## Ziel

TempConnect ist nach Launch betreibbar. Fehler sind nachverfolgbar, Incidents bearbeitbar.

---

## Aufgaben

### 1. Structured Logging

- Alle Logs als JSON
- Pflichtfelder: `timestamp`, `level`, `request_id`, `org_id` (wo verfügbar), `user_id` (wo verfügbar), `message`, `context`
- Keine sensiblen Daten in Logs (keine Passwörter, keine vollen Tokens, keine PII außerhalb expliziter Audit-Logs)

### 2. Request IDs / Correlation IDs

- Pro Request eine ID
- ID wird durch Service-Calls propagiert
- ID erscheint in Frontend-Fehlermeldungen ("Fehler-ID: xyz" für Support)

### 3. Metrics-Endpunkte

- Vorhandene Endpunkte prüfen (z. B. `/metrics`)
- Pflicht-Metriken:
  - Request Rate
  - Error Rate
  - Latency P50/P95/P99
  - DB Connection Pool
  - Queue Depth

### 4. Error-Erfassung

- Sentry (oder Äquivalent) konfiguriert
- Source Maps für Frontend
- Sensitive Daten gefiltert (kein PII in Sentry)

### 5. Healthchecks

Pro Komponente:
- App: `/healthz`
- DB: Connection-Test
- Redis/Queue: Ping
- Storage: List-Bucket-Test

### 6. Alerts für P0-Zustände

- Error Rate > X %
- Latency P99 > Y ms
- DB unreachable
- Queue Depth wächst unkontrolliert
- Auth Failures Spike (möglicher Angriff)

### 7. Queue-/Job-Monitoring

- Job-Status sichtbar
- Failed Jobs werden retried (Backoff)
- Permanent Failed Jobs landen in Dead Letter Queue
- DLQ ist monitored

### 8. Audit-Log

- Alle sensiblen Aktionen (siehe WAVE_03 Triage-Kategorien): Audit-Eintrag
- Audit ist immutable (kein UPDATE/DELETE auf Audit-Tabelle)
- Audit-Export für Compliance (siehe WAVE_14)

### 9. Incident-Prozess

- Dokumentation: Was ist P0-Incident, was ist P1
- On-Call-Rotation (falls vorhanden)
- Runbook für häufige Incidents

### 10. Status-/Maintenance-Kommunikation

- Status-Page (extern oder via `trust/status.html`)
- Maintenance-Modus für App
- Kommunikationsplan: Kunden benachrichtigen bei Incidents

### 11. Support-/Staff-Follow-up

- Enterprise Requests aus WAVE_09 landen im Staff Center (WAVE_07)
- Staff sieht SLA-Timer pro Request
- Eskalations-Path dokumentiert

---

## Rate Limits (kritisch)

Auf folgende Flows MUSS Rate Limit:

- Login
- Worker Invite
- SSO
- Finance Export
- Admin-Flows
- Worker-Submit (Timesheet)
- Public-Facing Endpoints (Signup, Contact)

Bei Limit überschritten: `429 Too Many Requests`, Audit-Eintrag.

---

## Akzeptanzkriterien

- [ ] Fehler sind nachverfolgbar (Request-ID + Sentry)
- [ ] Kritische Systeme haben Healthchecks
- [ ] Staff sieht operative Risiken (Alerts erreichen Staff/Owner)
- [ ] Fehler verschwinden nicht nur in Browser-Console-Logs
- [ ] Rate Limits aktiv auf sensiblen Flows
- [ ] Audit-Log immutable und exportierbar
- [ ] Incident-Prozess dokumentiert

---

## Stop-Regeln

- Sensitives Datum in Log gefunden → STOP, filtern
- Healthcheck reportet "healthy" obwohl DB down → STOP, fixen
- Audit-Log durch normale App-Rolle änderbar → STOP, P0
