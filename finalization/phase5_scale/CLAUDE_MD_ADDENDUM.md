# CLAUDE.md Addendum — Erweiterung für die selbstlernende Mechanik

> Diese Inhalte ergänzen die bestehende CLAUDE.md (aus Phase 1). Sie ersetzen/erweitern Abschnitt 8 (Self-Update-Mechanik) und schärfen Abschnitt 5 (Wirtschaftlichkeitsregeln). **Manuell in die bestehende CLAUDE.md einfügen** — nicht blind überschreiben.

---

## So fügst du es ein

Die bestehende CLAUDE.md hat 12 Abschnitte. Dieser Addendum:
1. **Ersetzt** Abschnitt 8 (Self-Update-Mechanik) durch die erweiterte Version unten
2. **Ergänzt** Abschnitt 5 (Wirtschaftlichkeitsregeln) um die Lern-Verknüpfung
3. **Lässt** Abschnitt 10 + 11 unverändert (werden durch die Lernschleife befüllt)

---

## Ersatz für Abschnitt 8 — Self-Update- und Lern-Mechanik

```markdown
## 8. Self-Update- und Lern-Mechanik

Claude Code verbessert dieses Dokument kontrolliert und kontinuierlich. Es gibt zwei Wege:

### 8.1 Manuelle Ergänzung (wie bisher)
Wenn Claude Code während der Arbeit eine wiederverwendbare Erkenntnis gewinnt:
1. Update-Vorschlag formulieren (max 3 Sätze)
2. Owner fragen: "Soll ich folgenden Eintrag in CLAUDE.md übernehmen?"
3. Nur nach expliziter Bestätigung schreiben
4. Bei Ablehnung verwerfen, nicht zweimal vorschlagen

### 8.2 Lernschleife (Phase 5, getaktet)
Claude Code betreibt eine kontrollierte Lernschleife für Wirtschaftlichkeit und Effizienz:

**Während der Arbeit:**
- Erkennt Claude Code eine wiederverwendbare Lektion, fügt es EINE Zeile zu
  `.claude/learning/insights_inbox.md` hinzu (billig, kein CLAUDE.md-Write).
- Drei Kategorien: EFFIZIENZ (Token/Zeit), WIRTSCHAFTLICHKEIT (Projekt-Ökonomie), TECHNIK.
- Nur wiederverwendbare Lektionen. Keine Einzelbugs, kein Triviales, keine Spekulation.

**Am Session-Ende:**
- `/scc-learn-distill` destilliert die Inbox zu Vorschlägen in `.claude/learning/proposals.md`.

**Review:**
- `/scc-learn-apply` übernimmt bestätigte Vorschläge in Abschnitt 10 + 11.
- Auto-Approve nur für Kategorie EFFIZIENZ (siehe `.claude/learning/config.md`).
- WIRTSCHAFTLICHKEIT und TECHNIK brauchen Owner-Bestätigung.

**Konsolidierung:**
- `/scc-learn-consolidate` hält Abschnitt 10 + 11 unter Token-Budget (100/60 Zeilen).

### 8.3 Eiserne Regeln der Lernschleife
- KEIN Auto-Write bei jeder Nachricht. CLAUDE.md aktualisiert sich nur getaktet.
- KEINE Erkenntnis ohne Quelle (Datei/Welle).
- KEINE Erkenntnis, die einer bestehenden Regel widerspricht, ohne Owner-Entscheidung.
- CLAUDE.md bleibt schlank. Wachstum nur gegen Konsolidierung.
- Jede Übernahme wird in `.claude/learning/applied_log.md` auditiert.
- `.claude/` gehört NIE ins externe Release-Artefakt.

Vollständige Spezifikation: `finalization/phase5_scale/SELF_UPDATING_CLAUDE_MD.md`.
```

---

## Ergänzung für Abschnitt 5 — Wirtschaftlichkeitsregeln

Füge am Ende von Abschnitt 5 hinzu:

```markdown
### Wirtschaftlichkeits-Lernfeld (Phase 5)

Claude Code achtet aktiv auf die Projekt-Ökonomie und erfasst wirtschaftlich
relevante Erkenntnisse über die Lernschleife (Abschnitt 8.2):

- **Ressourcenkosten pro Kunde:** Welche Features verursachen bei Skalierung
  (10 → 300 Kunden) hohe Hetzner-/DB-/Mail-Kosten? Erfassen.
- **Teure Pfade:** Welche Queries/Jobs sind die teuersten? Caching/Index prüfen.
- **Verschwendung vermeiden:** Kein Code für Auto-Billing, solange manuelle
  Rechnung Default ist. Keine Features bauen, die kein Kunde nutzt.
- **Token-Ökonomie:** Eigene Arbeitsweise effizient halten (gezielt lesen,
  Diffs statt Volldateien, Arbeitsdateien als Gedächtnis).
- **Skalierungs-Schwellen:** Was bei 10 Kunden ok ist, kann bei 300 brechen.
  Bei jeder Änderung die Gate-Stufe (10/50/100/300) mitdenken.

Wirtschaftliche Erkenntnisse → Kategorie WIRTSCHAFTLICHKEIT in der Lernschleife.
Brauchen Owner-Bestätigung vor CLAUDE.md-Übernahme.
```

---

## Optionale Schärfung für Abschnitt 2 — Kernprinzipien

Wenn du willst, ergänze bei den Kernprinzipien:

```markdown
- **Wirtschaftlich denken:** Jede Zeile Code, jedes Feature, jede Query hat
  Kosten — in Entwicklungszeit, Tokens, Laufzeit-Ressourcen und Wartung.
  Wiederverwendbarkeit und Effizienz vor Eleganz. Bei Skalierung mitdenken.
- **Kontinuierlich lernen:** Wiederverwendbare Erkenntnisse über Effizienz und
  Wirtschaftlichkeit werden erfasst und kontrolliert in dieses Dokument
  destilliert (Abschnitt 8.2). Das Projekt wird mit jeder Session schlauer.
```

---

## Was du NICHT tun solltest

- **Nicht** die ganze CLAUDE.md durch dieses Addendum ersetzen — es ergänzt nur Abschnitte 8, 5, 2
- **Nicht** Auto-Approve für TECHNIK oder WIRTSCHAFTLICHKEIT freischalten (zu riskant)
- **Nicht** das Token-Budget für Lernabschnitte weglassen (sonst bläht CLAUDE.md auf)
- **Nicht** vergessen, `.claude/` im Release-Verifier auszuschließen

---

## Verifikation nach Einfügen

- [ ] CLAUDE.md Abschnitt 8 enthält die Lernschleife (8.1, 8.2, 8.3)
- [ ] CLAUDE.md Abschnitt 5 enthält das Wirtschaftlichkeits-Lernfeld
- [ ] Abschnitt 10 + 11 sind unverändert (leer/Status, werden befüllt)
- [ ] CLAUDE.md ist nicht länger geworden als nötig (Addendum ist kompakt)
- [ ] Die Lern-Commands und Hooks aus `SELF_UPDATING_CLAUDE_MD.md` existieren
```
