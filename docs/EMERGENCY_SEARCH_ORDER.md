# Emergency Search Order (Notdienst)

## Ziel

TempConnect orchestriert akuten Personalbedarf als verfolgbaren Suchauftrag mit Teilerfuellung ueber mehrere Anbieter.

## Bestehende Bausteine (Reuse)

- `demand_requests`, `matches`, `offers` aus Marketplace.
- Emergency-Routen und Urgency-Logik in `api/routes/emergency.js` und `api/services/emergencyStaffingService.js`.
- Notification-Dispatch ueber `notificationMatrix`.
- Audit-Hooks ueber `res.locals.audit`.

## Neu eingefuehrte Bausteine (Vertical Slice 1)

- Migration `070_emergency_partial_commitments.sql`
  - additive Felder in `demand_requests`:
    - `required_total_count`
    - `currently_committed_count`
    - `remaining_open_count`
    - `partial_fulfillment_allowed`
    - `overfill_allowed`
    - `latest_response_at`
    - `fulfilled_at`/`closed_at`/`cancelled_at`
  - neue Tabellen:
    - `emergency_provider_commitments`
    - `emergency_provider_commitment_events`
- Service `api/services/emergencyCommitmentService.js`
  - race-condition-sichere Commit-Logik (`FOR UPDATE` auf Demand)
  - Restbedarfs-Berechnung und statusbasierte Coverage-Updates
  - Event-Historie je Commitment
- API-Endpunkte:
  - `GET /api/emergency/:id/commitments`
  - `POST /api/emergency/:id/commitments`
  - `PATCH /api/emergency/commitments/:id`

## Status-/Mengenlogik

- Mengenmodell:
  - Bedarf gesamt (`required_total_count`)
  - zugesagt (`currently_committed_count`)
  - offen (`remaining_open_count`)
- Demand-Status:
  - `open` bei 0 Zusagen
  - `partially_covered` bei Teilzusage
  - `fulfilled` bei vollstaendiger Deckung
- Overfill wird serverseitig blockiert, sofern `overfill_allowed = false`.

## Berechtigung und Sicherheit

- Commit erstellen: nur Rolle `agency`.
- Commit lesen: Requester-Owner oder gematchte Agentur.
- Statusaenderung Commit: Supplier-Owner, Requester-Owner oder Admin.
- Keine Mengenlogik im Frontend; finale Wahrheit liegt serverseitig.

## UI-Integration (erste Stufe)

- `frontend/public/marketplace_demand_detail.html` zeigt:
  - Bedarf gesamt
  - zugesagte Menge
  - Restbedarf
  - Liste eingegangener Teilzusagen

## Naechste Ausbaustufe

- strukturierte Eingabemasken fuer Rollen/Standorte/Qualifikationen aus Stammdaten-Tabellen (statt Freitext).
- dedizierte Agentur-Detailseite fuer Commit-Aktionen.
- automatische Match-Lauf-Strategie mit `next_match_run_at` und Eskalations-Timern.
