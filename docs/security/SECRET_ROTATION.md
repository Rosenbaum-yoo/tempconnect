# SECRET_ROTATION — Pflichtanleitung vor Produktionsstart
> Erstellt: 2026-05-26 | Branch: release/enterprise-premium-market-ready
> Vollständige Rotation: docs/SECRET_ROTATION.md (Bestandsdoku)

---

## Wann rotieren?

**Vor dem ersten Pilotkunden PFLICHT** (P0.4 in PILOT_GO_LIVE_TODOS.md).

Faustregel: Alle Secrets, die jemals in einer `.env`-Datei auf einem Entwicklerrechner standen,
gelten als kompromittiert und müssen vor Produktionsbetrieb mit echten Kundendaten rotiert werden.

---

## Checkliste (in dieser Reihenfolge)

### Block A — ohne Datenbankeingriff (~5 Min)

```bash
# SESSION_SECRET generieren (mind. 64 Hex-Zeichen)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# STAFF_SESSION_SECRET generieren (separater Wert!)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# JWT_SECRET generieren
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# ADMIN_SECRET / PROMETHEUS_METRICS_SECRET generieren
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Neue Werte in `.env` eintragen, dann:
```bash
docker compose -f docker-compose.prod.yml restart api
curl http://localhost:3000/api/health  # → 200 OK
```

**Auswirkung:** Alle aktiven Sessions werden ungültig (User müssen sich neu einloggen).

### Block B — mit Datenbankeingriff, Wartungsfenster einplanen (~15 Min)

```bash
# Neues DB-Passwort generieren (mind. 32 Zeichen)
node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"

# Im laufenden Container: ALTER USER
docker exec -it tempconnect_db psql -U tempconnect -c \
  "ALTER USER tempconnect WITH PASSWORD 'NEUES_PW';"

# .env aktualisieren: POSTGRES_PASSWORD=NEUES_PW, DATABASE_URL entsprechend
# Dann neu starten:
docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d
curl http://localhost:3000/api/health  # → 200 OK
```

### Block C — externe API-Keys (wenn älter als 6 Monate)

- **Stripe:** Dashboard → Developers → API Keys → "Roll key" → in `.env` STRIPE_SECRET_KEY
- **Sentry:** Settings → Auth Tokens → neuen Token → in `.env` SENTRY_DSN

---

## Production-Start-Schutz (automatisch)

`api/config/envValidator.js` blockiert den Server-Start bei:
- `FEATURE_GATE_BYPASS=true` in `NODE_ENV=production` → **process.exit(1)**
- `SESSION_SECRET` kürzer als 32 Zeichen → **process.exit(1)**
- `SESSION_SECRET` enthält bekannten Platzhalter → **process.exit(1)**
- `JWT_SECRET` ist schwach → **process.exit(1)**

---

## Nachweis / Abnahme

Nach Rotation Verify-Ausgabe dokumentieren:
```
Rotiert am: ____-__-__ __:__
Durchgeführt von: _______________
Verify: curl .../api/health → 200 OK (Zeitstempel: ___)
Sessions ungültig seit: _______________
```

---

## Vollständige Rotation-Anleitung

Siehe: [docs/SECRET_ROTATION.md](../SECRET_ROTATION.md) — vollständige Anleitung mit allen Secrets.
