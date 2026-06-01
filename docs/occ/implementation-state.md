# OCC Backend Implementation State
Stand: 2026-05-20
## Abgedeckte Backend-Bausteine
- OCC-Router bleibt strikt über `requireOwnerControlAccess` geschützt.
- OCC Bootstrap aggregiert jetzt kritische Signale aus mehreren Quellen:
  - `support_escalations` + `support_cases`
  - `risk_signals` (offene high/critical)
  - `warp_executions` (Fehler der letzten 24h)
  - `infrastructure_snapshots` (kritische Host-Indikatoren)
- Warp-Ausführung (`/owner-control/warp/execute`, `/owner-control/warp/dry-run`) ist mit dediziertem Ausführungs-Limiter geschützt.
- Warp-Ausführung läuft asynchron im Hintergrund und schreibt Finalstatus/Step-Results in `warp_executions`.
- SSH-Actions sind serverseitig whitelisted (`deploy`, `restart_service`, `backup_trigger`, `health_check`).
- Host-Policy wird über `warp_hosts.ssh_ready` und `warp_hosts.allowed_actions` durchgesetzt.
- Owner-Control Access-Verweigerungen werden in `owner_control_access_audit` protokolliert (`access_denied`).
## Neu eingeführte Betriebswerkzeuge
- CLI für OCC-Allowlist:
  - `npm run occ:owner-access -- grant ...`
  - `npm run occ:owner-access -- revoke ...`
  - `npm run occ:owner-access -- list ...`
- CLI schreibt Audit-Events (`grant`, `revoke`, `list`) in `owner_control_access_audit`.
- Infrastruktur-Collector:
  - `POST /api/internal/infrastructure-snapshots/ingest`
  - `scripts/collect-infrastructure-snapshot.sh` (Host-Metriken -> Ingest)
## Abhängigkeiten / Voraussetzungen
- Migration `110_soc_phase3_support.sql` muss angewendet sein.
- Für produktive Limits sollten die neuen ENV-Werte gesetzt werden (siehe `.env.example`).
- Für produktive SSH-Ausführung müssen `WARP_SSH_*` Variablen gesetzt und Schlüsselmaterial bereitgestellt sein.
