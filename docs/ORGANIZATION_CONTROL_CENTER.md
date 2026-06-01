# Organization Control Center

Enterprise-Admin-Hub für organisationsbezogene Verwaltung. Konsolidiert alle Org-Management-Funktionen unter `/api/org/*`.

## Architektur-Überblick

```
Frontend (organization.html)
  └── /api/org/*  (orgControlCenter.js Router)
        ├── organizationService.js  (Members, Org-Details)
        ├── apiKeyService.js        (API Key CRUD, NEU)
        ├── integrationService.js   (Webhooks)
        ├── auditLog.js             (Audit Trail)
        ├── billingMetricsService.js (Usage/Billing)
        └── settingsService.js      (Security Settings)
```

**Prinzip:** Keine Parallelstrukturen — der Router delegiert an bestehende Services.

## API Endpoints

### Overview
`GET /api/org/overview` — Dashboard mit Org-Details + Counts  
**Permission:** `org.settings`

### Members
`GET /api/org/members` — Mitgliederliste  
`PATCH /api/org/members/:userId` — Rollenwechsel (Body: `{ role_key }`)  
`DELETE /api/org/members/:userId` — Mitglied deaktivieren  
**Permission:** `org.members`

### API Keys
`GET /api/org/api-keys` — Alle Keys (ohne Hash/Klartext)  
`POST /api/org/api-keys` — Neuen Key erstellen (Body: `{ label?, scopes?, expires_at? }`)  
`DELETE /api/org/api-keys/:id` — Key widerrufen (Soft-Delete)  
**Permission:** `org.settings`

**Key-Format:** `tc_live_<64 hex chars>` (32 Bytes Random, SHA-256 gespeichert)  
**Sicherheit:** Klartext-Key wird nur einmalig bei Erstellung zurückgegeben, danach nur noch `key_prefix` + 4 Punkte sichtbar.

### Webhooks
`GET /api/org/webhooks` — Webhook-Konfigurationen (Read-Only, Verwaltung via Integrations-UI)  
**Permission:** `org.settings`

### Audit Log
`GET /api/org/audit-log?action_type=&limit=50&offset=0` — Org-scoped Audit Trail  
**Rolle:** `owner`, `admin`, `platform_admin`  
**Filter:** `actor_id`, `entity_type`, `action`, `action_type`, `status`, `from`, `to`

### Usage / Billing
`GET /api/org/usage` — Dashboard-Metriken, Plan-Limits, monatliche Snapshots  
**Permission:** `org.settings`

### Security Settings
`GET /api/org/security` — Aktuelle Settings + Security-Summary  
`PATCH /api/org/security` — Settings aktualisieren  
**Permission:** `org.settings`

**Patchbare Felder:** `approval_required`, `preferred_supplier_only`, `auto_match_enabled`, `default_radius_km`, `compliance_strictness`, `notification_preferences`, `branding`

## Datenbank

### Tabelle: `org_api_keys` (Migration 049)
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | UUID PK | |
| org_id | UUID FK → organizations | Multi-Tenancy Scope |
| label | VARCHAR(200) | Beschreibung |
| key_prefix | VARCHAR(20) | Sichtbarer Prefix (tc_live_XXXXXXXX) |
| key_hash | VARCHAR(128) UNIQUE | SHA-256 Hash |
| scopes | TEXT[] | Berechtigungen (für zukünftige API-Auth) |
| is_active | BOOLEAN | Soft-Delete Flag |
| last_used_at | TIMESTAMPTZ | Letzte Nutzung |
| expires_at | TIMESTAMPTZ | Optional: Ablaufdatum |
| created_by | UUID FK → users | Ersteller |

**Indices:** `org_id + is_active`, `key_hash UNIQUE`, `created_by`

## Frontend

`/public/organization.html` — Single-Page mit 6 Tabs:
1. **Mitglieder** — Tabelle mit Name, E-Mail, Rolle, Status
2. **API Keys** — Tabelle + Modal zum Erstellen/Widerrufen
3. **Webhooks** — Read-Only Liste, Link zu Integrations-Verwaltung
4. **Audit Log** — Filterbar nach Aktionstyp, 50 Einträge pro Seite
5. **Usage** — Stats-Grid, Plan-Limits, Warnungen, Monatliche Snapshots
6. **Security** — Dot-Grid mit aktivem/inaktivem Status aller Security-Features

**Patterns:** Dark-Theme (`enterprise.css`), `esc()` XSS-Schutz, CSRF-Token, 401-Redirect, Lazy-Load pro Tab.

## Sicherheit

- **RBAC:** Alle Endpoints erfordern `requireAuth` + `ensureOrg` + Permission/Role
- **Multi-Tenancy:** Org-Boundary auf DB-Ebene (`WHERE org_id = $1`)
- **API Key Hashing:** SHA-256, kein Klartext in DB
- **Audit Trail:** Alle Mutationen schreiben via `res.locals.audit`
- **Input-Validierung:** Zod-Schemas für alle POST/PATCH Bodies
- **XSS:** Frontend escaped alle dynamischen Werte mit `esc()`
- **CSRF:** Schreibende Requests senden `x-csrf-token` Header

## Tests

`api/test/orgControlCenter.test.js` — 15 Tests in 4 Suites:
- API Key Generation (6 Tests): Prefix, Länge, Hash, Uniqueness
- hashKey (3 Tests): Determinismus, Varianz, Format
- Router-Struktur (3 Tests): Export, Stack, alle 12 Endpunkte
- Format-Sicherheit (3 Tests): Zeichenvalidierung, Prefix-Länge, Hash-Varianz

## Dateien

| Datei | Typ | Status |
|-------|-----|--------|
| `sql/migrations/049_org_api_keys.sql` | Migration | NEU |
| `api/services/apiKeyService.js` | Service | NEU |
| `api/routes/orgControlCenter.js` | Router | NEU |
| `api/app.js` | Registrierung | GEÄNDERT |
| `frontend/public/organization.html` | Frontend | NEU |
| `api/test/orgControlCenter.test.js` | Tests | NEU |
| `docs/ORGANIZATION_CONTROL_CENTER.md` | Doku | NEU |
