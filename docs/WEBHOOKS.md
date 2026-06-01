# Webhooks — Developer Guide

## Übersicht

TempConnect liefert Echtzeit-Benachrichtigungen über Geschäftsereignisse per Webhook an externe Systeme. Jeder Webhook-Aufruf wird HMAC-SHA256 signiert, protokolliert und bei Fehler automatisch wiederholt.

Dieses Dokument richtet sich an **Integratoren und Entwickler**, die TempConnect-Webhooks empfangen und verarbeiten möchten.

> Interne Architektur und Konfiguration: siehe `docs/INTEGRATIONS.md`

## Schnellstart

1. Integration anlegen: `POST /api/integrations` (erfordert `org.settings`-Permission)
2. `webhook_url` angeben + gewünschte Events auswählen
3. Signing Secret aus der Response speichern (wird nur einmal angezeigt)
4. Test-Event auslösen: `POST /api/integrations/:id/test`
5. Webhook-Empfänger implementieren (siehe Payload-Struktur + Verifikation)

## Event-Katalog

### Angebote (Offers)
- `offer.received` — Neues Angebot eingegangen
- `offer.accepted` — Angebot angenommen
- `offer.rejected` — Angebot abgelehnt

### Requisitions (VMS)
- `requisition.submitted_for_approval` — Requisition zur Freigabe eingereicht
- `requisition.approved` — Requisition freigegeben
- `requisition.rejected` — Requisition abgelehnt
- `requisition.filled` — Requisition besetzt
- `requisition.cancelled` — Requisition storniert

### Deals & Einsätze
- `deal.completed` — Deal abgeschlossen
- `assignment.starting_soon` — Einsatz beginnt in Kürze
- `assignment.completed` — Einsatz abgeschlossen

### Kapazitäten
- `capacity.match_found` — Neuer Match gefunden
- `capacity.interest_received` — Interesse an Kapazität eingegangen
- `capacity.expiring_soon` — Kapazitätspost läuft bald ab

### Compliance
- `compliance.expiring` — Compliance-Dokument läuft bald ab
- `compliance.verified` — Compliance-Dokument verifiziert

### Lieferanten
- `supplier.invited` — Lieferant in Vendor Pool eingeladen

### Stundenzettel
- `timesheet.submitted` — Stundenzettel eingereicht
- `timesheet.approved` — Stundenzettel genehmigt
- `timesheet.rejected` — Stundenzettel abgelehnt

### Verträge
- `contract.activated` — Vertrag aktiviert
- `contract.terminated` — Vertrag beendet

### Rechnungen
- `invoice.issued` — Rechnung ausgestellt
- `invoice.paid` — Rechnung bezahlt

**Verfügbare Events abrufen:** `GET /api/integrations/events`

## Payload-Struktur

### Slack (Block Kit)

```json
{
  "text": "📩 Neues Angebot eingegangen: Projektbeschreibung...",
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "📩 Neues Angebot eingegangen" } },
    { "type": "section", "text": { "type": "mrkdwn", "text": "Nachricht..." } },
    { "type": "context", "elements": [{ "type": "mrkdwn", "text": "*Event:* `offer.received`  |  *Organisation:* Acme GmbH  |  *Zeit:* 16.03.2026, 12:00:00" }] },
    { "type": "actions", "elements": [{ "type": "button", "text": { "type": "plain_text", "text": "In TempConnect öffnen" }, "url": "https://app.tempconnect.de/...", "style": "primary" }] },
    { "type": "divider" }
  ]
}
```

### Microsoft Teams (O365 MessageCard)

```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "4a9eff",
  "summary": "📩 Neues Angebot eingegangen",
  "sections": [{
    "activityTitle": "📩 Neues Angebot eingegangen",
    "activitySubtitle": "TempConnect · 16.03.2026, 12:00:00",
    "facts": [
      { "name": "Event", "value": "offer.received" },
      { "name": "Organisation", "value": "Acme GmbH" }
    ],
    "text": "Nachricht...",
    "markdown": true
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "In TempConnect öffnen",
    "targets": [{ "os": "default", "uri": "https://app.tempconnect.de/..." }]
  }]
}
```

## Signatur-Verifikation (HMAC-SHA256)

Jeder Webhook-Aufruf enthält den Header `X-TC-Signature-256`. Damit kann der Empfänger sicherstellen, dass die Nachricht tatsächlich von TempConnect stammt und nicht manipuliert wurde.

### Header-Format

```
X-TC-Signature-256: sha256=<hex-encoded-hmac-digest>
```

### Verifikation (Node.js)

```javascript
import crypto from 'crypto';

function verifyWebhook(rawBody, signatureHeader, signingSecret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', signingSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

// Express-Middleware:
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-tc-signature-256'];
  if (!verifyWebhook(req.body.toString(), signature, process.env.TC_SIGNING_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  const event = JSON.parse(req.body);
  // Event verarbeiten...
  res.status(200).send('OK');
});
```

### Verifikation (Python)

```python
import hmac, hashlib

def verify_webhook(raw_body: bytes, signature_header: str, signing_secret: str) -> bool:
    expected = 'sha256=' + hmac.new(
        signing_secret.encode(),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

### Sicherheitshinweise

- **Signing Secret** wird bei Erstellung der Integration einmalig zurückgegeben. Sicher speichern.
- Secrets sind 32 Bytes (64 Hex-Zeichen), kryptographisch zufällig generiert (`crypto.randomBytes(32)`)
- **Immer `timingSafeEqual`** verwenden, um Timing-Attacken zu verhindern
- Raw Body für die Signaturprüfung verwenden, **nicht** den geparsten JSON-Body
- Bei ungültiger Signatur: Request mit 401 ablehnen und loggen

## Delivery & Retry

### Timeout

- HTTP-Timeout pro Zustellung: **8 Sekunden**
- Empfänger sollten innerhalb von 5 Sekunden mit `2xx` antworten
- Langwierige Verarbeitung im Hintergrund ausführen, sofort mit `200 OK` bestätigen

### Retry-Verhalten

Fehlgeschlagene Zustellungen werden automatisch wiederholt:

- **Max. Versuche:** 3
- **Backoff:** Linear (Versuch × 60 Sekunden): 1 min, 2 min, 3 min
- **Retry-Auslöser:** Cron-Endpoint `POST /internal/webhook-retry`
- **Cleanup:** Einträge älter als 30 Tage werden per `POST /internal/webhook-cleanup` entfernt

### Delivery-Status

Jede Zustellung wird in `webhook_deliveries` protokolliert:

- `pending` — Erstversuch steht aus
- `success` — HTTP 2xx erhalten
- `failed` — Alle Versuche fehlgeschlagen oder einzelner Fehler vor Retry
- `retrying` — Retry läuft gerade

### Delivery-Log einsehen

```
GET /api/integrations/:id/deliveries
```

Gibt die letzten 50 Zustellungen mit Status, HTTP-Code, Fehlermeldung und Versuchszähler zurück.

## API-Referenz

### Integration verwalten

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| `GET` | `/api/integrations` | Alle Integrationen der Organisation |
| `POST` | `/api/integrations` | Neue Integration anlegen |
| `PATCH` | `/api/integrations/:id` | Integration aktualisieren |
| `DELETE` | `/api/integrations/:id` | Integration löschen |
| `POST` | `/api/integrations/:id/test` | Test-Event senden |
| `GET` | `/api/integrations/events` | Alle unterstützten Events |
| `GET` | `/api/integrations/:id/deliveries` | Zustellungsprotokoll |

### Integration anlegen — Request

```json
POST /api/integrations
{
  "provider": "slack",
  "label": "Engineering Slack Channel",
  "webhook_url": "https://hooks.slack.com/services/T00/B00/xxx",
  "enabled_events": ["offer.received", "deal.completed", "timesheet.submitted"]
}
```

### Integration anlegen — Response

```json
{
  "id": "uuid",
  "org_id": "uuid",
  "provider": "slack",
  "label": "Engineering Slack Channel",
  "is_active": true,
  "enabled_events": ["offer.received", "deal.completed", "timesheet.submitted"],
  "webhook_url_masked": "https://hooks.slack.c••••••",
  "signing_secret": "a1b2c3d4...64hexchars",
  "created_at": "2026-03-16T12:00:00Z"
}
```

> `signing_secret` wird nur bei Erstellung zurückgegeben. Bei nachfolgenden GET-Requests ist es nicht enthalten.

### Berechtigungen

Alle Integrations-Endpoints erfordern:
- Authentifizierung (`requireAuth`)
- Org-Kontext (`requireOrgContext`)
- Permission `org.settings`

## Neue Events hinzufügen (Entwickler-Guide)

### 1. Event in Service registrieren

`api/services/integrationService.js` → `SUPPORTED_EVENTS` Array erweitern:

```javascript
export const SUPPORTED_EVENTS = [
  // ... bestehende Events
  'mymodule.event_name'
];
```

### 2. Event-Metadaten definieren

`api/services/integrationAdapters.js` → `EVENT_META` Objekt erweitern:

```javascript
const EVENT_META = {
  // ... bestehende Events
  'mymodule.event_name': { emoji: '🔔', color: '#4a9eff', title: 'Mein neues Event' }
};
```

### 3. Event dispatchen

An der Stelle im Code, wo das Business-Event auftritt:

```javascript
import { dispatchToIntegrations } from '../services/integrationService.js';

// Nach erfolgreichem Business-Event:
dispatchToIntegrations(pool, 'mymodule.event_name', {
  orgId: req.orgId,
  message: 'Beschreibung des Events',
  linkPath: '/public/relevant-page.html',
  entityType: 'mymodule',
  entityId: entity.id
});
```

`dispatchToIntegrations` ist fire-and-forget: Fehler werden geloggt, aber nie geworfen.

## Dateien

- `api/services/integrationService.js` — Event-Katalog, CRUD, Dispatch-Pipeline, Retry
- `api/services/integrationAdapters.js` — Slack/Teams Formatter, HTTP-Sender, Signatur
- `api/routes/integrations.js` — REST-API für Integrations-Management
- `sql/migrations/047_webhook_infrastructure.sql` — `webhook_deliveries` Tabelle, `signing_secret` Spalte
- `docs/INTEGRATIONS.md` — Übergreifende Integrations-Architektur
