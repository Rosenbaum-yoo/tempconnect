# TempConnect — API Readiness

> API-Stabilität, Versionierung, Fehler-Contract und Partner-Integration.
> WAVE 15 — Phase 2 — 2026-05-27

---

## Aktuelle Version

**Version:** v1 (implizit — kein `/v1/` Präfix in URLs)

Alle Endpunkte unter `/api/*` sind Version 1. Kein explizites Versioning in der URL.

**URL-Versioning** wird eingeführt, sobald der erste externe Partner API-Keys erhält:
```
/api/v1/requisitions   ← Version 1 (stabilisiert)
/api/v2/requisitions   ← Version 2 (bei Breaking Changes)
```

---

## API-Kategorien & Stabilität

| Kategorie | Pfad | Auth | SLA |
|---|---|---|---|
| **Public** | `/api/health`, `/api/plans/public`, `/api/geo/*` | Nein | 99.9% |
| **Frontend Internal** | `/api/me`, `/api/requisitions`, usw. | Session Cookie | 99.5% |
| **Partner** | `/api/v1/*` (geplant) | API Key (Bearer) | 99.9% nach v1-Lock |
| **Admin / Staff / OCC** | `/api/admin/*`, `/staff/api/*`, `/api/owner-control/*` | Session + Rolle | Intern |

---

## API Keys (Partner-Integration)

| Merkmal | Implementierung |
|---|---|
| Hashing | SHA-256 des Raw-Keys (nur Hash in DB) |
| Prefix | `tc_live_` (Production) / `tc_test_` (Dev) |
| Scopes | Granular (z.B. `read`, `write:timesheets`) |
| Revocation | Sofortig über DB-Flag |
| Last-Used-Tracking | Async (non-blocking) |
| Audit | Event bei jeder Verwendung |

---

## Fehler-Contract

Alle Fehler-Responses folgen diesem Schema:

```json
{
  "success": false,
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Menschenlesbarer Text"
  }
}
```

**Standard-Error-Codes:**

| Code | HTTP | Bedeutung |
|---|---|---|
| `NOT_AUTHENTICATED` | 401 | Kein Login |
| `PERMISSION_DENIED` | 403 | Keine Berechtigung |
| `PLAN_REQUIRED` | 403 | Plan zu niedrig |
| `ORG_BOUNDARY_VIOLATION` | 403 | Fremde Org |
| `NOT_FOUND` | 404 | Ressource nicht gefunden |
| `VALIDATION_ERROR` | 400 | Eingabe-Validierung fehlgeschlagen |
| `CONFLICT` | 409 | Konfliktzustand |
| `MFA_REQUIRED` | 428 | MFA-Einrichtung erforderlich |
| `SERVER_ERROR` | 500 | Unerwarteter Fehler |
| `SSO_NOT_AVAILABLE` | 503 | SSO nicht aktiviert |

---

## Pagination (Standard)

```
GET /api/requisitions?limit=50&offset=0&status=OPEN&org_id=<uuid>
```

```json
{
  "items": [...],
  "total": 123,
  "limit": 50,
  "offset": 0
}
```

---

## Auth-Schemes

| Schema | Header / Cookie | Gültig für |
|---|---|---|
| Session Cookie | `Cookie: connect.sid=...` | Alle Frontend Internal Endpoints |
| API Key | `Authorization: Bearer tc_live_...` | Partner-Integration (geplant) |
| Staff Session | `Cookie: connect.sid=...` + `staffUserId` | Staff SCC |
| CSRF Token | `X-CSRF-Token: ...` | Alle mutierenden Endpoints |

---

## Vollständige Dokumentation

- **API Surface:** `docs/api/API_SURFACE.md` (70+ Endpoints klassifiziert)
- **API Versioning:** `docs/api/API_VERSIONING.md`
- **API Keys:** `docs/API_KEYS.md`

---

*WAVE 15 — Phase 2 — 2026-05-27*
