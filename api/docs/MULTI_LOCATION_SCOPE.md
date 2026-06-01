# ADR: Multi-Location Scope — Entscheidung & Upgrade-Pfad

**Datum:** 2026-05-21  
**Status:** Aktiv  
**Entscheider:** Dennis Stegemann

---

## Entscheidung

**Option A gewählt: Location-Scope gilt nur für die Verwaltungsseite (`organization.html`).**

Der aktive Standort filtert NICHT automatisch Marktplatz, Bedarfe, Einsätze oder andere Plattformseiten.

## Begründung

- Option B (plattformweiter Scope) würde alle 30+ Seiten erfordern
- 80 % des Nutzens (Verwaltung, Übersicht, SCC-Monitoring) ist mit Option A abgedeckt
- Risiko und Aufwand stehen nicht im Verhältnis zum aktuellen Entwicklungsstand

---

## Wenn Option B umgesetzt werden soll — Checkliste

Diese Punkte müssen dann abgearbeitet werden:

### Backend
- [ ] `orgContext.js`: `req.locationId` wird bereits gesetzt — Basis steht
- [ ] `capacities.js` / `capacityExchangeService.js`: Angebote nach `location_id` filtern
- [ ] `requisitionService.js`: Bedarfe nach `location_id` filtern (Migration + FK fehlt noch)
- [ ] `assignmentService.js`: bereits vorbereitet (`location_id` Filter in `listAssignments`)
- [ ] `timesheetService.js`: Stundenzettel ggf. standortgebunden
- [ ] `dealAgreementService.js`: Deals ggf. standortgebunden
- [ ] Alle LIST-Endpunkte: wenn `req.locationId` gesetzt → automatisch filtern ODER explizit ignorieren (opt-in vs. opt-out entscheiden)

### Frontend (jede Seite einzeln)
- [ ] `capacity_exchange_feed.html` — Marktplatz
- [ ] `requisitions.html` — Bedarfe
- [ ] `deal_management.html` — Deals & Einsätze
- [ ] `executive_dashboard.html` — Executive-Dashboard
- [ ] `timesheets.html` — Stundenzettel
- [ ] `mitarbeiter.html` — Mitarbeiter-Übersicht
- [ ] `spend-analytics.html` — Spend-Analyse
- [ ] Alle weiteren Seiten die org-spezifische Daten zeigen

### UX
- [ ] Location-Scope-Chip ("📍 Berlin") auf jeder gefilterten Seite anzeigen
- [ ] Breadcrumb/Badge: "Alle Standorte" vs. "Standort: München HQ"
- [ ] Klarer Hinweis wenn Daten standortgefiltert sind (damit User nicht denkt, es gibt weniger Daten)
- [ ] "Für alle Standorte anzeigen"-Link auf jeder gefilterten Seite

### Testing
- [ ] E2E-Tests: Scope-Wechsel auf jeder betroffenen Seite
- [ ] Unit-Tests: alle Service-Filter mit `location_id`
- [ ] Grenzfall: User hat keine Standort-Auswahl → org-weite Sicht (Fallback)

---

## Aktueller Stand (Option A)

Was bereits gebaut ist und für Option B wiederverwendet wird:

| Was | Wo | Status |
|---|---|---|
| `req.locationId` Middleware | `orgContext.js` | ✅ fertig |
| `X-Location-Id` Header | `api.js` | ✅ fertig |
| Session-Cache `_locationCache` | `orgContext.js` | ✅ fertig |
| `GET/POST/DELETE /me/active-location` | `me.js` | ✅ fertig |
| Location-Switcher im User-Menü | `pageShell.js` | ✅ fertig |
| `assignmentService` Filter | `assignmentService.js` | ✅ fertig |
| `orgBoundary` Guards | `orgBoundary.js` | ✅ fertig |
| `resolveLocationScope()` | `hubVisibility.js` | ✅ fertig |
| DB-Spalten `location_id` | Migration 112 | ✅ deployed |

**Für Option B muss keines dieser Fundamente neu gebaut werden — nur die Seiten verdrahten.**
