# SPECIAL — 31-Punkte-Bugboard und Triage

> Jederzeit referenzierbar. Wird zur Klassifizierung verwendet, wenn ein Bug-Verdacht auftaucht.

---

## Zweck

Viele scheinbare Bugs in TempConnect sind in Wahrheit **keine Bugs**, sondern:
- Rollen-/Sichtbarkeitslogik
- Tenant-Isolation-Lücken
- Falsche Defaults
- Commercial-Widersprüche
- Fehlende Empty States
- Doku-Drift

**Falsche Klassifizierung kostet Wochen.** Diese Datei zwingt zur sauberen Triage VOR jedem Fix.

---

## Triage-Workflow (Pflicht pro Verdacht)

### Schritt 1: Beschreibung sammeln

```
Symptom:
Wer hat es gemeldet:
Welche Rolle:
Welcher Plan:
Welche Org:
Reproduzierbar wie:
Erwartetes Verhalten:
Tatsächliches Verhalten:
```

### Schritt 2: Klassifizierung

| Kategorie | Frage | Lösungsrichtung |
|---|---|---|
| **Bug** | Code funktioniert NICHT wie der dokumentierte Vertrag? | Reparieren |
| **Rollen-Sichtbarkeit** | Sieht eine Rolle etwas, was sie nicht sehen sollte (oder umgekehrt)? | Ausblenden, soft-locken, Plan-Gate, Server-Guard |
| **Tenant-Isolation** | Cross-Org-Datenleck? | Server-Guard, RLS, Org-Scope erzwingen — **P0** |
| **Commercial** | Pricing / Plan / Entitlement greift nicht wie definiert? | Source of Truth abgleichen (WAVE_02) |
| **Security** | Auth / CSRF / Session schwach? | Härten (WAVE_06), oft **P0** |
| **Core Flow** | Kernprodukt-Fluss gebrochen? | Reparieren in WAVE_04 |
| **QA** | Test fehlt / falsch? | Test ergänzen (WAVE_12) |
| **UX / Default** | Logik korrekt, aber Nutzer irregeführt? | Copy, Empty State, Default |
| **Produktausbau** | Funktion fehlt schlicht? | Entscheiden: bauen oder Coming Soon |
| **Cleanup / Doku** | Redundanz, veraltete Wahrheit? | Bereinigen oder deprecate |

### Schritt 3: Priorisierung

Nach `01_PRIORITIES.md`:
- P0: Launch-Blocker (Security, Datenleck, Core Flow gebrochen)
- P1: Enterprise-kritisch (Commercial, Audit, Rollen)
- P2: Premium-Polish (UX, Copy)
- P3: Backlog

### Schritt 4: Entscheidung

```
Klassifizierung:
Priorität:
Lösungstyp:
Welche Welle bearbeitet das:
Geschätzter Aufwand:
Risiko bei Nicht-Fix:
Risiko bei Fix:
```

### Schritt 5: Ticket-Erstellung

Erst jetzt: Ticket im passenden Welle-Dokument anlegen mit Standard-Output-Format aus `00_RULES.md` Abschnitt 3.

---

## Häufige Fehl-Klassifizierungen

### "Bug": Worker sieht Card X
**Oft in Wahrheit:** Rollen-Sichtbarkeit
→ **Frage:** Sollte Worker diese Card laut Rollenmatrix sehen?
→ Wenn nein: ausblenden + Server-Guard (NICHT als Bug fixen)

### "Bug": Vendor sieht fremde Daten
**Oft in Wahrheit:** Tenant-Isolation-Lücke (**P0**)
→ **Frage:** Hat die Query Org-Scope-Filter?
→ Wenn nein: Server-Guard + RLS-Backstop (WAVE_06)

### "Bug": Card zeigt falsche Zahl
**Oft in Wahrheit:** KPI ohne Source of Truth
→ **Frage:** Aus welcher Quelle kommt die Zahl?
→ Wenn unklar: KPI-Definition klären (WAVE_05) — NICHT blind die Zahl fixen

### "Bug": 500 auf leerer Seite
**Oft in Wahrheit:** Fehlender Empty State
→ **Frage:** Was passiert mit leerem Datenbestand?
→ Empty State definieren (WAVE_10)

### "Bug": Plan X kann nicht gebucht werden
**Oft in Wahrheit:** Commercial-Widerspruch (UI zeigt, Backend kennt nicht)
→ **Frage:** Welche kanonische Quelle?
→ Source of Truth angleichen (WAVE_02)

### "Bug": Feature funktioniert nicht
**Oft in Wahrheit:** Coming-Soon-Feature, das nicht als solches markiert ist
→ **Frage:** Ist das Feature produktiv lieferbar?
→ Wenn nein: als Coming Soon markieren + Backend deaktivieren

---

## Triage-Checkliste für Code-Review

Vor jedem Code-Review fragen:
- [ ] Was war die Klassifizierung des Tickets?
- [ ] Wurde die Klassifizierung sauber begründet?
- [ ] Passt der Fix zur Klassifizierung?
- [ ] Wurde nicht nur das Symptom, sondern die Ursache adressiert?
- [ ] Gibt es Cross-Domain-Auswirkungen, die übersehen wurden?

---

## Wenn unklar: Default-Aktion

Wenn die Klassifizierung nicht eindeutig ist:
1. **Owner fragen** (Antwort dauert Minuten, falscher Fix kostet Tage)
2. **Sicherer Default:** ausblenden / soft-locken / Coming Soon — NICHT fixen ohne Klarheit
3. **Im Decision Board dokumentieren** mit Begründung "Klassifizierung unklar — sicherer Default gewählt"
