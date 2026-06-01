# TempConnect API Reference

**Base URL:** `https://your-domain.com/api`  
**Auth:** Session-cookie (`tc.sid`) + CSRF token (`X-CSRF-Token` header)  
**Format:** JSON request/response bodies  
**Envelope:** `{ success, data, error }` (centralized error handler)

---

## Table of Contents

1. [Authentication Conventions](#1-authentication-conventions)
2. [Auth & Session](#2-auth--session)
3. [Current User (Me)](#3-current-user-me)
4. [Plans & Billing](#4-plans--billing)
5. [Organizations](#5-organizations)
6. [Requisitions (VMS)](#6-requisitions-vms)
7. [Capacity Exchange](#7-capacity-exchange)
8. [Marketplace](#8-marketplace)
9. [Vendor Pool](#9-vendor-pool)
10. [Timesheets](#10-timesheets)
11. [Workers](#11-workers)
12. [Assignments](#12-assignments)
13. [Contracts](#13-contracts)
14. [Compliance Documents](#14-compliance-documents)
15. [Deals & Requests](#15-deals--requests)
16. [Notifications](#16-notifications)
17. [Reporting & Analytics](#17-reporting--analytics)
18. [Search](#18-search)
19. [Admin](#19-admin)
20. [Health & Observability](#20-health--observability)
21. [Error Codes](#21-error-codes)

---

## 1. Authentication Conventions

### CSRF Protection

All `POST`, `PATCH`, `PUT`, `DELETE` requests to `/api/*` require a CSRF token:

```
GET /api/csrf-token
→ { token: "abc..." }

Header on subsequent mutating requests:
X-CSRF-Token: abc...
```

### Session

Authentication uses HTTP-only session cookies. On login, the server sets `tc.sid`. Include credentials in all requests:

```
fetch('/api/...', { credentials: 'include' })
```

### Role-Based Access Control

Permissions are enforced at the route level via `requirePermission(permission, opts)`. The RBAC matrix is documented in `docs/SECURITY_MODEL.md`.

Roles (high → low): `platform_admin → owner → admin → program_manager → hiring_manager → supplier_manager → finance → recruiter → dispatcher → member → supplier_user / viewer`

---

## 2. Auth & Session

### POST /auth/register

Register a new company or agency account.

**Rate limited** (10 req/15 min per IP)

Request body:
```json
{
  "role": "company | agency",
  "email": "user@example.com",
  "password": "min8chars",
  "company_name": "Acme GmbH",
  "phone": "+49 30 12345678",
  "postal_code": "10115",
  "city": "Berlin",
  "plan": "FREE | BASIS | PLUS | NOTDIENST"
}
```

Response `200`: User object + `verification_sent: true`  
Errors: `400 VALIDATION`, `409 EMAIL_EXISTS`, `500 SERVER_ERROR`

---

### POST /auth/login

**Rate limited**

Request body:
```json
{ "email": "user@example.com", "password": "..." }
```

Response `200`: Full user+plan object (see [Current User](#3-current-user-me))  
Errors: `401 INVALID_CREDENTIALS`, `400 VALIDATION`

---

### POST /auth/logout

Destroys session and clears cookie.

Response `200`: `{ ok: true }`

---

### GET /auth/verify/:token

Verify email address via token from registration email.

Response `200`: `{ ok: true, email: "..." }`  
Errors: `404 TOKEN_NOT_FOUND`, `400 INVALID_TOKEN`

---

### POST /auth/resend-verification

**Auth required.** Resend email verification link.

Response `200`: `{ ok: true, sent: true }`

---

### POST /auth/forgot-password

**Rate limited.** Trigger password reset email.

Request body: `{ "email": "user@example.com" }`

Response `200`: `{ ok: true, message: "..." }` (always 200, no user enumeration)

---

### GET /auth/reset-password/:token

Validate a password reset token.

Response `200`: `{ ok: true, email: "..." }`  
Errors: `400 TOKEN_EXPIRED`

---

### POST /auth/reset-password

**Rate limited.** Set a new password.

Request body: `{ "token": "...", "password": "min8chars" }`

Response `200`: `{ ok: true, message: "..." }`  
Errors: `400 TOKEN_EXPIRED | TOKEN_REQUIRED | PASSWORD_TOO_SHORT`

---

### GET /auth/worker/invite/:token

Validate a worker invite token (public, no auth).

Response `200`: `{ valid: true, email, first_name, last_name, supplier_org_name, expires_at }`  
Errors: `404 INVITE_NOT_FOUND`, `409 INVITE_ALREADY_USED`, `410 INVITE_EXPIRED | INVITE_REVOKED`

---

### POST /auth/worker/accept-invite

Accept a worker invite and set password.

**Rate limited**

Request body: `{ "token": "...", "password": "min8chars" }`

Response `200`: `{ ok: true, user, profile }`

---

## 3. Current User (Me)

### GET /me

**Auth required.** Returns current user with active plan.

Response `200`:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "company | agency | worker",
  "company_name": "Acme GmbH",
  "plan": "FREE | BASIS | PLUS | NOTDIENST",
  "is_verified": true,
  "org_id": "uuid | null",
  "lat": 52.52, "lng": 13.405
}
```

---

### PATCH /me

**Auth required.** Update profile fields.

Updatable fields: `company_name`, `phone`, `postal_code`, `city`, `street`, `vat_id`, `handelsregister`, `contact_person`

Response `200`: Updated user object

---

### GET /me/memberships

**Auth required.** List all org memberships for the current user.

Response `200`: `{ memberships: [...] }`

---

## 4. Plans & Billing

### GET /plans

List available subscription plans.

Response `200`: `{ plans: [{ id, name, price_eur, features }] }`

---

### GET /payment/config

Returns payment provider configuration (no auth required for frontend use).

Response `200`:
```json
{
  "mode": "demo | live",
  "stripe_enabled": true,
  "stripe_publishable_key": "pk_...",
  "paypal_enabled": false,
  "plans": { "BASIS": { "price": 49 }, ... }
}
```

---

### POST /payment/checkout

**Auth required.** Initiate a plan upgrade checkout.

Request body:
```json
{
  "plan": "BASIS | PLUS | NOTDIENST",
  "payment_method": "demo | stripe | paypal"
}
```

Response `200`:
- demo mode: `{ checkout_id, mode: "demo", plan, amount, currency }`
- stripe mode: `{ checkout_id, mode: "stripe", stripe_session_id, redirect_url, plan, amount }`

Errors: `400 INVALID_PLAN | PAYMENT_METHOD_NOT_AVAILABLE`

---

### POST /payment/confirm

**Auth required.** Confirm a demo payment session.

Request body: `{ "checkout_id": "..." }`

Response `200`: `{ ok: true, user: updatedUserWithPlan }`  
Errors: `404 SESSION_NOT_FOUND`, `400 ALREADY_COMPLETED`, `402 PAYMENT_PENDING`

---

### POST /payment/webhook/stripe

**Stripe webhook endpoint.** Requires `stripe-signature` header.

Handles: `checkout.session.completed`, `customer.subscription.deleted`

Response `200`: `{ received: true }`

---

### GET /payment/history

**Auth required.** Payment session history for current user.

Response `200`: Array of payment sessions

---

## 5. Organizations

### POST /organizations

**Auth required.** Create a new organization (user becomes `owner`).

Request body:
```json
{
  "name": "Acme Staffing GmbH",
  "slug": "acme-staffing",
  "type": "company | agency",
  "billing_email": "billing@acme.de",
  "tax_id": "DE123456789",
  "website": "https://acme.de"
}
```

Response `201`: Organization object  
Errors: `409 SLUG_EXISTS`, `400 VALIDATION`

---

### GET /organizations/:id

**Auth required.**

Response `200`: Organization object

---

### PATCH /organizations/:id

**Auth required. Permission: `org.settings`**

Response `200`: Updated organization

---

### GET /organizations/:id/locations

**Auth required.**

Response `200`: `{ items: [location, ...] }`

---

### POST /organizations/:id/locations

**Auth required. Permission: `org.locations`**

Request body: `{ name, street, city, postal_code, country, latitude, longitude, is_hq }`

Response `201`: Location object

---

### GET /organizations/:id/departments

**Auth required.**

Response `200`: `{ items: [dept, ...] }`

---

### POST /organizations/:id/departments

**Auth required. Permission: `org.departments`**

Request body: `{ name, cost_center, location_id }`

Response `201`: Department object

---

### GET /organizations/:id/members

**Auth required.**

Response `200`: `{ items: [membership, ...] }`

---

### POST /organizations/:id/members

**Auth required. Permission: `org.members`**

Request body:
```json
{
  "user_id": "uuid",
  "role_key": "admin | hiring_manager | ...",
  "department_id": "uuid | null",
  "location_id": "uuid | null"
}
```

Response `201`: Membership object

---

## 6. Requisitions (VMS)

The core VMS workflow: DRAFT → PENDING_APPROVAL → APPROVED → OPEN → IN_REVIEW → SHORTLISTED → FILLED → CLOSED

### POST /requisitions

**Auth required. Permission: `requisition.create`**

Request body:
```json
{
  "title": "10 Lagerhelfer für KW 15-20",
  "role": "Lagerhelfer",
  "description": "Vollzeit, Frühschicht",
  "skill_tags": ["gabelstapler", "nachtschicht"],
  "headcount": 10,
  "start_date": "2026-04-07",
  "end_date": "2026-05-17",
  "location_city": "Berlin",
  "location_postal": "10115",
  "radius_km": 30,
  "budget_min_cents": 1600,
  "budget_max_cents": 2000,
  "urgency": "normal | high | urgent | notdienst",
  "approval_required": true
}
```

Response `201`: Requisition object

---

### GET /requisitions

**Auth required.** Filterable list.

Query params: `org_id`, `status`, `urgency`, `assigned_to`, `mine=true`, `limit`

Response `200`: `{ items: [...], total: N }`

---

### GET /requisitions/:id

**Auth required.**

Response `200`: Full requisition object

---

### PATCH /requisitions/:id

**Auth required. Permission: `requisition.edit`**

All fields from POST are patchable (partial update).

Response `200`: Updated requisition

---

### POST /requisitions/:id/transition

**Auth required.** Change status via state machine.

Request body:
```json
{
  "status": "PENDING_APPROVAL | APPROVED | OPEN | IN_REVIEW | SHORTLISTED | FILLED | CLOSED | CANCELLED",
  "cancel_reason": "Optional reason when cancelling"
}
```

Response `200`: Updated requisition  
Errors: `409 INVALID_TRANSITION`

---

### POST /requisitions/:id/submit

**Auth required.** Shortcut: DRAFT → PENDING_APPROVAL.

Response `200`: Requisition

---

### POST /requisitions/:id/approve

**Auth required. Permission: `requisition.approve`**

Response `200`: Requisition with status `APPROVED`

---

### GET /requisitions/:id/events

**Auth required.** Audit trail / event log.

Response `200`: `{ events: [...] }`

---

### POST /requisitions/:id/comment

**Auth required.**

Request body: `{ "text": "Kommentar..." }`

Response `200`: `{ ok: true }`

---

### GET /requisitions/:id/candidates

**Auth required.**

Response `200`: `{ candidates: [...] }`

---

### POST /requisitions/:id/candidates

**Auth required. Permission: `requisition.edit`**

Request body:
```json
{
  "capacity_post_id": "uuid | null",
  "supplier_org_id": "uuid",
  "match_score": 85,
  "internal_notes": "Strong match"
}
```

Response `201`: Candidate object

---

### PATCH /requisitions/:reqId/candidates/:candId

**Auth required. Permission: `requisition.edit`**

Request body:
```json
{
  "status": "under_review | shortlisted | accepted | rejected | withdrawn",
  "rejected_reason": "...",
  "internal_notes": "..."
}
```

Response `200`: Updated candidate

---

## 7. Capacity Exchange

### GET /capacities

**Auth required.** List capacity posts (with optional filters).

Query params: `role`, `city`, `postal_code`, `radius_km`, `from`, `to`, `status`, `supplier_id`, `limit`

Response `200`: `{ items: [...], total: N }`

---

### POST /capacities

**Auth required.** Create a capacity post (supplier offering workers).

Request body:
```json
{
  "role": "Staplerfahrer",
  "skill_tags": ["gabelstapler", "schichtarbeit"],
  "headcount_available": 5,
  "availability_from": "2026-04-01",
  "availability_to": "2026-06-30",
  "location_city": "Hamburg",
  "location_postal": "20095",
  "radius_km": 50,
  "hourly_rate_min_cents": 1600,
  "hourly_rate_max_cents": 2000,
  "description": "Erfahrene Staplerfahrer, AÜG-konform"
}
```

Response `201`: CapacityPost object

---

### GET /capacities/:id

**Auth required.**

Response `200`: CapacityPost with supplier details

---

### PATCH /capacities/:id

**Auth required.** Update capacity post (only draft/active allowed).

Response `200`: Updated CapacityPost

---

### POST /capacities/:id/activate

Transition to `active`.

Response `200`: CapacityPost

---

### POST /capacities/:id/pause

Transition to `paused`.

Response `200`: CapacityPost

---

### DELETE /capacities/:id

Archive (soft delete).

Response `200`: `{ ok: true }`

---

## 8. Marketplace

### GET /marketplace

**Auth required.** Browse available capacity posts with scoring.

Query params: `role`, `city`, `postal_code`, `radius_km`, `from_date`, `to_date`, `min_score`, `limit`

Response `200`: `{ items: [{ capacity_post, score, reasons, supplier }], total: N }`

---

### POST /marketplace/match

**Auth required.** Run matching engine against a demand specification.

Request body: Demand object (same structure as Requisition fields)

Response `200`: `{ matches: [{ capacity_post, score, reasons }] }`

---

### GET /listings

**Public.** Public listing of active capacity posts (anonymized).

Response `200`: `{ items: [...], total: N }`

---

## 9. Vendor Pool

### GET /vendor-pool

**Auth required. Permission: `vendor_pool.view`**

Returns the organization's curated vendor pool (preferred suppliers).

Response `200`: `{ items: [{ supplier_org, tier, notes, created_at }] }`

---

### POST /vendor-pool

**Auth required. Permission: `vendor_pool.manage`**

Add supplier to vendor pool.

Request body:
```json
{
  "supplier_org_id": "uuid",
  "tier": "PREFERRED | STANDARD | RESTRICTED | BLOCKED",
  "notes": "Optional notes"
}
```

Response `201`: VendorPoolEntry

---

### PATCH /vendor-pool/:id

**Auth required. Permission: `vendor_pool.manage`**

Update tier or notes.

Response `200`: Updated VendorPoolEntry

---

### DELETE /vendor-pool/:id

**Auth required. Permission: `vendor_pool.manage`**

Response `200`: `{ ok: true }`

---

## 10. Timesheets

**Feature-gated: requires PLUS or NOTDIENST plan.**

### GET /timesheets

**Auth required. Permission: `timesheet.view`**

Query params: `org_id`, `supplier_org_id`, `assignment_id`, `status`, `worker_name`, `week_start_from`, `week_start_to`, `limit`

Response `200`: `{ items: [...], total: N }`

---

### POST /timesheets

**Auth required. Permission: `timesheet.create`**

Request body:
```json
{
  "org_id": "uuid",
  "supplier_org_id": "uuid",
  "assignment_id": "uuid | null",
  "worker_name": "Max Mustermann",
  "worker_identifier": "P-001",
  "week_start": "2026-04-06",
  "week_end": "2026-04-12",
  "notes": null
}
```

Response `201`: Timesheet (status: `draft`)

---

### GET /timesheets/:id

**Auth required. Permission: `timesheet.view`**

Response `200`: Timesheet with daily entries

---

### PATCH /timesheets/:id

**Auth required. Permission: `timesheet.edit`** (only `draft` status)

Response `200`: Updated timesheet

---

### POST /timesheets/:id/entries

**Auth required. Permission: `timesheet.edit`**

Request body:
```json
{
  "work_date": "2026-04-07",
  "hours_regular": 8,
  "hours_overtime": 1.5,
  "break_minutes": 45,
  "shift_start": "06:00",
  "shift_end": "15:00",
  "notes": null
}
```

Response `201`: Entry object

---

### PATCH /timesheets/:id/entries/:entryId

**Auth required. Permission: `timesheet.edit`**

Partial update of a daily entry.

Response `200`: Updated entry

---

### DELETE /timesheets/:id/entries/:entryId

**Auth required. Permission: `timesheet.edit`**

Response `200`: `{ ok: true }`

---

### POST /timesheets/:id/submit

**Auth required. Permission: `timesheet.submit`**

Transition: `draft → submitted`

Response `200`: Updated timesheet

---

### POST /timesheets/:id/approve

**Auth required. Permission: `timesheet.approve`**

Transition: `submitted → approved`

Response `200`: Updated timesheet

---

### POST /timesheets/:id/reject

**Auth required. Permission: `timesheet.reject`**

Request body: `{ "reason": "Stunden nicht korrekt..." }`

Transition: `submitted → rejected`

Response `200`: Updated timesheet

---

## 11. Workers

### GET /workers

**Auth required. Permission: `worker.view`**

List worker profiles for the supplier org.

Response `200`: `{ items: [...] }`

---

### POST /workers

**Auth required. Permission: `worker.create`**

Create a worker profile + send invite email.

Request body:
```json
{
  "first_name": "Max",
  "last_name": "Mustermann",
  "email": "max@example.com",
  "phone": "+49...",
  "personnel_number": "P-001",
  "date_of_birth": "1990-01-15",
  "postal_code": "10115",
  "city": "Berlin"
}
```

Response `201`: Worker profile + invite details

---

### GET /workers/:id

**Auth required. Permission: `worker.view`**

Response `200`: Worker profile with assignments

---

### PATCH /workers/:id

**Auth required. Permission: `worker.edit`**

Response `200`: Updated worker profile

---

### GET /worker/me

**Auth required (worker role).** Worker self-service: own profile and assignments.

Response `200`: `{ profile, assignments }`

---

### GET /worker/submissions

**Auth required (worker role).** Own time submissions.

Response `200`: `{ items: [...] }`

---

### POST /worker/submissions

**Auth required (worker role).** Submit time for a week.

Request body:
```json
{
  "week_start": "2026-04-06",
  "week_end": "2026-04-12",
  "total_hours": 40,
  "overtime_hours": 0,
  "worker_comment": null
}
```

Response `201`: Submission

---

## 12. Assignments

### GET /assignments

**Auth required. Permission: `assignment.view`**

Response `200`: `{ items: [...] }`

---

### POST /assignments

**Auth required. Permission: `assignment.create`**

Link a deal/requisition to a worker.

Response `201`: Assignment

---

### GET /assignments/:id

**Auth required. Permission: `assignment.view`**

Response `200`: Assignment with worker and deal details

---

### PATCH /assignments/:id

**Auth required. Permission: `assignment.edit`**

Response `200`: Updated assignment

---

### POST /assignments/:id/complete

**Auth required. Permission: `assignment.complete`**

Response `200`: Assignment with status `completed`

---

## 13. Contracts

### GET /contracts

**Auth required. Permission: `contract.view`**

Response `200`: `{ items: [...] }`

---

### POST /contracts

**Auth required. Permission: `contract.create`**

Response `201`: Contract

---

### GET /contracts/:id

**Auth required. Permission: `contract.view`**

Response `200`: Contract

---

### PATCH /contracts/:id

**Auth required. Permission: `contract.edit`**

Response `200`: Updated contract

---

### POST /contracts/:id/terminate

**Auth required. Permission: `contract.terminate`**

Response `200`: Contract with status `terminated`

---

## 14. Compliance Documents

### GET /compliance-docs

**Auth required. Permission: `compliance.view`**

Response `200`: `{ items: [...] }` — Document checklist per supplier

---

### POST /compliance-docs

**Auth required. Permission: `compliance.upload`**

Upload a compliance document.

Request body (multipart or JSON with URL):
```json
{
  "doc_type": "AUG_ERLAUBNIS | SOZIALVERSICHERUNG | HAFTPFLICHT | ...",
  "file_name": "aug-erlaubnisschein-2026.pdf",
  "file_url": "https://...",
  "valid_from": "2026-01-01",
  "valid_until": "2027-01-01"
}
```

Response `201`: ComplianceDocument

---

### PATCH /compliance-docs/:id/verify

**Auth required. Permission: `compliance.verify`**

Mark document as verified.

Request body: `{ "status": "GREEN | YELLOW | RED" }`

Response `200`: Updated document

---

## 15. Deals & Requests

### GET /requests

**Auth required.** List demand requests (marketplace inbound).

Response `200`: `{ items: [...] }`

---

### POST /requests

**Auth required.** Create a new demand request (company seeking workers).

Request body:
```json
{
  "role": "Elektriker",
  "headcount": 3,
  "start_date": "2026-05-01",
  "skill_tags": ["schaltschrank"],
  "location_city": "München",
  "radius_km": 25
}
```

Response `201`: DemandRequest

---

### POST /requests/:id/accept

Supplier accepts a demand request → creates a Deal.

Response `200`: `{ deal, request }`

---

### POST /requests/:id/decline

Response `200`: Updated request

---

### GET /requests/:id/deals

List deals for a request.

Response `200`: `{ deals: [...] }`

---

## 16. Notifications

### GET /notifications

**Auth required.** Inbox for the current user.

Query params: `unread=true`, `limit`

Response `200`: `{ items: [...], unread_count: N }`

---

### PATCH /notifications/:id/read

Mark notification as read.

Response `200`: `{ ok: true }`

---

### POST /notifications/read-all

Mark all notifications as read.

Response `200`: `{ ok: true }`

---

## 17. Reporting & Analytics

### GET /reports/sla

**Auth required. Permission: `report.operational`**

SLA compliance report.

Response `200`: `{ summary, by_period: [...] }`

---

### GET /reporting/executive

**Auth required. Permission: `report.executive`**

Executive KPI dashboard data.

Response `200`: `{ kpis: { ... }, trends: [...] }`

---

### GET /reporting/supplier

**Auth required. Permission: `report.supplier`**

Supplier performance report.

Query params: `supplier_org_id`, `from`, `to`

Response `200`: Supplier metrics

---

### GET /analytics/dashboard

**Auth required.**

Platform usage analytics.

Response `200`: `{ sessions, active_users, requisitions_by_status, ... }`

---

## 18. Search

### GET /search

**Auth required.** Universal search across requisitions, capacity posts, suppliers, workers.

Query params: `q` (search term), `type=requisition|capacity|supplier|worker`, `limit`

Response `200`: `{ results: [{ type, id, title, snippet, ... }] }`

---

### GET /capacity-discovery

**Auth required.** Advanced capacity post discovery with filters.

Query params: `role`, `skills` (comma-separated), `city`, `radius_km`, `from_date`, `to_date`, `verified_only`, `preferred_only`, `limit`

Response `200`: `{ items: [...] }`

---

## 19. Admin

All admin endpoints require `platform_admin` role.

### GET /admin/users

List all users with filters.

Query params: `role`, `plan`, `is_verified`, `search`, `limit`, `offset`

Response `200`: `{ users: [...], total: N }`

---

### PATCH /admin/users/:id

Update any user (plan, verification status, etc.).

Response `200`: Updated user

---

### GET /admin/stats

Platform-wide statistics.

Response `200`: `{ user_count, active_subscriptions, total_requests, total_deals, ... }`

---

### POST /admin/migrate

Run pending database migrations (emergency use only).

Response `200`: `{ ok: true, migrations_run: N }`

---

## 20. Health & Observability

### GET /health

**Public.** Basic health check (no auth, not logged).

Response `200`: `{ status: "ok" }`

---

### GET /api/health

**Public.** API health check with DB connectivity test.

Response `200`: `{ status: "ok", db: "ok", uptime: 1234 }`

---

### GET /api/service-status

**Public.** Component health status.

Response `200`:
```json
{
  "status": "healthy | degraded | down",
  "components": {
    "database": { "status": "ok", "latency_ms": 2 },
    "redis": { "status": "ok" },
    "smtp": { "status": "ok | unconfigured" },
    "stripe": { "status": "ok | unconfigured" },
    "queue": { "status": "ok", "waiting": 0, "active": 0 }
  },
  "version": "1.0.0",
  "environment": "production"
}
```

---

### GET /api/csrf-token

**Public.** Get a CSRF token for the current session.

Response `200`: `{ token: "..." }`

---

## 21. Error Codes

| HTTP | Code | Description |
|------|------|-------------|
| 400 | `VALIDATION` | Request body failed Zod schema validation. `details` field contains per-field errors. |
| 400 | `INVALID_PLAN` | Unknown plan name |
| 400 | `MISSING_CHECKOUT_ID` | Checkout ID not provided |
| 401 | `NOT_AUTHENTICATED` | Session missing or expired |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 402 | `PAYMENT_PENDING` | Stripe payment not yet confirmed |
| 403 | `PERMISSION_DENIED` | User lacks required RBAC permission |
| 403 | `ORG_BOUNDARY_VIOLATION` | Resource belongs to a different org |
| 403 | `FEATURE_NOT_AVAILABLE` | Plan too low for this feature |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `EMAIL_EXISTS` | Email already registered |
| 409 | `INVALID_TRANSITION` | Forbidden state machine transition |
| 409 | `SLUG_EXISTS` | Organization slug already taken |
| 410 | `INVITE_EXPIRED` | Worker invite token expired |
| 500 | `SERVER_ERROR` | Internal server error |

---

## Pagination

List endpoints accept `limit` (default 50, max 200) and `offset` query params where applicable.

## Idempotency

Safe to retry `POST` requests by adding the `Idempotency-Key: <uuid>` header. Duplicate requests within 24h return the cached response.

## Rate Limiting

- Auth endpoints: 10 requests/15 minutes per IP  
- API endpoints: 100 requests/minute per session  
- Redis-backed in production, in-memory fallback in development
