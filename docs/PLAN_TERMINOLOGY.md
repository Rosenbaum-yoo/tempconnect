# Plan Terminology

## Ziel

Nutzersichtbare Tarifbezeichnungen sind von technischen Plan-Keys getrennt.

## Aktueller Standard

- Technischer Plan-Key: `ENTERPRISE`
- Sichtbare Bezeichnung: `Individueller Tarif`
- Kanonischer Commercial-Key in Billing/Revenue: `INDIVIDUELL` (Legacy `ENTERPRISE`/`INDIVIDUAL` werden darauf normalisiert)

## Implementierung

- Frontend Mapping: `frontend/public/js/planFeatures.js` via `PlanFeatures.getDisplayPlanLabel(plan)`
- Backend Mapping: `api/services/planDisplayService.js` via `getPlanDisplayLabel(plan)`
- `GET /api/me` liefert zusaetzlich `plan_display_label`

## Regeln

- Interne Keys bleiben stabil fuer Feature Gates, DB-Werte und Legacy-Routen.
- UI, Landingpages, Abo-/Pricing-Seiten, Hilfetexte und Trust-Seiten zeigen die sichtbare Bezeichnung.
- Bei neuen user-facing Ausgaben immer die Mapping-Helfer verwenden.
- Revenue-/Finance-Metriken normalisieren Planwerte vor Aggregation (`FREE`→`DEMO`, `ENTERPRISE`/`INDIVIDUAL`→`INDIVIDUELL`), damit KPI- und Invoice-Truth konsistent bleiben.
- Plan-Checks in `subscriptions`, `organizations`, `invoices` und `payment_sessions` muessen denselben erlaubten Wertebereich abdecken, um KPI-Drift durch Constraint-Mismatch zu vermeiden.
