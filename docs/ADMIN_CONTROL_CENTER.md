# Admin Control Center
Die Admin-Zentrale in `frontend/public/admin_panel.html` verwendet `GET /api/admin/control-center` als kanonischen Bootstrap. Der Endpunkt liefert den aktuellen Benutzerkontext, Card-States, Rollout-Reihenfolge und die ersten zusammengefassten Kennzahlen für die Hub-Ansicht. Dadurch ersetzt die Seite den früheren globalen Deny-Block durch kontrollierte per-Card-Zugriffslogik.
## Card States
Alle Karten werden mit einem klaren fachlichen Zustand gerendert:
- `active`: vollständig nutzbar
- `restricted`: sichtbar, aber bewusst begrenzt oder runtime-abhängig
- `admin_only`: nur für Owner, Admin oder platform_admin operativ freigeschaltet
- `enterprise_only`: fachlich vorhanden, aber erst ab höherem Plan freigegeben
- `planned`: Referenz sichtbar, keine operative Oberfläche
## Erste starke Karten
`Benutzer & Organisationen`, `Audit-Log` und `Plattform-Metriken` bilden den ersten belastbaren Kern der Zentrale. Sie nutzen bestehende Routen und Oberflächen weiter, statt eine zweite Admin-Welt aufzubauen:
- `/api/admin/users`
- `/api/admin/organizations`
- `/api/admin/audit-log`
- `/api/admin/metrics`
- `frontend/public/organization.html?tab=<members|audit|usage|security|roles>`
## Vertrag: `/api/admin/users`
Der Users-Endpunkt liefert eine kanonische Pagination-Hülle und konsistente Fehlerobjekte:
- Success: `{ success: true, data: { items, total, limit, offset } }`
- Error: `{ success: false, error: { code, message } }`
Scope-Logik:
- `platform_admin` und Legacy-Globaladmins sehen den plattformweiten Bestand.
- Org-Admins (`owner`/`admin`) erhalten dieselbe Route org-gebunden; ohne Org-Kontext wird sauber mit `ORG_CONTEXT_REQUIRED` beantwortet statt mit 500.
Plan-Darstellung:
- Das Feld `plan` wird aus der neuesten `subscriptions`-Zeile abgeleitet (`DEMO` als Fallback), damit die Benutzerverwaltung nicht von optionalen/legacy `users.plan`-Spalten abhängt.
## SSO / SAML
Die SSO-Karte und `frontend/public/sso_config.html` verwenden denselben Policy-Satz wie der Bootstrap. Aktiv ist SSO nur, wenn alle Bedingungen erfüllt sind:
- Organisations- oder Plattform-Adminrechte
- gültiger Organisationskontext
- Plan `PRO` oder `INDIVIDUELL`
- produktive SAML-Runtime (`getSSOMode() === "saml"`)
Wenn eine dieser Bedingungen fehlt, bleibt die Karte sichtbar, aber soft-locked mit klarer Begründung. Die Admin-Endpunkte unter `/api/sso/config/:orgId` und `/api/sso/test/:orgId` erzwingen dieselbe Freigabelogik serverseitig.
## Workflows & State Machines
Die Workflow-Karte bleibt bewusst `planned`. Die zugrunde liegenden Zustandsmodelle sind real vorhanden, aber die Admin-Zentrale zeigt nur Referenzzustände und keine halbfertige operative Steuerfläche. Erst mit klaren Guardrails soll daraus ein aktiver Bereich werden.
## Revenue Tab: Commercial Truth
Der Revenue-Tab im Admin Panel (`/public/admin_panel.html`, Tab `Revenue`) zeigt keine kosmetischen KPI-Summen mehr, sondern explizite Quellen:
- **Contractual MRR**: anerkannter MRR aus aktiven Subscriptions, mit Preisquellen-Praezedenz (`custom_quote_pending` > `contract_price` > `pilot_price` > `catalog_price`).
- **Catalog MRR (theoretisch)**: Referenzwert aus Katalog-/Tier-Preisen, getrennt vom anerkannten Vertragsumsatz.
- **Invoice Truth**: Lifecycle (`draft`, `issued`, `overdue`, `paid`, `void`) plus `invoiced_revenue`, `paid_revenue`, `open_receivables`.
- **Payment Truth**: aggregierte Payment Sessions (`completed`, `pending`, `failed`, `expired`) inkl. Amount.
- **Billable Truth**: approved, noch nicht verknuepfte Timesheet-Leistung (`invoice_id IS NULL`) als fakturierbares Volumen.
- **Spend↔Invoice Bridge (30d)**: approved Spend gegen operational invoiced Revenue zur Reconciliation-Luecke.
- **Retention/Churn Truth**: aktive Paid-Kundenbasis, retained/churned Logos, Gross-Churn-MRR, NRR, inactive-but-paying, PQA sowie usage-intensity-Bänder und At-Risk-Drilldowns.
- **Pilot/Conversion Truth**: verbindliche Funnel-Stufen (`lead` bis `paid_live`/`lost_aborted`), Aktivierung, belastbare Nutzung, Pricing-Klarheit, Stage-Distribution, Transition-Raten und At-Risk-Pilots.
- **GTM Learnings**: ICP-/Tarifpfad-Performance, Onboarding-Bottlenecks und echte Produktbereichsnutzung der Piloten.
Wichtig: `available: false` in einzelnen Truth-Blöcken bedeutet Schema-/Drift-Limitierung und darf nicht als `0 €` interpretiert werden.
Export/Audit:
- Im Revenue-Tab stehen `Export CSV` und `Export JSON` bereit.
- Beide Aktionen verwenden kanonisch `GET /api/reporting/finance-truth/export?format=csv|json`.
- Damit sind Admin- und Executive-Sicht auf denselben Finance-Truth-Exportvertrag verdrahtet; zusätzlich nutzen `organization.html` (Usage-Tab) und `spend-analytics.html` denselben Exportpfad.
