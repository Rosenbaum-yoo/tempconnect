# Masterprompt für Claude Code — Release-Phase

> **Zweck:** Diesen Prompt zu Beginn der Release-Phase in Claude Code einfügen. Er aktiviert die Phase-2-Schicht und gibt das Arbeitsprinzip vor.

---

## Empfohlener Session-Start

```text
Du arbeitest im Repository TempConnect auf dem Branch release/enterprise-premium-market-ready.

Lies ZUERST in dieser Reihenfolge:
1. CLAUDE.md (Repo-Root)
2. AGENTS.md (falls vorhanden)
3. finalization/00_RULES.md (Phase 1 Regeln)
4. finalization/phase2_release/README.md (Übersicht Release-Phase)
5. finalization/phase2_release/WAVES.md (alle 16 Release-Wellen)
6. finalization/phase2_release/GATES.md (Gates A-F)
7. finalization/phase2_release/SCORING.md (Score-Modell)
8. finalization/phase2_release/MANUAL_TASKS.md (was du NICHT tun kannst)

Ziel:
Erledige den kompletten Rest der Finalisierung und bringe TempConnect vor Marktstart auf vollständige Releasefähigkeit.

Wichtig:
Vollständige Releasefähigkeit bedeutet NICHT, dass .env, node_modules, Secrets, .git, .claude oder lokale Artefakte im Release enthalten sind. Diese Dinge müssen ausgeschlossen werden. Sie sind keine fehlenden Bestandteile, sondern Release-Blocker.

Zielwerte:
- SaaS Professional Readiness mindestens 9,5/10
- Enterprise Premium Readiness mindestens 9,0/10
- Release-Hygiene 10/10
- Marktstart GO nur nach vollständiger Abnahme aller Gates A-F + Burn-in ≥ 7 Tage

Arbeitsregeln:
- Keine kosmetische Fertigmeldung.
- Kein Feature gilt als fertig ohne Build/Test/Audit/Doku/Abnahmebeweis.
- Keine echten Secrets ausgeben.
- Keine Enterprise-Funktion sichtbar verkaufen, die nicht produktionsreif ist.
- SSO entweder produktionsreif machen oder vollständig soft-locken.
- Tenant-Isolation muss beweisbar sein.
- RLS muss deny-by-default sein.
- Frontend build:all muss grün sein.
- API test:ci muss sauber beenden (keine offenen Handles).
- Release verify muss grün sein.
- Keine .env / .git / node_modules / .claude / .agents / .vercel / Coverage-Artefakte im Release.
- Alle manuellen Aufgaben separat in docs/releases/MANUAL_TASKS_CHECKLIST.md.
- Owner-Freigabe bei Backend-Eingriffen erforderlich (siehe Agenten-Rollenaufteilung).

Arbeite Welle für Welle in der Reihenfolge aus WAVES.md:
WAVE 00 Freeze → WAVE 01 Hygiene → WAVE 02 Secrets → ... → WAVE 16 Burn-in

Nach jeder Welle liefere:
- Geänderte Dateien (Liste)
- Ausgeführte Checks (Befehle + Output)
- Ergebnis pro Aufgabe: PASS / FAIL
- Offene Blocker (mit Kategorie, Priorität, ETA)
- Manuelle Aufgaben für Owner
- Score-Auswirkung (SaaS Professional, Enterprise Premium)
- Entscheidung: weiter zur nächsten Welle / stoppen wegen Blocker

Am Ende erstelle:
- docs/releases/PILOT_GO_LIVE_DECISION.md
- docs/releases/ENTERPRISE_GO_LIVE_DECISION.md
- docs/releases/MARKET_START_GO_LIVE_DECISION.md
- docs/enterprise-readiness/ENTERPRISE_GAP_REGISTER.md
- finalen Release-Artefakt-Report

GO darf nur vergeben werden, wenn:
- Gate A (Technical) grün
- Gate B (Security) grün
- Gate C (Tenant) grün
- Gate D (Product) grün
- Gate E (Operations) grün
- Gate F (Commercial/Legal) grün
- Burn-in (WAVE 16) mindestens 7 Tage stabil

Beginne mit WAVE 00.
```

---

## Pro-Welle-Session-Start (kürzer)

Wenn du nicht den vollen Master-Prompt schicken willst, sondern eine spezifische Welle:

```text
Arbeite an WAVE XX aus finalization/phase2_release/WAVES.md.

Lies vorher:
- CLAUDE.md
- finalization/00_RULES.md
- finalization/phase2_release/WAVES.md (nur Abschnitt WAVE XX)
- Phase-1-Vorgänger laut Mapping in README.md

Liefere am Ende der Welle:
- Status pro Aufgabe (PASS / FAIL)
- Ausgeführte Befehle und Output
- Offene Blocker
- Score-Auswirkung
- Empfehlung: weiter zu WAVE YY oder Blocker zuerst klären

Branch: release/enterprise-premium-market-ready
```

---

## Notfall-Prompt (Burn-in Issue)

Wenn während Burn-in (WAVE 16) ein P0/P1 auftritt:

```text
Burn-in-Issue im Preprod-Betrieb auf release/enterprise-premium-market-ready.

Symptom:
[Beschreibung des Issues]

Logs / Fehlermeldung:
[Output]

Aufgabe:
1. Triage gemäß finalization/SPECIAL_bugboard_triage.md
2. Klassifizieren: P0 / P1 / P2
3. Root Cause finden
4. Fix vorschlagen mit:
   - Retrofit-Risiko
   - Rollback-Strategie
   - Feature-Flag (ja/nein)
   - Test, der die Regression verhindert
5. Burn-in-Timer NICHT zurücksetzen, sondern Issue dokumentieren in docs/releases/BURN_IN_INCIDENTS.md
6. Entscheidung: Burn-in fortsetzen / pausieren / neu starten

Branch: release/enterprise-premium-market-ready
```

---

## Was dieser Prompt bewirkt

1. **Aktiviert beide Phasen** — Phase-1-Regeln bleiben, Phase 2 ergänzt
2. **Setzt verbindliche Zielwerte** — Score statt Gefühl
3. **Erzwingt Branch-Disziplin** — keine ZIP-Hopperei
4. **Verbietet kosmetische Fertigmeldungen** — Beweis oder kein PASS
5. **Trennt Claude-Code-Aufgaben von Owner-Aufgaben** — keine halluzinierten Secret-Rotationen
6. **Verlangt Score-Reporting** — du siehst objektiv, wie weit es ist

---

## Kurzfassung

```text
Vollständige Releasefähigkeit heißt:
Alles Notwendige ist enthalten.
Alles Gefährliche, Lokale oder Generierbare ist ausgeschlossen.
Alle Builds, Tests, Audits und Release-Checks sind grün.
Alle Enterprise-Versprechen sind bewiesen oder deaktiviert.
Alle manuellen Rechts-, Infrastruktur-, Secret- und Commercial-Punkte sind separat erledigt.
```

**Wenn einer dieser Punkte offen ist → MARKTSTART = NO GO.**
