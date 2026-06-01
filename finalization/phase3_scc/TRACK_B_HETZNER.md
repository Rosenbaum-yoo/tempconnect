# Track B — SCC Hetzner + Claude Code Work Orders (Wellen H0–H8)

> 9 Wellen, die das SCC zum kontrollierten internen Operations-Control-Plane für Hetzner-Infrastruktur ausbauen UND Claude Code als strukturierten Entwicklungsagenten integrieren.

---

## Grundprinzip

```text
SCC = interne Team-Steuerzentrale
Hetzner = kontrollierte Infrastruktur-API mit erlaubten Safe Actions
Claude Code = Entwicklungs-/Automationsagent für Code, Runbooks, Tests, Doku, PRs
Crew = menschliche Freigabe, Betrieb, Recht, Secrets, Hosting, Marktstartentscheidung
```

**Claude Code darf nicht ungeprüft Live-Infrastruktur verändern.** Live-Hetzner-Aktionen laufen über SCC-Backend mit Whitelist, Step-up, Begründung, Audit, Dry-Run und Freigabe. Claude Code darf Code/Runbooks/Tests vorbereiten, prüfen und PRs erzeugen.

---

## WAVE H0 — Read-only Audit

**Ziel:** Echten Stand prüfen, keine Codeänderung.

**Output (Pflicht):**
- Hetzner-Dateienliste
- SCC-Routenliste
- Aktuelle Safe Actions
- Aktuelle Runbooks
- Aktuelle Tests
- Sicherheitslücken
- Abnahmematrix (welche Action hat welches Risk-Level, welche Freigabe, welcher Audit)

**Befehl:**
```bash
# Read-only Inventur
grep -r "hetzner" api/ frontend/src/staff/ --include="*.js" --include="*.ts" --include="*.tsx"
ls -la sql/migrations/ | grep -i "staff\|infra"
```

**Acceptance:**
- `docs/staff/SCC_HETZNER_AUDIT_BASELINE.md` existiert
- Keine Codeänderung in dieser Welle

---

## WAVE H1 — Hetzner Provider Hardening

**Ziel:** `staffHetznerService.js` production-safe machen.

**Pflicht:**
- **Production Stub blockieren** — Mutationen in Production ohne Token = `503 HETZNER_NOT_CONFIGURED`, niemals `stubbed-ok`
- Param-Validation pro Action
- **Resource Binding:** Aktion nur, wenn Resource Labels passen (`project=tempconnect`, `env=prod`)
- Provider Error Mapping (Hetzner-Fehler safe normalisieren)
- Timeout pro API-Call
- Action Polling für asynchrone Hetzner-Actions
- Idempotency-Key auf SCC-Ebene
- Tests:
  - `denies unknown action`
  - `denies delete/rebuild/rescue/root-reset`
  - `production without token does not return stubbed-ok`
  - `validates serverId numeric`
  - `validates lb service payload`
  - `does not log token`

**Befehl:**
```bash
cd api && npm run test -- staffHetznerService.test.js
```

**Acceptance:**
- Production-Stub-Erfolge unmöglich
- Resource Binding aktiv
- Unbekannte Actions werden abgelehnt
- Tests grün

---

## WAVE H2 — SCC Action Request Layer

**Ziel:** Live-Aktionen nicht direkt ausführen, sondern als Action Request modellieren.

**Pflicht:**
- Migration `staff_infra_action_requests`:
  ```sql
  id, provider, action_key, target_type, target_provider_id,
  params, risk_level, dry_run,
  status, -- draft, pending_approval, approved, running, succeeded, failed, cancelled
  requested_by, approved_by, reason, typed_confirmation,
  idempotency_key, provider_action_id,
  created_at, approved_at, started_at, finished_at,
  result_json
  ```
- API: `createActionRequest`, `approveActionRequest`, `executeActionRequest`, `cancelActionRequest`
- Audit Events pro Lifecycle-Schritt
- Status Lifecycle: draft → pending_approval → approved → running → succeeded/failed/cancelled

**Acceptance:**
- Migration läuft (fresh + upgrade)
- Lifecycle vollständig getestet
- Audit-Events für jeden Übergang
- Keine direkte Hetzner-Mutation ohne Action Request

---

## WAVE H3 — Runbook Professionalization

**Ziel:** Runbooks versioniert, genehmigt, nachvollziehbar.

**Pflicht:**
- Runbook Detail API
- **Runbook Versioning** (jeder Lauf speichert verwendete Version)
- **Dynamic Resource Binding** (keine hardcoded IDs 1/2/3)
- Dry-Run Pflicht vor `high`/`critical` Live Run
- Two-Person-Approval für `critical`
- Timeline mit Step Results
- Migration `staff_runbook_approvals`:
  ```sql
  id, runbook_run_id, risk_level, approval_required,
  approved_by, approved_at, approval_reason,
  second_approver_id, second_approved_at
  ```
- Tests:
  - `rejects unknown step type`
  - `dry-run does not call Hetzner`
  - `stopOnFail stops correctly`
  - `action results are persisted`
  - `runbook version is stored`
  - `critical runbook requires approval`

**Acceptance:**
- Keine hardcoded Server-IDs mehr
- Runbook-Versionen werden gespeichert
- Two-Person-Approval funktioniert für critical
- Timeline zeigt jeden Step

---

## WAVE H4 — SCC Hetzner UI Premium

**Ziel:** Profi-UI statt einfacher Tabelle.

**Hetzner Overview anzeigen:**
- **Mode:** live / stub / disabled
- API health
- Letzter erfolgreicher Sync
- Serverliste, LB-Liste, Volumes, Floating IPs, Firewalls, Datacenter
- Offene Hetzner Provider Actions
- Letzte SCC-Infra-Aktionen
- **Warnungen:** Token fehlt, Stub in Production, Backup nicht aktiv, Server nicht healthy

**Server-Detail Drawer:**
- ID, Name, Status, Typ, Datacenter, Public IP, Private IP, Labels, Backup Status
- Letzte Snapshots
- Letzte Aktionen
- Erlaubte Aktionen
- Audit-Historie

**Safe Action Drawer (vor jeder Aktion):**
- Aktion, Zielressource, Risiko, Wirkung, mögliche Kosten
- Rollback-/Recovery-Hinweis
- Dry-Run Button
- typed confirmation bei high/critical
- reason Pflichtfeld
- Step-up Pflicht

**Typed Confirmations:**
```
SNAPSHOT <server-name>
ENABLE BACKUP <server-name>
REBOOT <server-name>
ADD LB SERVICE <lb-name>
READ ONLY ON
READ ONLY OFF
```

**Runbook Timeline (pro Lauf):**
- Run ID, Runbook Key, Version, Actor, Reason
- Dry-run ja/nein, Start/Ende
- Step-by-Step Ergebnis
- Provider Action IDs
- Fehlerdetails
- Audit Link

**Befehl:**
```bash
cd frontend && npm run build:scc
```

**Acceptance:**
- UI zeigt Live/Stub/Disabled klar
- Safe Action Drawer mit allen Pflichtfeldern
- Runbook Timeline rendert Step Results
- Build:scc grün

---

## WAVE H5 — Claude Code Work Orders

**Ziel:** SCC kann Entwicklungsaufträge an Claude Code strukturiert verwalten.

**Pflicht:**
- Migration `staff_claude_work_orders`:
  ```sql
  id, title, area, -- scc, hetzner, runbooks, security, frontend, tests, docs
  prompt, risk_level,
  status, -- draft, submitted, running, pr_opened, merged, failed, rejected
  github_issue_url, github_pr_url,
  created_by, approved_by,
  created_at, updated_at,
  result_summary
  ```
- Backend Service `staffClaudeWorkOrderService.js`
- SCC UI Modul `frontend/src/staff/modules/claude-workorders/`
- GitHub Issue/PR Link Felder
- **Unsafe Prompt Classifier auf Regelbasis** (blockiert "lösche", "ssh", "secret", "production" ohne PR)
- Status Lifecycle
- Audit Events
- Doku

**Zulässige Work Order Typen:**
```
scc.hetzner_hardening
scc.runbook_addition
scc.ui_polish
scc.security_tests
scc.audit_export
scc.openapi_docs
scc.release_gate
scc.incident_runbook
scc.evidence_pack
```

**Acceptance:**
- Work Orders sind erstellbar
- Unsafe Prompts werden geblockt
- GitHub Verknüpfung funktioniert (optional)
- Status synchronisiert sich

---

## WAVE H6 — Claude Commands und Hooks

**Ziel:** Claude Code weiß exakt, was zu tun ist und was verboten ist.

**Pflicht-Dateien:**
```
.claude/commands/scc-hetzner-audit.md
.claude/commands/scc-hetzner-implement.md
.claude/commands/scc-runbook-hardening.md
.claude/commands/scc-workorder-execute.md
.claude/commands/scc-release-evidence.md
.claude/hooks/block-dangerous-infra.sh
.claude/hooks/block-secret-read.sh
.claude/hooks/require-tests-for-scc.sh
```

> **Detail-Spezifikation der Hooks:** siehe `CLAUDE_HOOKS.md`.

**Wichtig für Release-Hygiene:** `.claude/` gehört NICHT ins externe Produkt-Release-Artefakt. Existiert im Entwicklungsrepo, ist aber im Release-Verifier auf der Ausschlussliste (siehe Phase-2 WAVE 01).

**Acceptance:**
- Alle 8 Dateien existieren
- Hooks blocken gefährliche Kommandos
- `.claude/` ist im Release-Verifier ausgeschlossen
- Claude Code kennt die Commands

---

## WAVE H7 — Documentation & Crew Evidence

**Ziel:** Crew kann sehen, was gemacht wurde.

**Pflichtdokumente:**
```
docs/staff/SCC_HETZNER_OPERATIONS.md
docs/staff/SCC_CLAUDE_CODE_WORKORDERS.md
docs/staff/SCC_INFRA_ACTION_MATRIX.md
docs/staff/SCC_INCIDENT_RUNBOOK.md
docs/staff/SCC_CHANGE_MANAGEMENT.md
docs/releases/SCC_HETZNER_RELEASE_EVIDENCE.md
```

**Acceptance:**
- Alle 6 Dokumente vorhanden
- Crew kann Operations nachvollziehen
- Change Management dokumentiert

---

## WAVE H8 — Final Gate

**Ziel:** SCC-Hetzner-Go-Live entscheiden.

**GO nur wenn:**
- [ ] `build:scc` grün
- [ ] API Staff/Hetzner Tests grün
- [ ] Keine Production-Stub-Erfolge (verifiziert)
- [ ] Critical Actions brauchen Two-Person-Approval ODER sind deaktiviert
- [ ] Keine Delete/Rebuild/SSH/Shell-Actions im Code
- [ ] Audit vollständig
- [ ] Runbooks versioniert
- [ ] Work Orders nachvollziehbar
- [ ] Manuelle Hetzner-Secrets korrekt gesetzt (Owner-bestätigt)

**Verifikationsbefehle:**
```bash
cd api && npm run test:staff
cd api && npm run test:security
cd frontend && npm run build:scc
```

**Acceptance:**
- Alle Befehle grün
- Gate-Dokument `docs/releases/SCC_HETZNER_GO_LIVE_DECISION.md` ausgefüllt
- Owner-Unterschrift

---

## Hetzner Action Matrix (Schnellübersicht)

| Aktion | Risiko | Freigabe |
|---|---:|---|
| Infra Overview lesen | low | Staff-Login |
| Server Snapshot erstellen | medium | Step-up + Reason |
| Backup aktivieren | high | Step-up + typed confirmation |
| Server reboot | critical | Step-up + typed confirmation + optional 2-Person |
| LB Service add | high | Step-up + Reason |
| Feature Flag read-only aktivieren | critical | Step-up + typed confirmation |
| Maintenance Banner aktivieren | low/medium | Reason |

**NIE erlaubt:** `server.delete`, `server.rebuild`, `server.reset_password`, `server.enable_rescue`, `firewall.delete`, `floating_ip.delete`, `volume.delete`, `network.delete`, `ssh.exec`, `shell.exec`, `arbitrary_api_path`, `raw curl`, `custom script upload`.

**Spätere Version, nur nach extra Prüfung:** `firewall.attach/detach`, `floating_ip.assign`, `server.poweron/poweroff`, `load_balancer.remove_target`, `volume.attach/detach`, `managed database PITR trigger`, `DNS cutover` — eigene Runbooks, klare Rückfallstrategie, Two-Person-Approval.

> **Detail in `WORK_ORDERS.md`.**

---

## Übergang nach Track B

Nach H8: SCC ist auf Profi-/Enterprise-Operations-Level. Kombiniertes Gate-Pass mit Track A → SCC ist produktiv freigegeben.

**Globale Gates** liegen in `GATES.md`.
