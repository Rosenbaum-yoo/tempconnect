# Compliance Model

## Overview
TempConnect enforces supplier compliance through document tracking with traffic-light status indicators and configurable strictness levels per buyer organization.

## Schema: compliance_documents

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | FK → organizations (supplier) |
| buyer_org_id | UUID | FK → organizations (buyer requiring doc) |
| document_type | VARCHAR(100) | e.g. 'insurance', 'tax_clearance', 'certification' |
| file_url | TEXT | Storage path / URL |
| status | VARCHAR(20) | valid, expiring_soon, expired, missing |
| issued_at | DATE | Document issue date |
| expires_at | DATE | Expiration date |
| verified_by | UUID | User who verified |
| verified_at | TIMESTAMPTZ | Verification timestamp |
| notes | TEXT | Reviewer notes |

## Traffic-Light System
- **Green (valid)**: Document present and not expiring within 30 days
- **Yellow (expiring_soon)**: Document expires within 30 days
- **Red (expired)**: Document past expiration date
- **Gray (missing)**: Required document not uploaded

## Compliance Strictness (org_settings)
Buyer organizations configure `compliance_strictness`:
- **standard**: yellow/red documents generate warnings
- **strict**: expired documents block supplier from receiving new requisitions
- **audit**: all compliance changes require approval workflow

## Integration Points
- **Supplier Management**: compliance status is part of the supplier profile and affects tier reviews
- **Requisitions**: in strict mode, suppliers with expired compliance cannot submit candidates
- **Notifications**: `compliance.expiring` events fire 30/14/7 days before expiry
- **Audit Log**: all compliance status changes are recorded with actor and timestamp

## API Access
Compliance data is accessed through the supplier management endpoints:
- Supplier profile includes compliance summary
- Document upload/verification handled through compliance-specific routes
