# Smart Pricing — Datengestützte Preisvorschläge

## Übersicht
Smart Pricing liefert nachvollziehbare, datenbasierte Preisorientierung für Rollen und Regionen.
Kein ML, kein Blackbox — reine SQL-Aggregation historischer Plattformdaten mit gewichteter Logik.

## 4-Stufen-Modell

| Stufe | Quelle | Gewicht | Beschreibung |
|-------|--------|---------|-------------|
| 1. Marktpreis (deals) | `assignments.hourly_rate_cents` | 50% | Stärkstes Signal: echte Rates aus aktiven/abgeschlossenen Einsätzen (12 Monate) |
| 2. Angebotspreis (offers) | `offers.offered_hourly_rate` | 25% | Gesendete/akzeptierte Angebote (12 Monate) |
| 3. Kapazitätspreis (supply) | `capacity_posts.price_min/max` | 15% | Aktive Kapazitätseinträge |
| 4. Nachfragepreis (demand) | `demand_requests.budget_min/max` | 10% | Offene/erfüllte Nachfragen (12 Monate) |

**Gewichts-Renormalisierung:** Wenn nicht alle Stufen Daten liefern, werden die aktiven Gewichte auf 100% renormalisiert. Beispiel: Nur deals + offers vorhanden → deals=67%, offers=33%.

## Aggregation
Jede Stufe berechnet per `PERCENTILE_CONT`:
- **p25** (25. Perzentil) → untere Grenze
- **Median** (50. Perzentil) → Mittelwert
- **p75** (75. Perzentil) → obere Grenze
- **sample_count** → Anzahl der Datenpunkte

## Dringlichkeitszuschlag
| Urgency | Zuschlag |
|---------|----------|
| normal | 0% |
| high | +5% |
| urgent | +10% |
| critical | +15% |
| notdienst | +20% |

## Confidence-Scoring
| Stufe | Bedingung |
|-------|-----------|
| `high` | ≥ 20 Datenpunkte gesamt |
| `medium` | ≥ 5 Datenpunkte |
| `low` | < 5 Datenpunkte |

## API-Referenz

### GET /api/pricing/suggest
Datengestützter Preisvorschlag für eine Rolle/Region.

**Auth:** Session erforderlich
**Feature-Gate:** `smart_pricing` (PLUS / PRO / ENTERPRISE)

**Query-Parameter:**
- `role` (string, optional) — Rolle/Berufsbezeichnung, z.B. "Schweisser"
- `region` (string, optional) — Stadt/Region, z.B. "Berlin"
- `urgency` (enum, optional) — "normal" | "high" | "urgent" | "critical" | "notdienst" (default: "normal")
- `context` (enum, optional) — "supply" | "demand" | "offer"

**Mindestens `role` oder `region` muss angegeben werden.**

**Response (200):**
```json
{
  "suggestion": {
    "min_cents": 2000,
    "max_cents": 3000,
    "mid_cents": 2500,
    "min_eur": 20.00,
    "max_eur": 30.00,
    "mid_eur": 25.00,
    "currency": "EUR",
    "surcharge_pct": 0
  },
  "confidence": "high",
  "total_data_points": 38,
  "stages_used": ["deals", "offers", "supply", "demand"],
  "data_points": {
    "deals":  { "sample_count": 20, "median_cents": 2500, "p25_cents": 2000, "p75_cents": 3000 },
    "offers": { "sample_count": 10, "median_cents": 2700, "p25_cents": 2200, "p75_cents": 3200 },
    "supply": { "sample_count": 5,  "median_cents": 2300, "p25_cents": 1800, "p75_cents": 2800 },
    "demand": { "sample_count": 3,  "median_cents": 2900, "p25_cents": 2400, "p75_cents": 3400 }
  },
  "explanation": [
    "abgeschlossene Einsätze: 20 Datenpunkte, Median 25.00 €/h",
    "Angebote: 10 Datenpunkte, Median 27.00 €/h",
    "Kapazitätseinträge: 5 Datenpunkte, Median 23.00 €/h",
    "Nachfragen: 3 Datenpunkte, Median 29.00 €/h",
    "Konfidenz: high"
  ],
  "query": { "role": "Schweisser", "region": "Berlin", "urgency": null, "context": null },
  "disclaimer": "Unverbindliche Preisorientierung auf Basis historischer Plattformdaten. Kein Preisversprechen."
}
```

**Fehlerfälle:**
- `400 VALIDATION` — Ungültige Query-Parameter
- `400 FILTER_REQUIRED` — Weder role noch region angegeben
- `401` — Nicht eingeloggt
- `403` — Feature nicht im Plan enthalten

## Integrationspunkte

### Datenquellen
- `assignments` → `hourly_rate_cents`, `worker_description`, `org_id`, `supplier_org_id`
- `offers` → `offered_hourly_rate`, `demand_request_id`
- `capacity_posts` → `price_min`, `price_max`, `role`, `location_city`
- `demand_requests` → `budget_min`, `budget_max`, `role`, `location_city`

### Frontend-Integration
Der Endpoint kann in Formularen für Angebote, Nachfragen und Kapazitätseinträge eingebunden werden,
um dem Nutzer eine plausible Preisspanne als Orientierung anzuzeigen.

### Architektur
- `services/smartPricingService.js` — Geschäftslogik (pure functions + DB queries)
- `routes/smartPricing.js` — Express-Route mit Auth/Feature-Gate/Zod
- `test/smartPricing.test.js` — 35 Tests (Unit + Integration)

## Design-Prinzipien
1. **Kein Blackbox** — Jede Stufe ist transparent, Erklärung wird mitgeliefert
2. **Plausible Range** — p25–p75 statt starrer Einzelwert
3. **Kein Zwang** — Vorschlag, kein Pflichtfeld
4. **Nachvollziehbar** — Begründung + Datenpunkte pro Stufe
5. **Enterprise-ready** — Feature-gated, Auth-protected, Zod-validiert
