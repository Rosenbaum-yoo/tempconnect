# TempConnect – Deployment auf Hetzner Cloud

## Voraussetzungen

- Hetzner Cloud Account (https://console.hetzner.cloud)
- Domain mit DNS-Zugriff
- Lokale Kopie des Projekts (NICHT aus OneDrive deployen)

---

## 1. Server erstellen

### Hetzner Cloud Panel
1. **Projekt erstellen:** "TempConnect"
2. **Server erstellen:**
   - **Standort:** Falkenstein (fsn1) oder Nuernberg (nbg1)
   - **Image:** Ubuntu 24.04
   - **Typ:** CX22 (2 vCPU, 4 GB RAM) – fuer Start ausreichend
   - **SSH Key:** Eigenen Public Key hinterlegen
   - **Firewall:** Erstellen mit Regeln:
     - Inbound: TCP 22 (SSH), TCP 80 (HTTP), TCP 443 (HTTPS)
     - Outbound: Alles erlauben

### SSH Verbindung
```bash
ssh root@DEINE_SERVER_IP
```

---

## 2. Server Grundeinrichtung

```bash
# System aktualisieren
apt update && apt upgrade -y

# Swap einrichten (empfohlen fuer CX22)
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Deploy-User erstellen (kein Root-Betrieb)
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh

# Firewall (ufw)
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## 3. Docker installieren

```bash
# Docker (offizielle Methode)
curl -fsSL https://get.docker.com | sh

# Docker Compose Plugin pruefen
docker compose version

# Docker ohne sudo fuer deploy-User
usermod -aG docker deploy
```

---

## 4. Projekt deployen

```bash
# Als deploy-User
su - deploy

# Projektverzeichnis
mkdir -p ~/tempconnect
cd ~/tempconnect

# Projekt-Dateien hochladen (von lokalem Rechner)
# Option A: Git Clone (empfohlen)
# git clone git@github.com:DEIN_REPO/tempconnect_docker.git .

# Option B: rsync/scp
# scp -r /pfad/zu/tempconnect_docker/* deploy@SERVER_IP:~/tempconnect/
```

---

## 5. Environment konfigurieren

```bash
cd ~/tempconnect

# .env aus Example erstellen
cp .env.prod.example .env

# .env bearbeiten (ALLE Platzhalter ersetzen!)
nano .env
```

### Pflichtfelder fuer Produktion
```bash
NODE_ENV=production

# Datenbank (Hetzner Managed DB oder lokal)
DATABASE_URL=postgres://tempconnect:SICHERES_PASSWORT@db:5432/tempconnect
POSTGRES_PASSWORD=SICHERES_PASSWORT

# Secrets (ALLE generieren!)
SESSION_SECRET=$(openssl rand -hex 64)
JWT_SECRET=$(openssl rand -hex 64)
INTERNAL_CRON_SECRET=$(openssl rand -hex 32)
ADMIN_SECRET=$(openssl rand -hex 32)

# Domain
CORS_ORIGIN=https://deine-domain.de
BASE_URL=https://deine-domain.de

# E-Mail (SendGrid empfohlen)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.DEIN_API_KEY
SMTP_FROM=noreply@deine-domain.de

# Stripe (Live-Keys!)
PAYMENT_MODE=stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Redis (lokal im Docker)
RATE_LIMIT_STORE=redis
REDIS_URL=redis://redis:6379

# Ports
FRONTEND_PORT=8080
```

---

## 6. SSL mit Let's Encrypt

### Option A: Nginx auf Host + certbot (empfohlen)

```bash
# Nginx auf Host installieren
apt install -y nginx certbot python3-certbot-nginx

# Nginx Config
cp deploy/nginx-ssl.example.conf /etc/nginx/sites-available/tempconnect
# Domain in der Config ersetzen:
sed -i 's/deine-domain.de/ECHTE_DOMAIN/g' /etc/nginx/sites-available/tempconnect

# Aktivieren
ln -s /etc/nginx/sites-available/tempconnect /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# SSL-Zertifikat
certbot --nginx -d ECHTE_DOMAIN
# certbot erneuert automatisch (Timer vorhanden)
```

### Option B: Caddy (automatisches SSL)

```bash
# Caddy installieren
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy

# Caddyfile kopieren
cp deploy/Caddyfile.example /etc/caddy/Caddyfile
# Domain ersetzen, caddy reload
```

---

## 7. Domain DNS einrichten

Beim Domain-Provider:
```
A    @     → DEINE_SERVER_IP
A    www   → DEINE_SERVER_IP
```

TTL: 300 (5 Minuten) fuer schnelle Aenderungen.

---

## 8. Stack starten

```bash
cd ~/tempconnect

# Produktions-Stack starten
./scripts/prod-up.sh

# Oder manuell:
docker compose -f docker-compose.prod.yml up -d --build

# Status pruefen
docker compose -f docker-compose.prod.yml ps

# Healthcheck
curl -s http://127.0.0.1:8080/health
# Erwartete Antwort: OK
```

---

## 9. Stripe Webhook einrichten

1. Stripe Dashboard → Webhooks → Endpoint hinzufuegen
2. URL: `https://deine-domain.de/api/payment/webhook/stripe`
3. Events: `checkout.session.completed`, `customer.subscription.deleted`
4. Webhook-Secret in `.env` als `STRIPE_WEBHOOK_SECRET` eintragen
5. API neustarten: `docker compose -f docker-compose.prod.yml restart api`

---

## 10. Cron-Jobs einrichten

```bash
# Crontab fuer deploy-User
crontab -e

# Folgende Zeilen einfuegen:
*/5 * * * * curl -sf -X POST -H "X-Internal-Secret: DEIN_CRON_SECRET" http://127.0.0.1:8080/api/internal/expire-reservations > /dev/null 2>&1
*/5 * * * * curl -sf -X POST -H "X-Internal-Secret: DEIN_CRON_SECRET" http://127.0.0.1:8080/api/internal/sla-scan > /dev/null 2>&1
*/10 * * * * curl -sf -X POST -H "X-Internal-Secret: DEIN_CRON_SECRET" http://127.0.0.1:8080/api/internal/recompute-supplier-metrics > /dev/null 2>&1
*/10 * * * * curl -sf -X POST -H "X-Internal-Secret: DEIN_CRON_SECRET" http://127.0.0.1:8080/api/internal/recompute-compliance > /dev/null 2>&1
0 3 * * * curl -sf -X POST -H "X-Internal-Secret: DEIN_CRON_SECRET" http://127.0.0.1:8080/api/internal/cleanup-idempotency > /dev/null 2>&1
*/5 * * * * curl -sf -X POST -H "X-Internal-Secret: DEIN_CRON_SECRET" http://127.0.0.1:8080/api/internal/demand-sla-scan > /dev/null 2>&1
*/5 * * * * curl -sf -X POST -H "X-Internal-Secret: DEIN_CRON_SECRET" http://127.0.0.1:8080/api/internal/sla-search-scan > /dev/null 2>&1
*/5 * * * * curl -sf -X POST -H "X-Internal-Secret: DEIN_CRON_SECRET" http://127.0.0.1:8080/api/internal/sla-search-run > /dev/null 2>&1
*/5 * * * * HOST_NAME="$(hostname -s)" INTERNAL_CRON_SECRET="DEIN_CRON_SECRET" BASE_URL="http://127.0.0.1:8080" /home/deploy/tempconnect/scripts/collect-infrastructure-snapshot.sh > /dev/null 2>&1
```

---

## 11. Monitoring

```bash
# Logs live verfolgen
./scripts/prod-logs.sh

# Oder direkt:
docker compose -f docker-compose.prod.yml logs -f api

# Admin-Status pruefen
curl -s -H "X-Admin-Secret: DEIN_ADMIN_SECRET" https://deine-domain.de/api/admin/status | jq

# Disk-Space
df -h
```

---

## 12. Updates deployen

```bash
cd ~/tempconnect

# Neue Dateien hochladen (git pull oder rsync)
git pull origin main

# Stack neu bauen und starten
./scripts/prod-update.sh

# Oder manuell:
docker compose -f docker-compose.prod.yml up -d --build

# Healthcheck
curl -s https://deine-domain.de/health
```

---

## Checkliste Go-Live

- [ ] Server erstellt + Firewall konfiguriert
- [ ] Docker installiert
- [ ] Projekt deployed
- [ ] .env vollstaendig konfiguriert (KEINE Platzhalter!)
- [ ] SSL-Zertifikat aktiv
- [ ] DNS A-Record gesetzt
- [ ] Healthcheck erfolgreich
- [ ] Login funktioniert
- [ ] E-Mail-Versand getestet
- [ ] Stripe-Webhook getestet
- [ ] Cron-Jobs eingerichtet
- [ ] Backup-Strategie definiert
