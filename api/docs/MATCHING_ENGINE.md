# Matching Engine — TempConnect Instant Capacity Matching

## Übersicht

Die Matching Engine bewertet Capacity Posts gegen Requisitions/Demand-Parameter
mit einem 10-Faktor-Scoring-Modell. Jeder Faktor ist transparent, erklärbar und
per `reasons[]` Array nachvollziehbar.

## Scoring-Modell (10 Faktoren)

### Kern-Faktoren (immer aktiv)

| # | Faktor | Max Punkte | Beschreibung |
|---|--------|-----------|--------------|
| 1 | **Role** | 30 | Exakt = 30, Teilmatch = 15, Mismatch = 0. Case-insensitive. |
| 2 | **Skills** | 25 | Tag-Overlap: `overlap / min(5, demanded) × 25`. Case-insensitive. |
| 3 | **Location** | 25 | Haversine-Distanz innerhalb `radius_km` → linear abnehmend. Fallback: Stadt-Match = 60%. |
| 4 | **Availability** | 10 | Zeitraum-Overlap: `from ≤ demand_end && to ≥ demand_start` → 10 Punkte. |
| 5 | **Verified** | 5 | Supplier-Organisation ist verifiziert (`is_verified = TRUE`). |
| 6 | **Vendor Pool** | 5 | PREFERRED = 5, STANDARD = 3 (50%), kein Pool = 0. |

**Basis-Maximum: 100 Punkte**

### Bonus-Faktoren (opt-in, nur wenn Daten vorhanden)

| # | Faktor | Max Punkte | Trigger |
|---|--------|-----------|---------|
| 7 | **Compliance** | 7 | `complianceScore > 0` — Anteil grüner Compliance-Dokumente |
| 8 | **Rate** | 5 | `rateCompatible = true/false` — Stundensatz ≤ Budget |
| 9 | **Urgency** | 5 | `urgencyBoost = true` — bei HIGH/CRITICAL/notdienst |
| 10 | **Worker Count** | 3 | `workerCountMatch = true/false` — Kapazität ≥ Bedarf |

**Theoretisches Maximum: 120 Punkte → gedeckelt auf 100.**

### Gewichtung anpassen

Alle Gewichte können per `opts.weights` überschrieben werden:

```json
{ "weights": { "role": 40, "skills": 20, "location": 20 } }
```

Nicht übergebene Gewichte behalten ihre Defaults.

## Quality Labels

Basierend auf dem Gesamtscore klassifiziert `classifyMatch(score)`:

- **excellent** — Score ≥ 80
- **good** — Score ≥ 60
- **fair** — Score ≥ 40
- **weak** — Score < 40

## Architektur

```
matchingEngine.js          — scoreMatch(), classifyMatch(), matchRequisition(), logMatch()
instantMatchService.js     — instantMatchForRequisition(), instantMatchFromParams()
routes/matching.js         — REST-Endpunkte
matchAlertService.js       — Alert-Orchestrierung (Notdienst, Deduplizierung)
```

### Batch Pre-Fetch (kein N+1)

`instantMatchService.js` lädt vor dem Scoring alle benötigten Daten in 5 parallelen Queries:

1. `loadComplianceMap()` — Compliance-Dokumente pro Supplier
2. `loadReputationMap()` — Reputation-Scores
3. `loadVendorPoolMap()` — Vendor-Pool-Tiers für den Buyer
4. `loadVerifiedSet()` — Verifizierte Organisationen
5. `loadSupplierNames()` — Supplier-Namen

## API-Endpunkte

### Basis-Matching

```
GET /api/matching/demand/:requisitionId
```
Standard-Matching für eine Requisition. Nutzt Faktoren 1-6.

```
GET /api/matching/supply/:capacityPostId
```
Reverse-Matching: passende Requisitions für ein Capacity Post.

```
GET /api/matching/worker/:workerId
```
Worker-zu-Assignment-Matching.

### Instant Match (Premium)

```
GET /api/matching/instant/:requisitionId
```
Premium Instant Match für eine existierende Requisition.
Nutzt alle 10 Faktoren + Enrichment (Quality Labels, Highlights, Supplier Info).

Query-Parameter:
- `limit` — Max. Ergebnisse (Default: 25)
- `min_score` — Mindest-Score (Default: 10)

Response:
```json
{
  "matches": [{
    "capacity_post": { ... },
    "score": 87,
    "quality_label": "excellent",
    "reasons": [
      { "factor": "role", "points": 30, "max": 30, "detail": "Rolle \"Lagerhelfer\" stimmt ueberein" }
    ],
    "highlights": ["Rolle \"Lagerhelfer\" stimmt ueberein", "5/5 Skills uebereinstimmend"],
    "supplier_info": {
      "id": "org-123",
      "name": "Tempo GmbH",
      "verified": true,
      "compliance_pct": 100,
      "reputation_score": 85,
      "vendor_pool_tier": "PREFERRED"
    }
  }],
  "total": 12,
  "total_candidates": 45,
  "demand": { ... },
  "quality_summary": {
    "excellent": 3,
    "good": 5,
    "fair": 3,
    "weak": 1
  }
}
```

```
GET /api/matching/instant/search
```
Ad-hoc Instant Match ohne gespeicherte Requisition.

Query-Parameter:
- `role` — Gesuchte Rolle
- `skills` — Komma-separierte Skills
- `lat`, `lng` — Koordinaten
- `city` — Stadt (Fallback)
- `radius` — Suchradius in km
- `start_date`, `end_date` — Verfügbarkeitszeitraum
- `budget` — Max. Stundensatz
- `workers` — Benötigte Mitarbeiter
- `urgency` — HIGH, CRITICAL, notdienst
- `limit` — Max. Ergebnisse (Default: 25)
- `min_score` — Mindest-Score (Default: 10)

## ML-Logging

Jeder Instant-Match-Lauf loggt die Top-10-Ergebnisse in `match_log` für
späteres ML-Training. Felder: `match_type`, `source_id`, `target_id`,
`score`, `reasons`, `outcome`, `org_id`.

## Erklärbares Ranking

Jedes Match-Ergebnis enthält:
- `reasons[]` — Array mit je `{ factor, points, max, detail }` für jeden aktiven Faktor
- `highlights[]` — Top-3 stärkste Faktoren als lesbare Texte
- `quality_label` — Gesamtklassifikation (excellent/good/fair/weak)
- `supplier_info` — Angereicherte Supplier-Daten (Name, Compliance, Reputation, Tier)

Kein Matching-Ergebnis ist eine Blackbox. Alle Punkte sind nachvollziehbar.
