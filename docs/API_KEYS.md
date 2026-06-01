# API Key Management

Enterprise-Grade API Key System für externe Integrationen. Keys werden als SHA-256 Hash gespeichert, Klartext nur einmalig bei Erstellung angezeigt.

## Architektur

```
Externe Systeme (ERP, DATEV, etc.)
  │ X-API-Key: tc_live_...
  ▼
apiKeyAuth Middleware → hashKey() → DB Lookup → req.orgId + req.apiKeyScopes
  │
  ▼
requireScope("read:timesheets") → Scope-Check
  │
  ▼
API Route Handler
```

## Key-Format

```
tc_live_<64 hex chars>
└──────┘└─────────────┘
 Prefix   32 Bytes Random (crypto.randomBytes)
```

- **Prefix:** `tc_live_` + 8 hex chars → in DB als `key_prefix` für Identifikation
- **Hash:** SHA-256 des vollständigen Keys → in DB als `key_hash`
- **Klartext:** Wird NUR einmalig bei Erstellung/Rotation zurückgegeben

## Scope-System

### Basis-Scopes

| Scope | Bedeutung |
|-------|-----------|
| `read` | Lesezugriff auf alle Ressourcen |
| `write` | Lese- und Schreibzugriff auf alle Ressourcen |
| `admin` | Vollzugriff (impliziert alle Scopes) |

### Granulare Resource-Scopes

| Scope | Ressource |
|-------|-----------|
| `read:requisitions` / `write:requisitions` | Anforderungen |
| `read:timesheets` / `write:timesheets` | Stundennachweise |
| `read:workers` / `write:workers` | Zeitarbeiter |
| `read:invoices` / `write:invoices` | Rechnungen |
| `read:assignments` / `write:assignments` | Einsätze |
| `read:audit` | Audit Log (nur lesen) |
| `read:capacity` / `write:capacity` | Kapazitäten |

### Scope-Hierarchie

- `admin` → impliziert alle Scopes
- `write` → impliziert `read`
- `write:X` → impliziert `read:X`
- `read` → impliziert `read:*` (alle read-Scopes)
- `write` → impliziert `write:*` (alle write-Scopes)
- Leere Scopes (`[]`) = Vollzugriff (Legacy-Kompatibilität)

## API Endpoints

### Management (Session-Auth, RBAC: `org.settings`)

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/api/org/api-keys` | Alle Keys listen (ohne Hash/Klartext) |
| `POST` | `/api/org/api-keys` | Neuen Key erstellen |
| `DELETE` | `/api/org/api-keys/:id` | Key widerrufen (Soft-Delete) |
| `POST` | `/api/org/api-keys/:id/rotate` | Key rotieren (atomisch) |
| `GET` | `/api/org/api-keys/scopes` | Verfügbare Scopes |

### Create Key

```http
POST /api/org/api-keys
Content-Type: application/json

{ "label": "ERP Integration", "scopes": ["read:timesheets", "write:requisitions"] }
```

Response enthält einmalig den Klartext-Key.

### Rotate Key

```http
POST /api/org/api-keys/:id/rotate
```

Atomische Transaktion:
1. Alter Key wird sofort widerrufen
2. Neuer Key wird mit gleichen Scopes/Label erstellt
3. Neuer Klartext-Key wird einmalig zurückgegeben

## Authentifizierung

Externe Systeme können sich via API Key authentifizieren:

### Header-Varianten

```http
X-API-Key: tc_live_a1b2c3d4...
```

oder

```http
Authorization: Bearer tc_live_a1b2c3d4...
```

### Auth-Flow

1. Middleware extrahiert Key aus Header
2. SHA-256 Hash berechnen
3. DB-Lookup in `org_api_keys` (aktiv + nicht abgelaufen)
4. `req.orgId`, `req.apiKeyScopes`, `req.apiKeyId` setzen
5. `last_used_at` async aktualisieren
6. Kein API-Key Header → Session-Auth greift (Fallthrough)

## Sicherheit

- **Kein Klartext:** Keys werden als SHA-256 Hash in DB gespeichert
- **Einmaliger Klartext:** Nur bei Erstellung/Rotation angezeigt
- **Multi-Tenancy:** Alle Queries mit `org_id` WHERE-Klausel
- **RBAC:** Management-Endpoints erfordern `org.settings` Permission
- **Ablaufdatum:** Optional via `expires_at`
- **Audit Trail:** Create, Revoke, Rotate werden geloggt
- **Rate Limiting:** Standard API-Limiter gilt auch für API-Key-Auth
- **Scope-Enforcement:** `requireScope()` Middleware für Zugriffssteuerung
- **FOR UPDATE Lock:** Rotation mit Row-Lock gegen Race Conditions

## Datenbank

### Tabelle: `org_api_keys` (Migration 049)

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | UUID PK | |
| org_id | UUID FK → organizations | Multi-Tenancy Scope |
| label | TEXT | Beschreibung |
| key_prefix | TEXT | Sichtbarer Prefix (tc_live_XXXXXXXX) |
| key_hash | TEXT UNIQUE | SHA-256 Hash |
| scopes | TEXT[] | Zugewiesene Scopes |
| is_active | BOOLEAN | Aktiv/Widerrufen |
| last_used_at | TIMESTAMPTZ | Letzte API-Nutzung |
| expires_at | TIMESTAMPTZ | Optional: Ablaufdatum |
| created_by | UUID FK → users | Ersteller |

**Indices:** `org_id + is_active`, `key_hash` (für Auth-Lookup)

## Tests

- `api/test/orgControlCenter.test.js` — 15 Tests: Key Generation, Hashing, Format
- `api/test/apiKeyAuth.test.js` — 21 Tests: Scope-Katalog, hasScope, validateScopes, Middleware, Router

## Dateien

| Datei | Typ | Status |
|-------|-----|--------|
| `sql/migrations/049_org_api_keys.sql` | Migration | Vorhanden |
| `api/services/apiKeyService.js` | Service | Erweitert (+Scopes, +Rotate, +lookupByHash) |
| `api/middleware/apiKeyAuth.js` | Middleware | NEU |
| `api/routes/orgControlCenter.js` | Router | Erweitert (+Rotate, +Scopes-Endpoint) |
| `api/app.js` | Registrierung | Erweitert (+apiKeyAuthMiddleware) |
| `frontend/public/organization.html` | Frontend | Erweitert (+Scope-Selector, +Rotate-Button) |
| `api/test/apiKeyAuth.test.js` | Tests | NEU |
| `docs/API_KEYS.md` | Doku | NEU |
