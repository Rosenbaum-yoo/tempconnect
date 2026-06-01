# TempConnect — Logging Standards

## Architektur

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   pino       │ ──► │ JSON stdout  │ ──► │ Log Shipper  │
│ (structured) │     │ (Production) │     │ (Loki/ELK)   │
└──────┬──────┘     └─────────────┘     └──────────────┘
       │
       │ Dev: pino-pretty
       ▼
┌─────────────┐
│ Human-       │
│ readable     │
└─────────────┘
```

- **Logger**: pino (JSON in Production, `pino-pretty` in Development)
- **Config**: `config/index.js` — Level, Base Context, Redaction
- **Utilities**: `utils/logger.js` — Correlation, Service Logger, Domain Events
- **Error Handler**: `utils/routeHandler.js` — `catchAsync` Wrapper
- **Monitoring**: Sentry (`utils/monitoring.js`) für Error Tracking

---

## Log Levels

| Level | Wann verwenden | Beispiel |
|-------|---------------|---------|
| `fatal` | Prozess kann nicht weiterlaufen, Exit folgt | Fehlende Secrets in Production, DB nicht erreichbar bei Start |
| `error` | Unerwarteter Fehler, erfordert Aufmerksamkeit | Unhandled Route Error, DB Query Fehler, 5xx Response |
| `warn` | Degraded Operation, kein sofortiges Handeln nötig | SMTP nicht erreichbar, non-critical Feature fehlgeschlagen, Rate Limit hit |
| `info` | Normaler Betrieb, Business Events | User Login, Deal Transition, E-Mail gesendet, Server gestartet |
| `debug` | Entwickler-Details, nicht in Production | SQL Queries, Request Details, Cache Hits/Misses |

### Regeln
- `error` NUR für unerwartete Fehler, NICHT für erwartete Business-Fehler (z.B. "User not found" → 404 ist KEIN Error-Log)
- `warn` für Dinge die mittelfristig behoben werden sollten
- `info` für alles was im normalen Betrieb relevant ist
- `debug` in Production deaktiviert (LOG_LEVEL=info)

---

## Naming Conventions

### Log Messages
- Kurz, beschreibend, englisch
- Format: `Subjekt Verb` oder `Subjekt Verb Objekt`
- Beispiele: `"Deal transition completed"`, `"E-Mail gesendet"`, `"User login"`
- NICHT: `"POST /api/auth/login"` (das steht im HTTP Access Log)

### Strukturierte Felder
- `correlationId` — Request-Correlation-ID (automatisch via Middleware)
- `userId` — Akteur-ID (automatisch nach Session)
- `orgId` — Organisation (automatisch nach orgContext)
- `err` — Error-Objekt (pino serialisiert type + message + stack)
- `service` — Service/Modul-Name (via `createServiceLogger`)
- `event` — Domain Event Name (via `domainLogger`)
- Entity-IDs: `requestId`, `contractId`, `dealId`, `docId`, etc.

### Domain Events
Format: `verb_noun` in snake_case
- `user_login`, `user_logout`, `user_registered`
- `deal_created`, `deal_completed`
- `offer_created`, `capacity_created`, `capacity_transition`
- `search_performed`, `compliance_doc_uploaded`

---

## PII / Redaction

pino redactiert automatisch folgende Pfade (Wert wird zu `[REDACTED]`):

### HTTP Headers
- `req.headers.authorization`
- `req.headers.cookie`
- `req.headers["x-csrf-token"]`
- `req.headers["x-admin-secret"]`

### Credentials (beliebige Tiefe)
- `*.password`, `*.newPassword`, `*.oldPassword`
- `*.token`, `*.secret`, `*.sessionSecret`
- `*.creditCard`, `*.ssn`, `*.apiKey`

### Best Practices
- **Niemals** Passwörter, Tokens oder API Keys loggen, auch nicht als Teil von Fehlermeldungen
- **E-Mail-Adressen** dürfen in Login/Register Events geloggt werden (Business-Kontext), aber NICHT in Bulk-Operationen
- **IP-Adressen** nur in Security-relevanten Events (Login, Rate Limit)
- Bei Unsicherheit: Feld NICHT loggen

---

## Logging Patterns

### 1. Route Handler — `catchAsync` (bevorzugt)

```js
import { catchAsync } from '../utils/routeHandler.js';

router.post('/items', requireAuth, catchAsync(async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION' });
  
  const item = await itemService.create(pool, parsed.data);
  res.status(201).json(item);
  // Keine try/catch nötig — Fehler → centralized error handler
  // → loggt automatisch: correlationId, userId, orgId, method, url, stack
}));
```

### 2. Service Logger — `createServiceLogger`

```js
import { createServiceLogger } from '../utils/logger.js';

const log = createServiceLogger('myService');

// Jede Log-Zeile enthält automatisch: { service: "myService" }
log.info({ orderId, status }, 'Order status updated');
log.warn({ err: e.message }, 'Payment webhook verification failed');
```

### 3. Domain Events — `domainLogger`

```js
import { domainLogger } from '../utils/logger.js';

domainLogger.userLogin({ userId, email, ip });
domainLogger.dealCreated({ dealId, requestId, actorId, status });
domainLogger.custom('invoice_generated', { invoiceId, amount, orgId });
```

### 4. Request-scoped Logging — `req.log`

```js
// req.log ist automatisch verfügbar (erstellt durch Middleware)
// Enthält: correlationId, method, url, userId, orgId
req.log.info({ action: 'something' }, 'Custom request log');
```

---

## Beispiel Log Events

### HTTP Access Log (automatisch)
```json
{
  "level": "info",
  "time": "2025-01-15T14:30:00.000Z",
  "service": "tempconnect-api",
  "correlationId": "a1b2c3d4-...",
  "method": "POST",
  "url": "/api/auth/login",
  "status": 200,
  "duration_ms": 42,
  "userId": "f0e1d2c3-..."
}
```

### Domain Event
```json
{
  "level": "info",
  "time": "2025-01-15T14:30:00.000Z",
  "service": "tempconnect-api",
  "component": "domain_events",
  "event": "user_login",
  "userId": "f0e1d2c3-...",
  "email": "max@company.de",
  "ip": "192.168.1.100",
  "method": "session"
}
```

### Service Log
```json
{
  "level": "info",
  "time": "2025-01-15T14:31:00.000Z",
  "service": "dealWorkflow",
  "requestId": "d4e5f6a7-...",
  "from": "OFFER_SENT",
  "to": "ACCEPTED",
  "actorId": "f0e1d2c3-..."
}
```

### Error Log (centralized handler)
```json
{
  "level": "error",
  "time": "2025-01-15T14:32:00.000Z",
  "service": "tempconnect-api",
  "err": {
    "type": "Error",
    "message": "relation 'missing_table' does not exist",
    "stack": "Error: relation 'missing_table'...\n    at ..."
  },
  "correlationId": "a1b2c3d4-...",
  "method": "POST",
  "url": "/api/contracts",
  "status": 500,
  "errorCode": "SERVER_ERROR",
  "userId": "f0e1d2c3-...",
  "orgId": "b2c3d4e5-..."
}
```

---

## Integration mit Monitoring

### Prometheus
- HTTP Access Logs → `http_requests_total`, `http_request_duration_seconds` (via metrics middleware)
- DB Errors → `db_query_errors_total` (via pool instrumentation)
- Nicht log-basiert — direkte Metrik-Erfassung

### Sentry
- Alle Errors aus dem centralized error handler → `captureException`
- `unhandledRejection` + `uncaughtException` → `captureException`
- PII scrubbing in Sentry: konfiguriert in `utils/monitoring.js`

### Log Aggregation (Empfehlung)
- pino JSON Logs → Loki / ELK / Datadog via Log Shipper
- Suchbare Felder: `correlationId`, `userId`, `event`, `service`, `level`
- Alerting auf `level=error` Rate

---

## Anleitung für neue Routes/Services

### Neue Route erstellen
1. `import { catchAsync } from '../utils/routeHandler.js'`
2. Alle async Handler mit `catchAsync(async (req, res) => { ... })` wrappen
3. Validation-Fehler (4xx) als `return res.status(4xx).json(...)` behandeln
4. Keine try/catch für generische Fehler — catchAsync leitet an centralized handler weiter
5. `res.locals.audit` für Audit Trail setzen

### Neuen Service erstellen
1. `import { createServiceLogger } from '../utils/logger.js'`
2. `const log = createServiceLogger('meinService')`
3. Business Events mit `log.info()` loggen
4. Fehler mit `log.error({ err }, 'Was ist schiefgelaufen')` — err als OBJEKT, nicht String
5. Für Domain Events: `import { domainLogger } from '../utils/logger.js'`

### Migration bestehender Routes
Schrittweise Migration von altem Pattern:
```js
// ALT — boilerplate, kein Request-Kontext in Error Logs
router.post('/x', requireAuth, async (req, res) => {
  try { /* ... */ } catch (e) {
    logger.error({ err: e }, 'POST /api/x');
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// NEU — catchAsync, Error → centralized handler mit vollem Kontext
router.post('/x', requireAuth, catchAsync(async (req, res) => {
  /* ... */
}));
```

---

## Dateistruktur

```
config/index.js            — pino Logger, Level, Base Context, Redaction
utils/logger.js            — correlationMiddleware, createServiceLogger, domainLogger
utils/routeHandler.js      — catchAsync Wrapper
utils/monitoring.js        — Sentry Integration
app.js                     — Middleware Pipeline: correlation → metrics → req.log → session → orgContext → req.log enrichment
server.js                  — unhandledRejection / uncaughtException Handler
```
