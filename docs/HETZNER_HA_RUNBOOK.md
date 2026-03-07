# TempConnect – Hetzner HA Runbook (Copy/Paste)

## Architektur

```
                    ┌─────────────────────┐
           Internet │  Hetzner LB (€5)    │
                    │  TLS Termination     │
                    │  Health: /health     │
                    └────┬───────────┬─────┘
                         │           │
              ┌──────────▼──┐  ┌─────▼─────────┐
              │  VM1 (CX22) │  │  VM2 (CX22)   │
              │  nginx+API  │  │  nginx+API     │
              │  Redis local│  │  Redis local   │
              │  €4/Mo      │  │  €4/Mo         │
              └──────┬──────┘  └──────┬─────────┘
                     │                │
              ┌──────▼────────────────▼──────┐
              │  Hetzner Managed PostgreSQL   │
              │  PG16, Auto-Backups (€15/Mo) │
              └──────────────────────────────┘
```

**Kosten: ~28-34 €/Monat**

## 1. Ressourcen erstellen (Hetzner Cloud Console)

### 1.1 Private Network
- Name: `tc-internal`
- IP-Range: `10.0.0.0/16`
- Alle VMs und Managed DB ins gleiche Netzwerk

### 1.2 Managed PostgreSQL
- Typ: PG-Basic (1 vCPU, 2 GB)
- Version: PostgreSQL 16
- Netzwerk: `tc-internal` (private IP)
- Auto-Backups: aktivieren
- Allowed IPs: nur VM1 + VM2 private IPs
- Connection-String notieren → `DATABASE_URL`

### 1.3 VMs (2x CX22)
- OS: Ubuntu 24.04
- Netzwerk: `tc-internal` + public IPv4
- SSH-Key hinterlegen

### 1.4 Load Balancer
- Typ: LB11 (€5/Mo)
- Netzwerk: `tc-internal`
- Targets: VM1 + VM2
- Protocol: HTTPS (LB terminiert TLS)
- Certificate: Let's Encrypt (im LB konfigurierbar)
- Health Check: `GET /health`, Port 8080, Interval 10s, Timeout 5s

## 2. Server-Setup (auf JEDER VM)

```bash
# Docker installieren
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo systemctl enable docker

# UFW Firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (LB health checks)
sudo ufw allow 443/tcp   # HTTPS
# Private Network für LB
sudo ufw allow from 10.0.0.0/16 to any port 8080
sudo ufw enable

# Repo deployen
sudo mkdir -p /opt/tempconnect
sudo chown $USER:$USER /opt/tempconnect
cd /opt/tempconnect

# Per git clone oder scp/rsync
git clone <repo-url> .

# .env erstellen
cp .env.prod.example .env
nano .env
# → DATABASE_URL auf Managed PG setzen
# → REDIS_URL=redis://redis:6379 (lokal)
# → Alle Secrets setzen (openssl rand -hex 32)
# → CORS_ORIGIN=https://tempconnect.de
# → BASE_URL=https://tempconnect.de
# → PAYMENT_MODE=stripe + Stripe Keys

# Starten
chmod +x scripts/*.sh
./scripts/prod-up.sh

# Verify
curl -sf http://127.0.0.1:8080/health && echo "OK"
```

## 3. Load Balancer Konfiguration

- **Service**: HTTP
- **Listen Port**: 443 (HTTPS)
- **Backend Port**: 8080
- **Backend Protocol**: HTTP
- **Health Check**: Path `/health`, Port 8080, Interval 10s
- **Sticky Sessions**: aktivieren (Cookie-basiert, für Session-Konsistenz)
- **Certificate**: Let's Encrypt für `tempconnect.de`
- **HTTP → HTTPS Redirect**: aktivieren

DNS: `tempconnect.de` A-Record → LB Public IP

## 4. Failover-Test

```bash
# Auf VM1: Stack stoppen
ssh vm1 "cd /opt/tempconnect && ./scripts/prod-down.sh"

# Prüfen: Platform muss weiter erreichbar sein
curl -sf https://tempconnect.de/health && echo "FAILOVER OK"

# VM1 wieder starten
ssh vm1 "cd /opt/tempconnect && ./scripts/prod-up.sh"
```

LB erkennt unhealthy Backend in ~30s und leitet Traffic nur noch zu VM2.

## 5. Rolling Update

```bash
# Server 1 updaten
ssh vm1 "cd /opt/tempconnect && ./scripts/prod-update.sh"
# Warten bis healthy (30s)
sleep 30
curl -sf https://tempconnect.de/health && echo "VM1 OK"

# Server 2 updaten
ssh vm2 "cd /opt/tempconnect && ./scripts/prod-update.sh"
sleep 30
curl -sf https://tempconnect.de/health && echo "VM2 OK"
```

## 6. Scheduler Setup (nur EINMAL, nicht auf beiden VMs)

Auf einem Management-Server oder via externem Service (siehe `docs/SCHEDULER.md`):

```bash
# Crontab auf VM1 (oder externer Server)
crontab -e

# Einfügen:
CRON_SECRET="<INTERNAL_CRON_SECRET>"
LB="https://tempconnect.de"
*/5 * * * * curl -sf -X POST "$LB/api/internal/sla-scan" -H "X-Internal-Secret: $CRON_SECRET"
*/5 * * * * curl -sf -X POST "$LB/api/internal/expire-reservations" -H "X-Internal-Secret: $CRON_SECRET"
*/5 * * * * curl -sf -X POST "$LB/api/internal/run-search-jobs" -H "X-Internal-Secret: $CRON_SECRET"
0 */6 * * * curl -sf -X POST "$LB/api/internal/cleanup-idempotency" -H "X-Internal-Secret: $CRON_SECRET"
```

Immer gegen LB-URL (nicht direkt gegen eine VM), damit Failover greift.

## 7. Stripe Webhook

- Stripe Dashboard → Webhooks → Endpoint hinzufügen
- URL: `https://tempconnect.de/api/payment/webhook/stripe`
- Events: `checkout.session.completed`, `customer.subscription.deleted`
- Signing Secret → `STRIPE_WEBHOOK_SECRET` in `.env`
