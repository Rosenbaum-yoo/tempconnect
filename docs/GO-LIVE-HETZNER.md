# TempConnect – Go-Live Anleitung Hetzner

Stand: 2026-03-02

---

## 1) PROD-Startbefehl

### Variante A: Lokale DB im Container (1 VM, einfach)

```bash
docker compose -f docker-compose.yml -f docker-compose.ports-internal.yml up -d --build
```

- `docker-compose.yml` = Basis (alle Services inkl. DB)
- `docker-compose.ports-internal.yml` = bindet Ports nur an `127.0.0.1` (kein externer Zugriff)
- **KEIN** `docker-compose.override.yml` → wird durch explizites `-f` ignoriert

### Variante B: Hetzner Managed PostgreSQL (empfohlen für HA)

```bash
docker compose -f docker-compose.yml -f docker-compose.ports-internal.yml -f docker-compose.managed.yml up -d --build
```

- `docker-compose.managed.yml` verschiebt `db` in Profil `local-db` → Container startet nicht
- API + Migrate verbinden sich über `DATABASE_URL` direkt mit Managed DB
- **Wann managed.yml weglassen?** Wenn die DB als lokaler Container auf derselben VM laufen soll (Variante A)

### Wichtig: Override-Schutz

`docker-compose.override.yml` ist in `.gitignore` und wird auf dem Server nicht existieren.
Trotzdem: **Immer** explizite `-f` Flags nutzen. Niemals nacktes `docker compose up` auf Prod.

---

## 2) Hetzner Server-Setup (Copy/Paste)

### 2.1 UFW Firewall

```bash
# Firewall aktivieren – nur SSH, HTTP, HTTPS
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    comment 'SSH'
sudo ufw allow 80/tcp    comment 'HTTP (Caddy redirect)'
sudo ufw allow 443/tcp   comment 'HTTPS (Caddy TLS)'
sudo ufw enable
sudo ufw status verbose
```

**Ergebnis:** DB (5432), Redis (6379), Mailpit (8025/1025), Docker-Ports – alles geblockt von außen.

### 2.2 Caddy Installation + Caddyfile

```bash
# Caddy installieren (Debian/Ubuntu)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Caddyfile erstellen
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
tempconnect.de {
    reverse_proxy 127.0.0.1:8080
}

www.tempconnect.de {
    redir https://tempconnect.de{uri} permanent
}
EOF

# Caddy starten
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

**Was Caddy macht:** Automatisches Let's Encrypt TLS, HTTP→HTTPS Redirect, Reverse Proxy zu nginx-Container auf 127.0.0.1:8080.

### 2.3 Docker Compose Deployment

```bash
# Ordnerstruktur auf dem Server
sudo mkdir -p /opt/tempconnect
sudo chown $USER:$USER /opt/tempconnect

# Repo/ZIP nach /opt/tempconnect entpacken
# Dann:
cd /opt/tempconnect

# .env aus .env.prod.example erstellen
cp .env.prod.example .env
nano .env   # Alle Platzhalter ersetzen!

# Starten
docker compose -f docker-compose.yml -f docker-compose.ports-internal.yml up -d --build

# Prüfen
docker compose ps
```

**Permissions:** Dateien gehören dem Deploy-User. Docker-Socket braucht `docker`-Gruppe:
```bash
sudo usermod -aG docker $USER
# Neu einloggen nötig
```

**Restart Policy:** Alle Services haben `restart: always` → überleben Reboot.
Zusätzlich Docker-Daemon autostart sichern:
```bash
sudo systemctl enable docker
```

### 2.4 Healthcheck / Monitoring Minimalset

```bash
# 1. Container-Status (alle "healthy"?)
docker compose -f docker-compose.yml -f docker-compose.ports-internal.yml ps

# 2. API Health (durch nginx → API /health)
curl -sf http://127.0.0.1:8080/health && echo "OK" || echo "FAIL"

# 3. TLS von außen
curl -sf https://tempconnect.de/health && echo "OK" || echo "FAIL"

# 4. Logs prüfen
docker compose -f docker-compose.yml -f docker-compose.ports-internal.yml logs --tail=50 api
docker compose -f docker-compose.yml -f docker-compose.ports-internal.yml logs --tail=20 frontend

# 5. Einfacher Cron-Watchdog (optional in crontab -e)
# Alle 5 Min prüfen, bei Fehler Neustart:
*/5 * * * * curl -sf http://127.0.0.1:8080/health || (cd /opt/tempconnect && docker compose -f docker-compose.yml -f docker-compose.ports-internal.yml restart api)
```

---

## 3) Repo-Hygiene – Prüfergebnis

| Punkt | Status | Details |
|-------|--------|---------|
| node_modules im Repo | ✅ OK | `.gitignore` + `.dockerignore` schließen `node_modules/` aus |
| node_modules im Image | ✅ OK | Dockerfile nutzt `npm ci --omit=dev` (deterministisch, kein devDeps) |
| .env committen | ✅ OK | `.gitignore` blockt `*.env`, `.env`, `.env.prod` etc. Nur `*.example` erlaubt |
| .env.prod.example | ✅ OK | Vorhanden mit allen Platzhaltern, klar kommentiert |
| Production Validation | ✅ OK | `runProductionValidation()` prüft: SESSION_SECRET, JWT_SECRET, INTERNAL_CRON_SECRET, ADMIN_SECRET (neu) |
| Placeholder Detection | ✅ OK | Erkennt `HIER_`, `DEIN_`, `PLACEHOLDER`, leere Strings, Dev-Defaults |
| override.yml in Prod | ✅ OK | In `.gitignore`, wird auf Server nicht existieren. Explizite `-f` Flags verhindern Auto-Merge |

---

## 4) HA-Prepared Check

### Was bereits Scale-ready ist

- **Sessions:** PostgreSQL (`connect-pg-simple`) → zentral, mehrere API-Instanzen können gleiche Sessions lesen ✅
- **Rate Limiting:** Redis (`RATE_LIMIT_STORE=redis`) → gemeinsamer Counter über alle Instanzen ✅
- **trust proxy:** `app.set("trust proxy", 1)` → korrekt hinter Load Balancer ✅
- **Cookie Secure:** Automatisch bei `NODE_ENV=production` oder `BASE_URL=https://...` ✅
- **Stateless Frontend:** nginx serviert nur statische Dateien, kein State ✅

### Single Points of Failure (1 VM)

1. **VM selbst** – Hardware-/Netzwerkausfall = kompletter Ausfall
2. **PostgreSQL Container** – Datenverlust bei Volume-Corruption möglich
3. **Redis Container** – Rate-Limit-Counter gehen verloren (unkritisch, regeneriert sich)
4. **Caddy** – kein TLS-Termination wenn Caddy-Prozess stirbt
5. **Docker Daemon** – alle Container down wenn Docker crasht

### Minimum HA Empfehlung (2 VMs + LB + Managed DB)

```
                    ┌─────────────────┐
                    │  Hetzner LB     │
                    │  (TLS, €5/Mo)   │
                    └────┬───────┬────┘
                         │       │
              ┌──────────▼──┐ ┌──▼──────────┐
              │   VM 1      │ │   VM 2      │
              │ nginx+API   │ │ nginx+API   │
              │ Redis       │ │ Redis       │
              │ (CX22 €4)   │ │ (CX22 €4)  │
              └──────┬──────┘ └──────┬──────┘
                     │               │
              ┌──────▼───────────────▼──────┐
              │  Hetzner Managed PostgreSQL  │
              │  (PG16, €15/Mo)             │
              └─────────────────────────────┘
```

**Kosten: ~28–34 €/Monat**

- Hetzner LB: ~5 €
- 2× CX22 (2 vCPU, 4 GB): 2× ~4 €
- Managed PostgreSQL (PG-Basic): ~15 €
- DNS, Backups: ~2–4 €

**Umstellung:**
1. `docker-compose.managed.yml` dazunehmen (DB-Container deaktiviert)
2. `DATABASE_URL` auf Managed DB setzen
3. Redis pro VM lokal lassen (Rate-Limits sind pro-Instanz ok, oder managed Redis hinzufügen)
4. Hetzner LB auf beide VMs Port 8080 zeigen lassen (Healthcheck: `/health`)

---

## 5) Go-Live Checklist (10 Punkte)

- [ ] **1. Secrets:** `.env` erstellt, alle 4 Secrets kryptographisch generiert (`openssl rand -hex 32`): SESSION_SECRET, JWT_SECRET, INTERNAL_CRON_SECRET, ADMIN_SECRET
- [ ] **2. Domain:** DNS A-Record zeigt auf Server-IP, CORS_ORIGIN + BASE_URL auf `https://deine-domain.de` gesetzt
- [ ] **3. UFW:** Nur 22/80/443 offen, `ufw status` geprüft
- [ ] **4. Caddy:** Caddyfile mit richtiger Domain, `systemctl status caddy` = active, HTTPS erreichbar
- [ ] **5. Compose Start:** `docker compose -f docker-compose.yml -f docker-compose.ports-internal.yml up -d --build` – alle Container "healthy"
- [ ] **6. Health:** `curl -sf https://deine-domain.de/health` gibt `{"status":"ok"}` zurück
- [ ] **7. E-Mail:** SMTP_HOST/SMTP_PASS konfiguriert (SendGrid, Brevo, etc.), Registrierung + Verifizierungsmail testen
- [ ] **8. TLS:** `curl -vI https://deine-domain.de 2>&1 | grep "subject:"` zeigt korrektes Zertifikat
- [ ] **9. DB-Sicherheit:** Port 5432 von außen nicht erreichbar: `nmap -p 5432 <SERVER-IP>` = filtered/closed
- [ ] **10. Backup:** PostgreSQL-Dump-Cronjob eingerichtet oder Hetzner Managed DB Backups aktiv

---

## Warnungen

1. **SMTP_PASS leer in Dev:** Aktuell steht `SMTP_PASS=` leer in deiner lokalen `.env`. Auf Prod MUSS ein echter SendGrid/Brevo API-Key rein, sonst keine E-Mail-Verifizierung → Registrierung kaputt.
2. **Mailpit nur Dev:** `mailpit` hat `profiles: [dev]` → startet in Prod nicht. Korrekt so.
3. **Redis ohne Passwort:** Der Redis-Container hat kein `requirepass`. Ist ok solange Redis nur im Docker-Netzwerk erreichbar ist (kein Port nach außen). Für Managed Redis: Passwort in `REDIS_URL` setzen.
4. **DB Volume Backup:** `dbdata` Docker-Volume hat kein automatisches Backup. Entweder regelmäßiger `pg_dump`-Cronjob oder Managed DB mit automatischen Backups nutzen.
5. **Log Rotation:** API-Logs auf 50 MB × 5 Files = max 250 MB begrenzt. Für Prod ausreichend, aber nach ein paar Monaten prüfen.
6. **contentSecurityPolicy: false:** Helmet CSP ist deaktiviert. Für Prod empfohlen, eine echte CSP-Policy zu definieren (kann Schritt für Schritt gemacht werden).
