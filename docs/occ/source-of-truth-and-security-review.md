# OCC Source-of-Truth & Security Review
Stand: 2026-05-20
## Source-of-Truth
- OCC Zugriff: `occ_owner_access` (+ Audit in `owner_control_access_audit`).
- OCC Entscheidungen: `occ_decisions`.
- OCC Risiko-Signale: `risk_signals`.
- OCC Warp-Historie: `warp_executions`, `warp_runbooks`, `warp_hosts`.
- Infrastruktur-Snapshots für OCC-Kritik-Signale: `infrastructure_snapshots`.
## Security-Grenzen
- Support-Zugang ersetzt nicht OCC-Zugang.
- OCC-Zugang ersetzt nicht Support-Agent-Zugang.
- Warp-Ausführung erfordert OCC-Zugang und ist rate-limitiert.
- Access-Denials im OCC-Pfad werden auditierbar persistent gespeichert.
## Verbleibende Sicherheitsbeobachtungen
- Optionaler Step-Up (MFA) für kritische Warp-Kommandos ist weiterhin empfehlenswert.
- Für `owner-access-cli` sollte produktiv ein klarer Betriebsprozess für `--performed-by` etabliert werden.
