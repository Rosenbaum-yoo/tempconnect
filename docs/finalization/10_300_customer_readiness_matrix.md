# 10-300 Customer Readiness Matrix

> Phase 5 / Phase A — Reifeprüfung (read-only). Stand: 2026-05-31. Branch: release/enterprise-premium-market-ready.
> Grundlage: echte Repo-Inspektion (Routes, Services, Middleware, Migrationen bis 120, package.json, config/index.js). Keine erfundenen Strukturen.
> Legende Ist-Zustand: **stabil** = produktiv & getestet · **teilweise** = vorhanden, Phase-5-Ziel nicht voll erreicht · **fehlt** = Neubau nötig.

> **Status-Delta 2026-06-03** (Snapshot oben bleibt als Phase-A-Stand erhalten; Detail im `finalization_worklog.md` + `final_acceptance_report_*`):
> - **Billing/Stripe (D):** Provider-Abstraktion (`BILLING_PROVIDER`) + Webhook-Härtung + SCC-Billing-Sicht + Dunning-Observability (Inkasso-Worklist, `payment_failed`-Naht) **gebaut**. Sichtbarkeits-Hälfte geschlossen. Offen bleibt nur echte Keys/Price-IDs + Lifecycle-Reaktivierung (Owner, R1/R2).
> - **Email (E):** `emailProviderService` (console/smtp/sendgrid/disabled, KEINE neue Dependency) + provider-fähiger `emailService` + System-Health/SCC-Mail-Sicht **gebaut**. Offen nur echte Keys (Owner, R3).
> - **Theme-System (J):** war „fehlt" → `ultra_premium`-Theme + Registry + Flag-Gating + SCC-Scope end-to-end (Tier-2-Flags→/bootstrap→Topbar-Cycle) **gebaut**. Offen: platform/worker_portal-Static-Page-Injektion + Theme-Control-Modul (owner-gated, R4).
> - **Monitoring/Incidents (I):** operativer Incident-Lebenszyklus **gebaut** — Mig **121** `ops_incidents` + Service + 5 SCC-Routen + Signals-Feed (R6). Offen nur Auto-Alert-Notify-Hook (Owner).
> - **Performance/Skalierung (Q) + Index-Review:** 4 Skalierungs-Achsen geschlossen (unbounded Listen→Pagination · N+1-Write→set-based/UNNEST · Cron-Sweep-Indizes Mig **122**+**123** · N+1-Read `loadRecentOpenCasesByOrg`). Siehe `open_risks` „Geschlossene Skalierungs-Achsen".
> - **Deployment/Backup (P):** Restore-Drill-Fidelity-Bug behoben (`restore-test.sh --single-transaction --exit-on-error`) + Infra-Snapshot-Severity-Matrix gepinnt (R8). Offen nur echter Infra-Drill (Owner).
> - **Provider-Env (R5):** `BILLING_PROVIDER`/`EMAIL_PROVIDER`/`SENDGRID_API_KEY`/`THEME_SWITCHER_ENABLED`/`ULTRA_PREMIUM_THEME_ENABLED` jetzt in allen 3 `.env*.example` + `envValidator` (Fail-Fast). Offen: INFRASTRUCTURE_PROVIDER/AI_OPS_ENABLED (erst bei Code-Verdrahtung).
> - **Höchste Migration:** 120 → **123**. **Alle Phase-5-Diffs uncommitted (Owner-Gate).**

| Bereich | Ist-Zustand | Bestehende Dateien (repräsentativ) | Ziel 10 | Ziel 50 | Ziel 100 | Ziel 300 | Risiko | Änderung (Phase) | Tests | Gate |
|---|---|---|---|---|---|---|---|---|---|---|
| Auth / Session | stabil | api/middleware/auth.js, services/authService.js, routes/auth.js, sso.js, mfa.js, totpService.js | ok | ok | ok | ok | niedrig | keine | vorhanden (authService.test) | 10 ✓ |
| RBAC / Rollen | stabil | middleware/rbac.js, services/rbacService.js, config/visibilityMatrix.js | ok | ok | ok | ok | niedrig | keine | visibilityMatrix.test (27) | 10 ✓ |
| Tenant-Isolation / Org-Scope | stabil | middleware/orgBoundary.js, orgContext.js, mig 031_rls_prep, 116_rls_deny_by_default | Cross-Org-Negativtests | RLS aktiv | ok | ok | mittel | Verifizieren (N) | tenant-Suite | 10 ✓ |
| Migrationen / DB-Schema | stabil | sql/migrations/*.sql (bis 120) | idempotent | ok | Index-Review | skalierbar | niedrig | Q (Index) | migration-Suite | 10 ✓ |
| Customer Lifecycle | teilweise | services/staffCustomerRequestsService.js, mig 067_customer_stage_segmentation, 104_subscription_lifecycle | Status-Modell vereinheitlichen | Filter/Risiko | Health Score | skalierbar | hoch | **B** | TODO | 10 |
| Commercial Desk / Indiv. Tarife | teilweise | routes/subscriptionRequests.js, mig 074_tariff_contract_model, 085_individuell_commercial_truth, services/contractService.js | Anfrage→Aktivierung | Limits/SLA | Auswertungen | ok | mittel | **C** | subscriptionRequests.routes.test | 10 |
| Billing / Stripe | teilweise | routes/payment.js (Checkout+Webhook), services/paymentService.js, invoiceService.js, mig 017/119_billing_lifecycle_wave09 | **Auto-Subscriptions+SEPA+Dunning+Billing-Portal+idemp. invoice.paid** | Status sauber | Auswertungen | robust | **hoch** | **D** | paymentService.test, payment.route.test | **10 (Blocker)** |
| Email / Notification | teilweise | services/emailService.js (nodemailer SMTP), emailTemplates.js, subscriptionNotificationService.js | console/SMTP ok | **EmailProvider-Abstraktion + SendGrid** | Bounces/Webhook | ok | mittel | **E** | subscriptionNotifications.test | 50 |
| SCC Adminzentrale | stabil | routes/staffControlCenter.js, middleware/staffControlAccess.js, staffSecurity.js, mig 095/118 | nutzbar | Staff-Prozesse | Audit stark | ok | niedrig | **F** (erweitern) | staff-Suiten | 10 ✓ |
| Hetzner Control | teilweise | services/staffHetznerService.js, warpExecutionService.js, infrastructureSnapshotService.js, config WARP_SSH | disabled/manuell | Status sichtbar | Runbooks | Kosten/Skalierung | mittel | **G** (Action-Gating verifizieren) | warpExecution-Tests | 50 |
| AI Operations / Claude Code | teilweise | services/warpExecutionService.js, staffRunbookService.js, routes/occ/warp.js, automation.js | disabled | — | **Unsafe-Prompt-Classifier + Review** | ok | mittel | **H** | TODO | 100 |
| Monitoring / Incidents / Health | teilweise | services/healthService.js, routes/health.js, @sentry/node, prom-client, mig 110_soc_phase3 | /health /ready | **Incident-Modell** | Fehlertrend/slow-Endpoints | ok | mittel | **I** | health-Tests | 10 (Basis) |
| Theme-System (3 Scopes) | **fehlt** | nur frontend/public/css/design-system.css (--ds-* Tokens) | — | **ThemeRegistry+3 Scopes+Switcher** | ok | ok | mittel | **J** (Neubau) | TODO | 50 |
| Plattformbereich | stabil | routes/marketplace.js, listings.js, requisitions.js, workforce.js | rollenklar | ok | ok | ok | niedrig | K (Politur) | route-Suiten | 10 ✓ |
| Einsatzportal | stabil | routes/workerPortal.js, services/workerService.js | worker-only | mobil | ok | Cross-Org-sicher | niedrig | L (Verify) | e2e workerPortal | 10 ✓ |
| Support / Tickets | teilweise | routes/support.js, middleware/supportAccess.js, mig 109_support_tickets, 110_soc_phase3_support | Prozess vorhanden | priorisierbar | SLA-Timer | ok | mittel | **M** (Verify Kunde-vs-Staff/SLA) | support-Tests | 10 |
| Security / Legal / Compliance | teilweise | helmet, routes/csrf.js, middleware/rateLimit.js, dataGovernance, mig 051/116 | Härtung ok | — | Audit stark | ok | mittel | **N** (+ Owner-Rechtstexte) | security-Suite | 10/50 |
| Tests / CI / QA | stabil | scripts/run-tests.js (suites), stryker, c8, supertest, perf-smoke, .github/workflows/ci.yml | grün | smoke | coverage | burn-in | niedrig | **O** | umfangreich (3900+) | 10 ✓ |
| Deployment / Backup / Rollback | teilweise | DEPLOYMENT.md (root) | dokumentiert | Jobs vorbereitet | Runbooks | **Restore-Drill** | mittel | **P** (Runbooks docs/operations/) | release-verify | 10/300 |
| Performance / Skalierung | teilweise | mig 004/032 perf_indexes, prom-client, perf:smoke, autocannon | ok | Pagination | Index/slow-Q | **300+ Listen** | mittel | **Q** | perf:smoke | 50/300 |
| Produktpolitur | laufend | div. frontend/public/*.html, design-system.css | — | — | — | Premium | niedrig | **R** | — | 300 |
| OCC (Owner Control) | stabil | routes/occ/*, middleware/ownerControlAccess.js, mig 107/108 | ok | ok | ok | ok | niedrig | keine | occAccess.test | 10 ✓ |
| OpenAPI / Doku | vorhanden | api/openapi/spec.json, api/docs/ENDPOINTS.md | aktuell | ok | ok | Enterprise-Pack | niedrig | R | — | 100 |
| Audit Trail | stabil | services/auditLog.js, staffAuditService.js, middleware/auditWrite.js, mig 046 | immutable | ok | ok | ok | niedrig | keine | audit-Suiten | 10 ✓ |
| Rate Limiting | stabil | middleware/rateLimit.js, config (granular: auth/api/occ/support/warp) | ok | ok | Tuning | ok | niedrig | Q (Tuning) | rateLimit-Tests | 10 ✓ |

## Kernbefunde Phase A

1. **Repo ist sehr reif.** 87 Routen, ~100 Services, 20 Middleware, 120 Migrationen, robuste Test-Infra (Suites, Mutation, Coverage, Perf). RBAC/Org-Boundary/Audit/OCC/SCC sind produktiv.
2. **Größte echte Lücke: Theme-System (Phase J)** — existiert nicht (nur `--ds-*` Tokens). Voller Neubau.
3. **Billing-Tiefe (Phase D) ist der Gate-10-Blocker.** Stripe-Checkout + Webhooks vorhanden, aber **nicht** das volle Auto-Billing-Modell (Subscriptions per Price-ID, Stripe Invoicing/Auto-Rechnung, SEPA Direct Debit, automatisches Dunning, Billing Portal, idempotente `invoice.paid`/`invoice.payment_failed`-Webhooks). Provider-Abstraktion (`BILLING_PROVIDER`) fehlt; aktuell `PAYMENT_MODE`-Modell.
4. **Email (Phase E): SMTP-only via nodemailer.** Keine `EmailProvider`-Abstraktion (console/smtp/sendgrid/disabled), kein `@sendgrid/mail`. Für Gate 10 reicht SMTP/console (vorhanden); SendGrid ist Gate-50-Ziel.
5. **Provider-Env-Modell der Phase 5 noch nicht adoptiert** (`BILLING_PROVIDER`, `EMAIL_PROVIDER`, `INFRASTRUCTURE_PROVIDER`, `AI_OPS_ENABLED`, `THEME_SWITCHER_ENABLED` fehlen in .env*.example).
6. **Owner-Blocker (extern):** Stripe Keys/Price-IDs/SEPA, SendGrid-Key+DNS, Hetzner-Token, finale Preise, Rechtstexte → siehe MANUAL_TASKS, open_risks_and_blockers.md.
