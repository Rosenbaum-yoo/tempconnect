# TempConnect — Pläne und Limits

> Kanonische Quelle: `api/config/planFeatures.js` + `api/services/userService.js (PLAN_LIMITS)`
> 
> Dieses Dokument ist die menschlesbare Ableitung. Bei Widerspruch gilt der Code.
>
> WAVE 06 — Phase 2 — 2026-05-26

---

## Öffentliche Pläne

| Plan | Preis/Monat | Zielgruppe | Kern-Versprechen |
|---|---|---|---|
| **DEMO** | Kostenlos | Erstnutzer, Evaluierung | Marketplace-Einblick, keine echten Transaktionen |
| **BASIS** | 150 € | Kleine Unternehmen | Einstieg in aktiven Betrieb, begrenzte Transaktionen |
| **PLUS** | 499 € | Wachsende Teams | Produktiver Betrieb, Zeiterfassung, Worker-Modul |
| **PRO** | 799 € | Professionelle Organisationen | Unbegrenzte Transaktionen, Analytics, Rate Cards |
| **INDIVIDUELL** | individuell | Enterprise-Kunden | Enterprise-Features, SSO, Compliance, API, mehrere Standorte |

> **Hinweis:** `ENTERPRISE` ist kein eigener Plan. Es ist das Funktionsniveau innerhalb von INDIVIDUELL (Unterklasse `individuell_enterprise` bei ≥1000 Mitarbeitern).

---

## Transaktions-Limits pro Monat

| Limit | DEMO | BASIS | PLUS | PRO | INDIVIDUELL |
|---|---|---|---|---|---|
| Requests senden | 0 | 5 | 20 | **unbegrenzt** | **unbegrenzt** |
| Requests empfangen | 0 | 5 | 20 | **unbegrenzt** | **unbegrenzt** |
| Aktive Listings | 0 | 5 | 20 | **unbegrenzt** | **unbegrenzt** |
| Notdienst-Einsätze/Monat | 0 | 1 | 1 | 1 | **unbegrenzt** |
| Notdienst aktiv | Nein | Ja | Ja | Ja | Ja |
| Mitarbeiter pro Request | 0 | 3 | 10 | 20 | **unbegrenzt** |

*-1 = unbegrenzt (kein Code-Limit gesetzt)*

---

## Feature-Gates pro Plan

Quelle: `api/config/planFeatures.js :: planFeatures`

### SLA / Support-Level

| Feature | DEMO | BASIS | PLUS | PRO | INDIVIDUELL |
|---|---|---|---|---|---|
| Marketplace ansehen | ✓ | ✓ | ✓ | ✓ | ✓ |
| SLA-Zugang | ✓ | ✓ | ✓ | ✓ | ✓ |
| SLA: Angebote erstellen | — | — | ✓ | ✓ | ✓ |
| SLA: Hilfe | — | — | ✓ | ✓ | ✓ |
| SLA: Subscriptions | — | — | ✓ | ✓ | ✓ |
| SLA: Profile | — | — | ✓ | ✓ | ✓ |
| SLA: Nachweise | — | — | ✓ | ✓ | ✓ |
| SLA-Level | none | none | PRO | EMERGENCY | ENTERPRISE |

### Kern-Features

| Feature | DEMO | BASIS | PLUS | PRO | INDIVIDUELL |
|---|---|---|---|---|---|
| Dauerhafte Anfragen | — | — | ✓ | ✓ | ✓ |
| Benachrichtigungen / Alerts | — | — | ✓ | ✓ | ✓ |
| Basis-Analytics | — | — | ✓ | ✓ | ✓ |
| Zeiterfassung (Timesheets) | — | — | ✓ | ✓ | ✓ |
| Worker-Modul | — | — | ✓ | ✓ | ✓ |
| Notfall-Staffing | — | — | ✓ | ✓ | ✓ |
| Smart Pricing | — | — | ✓ | ✓ | ✓ |
| Advanced Matching | — | — | — | ✓ | ✓ |
| Lieferantenbewertungen | — | — | — | ✓ | ✓ |
| Deal-Workflow | — | — | — | ✓ | ✓ |
| Premium-Sichtbarkeit | — | — | — | ✓ | ✓ |
| Rate Card Management | — | — | — | ✓ | ✓ |
| Spend Analytics | — | — | — | ✓ | ✓ |
| Data Governance | — | — | — | ✓ | ✓ |

### Capacity Exchange

| Feature | DEMO | BASIS | PLUS | PRO | INDIVIDUELL |
|---|---|---|---|---|---|
| Capacity Exchange (Basic) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Capacity Matching | — | — | ✓ | ✓ | ✓ |
| Capacity Priority | — | — | — | ✓ | ✓ |
| Capacity Multi-Location | — | — | — | — | ✓ |
| Inter-Agency Matching | — | — | — | — | ✓ |

### Enterprise-exklusive Features (nur INDIVIDUELL)

| Feature | Bedeutung |
|---|---|
| Genehmigungsworkflows | Mehrstufige Freigaben |
| Abteilungen | Org-Struktur mit Abteilungen |
| Multi-Standort | Mehrere Standorte verwalten |
| Lieferantenmanagement | Vendor-Pool + Compliance |
| Compliance-Modul | Dokument-Tracking + Zertifizierungen |
| Verträge | Vertragsverwaltung |
| Enterprise Analytics | Erweiterte Auswertungen |
| Audit-Nachvollziehbarkeit | Vollständiger Audit-Trail |
| Org-Einstellungen | SSO, SAML, API-Keys |
| Aufgaben / Assignments | Vollständige Assignment-Verwaltung |
| Integrationen | API-Anbindung |

---

## INDIVIDUELL-Unterklassen (automatisch nach Mitarbeiterzahl)

| Tier | Mitarbeiter | Beschreibung |
|---|---|---|
| `individuell_s` | 1–30 | Kleine Organisation |
| `individuell_m` | 31–250 | Mittlere Organisation |
| `individuell_l` | 251–999 | Große Organisation |
| `individuell_enterprise` | ≥1000 | Enterprise |

Erkennung: `api/config/planFeatures.js :: getIndividualTierByEmployeeCount(n)`

---

## Maturity Gates (planunabhängige Sperren)

Manche Features sind unabhängig vom Plan noch nicht produktionsreif. Selbst INDIVIDUELL-Kunden sehen diese nicht:

| Feature | Status | Freigabe |
|---|---|---|
| `admin_panel_access` | Nicht produktionsreif | Ausstehend |
| `executive_control_access` | In Arbeit | Ausstehend |
| `monitoring_suite_access` | Nicht vollständig | Ausstehend |

Implementierung: `api/config/planFeatures.js :: MATURITY_GATES`

---

## Pilot-Override

Aktive Pilotkunden (`pilot_status = 'active'` oder `customer_stage = 'pilot'`) erhalten **alle INDIVIDUELL-Features**, unabhängig vom gebuchten Plan. Dies wird durch `isPilotCustomer()` in der Gate-Funktion geprüft.

---

## Plan-Validierung (Backend)

```javascript
// In Services und Routes:
import { hasFeature } from "../config/planFeatures.js";

if (!hasFeature(req.org?.plan, "rate_card_management")) {
  return res.status(403).json({ error: "PLAN_REQUIRED", requiredPlan: "PRO" });
}
```

Middleware: `api/middleware/featureGate.js` für Routen-Level-Gating  
Middleware: `api/middleware/entitlementGuard.js` für Entitlement-Checks

---

## Frontend-Soft-Locks

Plan-gesperrte Features werden im Hub als `hidden_plan_locked` Karten angezeigt:
- Karte sichtbar, aber nicht klickbar
- Upgrade-CTA: "Auf PRO upgraden" / "INDIVIDUELL anfragen"
- Kein falscher Erfolg simuliert

Implementierung: `api/config/visibilityMatrix.js` → `has_upgrade_cta: true`  
Hub-Cards: `frontend/public/enterprise.html` → `data-surface` + JS Visibility-Matrix

---

## Upgrade-Pfade

| Von | Nach | Prozess |
|---|---|---|
| DEMO → BASIS | Sofort | Self-Service Checkout |
| BASIS → PLUS | Sofort | Self-Service Checkout |
| PLUS → PRO | Sofort | Self-Service Checkout |
| PRO → INDIVIDUELL | Formular | Individuelle Anfrage → Staff-Bearbeitung |
| beliebig → Pilot | Manuell | Owner/Staff-Aktivierung |

*Letzte Aktualisierung: WAVE 06 — Phase 2 — 2026-05-26*
