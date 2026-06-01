# SPECIAL — Datei-Inventar (aktive HTML, API-Routen, Services, Middleware)

> Stand: aus ZIP-Scan in den Quelldokumenten. **Vor jedem Ticket gegen aktuellen Repo-Stand verifizieren** — diese Liste kann veraltet sein.

---

## Statistik (ZIP-Scan, 2026-05-23)

| Bereich | Anzahl |
|---|---:|
| API-Dateien im Hauptpfad | ~677 |
| Frontend-Dateien im Hauptpfad | ~212 |
| SQL-Dateien | ~120 |
| Markdown-Dokumente | ~165 |
| HTML-Dateien im Hauptpfad | ~87 |
| JS-Dateien im Hauptpfad | ~526 |
| Testdateien API | ~185 |
| Route-Dateien | 71 |
| Service-Dateien | 123 |
| `frontend/public/*.html` | 68 |
| `frontend/public/js/*.js` | 28 |
| Middleware-Dateien | 18 |

---

## Aktive HTML-Dateien (`frontend/public/`)

### Kernseiten (Core Business — Welle 4)
- `requisitions.html`, `request_detail.html`, `company_requests.html`
- `demand_create.html`, `marketplace_demand_list.html`, `marketplace_demand_detail.html`, `marketplace_demand_create.html`
- `capacity_search.html`, `matching_results.html`
- `capacity_exchange.html`, `capacity_exchange_detail.html`, `capacity_exchange_feed.html`, `capacity_exchange_form.html`, `capacity_exchange_manage.html`, `marketplace_capacity_create.html`
- `app_notdienst.html`
- `vendor_pool.html`, `supplier_scorecard.html`
- `deal_management.html`, `offer_detail.html`, `angebote_verwalten.html`
- `mitarbeiter.html`, `worker-portal.html`, `worker-login.html`
- `worker-timesheet.html`, `timesheets.html`, `timesheet-templates.html`
- `worker-submissions-review.html`, `approvals.html`
- `spend-analytics.html`
- `rate-cards.html`
- `compliance_overview.html`, `data-governance.html`

### Einsatzportal
- `einsatzportal-dashboard.html`, `einsatzportal-einsaetze.html`, `einsatzportal-plan.html`, `einsatzportal-profil.html`, `einsatzportal-stundenzettel.html`, `einsatzportal-benachrichtigungen.html`, `einsatzportal-kontakt.html`

### Public Profiles
- `worker-profile-public.html`, `company_profile_public.html`

### Dashboard
- `executive_dashboard.html`

### Commercial (Welle 2, 9)
- `pricing.html`
- `enterprise.html`, `enterprise_anfrage.html`
- `sla_abo.html`, `sla_angebote.html`, `sla_hilfe.html`, `sla_nachweise.html`, `sla_profil.html`
- `sla_search_jobs_list.html`, `sla_search_job_detail.html`
- `bounties.html`

### Admin / Staff / OCC (Welle 7)
- `admin_panel.html`, `activity.html`, `internal_control_center.html`
- `staff/staff.html`, `staff_vanilla_backup_20260521/index.html`, `staff_vanilla_backup_20260521/login.html`
- (Owner Control unter `frontend/owner-control/index.html`)

### Org / Integration
- `organization.html`
- `integrations.html`
- `sso_config.html`

### Legal / Trust (Welle 14)
- `legal/agb.html`, `legal/datenschutz.html`, `legal/impressum.html`, `legal/kontakt.html`, `legal/sla.html`
- `legal/meine(agb).html` *(Encoding-Verdacht prüfen)*
- `trust/compliance.html`, `trust/platform-sla.html`, `trust/security.html`, `trust/status.html`

### Sonstiges / Hilfe
- `about.html`, `hilfe.html`, `onboarding.html`
- `agency_inbox.html`
- `system-health.html`
- `whats-new.html`
- `api-docs.html`, `api_docs.html` *(Duplikate prüfen)*

---

## API-Routen (Auswahl, `api/routes/`)

### Auth / Identity
- `auth.js`, `ssoService.js` (Service)

### Worker / Einsatz
- `workers.js`, `workerPortal.js`, `assignments.js`, `timesheets.js`, `timesheetTemplates.js`

### Marketplace / Matching
- `marketplace.js`, `matching.js`, `requests.js`, `requisitions.js`

### Vendor / Spend
- `vendorPool.js`, `spendAnalytics.js`

### Admin / Staff / Owner / Support
- `admin.js`, `staffControlCenter.js`, `ownerControlCenter.js`, `orgControlCenter.js`

### Governance / Approvals
- `approvals.js`, `dataGovernance.js`, `productReleases.js`, `reporting.js`

### Integrations / SSO
- `sso.js`, `integrations.js`

### Contracts
- `contracts.js`

---

## Services (`api/services/`)

- `authService.js`
- `workerService.js`, `workerSubmissionService.js`
- `timesheetService.js`
- `assignmentService.js`, `assignmentStaffingService.js`
- `dealWorkflow.js`
- `capacityExchangeService.js`
- `matchingEngine.js`
- `vendorPoolService.js`
- `spendAnalyticsService.js`
- `ssoService.js`
- `emailService.js`
- `notificationMatrix.js`
- `subscriptionLifecycleService.js`
- `auditLog.js`
- `contractService.js`
- `organizationService.js`

---

## Middleware (`api/middleware/`)

- `auth.js`
- `rbac.js`
- `orgBoundary.js`, `orgContext.js`
- `entitlementGuard.js`, `featureGate.js`
- `idempotency.js`
- `rateLimit.js`
- `staffControlAccess.js`, `ownerControlAccess.js`, `supportAccess.js`
- `auditWrite.js`

Plus: `api/utils/orgBoundary.js` (Helper).

---

## Backend-Config

- `frontend/vite.config.ts` → referenziert `occ.html` (Datei fehlt im Hauptfrontend laut Scan)
- `frontend/vite.config.support.ts` → referenziert `support.html` (Datei fehlt)
- `frontend/vite.config.staff.ts` → existiert, mit `staff.html`

→ Entscheidung in **WAVE_00 Baseline:** OCC/SOC neu bauen ODER Entry-Verweise entfernen ODER vorhandene statische Builds verwenden.

---

## Hygiene-Funde (ZIP-Scan)

Folgende Pfade waren in der ZIP enthalten und **müssen aus Release-Artefakten entfernt werden** (siehe WAVE_01):

| Pfad | Trefferzahl ZIP | Status |
|---|---:|---|
| `.env*` | 16 | inkl. echter `.env`, `.env.local`, `.env.txt`, `deploy/.env` |
| `.git` | 1.195 | inkl. Root-`.git` |
| `node_modules` | 33.195 | |
| `.claude` | 3.300 | |
| `.claire` | 6 | |
| `.clone` | 8 | |
| `.agents` | 5 | |
| `.vercel` | 3 | |
| Coverage / `.c8_output` | 635 | |
| `release/` | 334 | |
| `_zip_analysis/` | 704 | |
| Interne Archive | inkl. `release/tempconnect-v2.1.0-rc1.zip` | |

---

## Aktualisierungs-Hinweis

Diese Datei spiegelt den ZIP-Stand von 2026-05-23. **Bei Abweichungen im aktuellen Repo:** aktuellen Stand erfassen (WAVE_00 Baseline), diese Datei aktualisieren.

Aktualisierungen bitte als Patch zu dieser Datei vorschlagen, nicht überschreiben.
