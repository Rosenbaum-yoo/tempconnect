# WAVE_04 — Kernfachlichkeit der Staffing-/VMS-Plattform

> **Phase:** Core. **Prio:** P0. **Voraussetzung:** WAVE_00–03 abgeschlossen.
> **Ausführungsagent:** Backend-/Frontend-Mix — Owner-Freigabe für Backend
> **Umfang:** Diese Welle hat 8 Subbereiche (4A–4H). Jeder Subbereich kann eigene Session sein.

---

## Kernprodukt-Fluss (verbindlich)

```
Requisition (4A)
  → Capacity Matching (4B)
    → Vendor Pool (4C)
      → Assignment (4D)
        → Timesheet / Spend (4E)
          → Rate Card als Konditionsgrundlage (4F)
            → Compliance / Data Governance (4G)
              → Rahmenvertrag (4H, optional Querschnitt)
```

---

## 4A — Requisitions / Suchaufträge

**Ziel:** Requisitions sind die kanonische Wahrheit für offene Beschaffungsbedarfe.

### Aufgaben

- Statusmodell finalisieren: `draft`, `open`, `offered`, `partially_filled`, `filled`, `cancelled`, `closed`, `archived`
- Mengenlogik prüfen: `requested`, `offered`, `accepted`, `assigned`, `remaining`
- Dringlichkeit prüfen: `normal`, `urgent`, `critical`, `notdienst`/`pulse`
- Startdatum, Fristen und SLA-Risiko nachvollziehbar berechnen
- Stornierungen / abgelehnte Angebote korrekt zurück in Kapazitäts-/Angebotslogik führen
- Drilldowns aus Dashboard, Vendor Pool, Capacity Search und Assignments konsistent verlinken

### Akzeptanz

- Offene Requisitions verschwinden nicht ohne Statusgrund
- Teilbesetzungen sind korrekt berechnet
- Kritische Bedarfe sind eindeutig definierbar
- Tests decken `open`, `partially_filled`, `filled`, `cancelled`, `archived` ab

### Betroffene Dateien (initial)

- `frontend/public/requisitions.html`
- `frontend/public/marketplace_demand_list.html`, `marketplace_demand_detail.html`, `marketplace_demand_create.html`
- `frontend/public/demand_create.html`, `request_detail.html`, `company_requests.html`
- `api/routes/requisitions.js`, `api/routes/requests.js`, `api/routes/marketplace.js`
- `api/services/...` (Requisition-Service identifizieren)

---

## 4B — Capacity Search / Matching / Notdienst / Pulse

**Ziel:** Capacity Search darf keine falsche Verfügbarkeit anzeigen. Jeder Treffer ist erklärbar.

### Aufgaben

- Kanonische Datenquellen definieren:
  - Worker-Verfügbarkeit
  - Skills
  - Assignments (blockieren Verfügbarkeit)
  - Vendor-Angebote
  - Rate Cards (ohne Rate Card → kein buchbarer Treffer)
  - Standort, Zeitraum
  - Compliance-Status (abgelaufene Dokumente blockieren)
  - Vendor-Status (`active`, `paused`, `blocked`)
- Matching-Erklärbarkeit: pro Treffer "warum passt" und "warum blockiert"
- Notdienst vs. Pulse sauber trennen:
  - Definition Notdienst
  - Definition Pulse
  - Welcher Plan/Add-on aktiviert welche Taktung
  - Wann entsteht SLA-Risiko
- Keine Kapazität anzeigen, die wegen Assignment / Compliance / Rate Card / Plan faktisch nicht buchbar ist

### Akzeptanz

- Jeder Treffer ist erklärbar (UI zeigt Match-Gründe)
- Empty States nennen Ursache: keine Skills / keine Rate Card / keine Verfügbarkeit / keine Vendoren / falscher Plan
- Kritische Suchaufträge sind mit Requisitions verbunden (Drilldown)

### Betroffene Dateien

- `frontend/public/capacity_search.html`, `matching_results.html`
- `frontend/public/capacity_exchange*.html` (5 Dateien)
- `frontend/public/app_notdienst.html`
- `api/routes/matching.js`, `api/services/matchingEngine.js`, `capacityExchangeService.js`

---

## 4C — Vendor Pool / Supplier Management

**Ziel:** Vendor Pool ist operative Lieferantenbasis, nicht nur eine Liste.

### Aufgaben

- Vendor-Status finalisieren: `invited`, `active`, `preferred`, `paused`, `blocked`, `archived`
- Preferred-Vendor-Logik definieren
- Supplier Scorecards nur mit echten Quellen:
  - Response Time
  - Fill Rate
  - Cancel Rate
  - Compliance Issues
  - Timesheet Accuracy
  - Rate Card Coverage
  - Spend
- Vendor-spezifische Sichtbarkeit strikt prüfen (kein Vendor sieht andere Vendoren)
- Tier-Modell (falls vorhanden): Bronze/Silber/Gold/Strategic + Erklärbarkeit jeder Tier-Zuordnung

### Akzeptanz

- Aktive Vendoren sind fachlich definiert (nicht nur "existiert in Tabelle")
- Keine Fake-Scorecards (jede Zahl mit Quelle)
- Supplier-Daten sind mandantensicher (Cross-Tenant-Test)
- Tier-Änderungen sind auditiert

### Betroffene Dateien

- `frontend/public/vendor_pool.html`, `supplier_scorecard.html`
- `api/routes/vendorPool.js`, `api/services/vendorPoolService.js`

---

## 4D — Assignments / Einsatzsteuerung

**Ziel:** Assignments sind die Wahrheit für geplante und tatsächliche Einsätze.

### Aufgaben

- Statusmodell finalisieren: `planned`, `active`, `paused`, `completed`, `cancelled`, `disputed`
- Zuweisung aus Matching/Requisition ermöglichen
- Worker Portal und Disponenten-Logik verbinden
- Skills aus Einsatzportal korrekt berücksichtigen
- Doppelbuchung verhindern ODER regelbasiert auditieren
- Assignment beeinflusst Verfügbarkeit, Spend, Timesheets

### Akzeptanz

- Angenommene Besetzung erzeugt nachvollziehbaren Assignment-Zustand
- Storno wirkt korrekt auf Kapazität und Requisition (Mengenlogik!)
- Worker / Vendor / Company sehen nur erlaubte Daten (Cross-Tenant-Test)

### Betroffene Dateien

- `frontend/public/deal_management.html`, `offer_detail.html`
- `frontend/public/einsatzportal-einsaetze.html`, `einsatzportal-dashboard.html`, `einsatzportal-plan.html`
- `frontend/public/worker-portal.html`
- `api/routes/assignments.js`, `api/routes/workerPortal.js`
- `api/services/assignmentService.js`, `assignmentStaffingService.js`, `dealWorkflow.js`

---

## 4E — Timesheets / Leistung / Spend

**Ziel:** Spend darf nicht geraten werden. Jede Spend-Zahl hat Quelle und Zeitraum.

### Aufgaben

- Spend-Wahrheit definieren:
  - Bestätigte Timesheets
  - Freigegebene Leistungen
  - Rechnungen
  - Assignment × Rate Card NUR als Forecast (markiert)
- Forecast / Committed Spend / Actual Spend trennen
- Timesheet-Status: `draft`, `submitted`, `approved`, `rejected`, `invoiced`
- Spend Analytics darf bei fehlenden Daten KEIN 500 liefern → Empty State
- Worker → Einreichung → interne Prüfung → Kundenfreigabe → Abrechnung als sauberer Flow

### Akzeptanz

- Jede Spend-Zahl hat Quelle und Zeitraum
- Dashboard und Spend Analytics stimmen überein (gleiche Quelle)
- Leere Daten zeigen `0` mit Kontext, nicht `null` oder 500
- Timesheet-Statusübergänge sind auditiert
- Customer Bundle (Kundenfreigabe-Paket) ist auditierbar

### Betroffene Dateien

- `frontend/public/timesheets.html`, `timesheet-templates.html`, `worker-timesheet.html`
- `frontend/public/einsatzportal-stundenzettel.html`
- `frontend/public/spend-analytics.html`
- `frontend/public/worker-submissions-review.html`, `approvals.html`
- `api/routes/timesheets.js`, `api/services/timesheetService.js`, `workerSubmissionService.js`, `spendAnalyticsService.js`

---

## 4F — Rate Cards

**Ziel:** Rate Cards sind verbindliche Konditionsgrundlagen.

### Aufgaben

- Statusmodell: `draft`, `active`, `expired`, `archived`
- Gültigkeit, Standort, Rolle, Skill, Vendor, Kunde, Tarif, Zuschläge modellieren
- Keine aktive Buchung ohne passende Rate Card (Ausnahme nur mit Audit)
- Rate-Card-Drilldowns aus Vendor Pool, Spend, Assignments verbinden

### Akzeptanz

- Aktive Rate Cards sind eindeutig definiert
- Abgelaufene / Draft-Karten zählen nicht als aktiv (Dashboard-KPI!)
- Rate Card Management ist plan-/add-on-konform

### Betroffene Dateien

- `frontend/public/rate-cards.html`
- `api/routes/...` (Rate-Card-Routes identifizieren)

---

## 4G — Compliance Documents / Data Governance

**Ziel:** Compliance erzeugt klare Regeln, keine generischen Warnungen.

### Aufgaben

- Dokumenttypen: AÜG / Erlaubnisbescheid, Versicherungen, Datenschutz, Arbeitsschutz, Qualifikationen, Kundenvorgaben
- Status: `missing`, `pending`, `valid`, `expiring`, `expired`, `rejected`
- Warnungen nur regelbasiert (z. B. "läuft in < 30 Tagen ab"), keine generischen Hinweise
- Data-Governance-Add-on sauber trennen
- Export- / Lösch- / Retention-Logik dokumentieren
- Public Profiles: Zugriff auf Compliance-Dokumente nur mit Einwilligung

### Akzeptanz

- Compliance-Warnungen sind erklärbar (Regel + Zeitraum sichtbar)
- Keine generischen Warnungen ohne Regel
- Dokumentzugriffe sind mandantensicher
- Keine direkten öffentlichen Dokumente (Public Profile zeigt nur erlaubte Daten)

### Betroffene Dateien

- `frontend/public/compliance_overview.html`, `data-governance.html`
- `frontend/public/sla_nachweise.html`, `worker-profile-public.html`, `company_profile_public.html`
- `api/routes/dataGovernance.js`

---

## 4H — Rahmenvertrag / Contract Center

**Ziel:** Rahmenverträge wirken wie ein Enterprise-Baustein, nicht wie ein Dateiupload.

### Aufgaben

- Contract-Status: `draft`, `sent`, `under_review`, `accepted`, `active`, `expired`, `terminated`, `archived`
- Vertragsparteien modellieren: Kunde, Vendor, TempConnect, Konzern-/Standortbezug
- Versionierung sicherstellen
- Anhänge sicher speichern (kein Public Access)
- Contract-Aktionen auditieren
- Rate Cards, Supplier Status und Assignments OPTIONAL an aktive Vertragsgrundlagen koppeln
- Custom Terms / individuelle Tarife NUR mit Staff-Freigabe

### Akzeptanz

- Kein Vertrag wird stillschweigend überschrieben (Versionierung!)
- Jede Vertragsänderung ist auditierbar
- Vertragsstatus kann operative Freigaben beeinflussen
- Contract Center ist rollen- und mandantensicher
- Strategic Collaboration / Individualtarif-Anfragen laufen über Staff

### Betroffene Dateien

- `api/routes/contracts.js`, `api/services/contractService.js`
- `docs/CONTRACTS.md`
- Migrationen für Contract-Tabellen

---

## Triage-Hinweis (für gesamte Welle 4)

Viele Symptome im Kernflow sind in Wahrheit:
- **Mengenlogik-Probleme** (Storno wirkt nicht auf Requisition zurück → Spend falsch)
- **Statusmaschinen-Lücken** (kein definierter Übergang `disputed` → `completed`)
- **Cross-Domain-Inkonsistenzen** (Timesheet-Status mit Assignment-Status nicht synchron)

**Vor jedem Fix:** Statusmaschine zeichnen / dokumentieren. Dann fixen.

---

## Stop-Regeln (Welle 4)

- Statusmodell nicht definiert → Stop, klären, dann patchen
- Cross-Tenant-Risiko in Mengenlogik (Storno einer Org wirkt auf andere Org) → P0-Sicherheitslücke
- Mehrere parallele Wahrheiten für denselben Status (UI sagt X, API sagt Y) → Source of Truth festlegen, alles andere ableitet

---

## Akzeptanzkriterien (Gesamt-Welle 4)

- [ ] Alle 8 Statusmodelle (4A–4H) sind dokumentiert und implementiert
- [ ] Kernprodukt-Fluss läuft Ende-zu-Ende (Demo + Test)
- [ ] Mengenlogik (offered → accepted → assigned → remaining) konsistent
- [ ] Spend hat Source of Truth, kein Schätz-Spend ohne Markierung
- [ ] Cross-Tenant-Tests für alle 8 Subbereiche
- [ ] Empty States in allen Hauptseiten (kein 500 bei leerer DB)
- [ ] Contract / Rate Card als Voraussetzung für Assignment dokumentiert

---

## Output (pro Sub-Welle 4A–4H)

Standard-Output nach `00_RULES.md` Abschnitt 3.

---

## Übergang

→ Nach Abschluss aller 8 Subbereiche: WAVE_05 (KPI-Wahrheit) startet auf dieser Grundlage.
