# TempConnect Enterprise Integrations

## Overview

TempConnect provides a first-class integrations layer for connecting external systems via webhooks, exporting business data, and receiving real-time notifications in Slack and Microsoft Teams.

## Architecture

```
Business Event → notificationMatrix.dispatch()
                     ↓
              dispatchToIntegrations(pool, eventKey, context)
                     ↓
              ┌─────────────────────────────┐
              │ For each matching integration │
              │   1. Format payload (Slack/Teams)
              │   2. Sign with HMAC-SHA256
              │   3. POST to webhook_url
              │   4. Log to webhook_deliveries
              │   5. Update org_integrations status
              └─────────────────────────────┘
                     ↓ (on failure)
              Retry via cron /internal/webhook-retry
```

**Key files:**
- `services/integrationService.js` — CRUD, dispatch, signing, retry, delivery log
- `services/integrationAdapters.js` — Slack Block Kit + Teams MessageCard formatters
- `services/exportService.js` — CSV export for timesheets, deals, audit logs
- `routes/integrations.js` — REST API for integration management
- `routes/internal.js` — Cron endpoints for retry + cleanup

## Webhook System

### Integration Management

All integrations are org-scoped and require `org.settings` permission.

| Endpoint | Method | Description |
|---|---|---|
| `/api/integrations` | GET | List all integrations for current org |
| `/api/integrations` | POST | Create new integration (auto-generates signing secret) |
| `/api/integrations/:id` | PATCH | Update integration settings |
| `/api/integrations/:id` | DELETE | Remove integration |
| `/api/integrations/:id/test` | POST | Send test message |
| `/api/integrations/events` | GET | List all supported events |
| `/api/integrations/:id/deliveries` | GET | View delivery history |
| `/api/integrations/retry-failed` | POST | Trigger retry of failed deliveries |

### Supported Providers

- **Slack** — Messages formatted as Block Kit (header, section, context, action button)
- **Microsoft Teams** — Messages formatted as O365 MessageCard

### Payload Signing (HMAC-SHA256)

Every integration gets a unique `signing_secret` on creation. Each webhook delivery includes an `X-TC-Signature-256` header:

```
X-TC-Signature-256: sha256=<hex-digest>
```

**Verification (consumer side):**
```javascript
const crypto = require('crypto');
const expectedSig = 'sha256=' + crypto
  .createHmac('sha256', signingSecret)
  .update(rawBody, 'utf8')
  .digest('hex');
const isValid = expectedSig === req.headers['x-tc-signature-256'];
```

### Delivery & Retry

- Every delivery is logged to `webhook_deliveries` with status, HTTP response, and attempt count
- Failed deliveries are retried up to 3 times with exponential backoff (1min, 2min, 3min)
- Cron endpoint `POST /internal/webhook-retry` picks failed deliveries due for retry
- Cron endpoint `POST /internal/webhook-cleanup` prunes entries older than 30 days
- Delivery log is queryable per integration via `GET /api/integrations/:id/deliveries`

## Event Catalog

24 business events available for webhook subscriptions:

### Offers
- `offer.received` — New offer received
- `offer.accepted` — Offer accepted
- `offer.rejected` — Offer rejected

### Requisitions
- `requisition.submitted_for_approval` — Requisition submitted for approval
- `requisition.approved` — Requisition approved
- `requisition.rejected` — Requisition rejected
- `requisition.filled` — Requisition filled
- `requisition.cancelled` — Requisition cancelled

### Deals & Assignments
- `deal.completed` — Deal completed
- `assignment.starting_soon` — Assignment starting soon
- `assignment.completed` — Assignment completed

### Capacity
- `capacity.match_found` — New capacity match found
- `capacity.interest_received` — Interest in capacity received
- `capacity.expiring_soon` — Capacity post expiring soon

### Compliance
- `compliance.expiring` — Compliance document expiring
- `compliance.verified` — Compliance document verified

### Supplier
- `supplier.invited` — Supplier invited to vendor pool

### Timesheets
- `timesheet.submitted` — Timesheet submitted for approval
- `timesheet.approved` — Timesheet approved
- `timesheet.rejected` — Timesheet rejected

### Contracts
- `contract.activated` — Contract activated
- `contract.terminated` — Contract terminated

### Invoices
- `invoice.issued` — Invoice issued
- `invoice.paid` — Invoice paid

## CSV Data Exports

Enterprise-grade CSV exports for business data with proper RFC 4180 compliance.

### Timesheet Export
- **Endpoint:** `GET /api/timesheets/export/csv`
- **Auth:** requireAuth + timesheet feature gate + `timesheet.view` permission
- **Filters:** `status`, `supplier_org_id`, `week_start_from`, `week_start_to`
- **Columns:** id, worker_name, org_name, supplier_org_name, status, week_start, week_end, total_hours, overtime_hours, submitted_at, approved_at, rejected_at

### Deal/Request Export
- **Endpoint:** `GET /api/requests/export/csv`
- **Auth:** requireAuth (user-scoped — exports user's sent + received requests)
- **Columns:** id, title, buyer_company, supplier_company, status, priority, urgency, max_hourly_rate_eur, workers_needed, created_at, updated_at

### Audit Log Export
- **Endpoint:** `GET /api/admin/audit-log/export/csv`
- **Auth:** requireAuth + admin role
- **Filters:** `org_id`, `actor_id`, `entity_type`, `action`, `action_type`, `status`, `from`, `to`
- **Columns:** id, action, action_type, entity_type, entity_id, actor_email, actor_name, status, created_at, details_summary

## Database Schema

### webhook_deliveries
Tracks every outbound webhook delivery attempt.

- `id` UUID PK
- `integration_id` UUID FK → org_integrations
- `event_key` TEXT — e.g. 'offer.received'
- `payload` JSONB — stored event context
- `status` TEXT — pending | success | failed | retrying
- `http_status` INT — HTTP response code
- `error_message` TEXT — error details on failure
- `attempt` INT — current attempt number (1-based)
- `max_attempts` INT — maximum retry attempts (default: 3)
- `next_retry_at` TIMESTAMPTZ — when to retry next
- `created_at` TIMESTAMPTZ
- `completed_at` TIMESTAMPTZ

### org_integrations (extended)
- `signing_secret` TEXT — HMAC-SHA256 secret (auto-generated on creation)

## Security Model

- All integration endpoints are org-scoped with `org.settings` RBAC permission
- Webhook URLs are masked in list responses (first 20 chars + `••••••`)
- Signing secrets are auto-generated (32 bytes / 64 hex chars)
- HMAC-SHA256 signing prevents payload tampering
- Cron endpoints are protected by IP allowlist + secret header
- Audit trail: all integration CRUD operations logged via `res.locals.audit`
- Delivery errors never affect the main business flow (fire-and-forget with logging)

## Migration

```sql
-- Run migration 047:
psql -d tempconnect -f sql/migrations/047_webhook_infrastructure.sql
```

## Zukünftige Integrationen (Roadmap)

### ERP-Anbindung (SAP / DATEV)
- **Zweck:** Automatischer Rechnungsexport und Mitarbeiter-Stammdaten-Sync
- **Ansatz:** CSV/XML-Export-Adapter in `exportService.js` + SFTP-Upload oder API-Call
- **Status:** Vorbereitet durch `exportService.js` (RFC 4180 CSV), Erweiterung auf DATEV-Format geplant

### E-Mail-Notifications (erweiterbar)
- **Aktuelle Basis:** `emailService.js` + `emailHtmlTemplates.js` mit Template-Engine
- **Erweiterung:** Digest-E-Mails (tägliche/wöchentliche Zusammenfassung) über Cron-Job
- **Ansatz:** `notificationMatrix.js` um E-Mail-Kanal erweitern, Template pro Event-Kategorie

### Kalender-Integration (iCal/Google Calendar)
- **Zweck:** Einsatz-Termine automatisch in Kalender synchronisieren
- **Ansatz:** `.ics`-Export-Endpoint für Assignments, CalDAV-Feed für Abonnements

### Signatur-Dienste (DocuSign / FP Sign)
- **Zweck:** Elektronische Vertragsunterschrift
- **Ansatz:** Adapter-Pattern in `integrationAdapters.js`, Webhook-Callback für Signatur-Status

## Neue Integration hinzufügen

### 1. Adapter erstellen

`api/services/integrationAdapters.js` → neue Formatter-Funktion:

```javascript
export function formatMyProvider(eventKey, context = {}) {
  const meta = getMeta(eventKey);
  return {
    // Provider-spezifisches Payload-Format
    title: meta.title,
    body: context.message,
    url: context.linkPath ? `${BASE_URL}${context.linkPath}` : null
  };
}
```

### 2. Provider in sendIntegrationEvent registrieren

```javascript
export async function sendIntegrationEvent(provider, webhookUrl, eventKey, context, options) {
  const payload = provider === 'my_provider'
    ? formatMyProvider(eventKey, context)
    : provider === 'teams'
      ? formatTeams(eventKey, context)
      : formatSlack(eventKey, context);
  // ...
}
```

### 3. Provider-Name in `org_integrations.provider` freigeben

Keine Schema-Änderung nötig — `provider` ist ein TEXT-Feld.

## Verwandte Dokumentation

- `docs/WEBHOOKS.md` — Consumer-facing Webhook Developer Guide
- `docs/API_DOCUMENTATION.md` — Vollständige API-Referenz
- `docs/ACTIVITY_FEED.md` — Audit-basierter Activity Feed
- `docs/audit-trail.md` — Audit Trail System

---

## VMS- und ERP-Anbindung: die Richtung entscheidet *(Stand 2026-09-30)*

> Ergänzt nach dem Abgleich mit Owner-Abschnitt 16 („Integrations zu bestehenden
> Systemen … zvoove, SAP Fieldglass, usw."). **Alle Angaben gegen den Code
> gemessen**, nicht aus einem Plan übernommen. Gemessen auf `main`/`75016b6`.

### Was heute wirklich steht

| Baustein | Stand | Beleg |
|---|---|---|
| Ausgehende Ereignis-Webhooks | **gebaut**, 24 Ereignisarten, HMAC-SHA256, Wiederholung + Zustellprotokoll | `integrationService.js`, Mig 047/155 |
| Provider-Adapter | **Slack und Teams** — sonst keiner | `integrationAdapters.js:1-5` |
| ERP/HR-Konnektor-**Registry** | **gebaut**: `sap_successfactors`, `sap_hcm`, `datev`, `zvoove`, `personio`, `generic` | `erpMappingService.js:8-15`, Mig 130 |
| ERP/HR-Konnektoren selbst | **nicht gebaut** | `erpMappingService.js:4` sagt es selbst: *„Spätere Konnektoren (Welle C: DATEV/SAP/zvoove) lesen hier, WOHIN + in WELCHEM Format Daten gehen. Reiner Datenzugriff — keine externe IO hier."* |
| API-Schlüssel mit Scopes | **gebaut**, 13 Scopes (`read:`/`write:` × requisitions, capacity, workers, timesheets, assignments, invoices, audit) | `apiKeyService.js`, Mig 049 |
| SCIM + SSO | **gebaut** | `scimService.js`, `ssoService.js`, Mig 055 |
| CSV-Exporte | **gebaut** (Stundenzettel, Deals, Audit) | Abschnitt „CSV Data Exports" oben |
| **SAP Fieldglass / Beeline** | **null Code-Dateien** | `grep -ri "fieldglass\|beeline"` trifft nur `AGENTS.md` (als Qualitätsmaßstab) und zwei Bewertungsdokumente |

**Der Kern in einem Satz:** die *Registry* für Konnektoren steht, die *Konnektoren*
stehen nicht — und für die beiden namentlich genannten VMS gibt es keine Zeile.

### Warum zvoove und Beeline nicht dieselbe Aufgabe sind

Das ist der Grund, warum „Integration zu Bestandssystemen" als ein Abschnitt
irreführend ist. Es sind **zwei Richtungen mit unterschiedlichem Datenmodell**:

| | **Lieferantenseite** (zvoove, DATEV, Personio, SAP HCM) | **Einkaufsseite** (SAP Fieldglass, Beeline) |
|---|---|---|
| Wessen System | das der **Zeitarbeitsfirma** — ihr ERP, ihre Lohnabrechnung | das des **Unternehmens** — dort läuft sein Fremdpersonal-Einkauf |
| Richtung | TempConnect **schreibt hinaus**: Stammdaten, Stundenzettel, Rechnungsdaten | das VMS **schreibt herein**: Bedarfe, Konditionen, Freigaben — TempConnect antwortet mit Kandidaten, Besetzungen, Stunden |
| Wer ist Kunde | die Zeitarbeitsfirma spart Doppelerfassung | das Unternehmen muss **nichts umbauen** — TempConnect erscheint als Lieferant in seinem gewohnten Werkzeug |
| Was fehlt | die Konnektoren (Registry ist da) | **alles** — es gibt keinen eingehenden Bedarfs-Eingang |
| Fundament im Bestand | `org_erp_mappings`, CSV-Exporte | die **API-Schlüssel-Scopes** `write:requisitions` / `write:timesheets` — vorhanden, aber für diesen Zweck nie verdrahtet |

**Die Einkaufsseite ist der stärkere Verkaufshebel.** Sie beantwortet den
häufigsten Einkauf-Einwand — *„wir haben schon ein System"* — mit *„dann bleiben
Sie darin"*. Genau das steht als Ziel in Abschnitt 16: „Keine Zeitarbeitsfirma
oder Einsatzunternehmen soll es nötig haben, komplett umbauen zu müssen."

### Was das für die Reihenfolge heißt

**Ein eingehender Bedarfs-Eingang trägt beide VMS.** Fieldglass und Beeline
unterscheiden sich im Format, nicht im Ablauf: ein Bedarf kommt herein, wird auf
eine Requisition abgebildet, Besetzungen und Stunden gehen zurück, jeder Schritt
trägt die fremde Vorgangs-Kennung. Wer diesen Eingang **einmal** baut — als
normalisierten Eingang hinter den bestehenden API-Schlüssel-Scopes, mit einer
Abbildungstabelle je Anbieter — hat danach pro weiterem VMS eine Abbildung zu
schreiben, kein neues System.

Das ist dieselbe Bauart, die die Registry für die Lieferantenseite schon vorsieht
(`system_type` + `sync_config`), nur für die Gegenrichtung. **Zwei Registries
desselben Musters, nicht zwei Architekturen.**

### Was zuerst geklärt werden muss — und nicht von Claude

Die konkrete Schnittstelle eines VMS ist **nicht öffentlich frei
implementierbar**. Fieldglass und Beeline führen Lieferanten-Anbindungen über
ihre eigenen Partner-/Lieferantenprogramme: Zugang zur Spezifikation, Testmandant
und Abnahme setzen eine Vereinbarung und in der Regel einen bestehenden
gemeinsamen Kunden voraus. **Ohne diesen Zugang ist jede Feldzuordnung geraten**
— und eine geratene Zuordnung ist in dieser Codebasis ausdrücklich verboten
(keine spekulativen Features, jede Schema-Aussage gegen die Quelle prüfen).

Deshalb ist der erste Schritt dieser Spur **kein Code**:

1. **Zugang beschaffen** (Owner): Lieferanten-/Partnerprogramm bei Fieldglass und
   Beeline anfragen. Das dauert Wochen, nicht Tage, und läuft parallel zu allem
   anderen. Häufig genügt ein Unternehmen, das beides nutzt und die Anbindung
   will — der Kunde öffnet die Tür schneller als eine Anfrage ohne Anlass.
2. **Den Eingang anbieterneutral bauen** (Claude, ohne Zugang möglich): der
   normalisierte Bedarfs-Eingang, die Abbildungstabelle, die Rückrichtung für
   Besetzung und Stunden — alles gegen das **eigene** Datenmodell, mit einem
   `generic`-Anbieter, der per CSV oder JSON gefüttert wird. Das ist sofort
   nützlich (jedes Unternehmen ohne VMS kann es benutzen) und wird später nur
   noch konfiguriert.
3. **Je VMS die Abbildung nachziehen**, sobald die Spezifikation vorliegt.

Schritt 2 ist damit der einzige, der ohne Wartezeit anfangen kann — und er ist
der, der auch dann Wert hat, wenn Schritt 1 nie kommt.

### Offene Entscheidung

**W-E8** — **Welche Richtung zuerst?** Lieferantenseite (die Registry steht, die
Zeitarbeitsfirma spart Doppelerfassung, Wirkung bei jedem einzelnen Kunden) oder
Einkaufsseite (nichts steht, aber sie beantwortet den härtesten
Verkaufseinwand)? *Empfehlung: Schritt 2 der Einkaufsseite* — der
anbieterneutrale Eingang, weil er ohne Fremdzugang baubar ist, beide VMS trägt
und für Kunden ohne VMS sofort nützlich ist. Die Lieferantenkonnektoren danach,
und dann zvoove zuerst: es ist im DACH-Zeitarbeitsmarkt das verbreitetste
System und steht schon in der Registry.
