# Sichere Konfiguration und Schlüssel-Rotation

## SendGrid-API-Key sofort rotieren

**Falls der SendGrid-API-Key jemals in einer getrackten Datei stand oder unsicher geteilt wurde: Sofort rotieren.**

1. SendGrid Dashboard → **Settings** → **API Keys** → alten Key löschen/deaktivieren
2. **Create API Key** (gleiche Berechtigungen, z. B. Mail Send)
3. Neuen Key **nur in der lokalen .env** eintragen (nicht committen, nicht in Doku)
4. App/Server neu starten

.env steht in .gitignore und wird nie ins Repo oder Deploy-Paket übernommen.

---

## How to rotate keys (Kurzüberblick)

| Secret | Rotation |
|--------|----------|
| **SESSION_SECRET / JWT_SECRET** | `openssl rand -hex 32` → in .env; API neu starten. Sessions werden ungültig. |
| **SendGrid (SMTP_PASS)** | Neuen API-Key in SendGrid erstellen, alten löschen; SMTP_PASS in .env setzen; API neu starten. |
| **Stripe** | Neue Keys im Stripe Dashboard; STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (und ggf. Publishable) in .env; Webhook-Signing-Secret in Stripe eintragen; API neu starten. |
| **INTERNAL_CRON_SECRET** | Neuen Wert (z. B. `openssl rand -hex 32`) in .env; alle Cron-Aufrufer (Header X-Internal-Secret) auf neuen Wert umstellen; API neu starten. |
| **ADMIN_SECRET** | Neuen Wert in .env; API neu starten; Monitoring/Status-Caller anpassen. |
| **Datenbank (POSTGRES_PASSWORD / DATABASE_URL)** | Passwort in DB ändern; .env anpassen; API und Migrate neu starten. |

---

## Production Fail-Fast Validation

In Produktion (`NODE_ENV=production`) verweigert die API den Start, wenn eines dieser Secrets fehlt oder wie ein Platzhalter aussieht:

1. **SESSION_SECRET** – darf nicht `dev_secret_change_me`, leer oder Platzhalter (`HIER_`, `DEIN_`, `PLACEHOLDER`, `xxxxxxxx`) sein
2. **JWT_SECRET** – darf nicht leer oder Platzhalter sein
3. **INTERNAL_CRON_SECRET** – Pflicht für Cron-Endpunkte (`/api/internal/*`)
4. **ADMIN_SECRET** – Pflicht für Status-Endpoint (`/api/health/status`)

Implementiert in `api/config/index.js` → `runProductionValidation()`. Wird beim App-Start aufgerufen.

**Regeln:** Keine echten Keys in Code oder Doku. Nur Platzhalter in .env.example. .env nie committen; Secrets nur per Umgebung/env_file zur Laufzeit.
