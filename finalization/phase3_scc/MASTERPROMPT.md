# Masterprompt für Claude Code — Phase 3 SCC

> **Zweck:** Diesen Prompt zu Beginn jeder SCC-Session in Claude Code einfügen. Er aktiviert die Phase-3-Schicht und definiert die Arbeitsregeln für Track A und Track B.

---

## Empfohlener Session-Start (kombiniert)

```text
Du arbeitest im Repository TempConnect auf dem Branch release/enterprise-premium-market-ready (oder release/scc-profi-level, falls separater SCC-Branch verwendet wird).

Lies ZUERST in dieser Reihenfolge:
1. CLAUDE.md (Repo-Root)
2. AGENTS.md (falls vorhanden)
3. finalization/00_RULES.md (Phase 1 Regeln)
4. finalization/phase3_scc/README.md (Übersicht SCC-Phase)
5. finalization/phase3_scc/TRACK_A_PROFI.md (SCC-Wellen 00-13)
6. finalization/phase3_scc/TRACK_B_HETZNER.md (Hetzner + Work Orders H0-H8)
7. finalization/phase3_scc/CLAUDE_HOOKS.md (Schutz-Hooks)
8. finalization/phase3_scc/WORK_ORDERS.md (Action Matrix + Lifecycle)
9. finalization/phase3_scc/GATES.md (SCC Gates A-E + H8)
10. finalization/phase3_scc/MANUAL_TASKS.md (was du NICHT tun kannst)

Ziel:
Bringe das Staff Control Center (SCC) auf professionelles Enterprise-Operations-Level — sowohl Identity/Security/UI (Track A) als auch Hetzner-Steuerung und Claude-Code-Work-Order-Integration (Track B).

Aktuelle Basis (im Repo vorhanden):
- SCC React-App unter frontend/src/staff
- SCC Build über frontend/vite.config.staff.ts
- SCC API unter /staff/api
- Eigene Staff-Session tc.staff.sid
- Harte tempconnect_staff-Allowlist
- staff_control_audit_log
- Commercial Inbox
- Customer Requests
- Subscription Requests
- Runbooks
- Hetzner Safe Actions (whitelisted)
- Data Explorer mit vordefinierten Views
- 55 PASS / 0 FAIL bei gezielten SCC-Tests
- frontend npm run build:scc grün
- HTMLHint grün

Zielwerte:
- SCC technische Basis: 9,5 / 10
- SCC Buildfähigkeit: 10 / 10
- SCC Security Boundary: 10 / 10
- SCC UX/Profi-Level: 9,3+ / 10
- SCC Enterprise Operations: 9,0+ / 10
- SCC Hetzner Control Plane: 9,3+ / 10
- SCC Claude Work Orders: 9,0+ / 10

Arbeitsregeln (nicht verhandelbar):
- SCC ist intern. Kein Kunde, Org Owner oder normaler Admin darf Zugriff erhalten.
- Kein Fake-Enterprise.
- Keine freie Shell aus SCC.
- Kein freies SQL.
- Keine unkontrollierte Impersonation.
- Keine Secrets ausgeben oder lesen.
- Keine mutierende Aktion ohne Audit.
- Kritische Aktionen brauchen Step-up, Confirm, Reason und ggf. typed confirmation.
- Production darf nicht mit unsicheren Staff-Defaults starten.
- Production ohne HETZNER_CLOUD_TOKEN darf NIEMALS stubbed-ok für Mutationen liefern.
- Keine Live-Hetzner-Aktionen direkt aus Claude Code — nur über SCC Action Request Layer.
- Claude Code darf Code/Runbooks/Tests/Doku umsetzen, aber keine ungeprüften Live-Hetzner-Aktionen durchführen.
- Owner-Freigabe bei Backend-Eingriffen erforderlich.
- .claude/ gehört nicht ins externe Release-Artefakt.

Arbeite Wave für Wave:

Track A (SCC Profi-Level):
SCC WAVE 00 Scope
SCC WAVE 01 Access Boundary
SCC WAVE 02 echte Step-up Security
SCC WAVE 03 SCC Security Middleware
SCC WAVE 04 Profi UI/UX
SCC WAVE 05 Commercial Inbox
SCC WAVE 06 Subscription/Individuell
SCC WAVE 07 Support/SOC/SCC
SCC WAVE 08 Operations/Runbooks/Infra-Guardrails
SCC WAVE 09 Risk/Trust/PII
SCC WAVE 10 Audit/Decisions
SCC WAVE 11 Staff Access Management
SCC WAVE 12 Tests/CI
SCC WAVE 13 Release Integration

Track B (Hetzner + Claude Work Orders):
WAVE H0 Read-only Audit
WAVE H1 staffHetznerService Hardening
WAVE H2 staff_infra_action_requests Lifecycle
WAVE H3 Runbook Versioning + Approval + Timeline
WAVE H4 SCC Hetzner Premium UI
WAVE H5 Claude Code Work Orders
WAVE H6 Claude Commands + Safety Hooks
WAVE H7 Docs + Crew Evidence
WAVE H8 Final SCC Hetzner Gate

Reihenfolge:
- Track A WAVE 00-04 zuerst (Foundation + UI-Basis)
- Track B WAVE H0 kann parallel laufen (read-only)
- Track A WAVE 05-08 vor Track B WAVE H1+ (Operations-Guardrails müssen verstanden sein)
- Track B WAVE H1-H8 nach Track A WAVE 08
- Track A WAVE 09-13 parallel oder im Anschluss

Nach jeder Wave liefere:
- Geänderte Dateien (Liste)
- Migrationen (falls neue Tabellen)
- Neue/angepasste APIs
- Neue/angepasste UI-Module
- Ausgeführte Checks (Befehle + Output)
- Ergebnis pro Aufgabe: PASS / FAIL
- Sicherheitsbewertung
- Offene manuelle Aufgaben (für Owner)
- Score-Auswirkung (welche der 7 SCC-Score-Dimensionen)
- Nächste Wave / Empfehlung

Pflichtchecks pro Welle (mindestens):
cd api && npm run test:staff
cd api && npm run test:security
cd frontend && npm run build:scc

Bei Track B zusätzlich:
cd api && npm run test -- staffHetznerService
cd api && npm run test -- staffRunbookService

Bei Release-relevanten Änderungen (Track A WAVE 13):
./scripts/release-verify.sh dist/tempconnect-<version>.zip

Endzustand:
- npm run build:scc grün
- npm run test:scc grün
- SCC ESLint grün
- SCC Playwright Smoke grün
- Staff Access Boundary bewiesen
- MFA/Step-up produktionsreif
- Commercial Inbox arbeitsfähig
- Audit/Decision Evidence vollständig
- Hetzner Production Stub blockiert
- Resource Binding aktiv
- Work Orders nachvollziehbar
- Release Verify grün
- Alle SCC Gates A-E + H8 grün

GO nur wenn alle Gates erfüllt UND manuelle Aufgaben aus MANUAL_TASKS.md vom Owner bestätigt.

Beginne mit Track A WAVE 00 (oder einer spezifischen Welle, die du nennst).
```

---

## Pro-Welle-Session-Start (kürzer)

Wenn du nur an einer spezifischen SCC-Welle arbeiten willst:

```text
Arbeite an [WAVE-NAME] aus finalization/phase3_scc/[TRACK_A_PROFI.md | TRACK_B_HETZNER.md].

Lies vorher:
- CLAUDE.md
- finalization/00_RULES.md
- finalization/phase3_scc/README.md (Übersicht)
- Die spezifische Track-Datei (nur Abschnitt der Welle)
- finalization/phase3_scc/CLAUDE_HOOKS.md (Schutz-Hooks beachten)

Liefere am Ende:
- Status pro Aufgabe (PASS / FAIL)
- Ausgeführte Befehle und Output
- Offene Blocker
- Score-Auswirkung
- Empfehlung: weiter zu nächster Welle oder Blocker zuerst

Branch: release/enterprise-premium-market-ready (oder release/scc-profi-level)
```

---

## Track-A-Only Prompt (Security/UI-Fokus)

```text
Arbeite ausschließlich an Track A (SCC Profi-Level).

Lies:
- CLAUDE.md
- finalization/00_RULES.md
- finalization/phase3_scc/README.md
- finalization/phase3_scc/TRACK_A_PROFI.md

Ignoriere Track B (Hetzner) in dieser Session.

Beginne mit der angegebenen Welle und liefere nach jeder Welle den Standard-Welle-Report.
```

---

## Track-B-Only Prompt (Hetzner/Claude-Work-Orders-Fokus)

```text
Arbeite ausschließlich an Track B (SCC Hetzner + Claude Work Orders).

Voraussetzung: Track A WAVE 01-03 müssen abgeschlossen sein (Security-Basis). Falls nicht, STOP und melde das.

Lies:
- CLAUDE.md
- finalization/00_RULES.md
- finalization/phase3_scc/README.md
- finalization/phase3_scc/TRACK_B_HETZNER.md
- finalization/phase3_scc/WORK_ORDERS.md
- finalization/phase3_scc/CLAUDE_HOOKS.md

Beginne mit WAVE H0 (Read-only Audit).
```

---

## Notfall-Prompt (Production Stub Verdacht)

```text
Verdacht: Production läuft mit Hetzner Stub und liefert stubbed-ok für Mutationen.

Aufgabe:
1. staffHetznerService.js prüfen
2. NODE_ENV=production + fehlender HETZNER_CLOUD_TOKEN → was passiert bei Mutation?
3. Wenn stubbed-ok zurückkommt: P0-Sicherheitslücke, sofort fixen mit:
   - Mutationen → 503 HETZNER_NOT_CONFIGURED
   - Tests ergänzen
   - Manuelles Verifizieren
4. Audit-Eintrag erzeugen über den Vorfall

Branch: release/enterprise-premium-market-ready
```

---

## Was diese Prompts bewirken

1. **Klare Trennung** Track A vs. Track B — keine Vermischung
2. **Erzwingen** der Schutz-Hooks aus `CLAUDE_HOOKS.md`
3. **Verlangen** den Standard-Welle-Report nach jeder Welle
4. **Schließen aus**, dass Claude Code Live-Hetzner-Aktionen ausführt
5. **Erinnern** an die manuellen Aufgaben, die der Owner machen muss
6. **Verknüpfen** mit Phase 1/2 — keine Doppel-Arbeit

---

## Kurzfassung

SCC-Profi-Level heißt:
```
- Staff-Zugriff hart abgesichert (Allowlist, MFA, Rate Limit, Audit)
- Step-up ist echte Reauth, nicht Confirm-Dialog
- UI ist professionell (keine alert(), kein window.confirm für Profi-Flows)
- Audit-Evidence vollständig (Decision Log, Export, Retention)
- Hetzner-Steuerung über kontrollierte Whitelist
- Resource Binding statt hardcoded IDs
- Production-Stub blockiert (keine stubbed-ok in Production)
- Claude Code Work Orders strukturiert
- Schutz-Hooks technisch durchgesetzt
- Release-Artefakt enthält keine .claude, keine Secrets
```

**Wenn einer dieser Punkte offen ist → SCC GO-LIVE = NO GO.**
