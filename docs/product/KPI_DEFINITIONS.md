# TempConnect — KPI-Definitionen

> Kanonische Quelle: `api/services/reportingService.js` + `api/services/workforceService.js` + `api/services/spendAnalyticsService.js`
>
> Jede KPI hat: Name, Bedeutung, Datenquelle, Zeitraum, Berechnung, Drilldown, Empty State, Tests.
> 
> WAVE 08 — Phase 2 — 2026-05-26

---

## Executive Dashboard — Pflicht-KPIs

### KPI 1: Offene Requisitions

| Feld | Wert |
|---|---|
| **Key** | `open_requisitions` |
| **Label** | Offene Requisitions |
| **Fachliche Bedeutung** | Aktueller Beschaffungs-Backlog — gibt Auskunft über ungedeckten Personalbedarf |
| **Datenquelle** | Tabelle `requisitions` |
| **SQL-Kriterium** | `status IN ('OPEN', 'IN_REVIEW', 'SHORTLISTED', 'APPROVED', 'PENDING_APPROVAL')` |
| **Zeitraum** | Aktuell (kein Zeitfenster — Stichtagswert) |
| **Berechnung** | `COUNT(*)` aller Requisitions dieser Org mit den genannten Statuses |
| **Basis-Code** | `api/services/reportingService.js :: executiveMetrics()` |
| **Drilldown-Link** | `/public/requisitions.html?status_group=backlog[&location_id=...]` |
| **Tone-Logik** | ok: < 8 · warn: 8–19 · risk: ≥ 20 |
| **Empty State** | Wert = 0, Tone = ok, Drilldown aktiv |
| **Scope-Abhängigkeit** | Org-gebunden · Optional: `location_id` für Standort-Scope |
| **Tests** | `test/reportingService.test.js`, `test/managementFlowKpis.test.js` |

---

### KPI 2: Aktive Vendoren

| Feld | Wert |
|---|---|
| **Key** | `active_vendors_30d` |
| **Label** | Aktive Vendoren |
| **Fachliche Bedeutung** | Lieferanten mit echter Aktivität in den letzten 30 Tagen — zeigt wie aktiv das Vendor-Netzwerk ist |
| **Datenquelle** | Tabellen `vendor_pool_entries` + `assignments` + `timesheets` |
| **SQL-Kriterium** | Kandidateneinreichung, Assignment-Aktivität oder freigegebene Timesheets in 30-Tage-Fenster |
| **Zeitraum** | Letzte 30 Tage (`date_from` bis `date_to` = NOW) |
| **Berechnung** | `COUNT(DISTINCT supplier_org_id)` mit buyer-seitiger Aktivität |
| **Basis-Code** | `api/services/reportingService.js :: executiveMetrics()` → `queryActiveVendors()` |
| **Drilldown-Link** | `/public/vendor_pool.html?status_group=activity_30d[&location_id=...]` |
| **Tone-Logik** | risk: 0 · warn: 1–2 · ok: ≥ 3 |
| **Empty State** | `{ available: false, value: null }` wenn kein Vendor Pool; Tone = risk |
| **Scope-Abhängigkeit** | Org-gebunden · Optional: `location_id` |
| **Tests** | `test/reportingService.test.js` |

---

### KPI 3: Aktive Rate Cards

| Feld | Wert |
|---|---|
| **Key** | `active_rate_cards` |
| **Label** | Aktive Rate Cards |
| **Fachliche Bedeutung** | Gültige Konditionsrahmen im aktuellen Zeitfenster — zeigt ob Vergütungsstrukturen gepflegt sind |
| **Datenquelle** | Tabelle `rate_cards` |
| **SQL-Kriterium** | `status = 'active'` UND Gültigkeitszeitraum überlappt 30-Tage-Fenster |
| **Zeitraum** | 30-Tage-Fenster (aktuelles Fenster `date_from`–`date_to`) |
| **Berechnung** | `COUNT(*)` aktiver Rate Cards mit Überschneidung |
| **Basis-Code** | `api/services/reportingService.js :: executiveMetrics()` → `queryActiveRateCards()` |
| **Drilldown-Link** | `/public/rate-cards.html?status_group=window_overlap_30d&status=active&date_from=...&date_to=...` |
| **Tone-Logik** | risk: 0 · warn: 1–4 · ok: ≥ 5 |
| **Einschränkung** | Rate Cards sind Org-weit (kein Location-Filter) |
| **Empty State** | `{ available: false, value: null }` wenn kein Rate Card Access; Wert = 0 bei leer |
| **Tests** | `test/reportingService.test.js` |

---

### KPI 4: Spend 30 Tage

| Feld | Wert |
|---|---|
| **Key** | `spend_30d` |
| **Label** | Spend 30 Tage |
| **Fachliche Bedeutung** | Freigegebener Personalaufwand der letzten 30 Tage — direkter Steuerungsindikator für Personalkosten |
| **Datenquelle** | Tabellen `timesheets` (JOIN `assignments`) |
| **SQL-Kriterium** | `timesheets.status = 'approved'` + `approved_at` im 30-Tage-Fenster |
| **Zeitraum** | Letzte 30 Tage (gleitendes Fenster) |
| **Berechnung** | `SUM(total_hours * hourly_rate_cents)` → in Euro-Cents → Anzeige in Euro |
| **Basis-Code** | `api/services/reportingService.js :: executiveMetrics()` → `getSpendSummary()` |
| **Drilldown-Link** | `/public/spend-analytics.html?date_from=...&date_to=...[&location_id=...]` |
| **Tone-Logik** | neutral (kein Schwellwert — reine Information) |
| **Einheit** | Euro-Cents intern, Euro-Darstellung im Frontend |
| **Empty State** | `{ available: false, value_cents: null }` wenn kein Timesheet-Zugriff; 0 Cent wenn leer |
| **Scope-Abhängigkeit** | Org-gebunden · Optional: `location_id` |
| **Tests** | `test/spendAnalyticsService.test.js`, `test/reportingService.test.js` |

---

### KPI 5: Compliance Warnungen

| Feld | Wert |
|---|---|
| **Key** | `compliance_warnings` |
| **Label** | Compliance Warnungen |
| **Fachliche Bedeutung** | Aktuelle Dokumenten-Risiken — signalisiert regulatorischen Handlungsbedarf |
| **Datenquelle** | Tabellen `compliance_documents`, `rate_cards` |
| **SQL-Kriterium** | Abgelaufene, abgelehnte oder im 30-Tage-Risikoraum ablaufende Dokumente + Rate-Card-Verstöße |
| **Zeitraum** | Aktuell + Vorschau 30 Tage |
| **Berechnung** | `COUNT(*)` risikobehafteter Dokumente + Rate-Card-Warnungen und -Verstöße |
| **Basis-Code** | `api/services/reportingService.js :: queryComplianceWarningBreakdown()` |
| **Drilldown-Link** | `/public/compliance_overview.html?status_group=risk_window_30d` |
| **Tone-Logik** | ok: 0 · warn: 1–4 · risk: ≥ 5 |
| **Breakdown** | `{ total, expired, rejected, expiring_30d, rate_card_warnings, rate_card_breaches }` |
| **Empty State** | Wert = 0, Tone = ok, Breakdown alle 0 |
| **Scope-Abhängigkeit** | Org-gebunden (kein Location-Filter) |
| **Tests** | `test/reportingService.test.js` |

---

## Operative Workforce-KPIs

Quelle: `api/services/workforceService.js :: getWorkforceKpis()`

### KPI 6: Aktive Einsätze

| Feld | Wert |
|---|---|
| **Key** | `active_assignments` |
| **Label** | Aktive Einsätze |
| **Datenquelle** | Tabelle `assignments` |
| **SQL-Kriterium** | `status IN ('active', 'extended')` + Lifecycle-Prädikat (aktuelles Datum in Einsatz-Zeitraum) |
| **Zeitraum** | Stichtag: CURRENT_DATE |
| **Drilldown** | `/public/workforce.html?lifecycle_bucket=active` |
| **Empty State** | 0 — "Keine aktiven Einsätze" |

### KPI 7: Eingesetzte Mitarbeiter

| Feld | Wert |
|---|---|
| **Key** | `deployed_workers` |
| **Label** | Eingesetzte Mitarbeiter |
| **Datenquelle** | Tabelle `worker_assignment_links` + `assignments` |
| **SQL-Kriterium** | `wal.is_active = TRUE AND wal.worker_confirmation_status = 'worker_confirmed'` + aktiver Einsatz |
| **Zeitraum** | Stichtag: CURRENT_DATE |
| **Empty State** | 0 |

### KPI 8: Ablaufende Einsätze (14 Tage)

| Feld | Wert |
|---|---|
| **Key** | `expiring_in_14d` |
| **Label** | Ablaufende Einsätze |
| **Datenquelle** | Tabelle `assignments` |
| **SQL-Kriterium** | Aktiver Einsatz mit effektivem Enddatum zwischen CURRENT_DATE und CURRENT_DATE + 14 |
| **Zeitraum** | Nächste 14 Tage |
| **Drilldown** | Workforce-Seite gefiltert |
| **Bedeutung** | Frühwarnung für Verlängerungsbedarf |

### KPI 9–11: Timesheet-Status-Counts

| Key | Bedeutung | SQL-Kriterium |
|---|---|---|
| `submitted_timesheets` | Warten auf Genehmigung | `status = 'submitted'` |
| `draft_timesheets` | Angefangen, nicht eingereicht | `status = 'draft'` |
| `rejected_timesheets` | Abgelehnt, brauchen Korrektur | `status = 'rejected'` |

---

## Spend Analytics KPIs

Quelle: `api/services/spendAnalyticsService.js`

| KPI | Funktion | Beschreibung |
|---|---|---|
| Total Spend | `getSpendSummary()` | Gesamtaufwand im Zeitfenster |
| Spend by Vendor | `getSpendByVendor()` | Top-Vendoren nach Kostenbeitrag |
| Spend by Category | `getSpendByCategory()` | Aufwand nach Kategorien |
| Spend by Region | `getSpendByRegion()` | Geografische Verteilung |
| Spend over Time | `getSpendOverTime()` | Zeitreihe (täglich/wöchentlich/monatlich) |
| Rate Comparison | `getRateComparison()` | Marktpreisvergleich |
| Top Cost Drivers | `getTopCostDrivers()` | Treiber höchster Kosten |
| Spend Trends | `getSpendTrends()` | Trendanalyse |

**Empty State:** `{ available: false, data: null }` wenn kein Timesheet-Zugriff oder kein Spend

---

## Scope-Anzeige (Pflicht)

**Jede KPI-Response enthält ein `scope`-Objekt:**

```json
{
  "scope": {
    "org_id": "uuid",
    "org_name": "Muster GmbH",
    "location_id": null,
    "location_name": null,
    "date_from": "2026-04-26",
    "date_to": "2026-05-26",
    "window_days": 30
  }
}
```

**Frontend-Scope-Bar** (Pflicht auf jeder KPI-Seite):
```
Muster GmbH | Alle Standorte | 30 Tage | Stand: 2026-05-26
```
oder:
```
Muster GmbH | Berlin Nord | 30 Tage | Stand: 2026-05-26
```

Implementierung: `renderScopeBar(scope, generatedAt)` in `executiveDashboard.js`

---

## Drilldown-Integrität

**Regel:** Jeder Drilldown-Link muss `location_id` übergeben wenn Standortkontext aktiv ist.

```javascript
// Korrekt — locParam enthält location_id wenn vorhanden
const locParam = req.locationId ? { location_id: req.locationId } : {};
href: buildDrilldown('/public/vendor_pool.html', { status_group: 'activity_30d', ...locParam });

// Falsch — location_id vergessen → Drilldown zeigt org-weite Daten statt Standort
href: '/public/vendor_pool.html';
```

---

## Keine Phantomzahlen — Verbote

| Verbot | Begründung |
|---|---|
| Kein Mock-Wert in Production | KPI-Karte darf nur echte DB-Werte zeigen |
| Kein gemischter Zeitraum | Alle KPIs eines Dashboards nutzen dasselbe Zeitfenster |
| Kein `null` ohne Empty State | Bei `available: false` → Empty-State-Karte, kein Spinner-forever |
| Kein Fake-Spend | `spend_30d` nur aus `approved` Timesheets — kein `submitted` oder `draft` |
| Kein Backdating | Zeitfenster ist immer gleitend rückwärts, nie vorwärts |

---

## Tests für KPI-Berechnung

```bash
cd api
node --test test/managementFlowKpis.test.js test/workforceManagement.test.js test/spendAnalyticsService.test.js test/reportingService.test.js
# erwartet: 107 Tests, 0 Failures
```

Zusätzliche Abdeckung:
- `test/reportingDashboard.test.js` — Dashboard-Scope-Tests
- `test/spendAnalytics.route.test.js` — Route-Tests
- `test/reporting.route.test.js` — Route-Tests

---

*Letzte Aktualisierung: WAVE 08 — Phase 2 — 2026-05-26*
*Zuständig: Produkt + Backend (Claude), Freigabe: Owner*
