# TempConnect — Feature Index

> **Single Source of Truth** über alles, was TempConnect kann — für Vertrieb, Onboarding,
> Integrationspartner (SAP/HR) und Produkt. Nach jeder Feature-Implementierung aktualisieren.
> Template für Einzel-Doku: [`docs/FEATURE_DOCS_TEMPLATE.md`](FEATURE_DOCS_TEMPLATE.md)
>
> **Legende:** ✅ Live · 🚧 In Entwicklung / vorbereitet (feature-flagged) · 📋 Geplant
> **Quelle** verweist auf den maßgeblichen Code/Doku-Ort (Authority), nicht auf Marketing-Prosa.

Stand: 2026-06-24 · Plan-Stufen: `DEMO · BASIS · PLUS · PRO · INDIVIDUELL` (`api/config/planCatalog.js`, 36 `feature_key`)

---

## 1 · Marktplatz & Vermittlung (Model B)

| Status | Feature | Pläne | Quelle |
|---|---|---|---|
| ✅ | Live-Kapazitäten + Reservierungen (30-Min-Lock, Race-Schutz `SELECT FOR UPDATE`) | alle | `services/capacityExchangeService.js`, `routes/capacityExchange.js` |
| ✅ | Granulare Personalanfragen / Requisitions (Rolle/Region/Schicht/Rate) | alle | `services/requestService.js`, `routes/requisitions.js` |
| ✅ | Marktplatz-Feed (Angebot ↔ Nachfrage, Ranking, NEW/PREMIUM-Badges) | alle | `services/marketplaceService.js`, `routes/marketplace.js` |
| ✅ | Matching-Engine (Kapazität ↔ Bedarf) | PLUS+ | `services/matchingEngine.js` |
| ✅ | Angebots-Lifecycle (accept/counter/withdraw, Agreements) | alle | `services/marketplaceService.js`, `services/dealAgreementService.js` |
| ✅ | Deal-Abschluss beidseitig + Einsatzvereinbarung/Konditionsblatt (PDF) | alle | `services/agreementDocumentService.js` |
| ✅ | Suche (Tippfehler/Umlaut-tolerant, trgm/unaccent, Moderation) | alle | `services/searchService.js`, Mig 135–137 |
| ✅ | Marktplatz-Liquiditäts-Puls | alle | `frontend` Hub + `marketplaceService` |

## 2 · Notdienst / Emergency Staffing  ⭐ (strategischer Wedge)

| Status | Feature | Pläne | Quelle |
|---|---|---|---|
| ✅ | Notdienst-Anfragen + Eskalation (kapazitätsbasierte Sofort-Besetzung) | PLUS+ | `services/emergencyStaffingService.js`, `routes/emergency.js` |
| ✅ | Partial Commitments (Teil-Zusagen auf Notdienst-Bedarf) | PLUS+ | Mig 070, `emergencyStaffingService` |
| ✅ | Employment-Type `on_call` im Datenmodell | — | `workers`/`assignments` |

## 3 · Einsätze & Zeiten

| Status | Feature | Pläne | Quelle |
|---|---|---|---|
| ✅ | Multi-Staffing Assignments (Slots, Kampagnen, Invites, Reservations, Waitlist, Choice-Sets) | alle | `services/assignmentStaffingService.js`, `routes/assignments.js` |
| ✅ | Worker-Lifecycle + Profil-Hub + Dokumente (+ Ablauf-Steuerung) | alle | `services/workerService.js`, `routes/workers.js`, Mig 074–076 |
| ✅ | Stundenzettel / Timesheets (Tageseinträge, Submit/Approve/Reject/Sign, Batch) | alle | `services/workerSubmissionService.js`, `routes/timesheets.js` |
| ✅ | Timesheet-Templates + Customer-Flow + Sammelversand | PRO+ | `services/timesheetTemplateService.js` |
| ✅ | Worker-/Einsatzportal (eigene Einsätze, Stundenzettel, Verfügbarkeit) | — | `routes/workerPortal.js` |
| ✅ | Review-Worklist + Inline-Nächste-Aktion je Status | alle | `frontend/public/js/pages/workerSubmissionsReview.js` |

## 4 · Enterprise / VMS

| Status | Feature | Pläne | Quelle |
|---|---|---|---|
| ✅ | Vendor Pool + Supplier Scorecard (A/B/C, Fill-Rate, Pünktlichkeit) | INDIVIDUELL | `services/supplierPoolService.js`, `services/reputationService.js` |
| ✅ | Rate Cards (Konditionsrahmen, org-weit) | PRO+ | `routes/rateCards.js`, Mig 050 |
| ✅ | Spend Analytics (Scope-Display, Granularität, Quarterly) | PRO+ | `services/spendAnalyticsService.js` |
| ✅ | SLA-Tracking + Pulse-Timer + Auto-Eskalation (BREACHED) | PRO+ | `services/slaService.js`, `slaSearchService.js`, Mig 011/013 |
| ✅ | Executive Dashboard (KPIs, Scope-Bar, SLA-Alerts) | PRO+ | `services/reportingService.js`, `executive_dashboard.html` |
| ✅ | Trust Center / Compliance + Data-Governance (DSGVO) | alle | `services/complianceService.js`, `routes/dataGovernance.js`, Mig 051 |
| ✅ | Multi-Org + Org-Switcher (X-Org-Id, Plan-Gating org-spezifisch) | INDIVIDUELL | `me.js`, `orgControlCenter.js`, Mig 062 |

## 5 · Plattform-Steuerzentren

| Status | Feature | Zugang | Quelle |
|---|---|---|---|
| ✅ | OCC — Owner Control Center (React, 11 Module) | nur Owner | `frontend/src/owner-control/`, `routes/occ/*` |
| ✅ | SCC — Staff Control Center (Kundenanfragen-Inbox, Abos, Billing-Sicht) | Staff | `frontend/src/staff/`, `routes/staffControlCenter.js` |
| ✅ | SOC — Support Operations Center (+ externes/BPO-Support, verifiziert-gated) | Support/Vendor | `routes/support.js`, `middleware/supportAccess.js` |
| ✅ | Incident-Management (open/ack/resolve, Signals-Feed) | Staff | `services/staffIncidentService.js`, Mig 121 |
| ✅ | Externe-Support-Härtung (PII-Masking, IP-Allowlist, Kill-Switch, Watermark) | — | `supportVendorAdminService`, `support-access-cli` |

## 6 · Commercial / Billing

| Status | Feature | Pläne | Quelle |
|---|---|---|---|
| ✅ | Plan-Katalog + Entitlements + Plan-Locks (Upgrade-Pfade) | alle | `config/planCatalog.js`, `config/planFeatures.js`, `services/entitlementService.js` |
| ✅ | Subscription-Lifecycle (Trial → Grace 14d → Hard-Lock → DEMO) | alle | `services/subscriptionLifecycleService.js` |
| ✅ | Rechnungen + USt + PDF + Dokumenten-Tresor | alle | `services/invoiceService.js`, `invoicePdfService.js`, Mig 030/131 |
| ✅ | Provider-Abstraktion Billing (stripe/manual/disabled, manual-first) | — | `services/billingProviderService.js` |
| 🚧 | **Recurring Billing + Dunning (feature-flagged AUS, turn-key)** | alle | `services/recurringBillingService.js`, Mig 142 — Aktivierung = 3 Schritte (Runbook-Appendix) |

## 7 · Identität & Sicherheit

| Status | Feature | Quelle |
|---|---|---|
| ✅ | Auth + MFA/TOTP (Enforce als Config-Flip) | `routes/auth.js`, Mig 058/082 |
| ✅ | SSO SAML 2.0 (enforce + Break-Glass, auto-provision) | `services/ssoService.js`, Mig 055 |
| ✅ | RBAC / Permissions (zentrale Guards) + Org-Boundary + Deny-by-Default-RLS | `middleware/*`, Mig 116/126 |
| ✅ | Audit-Trail (jede Mutation: wer/was/warum) | `services/auditLog.js`, Mig 046 |
| ✅ | API-Keys + 13 Scopes (org-scoped) | `services/apiKeyService.js`, `middleware/apiKeyAuth.js`, Mig 049 |
| ✅ | API-Key-Scope-Enforcement auf allen Daten-Routen (105 Routen) | `routes/{timesheets,workers,assignments,requisitions,capacityExchange}.js` |

## 8 · Integrationen (SAP / HR-Add-on — Epic #32)

| Status | Feature | Quelle |
|---|---|---|
| ✅ | Outbound-Webhooks (Slack/Teams), HMAC-Signing, Retry/Dead-Letter, 25+ Events | `services/integrationService.js`, `integrationAdapters.js`, Mig 130 |
| ✅ | Inbound-REST-API (workers/timesheets/assignments/requisitions/invoices) + CSV-Export | `routes/*`, `services/*` |
| ✅ | OpenAPI 3.0.3 (24 Pfade, API-Key-Security + Scope-Hinweise) + `/api/docs` Swagger-UI | `openapi/registry.js`, `app.js` (`/api/docs`, `/api/openapi/spec.json`) |
| ✅ | `org_erp_mappings` — Konnektor-Registry (Org ↔ SAP/DATEV/zvoove/Personio-Mandant) + CRUD `/api/org/erp-mappings` | `services/erpMappingService.js`, `routes/integrations.js`, Mig 143 |
| 📋 | HR-Outbound-Events (`worker.*`, `*.exported`, Kostenstellen-Kontext) | geplant (Welle A.3b) |
| 📋 | SCIM 2.0 (`/scim/v2/Users`) + OIDC `client_credentials` (`/oauth/token`) | geplant (Welle B) |
| 📋 | DATEV-CSV (Lohn+Fibu) · SAP SuccessFactors-Feldmapping · zvoove | geplant (Welle C) |

## 9 · Engagement & Growth

| Status | Feature | Quelle |
|---|---|---|
| ✅ | Bewertungen (zweiseitig, staff-moderiert, Auto-Filter) | `services/ratingService.js`, `contentModerationService.js` |
| ✅ | Referral-Programm + Credits + Bounties/Tiers + Milestones | `services/{referralProgramService,bountyService,bountyTierService}.js` |
| ✅ | Notifications + Hub-Card-Glow + Surface-Map (einziges Badge-System) | `services/notificationMatrix.js`, `notificationSurfaceMap.js`, `hubCardBadges.js` |
| ✅ | Product Release Notes · Mentoring | `services/productReleaseService.js`, Mig 056/063 |
| ✅ | Onboarding-Wizard + Next-Best-Action + Context-Hints | `frontend` enterpriseHub, Mig 040/048 |

## 10 · Infra / Ops / Qualität

| Status | Feature | Quelle |
|---|---|---|
| ✅ | Externer Cron-Scheduler (`/internal/*`, secret/IP-gated) | `routes/internal.js`, `docs/SCHEDULER.md` |
| ✅ | Backup + Restore-Drill (single-transaction, CI-Job) | `scripts/restore-test.sh` |
| ✅ | Infrastruktur-Telemetrie (Hetzner CPU/RAM/Docker/TLS/Backup) | `services/infrastructureSnapshotService.js` |
| ✅ | Observability (Sentry · Prometheus · Pino) | `app.js`, `monitoring/` |
| ✅ | Product Analytics (Events, Sessions, Journeys, Rollups, BRIN) | `services/productAnalyticsService.js`, Mig 066–069/123 |
| ✅ | Test-Suite ~7.100 Tests · Coverage 79 % Lines / 87 % Funktionen (Gate 77/74/85/77) | `api/test/`, `api/.c8rc.json` |

---

## Pflege-Regel
Dieses File ist die kanonische Feature-Wahrheit. Bei jedem neuen Feature: Zeile ergänzen (Status/Pläne/Quelle),
und — wenn das Feature nicht-offensichtlich ist — eine Einzel-Doku unter `docs/features/<slug>.md` nach
[`FEATURE_DOCS_TEMPLATE.md`](FEATURE_DOCS_TEMPLATE.md) anlegen. Quelle muss auf real existierenden Code/Doku zeigen
(keine toten Links — vgl. §0.12 audit-feste Doku).
