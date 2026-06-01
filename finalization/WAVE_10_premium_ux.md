# WAVE_10 — Premium UX und C-Level-Reife

> **Phase:** Polish. **Prio:** P2. **Voraussetzung:** Kernflows funktionieren (WAVE_04+).
> **Ausführungsagent:** Claude Code (Frontend-Stärke)

---

## Ziel

TempConnect soll beim ersten Login nicht wie ein MVP wirken. **Erst NACH WAVE_04 angehen** — Polish auf kaputten Flows ist Verschwendung.

---

## 1. UI-Konsistenz

- Einheitliche Cards
- Einheitliche Button-Hierarchie (Primary / Secondary / Ghost / Destructive)
- Einheitliche Tabellen, Filter, Badges
- Keine doppelten oder widersprüchlichen Seiten (Cleanup-Funde aus WAVE_00)
- Light/Dark Mode reparieren und testen (alle Kernseiten)
- Design Tokens verwenden (keine hardcodierten Farben in Workforce-/Enterprise-Seiten)

## 2. Empty States

Jede leere Ansicht braucht:
- Klare Aussage
- Ursache
- Nächste Aktion
- Keine technische Fehlermeldung
- Ggf. Onboarding-/Demo-Hilfe

**Beispiele:**
- "Aktuell keine offenen Requisitions."
- "Noch keine aktiven Vendoren im Pool."
- "Für die letzten 30 Tage liegen keine bestätigten Spend-Daten vor."
- "Keine kritischen Besetzungsengpässe."
- "Dieses Feature ist im aktuellen Plan nicht enthalten." + Upgrade-CTA

## 3. Enterprise Copywriting

- Keine Basteltexte
- Keine technischen Interna für Kunden
- Klare Managementsprache
- Klare Plan- / Feature-Sprache
- Keine Emojis in produktiver UI

## 4. Accessibility und Responsiveness

- Kernseiten auf Desktop/Tablet brauchbar
- Fokuszustände sichtbar
- Tastaturnavigation für kritische Aktionen
- Kontrast (WCAG AA)
- Verständliche Formularvalidierung
- ARIA-Attribute für interaktive Elemente

## 5. Tooltips und Microcopy

- Jede KPI hat Tooltip (siehe WAVE_05)
- Komplexe Begriffe (Requisition, Pulse, Notdienst, Rate Card) werden bei Hover erklärt
- Fehlermeldungen sind handlungsorientiert ("Was kann ich tun?")

---

## Akzeptanzkriterien

- [ ] Demo, Dashboard, Vendor Pool, Requisitions, Rate Cards, Spend, Contracts sind ohne Erklärausreden vorzeigbar
- [ ] Keine sichtbaren Platzhalter, toten Buttons oder unklaren Nullwerte
- [ ] Light/Dark Mode funktioniert auf Kernseiten
- [ ] Empty States in allen Hauptseiten
- [ ] Keine hardcodierten Farben in Enterprise-/Workforce-Seiten
- [ ] Keine Emojis in produktiver UI

---

## Stop-Regeln

- UI-Polish auf kaputtem Flow → STOP, erst Flow fixen (WAVE_04)
- Hardcodierte Farbe in neuem Code → ersetzen vor Commit
- Empty State, der wie 500 aussieht → fixen

---

## Triage-Hinweis

Viele "UX-Probleme" sind in Wahrheit **Empty-State-Fehler** oder **Rollen-Sichtbarkeits-Fehler** (siehe WAVE_03). Erst Triage, dann Polish.
