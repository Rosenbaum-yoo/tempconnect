# Spend Analytics Dashboard

> VMS-Procurement-Modul für Buyer-seitige Kostenanalyse und Spend-Steuerung.

## Kennzahlen-Definitionen

| Kennzahl | Formel | Quelle |
|----------|--------|--------|
| **Actual Spend** | `SUM(timesheets.total_hours × assignments.hourly_rate_cents)` | Approved Timesheets |
| **Overtime Spend** | `SUM(timesheets.overtime_hours × rate × 1.25)` | 25 % Standard-Zuschlag |
| **Projected Spend** | `rate × 40h/Woche × verbleibende Wochen` | Aktive Assignments |
| **Over-Rate Spend** | `SUM(Delta wo Ist > Rate-Card-Target)` | Rate Cards (graceful) |
| **Avg Rate** | `AVG(assignments.hourly_rate_cents)` | Alle Assignments im Filter |

Alle Beträge in **Cent (EUR)**, UI-Darstellung in EUR.

## Spend-Berechnungslogik

### Actual Spend
```sql
SUM(t.total_hours * a.hourly_rate_cents)
WHERE t.status = 'approved'
```
Nur abgerechnete (approved) Timesheets fließen ein.

### Over-Rate Spend (Rate Card Integration)
```sql
SUM((a.hourly_rate_cents - rc.target_rate_cents) * t.total_hours)
WHERE a.hourly_rate_cents > rc.target_rate_cents
```
Graceful Degradation: Falls `rate_cards` Tabelle nicht existiert oder keine Cards vorhanden → 0.

### Projected Spend
```sql
a.hourly_rate_cents * 40h * (verbleibende Wochen bis planned_end_date)
WHERE a.status = 'active'
```
Default: 90 Tage falls kein `planned_end_date` gesetzt.

## Filter-Parameter

Alle Endpunkte unterstützen diese Query-Parameter:

| Parameter | Typ | Beschreibung |
|-----------|-----|-------------|
| `date_from` | DATE | Zeitraum Start (YYYY-MM-DD) |
| `date_to` | DATE | Zeitraum Ende |
| `vendor_id` | UUID | Filter auf einzelnen Vendor |
| `category` | STRING | ILIKE-Suche auf Rolle/Kategorie |
| `region` | STRING | ILIKE-Suche auf Standort/Stadt |
| `assignment_status` | STRING | Assignment-Status Filter |
| `granularity` | STRING | `monthly` (default) oder `quarterly` |
| `limit` | INT | Max. Ergebnisse (Default: 10-20, Max: 50-100) |

## API-Referenz

Alle Endpunkte unter `/api/spend-analytics`. Feature-Gate: `spend_analytics` (PRO / ENTERPRISE). RBAC: `report.executive`.

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/summary` | KPI-Aggregate: Total Spend, Vendors, Avg Rate, Over-Rate, Projected |
| GET | `/by-vendor` | Top-Vendoren nach Spend |
| GET | `/by-category` | Spend nach Rolle/Kategorie |
| GET | `/by-region` | Spend nach Standort |
| GET | `/over-time` | Monatliche/quartalsweise Zeitreihe |
| GET | `/rate-comparison` | Ist-Rate vs. Rate-Card-Target pro Vendor/Kategorie |
| GET | `/trends` | MoM-Veränderung mit Trend-Richtung |
| GET | `/top-cost-drivers` | Top Rollen/Vendoren nach absolutem Spend |

### Response-Beispiel: `/summary`
```json
{
  "success": true,
  "data": {
    "total_spend_cents": 2500000,
    "overtime_spend_cents": 125000,
    "projected_spend_cents": 4800000,
    "over_rate_spend_cents": 75000,
    "over_rate_count": 3,
    "assignment_count": 45,
    "active_assignments": 12,
    "vendor_count": 8,
    "avg_rate_cents": 3500,
    "timesheet_count": 180,
    "total_hours": 1440.0
  }
}
```

### Response-Beispiel: `/rate-comparison`
```json
{
  "success": true,
  "data": [
    {
      "category": "Pflege",
      "supplier_name": "Agency A",
      "actual_avg_cents": 3200,
      "target_avg_cents": 2800,
      "max_avg_cents": 3500,
      "deviation_cents": 400,
      "deviation_pct": 14.3,
      "assignment_count": 3
    }
  ]
}
```

## Rate-Card-Abweichung

Die Rate Comparison verknüpft Assignments mit Rate Cards via:
- `rate_cards.role_category ILIKE requisitions.role`
- `rate_cards.org_id = assignments.org_id`
- `rate_cards.status = 'active'`
- Validity check: `valid_from <= timesheet.week_start AND (valid_to IS NULL OR valid_to >= week_start)`

Farbcodierung im Frontend:
- **Grün** (`deviation_cents <= 0`): Im oder unter Budget
- **Gelb** (`actual <= max`): Toleranzbereich
- **Rot** (`actual > max`): Budget überschritten

## Integration

### Executive Dashboard
`reportingService.executiveDashboard()` enthält eine Spend-Summary (letzte 30 Tage) mit:
- Total Spend
- Avg Hourly Rate
- Assignment Count

### Frontend
`/public/spend-analytics.html` — Enterprise Dark Theme mit:
- Filter-Leiste (Zeitraum, Kategorie, Region)
- 8 KPI-Kacheln
- CSS-Balken-Charts (Vendor, Kategorie, Kostentreiber)
- Monatliche Zeitreihe (vertikale Balken mit Hover-Tooltip)
- Rate Comparison Tabelle (farbcodiert)
- MoM Trend-Tabelle (▲/▼ Indikatoren)

## Tests

```bash
node --test --test-force-exit api/test/spendAnalyticsService.test.js
```

18 Tests: Alle 8 Service-Funktionen, Filter-Logik, Edge Cases, Rate Card graceful degradation.
