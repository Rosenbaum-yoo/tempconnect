# Model B – Live Capacity Feed (Implementierungs-Doku)

Kurzdokumentation zu dem, was umgesetzt wurde: **Live-Kapazitäts-Feed pro Agentur**, Suche über Capacities (nicht Listings), erweiterte Anfragen mit Reservierung (30 min TTL), Accept reduziert Kapazität, Deal = Request FINALIZED.

**Enthalten:** Empfehlungen für den Betrieb und **Hinweise für KI / weitere Entwicklung** (was beibehalten werden soll, wo was im Code steht, wie erweitern). Ausführliche Architektur und API-Shapes: **`MODEL-B-LIVE-CAPACITY-FEED.md`**.

---

## Was ist Model B?

- **Capacities** sind die primäre „Buchungsquelle“: Agenturen legen Kapazitäten an (Rolle, Region, ab wann, wie viele Köpfe, optional Tags/Stundensatz).
- **Suche** läuft über **GET /api/capacities** (nicht über Listings). Verfügbarkeit = `available_workers` minus aktive Reservierungen (`available_effective`).
- **Anfragen** können sich auf eine Capacity beziehen (`capacity_id`) und enthalten alle Infos für Accept/Decline ohne Rückfragen: Rolle, Menge, Ort, Zeitraum, Schicht, Qualifikationen, Dringlichkeit usw.
- **Reservierung** (30 min TTL) hält Kapazität kurz fest; **Accept** reduziert `available_workers` dauerhaft (Option A). Abgelaufene Reservierungen werden per Cron auf `expired` gesetzt.
- **Deal** = Request mit Status FINALIZED (Phase 1); Schema ist so vorbereitet, dass später eine Tabelle `deals` ergänzt werden kann (`requests.deal_id`).

---

## Schema (Kurz)

| Tabelle | Zweck |
|--------|--------|
| **capacities** | Pro Agentur: `agency_id`, `role`, `region`, `available_from`, `available_workers`, `tags`, `hourly_rate_cents`, `note`, `is_active`. |
| **capacity_reservations** | Pro Reservierung: `capacity_id`, `request_id`, `quantity`, `expires_at` (30 min), `status` (active \| converted \| expired). Nur `active` zählt für `available_effective`. |
| **requests** (erweitert) | Entweder `listing_id` **oder** `capacity_id` (DB-Check: genau eines gesetzt). Zusätzlich: `role`, `quantity`, `location_text`, `region`, `start_date`, `end_date`, `duration_days`, `shift_schedule`, `qualification_tags`, `required_certifications`, `max_hourly_rate_cents`, `urgency`, `notes`, `deal_id` (Phase 2). |

Migration: **`sql/migrations/009_model_b_capacities.sql`**.

---

## API-Endpunkte (Überblick)

| Methode | Pfad | Beschreibung |
|--------|------|--------------|
| GET | /api/capacities | Suche (Filter: region, role, available_from, available_min, tags, max_rate_cents, page, limit). Liefert `available_effective`. |
| GET | /api/capacities/:id | Eine Capacity (404 wenn inaktiv und nicht Owner). |
| POST | /api/capacities | Capacity anlegen (nur Agency). |
| PATCH | /api/capacities/:id | Capacity ändern/deaktivieren (nur Owner). |
| POST | /api/capacities/:capacityId/reserve | Reservierung anlegen (quantity, optional request_id). 409 bei zu wenig Kapazität. |
| POST | /api/requests | **Mit capacity_id:** Request inkl. Reserve erstellen (Body: capacity_id, role, quantity, location_text, region, start_date, end_date oder duration_days, shift_schedule, qualification_tags, …). **Mit listing_id:** wie bisher (Listing-Anfrage). |
| PATCH | /api/requests/:id/status | Status setzen. Bei capacity_id-Requests: ACCEPTED/DECLINED/FINALIZED/CANCELED laufen über Capacity-Logik (Reserve-Release, Reduktion bei Accept). |
| POST | /api/internal/expire-reservations | Ablauf-Job: Reservierungen mit `expires_at < NOW()` auf `expired` setzen. Header `X-Internal-Secret` = `INTERNAL_CRON_SECRET`. Optional Body: `batch_size`. |

Details zu Request/Response-Formaten: **`MODEL-B-LIVE-CAPACITY-FEED.md`** (Abschnitt 2).

---

## Ablauf (Kurz)

1. **Agentur** legt Capacity an (POST /api/capacities).
2. **Unternehmen** sucht (GET /api/capacities), erstellt Request mit `capacity_id` + allen Details (POST /api/requests) → dabei wird automatisch eine Reservierung (30 min) angelegt.
3. **Ablauf-Job** setzt abgelaufene Reservierungen auf `expired` (POST /api/internal/expire-reservations, z. B. alle 1–5 Min).
4. **Agentur** nimmt an (PATCH …/status → ACCEPTED): Reservierung → `converted`, `capacities.available_workers` wird um die Menge reduziert.
5. **Unternehmen** finalisiert (PATCH …/status → FINALIZED) = Deal; andere ACCEPTED-Requests derselben Capacity/ desselben Requesters werden auf FILLED gesetzt.

Bei **Decline/Cancel** wird die Reservierung auf `expired` gesetzt; `available_workers` bleibt unverändert (Reserve hat sie nie reduziert).

---

## Code-Übersicht

- **Migration:** `sql/migrations/009_model_b_capacities.sql` (Tabellen, Indizes, CHECK, neue Request-Spalten).
- **Service:** `api/services/capacityService.js` (Suche mit `available_effective`, Reserve, Accept, Release, Finalize, Expiry-Batch). Kein ORM, nur parameterisierte SQL und Transaktionen mit `SELECT FOR UPDATE`.
- **Routen:** In `api/server.js`: Capacities CRUD, Reserve, erweiterte POST /api/requests (capacity_id vs listing_id), PATCH /api/requests/:id/status mit Capacity-Branch, Expiry-Route. `/api/my/requests/sent` und `/received` mit LEFT JOIN listings/capacities.
- **Tests:** `api/test/capacities.test.js` (Unit + optionale Integration). Ausführung: `npm test` im Ordner `api`.

---

## Was du tun musst, damit es läuft

### 1. Migration ausführen (einmalig, Pflicht)

Ohne Migration fehlen die Tabellen `capacities` und `capacity_reservations` sowie die neuen Spalten in `requests` – die API würde mit DB-Fehlern reagieren.

- **Mit Docker:** Einmal den Migrations-Container laufen lassen, damit `009_model_b_capacities.sql` angewendet wird:
  ```bash
  docker compose run --rm migrate
  ```
  (Bei Managed DB ggf. `docker compose -f docker-compose.yml -f docker-compose.managed.yml run --rm migrate`.)
- **Ohne Docker:** `sql/migrate.sh` mit gesetzter `DATABASE_URL` bzw. `DB_HOST`/`POSTGRES_*` ausführen, oder die SQL-Datei `sql/migrations/009_model_b_capacities.sql` manuell mit `psql` ausführen.

Danach brauchst du **keine weiteren Code- oder Konfigurationsänderungen** – die API-Routen sind bereits aktiv.

### 2. Expiry-Job (empfohlen, optional)

Damit Reservierungen nach 30 Minuten automatisch ablaufen:

- In der **.env** (optional): `INTERNAL_CRON_SECRET=ein_geheimer_string`
- Einen Cron/Job einrichten, der alle 1–5 Minuten aufruft:
  ```http
  POST https://deine-api/api/internal/expire-reservations
  X-Internal-Secret: ein_geheimer_string
  ```
  Wenn `INTERNAL_CRON_SECRET` nicht gesetzt ist, wird der Header nicht geprüft (nur für Tests/Intern nutzen).

### 3. Frontend

Die **API** ist fertig. Es gibt eine **fertige UI** für Kapazitätssuche und Enterprise-Features (SLA, Compliance, Lieferanten-Bewertung):

- **URL:** Nach Login im Hauptmenü „Kapazität & SLA“ oder direkt `/public/enterprise.html`.
- **Seiten:** Kapazitätssuche (`/public/capacity_search.html`), Meine Anfragen, Eingang, Anfrage-Detail (SLA-Countdown, Compliance, Scorecard), Lieferanten-Bewertung (`/public/supplier_scorecard.html`).
- **Dokumentation:** `docs/ENTERPRISE-UI-DELIVERABLES.md` (Dateiliste, API-Aufrufe pro Seite, 2+2 Testschritte).

Technisch: Suche über GET `/api/capacities`, Request-Formular mit `capacity_id` und Pflichtfeldern (u. a. `end_date` oder `duration_days`), Anzeige von SLA-Countdown und Accept/Decline wie in der Doku beschrieben.

---

## Weitere Betriebsinfos

- **Reservation-TTL:** 30 Minuten (Konstante in `capacityService.js`: `RESERVATION_TTL_MINUTES`).
- **Expiry-Cron:** Siehe Abschnitt 2 oben.

---

## Empfehlungen

- **Expiry-Job immer betreiben:** Ohne Cron laufen Reservierungen nie ab – Kapazität bleibt blockiert. Empfohlen: alle 1–5 Min aufrufen, z. B. mit `INTERNAL_CRON_SECRET` in .env und Cron/Worker.
- **Option A beibehalten:** Reserve ändert **nicht** `available_workers`, nur Accept reduziert. Diese Semantik nicht umstellen, ohne Architektur-Doku und Tests anzupassen.
- **Neue Capacity-Logik im Service:** Alle Kapazitäts- und Reservierungslogik in `api/services/capacityService.js` halten; in `server.js` nur Validierung und Aufruf des Services. So bleiben Transaktionen und `SELECT FOR UPDATE` an einer Stelle.
- **Keine doppelte Wahrheit:** `available_effective` nur aus `available_workers` und aktiven Reservierungen berechnen (nur `status = 'active'`); keine zusätzliche Spalte „reserved“ auf `capacities` pflegen.
- **Tests nach Änderungen:** Nach Änderungen an Reserve/Accept/Expiry `npm test` im Ordner `api` ausführen; Integrationstests brauchen eine laufende DB (z. B. mit Docker).

---

## Hinweise für KI / weitere Entwicklung

*(Dieses Projekt wird stark mit KI-Unterstützung weiterentwickelt. Die folgenden Punkte sollen KI und Menschen gleichermaßen Orientierung geben.)*

### Beim Erweitern oder Ändern

1. **Doku zuerst lesen:** Vor Änderungen an Capacities, Reservierungen oder Request-Flow diese Doku und `MODEL-B-LIVE-CAPACITY-FEED.md` lesen. Die Semantik (Option A, available_effective nur aus active, CHECK capacity_id/listing_id) ist bewusst so gewählt.
2. **Schema-Änderungen:** Neue Spalten/Tabellen nur per **Migration** in `sql/migrations/` anlegen (z. B. `010_...sql`). Init-Skript nicht für Model-B-Tabellen ändern. CHECK `requests_capacity_listing_xor` nicht entfernen.
3. **Neue Endpunkte:** Capacities/Reservations weiter in `server.js` anbinden, Logik in `capacityService.js`. Validierung mit Zod wie bei bestehenden Schemas (capacitySchema, requestCapacitySchema).
4. **Frontend:** Wenn KI das Frontend erweitert: Suche über GET `/api/capacities` (nicht Listings für Capacity-Flow). Request-Formular muss `capacity_id` plus alle Felder aus dem API-Dokument senden; `end_date` oder `duration_days` ist Pflicht. Antwort kann `reservation` mit `expires_at` enthalten – im UI z. B. Countdown anzeigen.
5. **Deals-Tabelle (Phase 2):** Wenn später eine `deals`-Tabelle kommt: Zeile bei FINALIZED anlegen, `requests.deal_id` setzen. API kann weiter den Request mit Status FINALIZED zurückgeben; optional `deal_id` in der Response ergänzen. Keine Breaking Changes für bestehende Clients nötig.
6. **Ratings:** `GET /api/ratings/pending` baut aktuell auf `JOIN listings`. Capacity-basierte Deals erscheinen dort nicht. Bei Erweiterung: LEFT JOIN listings/capacities und Anzeige für beide Request-Typen (listing_id vs capacity_id) berücksichtigen.
7. **Sprache:** Kommentare und Logs im Code auf Deutsch oder Englisch konsistent halten; Doku wie gewünscht (hier: Deutsch).

### Was nicht geändert werden sollte (ohne Abstimmung)

- Semantik „Reserve ändert nicht available_workers, nur Accept reduziert“.
- Berechnung von `available_effective` nur aus Reservierungen mit `status = 'active'`.
- DB-Constraint: genau eines von `capacity_id` und `listing_id` pro Request.
- Transaktionen mit `SELECT FOR UPDATE` auf der Capacity-Zeile bei Reserve und Accept.

### Nützliche Stellen im Code

| Was | Wo |
|-----|-----|
| Capacities-Suche, Reserve, Accept, Finalize, Expiry | `api/services/capacityService.js` |
| Routen GET/POST/PATCH /api/capacities, reserve, expire | `api/server.js` (Suche nach "CAPACITIES" oder "expire-reservations") |
| POST /api/requests mit capacity_id | `api/server.js` (Suche nach "capacity_id") |
| PATCH Status für capacity-Requests | `api/server.js` (Suche nach "capacity_id" im PATCH-Handler) |
| Migration Tabellen/Spalten | `sql/migrations/009_model_b_capacities.sql` |
| Tests | `api/test/capacities.test.js` |

---

## Weitere Doku

- **Architektur, Transaktionen, Sicherheit:** `docs/MODEL-B-LIVE-CAPACITY-FEED.md`
- **Erster Plan (vor Capacity-Feed):** `docs/MODEL-B-ARCHITECTURE-PROPOSAL.md`
- **Enterprise – Einstieg für KI/Menschen (was wurde gebaut, wo liegt was):** `docs/ENTERPRISE-FEATURES-FOR-KI.md`
- **Enterprise-UI (Kapazitätssuche, SLA, Compliance, Scorecard):** `docs/ENTERPRISE-UI-DELIVERABLES.md`
- **Enterprise-Backend (SLA-Breach, Metriken, Verifikation):** `docs/ENTERPRISE-SALES-STORY-VERIFICATION.md`
- **Sichere Konfiguration, Schlüssel-Rotation:** `docs/SECURITY-CONFIG.md`
- **Verifikation (keine Secrets im Repo):** `docs/SECURITY-VERIFICATION.md`
