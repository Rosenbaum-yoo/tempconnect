# Supplier Management

## Overview
Buyer organizations manage their supplier relationships through a unified lifecycle: invitation → onboarding → active partnership → potential suspension. This is powered by the `vendor_pool` and `compliance_documents` tables plus the `supplierManagementService`.

## Vendor Pool (vendor_pool)
Tracks the buyer↔supplier relationship:
- `buyer_org_id` / `supplier_org_id` — the relationship parties
- `tier`: platinum, gold, silver, bronze, probation (5 tiers)
- `status`: invited → pending → approved → active → suspended
- `category_tags`: JSONB array of specialization tags
- `performance_score`: computed metric (0–100)
- `last_reviewed_at`: date of last performance review

## Supplier Lifecycle

```
invited → pending → approved → active ⇄ suspended
```

### Actions
- **Invite** (`POST /api/suppliers/invite`) — buyer invites a supplier org
- **Approve** (`POST /api/suppliers/:id/approve`) — accept into vendor pool
- **Suspend** (`POST /api/suppliers/:id/suspend`) — temporarily disable with reason
- **Reactivate** — move from suspended back to active

## Compliance Documents
Each supplier must maintain required documents (certifications, insurance, tax clearances):
- `status`: valid (green), expiring_soon (yellow), expired (red), missing (gray)
- `expires_at`: tracked for proactive alerts
- Traffic-light dashboard for quick compliance overview

## Metrics & Scoring
`supplierManagementService.getSupplierProfile()` returns:
- Active deal count
- Average fill rate
- Compliance document status summary
- Overall performance score
- Tier and relationship metadata

## API Endpoints
- `GET /api/suppliers` — list managed suppliers (scoped to buyer org)
- `POST /api/suppliers/invite` — invite new supplier
- `POST /api/suppliers/:id/approve` — approve supplier
- `POST /api/suppliers/:id/suspend` — suspend supplier
- `GET /api/suppliers/:id/profile` — full supplier profile with metrics

## Notification Events
- `supplier.invited` — notifies supplier org
- `supplier.approved` — notifies supplier org
- `supplier.suspended` — notifies supplier org + internal admins
- `compliance.expiring` — alerts buyer compliance team
