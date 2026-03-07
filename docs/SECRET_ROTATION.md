# TempConnect – Secret Rotation Guide

**Annahme:** Die .env-Datei wurde kompromittiert. Alle Secrets muessen rotiert werden.

---

## 1. Database Password (POSTGRES_PASSWORD / DATABASE_URL)

```bash
# 1. Neues Passwort generieren
openssl rand -base64 32

# 2. Bei Hetzner Managed DB: Passwort im Hetzner Cloud Panel aendern
#    Bei lokalem Docker: docker exec tempconnect_db psql -U tempconnect -c "ALTER USER tempconnect PASSWORD 'NEUES_PASSWORT';"

# 3. .env aktualisieren:
#    POSTGRES_PASSWORD=NEUES_PASSWORT
#    DATABASE_URL=postgres://tempconnect:NEUES_PASSWORT@db:5432/tempconnect

# 4. API neu starten
docker compose -f docker-compose.prod.yml restart api
```

**Downtime:** ~5 Sekunden (API-Restart)

---

## 2. Session Secret (SESSION_SECRET)

```bash
# 1. Neues Secret generieren
openssl rand -hex 64

# 2. .env aktualisieren:
#    SESSION_SECRET=NEUES_SECRET

# 3. API neu starten
docker compose -f docker-compose.prod.yml restart api
```

**Auswirkung:** Alle bestehenden User-Sessions werden ungueltig. User muessen sich neu einloggen.

---

## 3. JWT Secret (JWT_SECRET)

```bash
# 1. Neues Secret generieren
openssl rand -hex 64

# 2. .env aktualisieren:
#    JWT_SECRET=NEUES_SECRET

# 3. API neu starten
docker compose -f docker-compose.prod.yml restart api
```

**Auswirkung:** Alle ausgestellten JWTs werden ungueltig.

---

## 4. Stripe Keys (STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET)

```bash
# 1. Stripe Dashboard: https://dashboard.stripe.com/apikeys
#    "Roll key" fuer Secret Key klicken
#    Neuen Webhook-Secret unter Webhooks erstellen

# 2. .env aktualisieren:
#    STRIPE_SECRET_KEY=sk_live_NEUER_KEY
#    STRIPE_PUBLISHABLE_KEY=pk_live_NEUER_KEY
#    STRIPE_WEBHOOK_SECRET=whsec_NEUER_SECRET

# 3. API neu starten
docker compose -f docker-compose.prod.yml restart api
```

**Wichtig:** Stripe erlaubt parallelen Betrieb alter + neuer Keys fuer 24h (Rolling Deployment).

---

## 5. SMTP Credentials (SMTP_USER, SMTP_PASS)

### SendGrid
```bash
# 1. SendGrid Dashboard: Settings -> API Keys -> Create API Key
# 2. Alten Key loeschen
# 3. .env aktualisieren:
#    SMTP_PASS=SG.NEUER_API_KEY

# 4. API neu starten
docker compose -f docker-compose.prod.yml restart api
```

### Andere Provider (Gmail, Outlook, etc.)
```bash
# 1. Neues App-Passwort beim Provider erstellen
# 2. Altes Passwort deaktivieren
# 3. .env aktualisieren
# 4. API neu starten
```

---

## 6. Redis Password

```bash
# 1. Falls Redis mit Passwort konfiguriert:
#    openssl rand -base64 32

# 2. .env aktualisieren:
#    REDIS_URL=redis://:NEUES_PASSWORT@redis:6379/0

# 3. Redis-Container mit neuem Passwort starten:
#    In docker-compose.yml: command: ["redis-server", "--requirepass", "NEUES_PASSWORT", ...]

# 4. Stack neu starten
docker compose -f docker-compose.prod.yml up -d --build
```

**Hinweis:** Aktuell laeuft Redis ohne Passwort (nur intern erreichbar). Fuer Managed Redis (Hetzner) ist ein Passwort in der REDIS_URL Pflicht.

---

## 7. Internal Cron Secret (INTERNAL_CRON_SECRET)

```bash
# 1. Neues Secret generieren
openssl rand -hex 32

# 2. .env aktualisieren:
#    INTERNAL_CRON_SECRET=NEUES_SECRET

# 3. Cron-Job-Aufrufer aktualisieren (externen Scheduler mit neuem Header X-Internal-Secret)

# 4. API neu starten
docker compose -f docker-compose.prod.yml restart api
```

---

## 8. Admin Secret (ADMIN_SECRET)

```bash
# 1. Neues Secret generieren
openssl rand -hex 32

# 2. .env aktualisieren:
#    ADMIN_SECRET=NEUES_SECRET

# 3. API neu starten
docker compose -f docker-compose.prod.yml restart api
```

---

## Checkliste nach vollstaendiger Rotation

- [ ] POSTGRES_PASSWORD geaendert + DATABASE_URL aktualisiert
- [ ] SESSION_SECRET rotiert
- [ ] JWT_SECRET rotiert
- [ ] STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET rotiert
- [ ] SMTP_PASS rotiert
- [ ] INTERNAL_CRON_SECRET rotiert + Scheduler aktualisiert
- [ ] ADMIN_SECRET rotiert
- [ ] REDIS_URL aktualisiert (falls Passwort genutzt)
- [ ] `docker compose -f docker-compose.prod.yml up -d --build` ausgefuehrt
- [ ] Healthcheck geprueft: `curl https://deine-domain.de/health`
- [ ] Login getestet
- [ ] Stripe-Webhook getestet (Testpayment)
- [ ] E-Mail-Versand getestet
- [ ] Cron-Endpoints getestet
