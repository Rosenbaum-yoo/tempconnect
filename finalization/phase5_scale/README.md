# Phase 5 — Skalierung auf 10 bis 300 zahlende Kunden

> **Zweck:** Diese Phase überführt TempConnect von "fertig gebaut" zu "betreibt echte zahlende Kunden". 18 Phasen (A-R), kundenbasierte Gates (10/50/100/300), und eine **selbstlernende CLAUDE.md-Mechanik** für kontinuierliche Wirtschaftlichkeits- und Effizienzoptimierung.

---

## 1. Was Phase 5 ist

Phase 1-4 bauen und finalisieren das Produkt. Phase 5 macht es **betriebsfähig für echte zahlende Kunden** — mit Customer Lifecycle, Commercial Desk, Billing-Vorbereitung, E-Mail-Provider, Monitoring, Hetzner-Control, AI-Operations und einem Premium-Theme-System.

**Oberste Direktive:** Bestehende Strukturen schützen. Keine Parallelplattform. Keine funktionierenden Flows beschädigen. **Preserve-first.**

---

## 2. Das Besondere an Phase 5: Selbstlernende CLAUDE.md

Phase 5 enthält als einzige Phase eine **Meta-Komponente**: eine kontrollierte Lernschleife, mit der Claude Code seine eigene CLAUDE.md kontinuierlich für Wirtschaftlichkeit und Effizienz optimiert.

→ Komplett in `SELF_UPDATING_CLAUDE_MD.md` + `CLAUDE_MD_ADDENDUM.md`

**Wichtig — ehrliche Einordnung:** Die CLAUDE.md aktualisiert sich NICHT bei jeder Nachricht (das wäre Token-Verschwendung und führt zu Drift). Stattdessen: eine **getaktete, überprüfbare Lernschleife** mit Owner-Bestätigung. Das erreicht dein Ziel (kontinuierliches Lernen) ohne die Nachteile (Bloat, Widersprüche, Kosten).

---

## 3. Verhältnis zu Phase 1-4

| Phase | Ebene | Phase-5-Bezug |
|---|---|---|
| Phase 1 | Fachlich-architektonisch | Phase A baut auf WAVE_00 Baseline auf |
| Phase 2 | Release-operativ | Phase P nutzt Release-Hygiene + Gates |
| Phase 3 | SCC + Hetzner | Phase F/G/H vertiefen SCC massiv |
| Phase 4 | Vertikale Strecken | Phase K/L nutzen Terminologie + Einsatzportal |
| **Phase 5** | **Skalierung + Betrieb** | **Macht alles kundentauglich** |

**Mapping der 18 Phasen:**

| Phase 5 | Knüpft an |
|---|---|
| A — Reifeprüfung | Phase 1 WAVE_00 + Phase 2 WAVE 00 (erweitert um Kunden-Sicht) |
| B — Customer Lifecycle | NEU — zahlende Organisationen |
| C — Commercial Desk | Phase 1 WAVE_09 + Phase 3 Track A WAVE 06 |
| D — Billing vollautomatisch (Stripe) | Phase 1 WAVE_09 (Stripe Billing ab Tag 1, keine manuelle Rechnung) |
| E — SendGrid/SMTP | Phase 1 WAVE_13 (E-Mail-Provider konkret) |
| F — SCC Adminzentrale | Phase 3 Track A (gesamt, erweitert) |
| G — Hetzner Control | Phase 3 Track B (gesamt, kundentauglich) |
| H — AI Operations | Phase 3 Track B WAVE H5/H6 (Work Orders) |
| I — Monitoring/Incidents | Phase 1 WAVE_13 + Phase 2 WAVE 12 |
| J — Theme-System (3 Scopes) | NEU — Premium-Design |
| K — Plattformbereich | Phase 1 WAVE_04 + Phase 4 Track C (Terminologie) |
| L — Einsatzportal | Phase 4 Track B (gesamt) |
| M — Support/Tickets | NEU — Ticketsystem |
| N — Security/Legal/Compliance | Phase 1 WAVE_06 + WAVE_14 |
| O — Tests/CI/QA | Phase 1 WAVE_12 + Phase 2 WAVE 04 |
| P — Deployment/Backup/Rollback | Phase 2 WAVE 01 + WAVE 12 |
| Q — Performance/Skalierung | NEU — für 300 Kunden |
| R — Produktpolitur | Phase 1 WAVE_10 + Phase 4 Track C |

---

## 4. Inhalt dieser Schicht

| Datei | Zweck |
|---|---|
| `README.md` | Diese Übersicht |
| `PHASES_A_TO_R.md` | Alle 18 Phasen kompakt mit Befehlen |
| `CUSTOMER_GATES.md` | Die 4 Gates (10/50/100/300 Kunden) |
| `SELF_UPDATING_CLAUDE_MD.md` | **Die selbstlernende CLAUDE.md-Mechanik** (Hooks + Commands) |
| `CLAUDE_MD_ADDENDUM.md` | Erweiterung für die bestehende CLAUDE.md (Abschnitt 8) |
| `WORK_FILES.md` | Die 5 Selbststeuerungs-Arbeitsdateien |
| `MANUAL_TASKS.md` | Owner-Aufgaben (Stripe, SendGrid, Hetzner, Pricing) |
| `MASTERPROMPT.md` | Start-Prompt für Phase 5 |

---

## 5. Kundenbasierte Gates (verbindlich)

Im Gegensatz zu anderen Phasen sind die Gates hier **kundenmengenbasiert**:

```
Gate 10:  Minimaler produktiver Betrieb (Auth, Rollen, Tarife, vollautomat. Stripe-Billing, SCC, Support, Monitoring-Basis)
Gate 50:  Stabiler Betrieb (Pagination, Entitlements, Mailzustellung, Incident-Modell, Theme-System)
Gate 100: Differenzierter Betrieb (Monitoring detailliert, DB-Indizes, Customer Health, AI-Ops mit Review)
Gate 300: Skalierungsfähiger Betrieb (skalierbare Listen, robuste Jobs, Kostenindikatoren, Enterprise-Doku)
```

Details in `CUSTOMER_GATES.md`.

---

## 5b. Billing-Entscheidung (verbindlich)

**Vollautomatisches Stripe Billing ab dem ersten zahlenden Kunden. Keine manuelle Rechnungserstellung.**

Diese Entscheidung gilt für alle Gates (10-300):
- Stripe Subscriptions, automatische Rechnungsgenerierung, SEPA, automatisches Dunning
- Auch INDIVIDUELL/Enterprise läuft über Stripe Invoicing (custom Betrag)
- Manueller Fallback ist standardmäßig deaktiviert (nur Notfall)
- Stripe-Keys sind Marktstart-Blocker für Gate 10

Begründung: Manuelles Rechnungswesen skaliert nicht auf 300 Kunden und widerspricht dem Effizienzziel. Rechnungen existieren weiterhin (B2B-gesetzlich nötig), werden aber zu 100% automatisch von Stripe erzeugt — nicht von Hand. Details in `PHASES_A_TO_R.md` Phase D und `MANUAL_TASKS.md`.

Phase 5 lebt von Arbeitsdateien als Projektgedächtnis (Token-Effizienz):

```
docs/finalization/10_300_customer_readiness_matrix.md   ← Reifeprüfung pro Bereich
docs/finalization/finalization_worklog.md               ← Fortschritts-Log
docs/finalization/final_acceptance_report_10_300_customers.md  ← Abschlussbericht
docs/finalization/open_risks_and_blockers.md            ← Risiken
docs/finalization/changed_files_index.md                ← Datei-Änderungs-Index
```

Details in `WORK_FILES.md`.

---

## 7. Token- und Effizienzregeln (Kern dieser Phase)

Diese Welle ist groß. Claude Code arbeitet extrem effizient:

- Keine langen Wiederholungen, keine Vollscans (nutze `grep`/`rg`)
- Keine vollständigen Dateien ausgeben, wenn Diffs reichen
- Keine erneute Analyse bereits geprüfter, unveränderter Dateien
- Index-/Routing-/Service-Dateien zuerst, dann nur relevante Detaildateien
- Arbeitsdateien als Gedächtnis statt Wiederholung in Chat
- Kompakte Zwischenberichte, nur relevante Abschlussberichte
- Kleine Commits, kleine Diffs — kein Misch-Diff über Billing+SCC+Design+Auth gleichzeitig

---

## 8. Wie Claude Code mit Phase 5 arbeitet

**Pro Session:**
1. `CLAUDE.md` (Repo-Root)
2. `finalization/00_RULES.md` (Phase 1 Regeln)
3. `finalization/phase5_scale/README.md` (diese Datei)
4. Die spezifische Phase aus `PHASES_A_TO_R.md` (genau eine)
5. Bei Gate-Check: `CUSTOMER_GATES.md`
6. Arbeitsdateien aktualisieren (siehe `WORK_FILES.md`)

**Aktiviert bleibt:** die selbstlernende Mechanik (`SELF_UPDATING_CLAUDE_MD.md`) — läuft session-übergreifend.

---

## 9. Verbindlicher Branch

Wie Phase 2-4: `release/enterprise-premium-market-ready`. Phase 5 ist umfangreich — pro Phasengruppe (z.B. B+C+D Commercial, F+G+H SCC-Ops) eigener Sub-Branch denkbar.

---

## 10. Reihenfolge

Strikt: **Phase A zuerst** (Reifeprüfung), dann B→R. Aber gruppierbar:

```
Gruppe 1 (Foundation):     A
Gruppe 2 (Commercial):     B → C → D
Gruppe 3 (Kommunikation):  E
Gruppe 4 (SCC-Ops):        F → G → H → I
Gruppe 5 (Design/Produkt): J → K → L → M
Gruppe 6 (Härtung):        N → O → P → Q
Gruppe 7 (Politur):        R
```

Jede Gruppe kann eigene Session(s) sein.
