# Organization Model

## Overview
TempConnect uses a multi-tenant organization model where every business entity operates within an `organizations` record. Users belong to organizations via `org_memberships`.

## Schema

### organizations
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(255) | Display name |
| org_type | ENUM | 'buyer' or 'supplier' |
| legal_name | VARCHAR(255) | Registered legal name |
| commercial_register | VARCHAR(100) | Trade register number |
| billing_contact | JSONB | {email, phone, address} |
| plan | VARCHAR(50) | Plan tier (FREE–ENTERPRISE) |
| onboarding_completed_at | TIMESTAMPTZ | When setup was finished |
| created_at / updated_at | TIMESTAMPTZ | Timestamps |

### org_memberships
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | FK → organizations |
| user_id | UUID | FK → users |
| role_key | VARCHAR(50) | One of 12 roles |
| created_at | TIMESTAMPTZ | Join date |

Allowed `role_key` values: `owner`, `admin`, `program_manager`, `hiring_manager`, `supplier_manager`, `finance`, `recruiter`, `dispatcher`, `member`, `supplier_user`, `platform_admin`, `viewer`.

### org_locations
Tracks physical sites per organization (name, address, geo coordinates, timezone).

### departments
Org-level cost centers or business units (name, code, cost_center, manager_user_id).

## API Endpoints
- `GET /api/organizations/:orgId` — org profile
- `PUT /api/organizations/:orgId` — update org
- `GET/POST /api/organizations/:orgId/locations` — locations CRUD
- `GET/POST /api/organizations/:orgId/departments` — departments CRUD
- `GET/POST /api/organizations/:orgId/members` — membership management

## Service
`organizationService.js` wraps the RBAC layer and provides:
- `getOrganization(pool, orgId)` — extended org details
- `updateOrganization(pool, orgId, data)` — partial update
- `listLocations / createLocation` — location management
- `listDepartments / createDepartment` — department management
- `listMembers / addMember / updateMemberRole / removeMember` — membership lifecycle
