# SOC API Contract (Backend)
Stand: 2026-05-20
## Endpunkte
- `GET /api/support/bootstrap`
- `GET /api/support/cases`
- `GET /api/support/cases/:id`
- `POST /api/support/cases/:id/action`
- `GET /api/support/lookup/users`
- `GET /api/support/lookup/orgs`
- `GET /api/support/escalations`
- `POST /api/support/escalations`
- `GET /api/support/knowledge`
- `GET /api/support/knowledge/categories`
- `GET /api/support/quality/metrics`
- `GET /api/support/quality/agents`
- `GET /api/support/quality/sla`
- `GET /api/support/audit`
- `GET /api/support/supervisor/overview`
- `GET /api/support/supervisor/agents`
## Zusätzlicher Backend-Endpunkt
- `POST /api/support/user-actions` für serverseitige Aktionen (`resend_verification`, `resend_invite`) inkl. Audit.
## Antwortformate
- Endpunkte liefern primär rohe JSON-Payloads kompatibel zur SOC-Frontend-Typisierung.
- Paginierte Listen verwenden konsistent:
  - `items`, `total`, `page`, `per_page`, `has_more`.
## Serverseitige Durchsetzungen
- Scope-Filterung nach `allowed_queues`, `allowed_case_types`, `data_scope`.
- Rollenbasierte Actions + Feature-Checks.
- Masking serverseitig (E-Mail/Name/ID/Phone je Rolle).
