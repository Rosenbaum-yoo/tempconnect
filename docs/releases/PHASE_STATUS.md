# TempConnect — Finalisierungs-Phasen Status
Letzte Aktualisierung: 2026-05-30 (Phase 4 Track A M-13 — Marketplace Visibility Center vollständig abgeschlossen ✅)
Quelle der Wahrheit: `finalization/` — dort liegen Wave-Dateien, Gates und Masterprompts.
Pflege-Regel: Eintrag auf `abgeschlossen` setzen sobald Wave-Abschluss bestätigt + Commit-Hash/Artefakt dokumentiert.

---

## Legende

| Status | Bedeutung |
|---|---|
| ✅ abgeschlossen | Gate-Kriterien erfüllt, Artefakt vorhanden |
| 🔄 in Arbeit | Session läuft, partieller Fortschritt |
| 🔲 offen | Noch nicht gestartet |
| ⛔ blockiert | Externes Dependency / Owner-Entscheidung nötig |

---

## Phase 1 — Fachlich-architektonisch (Marktstart-Pflicht)

| Welle | Inhalt | Status | Datum | Notiz |
|---|---|---|---|---|
| WAVE_00 | Baseline / Ist-Zustand | ✅ abgeschlossen | 2026-04 | Stack dokumentiert, Ist-Zustand klar |
| WAVE_01 | Release-Hygiene (Lint, CI, Secrets) | ✅ abgeschlossen | 2026-05-24 | P0.1-P0.5 erledigt, 0 Lint-Errors |
| WAVE_02 | Commercial Source of Truth | ✅ abgeschlossen | 2026-04 | `planCatalog.js` + 5 kanonische Pläne + Tier V2 |
| WAVE_03 | Rollen / Sichtbarkeit | ✅ abgeschlossen | 2026-04 | Hub Visibility Matrix + RBAC vollständig |
| WAVE_04A | Core Business: Requisitions | ✅ abgeschlossen | 2026-05-24 | PARTIALLY_FILLED Status, Migration 113 |
| WAVE_04B | Core Business: Capacity Exchange | ✅ abgeschlossen | 2026-04 | Gegenseitenlogik + Hierarchical Ranking |
| WAVE_04C | Core Business: Deal Flow | ✅ abgeschlossen | 2026-04 | E2E Deal-Lifecycle, Dossier, Agreement-Docs |
| WAVE_04D | Core Business: Assignments | ✅ abgeschlossen | 2026-04 | Multi-Staffing, Kampagnen, Reservierungen |
| WAVE_04E | Core Business: Timesheets/Spend | ✅ abgeschlossen | 2026-04 | Statusmaschine 9-Stufen, Cross-Tenant-Tests |
| WAVE_04F | Core Business: Notifications | ✅ abgeschlossen | 2026-04 | Activity Center, Notification Matrix |
| WAVE_04G | Core Business: Workers | ✅ abgeschlossen | 2026-04 | Einsatzportal 7 Seiten + 403-Guard + Login |
| WAVE_04H | Core Business: Vendor Pool | ✅ abgeschlossen | 2026-04 | Rate Cards, Supplier Scorecard |
| WAVE_05 | KPI Dashboard / Executive Reporting | ✅ abgeschlossen | 2026-05-24 | 14/14 Tests, `KPI_SOURCE_OF_TRUTH.md` |
| WAVE_06 | Security Audit | ✅ abgeschlossen | 2026-05-24 | Rate Limits, Upload-Härtung, Admin-Guard |
| WAVE_07 | Admin Centers Surface Isolation | ✅ abgeschlossen | 2026-05-24 | 11/11 Tests, Surface-Isolation komplett |
| WAVE_08 | Bonus / Credits / Commercial Engine | ✅ abgeschlossen | 2026-05-28 | Subscription-Requests, Entitlement-Engine, Pricing-Renderer, planCatalog |
| WAVE_09 | Billing Lifecycle | ✅ abgeschlossen | 2026-05-28 | Trial-End, Grace, Hard-Lock, Migration 119 |
| WAVE_10 | Premium UX / Empty States | ✅ abgeschlossen | 2026-05-28 | Alle 15 SCC-Module haben Empty States |
| WAVE_11 | Database (Migrations) | ✅ abgeschlossen | 2026-05-28 | 119+ Migrationen, Recovery-Migrations vorhanden |
| WAVE_12 | QA / Tests | ✅ abgeschlossen | 2026-05-28 | CI `scc-build` Job, 3800+ Tests grün |
| WAVE_13 | Observability | ✅ abgeschlossen | 2026-05-28 | Sentry + Prometheus + Pino bestätigt |
| WAVE_14 | Legal / DSGVO | ✅ abgeschlossen | 2026-05-28 | TOMS, SUBPROCESSORS, AVV_TEMPLATE, noindex |
| WAVE_15 | Demo / Onboarding | ✅ abgeschlossen | 2026-05-28 | demo-sales.sql, SALES_DEMO_PATH.md |

**SPECIAL:**
| Datei | Status | Datum |
|---|---|---|
| SPECIAL_bugboard_triage.md | ✅ bereit | 2026-05 |
| SPECIAL_enterprise_pack.md | ✅ Enterprise Pack 1.0.0 | 2026-05-28 |
| SPECIAL_file_inventory.md | ✅ bereit | 2026-05 |
| 99_GOLIVE_GATE.md | 🔄 95% grün | — | P0.4 + G-01 + I-01 offen (Owner-Tasks) |

**Phase-1-Urteil: ✅ Alle Wellen abgeschlossen. Go-Live-Gate fast grün (3 Owner-Tasks offen).**

---

## Phase 2 — Release-Operativ (Marktstart-Pflicht)

| Welle/Gate | Inhalt | Status | Datum | Notiz |
|---|---|---|---|---|
| WAVE 00-15 | Release-Wellen | 🔄 in Vorbereitung | — | Basis aus Phase 1 gelegt |
| Gate A | Code-Qualität / CI grün | ✅ | 2026-05-28 | 0 Lint-Errors, 3800+ Tests grün |
| Gate B | Security / Secrets | 🔄 | — | P0.4 Secret-Rotation offen (Owner) |
| Gate C | Infrastruktur / DNS | ⛔ blockiert | — | G-01 Nginx VHost + TLS (Owner) |
| Gate D | Produkt / Feature-Vollständigkeit | ✅ | 2026-05-28 | Core-Flows abgedeckt |
| Gate E | Legal / DSGVO | 🔄 | — | G-COM-03 AVV offen (Owner) |
| Gate F | Ops-Readiness | ⛔ blockiert | — | I-01 Backup Dry-Run + E-01 E2E (Owner) |
| WAVE 16 | Burn-in (≥7 Tage Preprod stabil) | 🔲 offen | — | Erst nach Gate A-F grün |

**Phase-2-Urteil: ⛔ Blockiert durch Owner-Tasks (P0.4, G-01, G-COM-03, I-01, E-01).**

---

## Phase 3 — SCC + Hetzner (Marktstart-Pflicht: SCC-Gate)

| Welle | Inhalt | Status | Datum | Notiz |
|---|---|---|---|---|
| **Track A — SCC Profi-Level** | | | | |
| WAVE 00 | SCC Scope / Architektur | ✅ abgeschlossen | 2026-05-27 | Session + Router + Audit-Namespace |
| WAVE 01 | Staff Identity / Auth | ✅ abgeschlossen | 2026-05-27 | tc.staff.sid, Allowlist, Step-up |
| WAVE 02 | Step-up + Confirm-Reason | ✅ abgeschlossen | 2026-05-27 | staffMutationLimiter, staffSecurity.js |
| WAVE 03 | Security Middleware | ✅ abgeschlossen | 2026-05-27 | 21/21 Tests, Origin-Guard, CacheControl |
| WAVE 04 | Profi-UI Shell / Komponenten | ✅ abgeschlossen | 2026-05-27 | Toast/StepUp/Confirm Contexts, AppShell |
| WAVE 05 | Commercial Inbox Profi-Level | ✅ abgeschlossen | 2026-05-27 | Detail-Drawer, SLA-Zähler, Assignee |
| WAVE 06 | Subscription-Requests SCC | ✅ abgeschlossen | 2026-05-27 | Plan-Farb-Kodierung, Kündigungsdatum |
| WAVE 07 | Support / SOC | ✅ abgeschlossen | 2026-05-29 | `loadSupportSnapshot(pool)` mit echten DB-Queries (KPI, Eskalationen). 2 neue Routes: GET /support/cases + GET /support/cases/:id. Frontend: KPI-Karten, Eskalations-Tabelle, Cases-Liste mit Filter, Detail-Pane (Notes-Timeline + Eskalations-Info). TS 0 Errors. |
| WAVE 08 | Operations / Hetzner | ✅ abgeschlossen | 2026-05-29 | `loadOperationsSnapshot` + `infra_health` aus `infrastructure_snapshots` (DISTINCT ON host, Soft-Fail). `operations/index.tsx`: Infra-Health-Panel (CPU/RAM/Disk MiniBar + Schwellwert-Farben, TLS/Backup/Docker), Runbook-Log unverändert. `hetzner/index.tsx`: Mode-Badge (STUB/LIVE), Stub-Warning-Banner, Load-Balancers-Sektion, Toast-Feedback. TS 0 Errors. |
| WAVE 09 | Risk / Trust | ✅ abgeschlossen | 2026-05-29 | `loadRiskSnapshot` komplett: 4 KPI-Felder, dsgvo_recent[], compliance_expiring[], high_risk_audit[]. 2 neue Routes: GET /risk-trust/dsgvo-requests + GET /risk-trust/compliance-docs. Frontend: 4 KPI-Karten + Trust-Score, DSGVO-Tabelle (Alters-Ton), Compliance-Tabelle (Ablauf-Ton), High-Risk-Audit-Timeline. Drill-Down per „Alle laden"-Button. TS 0 Errors. |
| WAVE 10 | Audit / Decisions | ✅ abgeschlossen | 2026-05-29 | `audit-decisions/index.tsx` komplett neu: 4 KPI-Karten, Entscheidungsregister-Tabelle (letzte 50) mit Revert-Button, Inline-Formular „Neue Entscheidung" (Step-up + Confirm), Audit-Feed (letzte 50). Neuer Backend-Endpunkt `PATCH /audit-decisions/:id/revert` (Step-up + Confirm + Reason, Soft-Checks reversible/not-reverted). TS 0 Errors. |
| WAVE 11 | Data Explorer | ✅ abgeschlossen | 2026-05-29 | `data-explorer/index.tsx` komplett neu: View-Karten (statt Tabelle), aktive View highlighted, Ergebnis als echte Tabelle (Spalten auto-detect aus rows[0]), Zell-Rendering (ISO-Datum→de-DE, null→"–", Truncate 80 Zeichen), Zeilen-Count-Badge, Schließen-Button, Empty-State, Security-Notice. TS 0 Errors. Kein Backend-Eingriff nötig. |
| WAVE 12 | Tests | ✅ abgeschlossen | 2026-05-29 | Neue Testdatei `api/test/staffControlService.test.js`: 46 Tests, 0 Failures. Abdeckung: loadExecutiveSnapshot (soft-fail, platform_status, customer_requests.open), loadRiskSnapshot (kpi-Keys, KPI-Counts, dsgvo_recent, soft-fail), loadSupportSnapshot (impersonation.allowed=false, kpi, escalations), loadOperationsSnapshot (infra_health, runbook_runs, soft-fail), loadAuditDecisionsSnapshot (shape, soft-fail), loadPlatformSnapshot, loadRevenueSnapshot, listDataExplorerViews (4 Views + Keys), runDataExplorerView (VIEW_NOT_FOUND, rows, soft-fail), writeStaffAudit (Pflichtfelder, INSERT-params, Rückgabe), listStaffAudit (WHERE-Bau, Limit-Clamp), auditContextFromReq (xff, UA, stepUpAt). |
| WAVE 13 | Release / Dokumentation | ✅ abgeschlossen | 2026-05-29 | `docs/releases/SCC_RELEASE.md` erstellt: Sicherheitsarchitektur, alle 15 Frontend-Module, 40+ Backend-Endpunkte, DB-Tabellen, Test-Coverage, bekannte Einschränkungen, WAVE-Zusammenfassung. |
| **Track B — Hetzner** | | | | |
| H0 | Hetzner-Zugriff / Stub | ✅ abgeschlossen | 2026-05-27 | Stub-Mode aktiv, Whitelist implementiert |
| H1-H7 | Hetzner Live-Ops | ⛔ blockiert | — | HETZNER_CLOUD_TOKEN fehlt (Owner) |
| H8 | Hetzner-Gate | ⛔ blockiert | — | abhängig von H1-H7 |

**Phase-3-Urteil: ✅ SCC 13/13 Wellen abgeschlossen (2026-05-29). Einziger offener Blocker: Hetzner Cloud Token (Owner-Task O-06) für Live-Mode. Alle anderen SCC-Features produktionsbereit.**

---

## Phase 4 — Vertikale Strecken (Teilweise Marktstart-Pflicht)

> **Ordner:** `finalization/phase 4/`
> **Masterprompts:** `finalization/phase 4/MASTERPROMPTS.md`
> **Pflicht für Marktstart:** Track B (Einsatzportal) + Track C (Terminologie, oder bewusst Post-Launch)
> **Optional:** Track A (Marketplace) — Post-Launch Premium-Feature empfohlen

### Track A — Marketplace Visibility Center (Optional / Post-Launch)

Neue Feature-Strecke. Premium für PRO/INDIVIDUELL. 13 Wellen (M-00 bis M-13).

| Welle | Inhalt | Status | Notiz |
|---|---|---|---|
| M-00 | Read-only Audit | ✅ abgeschlossen | 2026-05-30 — `docs/MARKETPLACE_VISIBILITY_CENTER.md` erstellt. Inventar: 5 Migrationen, 3 Services, 2 Route-Dateien, 2 Frontend-HTML-Dateien, 15 SCC-Module. reputationService.js weiter als erwartet (Scoring-Logik komplett). |
| M-01 | Feature-Gates erweitern | ✅ abgeschlossen | 2026-05-30 — 8 neue Marketplace-Keys in planFeatures.js + 2 MATURITY_GATES (marketplace_featured_profile, profile_bounties). 83/83 Tests grün. |
| M-02 | Datenmodell (8 Tabellen) | ✅ abgeschlossen | 2026-05-30 — `120_marketplace_visibility_center.sql`: profile_visibility_settings, profile_view_events, profile_likes, profile_favorites, profile_ranking_snapshots, profile_review_moderation, profile_bounties, profile_abuse_reports. IP/UA nur als SHA-256-Hash. Self-Like-DB-Constraint. |
| M-03 | Backend Services (4 Services) | ✅ abgeschlossen | 2026-05-30 — profileVisibilityService.js (Zustandsmaschine 6 Status, Staff-Aktionen), profileAnalyticsService.js (SHA-256-Hashing, Like/Favorite-CRUD, Analytics-Aggregation), profileRankingService.js (Snapshots, Daily-Batch, Ranking-Positionen, Public-Ranking), profileBountyService.js (Lifecycle draft→active, Staff-Step-up-Pflicht, Cron-Expire). 0 Syntax-Fehler. |
| M-04 | Backend Routes (4 Router) | ✅ abgeschlossen | 2026-05-30 — profileVisibility.js (10 Endpoints: settings, opt-in, submit, pause, public/:orgId, like, unlike, favorite, unfavorite, favorites), profileAnalytics.js (3 Endpoints: events, me, me/advanced), profileRankings.js (2 Endpoints: rankings, rankings/me), profileBounties.js (4 Endpoints: me GET/POST, submit, delete). app.js registriert. Alle Syntax-Checks grün. |
| M-04-Tests | Service + Route Tests | ✅ abgeschlossen | 2026-05-30 — `test/marketplaceVisibility.test.js`: 52 Tests, 9 Suites. Zustandsmaschinen (12+11), SHA-256-Sicherheit (6), SQL-Parameter-Checks (11), Zero-State (6), planFeatures Cross-Check (7). 0 Failures. |
| M-05 | Bewertungssystem härten | ✅ abgeschlossen | 2026-05-30 — ratingService.js erweitert: submitRatingModerated() (atomic: Rating + Moderations-Eintrag), getPublicRatings() (nur approved), approveRating/rejectRating/flagRating() (Staff), getPendingModerationQueue(). Alle neuen Exports rückwärtskompatibel. |
| M-06 | SCC-Modul marketplace-visibility | ✅ abgeschlossen | 2026-05-30 — `frontend/src/staff/modules/marketplace-visibility/index.tsx`: 4 Tabs (Übersicht/KPI-Karten, Anfragen/approve+reject+suspend, Review-Queue/approve+reject, Bounties/approve+activate+reject). Sidebar.tsx + AppShell.tsx registriert. TS 0 Errors, Vite Build OK. |
| M-07 | Staff Backend Routes | ✅ abgeschlossen | 2026-05-30 — staffControlCenter.js: 12 neue Endpoints (snapshot, pending, approve/reject/suspend, moderation-queue, ratings approve/reject, bounties approve/activate/reject). Alle mit requireStaff + requireStepUp/High + requireConfirmAndReason + writeStaffAudit. Syntax OK. |
| M-08 | Public Profil aufwerten | ✅ abgeschlossen | 2026-05-30 — `company_profile_public.html`: CSS-Badges (pp-marketplace-badge, pp-featured-badge), HTML-Badge-Area, fireAnalyticsView() (POST /api/profile-analytics/events, fire-and-forget, soft-fail), loadVisibilityBadge() (GET /api/profile-visibility/public/:userId, zeigt "Im Marketplace gelistet"-Badge, Featured-Badge für Future-State). JS Syntax OK. |
| M-09 | Kunden-Dashboard Profilreichweite | ✅ abgeschlossen | 2026-05-30 — `sla_profil.html`: sec-profilreichweite (CSS ep-kpi-card), KPIs (views_7d/30d/likes_count aus /api/profile-analytics/me), Ranking-Row (/api/profile-rankings/me), Sichtbarkeits-Hinweis (/api/profile-visibility/settings). Soft-gated: Section bleibt versteckt wenn 403 (Nicht-PRO-Plan). JS Syntax OK. |
| M-10 | Bounty / Promotion-System | ✅ abgeschlossen | 2026-05-30 — `sla_profil.html`: sec-promotions (Bounty-Verwaltungs-UI, Coming-Soon-Default, promoCancel(), CSRF-gesichertes Create via POST /api/profile-bounties/me). Backend maturity-gate aktiv (profile_bounties=false → Coming-Soon-Banner). JS-Syntax OK. |
| M-11 | Missbrauchsschutz | ✅ abgeschlossen | 2026-05-30 — profileVisibilityService.js: reportProfileAbuse/getPendingAbuseReports/resolveAbuseReport. Route POST /profile-visibility/:orgId/report (Zod-validated, Self-Report-Guard, Audit). SCC staffControlCenter.js: 3 neue Endpoints (GET abuse-reports, POST resolve/dismiss) mit requireStepUp + requireConfirmAndReason + writeStaffAudit. AbuseReportsTab in marketplace-visibility/index.tsx. UNIQUE(reported_org_id, reporter_user_id) idempotent. |
| M-12 | Audit / Observability / Tests | ✅ abgeschlossen | 2026-05-30 — test/marketplaceVisibility.test.js: 9 neue M-11-Tests in 3 Suites (reportProfileAbuse Validierungen, resolveAbuseReport Validierungen, getPendingAbuseReports Zero-State). Gesamt: 61/61 Tests grün, 0 Failures, 12 Suites. |
| M-13 | Dokumentation + Go-Live | ✅ abgeschlossen | 2026-05-30 — docs/MARKETPLACE_VISIBILITY_CENTER.md + docs/releases/PHASE_STATUS.md: M-10–M-13 auf ✅ gesetzt. Track A vollständig: M-00–M-13 alle 14 Wellen abgeschlossen. |

**Gate:** `finalization/phase 4/GATES.md` Track-A-Gate (18 Kriterien)
**Branch:** `release/enterprise-premium-market-ready` oder `feature/marketplace-visibility-center`

---

### Track B — Einsatzportal Enterprise-Reife 90% (Marktstart-Pflicht)

Finalisierung Einsatzportal von 68-72% auf 90%. 11 Wellen (EP-00 bis EP-10).

| Welle | Inhalt | Status | Notiz |
|---|---|---|---|
| EP-00 | Read-only Audit | ✅ abgeschlossen | 2026-05-29 — `docs/einsatzportal/EP_BASELINE.md` erstellt. 30 Backend-Routen inventarisiert, 5 stille Fehler, 2 Kern-Blocker (B-01 Stundenzettel, B-02 Cross-Org) dokumentiert. Reife-Ist: ~60% |
| EP-01 | Portal API / Shell / Error Handling | ✅ abgeschlossen | 2026-05-29 — 3 neue Module: portalApi.js (zentraler fetch/CSRF/Error-Mapping), portalShell.js (initShell, toast, showError, doLogout, unreadCount), portalStatus.js (Status-Maps). dashboard.html migriert. 5× console.error → sichtbare Fehlermeldung |
| EP-02 | Stundenzettel Native UI (KERN-Blocker!) | ✅ abgeschlossen | 2026-05-29 — einsatzportal-stundenzettel.html komplett neu geschrieben. Inline-Editor (#editorPanel), 9-Stufen-Status, Week-Picker, Prefill, DUPLICATE_WEEK-Handling. Kein Link zu worker-timesheet.html. B-01 gelöst. |
| EP-03 | Backend Hardening Submission Create | ✅ abgeschlossen | 2026-05-29 — createSubmissionSchema: org_id/supplier_org_id entfernt, worker_assignment_link_id required. Route: getWorkerAssignmentDetail leitet org-Kontext aus DB ab. 4 neue Sicherheitstests (A-D). B-02 geschlossen. |
| EP-04 | Einsätze / Plan | ✅ abgeschlossen | 2026-05-29 — einsatzportal-einsaetze.html + einsatzportal-plan.html auf portalApi/portalShell/portalStatus migriert. fetch/getCsrf/loadUnread/doLogout/esc entfernt. PortalApi.get/post für alle Datenzugriffe + Mutationen. |
| EP-05 | Notifications / Staffing / Choice Sets | ✅ abgeschlossen | 2026-05-29 — einsatzportal-benachrichtigungen.html auf portalApi/portalShell migriert. Promise.allSettled Soft-Fail, toast-Bridge (boolean→string), respondStaffingChoiceSet/Request/submitQuestion/Reminder/markRead/markAllRead/confirmAsg/declineAsg → PortalApi. getCsrf/fetch/API-const/doLogout/esc entfernt. 0 Legacy-Refs. |
| EP-06 | Profil / Dokumente / Nachweise | ✅ abgeschlossen | 2026-05-29 — einsatzportal-profil.html migriert. PortalApi.upload() für Datei-Uploads hinzugefügt. loadWorkerDocuments/saveProfile/deleteDocument/downloadDocument → PortalApi. getCsrf/fetch/API-const/loadUnread/doLogout entfernt. Pre-existing esc()-Bug behoben (war undefiniert). 'err' → 'error' Typo fix. |
| EP-07 | Kontakt & Hilfe | ✅ abgeschlossen | 2026-05-29 — einsatzportal-kontakt.html migriert. B-05 geschlossen: hardcoded "bis Freitag 18:00 Uhr" durch dynamischen `<span id="deadline-hint">` ersetzt (Fallback: "fristgerecht für die laufende Woche", überschreibbar via `me.timesheet_deadline_text`). getCsrf/fetch/API-const/loadUnread/doLogout/esc entfernt. |
| EP-08 | Dashboard | ✅ abgeschlossen | 2026-05-29 — einsatzportal-dashboard.html finalisiert. loadAssignments/loadSubmissions/loadDashboard → PortalApi. const API + lokale esc() entfernt (war partiell von EP-01 migriert). Alle 7 Portal-Pages jetzt vollständig auf shared modules. |
| EP-09 | E2E / Smoke / Negative Tests | ✅ abgeschlossen | 2026-05-29 — workerPortalSmoke.ep09.test.js: 7 AUTH (→401), 7 SMOKE (→200+Shape), 3 XORG (Worker B sieht keine Worker-A-Daten). Cross-Org-Pflicht erfüllt. |
| EP-10 | Accessibility / Mobile / Final Cleanup | ✅ abgeschlossen | 2026-05-29 — einsatzportal.css: :focus-visible, :focus:not(:focus-visible), .sr-only, prefers-reduced-motion. portalShell.js: _setupAccessibility() setzt aria-label auf ep-sidebar/ep-sidebar-nav/ep-bottom-nav/ep-bell + aria-hidden auf .ep-skel — deckt alle 7 Portal-Seiten automatisch ab. |

**Gate:** `finalization/phase 4/GATES.md` Track-B-Gate (20 Kriterien)
**Branch:** `release/enterprise-premium-market-ready`
**Aktueller Score:** ✅ **92%** — Ziel ≥90% erreicht. Alle EP-00–10 abgeschlossen (2026-05-29).

---

### Track C — Terminologie-Umbenennung (Marktstart-Pflicht oder Post-Launch)

Cross-cutting UI-Sprache. 13 Phasen (0-12). **Eigener Branch:** `feature/terminology-rename`.

| Phase | Inhalt | Status | Notiz |
|---|---|---|---|
| Phase 0 | Read-only Inventar → TERMINOLOGY_RENAME_AUDIT.md | ✅ abgeschlossen | 2026-05-28 — `docs/product/TERMINOLOGY_RENAME_AUDIT.md` erstellt. 18 Dateien, 4 Begriffsgruppen, Owner-Review pending |
| Phase 1 | Begriffsleitfaden → TERMINOLOGY_GUIDE.md | ✅ abgeschlossen | 2026-05-29 — `docs/product/TERMINOLOGY_GUIDE.md` erstellt. Begriffsmatrix + Verbotsliste + `getTerminologyLabel()` API definiert |
| Phase 2 | Rollenabhängige UI-Labels | ✅ abgeschlossen | 2026-05-29 — `terminologyLabels.js` + `pageShell.js` Nav-Update + 4 Hauptseiten eingebunden. 14/14 Tests grün |
| Phase 3 | Unternehmensansicht überarbeiten | ✅ abgeschlossen | 2026-05-29 — enterprise.html, requisitions.html, requisitions.js, marketplace_demand_detail.html, demand_create.html. Alle "Bedarf/Bedarfe/Marktplatz"-Begriffe in Company-UI bereinigt |
| Phase 4 | Personaldienstleister-Ansicht | ✅ abgeschlossen | 2026-05-29 — capacity_exchange_feed.html (role-dynamic H1), capacity_exchange_manage.html, capacity_search.html, sla_angebote.html. "Kapazität/Kapazitaeten" → "Personal/Verfügbares Personal" für Agency. Auch: 3 malformed `backtick-n` script tags repariert |
| Phase 5 | "Marktplatz"-Begriff entschärfen | ✅ abgeschlossen | 2026-05-29 — breadcrumb.js (12 Einträge), footer.js, contextHints.js (7 Stellen), onboardingWizard.js, executiveDashboard.js, angebote_verwalten.html, capacity_exchange.html. "Marktplatz" → "Vermittlung" plattformweit in kunden-UI |
| Phase 6 | "Bedarf"-Begriff kontextualisieren | ✅ abgeschlossen | 2026-05-29 — pageShell.js Nav-Tooltips, capacityExchangeDetail.js (20+ Texte), marketplaceFeed.js (Demand-Badge, CTAs, Leer-Zustände) |
| Phase 7 | "Kapazität"-Begriff kontextualisieren | ✅ abgeschlossen | 2026-05-29 — activity.js, navConfig.js, executiveDashboard.js, workerSubmissionsReview.js, adminPanel.js + 18 HTML-Dateien (capacity_exchange_*.html, worker-submissions-review.html, hilfe.html, sla_hilfe.html, u.v.m.). api-docs.html + legal/*.html intentional (Fachterminus). |
| Phase 8 | Dashboards, KPI-Karten, Navigation | ✅ abgeschlossen | 2026-05-29 — executiveDashboard.js (KPI-Tooltips, Requisition→Arbeitsplatzangebot), hilfe.html + sla_hilfe.html (FAQ-Überschriften, Plan-Features, Links), trust/*.html (4 Nav-Links), pricing.html + sla_abo.html (Tabellen-Gruppen-Header, VP-Karten), organization.html, capacity_exchange_feed.html, marketplace_demand_list.html, supplier_scorecard.html, vendor_pool.html (Nav-Buttons + Body), about.html, enterprise_anfrage.html; JS: authIntent.js, contextHints.js, vendorPool.js (Kommentare) |
| Phase 9 | E-Mails, Notifications, Audit, Support | ✅ abgeschlossen | 2026-05-29 — activityFeedService.js (capacity.*-Labels), activityFeed.js (requisition_*+capacity_* Labels), integrationAdapters.js (7 Event-Titles), emailHtmlTemplates.js (Kapazitätskarten→Personalangebote), slaSearchService.js (E-Mail Betreff+Body), onboardingService.js (Onboarding-Schritt), marketplace.js (Notification+E-Mail-Texte), requests.js (E-Mail Betreff+Body), smartPricingService.js (supply-Label), planCatalog.js (11 Feature-Descriptions), adminControlCenterService.js (KPI-Label+Description), activity.js (Requisition-Labels+Kategorie), adminPanel.js (Backlog+Breakdown-Label), einsatzportal-benachrichtigungen.html (Bedarf→Arbeitsplatzangebot) |
| Phase 10 | Routen / Dateinamen / Kompatibilität | ✅ abgeschlossen | 2026-05-29 — activity.html (Filter-Button + Dropdown-Optionen: Requisitions→Arbeitsplatzangebote), alle href="#Marktplatz"-Anchor-IDs stabil, option-value-Attribute unverändert, data-cat-Keys unverändert. api-docs.html + legal/*.html intentional (Fachterminus). Keine Route-Umbenennung, keine DB-Änderungen. |
| Phase 11 | Tests und Regression | ✅ abgeschlossen | 2026-05-29 — 3979 Tests, 0 Failures. 2 pre-existierende Failures in subscriptionLifecycle.test.js behoben (leadRow.selected_addons enthielt "sso" mit coming_soon:true → auf "spend" geaendert). Keine Track-C-bedingten Regressionen. |
| Phase 12 | Dokumentation | ✅ abgeschlossen | 2026-05-29 — TERMINOLOGY_GUIDE.md Phasen-Fortschritt komplett aktualisiert. TERMINOLOGY_RENAME_AUDIT.md mit Track-C-Abschlussstatus ergänzt. PHASE_STATUS.md finale Eintragung. Track C vollständig. |

**Gate:** `finalization/phase 4/GATES.md` Track-C-Gate (10 Kriterien)
**Branch:** `feature/terminology-rename` (eigener Branch — Cross-Cutting)
**WICHTIG:** Phase 0+1 zuerst, damit Track A neue Strings schon Track-C-konform baut.

---

## Gesamtübersicht Enterprise Readiness Score

| Bereich | Score | Trend |
|---|---|---|
| RBAC / Org-Boundary | 95% | stabil |
| Hub Visibility Matrix | 95% | stabil |
| Reporting Scope-Härtung | 90% | ↑ |
| Audit Trail | 85% | ↑ |
| Soft-Fail / Zero-State | 90% | ↑ |
| Frontend Scope-Display | 90% | ↑ P2-A + P2-B abgeschlossen (2026-05-30) |
| Test-Suite | 95% | stabil |
| SCC (Phase 3) | 92% | ✅ 13/13 Wellen — nur Hetzner Live-Mode offen (Owner-Token) |
| OCC (Post Phase 4) | 90% | ✅ 11/11 Module live: Executive, Revenue, Operations, Decisions & Requests, Support Oversight, Audit, Platform, Infrastructure, Risk, Data Explorer, Automation-Runbooks. TS 0 Errors, Vite Build OK (2026-05-30). |
| Einsatzportal (Track B) | 92% | ✅ EP-00–10 alle abgeschlossen — Track B Gate-Reife erreicht |
| Terminologie (Track C) | 100% | ✅ alle 13 Phasen abgeschlossen |
| Marketplace (Track A) | 100% | ✅ M-00–M-13 vollständig abgeschlossen (2026-05-30) |
| **Gesamt** | **~95%** | ✅ OCC 11/11 Module vollständig (2026-05-30) |

**Ziel Marktstart (≥85%):** ✅ Basis-Score erreicht.
**Vollständiger Marktstart:** Track B + Track C Gate grün + Phase 2 Owner-Tasks erledigt.

---

## Empfohlene nächste Sessions

| # | Session | Track/Phase | Erwarteter Output | Branch |
|---|---|---|---|---|
| ✅ | P2-A: Spend Analytics Scope-Display | Verifikation + Test | Backend liefert `scope`+`generated_at`, Frontend `renderScopeBar` vollständig, 3 neue Scope-Tests (7/7 grün) | `release/enterprise-premium-market-ready` |
| ✅ | P2-C: OCC Phase 2 Backend + React Shell | OCC | `requireOwnerControlAccess` + Bootstrap + 11 Module, TS 0 Errors, 8/8 Tests | feat/occ-react-shell-claude |
| ✅ | P2-B: Vendor Pool + Rate Cards Scope | Scope-Display | Vendor Pool: Standort-Badge wenn Location aktiv. Rate Cards: Org-weit-Hinweis (Location-Header hat keinen Einfluss) | `release/enterprise-premium-market-ready` |
| ✅ | P2-D: Worker-Portal Abgrenzung | Track B | 8 Tests hubVisibility (hidden_worker-Suite) + 2 Tests orgAccess (Worker→403) — 42/42 grün | `release/enterprise-premium-market-ready` |
| ✅ | P3-B: OCC Module ausbauen | OCC | Revenue (KPI-Grid + Plan-Breakdown), Operations (Service-Status + Queue-Stats + System-Metriken), Decisions & Requests (Liste + Inline-Decide-Formular + CSRF). TS 0 Errors. | feat/occ-react-shell-claude |
| ✅ | P3-C: E2E-Tests kritische Flows | E2E | 2 neue Spec-Dateien: OCC Access Guards (401/403) + Executive Dashboard Flow (Hub→Dashboard, Location-Switch, 4 Org-Boundary-Tests). Syntax OK. | release/enterprise-premium-market-ready |
| ✅ | P3-D: SLA-Eskalations-Alerts | Backend+Frontend | alerts[] im reportingService, renderAlertBanner() + renderSla() Farbkodierung. 6 neue Tests, 31/31 gruen. | release/enterprise-premium-market-ready |
| ✅ | OCC Support + Audit Module | OCC | Support Oversight (KPI-Panel + Eskalations-Tabelle), Audit-Feed (Filterbar Area/Risk/Search, expandierbare Details). TS 0 Errors. | feat/occ-react-shell-claude |
| — | Phase 3 vollständig | SCC ✅ 13/13 | Nächster Track: Phase 4 Track A (Marketplace) oder Owner-Tasks (P0.4, G-01) | — |

**Regel:** Niemals zwei Tracks in derselben Session. Eine Welle pro Session.

---

## Abhängigkeiten (Cross-Cutting)

Detailliert in `finalization/phase 4/CROSS_CUTTING.md`.

| Element | Muss VOR ... | Wer |
|---|---|---|
| Track C Phase 0+1 | Track A (damit A Track-C-Sprache nutzt) | Track C |
| Phase 3 WAVE 04 | Track A M-06 (SCC-Modul) | Track A liest Phase 3 |
| Phase 1 WAVE_02 Commercial SoT | Track A M-01 | Track A erweitert additiv |
| Phase 4 komplett | Demo-Daten Re-Seed (WAVE_15) | Owner-Entscheidung |

---

## Owner-Aufgaben (nicht durch Claude lösbar)

| ID | Aufgabe | Priorität | Datei |
|---|---|---|---|
| O-01 | Secret-Rotation (SESSION_SECRET, DB, Stripe) | P0 | `docs/PILOT_GO_LIVE_TODOS.md` P0.4 |
| O-02 | Nginx VHost `staff.tempconnect.de` + TLS | P1 | `docs/PILOT_GO_LIVE_TODOS.md` P1.0 |
| O-03 | Backup Dry-Run dokumentieren | P1 | `docs/PILOT_GO_LIVE_TODOS.md` P1.4 |
| O-04 | E2E-Tests in CI integrieren | P1 | `docs/PILOT_GO_LIVE_TODOS.md` P1.2 |
| O-05 | AVV / Vertragstexte signiert | P1 | `docs/PILOT_GO_LIVE_TODOS.md` G-COM-03 |
| O-06 | Hetzner Cloud Token für SCC Live-Modus | P2 | Phase 3 Track B H1 |
| O-07 | Begriffsmatrix Track C freigeben | P2 | `finalization/phase 4/MANUAL_TASKS.md` |
| O-08 | Demo-Daten Re-Seed Timing festlegen | P3 | nach Phase 4 |

---

## Datei-Navigation

```
finalization/
├── PHASES.md                  ← Globaler Index (Lesereihenfolge)
├── README.md                  ← Phase 1 Index
├── 00_RULES.md               ← Gilt für ALLE Phasen
├── 99_GOLIVE_GATE.md         ← Phase 1 globales Gate
├── WAVE_00 ... WAVE_15       ← Phase 1 Wellen
├── phase2_release/           ← Phase 2
│   ├── MASTERPROMPT.md
│   ├── WAVES.md
│   └── GATES.md
├── phase3_scc/               ← Phase 3
│   ├── MASTERPROMPT.md
│   ├── TRACK_A_PROFI.md
│   └── TRACK_B_HETZNER.md
└── phase 4/                  ← Phase 4 (Ordnername mit Leerzeichen!)
    ├── README.md
    ├── MASTERPROMPTS.md      ← Start-Prompts A/B/C
    ├── TRACK_A_MARKETPLACE.md
    ├── TRACK_B_EINSATZPORTAL.md
    ├── TRACK_C_TERMINOLOGY.md
    ├── GATES.md
    ├── CROSS_CUTTING.md
    └── MANUAL_TASKS.md
```

**Hinweis:** Ordnername auf Disk: `phase 4/` (mit Leerzeichen). Beim Navigieren im Terminal: `"phase 4"` in Anführungszeichen verwenden.
