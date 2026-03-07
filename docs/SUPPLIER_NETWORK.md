# TempConnect — Supplier Network Architecture

## Uebersicht

Das Supplier Network ist das Herzstück der B2B-Beziehungen auf TempConnect.
Es ermoeglicht Unternehmen (Buyers), Personaldienstleister (Suppliers) zu verwalten,
zu bewerten und fuer Requisitions gezielt einzusetzen.

---

## Architektur-Schichten

### 1. Vendor Pool (`vendor_pool` Tabelle)
Zentrale Zuordnung: welcher Buyer hat welchen Supplier in seinem Pool.

**Felder**: client_org_id, supplier_org_id, tier, status, category, location_id, department_id
**Tiers**: PREFERRED, SECONDARY, TRIAL, OPEN
**Status**: active, suspended, removed

**Service**: `api/services/vendorPoolService.js`
- `addToPool()` — Supplier hinzufuegen
- `changeTier()` — Tier aendern (z.B. TRIAL → PREFERRED)
- `changeStatus()` — Status aendern (suspend, remove)
- `listForClient()` — Alle Supplier eines Buyers
- `listForSupplier()` — Alle Buyers, bei denen ein Supplier gelistet ist
- `getPoolStats()` — Statistiken pro Buyer

### 2. Supplier Management (`supplierManagementService.js`)
Orchestrierung des Supplier-Lifecycles:

- **Einladung**: `inviteSupplier()` → Erstellt TRIAL-Eintrag im Vendor Pool
- **Genehmigung**: `approveSupplier()` → Tier-Upgrade + Status active
- **Suspendierung**: `suspendSupplier()` → Status suspended
- **Profil**: `getSupplierProfile()` → Composite View (Pool + Compliance + Contracts)
- **Liste**: `listManagedSuppliers()` → Alle verwalteten Supplier

### 3. Distribution Stages (`supplierPoolService.js`)
Stufenweise Verteilung von Requisitions an Supplier-Pools:

**Stufen**:
1. PREFERRED — Bevorzugte Dienstleister (24h Vorsprung)
2. SECONDARY — Regionale Dienstleister (48h)
3. OPEN — Offene Plattform (kein Zeitlimit)

**Funktionen**:
- `createDistributionPlan()` — Plan erstellen
- `advanceDistribution()` — Zur naechsten Stufe
- `getEligibleSuppliers()` — Berechtigte Supplier pro Stufe
- `findStagesNeedingAdvance()` — Batch: Auto-Advance pruefen

### 4. Compliance (`complianceDocService.js`)
Dokument-Management pro Supplier-Organisation:

- Upload, Verifizierung, Ablehnung
- Ampellogik (gruen/gelb/rot) basierend auf Ablaufdatum
- Automatische Expiry-Erkennung
- Compliance-Statistik pro Organisation

### 5. Metriken & Bewertung
- `supplierMetricsService.js` — KPIs pro Supplier
- `analyticsService.js` → `supplierResponsePerformance()` — Response-Zeiten
- `ratingService.js` — Bewertungen nach abgeschlossenen Deals

---

## Datenmodell

```
organizations (1) ──── (*) vendor_pool ──── (1) organizations
    │ (buyer)                                    │ (supplier)
    │                                            │
    ├── requisitions                             ├── capacity_posts
    ├── contracts                                ├── compliance_documents
    └── org_memberships (users)                  └── submissions
```

**Tabellen**:
- `organizations` — Unternehmen und Agenturen
- `vendor_pool` — N:M Beziehung Buyer ↔ Supplier mit Tier und Status
- `compliance_documents` — Dokumente pro Organisation
- `contracts` — Vertraege zwischen Buyer und Supplier
- `requisition_distribution_stages` — Verteilungsstufen pro Requisition

---

## API-Endpunkte

### Vendor Pool (`/api/vendor-pool`)
- `GET /` — Pool des eigenen Unternehmens
- `POST /` — Supplier hinzufuegen
- `PUT /:id/tier` — Tier aendern
- `PUT /:id/status` — Status aendern
- `GET /stats` — Pool-Statistiken

### Suppliers (`/api/suppliers`)
- `POST /invite` — Supplier einladen
- `PUT /:id/approve` — Supplier genehmigen
- `PUT /:id/suspend` — Supplier suspendieren
- `GET /:id/profile` — Composite Supplier-Profil

### Supplier Pools / Distribution (`/api/supplier-pools`)
- `POST /:requisitionId/distribution` — Verteilungsplan erstellen
- `GET /:requisitionId/distribution` — Plan abrufen
- `POST /:requisitionId/advance` — Naechste Stufe aktivieren
- `GET /:requisitionId/eligible/:stage` — Berechtigte Supplier

---

## Event Tracking

Folgende Events werden in `platform_events` gespeichert:
- `supplier_invited` — Supplier wurde eingeladen
- `supplier_approved` — Supplier wurde genehmigt
- `supplier_blocked` — Supplier wurde gesperrt
- `requisition_distributed` — Requisition wurde an Pool verteilt

---

## Integration mit anderen Modulen

- **Matching Engine**: Vendor-Pool-Tier fliesst als Scoring-Faktor ein (5 Punkte Bonus fuer PREFERRED)
- **Requisition Workflow**: Distribution-Stages werden beim Wechsel zu OPEN aktiviert
- **Compliance**: Supplier ohne gueltige Dokumente koennen in Audits geflaggt werden
- **Notifications**: Einladungen und Status-Aenderungen loesen Benachrichtigungen aus
