# WARP-TASKS-PERMANENT
Stand: 2026-05-20
Branch: `feat/occ-backend-oz`
## Block 1: Warp-Host-Registry + Runbook-API + SSH-Integration
Status: umgesetzt (backend-seitig)
- Vorhanden: OCC Warp Router mit Hosts/Runbooks/Execute/History/Registry-Endpunkten.
- Neu: dediziertes Warp-Execution-Rate-Limit auf Execute/Dry-Run.
- Neu: asynchrone Runbook-Ausführung mit SSH-Actions (`deploy`, `restart_service`, `backup_trigger`, `health_check`) inkl. `warp_executions` Finalstatus/Step-Results.
- Neu: Host-/Action-Gating über `warp_hosts.ssh_ready` und `allowed_actions`.
- Offen: produktive SSH-Credentials/Host-Keys je Umgebung setzen (`WARP_SSH_*`).
## Block 2: Telemetrie-Collector (CPU/RAM/Docker/TLS/Backup)
Status: umgesetzt (Ingest + Collector-Pfad)
- Vorhanden: `infrastructure_snapshots` Tabelle (Migration 110).
- Vorhanden: OCC Bootstrap aggregiert kritische Infrastruktur-Signale aus Snapshot-Latest pro Host.
- Neu: interner Ingest-Endpunkt `POST /api/internal/infrastructure-snapshots/ingest` (alias `/api/internal/infrastructure-snapshot-ingest`).
- Neu: Host-Risk/Status-Update in `warp_hosts` beim Ingest.
- Neu: Script `scripts/collect-infrastructure-snapshot.sh` für CPU/RAM/Docker/TLS/Backup-Erhebung.
- Offen: produktive Cron-Aktivierung auf allen relevanten Hosts.
## Block 3: SOC-Middleware + Support-RBAC
Status: umgesetzt
- `api/middleware/supportAccess.js` eingeführt.
- Rollen, Scope, Feature-Gates, serverseitige Masking-Regeln aktiv.
## Block 4: Nginx /support-ops/ + Docker-Volume + CI/CD
Status: umgesetzt (Pipeline-Basis)
- Nginx Routing für `/support-ops/` ergänzt (SPA fallback + assets).
- Neu: dedizierter Volume-Pfad `./support-ops-dist -> /usr/share/nginx/html/support-ops` in Dev+Prod Compose.
- Neu: `support-ops-dist/index.html` Placeholder im Repo.
- Neu: `scripts/sync-support-ops-artifacts.sh` für Artefakt-Sync.
- Neu: CI Release-Artifact-Check erzwingt `support-ops-dist/index.html`.
## Block 5: Security-Guards Support ≠ Warp ≠ OCC
Status: umgesetzt (Backend-seitig)
- OCC denied-access wird in `owner_control_access_audit` persistiert.
- Owner-Access CLI (`grant/revoke/list`) ergänzt.
- Neuer Regressionstest: `api/test/security/support-occ-boundaries.test.js` (3/3 grün).
## Block 6: Critical-Signals-Aggregation im Bootstrap
Status: umgesetzt
- OCC Bootstrap enthält aggregierte Signale aus Support, Risk, Warp und Infrastructure.
- Zusätzliche Breakdown-Daten im Payload: `critical_signal_breakdown`.
## Block 7: Warp Rate-Limiting
Status: umgesetzt
- Neue Limiter-Konfiguration in `api/middleware/rateLimit.js`:
  - `warpExecutionRateLimit`
  - `supportRateLimit`
- ENV-Exposition ergänzt (`api/config/index.js`, `.env.example`, `api/config/envValidator.js`).
## SOC API Delivery Status
Status: umgesetzt
- Neuer Router `api/routes/support.js` implementiert und in `api/app.js` gemountet.
- Endpunkte gemäß SOC-Frontend-Contract implementiert (`/api/support/*`).
