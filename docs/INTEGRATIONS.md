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
| Wer ist Kunde | die Zeitarbeitsfirma spart Doppelerfassung | das Unternehmen muss **nichts umbauen** — die Zeitarbeitsfirma bedient es aus TempConnect heraus, in seinem gewohnten Werkzeug (Lieferant bleibt die Zeitarbeitsfirma, siehe „Wer ist der Lieferant“) |
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

### Zugang je Anbieter — recherchiert am 2026-09-30

> **Korrektur der ersten Fassung dieses Abschnitts (ebenfalls 2026-09-30).**
> Dort stand, die Schnittstellen von Fieldglass und Beeline seien „nicht
> öffentlich frei implementierbar“ und jede Feldzuordnung ohne Partnerzugang
> geraten. **Das war falsch.** Beide veröffentlichen ihre Dokumentation. Hinter
> einer Vereinbarung liegt nicht die *Spezifikation*, sondern der *Zugang zu
> einer laufenden Instanz* — ein anderer und kleinerer Engpass. Ebenfalls
> korrigiert: TempConnect erscheint im VMS **nicht** selbst als Lieferant.
> Die Aussage beruhte auf Allgemeinwissen statt auf den Quellen; die Tabelle
> unten ist gegen die Herstellerseiten geprüft.

**Kurzfassung:** ein Partnerprogramm ist bei **keinem** der Anbieter technische
Voraussetzung für die Anbindung *eines* Kunden. Aber „einfach so“ geht bei
keinem: jeder Zugang läuft über **Zugangsdaten, die jemand anderes ausstellt** —
und wer das ist und was es kostet, unterscheidet sich stark.

| System | Wer stellt den Zugang aus | Partnerprogramm nötig? | Kosten | Doku öffentlich? |
|---|---|---|---|---|
| **Personio** | **der Kunde selbst**: Einstellungen → Integrationen → API-Zugangsdaten → „Eigene Integration erstellen“, Rechte wählen, Client-ID + Secret weitergeben | **nein** — das Partnerprogramm dient dem Eintrag im Personio-Marktplatz, nicht dem Zugang | beim Kunden: ein Tarif mit API-Zugang für eigene Integrationen (laut Personio-Hilfe derzeit „Core Pro“) | ja |
| **zvoove Recruit** | **der Kunde**: Bediener-API-Key in den Einstellungen | nein | beim Kunden | ja, nach Anmeldung in der Kundeninstanz unter `/swagger` |
| **zvoove PDL** *(das eigentliche Zeitarbeits-ERP)* | über zvoove bzw. dessen **Schnittstellenpartner** | **vermutlich ja** — die öffentlich dokumentierten Anbindungen (talent360 über PD Connect, Blink) laufen alle über zvooves Partnernetz; eine frei zugängliche PDL-API wurde **nicht** gefunden | **unklar — bei zvoove erfragen** | nicht gefunden |
| **SAP Fieldglass** | der Besitzer der Instanz (Käufer- **oder** Lieferanteninstanz) mit Benutzer, Passwort und API-Key — **und der SAP-Fieldglass-Support muss die APIs freischalten**, sie sind standardmäßig aus | **nein** für eine Anbindung; SAP PartnerEdge nur für zertifizierte bzw. im SAP-Store gelistete Integrationen | beim Instanzbesitzer | **ja** — Connector Library auf help.sap.com |
| **Beeline** | das **Beeline Supplier Network (BSN)**: ein Abo *des Lieferanten*, danach je Beeline-Kunde eine Verbindung, die ein Lieferanten-Admin anlegt; die API ist für alle verbundenen Kunden freigeschaltet (Regel seit 05.03.2025) | **kein** Partnerprogramm — aber ein **kostenpflichtiges Abo**; das Partner-Ökosystem (Systemintegratoren, MSPs) ist etwas anderes | laut BSN-Preisseite: **Standard 2.500 $/Jahr** (1 Kundenverbindung), **Pro 15.000 $** (10), **Max 30.000 $** (unbegrenzt); zusätzliche Verbindung 1.200 $/Jahr | ja — Lieferantendoku öffentlich |

### Wer ist der Lieferant — entschieden

In Fieldglass und Beeline ist der **Lieferant ein Personaldienstleister** — also
die Zeitarbeitsfirma, nicht TempConnect. TempConnect ist eine **reine
Vermittlungsplattform** und betreibt **keine Arbeitnehmerüberlassung**
(Owner-Entscheidung vom 2026-09-30). Daraus folgt die Bauart:

- **TempConnect verbindet sich als Software der Zeitarbeitsfirma**, mit deren
  Zugangsdaten. Beeline sieht genau diese Rolle ausdrücklich vor (das BSN nennt
  sie „ATS-Integration“): der Lieferant hat das Abo, sein Werkzeug spricht die
  API.
- Das Abo zahlt damit **die Zeitarbeitsfirma**, und es lohnt sich für sie nur,
  wenn sie tatsächlich einen Beeline-Kunden bedient.

**Owner-Entscheidung vom 2026-09-30 — damit ist die Frage geschlossen:**
TempConnect ist reine Vermittlungsplattform, betreibt **keine
Arbeitnehmerüberlassung** und schließt **keine Abos bei VMS-Anbietern** ab.
TempConnect tritt in keinem VMS selbst als Lieferant auf. Eine Beeline-Anbindung
kommt deshalb nur für Zeitarbeitsfirmen in Frage, die **selbst** Mitglied im
Beeline Supplier Network sind — TempConnect ist dann ihr Werkzeug, nicht ihr
Vertragspartner gegenüber Beeline.

Ebenfalls klargestellt: die Buchung vieler Mitarbeiter aus mehreren
Zeitarbeitsfirmen in einem Schritt (Owner-Abschnitt 22, „30 Mitarbeiter ohne
10 Verträge“) ist ein **Marktplatz**-Thema, kein Integrationsthema. Eine frühere
Fassung dieses Abschnitts hatte beides als dieselbe Rechtsfrage verknüpft; das
war falsch und ist entfernt.

### Was das für die Reihenfolge heißt

Die Recherche verschiebt die Gewichte deutlich:

1. **zvoove ist der einzige Fall, in dem sich ein Partnerprogramm wirklich
   lohnt** — und zwar genau deshalb, weil es dort vermutlich *nötig* ist (PDL)
   und weil dort die eigenen Kunden sitzen: zvoove ist im DACH-Zeitarbeitsmarkt
   verbreitet und steht schon in der Registry. **Bei zvoove anfragen**, welche
   Anbindungswege es für PDL gibt und zu welchen Bedingungen.
2. **Personio braucht nichts** außer einem Kunden, der Personio nutzt und einen
   Tarif mit API-Zugang hat. Keine Anfrage, keine Vorleistung.
3. **Fieldglass und Beeline sind Großkunden-Werkzeuge.** Das eigene Audit dieses
   Projekts sagt es bereits: *„Enterprise-VMS (SAP Fieldglass, Beeline):
   Governance ja, Echtzeit nein, ungeeignet <1000 MA, schwere Implementierung“*
   (`docs/finalization/PLATFORM_AUDIT_INTUITIVENESS_2026.md:23`). Die Abbildung
   lässt sich **jetzt** gegen die öffentliche Doku entwerfen; freigeschaltet wird
   sie erst, wenn ein konkreter Großkunde sie mitbringt — und dann über dessen
   Zeitarbeitsfirmen und deren Zugang.
4. **Der anbieterneutrale Bedarfs-Eingang bleibt richtig.** Er trägt alle vier,
   ist für Kunden ohne jedes Fremdsystem sofort nutzbar und hängt an keinem
   Vertrag. Er braucht Schema — deshalb erst, wenn die K1-Linie gepusht ist: dort
   liegen laut Owner (2026-09-30) inzwischen **220 Migrationen**, hier nur 186.
   Eine hier geschriebene Migration nähme eine Nummer, die dort schon vergeben ist.

### Offene Entscheidung

**W-E8** — **Welche Richtung zuerst?** *Empfehlung, nach der Recherche
angepasst:* **zvoove-Anfrage sofort** (Owner, kostet nichts außer einer Mail,
dauert am längsten), **der anbieterneutrale Eingang als erster Code** (nach K1),
**Personio bei Bedarf** (kein Vorlauf nötig), **Fieldglass/Beeline erst mit einem
Großkunden** und nur über Zeitarbeitsfirmen, die selbst Zugang haben. Die
Lieferantenfrage ist entschieden: im VMS ist es immer die Zeitarbeitsfirma.

### Quellen (abgerufen 2026-09-30)

- Personio: [API-Zugangsdaten erzeugen und verwalten](https://support.personio.de/hc/en-us/articles/4404623630993-How-to-Generate-and-Manage-API-Credentials-for-Personnel-Data)
- zvoove Recruit: [Gibt es eine Schnittstellendokumentation?](https://go.zvoove.com/knowledge/gibt-es-eine-schnittstellendokumentation-fuer-zvoove-recruit) · [Bediener-API-Key](https://go.zvoove.com/knowledge/wie-hinterlege-ich-den-bediener-api-key-aus-zvoove-recruit-in-zvoove-pdl)
- zvoove PDL, Partneranbindungen: [talent360 über PD Connect](https://help.talent360.io/de/articles/8975778-schnittstelle-zu-zvoove-l1-via-pd-connect) · [Blink](https://www.blink.de/schnittstellen/schnittstelle-zvoove/) · [zvoove Partner](https://zvoove.de/partner)
- SAP Fieldglass: [Connector Library (PDF)](https://help.sap.com/doc/e7d299ced5014db7bf04be1237c8efdc/cloud/en-US/SAPFieldglassConnectorLibrary.pdf) · [Einrichtung inkl. API-Freischaltung durch den Support (ServiceNow-Doku)](https://www.servicenow.com/docs/r/integrate-applications/integration-hub/sap-fieldglass.html)
- Beeline: [Beeline Supplier Network](https://www.beeline.com/beeline-supplier-network) · [Verbindung zu Kunden](https://gwgdocs.bpe.beeline.com/supplier/policies-and-definitions/client-connections.html) · [BSN-Preise](https://bsn.beeline.com/pricing)
