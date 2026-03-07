# TempConnect VMS – Roadmap & Status

## Vision
TempConnect als vollständiges Enterprise Vendor Management System (VMS) für die Zeitarbeitsbranche: Requisition-Lifecycle, Multi-Org, RBAC, Vendor Pool, Compliance, Matching Engine, Executive Reporting.

## Implementierte Module (v2.0)

### Phase 1: Platform Audit
- `docs/PLATFORM_AUDIT.md` – Vollständige technische Bestandsaufnahme

### Phase 2: Datenbank-Erweiterung
- `sql/migrations/019_vms_enterprise.sql` – 10 neue Tabellen:
  - `organizations`, `org_locations`, `org_departments`, `org_memberships`
  - `vendor_pool`, `requisitions`, `requisition_events`, `requisition_candidates`
  - `approval_requests`, `compliance_documents`, `notifications`

### Phase 3: RBAC (Role-Based Access Control)
- `api/services/rbacService.js` – 8 Rollen, 30+ Permissions, Hierarchie
- `api/middleware/rbac.js` – requirePermission(), requireRole() Middleware

### Phase 4: Requisition Service
- `api/services/requisitionService.js` – CRUD, State Machine (9 Status), Event-Trail, Shortlist
- `api/routes/requisitions.js` – REST-API mit Zod-Validierung
- `api/services/stateMachine.js` – REQUISITION_TRANSITIONS ergänzt

### Phase 5: Vendor Pool
- `api/services/vendorPoolService.js` – Tier-Management (PREFERRED → BLOCKED), Stats
- `api/routes/vendorPool.js` – CRUD, Tier/Status-Änderung

### Phase 6: Compliance Documents
- `api/services/complianceDocService.js` – Upload, Verify, Reject, Ampellogik, Expiry-Batch

### Phase 7: Matching Engine
- `api/services/matchingEngine.js` – Konsolidiertes Multi-Faktor-Scoring (6 Faktoren, max 100 Punkte), Erklärbarkeit

### Phase 8: Reporting
- `api/services/reportingService.js` – KPIs, Timeline, Vendor Performance, SLA Report
- `api/routes/reporting.js` – 7 Endpunkte inkl. Executive Dashboard

### Phase 9-12: UI
- `frontend/public/executive_dashboard.html` – KPI-Kacheln, Balkendiagramm, SLA, Compliance-Bar
- `frontend/public/requisitions.html` – Liste/Filter, Create-Modal, Detail mit Status-Workflow
- `frontend/public/vendor_pool.html` – Tier-Stats, Liste, Inline-Tier-Änderung, Add-Modal
- `frontend/public/compliance_overview.html` – Statistik-Grid, Ampel, Upload-Modal

### Phase 13: Hub-Erweiterung
- `frontend/public/enterprise.html` – VMS Enterprise Sektion mit 4 Navigations-Karten

## Nächste Schritte (v2.1)
1. Compliance Documents REST-Router (eigener `/api/compliance-documents` Endpunkt)
2. Notifications UI + Real-Time (WebSocket/SSE)
3. Approval Workflow UI (Genehmigungs-Queue)
4. Matching Engine UI (Auto-Match per Button in Requisition-Detail)
5. Multi-Org Onboarding Wizard
6. Billing/Plans Integration für Enterprise-Tier
