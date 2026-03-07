# Reporting & Analytics Model

## Overview
TempConnect provides multi-level analytics: platform-wide admin metrics, per-organization executive dashboards, and supplier performance scorecards.

## Platform Metrics (Admin)
Endpoint: `GET /api/admin/metrics`
Service: `platformMetricsService.js`

Provides:
- Total organizations, users, active requisitions
- Deal volume and fill rates
- Queue health (BullMQ job counts)
- System uptime and version

## Executive Dashboard (Per-Org)
Endpoint: `GET /api/reporting/executive-dashboard`
Service: `reporting.js` route

Provides:
- Requisition pipeline by status
- Supplier performance rankings
- Fill rate trends
- Time-to-fill metrics
- Cost analysis (charge rates, markups)
- Compliance status summary

## Supplier Scorecard
Accessed via: `GET /api/suppliers/:id/profile`
Service: `supplierManagementService.js`

Provides per-supplier:
- Active deal count
- Historical fill rate
- Compliance document summary
- Performance score (0–100)
- Tier and relationship status

## Enterprise Analytics (ENTERPRISE plan)
Available feature keys: `enterprise_analytics`, `audit_traceability`

Additional capabilities:
- Audit trail queries (filtered by org, entity, actor, date range)
- Department-level cost allocation
- Multi-location staffing distribution
- Contract utilization rates
- Assignment lifecycle metrics

## Data Sources
All analytics are computed from live database queries (no pre-aggregation). Key tables:
- `requisitions` + `requisition_candidates` — pipeline and fill metrics
- `deal_requests` — deal volume and conversion
- `vendor_pool` — supplier performance
- `compliance_documents` — compliance rates
- `contracts` — contract utilization
- `assignments` — fulfillment tracking
- `audit_log` — activity analysis
