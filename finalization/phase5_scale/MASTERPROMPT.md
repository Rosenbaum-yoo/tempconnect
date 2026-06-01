# Phase 5 — Masterprompt für Claude Code

> Start-Prompt für die Skalierungswelle. Enthält die Aktivierung der selbstlernenden CLAUDE.md-Mechanik.

---

## Voller Masterprompt

```text
Du arbeitest im Repository TempConnect auf dem Branch release/enterprise-premium-market-ready.

Ziel: TempConnect kontrolliert und professionell für 10 bis 300 zahlende Kunden finalisieren.
Bestehende Strukturen schützen. Keine Parallelplattform. Keine funktionierenden Flows beschädigen.

Lies ZUERST in dieser Reihenfolge:
1. CLAUDE.md (Repo-Root)
2. finalization/00_RULES.md (Phase 1 Regeln)
3. finalization/phase5_scale/README.md (Übersicht Phase 5)
4. finalization/phase5_scale/PHASES_A_TO_R.md (18 Phasen)
5. finalization/phase5_scale/CUSTOMER_GATES.md (Gates 10/50/100/300)
6. finalization/phase5_scale/WORK_FILES.md (Arbeitsdateien als Gedächtnis)
7. finalization/phase5_scale/SELF_UPDATING_CLAUDE_MD.md (Lernschleife)
8. finalization/phase5_scale/MANUAL_TASKS.md (was du NICHT tun kannst)

Oberste Direktive:
Du arbeitest an einer SaaS-Plattform, die reale zahlende Kunden tragen soll.
Diese Welle gilt nur als erfolgreich, wenn sie echte produktive Betriebsfähigkeit herstellt,
nicht nur neue UI zeigt.

Nicht verhandelbare Regeln:
- Kein Big-Bang-Refactor. Keine zweite Auth/Rollen/Billing-Logik. Keine Parallelplattform.
- Erst prüfen, dann ändern. Vor jeder Änderung Ist-Zustand lesen und knapp dokumentieren.
- Preserve-first: funktionierende Funktionen behalten, absichern, fehlende Guards/Tests ergänzen.
- Keine Fake-Fertigstellung. Unfertiges klar kennzeichnen (nicht konfiguriert/vorbereitet/deaktiviert/Beta).
- Adapter/Provider-Schichten statt Umbau. Feature Flags für riskante Bereiche.
- Externe Keys fehlen → sichere deaktivierte Integration bauen, nicht Fake-Erfolg.

Token- und Effizienzregeln (kritisch, diese Welle ist groß):
- Keine langen Wiederholungen. Keine Vollscans (nutze grep/rg).
- Keine vollständigen Dateien ausgeben, wenn Diffs reichen.
- Keine erneute Analyse bereits geprüfter, unveränderter Dateien.
- Index-/Routing-/Service-Dateien zuerst, dann nur relevante Detaildateien.
- Arbeitsdateien als Gedächtnis nutzen (siehe WORK_FILES.md), nicht alles im Chat wiederholen.
- Kompakte Zwischenberichte. Nur relevante Abschlussberichte.
- Kleine Commits, kleine Diffs. Kein Misch-Diff über Billing+SCC+Design+Auth gleichzeitig.

Plan-Modell (verbindlich): DEMO / BASIS / PLUS / PRO / INDIVIDUELL.
NOTDIENST/FREE/TRIAL/ENTERPRISE sind Legacy-Aliase → normalizePlanKey().

BILLING-DIREKTIVE (verbindlich, Effizienz-Entscheidung des Owners):
Billing ist ab dem ersten zahlenden Kunden VOLLAUTOMATISCH über Stripe Billing.
KEINE manuelle Rechnungserstellung als Standard.
- Stripe Subscriptions pro Plan (BASIS/PLUS/PRO via Price-IDs)
- Automatische Rechnungsgenerierung durch Stripe (Rechnungen existieren gesetzlich, werden aber nie von Hand erstellt)
- SEPA Direct Debit + Kreditkarte
- Automatisches Dunning (Stripe Smart Retries)
- Stripe Billing Portal für Kunden-Selbstverwaltung
- Auch INDIVIDUELL/Enterprise läuft über Stripe Invoicing (custom Betrag), nicht über Excel/PDF
- Manueller Fallback (MANUAL_INVOICE_FALLBACK_ENABLED) ist standardmäßig AUS, nur Notfall
- BILLING_PROVIDER=stripe ist Standard, nicht manual
Begründung: manuelles Rechnungswesen skaliert nicht auf 300 Kunden und ist ineffizient.

SELBSTLERNENDE MECHANIK AKTIVIEREN:
Während der Arbeit, wenn du eine wiederverwendbare Erkenntnis über Effizienz,
Wirtschaftlichkeit oder projektspezifische Technik gewinnst:
→ füge EINE Zeile zu .claude/learning/insights_inbox.md hinzu:
   echo "- [KATEGORIE] <Erkenntnis> (Quelle: <Datei>, <Datum>)" >> .claude/learning/insights_inbox.md
   Kategorien: EFFIZIENZ / WIRTSCHAFTLICHKEIT / TECHNIK
Das ist ein billiger Append, kein CLAUDE.md-Write. NICHT bei jeder Nachricht updaten.
Am Session-Ende: /scc-learn-distill ausführen (destilliert zu CLAUDE.md-Vorschlägen).
Details: SELF_UPDATING_CLAUDE_MD.md.

Erfasse besonders wirtschaftlich relevante Erkenntnisse:
- Was kostet ein Kunde an Ressourcen?
- Welche Queries/Jobs sind die teuersten?
- Wo droht bei Skalierung (10→300) Kostenexplosion?
- Wo wird Code/Token verschwendet?

Arbeite strikt in dieser Reihenfolge (Phasen können gruppiert werden):
A — Reifeprüfung (zuerst, read-only)
B — Customer Lifecycle
C — Commercial Desk / Individuelle Tarife
D — Billing vollautomatisch (Stripe Billing ab Tag 1, KEINE manuelle Rechnung)
E — SendGrid / SMTP / Notifications
F — SCC Adminzentrale
G — Hetzner Control
H — AI Operations / Claude Code Control
I — Monitoring / Incidents / Health
J — Theme-System (3 Scopes)
K — Plattformbereich
L — Einsatzportal
M — Support / Tickets
N — Security / Legal / Compliance
O — Tests / CI / QA
P — Deployment / Backup / Rollback
Q — Performance / Skalierung
R — Produktpolitur

Arbeitsdateien anlegen/pflegen (Projektgedächtnis):
- docs/finalization/10_300_customer_readiness_matrix.md
- docs/finalization/finalization_worklog.md
- docs/finalization/final_acceptance_report_10_300_customers.md
- docs/finalization/open_risks_and_blockers.md
- docs/finalization/changed_files_index.md

Nach jedem Block nur:
## Block abgeschlossen: <Name>
- Geändert:
- Tests:
- Risiken:
- Nächster Block:

Pflichtchecks (gezielt, nicht alles immer):
cd api && npm run lint && npm run test:ci
cd frontend && npm run build:scc

Gates (kundenbasiert, siehe CUSTOMER_GATES.md):
- Gate 10: minimaler produktiver Betrieb
- Gate 50: stabiler Betrieb
- Gate 100: differenzierter Betrieb
- Gate 300: skalierungsfähiger Betrieb

Frage nur bei: Rechtstexten, fehlenden echten Keys (Stripe/SendGrid/Hetzner),
finalen Preisen, irreversiblen Produktentscheidungen.
Sonst aus Code ableiten und selbst entscheiden.

Starte jetzt mit Phase A (Reifeprüfung, read-only).
Schreibe die Readiness-Matrix.
Dann priorisiere Risiken.
Dann minimale sichere Änderungen in kleinen Blöcken.
Keine Fake-Fertigmeldung. Melde Blocker statt sie zu verschweigen.
```

---

## Setup-Prompt für die Lernschleife (einmalig, früh)

Vor oder direkt nach Phase A einmal ausführen:

```text
Richte die selbstlernende CLAUDE.md-Mechanik ein (siehe finalization/phase5_scale/SELF_UPDATING_CLAUDE_MD.md):

1. Lege .claude/learning/ an mit config.md (Auto-Approve nur EFFIZIENZ, Budget 100/60 Zeilen)
2. Lege die 3 Command-Dateien an:
   - .claude/commands/scc-learn-distill.md
   - .claude/commands/scc-learn-apply.md
   - .claude/commands/scc-learn-consolidate.md
3. Lege die 2 Hook-Dateien an:
   - .claude/hooks/capture-insight.sh
   - .claude/hooks/session-end-distill.sh
4. Registriere den Stop-Hook in .claude/settings.json
5. Erweitere CLAUDE.md Abschnitt 8 gemäß finalization/phase5_scale/CLAUDE_MD_ADDENDUM.md
6. Stelle sicher, dass .claude/ im Release-Verifier ausgeschlossen ist (Phase 2 WAVE 01)
7. Teste: erfasse eine Test-Erkenntnis, führe /scc-learn-distill aus

Verwende die Skelette aus SELF_UPDATING_CLAUDE_MD.md. Kompakter Abschlussbericht.
```

---

## Pro-Phase-Session-Start (kürzer)

```text
Arbeite an Phase <X> aus finalization/phase5_scale/PHASES_A_TO_R.md.

Lies vorher:
- CLAUDE.md
- finalization/00_RULES.md
- finalization/phase5_scale/README.md
- PHASES_A_TO_R.md (nur Abschnitt Phase X)
- finalization_worklog.md (wo stehe ich?)

Lernschleife aktiv: Erkenntnisse → .claude/learning/insights_inbox.md (1-Zeilen-Append).

Liefere am Ende:
## Block abgeschlossen: Phase X
- Geändert / Tests / Risiken / Nächster Block

Arbeitsdateien aktualisieren. Token sparen. Branch: release/enterprise-premium-market-ready
```

---

## Gruppen-Prompt (mehrere Phasen in einer Session)

```text
Arbeite an Phasen-Gruppe <Name> aus finalization/phase5_scale/PHASES_A_TO_R.md:
- Gruppe Commercial: B, C, D
- Gruppe Kommunikation: E
- Gruppe SCC-Ops: F, G, H, I
- Gruppe Design/Produkt: J, K, L, M
- Gruppe Härtung: N, O, P, Q
- Gruppe Politur: R

Arbeite die Phasen der Gruppe nacheinander ab. Pro Phase ein Block-Abschlussbericht.
Lernschleife aktiv. Arbeitsdateien pflegen. Token sparen.
Branch: release/enterprise-premium-market-ready
```

---

## Session-Ende-Prompt (Lernschleife)

```text
Session-Ende. Führe /scc-learn-distill aus.
Zeige mir die destillierten CLAUDE.md-Vorschläge aus .claude/learning/proposals.md.
Kompakte Zusammenfassung: X Erkenntnisse, Y Konflikte.
```

---

## Was dieser Prompt bewirkt

1. **Preserve-first verankert** — kein Big-Bang, keine Parallelplattform
2. **Token-Effizienz erzwungen** — gezielt lesen, Diffs, Arbeitsdateien
3. **Lernschleife aktiviert** — kontrolliert, nicht bei jeder Nachricht
4. **Wirtschaftlichkeit im Fokus** — Skalierungskosten mitdenken
5. **Kundenbasierte Gates** — technische Schwellen statt Behauptungen
6. **Owner-Aufgaben ausgegliedert** — keine halluzinierten Keys/Preise
7. **Feature Flags** — fehlende externe Dienste blockieren nicht den Fortschritt

---

## Kurzfassung des Ziels

```
TempConnect soll nach Phase 5:
- echte zahlende Kunden onboarden (10 → 300)
- Customer Lifecycle im SCC steuerbar
- individuelle Tarife voll operativ
- Billing vollautomatisch ab Tag 1 (Stripe Subscriptions + Auto-Rechnung + SEPA, keine manuelle Rechnung)
- E-Mail professionell (SMTP/SendGrid)
- SCC als echte Betriebszentrale
- Hetzner + AI Operations sicher gesteuert
- Monitoring + Incidents sichtbar
- Premium-Theme-System (3 Scopes)
- selbstlernend für Effizienz + Wirtschaftlichkeit
- ohne Fake-Fertigmeldung, ohne zerstörte Flows
```
