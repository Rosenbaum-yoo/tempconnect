# FINALIZATION_BASELINE — Ist-Zustand TempConnect
> Erstellt: 2026-05-24 | WAVE_00 | Autor: Claude Code
> Letzte Aktualisierung: 2026-05-27 (Delta SCC WAVEs 03-06)
> Vor jedem WAVE-Start gegen aktuellen Repo-Stand verifizieren.

---

## 1. Repo-Statistik

### 1a. Stand 2026-05-24 (Erstbaseline)

| Bereich | Anzahl | Anmerkung |
|---|---:|---|
| HTML-Seiten (frontend/public/*.html) | 68 | Root-Ebene |
| HTML-Seiten (staff/, trust/, legal/) | 12 | 1 + 4 + 7 |
| **HTML gesamt** | **80** | |
| API-Routen (api/routes/*.js) | 71 | Root-Ebene |
| API-Routen (api/routes/occ/*.js) | 14 | OCC-Subdir |
| **API-Routen gesamt** | **85** | |
| Services (api/services/) | 123 | |
| Middleware (api/middleware/) | 18 | |
| SQL-Migrationen | ~115 | 001–112 + Buchstaben-Varianten |
| Letzte Migration | 112 | 112_multi_location_columns.sql |
| Fehlende Migration | 111 | Lücke zwischen 110 und 112 — prüfen |
| Testdateien (api/test/) | 160 | |
| Bekannte Test-Failures | **0** | 3754 Tests grün (2026-05-24) |
| Frontend-JS-Pages (js/pages/) | 23 | |
| Frontend-JS gesamt (public/js/) | 29 | |
| Config-Dateien (api/config/) | 6 | planCatalog, planFeatures, visibilityMatrix, branding, envValidator, index |

### 1b. Delta 2026-05-27 (nach SCC WAVEs 03–06, Platform WAVEs 03–07)

| Bereich | Alt | Neu | Delta-Anmerkung |
|---|---:|---:|---|
| API-Routen (root) | 71 | 72 | +1 (staffControlCenter.js erweitert) |
| **API-Routen gesamt** | **85** | **86** | |
| Middleware | 18 | 20 | +`staffSecurity.js` (WAVE 03), +`requireMfa.js` |
| SQL-Migrationen | ~115 | 121 | +113,114,115,116,118 + NUMBERING.md |
| Letzte Migration | 112 | 118 | 118_staff_identity_hardening.sql |
| Fehlende Migration | 111 | 111+117 | Lücken 110→112 und 116→118 — prüfen |
| Testdateien (api/test/) | 160 | 166 | +6 Sicherheits-/SCC-Testdateien |
| Bekannte Test-Failures | **0** | **0** | 3836 Tests grün (2026-05-24 nach WAVE_07) |
| SCC React-Module (frontend/src/staff/) | Stub | 14 Module + Shell | WAVEs 03–06 vollständig |

---

## 2. Aktive HTML-Seiten (Vollständig)

### 2.1 Core Business
| Datei | Bereich | Welle |
|---|---|---|
| requisitions.html | Bedarfsverwaltung | 4 |
| request_detail.html | Bedarfsdetail | 4 |
| company_requests.html | Firmenbedarfe | 4 |
| demand_create.html | Bedarf anlegen | 4 |
| marketplace_demand_list.html | Marktplatz-Bedarfe | 4 |
| marketplace_demand_detail.html | Marktplatz-Detail | 4 |
| marketplace_demand_create.html | Marktplatz-Bedarf anlegen | 4 |
| capacity_search.html | Kapazitätssuche | 4 |
| matching_results.html | Matching-Ergebnisse | 4 |
| capacity_exchange.html | Kapazitätsbörse | 4 |
| capacity_exchange_detail.html | KE-Detail | 4 |
| capacity_exchange_feed.html | KE-Feed | 4 |
| capacity_exchange_form.html | KE-Formular | 4 |
| capacity_exchange_manage.html | KE-Verwaltung | 4 |
| marketplace_capacity_create.html | Kapazität anlegen | 4 |
| app_notdienst.html | Notdienst-App | 4 |
| vendor_pool.html | Lieferantenpool | 4 |
| supplier_scorecard.html | Lieferanten-Scorecard | 4 |
| deal_management.html | Deal-Verwaltung | 4 |
| offer_detail.html | Angebotsdetail | 4 |
| angebote_verwalten.html | Angebote | 4 |
| mitarbeiter.html | Mitarbeiter | 4 |
| worker-portal.html | Worker-Portal | 4 |
| worker-login.html | Worker-Login | 4 |
| worker-timesheet.html | Worker-Stundenzettel | 4 |
| timesheets.html | Stundenzettelliste | 4 |
| timesheet-templates.html | Zeiterfassungs-Vorlagen | 4 |
| worker-submissions-review.html | Einreichungen prüfen | 4 |
| approvals.html | Genehmigungen | 4 |
| spend-analytics.html | Spend-Analyse | 4/5 |
| rate-cards.html | Konditionsblätter | 4 |
| compliance_overview.html | Compliance | 4/6 |
| data-governance.html | Datenverwaltung | 4/6 |

### 2.2 Einsatzportal (Worker-Seiten)
| Datei | Bereich |
|---|---|
| einsatzportal-dashboard.html | Worker-Dashboard |
| einsatzportal-einsaetze.html | Einsatzliste |
| einsatzportal-plan.html | Einsatzplan |
| einsatzportal-profil.html | Worker-Profil |
| einsatzportal-stundenzettel.html | Stundenzettel |
| einsatzportal-benachrichtigungen.html | Benachrichtigungen |
| einsatzportal-kontakt.html | Kontakt |

### 2.3 Public Profiles
| Datei | Anmerkung |
|---|---|
| worker-profile-public.html | Öffentliches Worker-Profil |
| company_profile_public.html | Öffentliches Firmenprofil |

### 2.4 Dashboard / Commercial / Admin
| Datei | Bereich | Welle |
|---|---|---|
| executive_dashboard.html | Executive KPIs | 5/7 |
| pricing.html | Preisseite | 2 |
| enterprise.html | Enterprise-Landingpage | 2 |
| enterprise_anfrage.html | Enterprise-Anfrage | 2/9 |
| sla_abo.html | SLA-Abo | 2 |
| sla_angebote.html | SLA-Angebote | 2 |
| sla_hilfe.html | SLA-Hilfe | 2 |
| sla_nachweise.html | SLA-Nachweise | 2 |
| sla_profil.html | SLA-Profil | 2 |
| sla_search_jobs_list.html | SLA-Jobsuche | 2 |
| sla_search_job_detail.html | SLA-Job-Detail | 2 |
| bounties.html | Bounty-System | 8 |
| admin_panel.html | Admin-Panel | 7 |
| activity.html | Aktivitäts-Feed | 7 |
| internal_control_center.html | Internes CC | 7 |
| organization.html | Org-Verwaltung | 7 |
| integrations.html | Integrationen | 6 |
| sso_config.html | SSO-Konfiguration | 6 |
| about.html | Über TempConnect | 10 |
| hilfe.html | Hilfe | 10 |
| onboarding.html | Onboarding | 15 |
| agency_inbox.html | Agency-Posteingang | 4 |
| system-health.html | System-Status | 13 |
| whats-new.html | Neuigkeiten | 10 |

### 2.5 Duplikate / Hygiene-Risiko
| Datei | Problem | Priorität |
|---|---|---|
| api-docs.html + api_docs.html | **Duplikat** — zwei API-Docs-Seiten | P1 |
| staff_vanilla_backup_20260521/ | **Backup-Verzeichnis in public/** — nicht produktionsbereit | P1 |
| meine(agb).html (legal/) | **Sonderzeichen im Dateinamen** — Encoding-Risiko | P2 |

### 2.6 Subdirectory-Seiten
| Pfad | Datei |
|---|---|
| frontend/public/staff/ | staff.html |
| frontend/public/trust/ | compliance.html, platform-sla.html, security.html, status.html |
| frontend/public/legal/ | agb.html, datenschutz.html, impressum.html, kontakt.html, meine(agb).html, sla.html |

---

## 3. API-Routen-Übersicht

### 3.1 Auth / Identity
`auth.js`, `me.js`, `mfa.js`, `sso.js`, `csrf.js`

### 3.2 Worker / Einsatz
`workers.js`, `workerPortal.js`, `assignments.js`, `timesheets.js`, `timesheetTemplates.js`

### 3.3 Marketplace / Matching
`marketplace.js`, `matching.js`, `requests.js`, `requisitions.js`, `capacities.js`,
`capacityDiscovery.js`, `capacityExchange.js`, `listings.js`, `search.js`

### 3.4 Vendor / Spend / Commercial
`vendorPool.js`, `spendAnalytics.js`, `rateCards.js`, `payment.js`, `invoices.js`,
`credits.js`, `referralProgram.js`, `bounties.js`, `plans.js`, `publicPlans.js`,
`subscriptionRequests.js`, `subscriptionDocuments.js`, `strategicCollaboration.js`

### 3.5 Deals / Offers / Contracts
`deals` (via requests.js), `offerAssets.js`, `contracts.js`, `approvals.js`

### 3.6 Admin / Staff / Owner / Support
`admin.js`, `staffControlCenter.js`, `ownerControlCenter.js`, `orgControlCenter.js`,
`internalControlCenter.js`, `support.js`, `internal.js`

### 3.7 OCC (api/routes/occ/)
`audit.js`, `automation.js`, `bootstrap.js`, `dataExplorer.js`, `decisionsRequests.js`,
`executive.js`, `infrastructure.js`, `operations.js`, `platform.js`, `revenue.js`,
`risk.js`, `support.js`, `warp.js`, `_helpers.js`

### 3.8 Sonstige
`analytics.js`, `agencyPortal.js`, `companyProfile.js`, `complianceDocs.js`,
`dataGovernance.js`, `demo.js`, `emergency.js`, `geo.js`, `health.js`, `integrations.js`,
`mentoring.js`, `notifications.js`, `notificationStream.js`, `onboarding.js`,
`organizations.js`, `productReleases.js`, `proofs.js`, `ratings.js`, `reports.js`,
`reporting.js`, `reputation.js`, `settings.js`, `slaSearchJobs.js`, `smartPricing.js`,
`supplierPools.js`, `suppliers.js`, `workforce.js`, `preferredVendors.js`,
`activityFeed.js`

---

## 4. Middleware-Stack

| Datei | Funktion |
|---|---|
| auth.js | Session-Auth + JWT |
| rbac.js | Role-Based Access Control |
| orgBoundary.js | Org-Scope-Enforcement |
| orgContext.js | Org-Kontext-Injection |
| orgAccess.js | Org-Zugriffsprüfung |
| entitlementGuard.js | Plan/Feature-Gate |
| featureGate.js | Feature-Flag-Gate |
| apiKeyAuth.js | API-Key-Authentifizierung |
| staffControlAccess.js | Staff-CC-Zugang |
| ownerControlAccess.js | Owner-CC-Zugang |
| requireOwnerControlAccess.js | OCC-Middleware |
| supportAccess.js | Support-Zugang |
| internalAccess.js | Interner Zugang |
| idempotency.js | Idempotency-Key |
| rateLimit.js | Rate-Limiting |
| auditWrite.js | Audit-Log-Writer |
| demoGuard.js | Demo-Mode-Guard |
| validate.js | Zod-Validation-Helper |

---

## 5. Plan- und Feature-Quellen (Commercial Source of Truth)

| Datei | Inhalt |
|---|---|
| `api/config/planCatalog.js` | Plan-Definitionen, Limits, Preise, Addons |
| `api/config/planFeatures.js` | Feature-Matrix pro Plan, `hasFeature()`, MATURITY_GATES |
| `api/config/visibilityMatrix.js` | Hub-Card + Nav-Sichtbarkeit (org_type × role × plan × location) |
| `api/services/entitlementService.js` | `getOrganizationEntitlements()` — Runtime-Entitlement |
| `api/services/subscriptionRequestService.js` | Commercial Request-Lifecycle |
| `api/services/subscriptionLifecycleService.js` | Lifecycle-Crons (Approval, Cancellation) |

---

## 6. OCC-Status (Owner Control Center)

| Bereich | Status |
|---|---|
| Vite + React Shell | Phase 1 aufgebaut (`feat/occ-react-shell-claude`) |
| DB-Migration owner_access | ✅ `107_occ_owner_access.sql` vorhanden |
| DB-Migration Phase 3 | ✅ `108_occ_phase3_modules.sql` vorhanden |
| `requireOwnerControlAccess` Middleware | ✅ `api/middleware/requireOwnerControlAccess.js` |
| OCC-Routen (api/routes/occ/) | ✅ 14 Modul-Routen vorhanden |
| Frontend-Build (`frontend/owner-control/`) | Noch kein Dist-Build (gitignored) |
| Bootstrap-Endpunkt | ✅ `api/routes/occ/bootstrap.js` |
| `occ.html` in frontend/ | Zu prüfen |

---

## 7. SOC-Status (Support Operations Center)

| Bereich | Status |
|---|---|
| DB-Migrationen | ✅ 109 + 110 vorhanden |
| Routen | ✅ `api/routes/support.js` |
| Docs | ✅ `docs/support/` (4 MD-Dateien) |

---

## 7b. SCC-Status (Staff Control Center) — Stand 2026-05-27

| Bereich | Status |
|---|---|
| DB-Migrationen | ✅ 095+096 (Staff Identity), 118 (Hardening) |
| Backend: `api/routes/staffControlCenter.js` | ✅ Auth + Inbox + SubRequests + Bulk + Docs |
| Backend: `api/middleware/staffSecurity.js` | ✅ NEU (WAVE 03) — Origin-Guard, CacheControl, SecHeaders |
| Backend: `api/middleware/rateLimit.js` | ✅ `staffMutationLimiter` (WAVE 03) |
| Backend: `api/middleware/staffControlAccess.js` | ✅ requireStaff, requireStepUp, mfaGuard |
| Backend: `api/services/staffCombinedInboxService.js` | ✅ getInbox, getInboxItemDetail, getActiveStaffMembers |
| Frontend: React Shell (AppShell, Sidebar, Topbar) | ✅ WAVE 04 — Hash-Routing, ARIA, Module-Lazy-Loading |
| Frontend: State (ToastContext, StepUpContext, ConfirmContext) | ✅ WAVE 04 — kein window.confirm/alert |
| Frontend: CommercialInbox | ✅ WAVE 05 — Detail-Drawer, SLA, Preset-Filter, Assignee |
| Frontend: SubscriptionRequests | ✅ WAVE 06 — Plan-Farben, Pre-Activation-Guard, KB-Datum |
| Frontend: Build (`public/staff/assets/`) | ✅ 58 Modules, 0 Errors |
| SCC WAVEs 07–13 | ⏳ Geplant (Support/SOC, Operations, Risk, Audit, Tests, Release) |
| Nginx-VHost `staff.tempconnect.de` | ⚠️ OFFEN — P1.0 (Ops-Setup fehlt) |

---

## 8. Hygiene-Status

| Fund | Ort | Prio | Status |
|---|---|---|---|
| `.env` (echte Datei) | Repo-Root | **P0** | ⚠️ Enthält Secrets — Rotation ausstehend (P0.4) |
| `.env.local` (echte Datei) | Repo-Root | **P0** | ⚠️ Enthält Secrets |
| `.env.txt` | Repo-Root | P1 | In `.gitignore`? |
| `staff_vanilla_backup_20260521/` | frontend/public/ | P1 | ✅ ERLEDIGT 2026-05-24 — Verzeichnis gelöscht |
| `api-docs.html` + `api_docs.html` | frontend/public/ | P1 | Duplikat — OE-01 offen |
| `meine(agb).html` | frontend/public/legal/ | P2 | Sonderzeichen im Dateinamen |
| Migration 111 | sql/migrations/ | P2 | Lücke (110→112) |
| Migration 117 | sql/migrations/ | P2 | Lücke (116→118) — neu seit 2026-05-27 |

---

## 9. Test-Suite-Status

| Metrik | Stand 2026-05-24 | Stand 2026-05-27 |
|---|---|---|
| Testdateien gesamt | 160 | 166 |
| Testfälle gesamt | 3.754 → 3.836 | 3.836 |
| Failures | **0** | **0** |
| Neue Testdateien | — | staffSecurity.test.js (21), staffSubscriptionRequests.routes.test.js, security/adminRoutes.test.js, security/rateLimitCoverage.test.js, security/surfaceIsolation.test.js, security/coreFlowCrossTenant.test.js |
| FEATURE_GATE_BYPASS | `true` in Docker | `false` in .env.example ✅, Docker-Volume prüfen |

---

## 10. Bekannte offene P0/P1-Punkte (aus PILOT_GO_LIVE_TODOS.md)

| ID | Titel | Prio | Aufwand |
|---|---|---|---|
| P0.1 | Lint-Errors in enterpriseFormReuse.test.js | P0 | 15 Min |
| P0.2 | Audit-Gate: POST /analytics/track-public | P0 | 5 Min |
| P0.3 | Prometheus-Platzhalter-Secret | P0 | 30 Min |
| P1.0 | Staff CC produktiv schalten (Nginx, ENV) | P1 | 0,5–1 Tag |
| P1.1 | SSO: @node-saml nicht in package.json | P1 | 0,5 Tag |
| P1.2 | E2E-Smoketests ausbauen | P1 | 1–1,5 Tage |
| P1.3 | FEATURE_GATE_BYPASS=true Default umkehren | P1 | 20 Min |
| P1.4 | Backup/Restore Dry-Run | P1 | 2 Stunden |
| P1.5 | OpenAPI spec.json Drift | P1 | 2–3 Stunden |
