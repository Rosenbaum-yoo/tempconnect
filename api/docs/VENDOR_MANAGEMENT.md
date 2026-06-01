# Vendor Management System (VMS)

Enterprise-grade Vendor-Management-Modul fuer TempConnect.
Unternehmen koennen Zeitarbeitsfirmen strukturiert verwalten.

## Tier-Modell

| Tier | Bedeutung | Automatische Zuweisung |
|------|-----------|----------------------|
| PREFERRED | Bevorzugter Lieferant, erhaelt Anfragen zuerst | Nach Freigabe durch Admin |
| SECONDARY | Standard-Lieferant | Default bei Einladung/Approval |
| TRIAL | Probezeit/Einladung | Bei `inviteSupplier()` |
| RESTRICTED | Eingeschraenkt (z.B. nur bestimmte Standorte) | Manuell |
| BLOCKED | Gesperrt, erhaelt keine Anfragen | Bei `blockVendor()` |

## Status-Modell

- **active** — Aktiv im Pool, erhaelt Anfragen
- **suspended** — Temporaer gesperrt (z.B. Compliance-Problem)
- **removed** — Aus dem Pool entfernt (Soft-Delete)

## API-Endpoints

### Bestehende Endpoints (routes/vendorPool.js)
- `GET /vendor-pool` — Pool-Eintraege des eigenen Unternehmens
- `GET /vendor-pool/my` — Supplier-Sicht: wo bin ich gelistet?
- `GET /vendor-pool/stats` — Tier-Statistik
- `GET /vendor-pool/:id` — Einzelner Eintrag
- `POST /vendor-pool` — Hinzufuegen
- `PATCH /vendor-pool/:id/tier` — Tier aendern
- `PATCH /vendor-pool/:id/status` — Status aendern
- `DELETE /vendor-pool/:id` — Entfernen (Soft-Delete)

### Bestehende Endpoints (routes/suppliers.js)
- `GET /suppliers` — Managed Supplier Liste
- `POST /suppliers/invite` — Supplier einladen
- `PATCH /suppliers/:id/approve` — Supplier freigeben
- `PATCH /suppliers/:id/suspend` — Supplier suspendieren
- `PATCH /suppliers/:id/block` — Supplier blockieren
- `PATCH /suppliers/:id/categorize` — Kategorie/Notiz setzen
- `PATCH /suppliers/:id/tier` — Tier aendern
- `GET /suppliers/:buyerOrgId/:supplierOrgId/profile` — Konsolidiertes Profil

### Neue VMS-Endpoints (routes/suppliers.js)
- `GET /suppliers/enriched` — Vendor-Liste mit inline KPIs (Reputation, Metriken)
- `GET /suppliers/dashboard` — Aggregiertes KPI-Dashboard
- `GET /suppliers/:vpId/notes` — Notizen zu einem Vendor-Eintrag
- `POST /suppliers/:vpId/notes` — Notiz hinzufuegen
- `GET /suppliers/:vpId/history` — Aenderungshistorie eines Vendor-Eintrags

## Konsolidiertes Vendor-Profil

`GET /suppliers/:buyerOrgId/:supplierOrgId/profile` liefert:

```json
{
  "vendor_pool": { "tier": "PREFERRED", "status": "active", "category": "IT", ... },
  "compliance": { "total": 5, "approved": 4, "pending": 1 },
  "contracts": [{ "id": "...", "title": "MSA", "status": "active" }],
  "scorecard": { "fill_rate": 0.8, "on_time_rate": 0.95, "avg_rating": 4.2, "grade": "A" },
  "reputation": { "reputation_score": 82, "grade": "GOLD", "avg_stars": 4.3 },
  "history": [{ "field_changed": "tier", "old_value": "TRIAL", "new_value": "PREFERRED" }],
  "notes": [{ "note_text": "Sehr zuverlaessig", "author_name": "Max Mueller" }],
  "active_workers": 3
}
```

## Vendor Dashboard

`GET /suppliers/dashboard` liefert aggregierte KPIs:

- **pool_composition** — Anzahl Vendors nach Tier (PREFERRED, SECONDARY, TRIAL, ...)
- **status_composition** — Anzahl nach Status (active, suspended, removed)
- **kpis** — avg_reputation, avg_stars, avg_deal_success, top_grade_count
- **top_performers** — Top 5 Suppliers nach Reputation
- **underperformers** — Bottom 5 Suppliers nach Reputation
- **recent_changes** — Letzte 10 Tier/Status-Aenderungen

## Enriched Vendor List

`GET /suppliers/enriched` liefert die normale Vendor-Liste PLUS inline KPIs:
- `reputation_score`, `reputation_grade`, `avg_stars`
- `fill_rate_pct`, `sla_breach_rate_pct`
- `response_time_score`, `deal_success_rate`, `activity_score`
- Query-Filter `activity_scope=buyer_activity_30d` verengt die Liste auf aktive Pool-Vendoren mit buyer-seitiger Aktivität der letzten 30 Tage
- In diesem Drilldown wird pro `supplier_org_id` nur ein führender Pool-Eintrag geliefert, damit die Liste exakt zur Executive-KPI `active_vendors_30d` passt

## Aenderungshistorie

Jede Tier- oder Status-Aenderung wird automatisch in `vendor_pool_history` protokolliert:
- `field_changed` (tier | status)
- `old_value`, `new_value`
- `changed_by` (User-ID)
- `reason` (optionaler Begruendungstext)
- `created_at`

## Notizen-System

Chronologische Kommentar-History pro Vendor-Eintrag:
- `POST /suppliers/:vpId/notes` — Neue Notiz anlegen
- `GET /suppliers/:vpId/notes` — Alle Notizen abrufen (neueste zuerst)
- Notizen sind nur per `supplier.manage`-Berechtigung anlegbar, per `vendor_pool.view` lesbar.

## RBAC

- `vendor_pool.manage` — owner, admin, supplier_manager, program_manager
- `vendor_pool.view` — +hiring_manager, finance
- `supplier.manage` — owner, admin, supplier_manager, program_manager
- `supplier.view` — +hiring_manager

## Migration

Migration 028 (`db/migrations/028_vendor_management_vms.sql`):
- `vendor_pool_history` — Aenderungsprotokoll
- `vendor_pool_notes` — Notizen mit Autor-Referenz

## Services

- `vendorPoolService.js` — CRUD + History + Notes + Enriched List + Dashboard
- `supplierManagementService.js` — Lifecycle-Orchestrierung + Konsolidiertes Profil
- `supplierMetricsService.js` — Scorecard (fill_rate, SLA, Rating, Grade)
- `reputationService.js` — Reputation (0-100), Response-Time, Deal-Success, Activity

## Tests

`test/vendorManagement.test.js` — 50+ Tests:
- VALID_TIERS/VALID_STATUSES Exports
- addToPool mit Defaults und Optionen
- changeTier/changeStatus mit automatischer History
- blockVendor, removeFromPool
- listForClient/listForSupplier mit Filtern
- getEntry, isInPool, poolStats
- getHistory, addNote, listNotes
- listForClientEnriched mit KPI-Joins
- getVendorDashboard mit aggregierten KPIs
- Konsolidiertes Supplier-Profil (alle Sektionen)
- Integration: Tier/Status-Aenderung → History-Write
