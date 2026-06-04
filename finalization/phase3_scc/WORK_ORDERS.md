# Claude Code Work Orders + Hetzner Action Matrix

> Strukturierter Übergabeprozess: Staff erstellt im SCC einen Work Order → Claude Code arbeitet ihn ab → PR → Review → Merge. Plus: vollständige Hetzner Action Matrix mit Risk-Levels und Freigaben.

---

## 1. Work Order Lifecycle

```text
draft → submitted → running → pr_opened → merged
                                       ↘ failed
                                       ↘ rejected
```

**Schritt für Schritt:**
1. Staff erstellt im SCC eine Work Order
2. SCC speichert Work Order in `staff_claude_work_orders`
3. SCC erstellt optional GitHub Issue mit strukturiertem Prompt
4. Claude Code Action oder lokale Claude-Code-Session bearbeitet Issue/Prompt
5. Claude Code erzeugt PR oder Patch
6. CI läuft
7. Crew reviewed
8. Merge nur nach grünem Gate
9. SCC synchronisiert Status und verlinkt PR/Commit
10. Release-Notiz / Evidence wird erzeugt

**Warum dieser Umweg?**
- Claude Code ist Entwicklungsagent, kein ungeprüfter Production-Operator
- Live-Secrets dürfen nicht in Claude-Kontext landen
- Infrastrukturmutationen brauchen menschliche Verantwortung
- Enterprise-Kunden erwarten Change Management, Audit, Freigabe

---

## 2. Zulässige Work Order Typen

```text
scc.hetzner_hardening      — Track B WAVE H1 (Provider hardening)
scc.runbook_addition       — Track B WAVE H3 (neue Runbooks)
scc.ui_polish              — Track A WAVE 04 (UI/UX)
scc.security_tests         — Track A WAVE 12 (Tests/CI)
scc.audit_export           — Track A WAVE 10 (Audit)
scc.openapi_docs           — Phase-2 WAVE 10 (OpenAPI)
scc.release_gate           — Phase-2 WAVE 15 (Evidence Pack)
scc.incident_runbook       — Phase-2 WAVE 12 (Ops/Incident)
scc.evidence_pack          — Phase-2 WAVE 15
```

---

## 3. Nicht zulässige Work Orders (Classifier blockt)

```text
"Führe auf Production SSH aus."
"Lösche Server."
"Gib Secrets aus."
"Setze .env live."
"Ändere DNS ohne Review."
"Deploy direkt auf Production."
"Schalte Firewall-Regeln live ohne PR/Runbook."
```

**Unsafe Prompt Classifier (Regelbasis):**
- Blockierte Wörter: `lösche live`, `delete production`, `ssh prod`, `kill -9`, `rm -rf`, `Secret ausgeben`, `Token zeigen`
- Blockierte Phrasen: "direkt live ausführen", "ohne Review", "Owner-Freigabe umgehen"
- Status der Work Order bei Treffer: `rejected` mit Begründung

---

## 4. Work Order Format

```yaml
title: "Track B WAVE H1 — staffHetznerService Production Stub blockieren"
area: scc.hetzner_hardening
risk_level: medium  # low | medium | high | critical
prompt: |
  Erweitere staffHetznerService.js so, dass in Production
  ohne HETZNER_CLOUD_TOKEN:
  - Read-Overview-Pfade: 200 mit Mode=disabled klar markiert
  - Mutationen: 503 HETZNER_NOT_CONFIGURED
  - niemals stubbed-ok für Mutationen

  Tests ergänzen in staffHetznerService.test.js:
  - "production without token does not return stubbed-ok"
  - "read overview returns HETZNER_NOT_CONFIGURED in production without token"

  Keine .env lesen. Keine Secrets ausgeben.
acceptance_criteria:
  - npm run test -- staffHetznerService.test.js grün
  - Manuelle Verifikation: NODE_ENV=production ohne Token → 503
created_by: dennis@tempconnect.example
approved_by: null  # wird vor Submit gesetzt
github_issue_url: null  # füllt SCC nach Submit
github_pr_url: null     # füllt sich nach PR-Erstellung
```

---

## 5. Approval-Regeln je Risk Level

| Risk Level | Erstellung | Approval | Befehlsausführung |
|---|---|---|---|
| `low` | Staff | optional | Claude Code lokal/PR |
| `medium` | Staff | Lead-Approval empfohlen | Claude Code PR + Review |
| `high` | Staff | Lead-Approval Pflicht | Claude Code PR + Review + CI |
| `critical` | Staff | Two-Person-Approval | Claude Code PR + Review + CI + Owner |


## weitere Regel 
- Admin aus plattform sollte niemals den /Staff Bereich verwalten können ... 
- Admins sind im /Staff Center ohne Rechte 
- keine Weiterleitungen aus Plattform in den /Staff Bereich 
? !
---

## 6. Hetzner Action Matrix (vollständig)

### 6.1 Erlaubt ab Version 1

| Aktion | Risiko | Freigabe | Audit | Bemerkung |
|---|---:|---|---|---|
| Infra Overview lesen | low | Staff-Login | nein | Nur GET |
| Server Snapshot erstellen | medium | Step-up + Reason | ja | Vor Deploy/Incident |
| Backup aktivieren | high | Step-up + typed confirmation | ja | Kann Kosten erzeugen |
| Server reboot | critical | Step-up + typed confirmation + 2-Person | ja | Nur Incident/Runbook |
| LB Service add | high | Step-up + Reason | ja | Nur validierte Payload |
| Feature Flag read-only aktivieren | critical | Step-up + typed confirmation | ja | Plattformschutz |
| Maintenance Banner aktivieren | low/medium | Reason | ja | Kundenkommunikation |

### 6.2 NIE erlaubt (Hard-Block)

```text
server.delete
server.rebuild
server.reset_password
server.enable_rescue
server.poweroff (ohne Incident-Freigabe)
firewall.delete
firewall.apply_to_resources (ohne Review)
floating_ip.delete
volume.delete
network.delete
ssh.exec
shell.exec
arbitrary_api_path
raw curl
custom script upload
```

**Diese Actions tauchen in keiner Whitelist auf. Hooks blocken sie zusätzlich.**

### 6.3 Spätere Version (nur nach extra Prüfung)

```text
firewall.attach / detach
floating_ip.assign
server.poweron / poweroff
load_balancer.remove_target
volume.attach / detach
managed database PITR trigger
DNS cutover
```

**Pflicht vor Aktivierung:**
- Eigene Runbooks pro Aktion
- Klare Rückfallstrategie dokumentiert
- Two-Person-Approval erforderlich
- Owner-Freigabe explizit

---

## 7. Typed Confirmations

Für high/critical Actions verlangt die UI ein exaktes Tippen:

```text
SNAPSHOT <server-name>
ENABLE BACKUP <server-name>
REBOOT <server-name>
ADD LB SERVICE <lb-name>
READ ONLY ON
READ ONLY OFF
```

Wenn der Server `staging-web-01` heißt, muss der Staff `REBOOT staging-web-01` exakt eintippen. Kein Pre-Fill, kein Copy-Paste-Hilfe.

---

## 8. Action Request Lifecycle (Track B WAVE H2)

```
draft
  → pending_approval (bei medium/high/critical)
    → approved
      → running (Hetzner Action ID generiert)
        → succeeded
        → failed
  → cancelled (jederzeit vor running)
```

**Pflichtfelder pro Status:**
- `draft`: alle Parameter, Risk Level, Reason
- `pending_approval`: `requested_by`, `idempotency_key`
- `approved`: `approved_by`, `approved_at`
- `running`: `provider_action_id`, `started_at`
- `succeeded` / `failed`: `finished_at`, `result_json`

**Audit:** Jeder Übergang erzeugt einen Audit-Eintrag in `staff_control_audit_log` mit Reason, Actor, IP.

---

## 9. Resource Binding Regel

**Keine hardcoded IDs.** Stattdessen pro Action:

1. Resource per `provider_id` + `expected_name` + `labels` prüfen
2. Aktion **nur** wenn Resource-Labels passen:
   ```
   project=tempconnect
   env=prod  (oder env=staging je nach Kontext)
   ```
3. Runbook validiert Ressource **vor** Aktion
4. Wenn Resource nicht den Labels entspricht → Action wird abgelehnt mit klarem Fehler

---

## 10. Production-Stub-Regel (kritisch)

```text
if NODE_ENV=production and HETZNER_CLOUD_TOKEN fehlt:
  - Read-only Overview darf klar HETZNER_NOT_CONFIGURED melden
  - Mutationen müssen 503 HETZNER_NOT_CONFIGURED liefern
  - NIEMALS stubbed-ok
```

**Verifikation in Track B WAVE H1 Tests.**

---

## 11. SCC Work Order vs. direkte Aktion

| Use Case | SCC Action Request | Claude Work Order |
|---|---|---|
| Snapshot vor Deploy | ja, direkt im SCC | nein |
| Backup aktivieren für neuen Server | ja, direkt im SCC | nein |
| Neue Hetzner Safe Action hinzufügen | nein | ja (`scc.hetzner_hardening`) |
| Bestehende Runbook erweitern | nein | ja (`scc.runbook_addition`) |
| UI-Bug in Server-Liste fixen | nein | ja (`scc.ui_polish`) |
| Security-Test ergänzen | nein | ja (`scc.security_tests`) |

**Faustregel:**
- **SCC Action Request** = Live-Aktion auf laufender Infrastruktur (Snapshot, Reboot, LB-Service)
- **Claude Work Order** = Code-Änderung am Repo (neue Features, Fixes, Tests, Doku)

Sie sind nicht das Gleiche und vermischen sich nicht.

---

## 12. Was Claude Code mit einem Work Order tun darf

✓ Code in den Dateien des `area`-Scopes ändern
✓ Tests ergänzen
✓ Migration erstellen (nur in `sql/migrations/`)
✓ Doku aktualisieren
✓ PR mit klarer Beschreibung erzeugen
✓ Status der Work Order auf `pr_opened` aktualisieren

## Was Claude Code mit einem Work Order NICHT tun darf

✗ `.env`-Dateien lesen oder schreiben
✗ Secrets in Code, Tests oder Doku einfügen
✗ Hetzner-Live-API direkt aufrufen
✗ Production-Datenbanken erreichen
✗ Direkten Push auf `main` / Release-Branch
✗ Anderen Work Order ohne neuen Auftrag bearbeiten
✗ Hooks deaktivieren

> **Technische Durchsetzung:** Hooks in `CLAUDE_HOOKS.md`.

---

## 13. Status-Synchronisation SCC ↔ GitHub

Wenn GitHub-Integration aktiv (Owner-Aufgabe):

| GitHub Event | SCC Status |
|---|---|
| Issue erstellt | `submitted` |
| Branch erstellt | `running` |
| PR geöffnet | `pr_opened` |
| PR merged | `merged` |
| PR closed ohne merge | `rejected` |
| CI failed auf PR | `failed` (mit Link zum CI-Run) |

**Manuelle Sync ohne GitHub:** Staff aktualisiert Status im SCC-UI nach jedem Schritt.

---

## 14. Beispiel: Vollständiger Work Order Ablauf

```
1. Staff im SCC erstellt Work Order:
   - title: "Track A WAVE 12 — Playwright Smoke Test für SCC Login"
   - area: scc.security_tests
   - risk_level: low
   - prompt: "Erstelle Playwright Smoke Test in frontend/e2e/scc-smoke.spec.ts..."

2. SCC speichert in staff_claude_work_orders, Status: submitted

3. Optional: SCC erstellt GitHub Issue mit Prompt

4. Claude Code Session öffnet das Repo, liest:
   - CLAUDE.md
   - finalization/00_RULES.md
   - finalization/phase3_scc/TRACK_A_PROFI.md (WAVE 12)

5. Claude Code:
   - Erstellt frontend/e2e/scc-smoke.spec.ts
   - Aktualisiert frontend/playwright.config.ts falls nötig
   - Erzeugt PR

6. CI läuft → grün

7. Crew Review → Approved

8. Merge

9. SCC Status: merged, mit Link zu Commit
```

Das ist Profi-Level. Keine direkten Production-Eingriffe, alles auditierbar, alles zurückverfolgbar.
