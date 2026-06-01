# Staff Control Center — Release Notes
**Version:** Phase 3 Abschluss  
**Datum:** 2026-05-29  
**Branch:** `release/enterprise-premium-market-ready`  
**Status:** ✅ Produktionsbereit (außer Hetzner Live-Mode — Owner-Token fehlt)

---

## Übersicht

Das **Staff Control Center (SCC)** ist die interne Betriebs- und Steuerungsschicht von TempConnect.  
Es ist ausschließlich für verifizierten TempConnect-Staff erreichbar — strikt getrennt von der Plattform-Navigation, dem Admin Panel und dem Owner Control Center.

**Kernprinzipien:**
- Getrennte Session (`tc.staff.sid`) und Allowlist (`tempconnect_staff`-Tabelle)
- Jede mutierende Aktion: Step-up-Re-Auth + Confirm + Reason (min. 10 Zeichen) + serverseitiger Audit-Eintrag
- Kein Fake-Data, keine Demo-Karten — alle Daten aus echten DB-Abfragen, alle Tabellen soft-fail
- Origin Guard: POST/PUT/PATCH/DELETE in Production ohne gültigen Origin → 403

---

## Zugangspfade

| Bereich | Pfad |
|---|---|
| Frontend Shell | `/staff/` → `frontend/public/staff/index.html` |
| API (JSON) | `/staff/api/*` |
| Login | `POST /staff/api/auth/login` |
| Session Cookie | `tc.staff.sid` (Path: `/staff`, HttpOnly, SameSite=Strict) |
| Authentifizierungstabelle | `tempconnect_staff` (Allowlist, `is_active`-Flag) |

---

## Sicherheitsarchitektur

### Middleware-Stack (alle `/staff/api/*`-Routen)

```
createStaffOriginGuard       — Origin-Validierung gegen BASE_URL (Production: 403 bei falschem Origin)
staffApiCacheControl         — Cache-Control: no-store (verhindert Browser-Caching sensibler Daten)
staffSecurityHeaders         — X-Robots-Tag: noindex, X-Content-Type-Options, Referrer-Policy: no-referrer
createStaffControlAccessMiddleware — Session-Check + tempconnect_staff-Lookup (401/403 wenn nicht berechtigt)
```

### Step-up TTLs (risk-basiert)

| Risk-Level | Max-Alter | Fehler |
|---|---|---|
| `critical` | 5 Minuten | `SCC_STEP_UP_EXPIRED` |
| `high` | 10 Minuten | `SCC_STEP_UP_EXPIRED` |
| `medium` | 15 Minuten | `SCC_STEP_UP_REQUIRED` |

### Typed Confirmation

Critical und high Feature-Flags erfordern zusätzlich eine exakte Textbestätigung (z.B. `"READ ONLY ON"`).

### Audit-Namespace

Alle Staff-Aktionen schreiben in `staff_control_audit_log` (separater Namespace von `audit_log`).  
Pflichtfelder: `actorId`, `area`, `action`, `status`, `risk_level`, `confirmed`.

---

## Frontend-Module (15)

| Modul | Datei | Beschreibung |
|---|---|---|
| Executive | `modules/executive/` | Platform-KPIs: aktive Pläne, Pilot-Stats, offene Requests, Incidents |
| Platform | `modules/platform/` | Feature-Flags: Ein-/Ausschalten mit Typed-Confirmation für critical/high |
| Commercial Inbox | `modules/commercial-inbox/` | Unified Inbox: Customer Requests + Subscription Requests, Bulk-Aktionen |
| Customer Requests | `modules/customer-requests/` | Strategic Collaboration Requests — Detail, Nachrichten, Status-Transitions |
| Subscription Requests | `modules/subscription-requests/` | Subscription-Lifecycle: Approve, Reject, Activate, Offer, Dokumente |
| Support | `modules/support/` | KPI-Karten, offene Eskalationen (Snapshot), Cases-Liste (filterbar), Detail-Pane mit Notes-Timeline |
| Operations | `modules/operations/` | Infra-Health-Panel (CPU/RAM/Disk MiniBar, TLS/Backup/Docker), Runbook-Log |
| Hetzner | `modules/hetzner/` | Server-Liste + Load Balancer, Snapshot/Reboot (Stub-Mode solange kein Token) |
| Risk / Trust | `modules/risk-trust/` | 4 KPI-Karten, DSGVO-Requests, Compliance-Dokumente (Ablauf-Ton), High-Risk-Audit |
| Audit / Decisions | `modules/audit-decisions/` | Entscheidungsregister (Revert-Button), Neue Entscheidung (Step-up + Confirm), Audit-Feed |
| Audit Report | `modules/audit-report/` | Filterbarer Audit-Report über `staff_control_audit_log` (7 Filter) |
| Data Explorer | `modules/data-explorer/` | 4 vordefinierte Views, Ergebnis als echte Tabelle (Auto-Spalten) |
| Automation | `modules/automation/` | Runbook-Liste, Ausführung mit Step-up + Confirm + Dry-Run |
| Staff Access | `modules/staff-access/` | Staff-Mitgliederliste, Deaktivierung mit Reason + Audit |
| Revenue | `modules/revenue/` | Subscription-Verteilung nach Plan + Status |

---

## Backend-Endpunkte

### Auth (kein requireStaff)
```
POST /staff/api/auth/login    — Passwort-Auth, schreibt tc.staff.sid
POST /staff/api/auth/step-up  — Re-Auth (Passwort), setzt staffStepUpAt in Session
POST /staff/api/auth/logout   — Session destroy + Cookie löschen
```

### Read-only Snapshots
```
GET /staff/api/bootstrap               — Staff-Identity + Executive-Summary + Platform-Summary
GET /staff/api/executive               — loadExecutiveSnapshot (Pläne, Pilot, Requests, Incidents)
GET /staff/api/platform                — loadPlatformSnapshot (Feature-Flags)
GET /staff/api/support                 — loadSupportSnapshot (KPI, Eskalationen)
GET /staff/api/operations              — loadOperationsSnapshot (Infra-Health, Runbook-Runs)
GET /staff/api/hetzner                 — Hetzner-Übersicht (Stub/Live je nach Token)
GET /staff/api/revenue                 — loadRevenueSnapshot (Subscriptions)
GET /staff/api/risk-trust              — loadRiskSnapshot (DSGVO-KPI, Compliance, High-Risk-Audit)
GET /staff/api/audit-decisions         — loadAuditDecisionsSnapshot + listStaffAudit (filterbar)
GET /staff/api/audit                   — listStaffAudit (7 Filter: area/action/risk/actor/entity/since/until)
GET /staff/api/data-explorer           — listDataExplorerViews (4 Views)
GET /staff/api/data-explorer/:key      — runDataExplorerView
GET /staff/api/automation              — Runbook-Liste + Safe-Actions
```

### Support Drill-Downs
```
GET /staff/api/support/cases           — Cases-Liste (status/priority/case_type, Pagination)
GET /staff/api/support/cases/:id       — Case-Detail + Notes + Escalations
```

### Risk/Trust Drill-Downs
```
GET /staff/api/risk-trust/dsgvo-requests    — DSGVO-Requests (status-Filter, Pagination)
GET /staff/api/risk-trust/compliance-docs   — Compliance-Docs (expiring ≤30 Tage)
```

### Mutierende Aktionen (Step-up + Confirm + Reason)
```
POST   /staff/api/platform/feature-flags              — Feature-Flag togglen (critical: Typed-Confirm)
POST   /staff/api/hetzner/action                      — Hetzner-Aktion (High Step-up)
POST   /staff/api/automation/run                      — Runbook ausführen (High Step-up, Dry-Run)
POST   /staff/api/audit-decisions                     — Entscheidung erfassen
PATCH  /staff/api/audit-decisions/:id/revert          — Reversible Entscheidung zurücksetzen
PATCH  /staff/api/staff-access/:userId/deactivate     — Staff deaktivieren
```

### Commercial Inbox
```
GET    /staff/api/inbox                               — Unified Inbox (source_type/plan/email/u.v.m.)
POST   /staff/api/inbox/bulk                          — Bulk-Aktionen (assign/reject/to_under_review)
GET    /staff/api/inbox/meta                          — Enum-Werte für Filter
GET    /staff/api/inbox/:id                           — Inbox-Item-Detail
PATCH  /staff/api/inbox/:id/assign                    — Einzelzuweisung
GET    /staff/api/staff-members                       — Aktive Staff für Assignee-Dropdown
```

### Customer Requests
```
GET    /staff/api/customer-requests                   — Liste (status/assignee/unassigned)
GET    /staff/api/customer-requests/:id               — Detail
POST   /staff/api/customer-requests/:id/messages      — Nachricht / interne Notiz
POST   /staff/api/customer-requests/:id/transition    — Status-Transition
POST   /staff/api/customer-requests/:id/assign        — Zuweisung
POST   /staff/api/customer-requests/:id/release       — Zuweisung freigeben
```

### Subscription Requests
```
GET    /staff/api/subscription-requests               — Liste + Counters
GET    /staff/api/subscription-requests/:id           — Detail + allowed_next
POST   /staff/api/subscription-requests/:id/transition
POST   /staff/api/subscription-requests/:id/approve   — High Step-up
POST   /staff/api/subscription-requests/:id/reject
POST   /staff/api/subscription-requests/:id/activate  — High Step-up (applyApprovedChange)
POST   /staff/api/subscription-requests/:id/assign
POST   /staff/api/subscription-requests/:id/offer     — Quote-Snapshot + Dokument-Generierung
GET    /staff/api/subscription-requests/:id/documents
POST   /staff/api/subscription-requests/:id/documents
GET    /staff/api/subscription-documents/:id/download
POST   /staff/api/strategic-requests/:id/convert-to-subscription
```

---

## DB-Tabellen (SCC-Namespace)

| Tabelle | Beschreibung | Migration |
|---|---|---|
| `tempconnect_staff` | Staff-Allowlist (`user_id`, `is_active`, `role`) | Phase 3 WAVE 01 |
| `staff_control_feature_flags` | Platform Feature-Flags mit risk_level | Phase 3 WAVE 02 |
| `staff_control_runbook_runs` | Runbook-Ausführungsprotokoll | Phase 3 WAVE 00 |
| `staff_control_decisions` | Entscheidungsregister (reversible + reverted_at) | Phase 3 WAVE 00 |
| `staff_control_audit_log` | Staff-Namespace-Audit (separater Namespace) | Phase 3 WAVE 01 |
| `infrastructure_snapshots` | Infra-Health-Metriken pro Host | Migration 110 |
| `support_cases` | Support-Tickets | Migration 110 |
| `support_escalations` | Eskalations-Tracking | Migration 110 |
| `support_case_notes` | Fall-Notizen / Timeline | Migration 110 |
| `support_queues` | Routing-Queues | Migration 110 |
| `support_agents` | Agent-zu-User-Mapping | Migration 110 |
| `data_governance_requests` | DSGVO-Anfragen | Migration 051 |
| `compliance_documents` | Compliance-Docs (valid_until) | Migration 019 |

---

## Test-Coverage

| Testdatei | Tests | Bereich |
|---|---|---|
| `test/staffControlCenter.test.js` | 29 | Access-MW, Step-up TTLs, ConfirmAndReason, TypedConfirmation, Hetzner-Whitelist, Runbook-StepType, CustomerRequests |
| `test/staffSecurity.test.js` | 24 | CacheControl, SecurityHeaders, OriginGuard (Production/Dev/Edge-Cases) |
| `test/staffControlService.test.js` | 46 | Alle 8 Snapshot-Funktionen, writeStaffAudit, listStaffAudit (WHERE-Bau), auditContextFromReq |
| `test/staffCombinedInbox.test.js` | (existing) | Unified-Inbox-Logik, Bulk-Aktionen |
| `test/staffSubscriptionRequests.routes.test.js` | (existing) | Subscription-Lifecycle-Routen |

**Gesamt neu in Phase 3:** ~99 Tests, 0 Failures.

---

## Frontend Build

```
Verzeichnis:     frontend/src/staff/
Entry:           frontend/src/staff/main.tsx → /staff/app.js (Vite-Build)
TypeScript:      0 Errors (alle 15 Module)
CSS:             frontend/src/staff/styles/scc.css (CSS Custom Properties --scc-*)
Design Tokens:   --scc-bg, --scc-panel, --scc-panel-2, --scc-line, --scc-accent,
                 --scc-warn, --scc-danger, --scc-ok, --scc-critical, --scc-muted
State:           BootstrapContext, StepUpContext, ConfirmContext, ToastContext, NavContext
API Client:      sccApi.get/post/patch/del (BASE: /staff/api, credentials: include)
Query Hook:      useSccQuery<T>(path) — abort-controller, loading/error/reload
```

---

## Bekannte Einschränkungen / Owner-Tasks

| ID | Einschränkung | Auswirkung |
|---|---|---|
| O-06 | `HETZNER_CLOUD_TOKEN` fehlt | Hetzner-Modul läuft im Stub-Mode, H1-H7 blockiert |
| — | `infrastructure_snapshots` ohne externen Collector | Infra-Health-Panel zeigt Zero-State bis Collector aktiv |
| — | MFA-Middleware in `enforce: false` | TOTP-Zwang kann aktiviert werden wenn TOTP-Enrollment implementiert |
| — | DSGVO-Workflow read-only | SCC zeigt Requests, Mutations (Abschluss/Ablehnung) = Post-Launch-Feature |

---

## Phase 3 Wellen-Zusammenfassung

| WAVE | Inhalt | Key-Deliverable |
|---|---|---|
| 00 | Scope / Architektur | Router, Session-Namespace, DB-Tabellen |
| 01 | Staff Identity / Auth | tc.staff.sid, tempconnect_staff-Allowlist |
| 02 | Step-up + Confirm | staffMutationLimiter, risk-basierte TTLs, TypedConfirmation |
| 03 | Security Middleware | Origin Guard, CacheControl, SecurityHeaders — 21 Tests |
| 04 | Profi-UI Shell | StepUpContext, ConfirmContext, ToastContext, AppShell |
| 05 | Commercial Inbox | Unified Inbox, Bulk-Aktionen, Drawer, SLA-Zähler |
| 06 | Subscription Requests | Plan-Farb-Kodierung, Dokument-Generierung |
| 07 | Support / SOC | KPI, Eskalationen, Cases-Liste + Detail-Pane (Notes-Timeline) |
| 08 | Operations / Hetzner | Infra-Health-Panel (MiniBar), Load Balancers, Mode-Badge |
| 09 | Risk / Trust | DSGVO-KPI, Compliance-Ablauf-Ton, High-Risk-Audit, Drill-Downs |
| 10 | Audit / Decisions | Entscheidungsregister + Revert, Neue Entscheidung, Audit-Feed |
| 11 | Data Explorer | 4 Views, Ergebnis als echte Tabelle (Auto-Spalten), Empty-State |
| 12 | Tests | 46 neue Tests — staffControlService + staffAuditService vollständig |
| 13 | Release / Dokumentation | Diese Datei |
