# SOC Handoff, Test Report & Go-Live
Stand: 2026-05-20
## Handoff an Frontend (SOC Shell)
- Backend-Endpunkte gemäß `frontend/src/support/api/endpoints.ts` auf Companion-Branch umgesetzt.
- Response-Shapes auf erwartete TypeScript-Strukturen ausgerichtet.
- Supervisor-/Quality-/Audit-/Lookup-Endpunkte vorhanden.
## Test Report (Backend)
- `node --check` auf geänderten SOC-Dateien: erfolgreich.
- `npm --prefix api run build`: erfolgreich.
- Security-Regression:
  - `api/test/security/support-occ-boundaries.test.js` erfolgreich.
## Open Decisions
- Klärung offen: finale produktive SLA-/Escalation-Schwellwerte je Queue.
- Klärung offen: gewünschte SMTP-Textvorlagen für `resend_invite`.
## Go-Live Checklist (SOC)
- [ ] Migration 110 in Zielumgebung ausgerollt.
- [ ] Support-Agenten/Vendoren produktiv gepflegt.
- [ ] `SUPPORT_OPS_ENABLED=true` gesetzt.
- [ ] SOC- und Warp-Limits produktiv feinjustiert.
- [ ] `/support-ops/` Build-Artefakte in `support-ops-dist/` synchronisiert (z. B. via `scripts/sync-support-ops-artifacts.sh`).
