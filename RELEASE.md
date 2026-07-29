# TempConnect — Release Runbook (verschoben)

> **Diese Datei ist kein Inhalt mehr, sondern ein Wegweiser.**
> Das gültige Release Runbook steht in **[docs/RELEASE_RUNBOOK.md](./docs/RELEASE_RUNBOOK.md)**.

## Warum

Es gab zwei Release-Runbooks mit fast identischem Inhalt (394 vs. 397 Zeilen), die in genau
einem Punkt auseinanderliefen — ausgerechnet beim **Release-Artefakt**:

| | Diese Datei (Wurzel) | `docs/RELEASE_RUNBOOK.md` |
|---|---|---|
| Artefaktbau | CI-Job `release-artifact` | lokal via `scripts/release-package.sh` / `.ps1` |

Zwei Runbooks für denselben Vorgang sind gefährlich, wenn jemand ihnen während eines
Produktionsdeployments folgt: Wer die eine Datei liest, baut das Artefakt lokal, wer die
andere liest, zieht es aus der CI — und niemand merkt, dass beide Wege gleichzeitig als
verbindlich dokumentiert waren.

**Aufgelöst wurde das nicht nach Bauchgefühl:** die Go-Live-Checkliste
[`docs/GO_LIVE_FINAL.md`](./docs/GO_LIVE_FINAL.md) benennt den CI-Job `release-artifact`
ausdrücklich als kanonischen Artefaktpfad. Dieser Abschnitt wurde deshalb nach
`docs/RELEASE_RUNBOOK.md` übernommen; der lokale Bau steht dort weiterhin, jetzt klar als
**Rückfallweg** gekennzeichnet. Ebenfalls übernommen: die Liste der Pflichtdateien, die es
nur hier gab. Es geht nichts verloren.

*Zusammengeführt am 2026-07-26 (Audit-Backlog B-4).
Die Historie dieser Datei bleibt über `git log --follow RELEASE.md` erreichbar.*

## Weiterführend

- Go-Live-Checkliste: [docs/GO_LIVE_FINAL.md](./docs/GO_LIVE_FINAL.md)
- Technischer Produktionspfad: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Sicherung und Wiederanlauf: [docs/BACKUP_DISASTER_RECOVERY.md](./docs/BACKUP_DISASTER_RECOVERY.md)
