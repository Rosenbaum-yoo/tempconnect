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
