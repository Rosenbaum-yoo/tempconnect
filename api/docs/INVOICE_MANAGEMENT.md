# Invoice Management

TempConnect unterscheidet zwei Rechnungstypen:

1. **Subscription** (`invoiceService.js`) — SaaS-Plan-Abrechnung (Checkout → Invoice)
2. **Operational** (`operationalInvoiceService.js`) — B2B-Einsatz-Abrechnung (Timesheet → Invoice)

Beide nutzen dieselben Tabellen (`invoices`, `invoice_items`), unterschieden durch `invoice_type`.

## Operativer Abrechnungsflow

```
Timesheet (approved) → Abrechenbare Leistung → Invoice (draft) → issued → paid
                                                                → overdue → paid
                                                                → void
```

### Abrechnungsformel

```
Regelstunden   = (total_hours - overtime_hours) × hourly_rate_cents
Überstunden    = overtime_hours × hourly_rate_cents × (1 + overtime_surcharge_pct / 100)
Nettobetrag    = Regelstunden + Überstunden
MwSt.          = Nettobetrag × tax_rate_pct / 100
Gesamtbetrag   = Nettobetrag + MwSt.
```

Defaults: `tax_rate_pct = 19%`, `overtime_surcharge_pct = 25%` — konfigurierbar pro Rechnung.

## API-Endpunkte

### Subscription (bestehend)

- `GET /invoices` — Liste (Subscription)
- `GET /invoices/:id` — Detail mit Items
- `GET /invoices/export` — CSV-Export (`org.billing`)
- `POST /invoices/:id/void` — Stornierung (`org.billing`)
- `POST /invoices/:id/paid` — Zahlungseingang (`org.billing`)

### Operational (neu)

Alle unter `/api/invoices/operational`.

**Lesend** (requireAuth):
- `GET /invoices/operational` — Rechnungsliste (Filter: status, assignment_id, date_from, date_to, search)
- `GET /invoices/operational/kpis` — Dashboard-KPIs
- `GET /invoices/operational/billable` — Approved Timesheets ohne Rechnung
- `GET /invoices/operational/:id` — Detail mit Items + Timesheet-Daten

**Schreibend** (`org.billing`):
- `POST /invoices/operational/generate` — Aus Timesheets Rechnung erzeugen
- `POST /invoices/operational/:id/issue` — draft → issued
- `POST /invoices/operational/:id/paid` — issued/overdue → paid
- `POST /invoices/operational/:id/void` — Stornierung
- `POST /invoices/operational/:id/correction` — Korrekturposition (nur draft)
- `GET /invoices/operational/:id/export/csv` — Einzelrechnung CSV

**Internal Scheduler (Cron, mit `/api/internal/*` Auth):**
- `POST /internal/invoice-overdue-scan` — setzt `issued` Rechnungen mit `due_at < NOW()` auf `overdue`

### POST /invoices/operational/generate

```json
{
  "assignment_id": "uuid",
  "timesheet_ids": ["uuid", "uuid"],
  "reference_number": "PO-12345",
  "billing_contact_name": "Max Mustermann",
  "notes": "Abrechnung März 2026",
  "tax_rate_pct": 19,
  "overtime_surcharge_pct": 25
}
```

**Validierung:**
- Alle Timesheets müssen `status = approved` und `invoice_id IS NULL` sein
- Assignment muss `hourly_rate_cents` haben
- Org-Boundary: Anfragender muss buyer oder supplier des Assignments sein

**Response:** Invoice + generierte Line Items (je Timesheet: Regelstunden + ggf. Überstunden)

### GET /invoices/operational/kpis

```json
{
  "total_invoices": 15,
  "draft_count": 2,
  "issued_count": 5,
  "overdue_count": 1,
  "paid_count": 7,
  "outstanding_cents": 250000,
  "overdue_cents": 50000,
  "paid_this_month_cents": 120000,
  "paid_total_cents": 800000
}
```

## Status-Lifecycle

```
draft → issued → paid
  ↓       ↓       
  void    overdue → paid
            ↓
            void
```

- `draft` — Entwurf, Korrekturen möglich
- `issued` — Versendet, Zahlungsfrist läuft
- `overdue` — Zahlungsfrist überschritten (automatisch via Scheduler)
- `paid` — Bezahlt (Terminal)
- `void` — Storniert (Terminal)

## Duplikat-Schutz

Jeder Timesheet wird beim Invoicing mit `invoice_id` verknüpft. Ein Timesheet kann nur einmal abgerechnet werden. `getBillableTimesheets()` liefert nur `approved + invoice_id IS NULL`.

## Commercial Source-of-Truth

Für Finance-/Executive-Reporting werden Kennzahlen strikt getrennt:

- **Invoiced Revenue:** `SUM(total_cents)` über `status IN ('issued','overdue','paid')`
- **Paid Revenue:** `SUM(total_cents)` über `status = 'paid'`
- **Open Receivables:** `SUM(total_cents)` über `status IN ('issued','overdue')`
- **Overdue Receivables:** `SUM(total_cents)` über `status = 'overdue'`
- **Billable Uninvoiced Volume:** approved Timesheets mit `invoice_id IS NULL`, bewertet via Assignment-Rate

Wichtig: Payment-Session-Daten sind Cash-Proxy, ersetzen aber nicht den Invoice-Status als Forderungswahrheit.

## Audit-Trail

Alle Schreiboperationen loggen in `audit_log`:
- `invoice.operational_created` — Rechnung erzeugt (mit Timesheet-Count, Beträge, Periode)
- `invoice.issued` / `invoice.paid` / `invoice.void` — Status-Übergänge
- `invoice.correction_added` — Korrekturposition

## CSV-Export

Einzelrechnung als CSV mit Positionen + Zusammenfassung (Netto, MwSt., Gesamt).

Für Due-Diligence-/Finance-Snapshots über Subscription + Operational + Payment + Billable gilt zusätzlich:
- `GET /api/reporting/finance-truth/export?format=csv|json`
- CSV ist zeilenbasiert mit `section`/`metric_key`/`source` und dient als auditierbarer Exportvertrag.

## Migration 086

`sql/migrations/086_operational_invoice_truth_hardening.sql` — Erweitert/härtet `invoices` um `invoice_type`, `assignment_id`, `supplier_org_id`, `billing_contact_name`, `reference_number`, `overtime_surcharge_pct`; erweitert `invoice_items` um `timesheet_id`, `assignment_id`, `item_type`; fügt `timesheets.invoice_id` für duplikatsichere Leistungsfakturierung hinzu; harmonisiert außerdem den `payment_sessions`-Plan-Constraint.
