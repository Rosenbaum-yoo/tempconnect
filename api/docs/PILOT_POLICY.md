# Pilot Policy (Org-Scoped, Hardened)

TempConnect enforces pilot eligibility on organization level (not user level).

## Lifecycle Model

- `pilot_status`: `eligible | active | ended | converted | blocked | exception`
- `has_used_pilot`: irreversible business marker once pilot was activated
- `pilot_started_at`: first pilot activation timestamp
- `pilot_ended_at`: timestamp when pilot ends without conversion
- `converted_at`: timestamp when pilot converts to paid/live
- `customer_stage`: `demo | contract_requested | pilot | live`
- exception state:
  - `pilot_exception_allowed`
  - `pilot_exception_reason`
  - `pilot_exception_granted_by`
  - `pilot_exception_granted_at`

## Enforcement Rules

- Pilot can only be activated once per org-family (parent/child scope).
- If any org in family is `blocked`, pilot activation is denied.
- If pilot was already used in family, a documented internal admin exception is required.
- Self-service signup is restricted to pilot-safe plans (`DEMO` / `FREE`).
- Plan conversion to paid marks pilot conversion server-side.
- Cancelling back to demo ends pilot server-side.
- Direct INDIVIDUELL contract requests use `customer_stage = contract_requested` and must not be silently collapsed into `demo`.

## Pilot & Conversion Truth Layer
Pilot policy is only the lifecycle guardrail. The canonical conversion truth is derived on top of it in `pilotConversionTruthService`.

Stage sequence:

- `lead`
- `qualified`
- `registered`
- `pilot_started`
- `pilot_activated`
- `first_core_flow_executed`
- `pilot_successful_usage`
- `commercial_pricing_clarified`
- `paid_live`
- `lost_aborted`

Activation definition:

- first real core-value action after `pilot_started_at`
- sourced from existing `product_analytics_events`
- current activation set:
  - `requisition_created`
  - `request_created`
  - `request_sent`
  - `deal_started`
  - `assignment_created`
  - `timesheet_started`
  - `rate_card_created`
  - `integration_connected`

Successful-usage definition:

- first point with at least five core-value events since pilot start
- plus at least one of:
  - two active days
  - two distinct users
  - two used product areas

Commercial / conversion definition:

- `commercial_pricing_clarified`: pricing path is explicit and no quote is pending
- `paid_live`: converted pilot or active paid live subscription without open pricing gap
- `lost_aborted`: strategic lead rejected or pilot ended/blocked without conversion

## Admin Override Endpoint

- `PATCH /api/admin/organizations/:id/pilot-policy`
- Requires admin access.
- Body:
  - `allow_exception: boolean`
  - `reason: string` (minimum 10 chars, mandatory for auditability)

All pilot-policy updates are written to audit via `res.locals.audit`.
