# TempConnect — Go-Live-Checkliste (verschoben)

> **Diese Datei ist kein Inhalt mehr, sondern ein Wegweiser.**
> Die verbindliche Go-Live-Checkliste steht in **[docs/GO_LIVE_FINAL.md](./docs/GO_LIVE_FINAL.md)**.

## Warum

Es gab drei Listen für denselben Zweck:

| Datei | Rolle |
|---|---|
| **[docs/GO_LIVE_FINAL.md](./docs/GO_LIVE_FINAL.md)** | **Die gültige Liste.** Versioniert, mit Enterprise-Abnahmegate, kanonischem CI-Artefaktpfad und den konkreten Backup-/Restore-Skripten. |
| `GO-LIVE.md` (diese Datei) | Ältere, fast identische Kopie — die zugleich von sich behauptete, „die einzige" zu sein. |
| [MARKTSTART-CHECKLISTE.md](./MARKTSTART-CHECKLISTE.md) | Verweist bereits seit längerem auf die gültige Liste. |

Zwei Dokumente, die jeweils von sich sagen, sie seien maßgeblich, sind schlimmer als eines,
das fehlt: man hakt die falsche Liste ab und hält den Start für abgesichert. Der Inhalt war
zu 98 % deckungsgleich; die vier Verweise, die es nur hier gab (`RELEASE_RUNBOOK.md`,
`BACKUP.md`, `BACKUP_DISASTER_RECOVERY.md`, `MONITORING.md`), stehen jetzt drüben unter
**Referenzen**. Es geht nichts verloren.

*Zusammengeführt am 2026-07-26 (Audit-Backlog B-4, Remediation D-4).
Die Historie dieser Datei bleibt über `git log --follow GO-LIVE.md` erreichbar.*

## Weiterführend

- Technischer Produktionspfad: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Release-, Monitoring- und Rollback-Ablauf: [docs/RELEASE_RUNBOOK.md](./docs/RELEASE_RUNBOOK.md)
- Enterprise-Abnahmegate (G0–G7): [docs/ENTERPRISE_GO_LIVE_GATE.md](./docs/ENTERPRISE_GO_LIVE_GATE.md)
