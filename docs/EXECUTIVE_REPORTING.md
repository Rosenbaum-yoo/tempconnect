# TempConnect – Executive Reporting

## Übersicht
Das Reporting-Modul liefert KPIs und Dashboards für Management-Entscheidungen. Alle Endpunkte unterstützen optionale `org_id`-Filterung.

## API-Endpunkte

### GET /api/reporting/dashboard
Kombiniertes Executive Dashboard mit allen KPI-Kategorien.
**Response**: `{ requisitions, compliance, sla, platform }`

### GET /api/reporting/requisitions
Requisition-Status-KPIs: total, open, in_review, shortlisted, filled, closed, cancelled, urgent_open, avg_time_to_fill_hours, avg_time_to_approve_hours.

### GET /api/reporting/requisitions/timeline?days=30
Requisitions pro Tag (created, filled, cancelled) für Chart-Visualisierung.

### GET /api/reporting/vendors?client_org_id=...
Vendor Performance: total_candidates, shortlisted, accepted, rejected, avg_match_score pro Supplier.

### GET /api/reporting/compliance?org_id=...
Compliance-Zusammenfassung: total_documents, verified, pending, rejected, expired, expiring_soon.

### GET /api/reporting/sla?days=30
SLA-Report: sla_met, sla_breached, sla_running, sla_compliance_pct.

### GET /api/reporting/top-roles?limit=10
Meistgesuchte Rollen mit Besetzungsquote.

## KPI-Definitionen
| KPI | Berechnung |
|-----|------------|
| Time-to-Fill | AVG(filled_at - created_at) in Stunden |
| Time-to-Approve | AVG(approved_at - created_at) in Stunden |
| SLA Compliance % | 100 × MET / (MET + BREACHED) |
| Fill Rate | FILLED / (FILLED + CANCELLED + CLOSED) |

## Frontend
`frontend/public/executive_dashboard.html` – Dark-Theme Dashboard mit:
- KPI-Kacheln (8 Metriken)
- Balkendiagramm (Requisitions nach Status)
- SLA-Compliance-Kacheln
- Compliance-Fortschrittsbalken mit Legende
- Plattform-Statistik
