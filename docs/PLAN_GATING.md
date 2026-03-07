# Plan & Feature Gating

## Overview
TempConnect uses a plan-based feature gating system to control access to functionality by organization tier. This enables a freemium-to-enterprise upsell path.

## Plan Tiers (ascending)

1. **FREE** — basic marketplace access, legacy features
2. **BASIS** — extended marketplace with basic listing features
3. **PLUS** — SLA features, basic analytics, persistent requisitions, alerts
4. **NOTDIENST** — emergency/on-call staffing features (same as PLUS)
5. **PRO** — advanced matching, supplier ratings, deal workflow, premium visibility
6. **ENTERPRISE** — full VMS: approvals, departments, multi-location, supplier management, compliance, contracts, analytics, audit, settings, assignments

## Configuration
File: `api/config/planFeatures.js`

Exports:
- `PLAN` — enum of plan names
- `planFeatures` — maps feature keys → array of plan names that have access

## Feature Keys

### Legacy (FREE, BASIS)
- `legacy_access` — basic marketplace

### SLA (PLUS+)
- `sla_access`, `sla_offers_create`, `sla_help`, `sla_subscriptions`, `sla_profile`, `sla_proofs`

### PRO (PRO+)
- `advanced_matching` — geo-aware matching engine
- `supplier_ratings` — vendor performance scoring
- `deal_workflow` — structured deal negotiation
- `premium_visibility` — priority listing placement
- `basic_analytics` — standard reporting (also PLUS)
- `persistent_requisitions` — saved requisitions (also PLUS)
- `alerts` — notification alerts (also PLUS)

### ENTERPRISE
- `approval_workflows` — multi-step approval chains
- `departments` — departmental cost centers
- `multi_location` — multi-site management
- `supplier_management` — full supplier lifecycle
- `compliance` — document compliance tracking
- `contracts` — framework agreements
- `enterprise_analytics` — advanced reporting
- `audit_traceability` — full audit trail
- `org_settings` — organization configuration
- `assignments` — post-deal fulfillment tracking

## Usage in Code
Middleware checks the requesting user's organization plan against the feature key:

```js
// Example: gate an endpoint to ENTERPRISE only
if (!planFeatures.contracts.includes(org.plan)) {
  return res.status(403).json({ error: 'Plan upgrade required' });
}
```

## Adding New Features
1. Add the feature key to `planFeatures` with the allowed plans
2. Add gating check in the relevant route or middleware
3. Document the feature key in this file
