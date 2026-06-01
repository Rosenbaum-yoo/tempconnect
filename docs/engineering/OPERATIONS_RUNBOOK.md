# TempConnect — Operations Runbook

> Zentrale Betriebsreferenz für Deployment, Monitoring, Backup/Restore und Pilot-Support.
> WAVE 12 — Phase 2 — 2026-05-27

---

## 1. Health & Readiness

### Endpoints

| Endpunkt | Zweck | Auth | Erwarteter Status |
|---|---|---|---|
| `GET /health` | LB Liveness (kein DB) | Nein | `200 OK` |
| `GET /api/health` | API Health (DB-Ping) | Nein | `{"ok":true}` |
| `GET /api/ready` | Readiness (DB erreichbar?) | Nein | `{"ok":true,"ready":true}` |
| `GET /api/live` | Liveness (Prozess läuft?) | Nein | `{"ok":true,"live":true}` |
| `GET /api/service-status` | Komponenten-Status | Nein | Komponentenliste |
| `GET /api/public/system-status` | Trust Center Status | Nein | Business-Level Status |
| `GET /api/admin/status` | Admin-Status (inkl. Migrations) | `X-Admin-Secret` | Vollständiger Status |

### Quick Checks

```bash
# Ist der Service erreichbar?
curl -sf https://<domain>/api/health | jq .

# Ist die DB verbunden?
curl -sf https://<domain>/api/ready | jq .

# Lebt der Prozess?
curl -sf https://<domain>/api/live | jq .

# Vollständiger Komponentenstatus
curl -sf https://<domain>/api/service-status | jq .
```

---

## 2. Logging & Tracing

### Correlation-ID

Jeder Request erhält eine Correlation-ID (`X-Correlation-ID` oder `X-Request-ID`).
Sie wird im Log, in der Error-Response und an nachgelagerte Services weitergegeben.

```bash
# Letzten 50 API-Log-Einträge
docker logs --tail=50 tempconnect_api

# Mit Correlation-ID suchen
docker logs tempconnect_api 2>&1 | grep "<correlation-id>"

# Live-Logs
docker logs -f tempconnect_api
```

### Log-Format

```json
{
  "level": "info",
  "time": "2026-05-27T10:00:00.000Z",
  "correlationId": "uuid",
  "method": "POST",
  "url": "/api/requisitions",
  "statusCode": 201,
  "duration": 45
}
```

**Logs enthalten niemals:** Passwörter, Session-Tokens, API-Keys, personenbezogene Daten im Klartext.

---

## 3. Deployment

### Standard-Deployment

```bash
# 1. Pre-Deploy Backup (automatisch via prod-update.sh)
./scripts/prod-update.sh

# Manuelles Update:
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Rollback

```bash
# 1. Auf letzten Git-Stand zurück
git checkout <letzter-stabiler-commit>

# 2. Deployment wiederholen
./scripts/prod-update.sh

# 3. Falls DB-Migration rolled back werden muss (nur custom-Migration):
./scripts/restore.sh backups/<DATUM> --db-only
```

Vollständiges Rollback-Runbook: `docs/RELEASE_RUNBOOK.md`

---

## 4. Backup

### Backup ausführen

```bash
# Vollbackup (DB + Uploads)
./scripts/backup.sh

# Nur DB
./scripts/backup.sh --db-only

# Abweichendes Zielverzeichnis
BACKUP_DIR=/mnt/ext-backup ./scripts/backup.sh
```

### Automatisches Backup (Cron-Empfehlung)

```cron
# Täglich 02:00 Uhr
0 2 * * * cd /opt/tempconnect && ./scripts/backup.sh >> /var/log/tc-backup.log 2>&1
```

### Backup-Gesundheit prüfen

```bash
# Letzter erfolgreicher Backup-Zeitpunkt (Epoch)
cat backups/last_success_epoch

# Backup älter als 25 Stunden → Alert
LAST=$(cat backups/last_success_epoch 2>/dev/null || echo 0)
NOW=$(date +%s)
AGE=$(( NOW - LAST ))
[ $AGE -gt 90000 ] && echo "WARNUNG: Backup ist ${AGE}s alt!" || echo "Backup OK"
```

---

## 5. Restore

### Standard-Restore

```bash
# Vollständiger Restore aus Backup
./scripts/restore.sh backups/2026-05-27_020000

# Nur Datenbank
./scripts/restore.sh backups/2026-05-27_020000 --db-only

# Nur Uploads
./scripts/restore.sh backups/2026-05-27_020000 --uploads-only
```

### Restore-Test (automatisiert)

```bash
# Testet Restore in Sandbox ohne Produktionsdaten zu überschreiben
./scripts/restore-test.sh backups/<DATUM>
```

---

## 6. Restore Drill (Pflicht vor Go-Live)

**Frequenz:** Mindestens 1× vor Pilot Go-Live, danach monatlich.

**Ablauf:**
1. Frisches Test-System aufsetzen (separate DB-Instanz)
2. Backup auf Test-System restoren: `./scripts/restore-test.sh backups/NEUESTES`
3. Login auf Test-System: Admin-Account funktioniert?
4. Spot-Check: 2-3 Datensätze mit Produktionsdaten vergleichen
5. Ergebnis dokumentieren (Datum, Dauer, Tester):

```
Restore-Drill: 2026-__-__ | Backup: 2026-__-__ | Dauer: __min | Tester: _______ | OK: [ ]
```

Vollständige Dokumentation: `docs/BACKUP_DISASTER_RECOVERY.md`

---

## 7. Monitoring

### Prometheus Metrics (Admin-Secret geschützt)

```bash
curl -H "X-Admin-Secret: <secret>" https://<domain>/metrics
```

### Sentry Error Tracking

```bash
# Sentry-Integration testen
curl -H "X-Admin-Secret: <secret>" https://<domain>/api/debug/sentry-test
```

### Platform Metrics

```bash
curl -H "X-Admin-Secret: <secret>" https://<domain>/api/admin/metrics | jq .
```

---

## 8. Incident Response

Vollständiges Runbook: `docs/INCIDENT_RUNBOOK.md`

### Schnell-Referenz

| Problem | Erste Maßnahme |
|---|---|
| Plattform nicht erreichbar | `docker ps` → Container-Status prüfen |
| DB-Verbindungsfehler | `docker logs tempconnect_api \| grep DB` |
| Migration fehlgeschlagen | `docker logs tempconnect_migrate` |
| Hohe Fehlerrate | `GET /api/service-status` → Komponente identifizieren |
| Sicherheitsvorfall | Sofort Owner + Tech Lead benachrichtigen, Logs sichern |

### Notfall-Logs sichern

```bash
docker logs tempconnect_api  > /tmp/api-incident-$(date +%s).log
docker logs tempconnect_migrate > /tmp/migrate-incident-$(date +%s).log
```

---

## 9. Pilot-Support-Prozess

### Pilot-Account einrichten

1. Org in DB anlegen (Staff Control Center → Org anlegen)
2. Owner-User zur Org hinzufügen
3. Korrekte Plan-Stufe aktivieren (Staff SCC → Subscription aktivieren)
4. Zugangsdaten sicher übermitteln (1Password / Signal — nie per E-Mail im Klartext)
5. Support-Kontakt für Pilot informieren

### Pilot-Probleme debuggen

```bash
# Welche Plan-Stufe hat die Org?
docker exec tempconnect_api node -e "
  import('../api/db/pool.js').then(async ({pool}) => {
    const { rows } = await pool.query('SELECT plan_key FROM organizations WHERE id = $1', ['<org-id>']);
    console.log(rows[0]);
  });
"

# Letzte Audit-Events für eine Org
# Via Staff SCC: GET /staff/api/audit-log?org_id=<org-id>
```

### Eskalationspfad Pilot

```
Pilot-User meldet Problem
  → Support-Kontakt (< 4h Reaktion)
  → Falls kein Fix: Tech Lead
  → Falls Datenverlust/Security: Sofort Owner
```

---

## 10. Production Compose — Konfiguration

**Datei:** `docker-compose.prod.yml`

**Änderungen WAVE 12:**
- `.claude` Dev-Mounts aus `api`- und `frontend`-Services entfernt
- Nur produktionsrelevante Mounts bleiben erhalten

**Erlaubte Volumes in Production:**

| Service | Volume | Typ |
|---|---|---|
| `migrate` | `./sql/migrate.sh`, `./sql/migrations` | Config-Mounts (read-only) |
| `frontend` | `./frontend`, `./support-ops-dist`, `./nginx/nginx.conf` | Static files (read-only) |
| `api` | Keine lokalen Source-Mounts | — |

**Verboten in Production:**
- `./node_modules` mounts
- `./.claude` mounts
- `./api/src` oder `./api/routes` source mounts
- Development-Override-Mounts

---

*Letzte Aktualisierung: WAVE 12 — Phase 2 — 2026-05-27*
*Zuständig: Operations (Claude), Freigabe: Owner*
