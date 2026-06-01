# Preferred Vendor First / Self-Service Workforce Pool

## Konzept
Enterprise-Kunden definieren bevorzugte Dienstleister (Preferred Vendors) und steuern deren operative Priorisierung im Matching, bei Anfragen und in der Kapazitaetsplanung.

**Kein separates System** — baut vollstaendig auf dem bestehenden `vendor_pool` (Tier-System PREFERRED/SECONDARY/TRIAL/RESTRICTED/BLOCKED) auf.

## Operativer Effekt

### Matching-Priorisierung
- **Factor 6 (Basis):** PREFERRED = 5 Pkt, SECONDARY = 2-3 Pkt
- **Factor 12 (Preferred-First Boost):** +15 Pkt wenn `preferredFirst` aktiv
- **Effekt:** Preferred Vendors ranken 15-20 Punkte hoeher als Non-Preferred bei sonst gleicher Qualifikation
- **Aktivierung:** `preferredFirst: true` im Matching-Request

### Distribution / Routing
- Stage-Distribution (supplierPoolService): PREFERRED → SECONDARY → OPEN
- Preferred Vendors erhalten Anfragen immer zuerst (Stage 1)
- Auto-Advance nach 24h falls keine Antwort

### Sichtbarkeit
- Marketplace: Preferred-Badge in Capacity-Listings
- Supplier-Profil: Tier-Kennzeichnung + KPIs
- Vendor-Dashboard: Preferred-Uebersicht mit Performance-Daten

## Self-Service API

### Endpoints

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | /api/preferred-vendors | Liste aller Preferred Vendors mit KPIs |
| GET | /api/preferred-vendors/summary | Dashboard: Counts, Coverage, Performance |
| GET | /api/preferred-vendors/coverage | Gap-Analyse nach Kategorie/Standort |
| GET | /api/preferred-vendors/suggest | Auto-Suggestions fuer Promotion |
| GET | /api/preferred-vendors/capacity | Workforce-Kapazitaet der Preferred Vendors |
| POST | /api/preferred-vendors | Supplier als Preferred hinzufuegen |
| POST | /api/preferred-vendors/bulk | Batch promote/demote |
| DELETE | /api/preferred-vendors/:supplierOrgId | Aus Preferred entfernen |

### Authentifizierung
- Alle Endpoints: `requireAuth` + RBAC
- Lese-Endpoints: `vendor_pool.view`
- Schreib-Endpoints: `vendor_pool.manage`
- Org-Context: automatisch ueber `req.orgId`

### Beispiele

**Preferred Vendor hinzufuegen:**
```json
POST /api/preferred-vendors
{
  "supplier_org_id": "uuid",
  "category": "IT",
  "location_id": "uuid",
  "reason": "Top-Performer Q4"
}
```

**Batch Promote:**
```json
POST /api/preferred-vendors/bulk
{
  "action": "promote",
  "entry_ids": ["uuid-1", "uuid-2"],
  "reason": "Q1 Review — exzellente Performance"
}
```

**Coverage-Analyse:**
```json
GET /api/preferred-vendors/coverage

Response:
{
  "covered": [
    { "category": "IT", "location_name": "Berlin", "vendor_count": 3 }
  ],
  "gaps": [
    { "category": "Pflege", "location_name": "Muenchen", "vendor_count": 1, "tier": "SECONDARY" }
  ]
}
```

## Service-Architektur

### vendorPoolService.js (erweitert)
Neue Exports:
- `getPreferredVendors(pool, clientOrgId, filters)` — PREFERRED-only mit Reputation + Metrics + Capacity Count
- `getPreferredSummary(pool, clientOrgId)` — Aggregierte KPIs + Coverage-Stats
- `bulkSetPreferred(pool, clientOrgId, entryIds, actorId, reason)` — Batch mit History
- `demoteFromPreferred(pool, entryId, actorId, reason)` — PREFERRED → SECONDARY
- `getPoolCoverage(pool, clientOrgId)` — Coverage vs. Gaps
- `suggestForPreferred(pool, clientOrgId, limit)` — SECONDARY/TRIAL mit Reputation >= 50
- `getWorkforceCapacity(pool, clientOrgId)` — Capacity Posts + Workers der Preferred Vendors

### matchingEngine.js (erweitert)
- `PREFERRED_FIRST_BOOST = 15` (exportierte Konstante)
- Factor 12: Preferred-First Boost (opt-in ueber `opts.preferredFirst`)

### instantMatchService.js (erweitert)
- `opts.preferredFirst` wird an `scoreMatch` durchgereicht

## Datenmodell
Nutzt bestehende `vendor_pool`-Tabelle — keine neue Migration noetig:
- `tier`: PREFERRED / SECONDARY / TRIAL / RESTRICTED / BLOCKED
- `status`: active / suspended / removed
- `category`: Fachbereich (z.B. IT, Logistik, Pflege)
- `location_id`: FK auf org_locations
- `department_id`: FK auf org_departments
- `valid_from` / `valid_until`: Zeitliche Begrenzung
- History: `vendor_pool_history` (Tier/Status-Aenderungen)
- Notes: `vendor_pool_notes` (chronologische Kommentare)

## Auto-Suggest Logik
Kandidaten fuer Preferred-Promotion werden automatisch identifiziert:
1. Aktive SECONDARY/TRIAL-Vendors
2. Reputation >= 50
3. Sortiert nach Reputation + Avg-Stars
4. Top N als Vorschlaege

## Tests
`test/preferredVendor.test.js` — ~35 Tests:
- PREFERRED_FIRST_BOOST Konstante
- Factor 12: Boost nur bei preferredFirst + PREFERRED
- Ranking-Effekt: PREFERRED > Non-Preferred
- getPreferredVendors: Filtern, KPIs, leerer Pool
- getPreferredSummary: Coverage-Stats, Top-Performer
- bulkSetPreferred: Batch, Org-Boundary, Already-Preferred
- demoteFromPreferred: Demotion, Non-Preferred, Not-Found
- getPoolCoverage: Covered + Gaps
- suggestForPreferred: Reputation-Filter, Limit-Cap
- getWorkforceCapacity: Aggregation, Totals
- Edge cases: Score-Cap 100, Limit-Enforcement
