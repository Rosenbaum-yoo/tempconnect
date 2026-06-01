# PHASES.md — Globaler Master-Index

> Diese Datei zeigt dir auf einen Blick die komplette Finalisierungs-Struktur über alle 5 Phasen. Im Zweifel: hier zuerst nachschauen.

---

## Die 5 Phasen im Überblick

| Phase | Ordner | Charakter | Wellen-Anzahl | Pflicht für Marktstart |
|---|---|---|---:|---|
| **Phase 1** | `finalization/` (Root) | Fachlich-architektonisch | 16 Wellen + 3 Special | JA |
| **Phase 2** | `finalization/phase2_release/` | Release-operativ | 16 Wellen + 6 Gates | JA |
| **Phase 3** | `finalization/phase3_scc/` | SCC + Hetzner + Claude Work Orders | 13+9 Wellen | JA (SCC-Gate) |
| **Phase 4** | `finalization/phase4_vertical/` | Vertikale Strecken (5 Tracks: Marketplace, Einsatzportal, Terminologie, Notifications, Database) | 13+11+13+11+13 | TEILWEISE |
| **Phase 5** | `finalization/phase5_scale/` | Skalierung 10-300 Kunden + selbstlernende CLAUDE.md | 18 Phasen + 4 Gates | JA (Gate 10) |

**Gesamt:** rund 134 Wellen/Phasen über alle 5 Phasen (Phase 4 um Track D +11 und Track E +13 erweitert).

**Besonderheit Phase 5:** enthält als einzige Phase die **selbstlernende CLAUDE.md-Mechanik** (`SELF_UPDATING_CLAUDE_MD.md`) — eine kontrollierte Lernschleife für kontinuierliche Wirtschaftlichkeits- und Effizienzoptimierung.

---

## Marktstart-Pflicht-Set

```
Phase 1: WAVE_00 bis WAVE_15 grün (alle 16 Wellen)
Phase 1: Globales Go-Live-Gate aus 99_GOLIVE_GATE.md grün
Phase 2: Gates A-F grün
Phase 2: WAVE 16 Burn-in 7+ Tage stabil
Phase 3: SCC-Gates A-E + H8 grün
Phase 4 Track B (Einsatzportal): Track-B-Gate grün
Phase 4 Track C (Terminologie): Track-C-Gate grün ODER bewusst Post-Launch
Phase 5: Gate 10 grün (minimaler produktiver Betrieb für erste zahlende Kunden)

OPTIONAL für Marktstart:
Phase 4 Track A (Marketplace): kann als Post-Launch-Premium-Feature kommen
Phase 5 Gates 50/100/300: wachsen kontrolliert nach Marktstart
```

**Hinweis:** Phase 5 Gate 10 ist die eigentliche "erste zahlende Kunden"-Schwelle. Die Phasen 1-4 bauen das Produkt, Phase 5 Gate 10 macht es kassentauglich. Gates 50/100/300 sind Wachstumsstufen NACH dem Start.

---

## Empfohlene Bearbeitungs-Reihenfolge

### Stufe 1 — Foundation (Phase 1 Foundation-Wellen)

```
1. Phase 1 WAVE_00 — Baseline
2. Phase 1 WAVE_01 — Release-Hygiene
3. Phase 1 WAVE_02 — Commercial Source of Truth
4. Phase 1 WAVE_03 — Rollen/Sichtbarkeit
```

→ Foundation steht.

### Stufe 2 — Kernprodukt (Phase 1 Core)

```
5. Phase 1 WAVE_04A-H — Core Business (8 Subbereiche)
6. Phase 1 WAVE_05 — KPI Dashboard
```

→ Produkt funktioniert.

### Stufe 3 — Enterprise (Phase 1 Enterprise)

```
7. Phase 1 WAVE_06 — Security
8. Phase 1 WAVE_07 — Admin Centers
9. Phase 1 WAVE_08 — Bonus/Credits
10. Phase 1 WAVE_09 — Billing
```

→ Enterprise-Funktionen vorhanden.

### Stufe 4 — Infrastruktur + Polish (Phase 1 Rest + Track C)

```
11. Phase 1 WAVE_10 — Premium UX
12. Phase 1 WAVE_11 — Database
13. Phase 1 WAVE_12 — QA Tests
14. Phase 1 WAVE_13 — Observability
15. Phase 1 WAVE_14 — Legal/DSGVO
16. Phase 1 WAVE_15 — Demo/Onboarding

PARALLEL:
- Phase 4 Track C Phase 0+1 (Terminologie-Audit + Guide)
```

→ Phase 1 abgeschlossen + Sprache klar definiert.

### Stufe 5 — Release-Operativ (Phase 2)

```
17. Phase 2 WAVE 00-15 — Release-Wellen
18. Phase 2 Gates A-F prüfen
```

→ Produkt auslieferbar.

### Stufe 6 — SCC + Vertikale Strecken parallel

```
PARALLEL (verschiedene Sessions):
- Phase 3 Track A SCC Profi-Level (Wave 00-13)
- Phase 3 Track B SCC Hetzner (H0-H8)
- Phase 4 Track B Einsatzportal (EP-00 bis EP-10)
- Phase 4 Track C Terminologie (Phasen 2-12)
```

→ Alle Pflicht-Gates erreichbar.

### Stufe 7 — Burn-in + Marktstart

```
19. Phase 2 WAVE 16 — Burn-in (≥7 Tage Preprod)
20. Gate-Reviews
21. MARKTSTART-GO-Dokument
```

→ Live.

### Stufe 8 — Post-Launch (optional)

```
22. Phase 4 Track A Marketplace Visibility Center
23. Phase 5 Gates 50/100/300 (kontrolliertes Kundenwachstum)
24. Spätere Erweiterungen
```

**Wichtig — wo Phase 5 reinpasst:** Phase 5 (Skalierung) ist KEINE separate Endstufe, sondern durchzieht die Stufen. Phase 5 Phase A (Reifeprüfung) läuft mit Stufe 1. Die Commercial-/SCC-Ops-/Design-Phasen (B-R) laufen mit Stufe 6 parallel. Phase 5 Gate 10 ist Teil des Marktstarts (Stufe 7). Die selbstlernende Mechanik wird früh (Stufe 1-2) eingerichtet und läuft dann durchgehend.

---

## Datei-Navigations-Schema

Wenn du nicht weißt wo etwas steht, hier die Logik:

```
finalization/
├── PHASES.md                        ← Du bist hier (globale Orientierung)
├── README.md                        ← Phase 1 Index
├── 00_RULES.md                      ← Phase 1 Regeln (gilt für alle Phasen!)
├── 01_PRIORITIES.md                 ← P0/P1/P2/P3-Definitionen
├── 99_GOLIVE_GATE.md                ← Phase 1 globales Gate
├── WAVE_00_baseline.md
├── WAVE_01_release_hygiene.md
├── ... (alle Phase-1-Wellen)
├── WAVE_15_demo_onboarding.md
├── SPECIAL_bugboard_triage.md       ← jederzeit-Referenz
├── SPECIAL_file_inventory.md
├── SPECIAL_enterprise_pack.md
│
├── phase2_release/
│   ├── README.md
│   ├── WAVES.md                     ← alle 16 Release-Wellen kompakt
│   ├── GATES.md                     ← Gates A-F
│   ├── SCORING.md
│   ├── MANUAL_TASKS.md
│   └── MASTERPROMPT.md
│
├── phase3_scc/
│   ├── README.md
│   ├── TRACK_A_PROFI.md             ← SCC Wellen 00-13
│   ├── TRACK_B_HETZNER.md           ← Hetzner H0-H8
│   ├── GATES.md                     ← SCC-Gates A-E + H8
│   ├── CLAUDE_HOOKS.md
│   ├── WORK_ORDERS.md
│   ├── MANUAL_TASKS.md
│   └── MASTERPROMPT.md
│
└── phase4_vertical/
    ├── README.md
    ├── TRACK_A_MARKETPLACE.md       ← M-00 bis M-13
    ├── TRACK_B_EINSATZPORTAL.md     ← EP-00 bis EP-10
    ├── TRACK_C_TERMINOLOGY.md       ← Phasen 0-12
    ├── TRACK_D_NOTIFICATIONS.md     ← N-00 bis N-10 (Glocke + Card-Badges)
    ├── TRACK_E_DATABASE.md          ← DB-A bis DB-M (Migration + Hetzner)
    ├── GATES.md
    ├── MANUAL_TASKS.md
    ├── MASTERPROMPTS.md
    └── CROSS_CUTTING.md             ← Kollisionen vermeiden

└── phase5_scale/
    ├── README.md
    ├── PHASES_A_TO_R.md             ← 18 Phasen A-R kompakt
    ├── CUSTOMER_GATES.md            ← Gates 10/50/100/300
    ├── SELF_UPDATING_CLAUDE_MD.md   ← selbstlernende CLAUDE.md (Hooks+Commands)
    ├── CLAUDE_MD_ADDENDUM.md        ← Erweiterung für bestehende CLAUDE.md
    ├── WORK_FILES.md                ← 5 Selbststeuerungs-Arbeitsdateien
    ├── MANUAL_TASKS.md
    └── MASTERPROMPT.md
```

**Plus (außerhalb finalization/, im Repo-Root):**
```
.claude/
├── learning/                       ← Lernschleifen-Daten (Phase 5)
│   ├── insights_inbox.md
│   ├── proposals.md
│   ├── applied_log.md
│   └── config.md
├── commands/                       ← Lern-Commands + SCC-Commands
└── hooks/                          ← Schutz-Hooks + Lern-Hooks
```
(`.claude/` gehört NIE ins Release-Artefakt.)

---

## Wo bekommst du den Start-Prompt für Claude Code?

| Was du machen willst | Masterprompt liegt in |
|---|---|
| Phase 1 Welle (z.B. WAVE_04) | Direkt in der Welle-Datei |
| Phase 2 (Release-Operativ) | `phase2_release/MASTERPROMPT.md` |
| Phase 3 (SCC) | `phase3_scc/MASTERPROMPT.md` |
| Phase 4 Track A (Marketplace) | `phase4_vertical/MASTERPROMPTS.md` Abschnitt A |
| Phase 4 Track B (Einsatzportal) | `phase4_vertical/MASTERPROMPTS.md` Abschnitt B |
| Phase 4 Track C (Terminologie) | `phase4_vertical/MASTERPROMPTS.md` Abschnitt C |
| Phase 4 Track D (Notifications) | `phase4_vertical/MASTERPROMPTS.md` Abschnitt D |
| Phase 4 Track E (Database/Hetzner) | `phase4_vertical/MASTERPROMPTS.md` Abschnitt E |
| Phase 5 (Skalierung 10-300) | `phase5_scale/MASTERPROMPT.md` |
| Lernschleife einrichten | `phase5_scale/MASTERPROMPT.md` Setup-Prompt |

---

## Wo finde ich Gates?

| Gate | Datei |
|---|---|
| Globales Go-Live-Gate | `finalization/99_GOLIVE_GATE.md` |
| Phase 2 Gates A-F | `finalization/phase2_release/GATES.md` |
| SCC-Gates A-E + H8 | `finalization/phase3_scc/GATES.md` |
| Marketplace-Gate | `finalization/phase4_vertical/GATES.md` Track A |
| Einsatzportal-Gate | `finalization/phase4_vertical/GATES.md` Track B |
| Terminologie-Gate | `finalization/phase4_vertical/GATES.md` Track C |
| Notification-Gate | `finalization/phase4_vertical/GATES.md` Track D |
| Database-Gates (kundenstufig) | `finalization/phase4_vertical/GATES.md` Track E |
| Customer Gates 10/50/100/300 | `finalization/phase5_scale/CUSTOMER_GATES.md` |

---

## Wo finde ich was Owner selbst entscheiden/machen muss?

| Bereich | Datei |
|---|---|
| Phase 2 (Secrets, Domain, DNS, Recht, Marktstart) | `phase2_release/MANUAL_TASKS.md` |
| Phase 3 (Staff-MFA, Hetzner-Token, GitHub-App) | `phase3_scc/MANUAL_TASKS.md` |
| Phase 4 (Pricing, Begriffs-Freigabe, Bounty-Caps) | `phase4_vertical/MANUAL_TASKS.md` |
| Phase 5 (Stripe, SendGrid, Hetzner, Preise, Lernschleife-Config) | `phase5_scale/MANUAL_TASKS.md` |

---

## Selbstlernende CLAUDE.md (Phase 5)

Dein Kernanliegen — Claude Code optimiert sich kontinuierlich für Wirtschaftlichkeit und Effizienz:

| Was | Datei |
|---|---|
| Vollständige Mechanik (Hooks + Commands) | `phase5_scale/SELF_UPDATING_CLAUDE_MD.md` |
| Erweiterung für bestehende CLAUDE.md | `phase5_scale/CLAUDE_MD_ADDENDUM.md` |
| Arbeitsdateien als Gedächtnis | `phase5_scale/WORK_FILES.md` |

**Kurz:** Erkenntnisse werden während der Arbeit billig gesammelt (1-Zeilen-Append), am Session-Ende destilliert (`/scc-learn-distill`), nach Owner-Review in CLAUDE.md übernommen (`/scc-learn-apply`), monatlich konsolidiert (`/scc-learn-consolidate`). NICHT bei jeder Nachricht — das wäre Token-Verschwendung und Drift.

---

## Effiziente Arbeitsweise (Wiederholung wichtigster Regeln)

1. **Pro Welle eine neue Session** — Token-Effizienz
2. **Project + CLAUDE.md im Repo** — Kontext immer da, ohne Upload
3. **Genau eine Welle-Datei pro Session öffnen** — nicht alle gleichzeitig
4. **Bei Cross-Cutting:** `phase4_vertical/CROSS_CUTTING.md` zusätzlich
5. **Bei Triage-Frage:** `SPECIAL_bugboard_triage.md`
6. **Bei "wo finde ich..."-Frage:** diese `PHASES.md`

---

## Status-Tracking

Empfohlen: `docs/releases/PHASE_STATUS.md` mit Tabelle aller Wellen + Status (offen/in Arbeit/abgeschlossen/blockiert).

Beispiel:

```
| Phase | Welle | Status | Datum | Notiz |
|---|---|---|---|---|
| 1 | WAVE_00 | abgeschlossen | 2026-06-01 | Baseline ok |
| 1 | WAVE_01 | abgeschlossen | 2026-06-03 | CI hygiene grün |
| 1 | WAVE_02 | in Arbeit | — | Commercial SoT |
| 1 | WAVE_03 | offen | — | wartet auf 02 |
| 2 | alle | offen | — | nach Phase 1 |
| 3 | Track A WAVE 00 | abgeschlossen | 2026-06-05 | Scope klar |
| 3 | Track A WAVE 01 | in Arbeit | — | Staff Identity |
| 4 | Track C Phase 0 | abgeschlossen | 2026-06-02 | Audit fertig |
| 4 | Track C Phase 1 | abgeschlossen | 2026-06-04 | Guide fertig |
| ... | ... | ... | ... | ... |
```

So siehst du auf einen Blick was als Nächstes dran ist.

---

## Mini-Kompass

**Wenn du heute starten willst und nicht weißt wo:**

1. Lies `CLAUDE.md` im Repo-Root
2. Lies diese Datei (`PHASES.md`)
3. Wenn keine Welle abgeschlossen: starte mit Phase 1 WAVE_00
4. Wenn Phase 1 schon teilweise lief: prüfe Status-Tracking
5. Wenn Stufe-Level unklar: orientiere dich an "Empfohlene Bearbeitungs-Reihenfolge" oben

---

## Letztes Wort

Diese Struktur ist groß. Bewusst groß. TempConnect ist ein VMS für B2B-Staffing — das ist enterprise-relevante Software. Aber Größe bedeutet nicht Komplexität pro Session: pro Session ist eine Welle, ein klares Ziel, ein klarer Abschlussbericht.

**Im Zweifel: Welle für Welle. Welle abschließen. Dann nächste.**
