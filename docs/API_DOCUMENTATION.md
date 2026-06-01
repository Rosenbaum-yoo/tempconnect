# API Documentation — Architecture & Changelog

## Single Source of Truth
The primary API documentation is `frontend/public/api-docs.html` — a custom-built Developer Portal with dark theme, fixed sidebar navigation, endpoint cards, parameter tables, code examples, copy-to-clipboard, and scroll-based active section tracking.

**URL:** `/public/api-docs.html`

## Files
- `frontend/public/api-docs.html` — Primary developer portal (v2.0, ~1700 lines)
- `frontend/public/api_docs.html` — Legacy redirect (auto-redirects to api-docs.html)
- `api/openapi/spec.json` — OpenAPI 3.0.3 specification (v2.0.0)

## Public Accessibility
- **Footer:** "API-Docs" link added to the platform-wide footer (`frontend/public/js/footer.js`)
- **Direct URL:** `/public/api-docs.html` — no authentication required
- **OpenAPI Spec:** Referenced in the docs under the "OpenAPI Spezifikation" section

## What Already Existed (v1.0)
The api-docs.html was already a professional developer portal with:
- 13 endpoint sections: Auth, Me, Marketplace, Capacities, Requests & Deals, Organizations, Company Profile, Workers, Assignments, Notifications, Ratings, Search, Health
- Introduction with base URL, data format, auth overview
- Roles & RBAC documentation
- Error code reference (10+ HTTP + 10+ domain-specific codes)
- Pagination & filter documentation
- Rate limits documentation
- Plans & feature gate matrix
- Integration notes with cURL examples
- Changelog

## What Was Added (v2.0)
7 new endpoint sections added to fill enterprise coverage gaps:

### Requisitions (VMS)
- `GET /api/requisitions` — List with status/urgency/mine filters
- `POST /api/requisitions` — Create with full parameter table
- `POST /api/requisitions/:id/transition` — State machine documentation (DRAFT → FILLED lifecycle)
- `POST /api/requisitions/:id/approve` — Approval workflow

### Stundenzettel (Timesheets)
- `GET /api/timesheets` — List with status/date/supplier filters
- `POST /api/timesheets` — Create with org/supplier/worker fields
- `POST /api/timesheets/:id/entries` — Daily time entry with hours/breaks/shifts
- `POST /api/timesheets/:id/submit` — Submit for approval
- `POST /api/timesheets/:id/approve` — Approve
- `POST /api/timesheets/:id/reject` — Reject with reason

### Verträge & Rechnungen (Contracts & Invoices)
- `GET/POST /api/contracts` — List and create contracts
- `POST /api/contracts/:id/sign` — Sign contract
- `GET/POST /api/invoices` — List and create invoices
- `POST /api/invoices/:id/void` — Void invoice

### Vendor Pool
- `GET /api/vendor-pool` — List with tier filter
- `POST /api/vendor-pool` — Add vendor with tier/notes
- `GET /api/vendor-pool/tiers` — Tier statistics
- `POST /api/vendor-pool/:id/rate` — Rate vendor

### Compliance-Dokumente
- `GET /api/compliance/documents` — List with traffic light status
- `POST /api/compliance/documents` — Upload document
- `PATCH /api/compliance/documents/:id/verify` — Admin verification

### Matching Engine
- `GET /api/matching/requisition/:id` — Matching results with score breakdown (full JSON example)
- `GET /api/matching/smart-explain/:supplierId` — Smart Ranking 6-signal explanation

### Admin & Audit
- `GET /api/admin/users` — Paginated user list
- `PATCH /api/admin/users/:id` — Edit user
- `GET /api/admin/audit-log` — Full audit trail with 7 filter parameters (full JSON example)
- `GET /api/admin/metrics` — Platform KPIs

### Health (Extended)
- `GET /api/public/system-status` — New Trust Center endpoint with 7-component health (full JSON example)

### Infrastructure
- OpenAPI Spezifikation section with spec file reference
- Sidebar reorganized with "Enterprise" section for new endpoints
- Version badge updated to v2.0
- Changelog with v2.0 entry

## OpenAPI Spec Updates
- Version bumped from 1.0.0 → 2.0.0
- Added `/public/system-status` path with full response schema

## What Was NOT Changed
- Existing 13 endpoint sections preserved exactly as-is
- All existing styles, layouts, JavaScript functionality untouched
- Endpoint card expand/collapse, copy-to-clipboard, sidebar tracking all preserved
- No Swagger UI added (the custom portal is superior for this use case)
- No authentication changes to the docs page itself

## Developer Quickstart

1. **API-Docs öffnen:** `http://localhost:8080/public/api-docs.html`
2. **Auth-Token holen:** `POST /api/auth/login` mit E-Mail + Passwort → Session-Cookie
3. **Erste Abfrage:** `GET /api/me` → eigenes Profil mit Rolle und Org
4. **OpenAPI-Spec:** `api/openapi/spec.json` (maschinenlesbar, für Codegen)

## Wie neue Endpoints dokumentiert werden

### 1. Developer Portal (api-docs.html)

Jeder Endpoint wird als Card mit folgendem Schema dokumentiert:

```html
<div class="endpoint-card" data-method="POST" data-path="/api/my-resource">
  <div class="endpoint-header">
    <span class="method post">POST</span>
    <span class="path">/api/my-resource</span>
    <span class="desc">Beschreibung</span>
  </div>
  <div class="endpoint-details">
    <!-- Parameter-Tabelle, Code-Beispiel, Response -->
  </div>
</div>
```

- Sidebar-Eintrag in der Navigation ergänzen (Section + Anchor)
- Endpoint-Card in die passende Section einfügen
- Parameter als Tabelle (Name, Typ, Required, Beschreibung)
- Mindestens ein cURL-Beispiel
- Response-JSON mit realistischen Werten

### 2. OpenAPI Spec (spec.json)

Parallel zur HTML-Dokumentation den Endpoint in `api/openapi/spec.json` ergänzen:
- Path + Method
- Request/Response Schema
- Parameter-Beschreibungen
- Security Requirements (`session` oder `public`)

### 3. Changelog

Jede Änderung an der API-Dokumentation wird im Changelog-Abschnitt am Ende von `api-docs.html` mit Version und Datum vermerkt.

## Konsistenzstandards

### Response-Format

Alle API-Responses folgen einem einheitlichen Schema:

```json
// Erfolg:
{ "success": true, "data": { ... } }

// Fehler:
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Beschreibung" } }

// Paginiert:
{ "success": true, "data": { "items": [...], "total": 142, "limit": 50, "offset": 0 } }
```

### Namenskonventionen

- **Pfade:** Kebab-Case, Plural für Collections (`/api/capacity-posts`, `/api/timesheets`)
- **Query-Parameter:** Snake_Case (`week_start_from`, `supplier_org_id`)
- **Response-Felder:** Snake_Case (`created_at`, `total_hours`, `org_name`)
- **Error-Codes:** UPPER_SNAKE_CASE (`VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`)

### HTTP-Methoden

- `GET` — Lesen (idempotent, keine Seiteneffekte)
- `POST` — Erstellen oder Aktionen (z.B. `/submit`, `/approve`)
- `PATCH` — Teilweise Aktualisierung
- `DELETE` — Löschen (idempotent)

### Authentication & Authorization

Standard-Middleware-Chain für geschützte Endpoints:

```
requireAuth → requireOrgContext → requirePermission('resource.action') → Handler
```

Öffentliche Endpoints (z.B. `/health`, `/public/*`) überspringen die Auth-Chain.

## API-Versionierung

### Aktuelle Strategie

TempConnect verwendet aktuell **URL-basierte Versionierung ohne explizites Prefix** (`/api/...`). Alle Endpoints sind v1. Breaking Changes werden über Feature-Gates und Plan-basierte Freischaltung gesteuert, nicht über API-Versionen.

### Zukunft: Explizite Versionierung

Bei Bedarf (z.B. öffentliche API für Drittanbieter):

```
/api/v1/timesheets    → aktuelle Version
/api/v2/timesheets    → neue Version mit Breaking Changes
```

Deprecation-Header für alte Versionen:

```
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
Deprecation: true
Link: </api/v2/timesheets>; rel="successor-version"
```

## Dateien

- `frontend/public/api-docs.html` — Developer Portal (v2.0, ~1700 Zeilen)
- `frontend/public/api_docs.html` — Legacy-Redirect
- `api/openapi/spec.json` — OpenAPI 3.0.3 Spezifikation
- `frontend/public/js/footer.js` — Footer mit API-Docs-Link
