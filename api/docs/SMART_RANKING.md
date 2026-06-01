# Smart Ranking — Kontrollierte AI-Matching-Erweiterung

## Übersicht

Smart Ranking erweitert das bestehende 12-Faktor-Matching um eine **nachvollziehbare Scoring-Schicht** (Factor 13), die 6 verhaltensbasierte Signale auswertet. Kein Blackbox-ML — alle Berechnungen sind deterministisch, gewichtet und vollständig erklärbar.

## Signale & Gewichtung

| Signal | Gewicht | Beschreibung | Neutral-Default |
|---|---|---|---|
| Fill Rate | 25% | Annahmequote (accepted / received), min. 3 Requests | 50 |
| SLA Compliance | 20% | Inverse Breach Rate (1 − breaches/received) | 50 |
| Role Expertise | 20% | Spezialisierung + Volumen für die gesuchte Rolle | 30 |
| Timesheet Quality | 15% | Dokumentationszuverlässigkeit aus Reputation | 50 |
| Recency | 10% | Frische des Capacity-Posts (<1d=100 … >30d=20) | 50 |
| Platform Activity | 10% | Engagement-Score aus Reputation | 30 |

**Gesamt:** Gewichteter Score 0–100, skaliert auf max. 10 Matching-Punkte (Factor 13).

## Klassifikation

| Klasse | Score-Range | Label (DE) |
|---|---|---|
| excellent | ≥ 85 | Exzellent |
| strong | 70–84 | Stark |
| solid | 50–69 | Solide |
| developing | 30–49 | Aufbauend |
| insufficient | < 30 | Unzureichend |

## API-Endpunkte

### Smart Explain — Nachvollziehbares Profil

```
GET /api/matching/smart-explain/:supplierId?role=Schweisser
```

**Response:**
```json
{
  "supplier_id": "uuid",
  "role": "Schweisser",
  "smart_rank_score": 78.5,
  "classification": "strong",
  "classification_label": "Stark",
  "weights": { "fill_rate": 0.25, "sla_compliance": 0.20, ... },
  "signals": { "fill_rate": 90, "sla_compliance": 85, ... },
  "breakdown": [
    { "signal": "fill_rate", "weight": 25, "value": 90, "weighted": 22.5, "detail": "Sehr hohe Annahmequote" },
    ...
  ]
}
```

### Instant Match (automatisch integriert)

Smart Rank wird automatisch bei jedem Instant Match berechnet und als Factor 13 (`smartRank`) in die Score-Reasons aufgenommen:

```
GET /api/matching/instant/search?role=Schweisser&skills=WIG&city=Berlin
```

Im `reasons`-Array erscheint:
```json
{ "factor": "smartRank", "points": 8, "max": 10, "detail": "Smart Rank 78/100 (Stark)" }
```

## Architektur

```
smartRankingService.js    — Pure Functions (keine DB), voll testbar
  ├─ computeFillRateSignal()
  ├─ computeSlaComplianceSignal()
  ├─ computeRoleExpertiseSignal()
  ├─ computeRecencySignal()
  ├─ computeSmartRankScore()     → { score, breakdown[] }
  └─ classifySmartRank()

instantMatchService.js    — Batch-Loader + Integration
  └─ loadSmartRankMap()          — Effizienter JOIN: supplier_metrics + supplier_reputation + requests

matchingEngine.js         — Factor 13 (opt-in, max 10 Punkte)

routes/matching.js        — GET /matching/smart-explain/:supplierId
```

## Opt-in-Verhalten

- Factor 13 wird **nur** aktiviert, wenn `smartRankScore > 0` vorliegt
- Ohne Supplier-Metriken-Daten bleibt `smartRankScore = 0` → kein Einfluss
- Bestehende 12 Faktoren bleiben unverändert

## Datenquellen

- `supplier_metrics` (window_days=30): Fill Rate, SLA Breaches
- `supplier_reputation`: Timesheet Reliability, Activity Score
- `requests` (receiver_id, role, status): Role Expertise
- `capacity_posts` (updated_at): Recency

## Tests

```bash
node --test --test-force-exit test/smartRanking.test.js
```

35 Tests: Pure-Function-Signale, Composite Score, Classification, Factor-13-Integration, Edge Cases.
