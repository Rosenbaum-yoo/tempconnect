# OCC Test Report, Open Decisions & Go-Live
Stand: 2026-05-20
## Test Report (Backend)
- `node --check` auf geänderten OCC-/Security-Dateien: erfolgreich.
- `npm --prefix api run build`: erfolgreich.
- Neuer Security-Regressionstest:
  - `api/test/security/support-occ-boundaries.test.js`
  - Ergebnis: 3/3 Tests erfolgreich.
## Open Decisions
- Entscheidung offen: harte MFA-Pflicht für Warp `risk_level=high|critical`.
- Entscheidung offen: produktive Schwellwerte für `RATE_LIMIT_WARP_EXEC_*`.
## Go-Live Checklist (OCC)
- [ ] Migrationen bis inkl. 110 in Produktions-DB ausgeführt.
- [ ] OCC-Allowlist per CLI final gepflegt.
- [ ] `owner_control_access_audit` Monitoring im Betrieb aktiv.
- [ ] OCC Bootstrap auf erwartete `critical_signal_breakdown` Felder validiert.
- [ ] Warp-Rate-Limits für Produktion konfiguriert und verifiziert.
- [ ] `WARP_SSH_*` gesetzt (User, Key, Host-Key-Policy, Timeouts) und mindestens ein Live-Runbook erfolgreich ausgeführt.
- [ ] `collect-infrastructure-snapshot.sh` per Cron aktiv und Ingest-Endpoint liefert laufende Snapshots.
