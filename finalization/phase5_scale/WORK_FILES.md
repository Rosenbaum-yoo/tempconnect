# Work Files — die 5 Selbststeuerungs-Arbeitsdateien

> Phase 5 lebt von Arbeitsdateien als Projektgedächtnis. Sie sparen Tokens: statt Wiederholung in Chat liest Claude Code seinen Stand aus Dateien. Pflicht für effizientes Arbeiten.

---

## Warum Arbeitsdateien?

Bei einer Welle dieser Größe (18 Phasen) würde Claude Code sonst:
- in jeder Session den ganzen Kontext neu aufbauen (teuer)
- vergessen, was schon erledigt ist (Doppelarbeit)
- den Überblick über Risiken verlieren

Arbeitsdateien sind **externes Gedächtnis**. Claude Code liest sie am Session-Anfang gezielt, statt alles im Chat zu wiederholen.

---

## Die 5 Dateien

```
docs/finalization/10_300_customer_readiness_matrix.md
docs/finalization/finalization_worklog.md
docs/finalization/final_acceptance_report_10_300_customers.md
docs/finalization/open_risks_and_blockers.md
docs/finalization/changed_files_index.md
```

---

## 1. `10_300_customer_readiness_matrix.md`

**Zweck:** Reifeprüfung pro Bereich. Wird in Phase A erstellt, danach laufend aktualisiert.

**Format:**

```md
# 10-300 Customer Readiness Matrix

| Bereich | Ist-Zustand | Bestehende Dateien | Ziel 10 | Ziel 50 | Ziel 100 | Ziel 300 | Risiko | Änderung | Tests | Gate |
|---|---|---|---|---|---|---|---|---|---|---|
| Auth | stabil | api/middleware/auth.js | ok | ok | ok | ok | niedrig | keine | vorhanden | 10 ✓ |
| Customer Lifecycle | fehlt | - | Status-Modell | Filter | Health Score | skalierbar | hoch | Phase B | TODO | 10 |
| Billing | teilweise | subscriptionLifecycleService.js | manuelle Rechnung | Stripe vorbereitet | Auswertungen | robust | mittel | Phase D | TODO | 10 |
| ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |
```

**Claude Code nutzt sie:** Am Session-Anfang lesen → weiß sofort, was wo steht und was als Nächstes dran ist.

---

## 2. `finalization_worklog.md`

**Zweck:** Fortschritts-Log. Nach jedem Block ein kompakter Eintrag.

**Format:**

```md
# Finalization Worklog

## 2026-06-10 — Phase B Block 1
- Geändert: api/services/customerLifecycleService.js (neu), sql/migrations/120_customer_lifecycle.sql
- Tests: customerLifecycle.test.js grün (8 Tests)
- Risiken: Migration auf Prod-Daten noch ungetestet
- Nächster Block: SCC Customer Operations UI

## 2026-06-10 — Phase B Block 2
- Geändert: frontend/src/staff/modules/customer-operations/index.tsx (neu)
- Tests: build:scc grün
- Risiken: keine
- Nächster Block: Phase C Commercial Desk
```

**Claude Code nutzt sie:** Statt langer Chat-Wiederholung "was wurde gemacht" → ins Worklog schauen.

---

## 3. `final_acceptance_report_10_300_customers.md`

**Zweck:** Abschlussbericht. Wird über die Phasen hinweg aufgebaut, final nach Phase R.

**Format:**

```md
# Final Acceptance Report — 10-300 Customers

## Geprüfte Bereiche
...

## Umgesetzte Änderungen
...

## Neue Dateien
...

## Geänderte Dateien
...

## Migrationen
...

## Env-Variablen (neu)
...

## Neue SCC-Module
...

## Neue API-Routen
...

## Neue Tests
...

## Bestandene Checks
...

## Fehlgeschlagene Checks
...

## Offene Risiken
...

## Go-live-Blocker
...

## Empfehlungen
- Für 10 Kunden: ...
- Für 50 Kunden: ...
- Für 100 Kunden: ...
- Für 300 Kunden: ...
```

---

## 4. `open_risks_and_blockers.md`

**Zweck:** Risiken und Blocker zentral. Wird laufend gepflegt.

**Format:**

```md
# Open Risks and Blockers

| Blocker | Risiko | Auswirkung | Betroffene Kunden | Priorität | Lösungsvorschlag | Status |
|---|---|---|---|---|---|---|
| Stripe-Keys fehlen | Auto-Billing nicht testbar | manuelle Rechnung nötig | alle zahlenden | P1 | Owner setzt Keys | offen |
| Demo-Daten verfälschen KPIs | falsche Dashboard-Zahlen | Vertrauensverlust | Pilot | P0 | Demo-Flag in Queries | in Arbeit |
| ... | ... | ... | ... | ... | ... | ... |
```

**Claude Code nutzt sie:** Bei Stop-Regeln (`00_RULES.md`) → Blocker hier eintragen statt nur im Chat melden.

---

## 5. `changed_files_index.md`

**Zweck:** Datei-Änderungs-Index. Jede geänderte Datei mit Grund.

**Format:**

```md
# Changed Files Index

| Datei | Änderung | Grund | Risiko | Test |
|---|---|---|---|---|
| api/services/customerLifecycleService.js | neu | Phase B Customer Lifecycle | mittel | customerLifecycle.test.js |
| api/config/planFeatures.js | erweitert | Phase C Tarif-Entitlements | niedrig | planFeatures.test.js |
| sql/migrations/120_customer_lifecycle.sql | neu | Customer-Status-Tabelle | mittel | migration test |
| ... | ... | ... | ... | ... |
```

**Claude Code nutzt sie:** Vor Release (Phase P) → vollständige Liste aller Änderungen für Review.

---

## Workflow mit Arbeitsdateien

**Session-Anfang:**
1. `finalization_worklog.md` lesen → wo stehe ich?
2. `10_300_customer_readiness_matrix.md` lesen → was ist der Zielzustand?
3. `open_risks_and_blockers.md` lesen → welche Blocker sind offen?

**Während der Arbeit:**
- Erkenntnisse → `.claude/learning/insights_inbox.md` (Lernschleife)
- Risiken → `open_risks_and_blockers.md`

**Block-Ende:**
- `finalization_worklog.md` Eintrag
- `changed_files_index.md` Einträge
- `10_300_customer_readiness_matrix.md` Status aktualisieren

**Session-Ende:**
- `/scc-learn-distill` (Lernschleife)

**Phasen-Ende:**
- `final_acceptance_report_10_300_customers.md` Abschnitt ergänzen

---

## Token-Effizienz durch Arbeitsdateien

| Ohne Arbeitsdateien | Mit Arbeitsdateien |
|---|---|
| Jede Session: Kontext im Chat neu aufbauen | Session-Anfang: 3 Dateien gezielt lesen |
| Risiken im Chat wiederholen | Risiken in einer Datei |
| "Was wurde gemacht?" jedesmal neu | Worklog nachschlagen |
| Doppelarbeit durch Vergessen | Matrix zeigt Status |
| Lange Abschlussberichte im Chat | Kompakte Datei-Einträge |

**Regel:** Wenn Claude Code etwas wiederholen würde, das schon in einer Arbeitsdatei steht → Datei referenzieren statt wiederholen.

---

## Verhältnis zur Lernschleife

Die **Arbeitsdateien** (`docs/finalization/*`) sind projekt-spezifisches Gedächtnis für DIESE Welle.

Die **Lern-Dateien** (`.claude/learning/*`) sind session-übergreifendes Meta-Gedächtnis für CLAUDE.md.

Unterschied:
- Arbeitsdateien = "was ist der Stand von Phase 5?" (Projekt)
- Lern-Dateien = "was hat Claude Code über effizientes Arbeiten gelernt?" (Meta)

Beide sparen Tokens, aber auf verschiedenen Ebenen.
