# TempConnect — API Surface

> Vollständige Klassifikation aller API-Endpunkte nach Kategorie, Auth-Anforderung, Visibility und Dokumentationsstand.
>
> WAVE 10 — Phase 2 — 2026-05-26

---

## Kategorie-Schema

| Kategorie | Bedeutung | Auth | Rate Limit |
|---|---|---|---|
| **Public** | Kein Login erforderlich | Nein | Ja (global) |
| **Frontend Internal** | Plattform-User-Interface | Session | Standard |
| **Partner** | API-Key-basierte Drittanbieter-Integration | API Key | Streng |
| **Admin** | Org-Admin-Funktionen | Session + Rolle | Standard |
| **Staff Internal** | TempConnect-Team (SCC) | Staff-Session | Standard |
| **Owner (OCC)** | TempConnect-Owner (OCC) | Session + OCC-Tabelle | Streng |
| **Support (SOC)** | Support-Agenten | Session + Support-Rolle | Standard |
| **Webhooks** | Ausgehende Events | API Key | — |
| **Deprecated** | Veraltet, wird entfernt | variiert | — |
| **Experimental** | Nicht stabil, kein SLA | Session | — |

---

## 1. Public Endpunkte (kein Login)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/health` | Health-Check |
| GET | `/api/ready` | Readiness-Check |
| GET | `/api/live` | Liveness-Check |
| GET | `/api/plans/public` | Öffentliche Plan-Informationen |
| GET | `/api/geo/suggest` | Geo-Suggestion (Standortsuche) |
| GET | `/api/sso/metadata/:orgId` | SP SAML Metadata XML |
| POST | `/api/auth/login` | Login (Rate-limited) |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/register` | Registrierung |
| POST | `/api/auth/reset-password` | Passwort-Reset (Rate-limited) |
| POST | `/api/auth/verify-email` | E-Mail-Verifikation |
| GET | `/api/csrf-token` | CSRF-Token für SPA |
| POST | `/api/enterprise-request` | Enterprise-Anfrage (Formular) |
| GET | `/api/sso/login/:orgId` | SSO-Login-Initiation |

---

## 2. Frontend Internal (Plattform-User)

### Auth & Identity
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET | `/api/me` | Aktuelle User/Org-Info | — |
| PUT | `/api/me` | Profil-Update | — |
| GET | `/api/mfa/status` | MFA-Status | — |
| POST | `/api/mfa/setup` | MFA-Setup (QR Code) | — |
| POST | `/api/mfa/enable` | MFA aktivieren | — |
| POST | `/api/mfa/verify` | TOTP-Code verifizieren | — |
| POST | `/api/mfa/disable` | MFA deaktivieren | — |

### Marketplace & Capacity
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET | `/api/marketplace` | Marketplace-Feed | DEMO+ |
| GET | `/api/search` | Plattform-Suche | DEMO+ |
| GET/POST | `/api/capacities` | Kapazitäten | BASIS+ |
| GET | `/api/capacity-exchange/feed` | Capacity Exchange | DEMO+ |
| GET | `/api/capacity-discovery` | Capacity Discovery | PLUS+ |
| GET/POST | `/api/sla-search-jobs` | SLA-Suchaufträge | PLUS+ |

### Requisitions & Staffing
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET/POST | `/api/requisitions` | Anforderungen | PLUS+ |
| GET/PATCH | `/api/requisitions/:id` | Anforderung Detail | PLUS+ |
| POST | `/api/requisitions/:id/transition` | Status-Übergang | PLUS+ |
| GET/POST | `/api/requisitions/:id/candidates` | Kandidaten | PLUS+ |
| GET | `/api/matching` | Matching | PRO+ |

### Assignments & Workforce
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET/POST | `/api/assignments` | Einsätze | INDIVIDUELL |
| GET/PATCH | `/api/assignments/:id` | Einsatz Detail | INDIVIDUELL |
| GET | `/api/workforce` | Workforce-Übersicht | INDIVIDUELL |
| GET | `/api/workforce/kpis` | Workforce-KPIs | INDIVIDUELL |

### Timesheets
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET/POST | `/api/timesheets` | Zeiterfassung | PLUS+ |
| GET/PATCH | `/api/timesheets/:id` | Timesheet Detail | PLUS+ |
| POST | `/api/timesheets/:id/submit` | Einreichen | PLUS+ |
| POST | `/api/timesheets/:id/approve` | Genehmigen | PLUS+ |
| GET | `/api/timesheet-templates` | Vorlagen | PLUS+ |

### Vendor Pool & Suppliers
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET/POST | `/api/vendor-pool` | Vendor Pool | INDIVIDUELL |
| GET/DELETE | `/api/vendor-pool/:id` | Vendor-Eintrag | INDIVIDUELL |
| GET | `/api/suppliers` | Lieferanten-Liste | PRO+ |
| GET | `/api/preferred-vendors` | Bevorzugte Vendoren | PRO+ |
| GET/POST | `/api/supplier-pools` | Supplier Pools | INDIVIDUELL |

### Rate Cards
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET/POST | `/api/rate-cards` | Rate Cards | PRO+ |
| GET/PATCH/DELETE | `/api/rate-cards/:id` | Rate Card Detail | PRO+ |

### Spend Analytics
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET | `/api/spend-analytics/summary` | Spend-Übersicht | PRO+ |
| GET | `/api/spend-analytics/by-vendor` | Spend nach Vendor | PRO+ |
| GET | `/api/spend-analytics/by-category` | Spend nach Kategorie | PRO+ |
| GET | `/api/spend-analytics/over-time` | Zeitreihe | PRO+ |

### Compliance & Documents
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET/POST | `/api/compliance-docs` | Compliance-Dokumente | INDIVIDUELL |
| GET/PATCH | `/api/compliance-docs/:id` | Dokument Detail | INDIVIDUELL |
| GET/POST | `/api/proofs` | Nachweise | PLUS+ |

### Organizations
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET/PATCH | `/api/organizations/:id` | Org-Daten | — |
| GET/POST | `/api/organizations/:id/members` | Mitglieder | Admin |
| GET/POST | `/api/organizations/:id/locations` | Standorte | INDIVIDUELL |
| GET/POST | `/api/organizations/:id/departments` | Abteilungen | INDIVIDUELL |

### Reporting & Dashboard
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET | `/api/reporting/executive` | Executive Dashboard | PRO+ |
| GET | `/api/analytics` | Analytics | PLUS+ |

### Notifications & Activity
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET | `/api/notifications` | Benachrichtigungen | — |
| GET | `/api/activity-feed` | Aktivitäts-Feed | — |
| GET | `/api/notification-stream` | SSE-Stream | — |

### Contracts & Deals
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET/POST | `/api/contracts` | Verträge | INDIVIDUELL |
| GET/PATCH | `/api/contracts/:id` | Vertrag Detail | INDIVIDUELL |
| GET/POST | `/api/requests` | Anfragen | BASIS+ |
| GET/POST | `/api/listings` | Listings | BASIS+ |

### Subscriptions & Billing
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET | `/api/plans` | Verfügbare Pläne | — |
| POST | `/api/payment` | Zahlung initiieren | — |
| GET/POST | `/api/subscription-requests` | Abo-Anfragen | — |
| GET | `/api/subscription-documents` | Abo-Dokumente | — |
| GET/POST | `/api/credits` | Credits | — |

### Settings & SSO
| Methode | Pfad | Beschreibung | Plan |
|---|---|---|---|
| GET/PATCH | `/api/settings` | Einstellungen | Admin |
| GET/POST | `/api/sso/:orgId/config` | SSO-Konfiguration | INDIVIDUELL |
| GET | `/api/sso/:orgId/status` | SSO-Status | INDIVIDUELL |
| DELETE | `/api/sso/:orgId/config` | SSO löschen | INDIVIDUELL |

### Misc Frontend
| Methode | Pfad | Beschreibung |
|---|---|---|
| GET/POST | `/api/approvals` | Genehmigungen |
| GET/POST | `/api/onboarding` | Onboarding |
| GET/POST | `/api/ratings` | Bewertungen |
| GET | `/api/reputation` | Reputation |
| GET/POST | `/api/bounties` | Boni |
| GET | `/api/product-releases` | Release Notes |
| POST | `/api/emergency` | Notfall-Staffing |
| GET/POST | `/api/data-governance` | DSGVO-Requests |

---

## 3. Admin (Org-Admin-Funktionen)

| Methode | Pfad | Beschreibung | Rollen |
|---|---|---|---|
| GET | `/api/admin/users` | User-Verwaltung | platform_admin |
| POST | `/api/admin/users/:id/block` | User sperren | platform_admin |
| GET | `/api/admin/orgs` | Org-Liste | platform_admin |
| GET | `/api/internal/*` | Interne Admin-Endpoints | platform_admin |
| GET/POST | `/api/org-control-center/*` | Org Control Center | owner/admin |

---

## 4. Staff Internal (SCC)

**Auth:** `req.session.staffUserId` + `tempconnect_staff.is_active = TRUE`  
**Pfad:** `/staff/api/*`

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/staff/api/customers` | Kundenübersicht |
| GET/PATCH | `/staff/api/customers/:id` | Kunden-Detail |
| GET | `/staff/api/subscriptions` | Abo-Verwaltung |
| POST | `/staff/api/subscriptions/:id/activate` | Abo aktivieren |
| GET | `/staff/api/subscription-requests` | Abo-Anfragen |
| POST | `/staff/api/subscription-requests/:id/approve` | Abo genehmigen |
| GET | `/staff/api/audit-log` | Audit-Trail |
| GET | `/staff/api/feature-overrides` | Feature-Überschreibungen |

---

## 5. Owner Control Center (OCC)

**Auth:** `req.session.userId` + `occ_owner_access.is_active = TRUE`  
**Pfad:** `/api/owner-control/*`

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/owner-control/bootstrap` | Owner-Kontext + Module |
| GET | `/api/owner-control/executive/summary` | Executive KPIs |
| GET | `/api/owner-control/operations/health` | Platform Health |
| GET | `/api/owner-control/revenue/summary` | Revenue-Übersicht |
| GET | `/api/owner-control/decisions-requests` | Offene Entscheidungen |
| POST | `/api/owner-control/decisions-requests/:id/approve` | Entscheidung genehmigen |
| GET | `/api/owner-control/audit/feed` | Audit-Feed |
| GET | `/api/owner-control/platform/*` | Platform-Management |
| GET | `/api/owner-control/risk/*` | Risk-Übersicht |
| GET | `/api/owner-control/infrastructure/*` | Infrastruktur |

---

## 6. Support (SOC)

**Auth:** `req.session.userId` + Support-Agent-Rolle  
**Pfad:** `/support-ops/api/*` + `/api/support/*`

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET/POST | `/api/support/cases` | Support-Cases |
| GET/PATCH | `/api/support/cases/:id` | Case Detail |
| POST | `/api/support/escalations` | Eskalation |
| GET | `/api/support/tickets` | Tickets |

---

## 7. Error Contract (Standard)

**Alle Fehler-Responses folgen diesem Schema:**

```json
{
  "success": false,
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Menschenlesbarer Text"
  }
}
```

**Oder Kurzform (Legacy-kompatibel):**
```json
{ "error": "MACHINE_READABLE_CODE" }
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
| `MFA_VERIFY_REQUIRED` | 428 | MFA-Verifikation erforderlich |
| `SERVER_ERROR` | 500 | Unerwarteter Fehler |
| `SSO_NOT_AVAILABLE` | 503 | SSO nicht aktiviert |

---

## 8. Auth-Schemes

| Schema | Header / Cookie | Gültig für |
|---|---|---|
| Session Cookie | `Cookie: connect.sid=...` | Alle Frontend Internal Endpunkte |
| API Key | `Authorization: Bearer tc_live_...` | Partner-Integration |
| Staff Session | `Cookie: connect.sid=...` + staffUserId | Staff Internal (SCC) |
| CSRF Token | `X-CSRF-Token: ...` | Alle mutierende Endpunkte |

---

## 9. Pagination & Filtering (Standard)

```
GET /api/requisitions?limit=50&offset=0&status=OPEN&org_id=<uuid>
```

**Standard-Response mit Pagination:**
```json
{
  "items": [...],
  "total": 123,
  "limit": 50,
  "offset": 0
}
```

**Filter-Parameter (je Route):**
- `status` — Ressourcen-Status
- `org_id` — Org-Filter (server-side resolved)
- `location_id` — Standort-Filter
- `date_from` / `date_to` — Datums-Filter (ISO 8601)
- `limit` — Max. Einträge (Standard: 50, Max: 200)
- `offset` — Pagination-Offset

---

*Letzte Aktualisierung: WAVE 10 — Phase 2 — 2026-05-26*
*Zuständig: Backend (Claude), Freigabe: Owner*
