# Organization Model

## Overview
TempConnect uses a multi‑organisation model. Users can belong to multiple organizations via `org_memberships`. Exactly one **active org** is resolved per request and is the source of truth for access control and plan/feature gating.

## Active Org Resolution
The active org is resolved in `orgContextMiddleware` using this priority:
1. `X-Org-Id` request header (explicit active org)
2. Session cache (`req.session._orgCache`, set by `/api/me/active-org`)
3. Primary org (`users.org_id`) or first active membership

All org‑scoped actions must align to this active org. Cross‑org parameters are rejected.

## Core Schema

### organizations
- `id` UUID (PK)
- `name`, `slug`
- `type` — `company` or `agency`
- `plan` — `DEMO | BASIS | PLUS | PRO | INDIVIDUELL` (alias support for legacy values)
- `feature_bundle` — `standard | enterprise_full`
- `account_type` — `live | demo | internal`
- `billing_*` fields (commercial truth, pilot/individual contracts)
- `parent_org_id` (optional group/holding hook)

### org_memberships
- `org_id`, `user_id`
- `role_key` — `owner`, `admin`, `program_manager`, `hiring_manager`, `supplier_manager`, `finance`, `recruiter`, `dispatcher`, `member`, `supplier_user`, `platform_admin`, `viewer`
- `department_id`, `location_id`
- `is_active`

### org_locations / org_departments
Org‑scoped locations and departments for cost center and site segmentation.

## Plan & Billing Scoping
- The effective plan for UI/feature gating is **org‑scoped** (`organizations.plan`), with pilot override to `INDIVIDUELL`.
- User subscriptions remain the billing history trail; they do not override the active org’s plan in the UI.

## API Endpoints (Org + Active Org)
- `GET /api/me` — returns `memberships`, `active_org_id`, `active_org`
- `GET /api/me/memberships` — list memberships
- `POST /api/me/active-org` — set active org (session cache)
- `GET /api/organizations/:orgId` — org profile
- `PATCH /api/organizations/:orgId` — update org
- `GET/POST /api/organizations/:orgId/locations` — locations CRUD
- `GET/POST /api/organizations/:orgId/departments` — departments CRUD
- `GET/POST /api/organizations/:orgId/members` — membership management

## Service Notes
`organizationService.js` wraps org CRUD and delegates membership ops to `rbacService`. Access enforcement is handled by `rbac.js` + `orgBoundary` utilities.
