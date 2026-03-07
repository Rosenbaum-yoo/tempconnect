# TempConnect – Enterprise Hardening Scan Report (Phase 0)

**Datum:** Scan vor Implementierung.  
**Regel:** Keine Endpoint-Pfade oder Response-Shapes ändern; kein ORM; Raw SQL beibehalten; deutsche Kommentare beibehalten.

---

## A) Scan Summary (Ist-Zustand)

### 1) api/server.js – Route-Logik?
**Nein.** `server.js` enthält nur Einstieg: `createApp()` aus `app.js`, dann `app.listen()`. Keine Routen-Logik.

### 2) SQL in Routen?
**Ja, an wenigen Stellen:**
- **api/routes/capacities.js:** Zwei `pool.query`-Aufrufe (Zeilen ~100, ~107): Request-Lookup und Prüfung aktive Reservierung vor `capacityService.reserve`. Sollte in Service ausgelagert werden.
- **api/routes/internal.js:** Ein `pool.query` im Handler `cleanup-idempotency` (DELETE abgelaufene Idempotency-Keys). Sollte in Service (z. B. `idempotencyService` oder in bestehenden Service) ausgelagert werden.
- **api/routes/health.js:** `pool.query("SELECT 1")` und Abfrage `_migrations` für Health-/Admin-Status. Akzeptabel für Health; optional in Service auslagern für Konsistenz.

### 3) Idempotency – aktuelle Implementierung
- **Scope:** Pro User. Middleware nutzt `scope = req.session?.userId ?? ""` (String); Lookup `WHERE scope = $1 AND key = $2 AND expires_at > NOW()`.
- **Constraints:** Migration 010 legt `idempotency_keys` an (key PRIMARY KEY); Migration 012 fügt hinzu: `scope`, `request_hash`, `expires_at`, entfernt alte PK, setzt **UNIQUE(scope, key)**. Damit ist Idempotency pro (user_id/scope, key) getrennt.
- **TTL/Expiry:** `expires_at` Default `NOW() + 24 hours` (Migration 012); Middleware fragt nur Zeilen mit `expires_at > NOW()` ab. Cleanup-Endpoint `POST /api/internal/cleanup-idempotency` löscht abgelaufene Zeilen.

### 4) audit_log – vorhanden und append-only?
**Ja.** Tabelle in Migration 010; nur `INSERT` in `api/services/auditLog.js`. Kommentar: "Append-only. Do not UPDATE or DELETE."

### 5) Events-Tabelle?
**Keine generische `events`-Tabelle.** Es gibt `sla_events` (Migration 011) für SLA-Ereignisse. Kein weiterer Bedarf für diese Hardening-Phase.

### 6) docker-compose – Redis?
**Ja.** Service `redis` ist definiert (image redis:7-alpine, healthcheck). API nutzt `REDIS_URL` (Default `redis://redis:6379`) und `RATE_LIMIT_STORE=redis`.

### 7) .env – echte Secrets im Repo?
**.env** ist in `.gitignore` (sowie `.env.local`, `.env.prod`, etc.). Es existieren `.env.example`, `.env.prod.example`, `.env.dev.example` mit Platzhaltern. **In getrackten Dateien wurden keine echten API-Keys geprüft** (kein Lesen von .env); Konfiguration lädt Werte aus Umgebung.

---

## B) Bestätigte erforderliche Fixes (vor Implementierung)

| Phase | Fix | Priorität |
|-------|-----|------------|
| **1** | Config-Validierung: Bei fehlenden/Platzhalter-Werten für erforderliche Env-Vars (inkl. INTERNAL_CRON_SECRET in Prod) → Fail-fast beim Start. | Kritisch |
| **1** | README: Abschnitt "Secret Rotation Guide" inkl. SendGrid-Rotation. | Kritisch |
| **1** | Sicherstellen, dass keine echten Secrets in Repo-Dateien stehen (nur .env.example mit Platzhaltern). | Prüfung |
| **2** | Idempotency: Bereits Enterprise-tauglich (scope, TTL, Cleanup). Nur prüfen: gleicher User + gleicher Key = Replay; anderer User + gleicher Key ≠ Replay; abgelaufener Key = neu. Tests vorhanden. | Verifizierung |
| **3** | State Machine: Bereits eingebaut (assertTransition, logTransition, 409 bei TransitionError). Alle Status-Änderungen laufen über Services/Routen mit assertTransition; audit_log wird beschrieben. | Verifizierung |
| **4** | Logging: `console.error` in `api/db/pool.js` durch `logger.error` ersetzen; keine Debug-`console.log` in App-Code (list-routes.js darf für CLI-Ausgabe bleiben). | Mittel |
| **5** | SQL aus Routen: Die 2 Queries in capacities.js und die Cleanup-Query in internal.js in Services auslagern; Routen rufen nur Services auf. | Mittel |
| **6** | Redis: Bereits in docker-compose; Rate-Limiter nutzt Redis wenn RATE_LIMIT_STORE=redis. Keine Änderung nötig. | OK |
| **7** | Garantien: Schreib-Endpoints haben Idempotency-Middleware (global in app.js); interne Endpoints prüfen X-Internal-Secret (aber aktuell optional wenn Secret leer). In Produktion INTERNAL_CRON_SECRET erforderlich machen. | Kritisch |

---

## C) Nicht erforderlich / bereits erledigt

- **Neue Idempotency-Migration:** Schema ist bereits per-user, mit expires_at und Cleanup. Keine neue Migration nötig, sofern kein explizites `id uuid`-Feld gewünscht wird.
- **State-Machine neu erstellen:** `api/services/stateMachine.js` existiert; REQUEST, OFFER, RESERVATION; assertTransition + logTransition; 409 mit entityType/from/to.
- **Refactor server.js:** Bereits modular (app.js, routes/*, services/*, middleware/*).

---

---

## D) Durchgeführte Fixes (nach Scan)

| Phase | Fix | Status |
|-------|-----|--------|
| **1** | Config: `INTERNAL_CRON_SECRET` in Produktion erforderlich (fail-fast). | Erledigt |
| **1** | README: Abschnitt „Secret Rotation Guide“ inkl. SendGrid-Rotation. | Erledigt |
| **4** | `api/db/pool.js`: `console.error` durch `logger.fatal` ersetzt. | Erledigt |
| **5** | SQL aus Routen in Services: `requestService.getRequestForReserve`, `hasActiveReservationForRequest`; `idempotencyService.cleanupExpired`; `healthService.pingDb`, `getMigrations`. Routen `capacities.js`, `internal.js`, `health.js` ohne direkte `pool.query`. | Erledigt |
| **7** | Interne Endpoints: In Produktion ist `INTERNAL_CRON_SECRET` gesetzt (Start bricht sonst ab). | Erledigt |

---

## E) Keine neuen Migrationen

Idempotency-Schema (010 + 012) und audit_log (010) bleiben unverändert. Keine weiteren SQL-Migrationen für dieses Hardening.

---

## F) Geänderte/neue Backend-Dateien

- **Geändert:** `api/config/index.js` (runProductionValidation: INTERNAL_CRON_SECRET)
- **Geändert:** `api/db/pool.js` (logger statt console.error)
- **Geändert:** `api/routes/capacities.js` (requestService statt pool.query)
- **Geändert:** `api/routes/internal.js` (idempotencyService.cleanupExpired)
- **Geändert:** `api/routes/health.js` (healthService.pingDb, getMigrations)
- **Geändert:** `api/services/requestService.js` (getRequestForReserve, hasActiveReservationForRequest)
- **Neu:** `api/services/idempotencyService.js` (cleanupExpired)
- **Neu:** `api/services/healthService.js` (pingDb, getMigrations)
- **Geändert:** `README.md` (Secret Rotation Guide, INTERNAL_CRON_SECRET in Konfiguration)

---

## G) Verifikation

1. **API neu starten:** `docker compose restart api` (oder `docker compose up -d --build`)
2. **Health:** `GET /api/health` → 200, `{ "ok": true, "service": "api" }`
3. **Routen:** `npm run list-routes` im Ordner `api/` ausführen – alle Endpoints unverändert
4. **Idempotency (Replay):** Gleicher User + gleicher Idempotency-Key → zweiter Request liefert gespeicherte Antwort
5. **Ungültige Transition:** `PATCH /api/requests/:id/status` mit z. B. von SENT nach FINALIZED → 409 mit `invalid_transition`, `entityType`, `from`, `to`
6. **Produktion:** Mit `NODE_ENV=production` und fehlendem `INTERNAL_CRON_SECRET` muss die API mit Fehler beenden

**Beispiel-curl Idempotency-Replay (nach Login, Session-Cookie setzen):**
```bash
# Erster Request mit Idempotency-Key
curl -s -X POST -b cookies.txt -H "Content-Type: application/json" -H "Idempotency-Key: my-unique-key-123" \
  -H "X-CSRF-Token: TOKEN" -d '{"listing_id":"LISTING_UUID","message":"Test"}' \
  http://localhost:8080/api/requests
# Zweiter Request mit gleichem Key → gleiche Antwort (Replay)
curl -s -X POST -b cookies.txt -H "Content-Type: application/json" -H "Idempotency-Key: my-unique-key-123" \
  -H "X-CSRF-Token: TOKEN" -d '{"listing_id":"LISTING_UUID","message":"Test"}' \
  http://localhost:8080/api/requests
```

**Beispiel-curl ungültige Transition (409):**
```bash
# PATCH Status von SENT auf FINALIZED (nicht erlaubt) → 409
curl -s -X PATCH -b cookies.txt -H "Content-Type: application/json" -H "X-CSRF-Token: TOKEN" \
  -d '{"status":"FINALIZED"}' http://localhost:8080/api/requests/REQUEST_UUID/status
# Erwartung: {"error":"invalid_transition","entityType":"REQUEST","from":"SENT","to":"FINALIZED"}
```
