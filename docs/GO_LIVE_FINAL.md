# TempConnect – Go-Live Final Checklist

Alle 10 Punkte müssen vor dem Go-Live abgehakt sein.

## 1. Domain & DNS
- [ ] Domain registriert und DNS konfiguriert
- [ ] A-Record zeigt auf Hetzner LB Public IP
- [ ] TTL auf 300s (5 Min) für schnelle Änderungen
- [ ] Optional: www → apex redirect

## 2. TLS / HTTPS
- [ ] Let's Encrypt Zertifikat über Hetzner LB aktiv
- [ ] HTTP → HTTPS Redirect aktiv
- [ ] `BASE_URL` und `CORS_ORIGIN` in `.env` auf `https://...`
- [ ] Test: `curl -I https://tempconnect.de` zeigt 200 + HTTPS

## 3. Managed DB + Backups
- [ ] Hetzner Managed PostgreSQL erstellt
- [ ] Auto-Backups aktiviert (mind. 7 Tage Retention)
- [ ] `DATABASE_URL` in `.env` mit `?sslmode=require`
- [ ] Zusätzliche eigene pg_dump-Backups konfiguriert
- [ ] 1x Restore-Test durchgeführt und dokumentiert

## 4. Ports & Firewall
- [ ] UFW aktiv: nur 22, 80, 443 + private network offen
- [ ] DB-Port (5432) von außen NICHT erreichbar
- [ ] Redis-Port (6379) von außen NICHT erreichbar
- [ ] Docker-Ports (8080, 3000) nur auf 127.0.0.1

## 5. Production Scripts
- [ ] `./scripts/prod-up.sh` startet erfolgreich
- [ ] `./scripts/prod-update.sh` führt Rolling Update durch
- [ ] Kein `docker-compose.override.yml` auf den Servern
- [ ] Alle Container: `restart: unless-stopped`

## 6. Scheduler konfiguriert
- [ ] Externer Scheduler eingerichtet (crontab / UptimeRobot / GitHub Actions)
- [ ] `sla-scan` läuft alle 5 Min
- [ ] `expire-reservations` läuft alle 5 Min
- [ ] `run-search-jobs` läuft alle 5 Min
- [ ] `cleanup-idempotency` läuft alle 6h
- [ ] `./scripts/scheduler-smoke.sh` bestanden

## 7. Smoke Tests
- [ ] `/health` gibt 200 zurück
- [ ] Registrierung funktioniert
- [ ] Login funktioniert
- [ ] Capacity Search + Matching funktioniert
- [ ] Request senden funktioniert
- [ ] Abo-Seite lädt und zeigt aktuelle Pläne

## 8. Payment / Stripe
- [ ] `PAYMENT_MODE=stripe` in `.env`
- [ ] Stripe Live Keys gesetzt (`sk_live_...`, `pk_live_...`)
- [ ] Stripe Webhook konfiguriert: `https://domain/api/payment/webhook/stripe`
- [ ] `STRIPE_WEBHOOK_SECRET` in `.env`
- [ ] Test-Checkout durchgeführt (Stripe Test-Modus → dann Live)
- [ ] Webhook-Logs in Stripe Dashboard geprüft

## 9. E-Mail
- [ ] SMTP konfiguriert (SendGrid / Brevo / eigener Server)
- [ ] Test-Mail gesendet (Registrierung → Bestätigungs-Mail)
- [ ] `SMTP_FROM` auf verifizierte Absender-Adresse
- [ ] SPF/DKIM/DMARC DNS-Records gesetzt

## 10. Failover & HA
- [ ] 2 VMs laufen mit identischer Konfiguration
- [ ] LB Health Check aktiv und funktional
- [ ] Failover-Test: VM1 down → Platform erreichbar über VM2
- [ ] Rolling Update getestet: VM1 update → VM2 update → kein Downtime
- [ ] Monitoring eingerichtet (Uptime Kuma / BetterUptime / UptimeRobot)
- [ ] Alarm-E-Mail getestet

---

**Go-Live Ready?** Alle Punkte abgehakt → Deploy starten.

Verbleibende Risiken nach Go-Live:
- Redis ist pro-VM (kein shared state bei Rate-Limits) → akzeptabel, oder Managed Redis
- `customer.subscription.deleted` Webhook-Handler ist noch TODO (Downgrade auf FREE)
- Load-Test unter echter Last noch nicht durchgeführt
