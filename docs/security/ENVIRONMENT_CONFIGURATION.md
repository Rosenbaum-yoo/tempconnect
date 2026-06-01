# ENVIRONMENT_CONFIGURATION — Umgebungsvariablen-Referenz
> Erstellt: 2026-05-26 | Branch: release/enterprise-premium-market-ready
> Quelle der Wahrheit: api/config/envValidator.js + .env.example

---

## 1. Env-Dateien nach Umgebung

| Datei | Zweck | Committet? |
|---|---|---|
| `.env.example` | Vollständige Vorlage (Platzhalter) | ✅ Ja |
| `.env.dev.example` | Entwicklungs-Defaults | ✅ Ja |
| `.env.prod.example` | Produktions-Vorlage (Platzhalter) | ✅ Ja |
| `.env` | Echte Secrets (lokal/prod) | ❌ Nein (gitignored) |
| `.env.local` | Lokale Overrides | ❌ Nein (gitignored) |

**Regel:** Niemals echte `.env`-Dateien committen. Nur `*.example`-Dateien sind im Repo.

---

## 2. Pflicht-Variablen (Produktion)

| Variable | Pflicht | Schwach-Check | Beschreibung |
|---|---|---|---|
| `NODE_ENV` | ✅ | — | `development` \| `production` |
| `SESSION_SECRET` | ✅ | ≥32 Zeichen, kein Platzhalter | Session-Signing-Key |
| `DATABASE_URL` oder `POSTGRES_PASSWORD` | ✅ | — | DB-Verbindung |

## 3. Optionale Variablen mit Security-Impact

| Variable | Default | Produktions-Verhalten |
|---|---|---|
| `FEATURE_GATE_BYPASS` | `false` | `true` in Production → **Server-Start-Fehler** |
| `JWT_SECRET` | — | Wenn gesetzt: ≥32 Zeichen + kein Platzhalter |
| `PAYMENT_MODE` | `demo` | `live` → STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET Pflicht |
| `RATE_LIMIT_STORE` | — | `redis` → REDIS_URL Pflicht |

## 4. Production-Start-Regeln (automatisch durchgesetzt)

`api/config/envValidator.js` blockiert den Server-Start (process.exit(1)) bei:

```
✗ FEATURE_GATE_BYPASS=true bei NODE_ENV=production
✗ SESSION_SECRET < 32 Zeichen
✗ SESSION_SECRET enthält: changeme, secret, password, geheim, test, development,
  your-secret-here, enter-secret-here, HIER_SICHERES_PASSWORT, HIER_EINSETZEN
✗ JWT_SECRET (falls gesetzt) schwach oder Platzhalter
✗ STRIPE_SECRET_KEY fehlt bei PAYMENT_MODE=live
✗ STRIPE_WEBHOOK_SECRET fehlt bei PAYMENT_MODE=live
✗ REDIS_URL fehlt bei RATE_LIMIT_STORE=redis
✗ Weder DATABASE_URL noch POSTGRES_PASSWORD gesetzt
```

## 5. Staff Control Center (separate Session)

| Variable | Beschreibung |
|---|---|
| `STAFF_SESSION_SECRET` | Separater Session-Key für Staff CC (mind. 64 Zeichen) |
| `STAFF_USER_IDS` | Kommagetrennte UUIDs der Staff-User (Elmira + Mitarbeiter) |
| `HETZNER_CLOUD_TOKEN` | Optional: Live-Infra-GUI im SCC |

## 6. OCC (Owner Control Center)

OCC nutzt die gleiche API-Session. Keine separaten Session-Variablen.
Zugang via `user_owner_control_access`-Tabelle (DB-basiert).

## 7. Monitoring

| Variable | Beschreibung |
|---|---|
| `PROMETHEUS_METRICS_SECRET` | Authentifiziert `/metrics`-Endpunkt. Pflicht in Prod. |
| `SENTRY_DSN` | Error Tracking. Optional, aber empfohlen. |
| `LOG_LEVEL` | Default: `info`. Prod: `warn` oder `error` |

## 8. Schnellstart (Neue Umgebung)

```bash
# 1. Vorlage kopieren
cp .env.example .env

# 2. Alle Platzhalter ersetzen (suche nach HIER_)
grep -n "HIER_" .env

# 3. Starke Secrets generieren
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. Validierung testen
NODE_ENV=production node -e "
  import('./api/config/envValidator.js').then(m => {
    try { m.validateEnv(); console.log('OK'); }
    catch(e) { console.error(e.message); process.exit(1); }
  })
"
```

## 9. Notfall-Checkliste (Suspected Breach)

1. Sofort: Alle Sessions invalidieren → `SESSION_SECRET` rotieren + Server-Restart
2. Alle anderen Secrets rotieren (Reihenfolge: Block A → B → C in `SECRET_ROTATION.md`)
3. DB-Zugriff prüfen (Logs, aktive Verbindungen)
4. Audit-Log auf suspicious-Events prüfen (`api/services/auditLog.js`)
5. Vorfall in Incident-Log dokumentieren
