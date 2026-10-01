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
Jeder Eintrag trägt `label` (deutscher Name), `wer` (bei Einsatzkräften der Name aus dem
Mitarbeiterprofil, sonst `contact_person`/E-Mail) und `actor_einsatzkraft` (der Akteur ist in
dieser Firma Mitarbeiter, Rolle `worker`). `GET /api/org/audit-log/export/csv` — höchstens 500
Zeilen, **Zeitpunkte in Berliner Zeit** (bis 2026-10-01 UTC ohne Kennzeichnung), der Export steht
selbst im Protokoll.

### Einsatzportal — wer war wann angemeldet (Owner 2026-10-01, Migration 229)
`GET /api/org/einsatzportal/sitzungen?von=JJJJ-MM-TT&bis=JJJJ-MM-TT&user_id=&limit=&offset=`  
`GET /api/org/einsatzportal/sitzungen/export/csv` (gleiche Filter, Export steht im Protokoll)  
**Rolle:** `owner`, `admin`, `platform_admin` — eine Einsatzkraft bekommt 403; gebunden an
`req.orgId`, eine fremde `user_id` liefert nichts.  
Je Sitzung: Name, Angemeldet, Bis, Ende (`abgemeldet` | `alle_abgemeldet` | `abgelaufen` | `offen`)
und alle Aktionen im Zeitraum (aus `audit_log`, dieselbe Firma). Ohne Abmeldung ist „Bis“ der
Zeitpunkt „zuletzt aktiv“ (auf 5 Minuten genau); nach 8 Stunden Stille gilt die Sitzung als
abgelaufen. **Nicht** erfasst: welche Seiten jemand ansieht. Aufbewahrung 12 Monate
(`einsatzportal_sitzungen_aufraeumen()`, Takt `einsatzportal-aufbewahrung` 04:20). Erfasst wird
über die Middleware `einsatzportalAktivitaet` (`api/app.js`, hinter `orgContextMiddleware`), die
Sitzungskennung nur als SHA-256. Die Einsatzkräfte sehen im Portal unter „Mein Profil“, was ihre
Firma sieht.

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

`/public/organization.html` — seit W-E9 (2026-10-01) **„Verwaltung“** für Unternehmen und
Zeitarbeitsfirmen, 7 Reiter (`js/pages/verwaltung.js`, `css/pages/verwaltung.css`):
**Team, Standorte, Rollen, Sicherheit, Protokoll, Schnittstellen, Tarif.** Jede folgenreiche
Handlung zeigt vorher ihre Wirkung. Der Reiter **Protokoll** hat zwei Karten: das Protokoll
(Filter Zeitraum/Vorgang, CSV) und darunter **„Einsatzportal — wer war wann angemeldet“**
(Filter Zeitraum/Mitarbeiter, aufklappbare Aktionen, CSV).

**Erreichbar** (geprüft 2026-10-01, beide Demo-Firmen): Kachel „Verwaltung“ auf der Übersicht
(gleiche Stelle und gleiche Sichtbarkeit wie früher das Admin Panel: Unternehmen und
Zeitarbeitsfirma, Rollen owner/admin/platform_admin) und — neu, von jeder Seite — „Verwaltung →“
im Nutzermenü oben rechts. `admin_panel.html` leitet hierher um.

**Patterns:** `esc()` XSS-Schutz, CSRF-Token, 401-Redirect, Lazy-Load pro Reiter.

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
