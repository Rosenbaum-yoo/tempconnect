# INSTALL.md — Wohin kommen alle Dateien?

> Klare Anleitung in 3 Schritten. Danach kannst du Claude Code direkt starten.

---

## Das Prinzip in einem Satz

**Alles aus dem ZIP kommt in dein TempConnect-Repo** — in den richtigen Unterordner. Nur eine Datei (`CLAUDE.md`) ist etwas Besonderes: sie existiert schon, du ergänzt sie.

---

## Deine Repo-Struktur danach

```
dein-tempconnect-repo/
│
├── CLAUDE.md                    ← existiert bereits, du ergänzt sie (Schritt 2)
│
├── finalization/                ← NEU anlegen, ganzen Ordner reinkopieren
│   ├── PHASES.md                ← globale Übersicht über alle 5 Phasen
│   ├── README.md                ← Phase 1 Index
│   ├── 00_RULES.md              ← Regeln (gilt für alle Phasen)
│   ├── 01_PRIORITIES.md
│   ├── 99_GOLIVE_GATE.md
│   ├── PHASES.md
│   ├── SPECIAL_*.md (3 Dateien)
│   ├── WAVE_00 bis WAVE_15 (16 Dateien)
│   ├── phase2_release/          ← Release-Wellen
│   ├── phase3_scc/              ← SCC + Hetzner
│   ├── phase4_vertical/         ← 5 Tracks (Marketplace, Einsatzportal, Terminologie, Notifications, Database)
│   └── phase5_scale/            ← Skalierung + selbstlernende CLAUDE.md
│
└── .claude/                     ← NEU anlegen (Schritt 3)
    ├── learning/
    │   ├── config.md
    │   ├── insights_inbox.md
    │   ├── proposals.md
    │   └── applied_log.md
    ├── commands/
    │   ├── scc-learn-distill.md
    │   ├── scc-learn-apply.md
    │   └── scc-learn-consolidate.md
    └── hooks/
        ├── capture-insight.sh
        └── session-end-distill.sh
```

> **WICHTIG:** `.claude/` darf **NIE** ins öffentliche Release-Artefakt — nur lokal im Repo.

---

## Schritt 1 — finalization/-Ordner kopieren

Entpacke das ZIP. Kopiere den gesamten `finalization/`-Ordner in dein Repo-Root:

```bash
# ZIP entpacken (Mac/Linux)
unzip finalization.zip -d /tmp/tc_install

# In dein Repo kopieren
cp -r /tmp/tc_install/finalization/  /pfad/zu/deinem/repo/finalization/
```

Danach committen:
```bash
cd /pfad/zu/deinem/repo
git add finalization/
git commit -m "chore: add finalization wave structure (Phase 1-5)"
```

---

## Schritt 2 — CLAUDE.md ergänzen

Deine `CLAUDE.md` existiert bereits im Repo-Root. Du fügst **zwei Textstellen** aus `finalization/phase5_scale/CLAUDE_MD_ADDENDUM.md` hinzu:

**Was du einfügst:**
- Abschnitt 8 (Self-Update-Mechanik) → durch erweiterte Version ersetzen
- Abschnitt 5 (Wirtschaftlichkeitsregeln) → am Ende einen Block ergänzen

**Wie:**
1. Öffne `finalization/phase5_scale/CLAUDE_MD_ADDENDUM.md`
2. Kopiere die Texte aus den Codeblöcken (zwischen den ``` Zeilen)
3. Füge sie an den richtigen Stellen in deine `CLAUDE.md` ein

Danach committen:
```bash
git add CLAUDE.md
git commit -m "feat: add learning loop and economics to CLAUDE.md"
```

---

## Schritt 3 — .claude/-Ordner anlegen

Das Installations-Skript `install_claude_folder.sh` aus diesem ZIP erledigt das automatisch.

Oder manuell:

```bash
cd /pfad/zu/deinem/repo

# Ordner anlegen
mkdir -p .claude/learning
mkdir -p .claude/commands
mkdir -p .claude/hooks

# Leere Starter-Dateien anlegen
echo "# Insights Inbox — Erkenntnisse während der Arbeit" > .claude/learning/insights_inbox.md
echo "# Vorschläge für CLAUDE.md" > .claude/learning/proposals.md
echo "# Audit — übernommene Erkenntnisse" > .claude/learning/applied_log.md
```

Die vollständigen Inhalte der Command- und Hook-Dateien findest du in:
`finalization/phase5_scale/SELF_UPDATING_CLAUDE_MD.md` (Abschnitt 5 und 6)

Dann `.gitignore` prüfen — `.claude/learning/` kann optional ignoriert werden (persönliche Erkenntnisse).

---

## Schritt 4 — In Claude Code Project laden (empfohlen)

In Claude.ai → dein Project → Project Knowledge:
- `CLAUDE.md` hochladen (oder Inhalt einfügen)
- `finalization/PHASES.md` hochladen (der globale Index)
- Fertig — Claude Code hat per Session nur diese zwei Dateien im Kontext

**Pro Session** sagst du dann nur:
```
Lies CLAUDE.md und finalization/PHASES.md.
Arbeite an [Phase X / Welle Y / Track Z].
Lies die passende Wellen-Datei selbst im Repo.
```

---

## Was Claude Code SELBST liest (per Session)

Claude Code liest die spezifische Wellen-Datei selbst aus dem Repo — du musst nicht jede Datei hochladen. Zum Beispiel:

```
"Arbeite an WAVE_04 Core Business."
→ Claude Code liest: CLAUDE.md → finalization/00_RULES.md → finalization/WAVE_04_core_business.md
```

```
"Arbeite an Phase 5 Phase D (Billing)."
→ Claude Code liest: CLAUDE.md → finalization/00_RULES.md → finalization/phase5_scale/PHASES_A_TO_R.md (nur Phase D)
```

---

## Übersicht: Welche Datei wofür

| Datei / Ordner | Wohin | Zweck |
|---|---|---|
| `finalization/` (ganzer Ordner) | Repo-Root | Alle Wellen, Regeln, Masterprompts |
| `finalization/PHASES.md` | darin | Globale Übersicht — IMMER zuerst lesen |
| `finalization/00_RULES.md` | darin | Regeln — Claude Code liest das bei jeder Session |
| `finalization/WAVE_*.md` | darin | Phase 1: fachliche Wellen |
| `finalization/phase2_release/` | darin | Release-Operativ |
| `finalization/phase3_scc/` | darin | SCC + Hetzner |
| `finalization/phase4_vertical/` | darin | 5 Tracks (Marketplace, Einsatzportal, Terminologie, Notifications, DB) |
| `finalization/phase5_scale/` | darin | Skalierung 10-300 Kunden + Lernschleife |
| `finalization/phase5_scale/CLAUDE_MD_ADDENDUM.md` | darin | Anleitung für CLAUDE.md-Erweiterung |
| `CLAUDE.md` | Repo-Root | Existiert bereits — nur ergänzen (Schritt 2) |
| `.claude/` | Repo-Root | Lernschleife, Hooks, Commands |
| `.claude/learning/insights_inbox.md` | darin | Erkenntnisse während Arbeit |
| `.claude/commands/scc-learn-*.md` | darin | Destillation, Apply, Konsolidierung |
| `.claude/hooks/*.sh` | darin | Schutz-Hooks, Session-Ende-Hook |

---

## Was du NICHT anfassen musst

Diese Dateien werden von Claude Code **während der Arbeit selbst erstellt**:
- `docs/` Unterordner (z.B. `docs/deployment/`, `docs/scc/`, `docs/product/`)
- Migrations-Dateien in `sql/migrations/`
- Test-Dateien
- Arbeitsdateien in `docs/finalization/`

Die `finalization/`-Dateien sind die **Anweisungen** — nicht die Outputs.

---

## Schnelltest: Funktioniert alles?

```bash
# Prüfen ob finalization korrekt liegt
ls finalization/PHASES.md finalization/00_RULES.md finalization/WAVE_00_baseline.md

# Prüfen ob .claude korrekt liegt
ls .claude/learning/ .claude/commands/ .claude/hooks/

# Prüfen ob CLAUDE.md noch lesbar ist
head -5 CLAUDE.md
```

Wenn alle drei Befehle Dateien zeigen → du bist bereit, Claude Code zu starten.
