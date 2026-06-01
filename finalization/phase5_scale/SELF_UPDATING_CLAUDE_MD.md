# Selbstlernende CLAUDE.md — kontrollierte Lernschleife

> **Dein Kernanliegen:** Claude Code soll sich selbst kontinuierlich für Wirtschaftlichkeit und Effizienz dieses Projekts optimieren und seine CLAUDE.md aktuell halten. Diese Datei liefert die Mechanik — als echte Hook- und Command-Dateien.

---

## 1. Ehrliche Einordnung zuerst

**Was du gefragt hast:** "CLAUDE.md soll sich bei jeder Nachricht selbst updaten."

**Warum das so nicht gut ist:**
- Eine CLAUDE.md, die bei jeder Nachricht neu schreibt, **bläht auf** (wird mit jeder Session länger → mehr Tokens pro Session → teurer, das Gegenteil von Effizienz)
- Sie entwickelt **Widersprüche** (Erkenntnis A in Nachricht 5 widerspricht Erkenntnis B in Nachricht 50)
- Sie wird **unkontrollierbar** (du weißt nicht mehr, warum eine Regel drinsteht)
- Auto-Writes ohne Review sind ein **Sicherheitsrisiko** (eine falsche Erkenntnis vergiftet alle künftigen Sessions)

**Was stattdessen dein Ziel erreicht — eine getaktete Lernschleife:**
- Claude Code **sammelt** Erkenntnisse während der Arbeit (in einer Lern-Logdatei, billig)
- Am **Session-Ende** destilliert es die wichtigsten Erkenntnisse (kompakt)
- Es **schlägt** CLAUDE.md-Updates vor (nicht schreibt blind)
- Der **Owner bestätigt** (oder ein Auto-Approve-Modus für unkritische Lernfelder)
- CLAUDE.md wächst **kontrolliert** und bleibt schlank durch periodische Konsolidierung

Das ist **Weltklasse-Niveau**: kontinuierliches Lernen MIT Governance. Genau das bauen wir.

---

## 2. Architektur der Lernschleife

```
┌─────────────────────────────────────────────────────────────┐
│ WÄHREND DER ARBEIT (billig, kein CLAUDE.md-Write)            │
│                                                               │
│  Claude Code erkennt eine wiederverwendbare Lektion          │
│  → schreibt 1 Zeile in .claude/learning/insights_inbox.md    │
│    (z.B. "Spend-Queries immer mit org_id-Index, sonst 3s")   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ SESSION-ENDE (Stop-Hook, getaktet)                           │
│                                                               │
│  /scc-learn-distill Command läuft:                           │
│  1. Liest insights_inbox.md                                  │
│  2. Klassifiziert: Effizienz / Wirtschaftlichkeit / Technik  │
│  3. Dedupliziert gegen bestehende CLAUDE.md                  │
│  4. Schreibt Vorschläge in .claude/learning/proposals.md     │
│  5. Leert insights_inbox.md                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ OWNER-REVIEW (kontrolliert)                                  │
│                                                               │
│  Owner liest proposals.md                                    │
│  → /scc-learn-apply übernimmt bestätigte in CLAUDE.md        │
│    Abschnitt 10 (Erkenntnisse) und 11 (Bereiche & Status)    │
│                                                               │
│  ODER Auto-Approve für unkritische Kategorien                │
│  (z.B. reine Performance-Hinweise) wenn Owner das freischaltet│
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ PERIODISCHE KONSOLIDIERUNG (monatlich, hält CLAUDE.md schlank)│
│                                                               │
│  /scc-learn-consolidate:                                     │
│  - fasst ähnliche Erkenntnisse zusammen                      │
│  - entfernt veraltete/widersprüchliche                       │
│  - hält CLAUDE.md unter Token-Budget                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Datei-Struktur

```
.claude/
├── learning/
│   ├── insights_inbox.md       ← Rohe Erkenntnisse während Arbeit (billig)
│   ├── proposals.md            ← Destillierte Vorschläge (Session-Ende)
│   ├── applied_log.md          ← Was wurde übernommen (Audit)
│   └── config.md               ← Welche Kategorien auto-approve sind
├── commands/
│   ├── scc-learn-distill.md    ← Session-Ende-Destillation
│   ├── scc-learn-apply.md      ← Vorschläge in CLAUDE.md übernehmen
│   └── scc-learn-consolidate.md ← Monatliche Konsolidierung
└── hooks/
    ├── capture-insight.sh       ← Hilfsskript für Insight-Capture
    └── session-end-distill.sh   ← Stop-Hook
```

**Wichtig (Release-Hygiene):** `.claude/` gehört NIE ins externe Release-Artefakt. Phase 2 WAVE 01 Release-Verifier hat es auf der Ausschlussliste.

---

## 4. Was Claude Code als "Erkenntnis" erfasst

Nur **wiederverwendbare** Lektionen, die künftige Sessions effizienter/wirtschaftlicher machen. Drei Kategorien:

### Kategorie EFFIZIENZ (Token/Zeit)
- "Datei X ist 4000 Zeilen — immer mit `grep` gezielt lesen, nie ganz"
- "Test-Suite Y braucht 90s — vor Änderung an Z gezielt nur Y-Subset laufen lassen"
- "Service-Datei A ist Index für Domäne B — immer zuerst lesen"
- "Migration-Pattern: neue Tabellen immer mit `IF NOT EXISTS` für Idempotenz"

### Kategorie WIRTSCHAFTLICHKEIT (Projekt-Ökonomie)
- "Feature X kostet pro Kunde Y an Hetzner-Ressourcen — bei Skalierung beachten"
- "Stripe-Webhook-Verarbeitung ist teuerster Pfad — Idempotenz kritisch"
- "Customer Health Score braucht Daten aus 3 Domänen — teure Query, cachen"
- "Manuelle Rechnung ist Default bis Stripe live — kein Code für Auto-Billing verschwenden"

### Kategorie TECHNIK (Projekt-spezifisches Wissen)
- "Plan-Keys sind DEMO/BASIS/PLUS/PRO/INDIVIDUELL — NOTDIENST ist Legacy-Alias"
- "Worker liefert nie org_id — Backend leitet aus assignment_link ab"
- "SCC-Mutationen brauchen immer Step-up + Audit"
- "Tenant-Scope fehlt = restriktiv (nichts), nie permissiv (alles)"

**Was NICHT erfasst wird:**
- Einmalige Bugs ohne Wiederverwendungswert
- Triviales ("Variable umbenannt")
- Spekulationen ("könnte sein dass...")
- Alles was schon in CLAUDE.md / 00_RULES.md steht

---

## 5. Die Command-Dateien (Skelette)

### `.claude/commands/scc-learn-distill.md`

```markdown
---
description: Destilliert gesammelte Erkenntnisse am Session-Ende zu CLAUDE.md-Vorschlägen
---

Lies .claude/learning/insights_inbox.md.

Für jede Erkenntnis:
1. Klassifiziere: EFFIZIENZ / WIRTSCHAFTLICHKEIT / TECHNIK
2. Prüfe gegen bestehende CLAUDE.md (Abschnitt 10 Erkenntnisse, Abschnitt 11 Bereiche):
   - Schon vorhanden? → verwerfen
   - Widerspricht Bestehendem? → als KONFLIKT markieren, nicht auto-übernehmen
   - Neu und wertvoll? → als Vorschlag formulieren
3. Formuliere jeden Vorschlag in EINER Zeile, maximal prägnant:
   Format: `[KATEGORIE] <Erkenntnis> (Quelle: <Datei/Welle>)`

Schreibe alle Vorschläge nach .claude/learning/proposals.md mit Datum.
Leere danach insights_inbox.md (Inhalt nach applied_log.md archivieren).

Gib NUR eine kompakte Zusammenfassung aus:
"X Erkenntnisse destilliert: Y Effizienz, Z Wirtschaftlichkeit, W Technik. K Konflikte markiert. Review mit /scc-learn-apply."

KEINE langen Erklärungen. Token sparen.
```

### `.claude/commands/scc-learn-apply.md`

```markdown
---
description: Übernimmt bestätigte Lern-Vorschläge in CLAUDE.md (kontrolliert)
---

Lies .claude/learning/proposals.md und .claude/learning/config.md.

Für jeden Vorschlag:
1. Wenn Kategorie in config.md als auto_approve markiert UND kein KONFLIKT:
   → direkt in CLAUDE.md übernehmen
2. Sonst:
   → dem Owner zeigen und auf explizite Bestätigung warten
   → NUR bei "ja"/"übernehmen" schreiben

Übernahme-Ziel in CLAUDE.md:
- EFFIZIENZ + TECHNIK → Abschnitt 10 (Erkenntnisse)
- WIRTSCHAFTLICHKEIT → Abschnitt 10 + Verweis in Abschnitt 5 (Wirtschaftlichkeitsregeln)
- Bereichs-spezifisch → Abschnitt 11 (Bekannte Bereiche & Status)

Regeln:
- Jede übernommene Zeile MUSS prägnant bleiben (max 1-2 Zeilen)
- Kein Duplikat erzeugen
- Bei KONFLIKT: Owner entscheidet, alte Regel ersetzen oder Vorschlag verwerfen
- Nach Übernahme: Eintrag in .claude/learning/applied_log.md (Datum, Erkenntnis, Ziel-Abschnitt)
- proposals.md nach Übernahme leeren

Gib kompakte Zusammenfassung: "X übernommen, Y verworfen, Z auf Owner-Entscheidung wartend."
```

### `.claude/commands/scc-learn-consolidate.md`

```markdown
---
description: Konsolidiert CLAUDE.md monatlich, hält sie schlank
---

Lies CLAUDE.md Abschnitt 10 (Erkenntnisse) und 11 (Bereiche).

Aufgaben:
1. Ähnliche Erkenntnisse zusammenfassen (z.B. 3 Performance-Hinweise zu Spend-Queries → 1 Regel)
2. Veraltete entfernen (z.B. "Stripe noch nicht live" wenn Stripe inzwischen live ist)
3. Widersprüche auflösen (Owner fragen bei Unklarheit)
4. Token-Budget prüfen: CLAUDE.md Abschnitt 10+11 sollte zusammen unter ~150 Zeilen bleiben
   - Wenn drüber: am wenigsten wertvolle/spezifische Erkenntnisse in
     docs/finalization/claude_learnings_archive.md auslagern

Zeige dem Owner ein Vorher/Nachher-Diff der konsolidierten Abschnitte.
NUR nach Bestätigung schreiben.

Gib aus: "CLAUDE.md konsolidiert: vorher X Zeilen, nachher Y Zeilen. Z archiviert."
```

---

## 6. Die Hook-Dateien (Skelette)

### `.claude/hooks/session-end-distill.sh` (Stop-Hook)

```bash
#!/usr/bin/env bash
# Stop-Hook: erinnert an Destillation am Session-Ende
set -euo pipefail

INBOX=".claude/learning/insights_inbox.md"

# Nur wenn Inbox nicht leer ist
if [[ -f "$INBOX" && -s "$INBOX" ]]; then
  COUNT=$(grep -c "^- " "$INBOX" 2>/dev/null || echo "0")
  if [[ "$COUNT" -gt 0 ]]; then
    echo "HINWEIS: $COUNT ungenutzte Erkenntnisse in insights_inbox.md."
    echo "Empfehlung: /scc-learn-distill ausführen, um CLAUDE.md-Vorschläge zu erzeugen."
  fi
fi

exit 0
```

### `.claude/hooks/capture-insight.sh` (Hilfsskript)

```bash
#!/usr/bin/env bash
# Fügt eine Erkenntnis zur Inbox hinzu (von Claude Code aufgerufen)
# Usage: capture-insight.sh "EFFIZIENZ" "Spend-Queries immer mit org_id-Index" "spendAnalyticsService.js"
set -euo pipefail

CATEGORY="${1:?Kategorie fehlt}"
INSIGHT="${2:?Erkenntnis fehlt}"
SOURCE="${3:-unbekannt}"
INBOX=".claude/learning/insights_inbox.md"
DATE=$(date +%Y-%m-%d)

mkdir -p .claude/learning
echo "- [$CATEGORY] $INSIGHT (Quelle: $SOURCE, $DATE)" >> "$INBOX"
echo "Erkenntnis erfasst: [$CATEGORY] $INSIGHT"
```

---

## 7. Die Config-Datei

### `.claude/learning/config.md`

```markdown
# Lern-Konfiguration

## Auto-Approve-Kategorien
Diese Kategorien werden ohne Owner-Review in CLAUDE.md übernommen
(nur wenn kein KONFLIKT markiert ist):

- EFFIZIENZ: ja    (reine Performance-/Token-Hinweise sind risikoarm)
- TECHNIK: nein    (technische Regeln brauchen Review — können falsch sein)
- WIRTSCHAFTLICHKEIT: nein  (ökonomische Annahmen brauchen Owner-Bestätigung)

## Token-Budget für CLAUDE.md Lernabschnitte
- Abschnitt 10 (Erkenntnisse): max 100 Zeilen
- Abschnitt 11 (Bereiche & Status): max 60 Zeilen
- Bei Überschreitung: /scc-learn-consolidate ausführen

## Konsolidierungs-Takt
- Empfehlung: nach jeweils 5 abgeschlossenen Phasen ODER monatlich
```

---

## 8. Integration in CLAUDE.md

Die bestehende CLAUDE.md (aus Phase 1) hat bereits:
- **Abschnitt 8:** Self-Update-Mechanik (kontrolliertes Wachstum nach Owner-Bestätigung)
- **Abschnitt 10:** Erkenntnisse (leer, wird befüllt)
- **Abschnitt 11:** Bekannte Bereiche & Status

Diese Lernschleife ist die **konkrete Umsetzung** von Abschnitt 8. Die Erweiterung für CLAUDE.md Abschnitt 8 liegt in `CLAUDE_MD_ADDENDUM.md`.

---

## 9. Wie Claude Code die Erkenntnis-Erfassung nutzt

Während der Arbeit, wenn Claude Code eine wiederverwendbare Lektion erkennt, fügt es sie der Inbox hinzu — entweder via Hilfsskript oder direkt:

```bash
echo "- [EFFIZIENZ] vendorPoolService Scorecard-Query braucht JOIN über 4 Tabellen, ohne Index 2.5s — Index auf vendor_org_id ergänzt (Quelle: WAVE_04C, 2026-06-10)" >> .claude/learning/insights_inbox.md
```

**Wichtig:** Das ist ein **einzeiliger Append** — kostet fast keine Tokens. Die teure Destillation passiert nur einmal am Session-Ende, nicht bei jeder Nachricht.

---

## 10. Warum das dein Ziel besser erreicht als "Update bei jeder Nachricht"

| "Bei jeder Nachricht" (deine ursprüngliche Idee) | Kontrollierte Lernschleife (diese Lösung) |
|---|---|
| CLAUDE.md wächst unkontrolliert | CLAUDE.md bleibt schlank durch Konsolidierung |
| Widersprüche sammeln sich an | Konflikte werden markiert + aufgelöst |
| Teuer (CLAUDE.md-Write pro Nachricht) | Billig (1 Zeile Append pro Erkenntnis) |
| Keine Governance | Owner-Review für kritische Kategorien |
| Falsche Erkenntnis vergiftet alles | Review fängt falsche Erkenntnisse ab |
| Tokens steigen mit jeder Session | Tokens bleiben durch Budget-Cap stabil |
| Du verlierst Überblick | applied_log.md = vollständiger Audit |

**Das ist Premium-Weltklasse-Niveau:** ein Modell, das aus dem Projekt lernt, ohne sich selbst zu sabotieren.

---

## 11. Setup-Reihenfolge

In Phase 5 (idealerweise früh, z.B. nach Phase A):

1. `.claude/learning/` Ordner anlegen mit `config.md`
2. Die 3 Command-Dateien anlegen
3. Die 2 Hook-Dateien anlegen + Stop-Hook in `.claude/settings.json` registrieren
4. CLAUDE.md Abschnitt 8 um den Addendum erweitern (siehe `CLAUDE_MD_ADDENDUM.md`)
5. Sicherstellen: `.claude/` ist im Release-Verifier ausgeschlossen
6. Erste Test-Erkenntnis erfassen + `/scc-learn-distill` testen

**Acceptance:**
- [ ] Erkenntnis-Erfassung funktioniert (1-Zeilen-Append)
- [ ] `/scc-learn-distill` erzeugt Vorschläge
- [ ] `/scc-learn-apply` übernimmt nach Review in CLAUDE.md
- [ ] `/scc-learn-consolidate` hält CLAUDE.md unter Budget
- [ ] Auto-Approve nur für EFFIZIENZ
- [ ] `.claude/` nicht im Release
- [ ] applied_log.md führt Audit

---

## 12. Owner-Aufgaben für die Lernschleife

- [ ] Entscheiden, welche Kategorien auto-approve sind (Empfehlung: nur EFFIZIENZ)
- [ ] Token-Budget für CLAUDE.md-Lernabschnitte festlegen (Empfehlung: 100/60 Zeilen)
- [ ] Konsolidierungs-Takt festlegen (Empfehlung: alle 5 Phasen)
- [ ] Regelmäßig `proposals.md` reviewen (kostet Minuten, spart künftig Tokens)
