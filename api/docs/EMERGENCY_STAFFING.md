# Emergency Staffing / Notdienst — TempConnect

## Übersicht

Emergency Staffing ist der operative Modus für besonders dringende Personalbedarfe.
Es handelt sich nicht nur um ein "Urgent"-Badge, sondern um einen eigenständigen
Prozess: schneller, sichtbarer, priorisierter, kontrolliert und auditiert.

## Unified Urgency Model

TempConnect verwendet ein 5-stufiges Urgency-Modell, das systemweit konsistent ist:

| Level | Label | SLA (min) | Response-Window | Eskalation | Forced Email |
|-------|-------|-----------|-----------------|------------|-------------|
| NORMAL | Normal | 120 | — | Nein | Nein |
| HIGH | Hoch | 90 | 60 min | Nein | Nein |
| URGENT | Dringend | 60 | 30 min | Ja | Ja |
| CRITICAL | Kritisch | 45 | 20 min | Ja | Ja |
| NOTDIENST | Notdienst | 30 | 15 min | Ja | Ja |

### Normalisierung

`classifyUrgency()` normalisiert alle historischen Urgency-Werte:
- `notdienst`, `NOTDIENST` → NOTDIENST
- `critical`, `CRITICAL` → CRITICAL
- `urgent`, `URGENT` → URGENT
- `high`, `HIGH`, `plus`, `PLUS` → HIGH
- Alles andere → NORMAL

### Emergency-Definition

Levels URGENT, CRITICAL und NOTDIENST gelten als Emergency (`isEmergency() = true`).

## Eskalationsstufen

Emergency-Requests eskalieren automatisch oder manuell:

- **Stufe 0** — Erstellt, SLA läuft, Matching + Alerts ausgelöst
- **Stufe 1** — 10 Minuten ohne Antwort → automatische Eskalation
- **Stufe 2** — 20 Minuten ohne Antwort → zweite Eskalation
- **Stufe 3** — Maximum, manuelle Eskalation möglich

Automatische Eskalation über bestehende Cron-Jobs:
- `/internal/notdienst-escalate` — für requests
- `/internal/demand-notdienst-escalate` — für demand_requests

Manuelle Eskalation über `POST /api/emergency/:id/escalate`.

## Supplier Response Tracking

Wenn ein Supplier auf einen Emergency-Request reagiert:
1. `supplier_response_count` wird inkrementiert
2. `first_supplier_response_at` wird einmalig gesetzt (idempotent)
3. SLA-Event `SUPPLIER_RESPONSE` wird geloggt
4. Response-Time fließt in KPI-Berechnung ein

## Orchestrierung

Der `emergencyStaffingService.js` orchestriert bestehende Services — kein Duplikat-Code:

```
createEmergencyRequest()
  └→ marketplaceService.createDemandRequest()    — Demand erstellen
  └→ marketplaceService.recordDemandSlaStarted() — SLA starten
  └→ instantMatchService.instantMatchFromParams() — 10-Faktor Premium-Matching
  └→ notificationMatrix.dispatch()                — In-App + Email Alerts
  └→ marketplaceService.markDemandSlaMet()        — SLA prüfen
```

## API-Endpunkte

### POST /api/emergency/request
Erstellt einen Emergency Staffing Request.

**Zugriff:** Authentifiziert + `emergency_staffing` Feature (PLUS/PRO/ENTERPRISE) + company only

**Body:**
```json
{
  "title": "Dringend: 5 Lagerhelfer für Nachtschicht",
  "role": "Lagerhelfer",
  "skill_tags": ["gabelstapler", "nachtschicht"],
  "headcount": 5,
  "start_date": "2026-03-16",
  "location_city": "Berlin",
  "urgency": "notdienst",
  "budget_max": 25
}
```

**Response:**
```json
{
  "demand": { ... },
  "urgency_level": "NOTDIENST",
  "urgency_config": { "slaMinutes": 30, "responseWindow": 15, ... },
  "match_results": {
    "total": 12,
    "quality_summary": { "excellent": 3, "good": 5, "fair": 3, "weak": 1 },
    "top_matches": [{ "capacity_post_id": "...", "score": 87, "quality_label": "excellent" }]
  },
  "alerted": 8
}
```

### GET /api/emergency/active
Aktive Emergency-Requests mit Enrichment.

Query: `?all=1` für alle (sonst nur eigene)

### GET /api/emergency/dashboard
KPIs für Emergency-Operations.

```json
{
  "active": { "total": 3, "notdienst": 2, "urgent": 1, "escalated": 1, "sla_breached": 0 },
  "metrics_30d": {
    "total": 10, "response_rate": 80, "avg_response_minutes": 12,
    "sla_met_rate": 70, "fill_rate": 60, "sla_breach_rate": 20
  }
}
```

### POST /api/emergency/:id/respond
Supplier reagiert auf Emergency-Request.

**Zugriff:** agency only

### POST /api/emergency/:id/escalate
Manuelle Eskalation eines Emergency-Requests.

### GET /api/emergency/history
Vergangene Emergency-Requests mit Metriken.

Query: `?limit=50&offset=0&all=1`

### GET /api/emergency/config
Öffentliche Urgency-Konfiguration für Frontend.

## Plan-Gating

| Feature | FREE | BASIS | PLUS | PRO | ENTERPRISE |
|---------|------|-------|------|-----|-----------|
| Emergency Staffing | ❌ | ❌ | ✅ | ✅ | ✅ |
| Notdienst-Priority | ❌ | ❌ | ✅ | ✅ | ✅ |

## Notification-Events

| Event | Severity | Beschreibung |
|-------|----------|-------------|
| `emergency.request_created` | urgent | Neuer Emergency-Request an passende Supplier |
| `emergency.escalated` | urgent | Eskalation — erneute Benachrichtigung |

Beide Events erzwingen Email-Zustellung unabhängig von Notification-Preferences
(über `matchAlertService.getUserPreferences` — urgent/notdienst → `email: true`).

## Bestehende Integration

Emergency Staffing nutzt und erweitert bestehende Infrastruktur:

- **Matching**: `matchingEngine.js` Factor 9 (urgencyBoost) + `instantMatchService.js`
- **Alerts**: `matchAlertService.js` — severity='urgent', forced email, 🔴 Banner
- **SLA**: `slaService.js` + `marketplaceService.js` — Breach/Met/Events
- **Eskalation**: Bestehende Cron-Jobs für automatische Stufen-Eskalation
- **Audit**: Alle Emergency-Aktionen über `auditWriteMiddleware` geloggt
- **Notifications**: `notificationMatrix.js` — In-App + Email Dispatch
