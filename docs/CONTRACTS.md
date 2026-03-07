# Contracts & Framework Agreements

## Overview
The contracts module manages formal framework agreements between buyer and supplier organizations. Contracts define the commercial terms under which requisitions are fulfilled.

## Schema: contracts

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| buyer_org_id | UUID | FK → organizations |
| supplier_org_id | UUID | FK → organizations |
| contract_type | VARCHAR(50) | framework, master, project, spot |
| title | VARCHAR(255) | Human-readable title |
| description | TEXT | Contract scope/details |
| status | VARCHAR(20) | draft → active → expired / terminated |
| terms | JSONB | Structured terms (rates, SLAs, payment terms) |
| start_date | DATE | Effective start |
| end_date | DATE | Planned end |
| activated_at | TIMESTAMPTZ | When moved to active |
| terminated_at | TIMESTAMPTZ | Early termination timestamp |
| terminated_by | UUID | User who terminated |
| termination_reason | TEXT | Reason for early termination |

## Status Lifecycle

```
draft → active → expired
              ↘ terminated
```

- **draft**: being prepared, editable
- **active**: signed and in effect (`activated_at` set)
- **expired**: past `end_date` (batch job sets this via `expirePastEndDate()`)
- **terminated**: manually ended before expiry with reason

## Contract Types
1. **framework** — long-term blanket agreement covering multiple requisitions
2. **master** — organization-wide terms, typically annual
3. **project** — scoped to a specific project or engagement
4. **spot** — single-use, ad-hoc agreement

## Service: contractService.js
- `createContract(pool, data)` — create draft
- `getContract(pool, id)` — fetch with org names
- `listContracts(pool, filters)` — paginated list with status/org/type filters
- `updateContract(pool, id, data)` — update draft contracts
- `activateContract(pool, id, userId)` — transition draft → active
- `terminateContract(pool, id, userId, reason)` — early termination
- `expirePastEndDate(pool)` — batch job for automatic expiry
- `findExpiringContracts(pool, withinDays)` — proactive expiry alerts

## API Endpoints
- `GET /api/contracts` — list (query: status, buyer_org_id, supplier_org_id, type)
- `POST /api/contracts` — create
- `GET /api/contracts/:id` — detail
- `PUT /api/contracts/:id` — update
- `POST /api/contracts/:id/activate` — activate
- `POST /api/contracts/:id/terminate` — terminate (body: reason)

## Audit
All contract state changes are logged to `audit_log` with `entity_type: 'contract'`.
