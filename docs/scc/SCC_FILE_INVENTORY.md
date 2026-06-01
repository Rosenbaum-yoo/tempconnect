# SCC File Inventory

> Vollständige Liste aller SCC-Dateien. Eingefroren mit WAVE 00 — 2026-05-27.

---

## Backend — Routes

| Datei | Zweck |
|---|---|
| `api/routes/staffControlCenter.js` | Haupt-SCC-Router + Auth-Router |

## Backend — Services

| Datei | Zweck |
|---|---|
| `api/services/staffControlService.js` | Executive, Platform, Support, Operations, Revenue, Risk, Audit, DataExplorer Snapshots |
| `api/services/staffAuditService.js` | `writeStaffAudit`, `listStaffAudit`, `auditContextFromReq` |
| `api/services/staffCombinedInboxService.js` | Combined Inbox: listCombinedInbox, runBulkAction, SOURCE_TYPES, BULK_OP |
| `api/services/staffCustomerRequestsService.js` | Customer Requests: list, get, addMessage, transitionStatus, assign, release |
| `api/services/staffSubscriptionRequestsService.js` | Subscription Inbox: listInbox, getInboxDetail, transitionStatus, approveRequest, rejectRequest, assignStaff, getInboxCounters |
| `api/services/staffHetznerService.js` | Hetzner Cloud Integration: getInfraOverview, runSafeAction, listSafeActions, HETZNER_MODE |
| `api/services/staffRunbookService.js` | Runbook-Verwaltung: listRunbooks, executeRunbook, ensureSeedRunbooks |

## Backend — Middleware

| Datei | Zweck |
|---|---|
| `api/middleware/staffControlAccess.js` | createStaffControlAccessMiddleware, createStaffStepUpMiddleware, requireConfirmAndReason |

## Backend — Verbundene Services (nicht SCC-exklusiv)

| Datei | Zweck | SCC-Nutzung |
|---|---|---|
| `api/services/subscriptionLifecycleService.js` | applyApprovedChange, freezeQuoteSnapshot, linkEnterpriseRequestToSubscription | activate, offer, strategic-convert |
| `api/services/subscriptionDocumentService.js` | listForRequest, generateDocument, ensureDocumentForRequest, getDocument, markDownloaded | Dokument-Download |
| `api/services/subscriptionRequestService.js` | REQUEST_TYPES, STATUS, listAllowedNextStatuses, canBypassStaffApproval | Meta-Endpunkte |
| `api/services/subscriptionNotificationService.js` | notifyRequestStatusChanged, notifyActivationFailed | Notification-Hook |
| `api/middleware/requireMfa.js` | requireMfa({ enforce: false }) | Mutierende Endpoints |
| `api/utils/transaction.js` | withTransaction | Offer-Endpunkt |
| `api/utils/orgContext.js` | withStaffContext | req.withStaffContext |

## Datenbank — Migrations

| Migration | Inhalt |
|---|---|
| `sql/migrations/095_staff_control_center.sql` | `tempconnect_staff`, `staff_control_audit_log`, `staff_control_decisions`, `staff_control_feature_flags` |
| `sql/migrations/096_staff_customer_requests.sql` | `staff_customer_requests`, `staff_customer_request_messages` |

## Frontend — React-App

| Pfad | Zweck |
|---|---|
| `frontend/src/staff/` | SCC React-App (Vite) |
| `frontend/staff.html` | Vite Entry HTML |
| `frontend/vite.config.staff.ts` | Vite-Config für SCC-Build |
| `frontend/public/staff/staff.html` | Deployed SCC-Shell |

## Dokumentation

| Datei | Zweck |
|---|---|
| `docs/STAFF_CONTROL_CENTER.md` | Bestehende SCC-Doku |
| `docs/scc/SCC_PRODUCT_SCOPE.md` | WAVE 00 — Scope |
| `docs/scc/SCC_FILE_INVENTORY.md` | WAVE 00 — Dateien (diese Datei) |
| `docs/scc/SCC_API_SURFACE.md` | WAVE 00 — API-Oberfläche |
| `docs/scc/SCC_MODULE_OWNERSHIP.md` | WAVE 00 — Rollen + Ownership |

## Tests

| Datei | Zweck |
|---|---|
| `api/test/staffControlCenter.test.js` | SCC-Haupttests |
| `api/test/staffCombinedInbox.test.js` | Combined Inbox Tests |
| `api/test/staffSubscriptionRequests.routes.test.js` | Subscription Requests Route Tests |
| `api/test/security/support-occ-boundaries.test.js` | Boundary Tests: Support vs. OCC vs. SCC |

---

## P0-Flag (WAVE H1 — dringend)

**Datei:** `api/services/staffHetznerService.js`, Zeile 101

```javascript
// AKTUELL (UNSICHER):
if (HETZNER_MODE === "stub") return { stub: true, action: actionKey, params, result: { status: "stubbed-ok" } };
```

In **Production ohne `HETZNER_CLOUD_TOKEN`** gilt `HETZNER_MODE === "stub"`.
Das bedeutet: mutierende Hetzner-Aktionen (Reboot, Snapshot, Backup) geben `stubbed-ok` zurück
**ohne echte Ablehnung**. Production täuscht Erfolg vor.

**Fix in WAVE H1:** Mutationen ohne Token → `503 HETZNER_NOT_CONFIGURED` in Production.

---

*SCC WAVE 00 — Phase 3 — 2026-05-27*
