# Reputation System — TempConnect

## Übersicht
Das Reputationssystem macht Qualität und Zuverlässigkeit von Anbietern (Zeitarbeitsfirmen) im Marktplatz sichtbar.
Es basiert ausschließlich auf vorhandenen Plattformdaten — keine Blackbox, keine intransparenten Mechanismen.

## Bewertungsmodell

### Composite Reputation Score (0-100)
Formel: `avg_stars_pct × 0.5 + deal_success_rate × 0.3 + response_time_score × 0.2`

- **Stars-Anteil (50%)** — Normalisierte Sternebewertung: `((avg_stars - 1) / 4) × 100`
- **Deal-Erfolgsquote (30%)** — `completed / (completed + cancelled + declined) × 100`
- **Reaktionszeit (20%)** — Scorecard von 10 (>24h) bis 100 (<1h)

### Grade-System
| Grade | Score-Bereich | Label | Farbe |
|-------|--------------|-------|-------|
| PLATINUM | ≥ 90 | Platin | #A78BFA |
| GOLD | ≥ 80 | Gold | #F59E0B |
| SILVER | ≥ 70 | Silber | #94A3B8 |
| BRONZE | ≥ 60 | Bronze | #CD7F32 |
| UNRATED | < 60 | Nicht bewertet | #6B7280 |

### 6 Signale
| Signal | Quelle | Beschreibung |
|--------|--------|-------------|
| Bewertung | `ratings.stars` | Durchschnittliche Sternebewertung (1-5) |
| Abschlussquote | `requests` (FINALIZED/COMPLETED) | Erfolgsrate bei Deals |
| Reaktionszeit | `requests` (response timing) | Wie schnell auf Anfragen reagiert wird |
| Aktivität | `capacity_posts` + Response-Rate | Listings + Antwortquote (90 Tage) |
| Stundenzettel-Zuverlässigkeit | `timesheets` (approved/rejected) | Qualität der Timesheet-Einreichungen |
| Ranking Score | Alle Faktoren gewichtet | Vorsortierung für Marketplace-Feed |

### Timesheet-Zuverlässigkeit (neu)
- Berechnung: `approved / (approved + rejected) × 100` (letzte 12 Monate)
- Minimum: 3 Timesheets nötig, sonst `null`
- Gespeichert in `supplier_reputation.timesheet_reliability_score`

## Matching-Integration
Das Reputations-Score fließt als **Faktor 11** in die Multi-Faktor-Matching-Engine ein:
- Max 8 Punkte (von 100+ möglichen Gesamt-Score)
- Formel: `min(8, round(reputationScore / 100 × 8))`
- Opt-in: Nur wenn Reputation-Daten vorhanden

## Marketplace-Enrichment
Capacity-Post-Listings enthalten automatisch Reputation-Daten:
- `reputation_grade` — Grade (PLATINUM/GOLD/SILVER/BRONZE/UNRATED)
- `reputation_score` — Composite Score (0-100)
- `reputation_avg_stars` — Durchschnittliche Sterne
- `reputation_total_ratings` — Anzahl Bewertungen

## API-Referenz

### GET /api/reputation/:id/card
Display-ready Reputation Card für ein Supplier-Profil.

**Auth:** Session erforderlich

**Response:**
```json
{
  "reputation": {
    "supplier_id": "uuid",
    "supplier_name": "AgencyGmbH",
    "grade": "GOLD",
    "grade_label": "Gold",
    "badge_color": "#F59E0B",
    "reputation_score": 82.5,
    "ranking_score": 55.2,
    "signals": [
      { "key": "stars", "label": "Bewertung", "value": 4.2, "display": "4.2 ★", "detail": "15 Bewertungen", "max": 5 },
      { "key": "deal_success", "label": "Abschlussquote", "value": 85, "display": "85%", "detail": "17/20 Deals", "max": 100 },
      { "key": "response_time", "label": "Reaktionszeit", "value": 75, "display": "Sehr schnell (< 4h)", "max": 100 },
      { "key": "activity", "label": "Aktivität", "value": 60, "display": "Aktiv", "max": 100 },
      { "key": "timesheet_reliability", "label": "Stundenzettel-Zuverlässigkeit", "value": 95, "display": "95%", "max": 100 }
    ],
    "member_since": "2024-06-01T00:00:00Z",
    "verified": true,
    "updated_at": "2026-01-15T10:00:00Z"
  }
}
```

### GET /api/reputation/:id/signals
Nur die Signale eines Suppliers.

### GET /api/reputation/top
Top-Supplier Leaderboard (max 50).

**Query:** `?limit=20` (default: 20, max: 50)

## Architektur
- `services/reputationService.js` — Kernlogik (pure functions + DB queries)
- `routes/reputation.js` — Express-Routes
- `services/matchingEngine.js` — Faktor 11 (reputation)
- `services/instantMatchService.js` — Reputation-Map Durchreichung
- `services/marketplaceService.js` — LEFT JOIN für Capacity-Post-Enrichment
- `sql/migrations/045_reputation_visibility.sql` — timesheet_reliability_score
- `test/reputationVisibility.test.js` — Tests

## Design-Prinzipien
1. **Kein Blackbox** — Jedes Signal transparent und nachvollziehbar
2. **Fair** — Keine Strafmechanismen, nur positive Signale
3. **Datengetrieben** — Nur vorhandene Plattformdaten, kein ML
4. **B2B-seriös** — Professionelle Labels, keine Gamification
5. **Opt-in** — Reputation-Faktor im Matching nur wenn Daten vorhanden
