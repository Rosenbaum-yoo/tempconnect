# TempConnect – Executive Reporting

## Übersicht
`GET /api/reporting/dashboard` ist die kanonische Management-Aggregation für `frontend/public/executive_dashboard.html`. Das Dashboard soll keine Procurement-Pulse- oder Critical-Pressure-KPIs mehr im Browser aus mehreren Fachendpunkten zusammensetzen, sondern sich primär auf diesen Reporting-Vertrag stützen.

## Dashboard-Response
`GET /api/reporting/dashboard`

Die Response enthält die folgenden Hauptbereiche:

- `generated_at` – Erzeugungszeitpunkt der Aggregation
- `window` – Standardfenster für die Executive-Sicht, aktuell 30 Tage
- `requisitions` – Statuspipeline und Time-to-Fill/Approve-KPIs
- `procurement_pulse` – definierte Management-Kennzahlen inklusive Drilldown-Links, Semantik und Verfügbarkeitsstatus
- `critical_staffing_pressure` – serverseitig priorisierte Requisitions- und Notdienstfälle
- `compliance` – Dokumentenübersicht
- `sla` – SLA-Erfüllung für Requisitions
- `platform` – Plattformweite Überblickszahlen
- `spend` – Spend-Übersicht auf Basis des Spend-Analytics-Service
- `finance` – Commercial Truth aus Subscription-, Invoice-, Payment-, Billable- und Reconciliation-Sicht
- `retention` – kanonische SaaS-Retention/Churn/Usage-Truth (Cohorts, Segmentierung, At-Risk-Drilldown)
- `pilot_conversion` – kanonische Pilot-/Lead-/Conversion-Wahrheit für Management, Sales und GTM-Learnings

## Spend
Die Executive-Spend-Sicht trennt bewusst zwischen bereits realisiertem Spend und der operativen Vorwärtsprojektion.

Wesentliche Kennzahlen im Abschnitt `spend`:

- `total_spend_cents`
  - Bedeutung: freigegebener Ist-Spend aus approved Timesheets im aktuellen 30-Tage-Fenster
- `projected_spend_cents`
  - Bedeutung: Vorwärtsprojektion auf Basis aktiver Assignments und verbleibender Wochen bis `planned_end_date`
  - Fallback: 90 Tage, wenn kein `planned_end_date` gesetzt ist
- `active_assignments`
  - Bedeutung: aktive Assignments, die in die Spend-Projektion eingehen
- `assignment_count`
  - Bedeutung: Assignments mit freigegebenen Timesheets im aktuellen 30-Tage-Fenster
- `vendor_count`
  - Bedeutung: Distinct Supplier mit freigegebenem Spend im aktuellen 30-Tage-Fenster
  - Drilldown: Spend-Analyse im aktuellen Dashboard-Zeitfenster
- `avg_rate_cents`
  - Bedeutung: durchschnittlicher Ist-Stundensatz der Spend-Basis im aktuellen Fenster
- `overtime_spend_cents`
  - Bedeutung: Überstundenanteil des freigegebenen Spend
- `over_rate_spend_cents`
  - Bedeutung: Spend-Anteil oberhalb aktiver Rate-Card-Targets
- `over_rate_count`
  - Bedeutung: Anzahl betroffener Assignments oberhalb des Rate-Card-Targets
- `total_hours`
  - Bedeutung: freigegebene Stunden im aktuellen 30-Tage-Fenster

## Finance Truth
Der Abschnitt `finance` liefert kommerzielle Wahrheit ohne KPI-Schönrechnung aus einer kanonischen Quelle (`revenueMetricsService.getRevenueMetrics`).

Wesentliche Blöcke:

- `subscription_truth`
  - `contractually_active_mrr` (anerkannt, EUR)
  - `catalog_mrr_theoretical` (Katalog-Referenz, EUR)
  - `pending_quote_subscribers` (ohne anerkannten Preis)
- `invoice_truth`
  - Lifecycle-Zählungen (`draft`, `issued`, `overdue`, `paid`, `void`)
  - `invoiced_revenue_cents`, `paid_revenue_cents`, `open_receivables_cents`, `overdue_receivables_cents`
- `payment_truth`
  - Session-basierte Cash-Proxy-Sicht (`completed`, `pending`, `failed`, `expired`)
- `billable_truth`
  - approved, noch nicht fakturierte Leistung (`invoice_id IS NULL`) inkl. Bewertungsbetrag
- `reconciliation_30d`
  - approved Spend vs. operational invoiced Revenue inkl. Gap und Coverage

Zusätzlich enthält `pricing_state_breakdown` die Verteilung nach Preisquelle (`catalog_price`, `contract_price`, `pilot_price`, `custom_quote_pending`).
Zusätzlich enthält `finance.pilot_conversion_truth` dieselbe Pilot-/Conversion-Wahrheit wie der Top-Level-Block `pilot_conversion`, damit Executive- und Revenue-Konsole denselben Vertrag nutzen.

## SaaS Retention / Churn / Usage Truth
Der Abschnitt `retention` liefert eine definierte Bestandskunden-Wahrheit aus kommerzieller und produktiver Nutzungssicht.

Quellen:

- `subscriptions` + `organizations` für kommerzielle Zustände und MRR-Baseline
- `product_analytics_events` für wertstiftende Nutzung und Cohort-Aktivität

Zeitlogik:

- rollierendes aktuelles und vorheriges Fenster (Standard: je 30 Tage)
- `window.current_from/current_to` und `window.previous_from/previous_to` werden im Payload zurückgegeben

Kernkennzahlen (im Block `headline`):

- `active_paid_orgs`
- `active_customer_orgs`
- `previous_active_customer_orgs`
- `retained_logos` + `retained_logo_rate_pct`
- `logo_churned_orgs` + `logo_churn_rate_pct`
- `gross_revenue_churn_mrr` + `gross_revenue_churn_rate_pct`
- `net_revenue_retention_pct`
- `expansion_mrr`, `contraction_mrr`
- `inactive_but_paying_orgs`
- `pqa_orgs`
- `pilot_retained_orgs`, `pilot_converted_orgs_30d`

Nutzungsintensität:

- `usage_intensity.high|medium|low|dormant`
- `avg_value_events_per_active_org`
- `median_value_events_per_active_org`

Drilldowns:

- `segment_drilldown.by_plan|by_icp|by_stage`
- `org_drilldown.at_risk|churned|expanded|pqa`

Definitionsqualität:

- `definitions` dokumentiert je Kennzahl `meaning`, `source`, `window`, `formula`, `drilldown_dimensions`
- `quality_flags.usage_source_available=false` kennzeichnet eingeschränkte usage-basierte Kennzahlen (kein stilles KPI-Faking)

## Pilot / Conversion Truth
Der Abschnitt `pilot_conversion` stellt keine Fantasie-Funnel bereit, sondern eine deterministische Ableitung aus bestehenden Organisations-, Commercial-, Strategic-Lead- und Product-Analytics-Signalen.

Quellen:

- `organizations` für `pilot_status`, `has_used_pilot`, `pilot_started_at`, `pilot_ended_at`, `converted_at`, `billing_mode`, `customer_stage`, Preisfelder und Größen-/ICP-Signale
- `subscriptions` für aktuellen Live-/Pricing-Kontext
- `strategic_collaboration_requests` für belastbare Pre-Registration-Leads und Qualifizierung
- `product_analytics_events` für Aktivierung, Kernfluss und belastbare Nutzung
- `user_onboarding_progress` für Onboarding-/Aktivierungsbremsen

Kanonische Stufen:

- `lead`
- `qualified`
- `registered`
- `pilot_started`
- `pilot_activated`
- `first_core_flow_executed`
- `pilot_successful_usage`
- `commercial_pricing_clarified`
- `paid_live`
- `lost_aborted`

Zentrale Regeln:

- Aktivierung ist kein Login und keine Account-Erstellung, sondern das erste Core-Value-Event nach Pilotstart.
- `pilot_successful_usage` wird erst erreicht, wenn seit Pilotstart mindestens fünf Core-Value-Events vorliegen und zusätzlich mindestens zwei aktive Tage, zwei Nutzer oder zwei Produktbereiche erreicht wurden.
- `commercial_pricing_clarified` zeigt, dass Pricing/Contract nicht mehr offen ist; fehlende historische Pricing-Timestamps werden transparent als abgeleitet markiert.
- Transition-Metriken zählen jede Organisation pro Stufe höchstens einmal.

Wichtige Blöcke:

- `headline`
  - aktive, aktivierte, konvertierte und gefährdete Piloten
  - durchschnittliche Zeit bis Aktivierung / Conversion
- `transitions`
  - `lead_to_registered`
  - `registration_to_pilot_started`
  - `pilot_started_to_activated`
  - `activated_to_paid_live`
  - `pilot_to_lost`
- `current_stage_distribution`
  - zeigt, wo Organisationen aktuell hängen und wie lange
- `gtm_learning`
  - `by_icp`
  - `by_tariff_path`
  - `onboarding_bottlenecks`
  - `product_area_usage`
  - `funnel_dropoff`
- `org_drilldown`
  - aktive, aktivierte, konvertierte, gefährdete und verlorene Pilot-Organisationen

Qualitätsflags:

- `pre_registration_lead_capture_available=false` bedeutet: Pre-Registration-Lead-Capture ist nicht flächendeckend vorhanden; die Lead-Stage fallbackt dann ehrlich auf `registered_at`.
- `pricing_clarity_timestamps_partially_inferred=true` bedeutet: Pricing-Klarheit verwendet teilweise Pilotstart oder Subscription-Erstellung als historischen Zeitanker.

### Export für Audit / Due Diligence
`GET /api/reporting/finance-truth/export` exportiert die Finance-Truth-Sicht als auditable Snapshot.

- Standard: `format=csv`
- Alternativ: `format=json`
- CSV-Spalten: `generated_at`, `org_id`, `section`, `metric_key`, `metric_value`, `unit`, `available`, `source`
- Quelle ist pro Zeile ausgewiesen (`source = revenueMetricsService.getRevenueMetrics`)
- Frontend-Verdrahtung: In `frontend/public/executive_dashboard.html` stehen im Abschnitt **Finance Truth** zwei Aktionen bereit (`Export CSV`, `Export JSON`), die direkt diesen Endpunkt aufrufen und den Snapshot clientseitig als Datei speichern.
- Zusätzliche Detailflächen mit derselben Exportquelle:
  - `frontend/public/admin_panel.html` (Revenue-Tab)
  - `frontend/public/organization.html` (Usage-Tab)
  - `frontend/public/spend-analytics.html`

## Requisitions
Die Executive-Requisition-KPIs bilden die operative Statuspipeline ab; Drilldowns müssen deshalb denselben Statusraum treffen wie die aggregierte Kennzahl.

Wesentliche Kennzahlen im Abschnitt `requisitions`:

- `open`
  - Bedeutung: Requisitions im Status `OPEN`
- `in_review`
  - Bedeutung: Requisitions im Status `IN_REVIEW`
- `shortlisted`
  - Bedeutung: Requisitions im Status `SHORTLISTED`
- `filled`
  - Bedeutung: Requisitions im Status `FILLED`
- `cancelled`
  - Bedeutung: Requisitions im Status `CANCELLED`
- `urgent_open`
  - Bedeutung: dringliche Requisitions im operativen Bearbeitungsraum `OPEN` oder `IN_REVIEW`
  - Drilldown: `/public/requisitions.html?status_group=urgent_open&urgency=urgent`
- `avg_time_to_fill_hours`
  - Bedeutung: durchschnittliche Zeit von Erstellung bis `FILLED` in Stunden

## Procurement Pulse
Der Procurement Pulse liefert keine dekorativen Snapshot-Zahlen mehr, sondern fachlich benannte Kennzahlen mit definierten Quellen.

Jede Kennzahl liefert mindestens:

- `key`
- `label`
- `value` oder `value_cents`
- `available`
- `tone`
- `href`
- `description`
- `basis`
- optional `breakdown`

Die aktuellen Metriken sind:

- `open_requisitions`
  - Bedeutung: aktueller Beschaffungs-Backlog
  - Quelle: `requisitions`
  - Enthaltene Status: `OPEN`, `IN_REVIEW`, `SHORTLISTED`, `APPROVED`, `PENDING_APPROVAL`
- `active_vendors_30d`
  - Bedeutung: aktive Pool-Vendoren mit echter buyer-seitiger Aktivität in den letzten 30 Tagen
  - Quelle: Distinct `supplier_org_id` aus aktiven `vendor_pool`-Einträgen mit Kandidateneinreichung oder Assignment-/Timesheet-Aktivität im Zeitfenster
  - Drilldown: `/public/vendor_pool.html?status_group=activity_30d`
- `active_rate_cards`
  - Bedeutung: Rate Cards mit aktivem Status, deren Gültigkeit das aktuelle 30-Tage-Fenster überlappt
  - Quelle: `rate_cards`
  - Drilldown: `/public/rate-cards.html?status_group=window_overlap_30d&status=active&date_from=<window.date_from>&date_to=<window.date_to>`
- `spend_30d`
  - Bedeutung: freigegebener Spend aus Timesheets im laufenden 30-Tage-Fenster
  - Quelle: `spendAnalyticsService.getSpendSummary`
- `compliance_warnings`
  - Bedeutung: operative Risiken für das kommende 30-Tage-Fenster
  - Quelle: `compliance_documents` plus `rate_card_checks`
  - Breakdown: abgelehnte, abgelaufene oder bald ablaufende Dokumente sowie Rate-Card-Warnungen und Verstöße
  - Drilldown: `/public/compliance_overview.html?status_group=risk_window_30d`
  - Landing-Context: Die Drilldown-Seite zeigt im Dokumentbereich nur die aktuelle Risikomenge des Fensters, nicht die globale Dokumentstatistik des Mandanten

## Kritischer Besetzungsdruck
`critical_staffing_pressure` priorisiert serverseitig die Fälle, die Management-Aufmerksamkeit brauchen. Die Liste kombiniert:

- Requisitions in `PENDING_APPROVAL`, `APPROVED`, `OPEN`, `IN_REVIEW`, `SHORTLISTED`
- aktive Emergency-/Notdienst-Demands

Der `pressure_score` wird aus operativen Faktoren gebildet:

- Dringlichkeit
- Alter des Vorgangs
- Startnähe
- offener Headcount
- Kandidaten- und Shortlist-Abdeckung
- Supplier-Abdeckung
- SLA-Status bzw. SLA-Überfälligkeit
- bei Emergency-Fällen zusätzlich Zusagen und Supplier-Reaktionen

Bei Emergency-/Notdienstfällen wird das Alter zusätzlich gegen das urgency-spezifische Reaktionsfenster gewichtet, damit SLA-überfällige Sofortbedarfe in der Priorisierung vor chronischen, aber weniger zeitkritischen Requisitions sichtbar bleiben.

Der Abschnitt liefert neben `items` auch verdichtete Management-Signale:

- `total`
  - Bedeutung: Anzahl aktuell priorisierter Fälle im Payload
- `summary.risk`
  - Bedeutung: Fälle mit `tone = risk`
- `summary.warn`
  - Bedeutung: Fälle mit `tone = warn`
- `summary.emergency_open`
  - Bedeutung: priorisierte Emergency-/Notdienstfälle

Priorisierungsregeln:

- Nur Fälle mit `pressure_score >= 55` werden in `items` aufgenommen.
- `items` ist auf maximal 8 Fälle begrenzt.
- Sortierung: zuerst `pressure_score` absteigend, bei Gleichstand `open_headcount` absteigend.

Jeder Eintrag liefert zusätzlich:

- `kind`
- `id`
- `title`
- `role`
- `status`
- `urgency`
- `open_headcount`
- `pressure_score`
- `tone`
- `reasons`
- `href`
- `candidate_count`, `shortlisted_count`, `accepted_count`, `supplier_count` für Requisitions
- `committed_count`, `response_count`, `sla_overdue` für Emergency-/Notdienstfälle

## Fail-soft-Verhalten
Das Dashboard soll bei Teilproblemen professionell bleiben:

- Section-Queries degradieren auf Default-Strukturen statt unnötig die gesamte Dashboard-Route scheitern zu lassen.
- `spend.available = false` signalisiert technische Nichtverfügbarkeit.
- `spend.has_data = false` bedeutet gültig geladen, aber kein Spend im Zeitfenster.
- Procurement-Pulse-Metriken können einzeln `available = false` zurückgeben.
- `critical_staffing_pressure.available = false` kennzeichnet einen echten Aggregationsfehler; eine leere `items`-Liste bedeutet dagegen „kein akuter Druck“.

## Weitere Reporting-Endpunkte
- `GET /api/reporting/requisitions`
- `GET /api/reporting/requisitions/timeline?days=30`
- `GET /api/reporting/vendors`
- `GET /api/reporting/compliance`
- `GET /api/reporting/sla?days=30`
- `GET /api/reporting/top-roles?limit=10`
- `GET /api/reporting/finance-truth/export?format=csv|json`
