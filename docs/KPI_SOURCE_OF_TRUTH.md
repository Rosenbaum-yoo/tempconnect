# KPI_SOURCE_OF_TRUTH — KPI-Definitionen und Datenquellen
> Erstellt: 2026-05-24 | WAVE_05 vollstaendig | Letzte Aktualisierung: 2026-05-28
> Regel: Jede angezeigte Kennzahl braucht Quelle, Definition, Zeitraum, Berechnungslogik, Drilldown.
> Keine Deko-KPIs. Kein "ist halt schoen".

---

## Prinzip

Jeder KPI-Block im System muss beantworten:
1. **Was** zeigt die Zahl? (Definition)
2. **Woher** kommt sie? (API-Route, Service, SQL-Tabelle)
3. **Wann** ist der Datenstand? (Zeitraum, `generatedAt`)
4. **Wie** wird sie berechnet? (Formel, Aggregation)
5. **Wohin** kann man drohen? (Drilldown-Link)
6. **Fuer wen** ist sie relevant? (Rolle, Plan)

---

## 1. Executive Dashboard (`frontend/public/executive_dashboard.html`)

**API-Route:** `GET /api/reporting/dashboard`
**Service:** `api/services/reportingService.js → executiveDashboard()`
**Zugriff:** `requireAuth` + `rperm("report.executive")` + `companyOrg`
**Plan-Gate:** ab PRO/INDIVIDUELL (`executive_dashboard` surface_access)
**Zeitfenster:** konstant 30 Tage rueckwirkend (`EXECUTIVE_WINDOW_DAYS = 30`)
**Scope-Felder:** `scope.org_id`, `scope.location_id`, `scope.date_from`, `scope.date_to`, `scope.window_days`
**generated_at:** ISO-8601 Timestamp in Response

### 1a. Requisition-KPIs (`requisitions.*`)

**Quelle:** `requisitionKpis(pool, orgId, locationId)` → `SELECT COUNT ... FROM requisitions`
**Scope:** Optional org-gefiltert (`r.org_id = $1`), optional location-gefiltert (`r.location_id = $2::uuid`)

| Feld | Definition | SQL-Aggregation |
|---|---|---|
| `total` | Alle Requisitions der Org | `COUNT(*)` |
| `open` | Status = OPEN | `FILTER (WHERE r.status = 'OPEN')` |
| `approved` | Status = APPROVED (freigegeben, noch nicht OPEN) | `FILTER (WHERE r.status = 'APPROVED')` |
| `in_review` | Status = IN_REVIEW (aktive Kandidatenpruefung) | `FILTER (WHERE r.status = 'IN_REVIEW')` |
| `shortlisted` | Status = SHORTLISTED (Favoriten benannt) | `FILTER (WHERE r.status = 'SHORTLISTED')` |
| `partially_filled` | Status = PARTIALLY_FILLED (teilvermittelt) | `FILTER (WHERE r.status = 'PARTIALLY_FILLED')` — Migration 113 |
| `filled` | Status = FILLED (vollstaendig besetzt) | `FILTER (WHERE r.status = 'FILLED')` |
| `closed` | Status = CLOSED (abgeschlossen) | `FILTER (WHERE r.status = 'CLOSED')` |
| `cancelled` | Status = CANCELLED | `FILTER (WHERE r.status = 'CANCELLED')` |
| `draft` | Status = DRAFT (interne Entwuerfe) | `FILTER (WHERE r.status = 'DRAFT')` |
| `pending_approval` | Status = PENDING_APPROVAL | `FILTER (WHERE r.status = 'PENDING_APPROVAL')` |
| `urgent_open` | Offene/In-Review-Requisitions mit Dringlichkeit 'urgent' | `FILTER (WHERE r.urgency = 'urgent' AND r.status IN ('OPEN','IN_REVIEW'))` |
| `avg_time_to_fill_hours` | Durchschnittliche Besetzungszeit in Stunden | `AVG(EXTRACT(EPOCH FROM (r.filled_at - r.created_at)) / 3600)` |
| `avg_time_to_approve_hours` | Durchschnittliche Genehmigungszeit in Stunden | `AVG(EXTRACT(EPOCH FROM (r.approved_at - r.created_at)) / 3600)` |

**Drilldown:** `/public/requisitions.html` (alle), `?status=OPEN` (offene)
**Null-Zustand:** Alle Felder = 0, avg-Felder = null (keine Division durch 0 moeglich)

### 1b. Compliance-Uebersicht (`compliance.*`)

**Quelle:** `complianceSummary(pool, orgId)` → `SELECT COUNT ... FROM compliance_documents`
**Scope:** Optional org-gefiltert

| Feld | Definition |
|---|---|
| `total_documents` | Alle Compliance-Dokumente |
| `verified` | Status = 'verified' |
| `pending` | Status = 'pending' (in Pruefung) |
| `rejected` | Status = 'rejected' (abgelehnt) |
| `expired` | Status = 'expired' (abgelaufen) |
| `expiring_soon` | Status = 'verified' UND `valid_until <= NOW() + 30 days` |

**Drilldown:** `/public/compliance_overview.html`
**Null-Zustand:** Alle = 0

### 1c. SLA-Report (`sla.*`)

**Quelle:** `slaReport(pool, orgId, 30, locationId)` → `SELECT COUNT ... FROM requisitions WHERE sla_minutes IS NOT NULL`
**Zeitraum:** Letzte 30 Tage (`created_at >= NOW() - 30 days`)
**Scope:** Optional org- und location-gefiltert

| Feld | Definition |
|---|---|
| `total_with_sla` | Requisitions mit definiertem SLA-Ziel |
| `sla_met` | `sla_status = 'MET'` |
| `sla_breached` | `sla_status = 'BREACHED'` |
| `sla_running` | `sla_status = 'RUNNING'` (noch laufend) |
| `sla_compliance_pct` | `100 * sla_met / (sla_met + sla_breached)` — null bei 0 abgeschlossenen |

**Drilldown:** `/public/requisitions.html?sla=breached`
**Null-Zustand:** Alle = 0, Prozent = null

### 1d. Plattform-Statistik (`platform.*`)

**Quelle:** `getPlatformStats(pool)` — plattformweite Aggregation (kein Org-Scope)
**Zeitraum:** Aktueller Zustand (kein Zeitfenster)

| Feld | Definition | Quelle-Tabelle |
|---|---|---|
| `total_users` | Aktive User-Accounts | `users WHERE is_active = TRUE` |
| `total_orgs` | Aktive Organisationen | `organizations WHERE is_active = TRUE` |
| `active_capacity_posts` | Aktive Kapazitaetsangebote | `capacity_posts WHERE is_active = TRUE` |
| `open_demands` | Offene Bedarfsanfragen (legacy) | `demand_requests WHERE status = 'open'` |
| `active_vendor_entries` | Aktive Vendor-Pool-Eintraege (gesamt) | `vendor_pool WHERE status = 'active'` |

**Drilldown:** `/public/admin_panel.html` (Plattform-Admin)
**Hinweis:** Diese KPIs sind plattformweit, nicht org-spezifisch.

### 1e. Spend-Uebersicht (`spend.*`)

**Quelle:** `getExecutiveSpendSummary()` → `spendAnalyticsService.getSpendSummary()`
**Zeitraum:** 30-Tage-Fenster (`date_from` bis `date_to`)
**Scope:** org-gefiltert + optional location-gefiltert
**Verfuegbarkeit:** `available: false` wenn kein orgId oder DB-Fehler

| Feld | Definition |
|---|---|
| `has_data` | Hat die Org im Fenster messbare Spend-Daten? |
| `total_spend_cents` | Gesamtausgaben (approved Timesheets * rate) in Cent |
| `overtime_spend_cents` | Ausgaben fuer Ueberstunden |
| `projected_spend_cents` | Hochrechnung fuer den Rest des Zeitfensters |
| `over_rate_spend_cents` | Ausgaben oberhalb vereinbarter Rate Cards |
| `over_rate_count` | Anzahl Rate-Verletzungen |
| `assignment_count` | Anzahl Einsaetze im Fenster |
| `active_assignments` | Aktuell laufende Einsaetze |
| `vendor_count` | Anzahl beitragender Lieferanten |
| `avg_rate_cents` | Durchschnittlicher Stundensatz (Cent) |
| `timesheet_count` | Eingereichte Timesheets |
| `total_hours` | Genehmigte Arbeitsstunden gesamt |

**Drilldown:** `/public/spend-analytics.html`
**Null-Zustand:** `available: false, has_data: false`, alle Zahlen = 0

### 1f. Aktive Vendoren 30d (`procurement_pulse.metrics.active_vendors_30d`)

**Quelle:** `queryActiveVendors30d(pool, orgId, window, locationId)`
**Definition:** Lieferanten mit `status='active'` im Vendor Pool, die im 30-Tage-Fenster
  ENTWEDER Kandidaten eingereicht ODER Einsaetze betrieben haben (approved Timesheet).

**SQL-Kern:**
```sql
COUNT(DISTINCT vp.supplier_org_id) FROM vendor_pool vp
WHERE vp.status = 'active'
  AND EXISTS (
    SELECT 1 FROM requisition_candidates rc ... AND rc.created_at >= window.from
    UNION
    SELECT 1 FROM assignments a ... AND (a.created_at >= window.from OR approved_timesheet)
  )
```
**Drilldown:** `/public/vendor_pool.html`

### 1g. Aktive Rate Cards (`procurement_pulse.metrics.active_rate_cards`)

**Quelle:** `queryActiveRateCardsInWindow(pool, orgId, window)`
**Definition:** Rate Cards mit `status='active'`, deren Gueltigkeit (`valid_from` bis `valid_to`) das 30-Tage-Fenster schneidet.

**SQL-Kern:**
```sql
COUNT(*) FROM rate_cards
WHERE status = 'active'
  AND valid_from <= window.date_to
  AND COALESCE(valid_to, window.date_to) >= window.date_from
```
**Drilldown:** `/public/rate-cards.html`

### 1h. Compliance-Warnungen (`procurement_pulse.metrics.compliance_warnings`)

**Quelle:** `queryComplianceWarningBreakdown(pool, orgId)` — zwei separate Queries mit try/catch

| Sub-Feld | Definition |
|---|---|
| `rejected_documents` | Compliance-Dokumente mit Status 'rejected' |
| `expired_documents` | Compliance-Dokumente mit Status 'expired' |
| `expiring_documents` | Verified-Dokumente, `valid_until` in den naechsten 30 Tagen |
| `rate_card_warnings` | Rate Card Checks mit `compliance_status='warning'` (letzte 30 Tage) |
| `rate_card_breaches` | Rate Card Checks mit `compliance_status='non_compliant'` (letzte 30 Tage) |
| `total` | Summe aller obigen Felder |

**Drilldown:** `/public/compliance_overview.html`
**Null-Zustand:** Alle = 0, `available: false` wenn beide DB-Queries scheitern

### 1i. Kritischer Besetzungsdruck (`critical_staffing_pressure.*`)

**Quelle:** `getCriticalStaffingPressure(pool, orgId, window, locationId)`
**Definition:** Dringende offene Requisitions mit Einsatz-Startdatum in den naechsten 14 Tagen
  oder SLA-Risiko. Wird als geordnete Liste mit CTA gerendert.

**Drilldown:** `/public/requisitions.html?status_group=backlog`

### 1j. Finance Truth (`finance.*`)

**Quelle:** `getExecutiveFinanceTruth(pool, orgId)` → `revenueMetricsService.getRevenueMetrics()`
**Scope:** org-gefiltert (nur eigene Abo-/Invoice-Daten)
**Plan-Gate:** Revenue-Metriken nur fuer eigene Org sichtbar

| Sub-Gruppe | Inhalt |
|---|---|
| `subscription_truth` | MRR (theoretisch vs. vertraglich), fehlende Katalogpreise |
| `invoice_truth` | Invoice-Counts nach Status, offene Forderungen |
| `payment_truth` | Payment-Counts (completed/pending/failed/expired) |
| `billable_truth` | Nicht-fakturierte, approved Timesheets (Gap: Leistung → Rechnung) |
| `reconciliation_30d` | Spend vs. invoicierter Betrag (Coverage-Ratio) |

**Drilldown:** `/public/admin_panel.html?tab=revenue`

---

## 2. Spend Analytics (`frontend/public/spend-analytics.html`)

**API-Route:** `GET /api/spend-analytics/summary` + `/by-vendor` + `/by-category` + `/by-region` + `/over-time`
**Service:** `api/services/spendAnalyticsService.js`
**Zugriff:** `requireAuth` + Feature-Gate (`spend_analytics`) + `rperm("report.executive")` + `companyOrg`
**Scope:** `scope: { org_id, location_id, date_from, date_to }` + `generated_at` in Summary-Response seit E-02 (2026-05-28)
**Scope-Bar:** `renderScopeBar()` in `spend-analytics.html` — zeigt Org | Standort | Zeitraum | Datenstand

| KPI | Definition | Quelle | Drilldown |
|---|---|---|---|
| Gesamtausgaben | Sum(invoiced amounts in window) | `operational_invoices` | — |
| Ausgaben je Kategorie | Aufschluesselung nach listing_type | `operational_invoices` | — |
| Lieferantenanteil | Ausgaben je Lieferant | `operational_invoices + organizations` | `/public/supplier_scorecard.html` |
| Stundenvolumen | Sum(hours) aller approved Timesheets | `timesheets WHERE status='approved'` | `/public/timesheets.html` |

**Bekannte Luecke:** Quarterly-Granularitaet (`DATE_TRUNC('quarter')`) fehlt im Service (P3).

---

## 3. Operator-KPIs (Staff Control Center — `staff.tempconnect.de`)

**API-Route:** `GET /staff/api/*`
**Scope:** Plattform-weit (kein Org-Scope)
**Zugriff:** Nur STAFF_USER_IDS

| KPI | Definition | Tabelle | Status |
|---|---|---|---|
| Offene Subscription-Requests | status IN ('submitted','under_review','offered') | `subscription_requests` | Live |
| Offene Enterprise-Anfragen | status='pending' | `strategic_collaboration_requests` | Live |
| Audit-Events (24h) | created_at > NOW() - 24h | `audit_log` | Live |
| Plattform-User aktiv | is_active = TRUE | `users` | Live |

---

## 4. Procurement Pulse — vollstaendige Tile-Liste

**Quelle:** `getProcurementPulse(pool, orgId, window, requisitions, spend, locationId)`
**Zeitraum:** 30 Tage

| Tile-Key | Definition | Drilldown |
|---|---|---|
| `open_requisitions` | Offene + In-Review Requisitions | `/public/requisitions.html?status=OPEN` |
| `active_vendors_30d` | Aktive Lieferanten mit Aktivitaet im Fenster | `/public/vendor_pool.html` |
| `active_rate_cards` | Gueltige Rate Cards im Fenster | `/public/rate-cards.html` |
| `compliance_warnings` | Summe aller Compliance-Warnungen | `/public/compliance_overview.html` |
| `spend_30d_eur` | Gesamtausgaben 30 Tage (EUR aus Cent) | `/public/spend-analytics.html` |
| `urgent_backlog` | Dringende offene Bedarfe | `/public/requisitions.html?urgency=urgent` |
| `avg_fill_time_h` | Ø Besetzungszeit (Stunden) | `/public/requisitions.html` |
| `sla_compliance_pct` | SLA-Erfuellungsquote (0-100) | `/public/requisitions.html?sla=breached` |

---

## 5. Null-Zustand-Garantien (Demo-Readiness)

Alle KPI-Funktionen sind explizit demo-sicher implementiert:

| Funktion | Null-Garantie |
|---|---|
| `requisitionKpis()` | Alle Felder = 0 wenn keine Rows |
| `complianceSummary()` | Alle Felder = 0 wenn keine Rows |
| `slaReport()` | Alle = 0, Prozent = null |
| `getPlatformStats()` | Alle = 0 |
| `getExecutiveSpendSummary()` | `available: false` wenn kein orgId |
| `executiveDashboard()` | `Promise.allSettled` — Einzel-Fehler blockieren nicht |
| `queryComplianceWarningBreakdown()` | Zwei separate try/catch — partiell verfuegbar |
| `getCriticalStaffingPressure()` | `items: [], available: false` bei Fehler |

---

## 6. Regeln fuer neue KPIs

Bevor ein neuer KPI eingebaut wird, muss gelten:

- [ ] Datenquelle existiert (echte DB-Tabelle oder aggregierter View)
- [ ] Zeitraum ist definiert (nicht "irgendwie")
- [ ] Berechnungslogik ist dokumentiert (hier in dieser Datei)
- [ ] Drilldown-Link fuehrt zu tatsaechlich existierender Seite
- [ ] Rolle + Plan-Gate geklaert (wer sieht diesen KPI?)
- [ ] `scope`-Block in API-Response vorhanden
- [ ] `generated_at` in Response vorhanden
- [ ] Null-Zustand implementiert (kein 500, kein Spinner-Stuck bei 0 Daten)

**Verstoesse gegen diese Regeln sind Fake-Data und werden nicht gemergt.**

---

## 7. Offene Punkte (P2/P3)

| # | Bereich | Luecke | Prioritaet |
|---|---|---|---|
| 1 | Spend Analytics | Quarterly-Granularitaet (`DATE_TRUNC('quarter')`) fehlt | P3 |
| 2 | Spend Analytics | Scope-Bar (active_location_id Anzeige) | ✅ ERLEDIGT 2026-05-28 (E-02) |
| 3 | Executive Dashboard | `PARTIALLY_FILLED` in Requisition-KPIs (Migration 113) | ✅ ERLEDIGT |
| 4 | Retention Truth | `retention_truth` sub-keys noch nicht in Tabelle dokumentiert | P2 |
| 5 | Platform Stats | `open_demands` koppelt an `demand_requests` (legacy-Tabelle) — verifizieren ob noch verwendet | P2 |
