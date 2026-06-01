# TempConnect — Rollen & Feature-Matrix

> Kanonische Quellen:
> - Rollen-Hierarchie + Permissions: `api/services/rbacService.js`
> - Seiten-Gating: `api/config/visibilityMatrix.js`
> - Feature-Gates: `api/config/planFeatures.js`
> - Hub-Surfaces: `frontend/public/js/hubVisibility.js`
>
> WAVE 06 — Phase 2 — 2026-05-26

---

## Überblick: Benutzer-Typen

TempConnect unterscheidet **vier voneinander getrennte Zugangswelten**:

| Zugangswelt | Auth-Basis | Pfad | Middleware |
|---|---|---|---|
| **Plattform-Nutzer** (Kunden) | `req.session.userId` | `/`, `/public/*`, `/api/*` | `auth.js` + `orgContext.js` |
| **Worker-Portal** | `req.session.userId` | `/worker/*` | `auth.js` + Worker-Guard |
| **Staff Control Center (SCC)** | `req.session.staffUserId` | `/staff/*`, `/staff/api/*` | `staffControlAccess.js` |
| **Owner Control Center (OCC)** | `req.session.userId` + `occ_owner_access` | `/owner-control/`, `/api/owner-control/*` | `requireOwnerControlAccess.js` |
| **Support-Ops Center (SOC)** | `req.session.userId` + Support-Agent-Rolle | `/support-ops/*` | `supportAccess.js` |

> **Sicherheitsregel:** Diese Zugangswelten sind vollständig getrennt. Ein SCC-Login ist keine gültige Sitzung für Plattform-Routen und umgekehrt.

---

## Rollen-Hierarchie (Plattform-Nutzer)

Quelle: `api/services/rbacService.js :: ROLE_HIERARCHY`

```
platform_admin  ← interne Plattform-Administration
  └─ owner      ← Org-Eigentümer (vollständige Kontrolle)
       └─ admin  ← Org-Administrator
            ├─ program_manager    ← Programm-/Projektmanager
            │    └─ hiring_manager ← Personalverantwortlicher
            │    └─ recruiter      ← Recruiter
            │    └─ member
            ├─ supplier_manager   ← Lieferantenbeauftragter
            │    └─ member
            ├─ finance            ← Finanzverantwortlicher
            │    └─ member
            └─ dispatcher         ← Disponent
                 └─ member
supplier_user   ← Nutzer auf Agentur-/Lieferantenseite
viewer          ← Nur-Lese-Zugriff
```

**Vererbung:** Höhere Rollen erben alle Rechte niedrigerer Rollen.

---

## Org-Typen

| Org-Typ | Beschreibung | Rollen verfügbar |
|---|---|---|
| `company` | Einkäufer / Auftraggeber | Alle Plattform-Rollen |
| `agency` | Anbieter / Lieferant | Alle Plattform-Rollen + supplier_user |
| `worker` | Einzelne Arbeitskraft | Eigenes Worker-Portal, kein Hub-Zugriff |

---

## Permission-Matrix (Haupt-Operationen)

Quelle: `api/services/rbacService.js :: PERMISSIONS`

### Requisitions

| Permission | owner | admin | prog_mgr | hiring_mgr | recruiter | supplier_mgr | finance | dispatcher | member | viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `requisition.create` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `requisition.edit` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `requisition.approve` | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| `requisition.cancel` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| `requisition.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `requisition.assign` | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |

### Angebote / Deals

| Permission | owner | admin | prog_mgr | hiring_mgr | recruiter | supplier_mgr | finance | dispatcher | member | supplier_user |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `offer.create` | ✓ | ✓ | — | — | ✓ | — | — | — | — | ✓ |
| `offer.accept` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| `offer.reject` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| `offer.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Vendor Pool / Lieferanten

| Permission | owner | admin | prog_mgr | hiring_mgr | recruiter | supplier_mgr | finance | dispatcher | member |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `vendor_pool.manage` | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — |
| `vendor_pool.view` | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — |
| `supplier.manage` | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — |
| `supplier.view` | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — |

### Compliance

| Permission | owner | admin | prog_mgr | hiring_mgr | supplier_mgr | finance | member | supplier_user |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `compliance.manage` | ✓ | ✓ | — | — | ✓ | — | — | — |
| `compliance.verify` | ✓ | ✓ | — | — | ✓ | — | — | — |
| `compliance.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `compliance.upload` | ✓ | ✓ | — | — | — | — | — | ✓ |

### Zeiterfassung

| Permission | owner | admin | prog_mgr | hiring_mgr | supplier_mgr | finance | dispatcher | recruiter | member | supplier_user |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `timesheet.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `timesheet.create` | ✓ | ✓ | — | — | — | — | ✓ | ✓ | — | ✓ |
| `timesheet.submit` | ✓ | ✓ | — | — | — | — | ✓ | ✓ | — | ✓ |
| `timesheet.approve` | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — |
| `timesheet.reject` | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — |

### Berichte / Analytics

| Permission | owner | admin | prog_mgr | hiring_mgr | supplier_mgr | finance |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `report.executive` | ✓ | ✓ | ✓ | — | — | ✓ |
| `report.operational` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `report.supplier` | ✓ | ✓ | ✓ | — | ✓ | — |

### Org-Verwaltung

| Permission | owner | admin | prog_mgr | finance |
|---|:---:|:---:|:---:|:---:|
| `org.settings` | ✓ | ✓ | — | — |
| `org.members` | ✓ | ✓ | — | — |
| `org.locations` | ✓ | ✓ | ✓ | — |
| `org.departments` | ✓ | ✓ | ✓ | — |
| `org.billing` | ✓ | ✓ | — | ✓ |

### Verträge / Rate Cards

| Permission | owner | admin | prog_mgr | hiring_mgr | supplier_mgr | finance | viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `contract.create` | ✓ | ✓ | ✓ | — | — | — | — |
| `contract.edit` | ✓ | ✓ | ✓ | — | — | — | — |
| `contract.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `contract.terminate` | ✓ | ✓ | — | — | — | — | — |
| `rate_card.create` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `rate_card.update` | ✓ | ✓ | ✓ | — | — | ✓ | — |
| `rate_card.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Seiten-Gating (Visibility-Matrix)

Quelle: `api/config/visibilityMatrix.js`

| Seite | Strategie | Feature-Key | Org-Typ | Plan-Mindest |
|---|---|---|---|---|
| `enterprise.html` | always_open | — | company/agency | — |
| `capacity_exchange_feed.html` | plan_gated | `capacity_exchange_basic` | company/agency | DEMO |
| `vendor_pool.html` | plan_and_role | `supplier_management` | company | INDIVIDUELL |
| `spend-analytics.html` | plan_gated | `spend_analytics` | company/agency | PRO |
| `organization.html` | always_open | — | company/agency | — |
| `timesheets.html` | plan_gated | `timesheets` | company/agency | PLUS |
| `worker_management.html` | plan_gated | `worker_module` | agency | PLUS |
| `rate-cards.html` | plan_and_role | `rate_card_management` | company | PRO |
| `compliance.html` | individuell_only | `compliance` | company/agency | INDIVIDUELL |
| `executive_dashboard.html` | plan_and_role | `enterprise_analytics` | company | PRO |
| SCC (`/staff/*`) | staff_gated | — | N/A (Staff-Auth) | N/A |
| OCC (`/owner-control/*`) | staff_gated | — | N/A (OCC-Auth) | N/A |
| SOC (`/support-ops/*`) | staff_gated | — | N/A (Support-Auth) | N/A |

---

## OCC / SCC / SOC — Klare Trennung

### Owner Control Center (OCC)
- **Zugriff:** TempConnect-Owner (natürliche Personen in `occ_owner_access`)
- **Auth:** Normales Session-Login + OCC-Tabellen-Check (`requireOwnerControlAccess.js`)
- **Pfad:** `/owner-control/` (Frontend), `/api/owner-control/*` (Backend)
- **Zweck:** Geschäftssteuerung, Revenue-Übersicht, Entscheidungen, Plattform-Health
- **RLS:** Cross-Org über `withStaffContext` (eigene Middleware-Integration)

### Staff Control Center (SCC)
- **Zugriff:** TempConnect-Team (`tempconnect_staff` Tabelle, `is_active = TRUE`)
- **Auth:** Separate Staff-Sitzung (`req.session.staffUserId`, getrennt von Kunden-Session)
- **Pfad:** `/staff/*`, `/staff/api/*`
- **Zweck:** Kunden-Support, Abo-Verwaltung, Plattform-Operationen
- **RLS:** `withStaffContext` via `req.withStaffContext(fn)` Helper (`reason` Pflichtfeld)
- **Step-Up:** Mutierende Aktionen erfordern Re-Authentifizierung (`requireStaffStepUp`)

### Support-Ops Center (SOC)
- **Zugriff:** Support-Agenten (interne + externe Rollen in `support_agents`)
- **Auth:** Normales Session-Login + Support-Rollen-Check (`supportAccess.js`)
- **Pfad:** `/support-ops/*`
- **Rollen:** `internal_support_agent`, `internal_support_lead`, `external_support_agent`, `external_support_supervisor`, `support_auditor`
- **Zweck:** Ticket-Bearbeitung, Eskalationen, Qualitätssicherung

### Sicherheitsgarantien
- Kein Plattform-Kunde erreicht SCC/OCC/SOC-Routen
- Kein SCC-Staff erreicht OCC-Routen
- Kein OCC-Owner-Login gilt als Plattform-Session
- Kein SOC-Agent sieht SCC/OCC-Funktionen

---

## Worker-Portal — Vollständige Abgrenzung

Worker (`org_type: worker`) haben **keinen Zugriff** auf den Enterprise-Hub.

| Bereich | Worker | Grund |
|---|---|---|
| Enterprise Hub (`enterprise.html`) | `hidden_worker` | Falscher Org-Typ |
| Alle Hub-Cards | `hidden_worker` | Keine Unternehmensfunktionen |
| Vendor Pool | `hidden_worker` | Company-only |
| Rate Cards | `hidden_worker` | Company-only |
| Executive Dashboard | `hidden_worker` | Company-only |

Worker sehen ausschließlich das Einsatzportal für Zeiterfassung und Einsatzdaten.

---

## Hub-Card Visibility-States

Quelle: `frontend/public/js/hubVisibility.js`

| State | Bedeutung | Anzeige |
|---|---|---|
| `visible` | Zugriff erlaubt | Normale Karte |
| `hidden_plan_locked` | Plan zu niedrig | Karte mit Upgrade-CTA |
| `hidden_role` | Rolle reicht nicht | Karte ausgeblendet |
| `hidden_worker` | Worker-Account | Karte ausgeblendet |
| `hidden_wrong_side` | Falsche Org-Seite | Karte ausgeblendet |
| `hidden_location_scope` | Standort-Kontext | Karte ausgeblendet |

**Upgrade-CTA:** Nur bei `hidden_plan_locked` — zeigt den nächsten nötigen Plan.

---

## Backend-Guards (Enforcement)

### Route-Level
```javascript
// Rollen-Check
import { requirePermission } from "../middleware/rbac.js";
router.post("/requisitions", requirePermission("requisition.create"), handler);

// Feature-Gate
import { featureGate } from "../middleware/featureGate.js";
router.get("/rate-cards", featureGate("rate_card_management"), handler);

// Entitlement
import { entitlementGuard } from "../middleware/entitlementGuard.js";
router.post("/assignments", entitlementGuard({ feature: "assignments" }), handler);
```

### Service-Level
```javascript
// Inline-Check in Services
import { hasFeature } from "../config/planFeatures.js";
if (!hasFeature(plan, "advanced_matching", { pilot })) {
  throw new ForbiddenError("PLAN_REQUIRED");
}
```

### Org-Boundary (immer erzwungen)
Alle tenant-scoped Queries laufen über `withOrgContext(pool, req.orgId, fn)`.
Fremde Org-ID → 0 Rows durch RLS (deny-by-default seit Migration 116).

---

*Letzte Aktualisierung: WAVE 06 — Phase 2 — 2026-05-26*
*Zuständig: Backend + Produkt (Claude), Freigabe: Owner*
