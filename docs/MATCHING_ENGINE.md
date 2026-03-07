# TempConnect – Matching Engine

## Übersicht
Konsolidierte Multi-Faktor-Scoring-Engine für das Matching von Bedarfsanforderungen (Requisitions, Demands, Search Jobs) gegen Kapazitätsangebote (Capacity Posts).

## Scoring-Modell (max. 100 Punkte)

| Faktor | Max. Punkte | Beschreibung |
|--------|-------------|--------------|
| **Rolle** | 30 | Exakte Übereinstimmung = 30, teilweise = 15 |
| **Skills** | 25 | Tag-Overlap: proportional zur Anzahl übereinstimmender Tags |
| **Standort** | 25 | Haversine-Distanz innerhalb Radius, inverslinear. Fallback: Stadt-Match = 15 |
| **Verfügbarkeit** | 10 | Zeitraum-Overlap (from/to vs start/end) |
| **Verifiziert** | 5 | Supplier hat verifizierte Nachweise |
| **Vendor Pool** | 5 | PREFERRED = 5, andere aktive Tiers = 3 |

## Erklärbarkeit
Jeder Score-Beitrag wird als `reason`-Objekt zurückgegeben:
```json
{
  "factor": "role",
  "points": 30,
  "max": 30,
  "detail": "Rolle \"Schweißer\" stimmt überein"
}
```

## Distanzberechnung
Haversine-Formel für geodätische Distanz in km. Berücksichtigt `radius_km` von Demand UND Capacity (Maximum).

## API-Nutzung
- `scoreMatch(demand, cap, opts)` – Einzelner Score
- `matchRequisition(pool, demand, opts)` – Batch gegen alle aktiven Capacity Posts
- `autoMatchRequisition(pool, reqId, reqData, opts)` – Match + automatisch als Candidates speichern

## Konsolidierung
Ersetzt die drei separaten Scoring-Logiken:
1. `marketplaceService.scoreMatch()` – Demand → Capacity
2. `slaSearchService.scoreJobAgainstCapacity()` – SearchJob → Capacity
3. `capacityService.haversineKm()` – Distanzberechnung

Die alten Funktionen bleiben für Rückwärtskompatibilität erhalten. Neue Features nutzen `matchingEngine.js`.
