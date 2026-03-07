# TempConnect – Operations Minimum (Premium Professional)

## 1. Uptime Monitoring

### External Health Check
- **Endpoint**: `GET https://tempconnect.de/health`
- **Intervall**: 30–60 Sekunden
- **Timeout**: 5 Sekunden
- **Erwartung**: HTTP 200

### Empfohlene Tools (wähle eins)
- **Uptime Kuma** (self-hosted, kostenlos) – eigene kleine VM oder Docker
- **BetterUptime** (SaaS, kostenloser Plan für 5 Monitors)
- **UptimeRobot** (SaaS, kostenlos bis 50 Monitors)
- **Hetzner Status Checks** (im Cloud Panel integriert)

### Was überwachen?
1. `https://tempconnect.de/health` – Gesamtsystem (LB → Frontend → API → DB)
2. `https://tempconnect.de/api/health/status` – Detaillierter API-Status (mit `ADMIN_SECRET`)
3. DNS-Auflösung der Domain
4. TLS-Zertifikat Ablaufdatum

## 2. Alarmierung

### Minimum (Pflicht)
- E-Mail-Alert bei Health-Check-Fehler (>2 Minuten down)
- Tägliche Summary-Mail von Monitoring-Tool

### Optional (empfohlen)
- Slack/Teams-Webhook für Echtzeit-Alerts
- SMS-Alert für kritische Ausfälle (>10 Minuten)

## 3. Datenbank-Backups

### Managed PostgreSQL (Hetzner)
- **Auto-Backups**: aktivieren im Cloud Panel (tägliche Snapshots)
- **Retention**: mind. 7 Tage
- **Point-in-Time-Recovery**: verfügbar bei Managed DB

### Zusätzlich: Eigene Backups (Defense-in-Depth)
```bash
# Tägliches Backup per Cron (auf einer VM)
0 3 * * * pg_dump "$DATABASE_URL" | gzip > /opt/backups/tc_$(date +\%Y\%m\%d).sql.gz

# Alte Backups löschen (>14 Tage)
0 4 * * * find /opt/backups -name "tc_*.sql.gz" -mtime +14 -delete
```

### Restore-Test (vierteljährlich durchführen)
1. Backup-Datei auf Test-DB laden
2. API gegen Test-DB starten
3. Health-Check + Login prüfen
4. Dokumentieren: Datum, Dauer, Ergebnis

## 4. Log-Zugriff

### Container-Logs
```bash
# Alle Services
./scripts/prod-logs.sh

# Nur API (letzte 200 Zeilen, live)
./scripts/prod-logs.sh api 200

# Frontend
./scripts/prod-logs.sh frontend 50
```

### Log Rotation
- Konfiguriert in `docker-compose.prod.yml`: max 50MB × 5 Files (API), max 10MB × 3 Files (andere)
- Alternativ global in `/etc/docker/daemon.json`

### Log-Analyse (bei Incidents)
```bash
# Errors filtern
docker logs tempconnect_api 2>&1 | grep -i "error\|fatal\|ERR"

# Letzte 1h
docker logs --since 1h tempconnect_api
```

## 5. Error Budget / Incident-Routine

### SLA-Ziel: 99% Uptime (7.3h Downtime/Monat erlaubt)

### Bei Incident:
1. **Erkennen**: Monitoring-Alert
2. **Triagieren**: `./scripts/prod-logs.sh api 100` – Fehlerbild erkennen
3. **Mitigieren**: Schnellster Fix anwenden:
   - API-Restart: `docker restart tempconnect_api`
   - Full Restart: `./scripts/prod-down.sh && ./scripts/prod-up.sh`
   - Rollback: `git checkout <last-working-tag> && ./scripts/prod-update.sh`
4. **Dokumentieren**: Datum, Dauer, Ursache, Maßnahme
5. **Post-Mortem**: Innerhalb 48h – Was war die Root Cause? Wie verhindern?

## 6. Kapazitäts-Check (monatlich)

```bash
# Disk
df -h /opt/tempconnect

# Docker disk usage
docker system df

# DB-Größe (Managed DB → Cloud Panel oder:)
psql "$DATABASE_URL" -c "SELECT pg_database_size('tempconnect') / 1024 / 1024 AS mb;"

# Aufräumen
docker image prune -f
docker volume prune -f
```
