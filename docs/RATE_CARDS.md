# Rate Card Management

> VMS-Kernmodul zur Steuerung verbindlicher Stundensätze pro Rolle, Region und Vendor.

## Fachkonzept

Rate Cards definieren die **Soll-Stundensätze** (Target / Max / Min) für eine bestimmte Kombination aus:

- **Rolle** (`role_category`) — z. B. „Schweißer", „Pflege", „IT-Support"
- **Region / Standort** — optional: Bundesland, Stadt oder konkreter `org_locations`-Eintrag
- **Vendor** (`supplier_org_id`) — optional: Agentur-spezifischer Satz, sonst Wildcard (alle Agenturen)

### Lifecycle

```
draft → active → expired (automatisch bei valid_to < heute)
                → archived (manuell)
```

- **Draft**: Entwurf, nicht in Lookups berücksichtigt.
- **Active**: Verbindlich, wird für Compliance-Checks herangezogen.
- **Expired**: Automatisch durch `expireBatch()` Cron-Job gesetzt.
- **Archived**: Manuell deaktiviert, Historie bleibt erhalten.

## Spezifitäts-Lookup

`findApplicableRateCard()` findet die **spezifischste** aktive Rate Card für einen gegebenen Kontext. Die Priorität (höchste → niedrigste):

| Prio | Vendor | Geo-Ebene |
|------|--------|-----------|
| 1 | Vendor-spezifisch | Standort-spezifisch |
| 2 | Vendor-spezifisch | Region-Match |
| 3 | Vendor-spezifisch | Global (kein Geo) |
| 4 | Wildcard (alle) | Standort-spezifisch |
| 5 | Wildcard (alle) | Region-Match |
| 6 | Wildcard (alle) | Global |

**Beispiel**: Anfrage für „Schweißer" bei Agentur X in München:
1. Gibt es eine Card für Agentur X + Standort München → Treffer!
2. Falls nicht: Agentur X + Region Bayern?
3. Falls nicht: Agentur X + Global?
4. Falls nicht: Alle Agenturen + Standort München?
5. ... usw. bis Global-Fallback.

## Compliance-Klassifikation

`checkRateCompliance()` vergleicht einen **Ist-Satz** mit der gefundenen Rate Card:

| Status | Bedingung | Bedeutung |
|--------|-----------|-----------|
| `compliant` | Ist ≤ Target | Im Budget |
| `warning` | Ist > Target UND Ist ≤ Max | Toleranzbereich |
| `non_compliant` | Ist > Max | Budget überschritten |
| `no_card` | Keine Card gefunden | Kein Soll definiert |

Zusätzlich berechnet:
- **deviation_cents**: Ist − Target (negativ = unter Budget)
- **deviation_pct**: Abweichung in Prozent vom Target

Compliance-Checks werden optional in `rate_card_checks` persistiert (mit Entity-Referenz auf z. B. Timesheet).

## Datenmodell

### `rate_cards`

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | UUID PK | |
| org_id | UUID FK | Mandant |
| supplier_org_id | UUID FK nullable | Agentur (NULL = Wildcard) |
| contract_id | UUID FK nullable | Optionaler Rahmenvertrag |
| role_category | VARCHAR(200) | Rollenkategorie |
| region | VARCHAR(200) nullable | Region / Bundesland |
| location_id | UUID FK nullable | Konkreter Standort |
| department_id | UUID FK nullable | Abteilung |
| min_rate_cents | INT nullable | Mindest-Satz in Cent |
| target_rate_cents | INT NOT NULL | Ziel-Satz in Cent |
| max_rate_cents | INT NOT NULL | Max-Satz in Cent |
| currency | CHAR(3) DEFAULT 'EUR' | |
| overtime_surcharge_pct | NUMERIC(5,2) DEFAULT 25.00 | ÜZ-Zuschlag |
| emergency_surcharge_pct | NUMERIC(5,2) DEFAULT 0.00 | Notfall-Zuschlag |
| status | ENUM draft/active/expired/archived | |
| valid_from | DATE NOT NULL | Gültig ab |
| valid_to | DATE nullable | Gültig bis (NULL = unbefristet) |
| notes | TEXT nullable | Interne Notiz |
| created_by / updated_by | UUID nullable | Audit |

**Constraints**:
- `max_rate_cents >= target_rate_cents`
- `min_rate_cents <= target_rate_cents` (wenn gesetzt)
- UNIQUE auf `(org_id, supplier_org_id, role_category, region, location_id, status)` für `active` Cards

### `rate_card_checks`

Persistierte Compliance-Prüfungen mit Referenz auf Entity (z. B. Timesheet, Rechnung).

## API-Referenz

Alle Endpunkte unter `/api/rate-cards`. Feature-Gate: `rate_card_management` (PRO / ENTERPRISE).

| Methode | Pfad | Berechtigung | Beschreibung |
|---------|------|-------------|-------------|
| POST | `/` | `rate_card.create` | Neue Rate Card erstellen |
| PATCH | `/:id` | `rate_card.update` | Rate Card bearbeiten |
| GET | `/:id` | `rate_card.read` | Einzelne Card abrufen |
| GET | `/` | `rate_card.read` | Cards auflisten (Filter: status, compliance_status, role_category, region, supplier, date_from/date_to) |
| POST | `/:id/activate` | `rate_card.update` | Draft → Active |
| POST | `/:id/archive` | `rate_card.update` | Active/Draft → Archived |
| POST | `/check` | `rate_card.read` | Compliance-Check durchführen |
| GET | `/stats` | `rate_card.read` | Dashboard-KPIs |

### Query-Parameter (GET `/`)

- `status` — draft, active, expired, archived
- `compliance_status` — `warning`, `non_compliant`, `compliant` oder `at_risk` (jeweils auf Basis der letzten 30 Tage `rate_card_checks`)
- `role_category` — ILIKE-Suche
- `region` — ILIKE-Suche
- `supplier_org_id` — UUID
- `date_from`, `date_to` — optionales Gültigkeitsfenster; es werden nur Cards geliefert, deren `valid_from`/`valid_to` das angefragte Zeitfenster überlappt
- `limit` (max 500), `offset`

### Query-Parameter (GET `/stats`)

- identische Scope-Filter wie bei `GET /`
- KPI- und Compliance-Werte werden im selben Filterkontext berechnet wie die Liste

### Executive-Drilldown `active_rate_cards`

Die Executive-KPI `active_rate_cards` verlinkt nicht mehr auf die generische Rate-Card-Ansicht, sondern auf einen expliziten Drilldown:

`/public/rate-cards.html?status_group=window_overlap_30d&status=active&date_from=<window.date_from>&date_to=<window.date_to>`

Semantik:

- Es werden nur **aktive** Rate Cards gezeigt.
- Zusätzlich müssen deren Gültigkeitsintervalle das Dashboard-Zeitfenster überlappen.
- Die Seite zeigt dafür einen sichtbaren Kontext-Hinweis, hält den Status intern auf `active` fixiert und lädt Liste sowie KPI-Kacheln/Compliance-Stats im selben Filterkontext.

### POST `/check` Body

```json
{
  "role": "Schweißer",
  "actual_rate_cents": 4200,
  "supplier_org_id": "uuid (optional)",
  "region": "Bayern (optional)",
  "location_id": "uuid (optional)"
}
```

**Response**:
```json
{
  "compliance_status": "warning",
  "rate_card_id": "uuid",
  "actual_rate_cents": 4200,
  "target_rate_cents": 3500,
  "max_rate_cents": 4500,
  "deviation_cents": 700,
  "deviation_pct": 20.0
}
```

## Integration

### Spend Analytics
Rate Cards fließen in die Spend-Analyse ein: Ist-Kosten (Timesheets) werden gegen Soll-Sätze verglichen, um Budget-Abweichungen auf Aggregat-Ebene darzustellen.

### Smart Pricing (Zukunft)
Geplante Erweiterung: KI-basierte Satz-Empfehlungen auf Basis historischer Compliance-Daten und Marktdaten.

## Frontend

`/public/rate-cards.html` — Enterprise Dark Theme mit:
- KPI-Kacheln (Gesamt, Aktiv, Entwurf, Abgelaufen, Rollen, Vendor-spezifisch)
- Filterleiste (Status, Compliance 30 Tage, Rolle, Region, Lieferant)
- Tabelle mit Status-Badges und Aktions-Buttons (Aktivieren, Archivieren)
- Compliance-Übersicht (30 Tage)
- Modal für Erstellen/Bearbeiten
- Executive-Drilldown-Modus für `active_rate_cards` mit sichtbarem Zeitfenster-Kontext und gefilterten KPI-Kacheln

## Tests

```bash
node --test --test-force-exit api/test/rateCardService.test.js
```

32 Tests: CRUD, Lifecycle, Spezifitäts-Lookup, Compliance-Klassifikation, Batch-Expiry, Dashboard-Stats.
