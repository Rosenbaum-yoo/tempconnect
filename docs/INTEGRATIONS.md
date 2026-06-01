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
