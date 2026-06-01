# WAVE_05 — Executive Dashboard und KPI-Wahrheit

> **Phase:** Core. **Prio:** P1. **Voraussetzung:** WAVE_04 (mindestens 4A-4F) abgeschlossen.

---

## Ziel

Das Executive Dashboard ist Managementsteuerung, nicht Reporting-Deko. **Jede Zahl ist erklärbar.**

---

## Pflicht-KPIs

### 1. Offene Requisitions
- Quelle: Requisition-Domäne (4A)
- Zählt: `open`, nicht vollständig bedient, nicht storniert, nicht archiviert
- Zeitraum: Bestand ODER explizit 30 Tage (klar labeln)
- Drilldown: Requisitions mit Filter `open`

### 2. Aktive Vendoren
- Quelle: Vendor-Pool-Domäne (4C)
- Aktiv heißt fachlich relevant, nicht "existiert in Tabelle"
- Drilldown: Vendor Pool

### 3. Aktive Rate Cards
- Quelle: Rate-Card-Domäne (4F)
- Nur gültige und verwendbare Rate Cards (Status `active`)
- Drilldown: Rate Cards

### 4. Spend 30 Tage
- Quelle: definierte Spend-Wahrheit (4E)
- Actual / Committed / Forecast trennen
- Drilldown: Spend Analytics

### 5. Compliance-Warnungen
- Quelle: Compliance-Regelwerk (4G)
- Nur echte fachliche Warnungen (keine generischen)
- Drilldown: passende Warnungskategorie

### 6. Kritischer Besetzungsdruck
- Quelle: offene dringende Requisitions, Notdienst-/Pulse-Bedarfe oder SLA-Risiko (4A + 4B)
- Zeigt: Bedarf, Rolle, offene Menge, Zeit bis Start, Matching-/Supplier-Situation, CTA
- Drilldown: passende operative Seite

---

## Aufgaben

1. KPI-Karten ohne Quelle: entfernen ODER als Coming Soon / hidden markieren
2. Jede KPI braucht Tooltip mit:
   - Definition
   - Zeitraum
   - Was wird gezählt
   - Was wird nicht gezählt
3. Einheitliche Zeitraumlogik (alle KPIs verstehen "30 Tage" identisch)
4. Keine Dashboard-Route darf bei leerem Datenbestand 500 liefern
5. Drilldowns dürfen keine Sackgassen sein
6. `docs/KPI_SOURCE_OF_TRUTH.md` erstellen/aktualisieren

---

## Akzeptanzkriterien

- [ ] Jede Zahl ist erklärbar (Tooltip + Quelle)
- [ ] Jede Zahl hat Drilldown
- [ ] Nullzustände wirken professionell (kein 500, kein endloser Spinner)
- [ ] Dashboard ist demo-fähig auf leerer Demo-DB
- [ ] `docs/KPI_SOURCE_OF_TRUTH.md` listet alle KPIs mit Berechnungslogik

---

## Stop-Regeln

- KPI ohne Quelle ableitbar → ausblenden, nicht raten
- KPI zeigt Forecast als Actual → P0-Korrektur

---

## Betroffene Dateien

- `frontend/public/executive_dashboard.html`
- `api/routes/...` (Dashboard-Routes identifizieren)
- `api/services/...` (KPI-Aggregations-Services)
