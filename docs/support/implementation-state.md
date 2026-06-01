# SOC Backend Implementation State
Stand: 2026-05-20
## Implementierte SOC-Module
- Migration `110_soc_phase3_support.sql` mit SOC-Kernobjekten:
  - `support_vendors`, `support_agents`, `support_queues`, `support_cases`
  - `support_case_notes`, `support_case_events`, `support_knowledge`
  - `support_audit_log`, `support_escalations`
- Support Access Middleware:
  - Rollen-/Scope-Prüfung
  - Feature-Freigaben pro Rolle
  - Masking-Regeln pro Rolle
- SOC API Router unter `/api/support/*` in `api/routes/support.js`.
- Nginx-Shell-Routing für `/support-ops/` ergänzt.
## Betriebskonfiguration
- SOC Feature-Flag: `SUPPORT_OPS_ENABLED`.
- Dediziertes SOC Rate-Limiting über `supportRateLimit`.
- Dediziertes Warp Execution Rate-Limiting über `warpExecutionRateLimit`.
- SOC-Frontend-Artefaktpfad:
  - Compose-Mount: `./support-ops-dist -> /usr/share/nginx/html/support-ops`
  - Sync-Helfer: `scripts/sync-support-ops-artifacts.sh`
