# WAVE_00 — Baseline, Freeze und Entscheidungsboard

> **Phase:** Foundation. **Prio:** P0. **Vor allem anderen.**
> **Ausführungsagent:** Claude Code (read-only)

---

## Ziel

Starte nicht mit Coding. Erstelle eine belastbare Baseline des aktuellen Repo-Zustands. Ohne diese Baseline ist jede spätere Welle blind.

---

## Aufgaben

### 1. Repo-Inventur (read-only)

Identifiziere und dokumentiere:

- aktive HTML-Seiten unter `frontend/public/*.html` und Sub-Ordnern (`staff/`, `legal/`, `trust/`)
- Frontend-JS unter `frontend/public/js/*.js`
- API-Routen unter `api/routes/`
- Services unter `api/services/`
- Middleware unter `api/middleware/`
- Datenmodelle und Migrationen unter `sql/migrations/`
- Plan-/Feature-/Entitlement-Definitionen (wo immer sie liegen)
- Rollenchecks und RBAC-Logik
- Staff-/Owner-/Admin-/OCC-Bereiche
- Billing-/Subscription-/Add-on-Flows
- Referral-/Bounty-/Credit-Module
- Contract-/Rahmenvertrag-Module
- Dashboard-/KPI-Datenquellen
- Test-Suites und bekannte Fehler
- Release-Artefakt-Regeln (CI-Jobs)
- Doppelte, veraltete, konkurrierende HTML-Dateien
- Orte, an denen leere Daten 500er, kaputte Cards oder endlose Ladezustände erzeugen

### 2. Dokumente erstellen / aktualisieren

Im Repo unter `docs/`:

- `docs/FINALIZATION_BASELINE.md` — der Ist-Zustand
- `docs/FINALIZATION_DECISION_BOARD.md` — alle gefundenen Funde mit Triage
- `docs/ROLE_VISIBILITY_MATRIX.md` — initiale Version oder TODO-Matrix
- `docs/COMMERCIAL_SOURCE_OF_TRUTH.md` — initiale Version oder Konsolidierungsplan
- `docs/KPI_SOURCE_OF_TRUTH.md` — initiale Version oder Konsolidierungsplan
- `docs/ENTERPRISE_RELEASE_GATES.md` — Gate-Definitionen für Pilot- und Enterprise-Launch
- `docs/PILOT_GO_LIVE_TODOS.md` — falls existiert: aktualisieren statt überschreiben

Wenn `docs/` nicht existiert: anlegen.

### 3. Decision Board pro Fund

Jeder relevante Fund wird klassifiziert nach:

- **Kategorie:** Bug / Rollen-Sichtbarkeit / Tenant / Commercial / Security / Core Flow / QA / UX / Ausbau / Cleanup / Doku
- **Betroffene Rolle:** Unternehmen / Unternehmens-Admin / Vendor / Vendor-Admin / Disponent / Worker / Staff / Owner / Finance / Auditor / Enterprise-Konzern
- **Priorität:** P0 / P1 / P2 / P3 (siehe `01_PRIORITIES.md`)
- **Lösungstyp:** fixen / ausblenden / soft-locken / ausgrauen / umbenennen / umleiten / deaktivieren / Coming Soon / Staff-Freigabe / später / entfernen
- **Risiko:** niedrig / mittel / hoch
- **Akzeptanzkriterium:** konkret testbar

### 4. Bei unscharfen Punkten explizit prüfen

- Für welche Rolle ist der Bereich gedacht?
- Ist die Seite überhaupt notwendig?
- Gibt es doppelte HTMLs oder alte Routen?
- Neuer Flow nötig ODER reicht ein Guard / Soft-Lock?
- Datenfehler ODER falscher Default?
- Feature ODER nur fehlende Sichtbarkeitslogik?

---

## Akzeptanzkriterien

- [ ] Entscheidungsboard existiert in `docs/FINALIZATION_DECISION_BOARD.md`
- [ ] Alle P0-Themen sind eindeutig markiert
- [ ] Baseline-Dokument existiert und ist mit aktuellem Repo-Stand abgeglichen
- [ ] Initiale Rollen-/Commercial-/KPI-Source-of-Truth-Skelette liegen vor
- [ ] Kein einziges Feature wurde gebaut, bevor diese Welle abgeschlossen ist
- [ ] Keine Datei wurde verändert außer den oben genannten Doku-Dateien
- [ ] Vorhandene Skill-/Agent-Dateien (`AGENTS.md`, `.agents/skills/tempconnect-project/SKILL.md`) wurden gelesen und respektiert

---

## Stop-Regeln in dieser Welle

- Wenn `AGENTS.md` oder `CLAUDE.md` fundamentale Widersprüche zur konsolidierten Struktur zeigen → Owner fragen
- Wenn das Repo deutlich anders strukturiert ist als hier angenommen → Inventur trotzdem machen, aber Mapping zur konsolidierten Struktur dokumentieren
- Wenn vorhandene `docs/PILOT_GO_LIVE_TODOS.md` Punkte enthält, die im Code bereits erledigt sind → als "veraltete TODOs" markieren, nicht blind übernehmen

---

## Output-Format

Standard-Output nach Format in `00_RULES.md` Abschnitt 3, plus zusätzlich:

```
## Baseline-Statistik
- HTML-Dateien gesamt:
- API-Routen gesamt:
- Services gesamt:
- Migrations gesamt:
- Bekannte Test-Failures (Anzahl, P0/P1-Klassifizierung):
- Doppelte/konkurrierende HTML-Dateien (Liste):
- Hygiene-Funde (Secrets, .env, .git, node_modules etc.):

## Top-10 P0-Funde (kurz priorisiert)
1. ...
2. ...
```

---

## Übergang zur nächsten Welle

→ Erst nach Owner-Bestätigung des Decision Boards: WAVE_01 starten.
