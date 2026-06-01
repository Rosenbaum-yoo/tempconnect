# TempConnect — Backup & Restore

## Überblick

Dieses Dokument beschreibt den vollständigen Backup- und Restore-Prozess für TempConnect.
Ziel: **Echte Wiederherstellbarkeit**, nicht Scheinsicherheit.

### Was wird gesichert

| Datentyp | Beschreibung | Backup-Format |
|---|---|---|
| PostgreSQL-Datenbank | Alle Geschäftsdaten (Users, Subscriptions, Listings, Requests, Offers, Timesheets, Invoices, Compliance-Docs, Audit-Trail) | `pg_dump` Custom-Format (`.dump`) |
| Upload-Dateien | Angebotsbilder, Logos, Compliance-Dokumente (`/app/uploads/`) | `tar.gz` Archiv |
| Manifest | Checksums, Zeitstempel, Metadaten | `manifest.json` |

### Was NICHT gesichert werden muss

| Datentyp | Grund |
|---|---|
| Redis | Reiner Cache (`allkeys-lru`), wird automatisch neu aufgebaut |
| SQL-Migrations | In Git versioniert (`sql/migrations/`) |
| Frontend-Dateien | In Git versioniert (`frontend/`) |
| Docker Images | Werden per `docker compose build` neu erstellt |

### Was separat gesichert werden muss

| Datentyp | Empfehlung |
|---|---|
| `.env` Datei (Secrets) | Manuell in Passwort-Manager oder verschlüsseltem Speicher |
| SSL-Zertifikate | Certbot erneuert automatisch; bei Bedarf `/etc/letsencrypt/` sichern |

---

## Backup-Konzept

### Architektur

```
backups/
└── 2026-03-13_083000/
    ├── db.dump              # PostgreSQL Custom-Format (komprimiert)
    ├── uploads.tar.gz       # Alle Upload-Dateien
    └── manifest.json        # Checksums + Metadaten
```

### Konsistenz-Strategie

Die Skripte stellen sicher, dass DB und Uploads zusammengehören:

- **Backup**: DB-Dump zuerst (Snapshot-Zeitpunkt), dann Uploads
- **Restore**: Uploads zuerst, dann DB (damit DB-Referenzen auf vorhandene Dateien zeigen)
- **Manifest**: Dokumentiert den exakten Zeitpunkt beider Operationen

### DB-Erkennung

Die Skripte erkennen automatisch das Setup:

- **`DATABASE_URL` gesetzt** → Managed DB (Hetzner, AWS RDS, etc.) → `pg_dump`/`pg_restore` direkt
- **`DATABASE_URL` nicht gesetzt** → Lokaler Docker-Container → `pg_dump`/`pg_restore` via `docker exec`

### Aufbewahrung

- Default: **30 Tage** (konfigurierbar via `BACKUP_RETENTION_DAYS`)
- Alte Backups werden automatisch am Ende jedes Backup-Laufs gelöscht
- Empfehlung: Mindestens 7 Tages-Backups + 4 Wochen-Backups behalten

### Speicherort

- Default: `./backups/` im Projektverzeichnis (in `.gitignore`)
- Konfigurierbar: `BACKUP_DIR=/mnt/external-backup ./scripts/backup.sh`
- **Empfehlung Produktion**: Auf einem separaten Volume/Mount speichern, nicht auf derselben Disk wie die DB

---

## Restore-Konzept

### Grundprinzipien

1. **Integritätsprüfung zuerst** — SHA-256 Checksums werden vor jedem Restore geprüft
2. **Uploads vor DB** — Dateien werden zuerst extrahiert, damit DB-Referenzen stimmen
3. **Sicherheitsnetz** — Bestehende Uploads werden vor dem Überschreiben in `/app/uploads.pre-restore` kopiert
4. **Interaktive Bestätigung** — Kein versehentliches Überschreiben ohne explizites `ja`
5. **Dry-Run möglich** — `--dry-run` prüft alles, ändert nichts

### Restore-Modi

| Modus | Befehl | Beschreibung |
|---|---|---|
| Vollrestore | `./scripts/restore.sh backups/DATUM` | DB + Uploads |
| Nur DB | `./scripts/restore.sh backups/DATUM --db-only` | Nur Datenbank |
| Nur Uploads | `./scripts/restore.sh backups/DATUM --uploads-only` | Nur Dateien |
| Dry-Run | `./scripts/restore.sh backups/DATUM --dry-run` | Nur prüfen |
| Unattended | `./scripts/restore.sh backups/DATUM --force` | Ohne Bestätigung |

---

## Schritt-für-Schritt-Anleitungen

### Backup erstellen

```bash
# Vollbackup (empfohlen)
./scripts/backup.sh

# Nur Datenbank
./scripts/backup.sh --db-only

# Nur Uploads
./scripts/backup.sh --uploads-only

# Mit anderem Speicherort
BACKUP_DIR=/mnt/backup ./scripts/backup.sh

# Mit kürzerer Aufbewahrung (7 Tage)
BACKUP_RETENTION_DAYS=7 ./scripts/backup.sh
```

### Backup prüfen

```bash
# Einzelnes Backup verifizieren
./scripts/backup-verify.sh backups/2026-03-13_083000

# Alle Backups prüfen
for dir in backups/*/; do
  echo "=== $dir ==="
  ./scripts/backup-verify.sh "$dir"
  echo ""
done
```

### Restore durchführen

**VORHER:**
1. Aktuelles Backup erstellen: `./scripts/backup.sh`
2. Team informieren (Downtime)
3. Backup verifizieren: `./scripts/backup-verify.sh backups/DATUM`

```bash
# 1. Dry-Run (empfohlen — prüft ohne Änderung)
./scripts/restore.sh backups/2026-03-13_083000 --dry-run

# 2. Restore durchführen
./scripts/restore.sh backups/2026-03-13_083000

# 3. Bestätigung: "ja" eingeben

# 4. Nach dem Restore:
curl -f http://localhost:3000/health    # API-Healthcheck
# → In der UI Stichproben prüfen
```

---

## Cron-Setup (Produktion)

### Tägliches Backup (empfohlen)

```bash
# crontab -e
# Täglich um 02:00 UTC, Logfile rotiert mit dem Datum
0 2 * * * /opt/tempconnect/scripts/backup.sh >> /var/log/tempconnect-backup.log 2>&1
```

### Mit Monitoring-Benachrichtigung

```bash
# Backup mit Fehlerbenachrichtigung (Beispiel mit curl an Webhook)
0 2 * * * /opt/tempconnect/scripts/backup.sh >> /var/log/tempconnect-backup.log 2>&1 || curl -s -X POST "https://hooks.example.com/backup-failed"
```

### Wöchentliche Verifizierung

```bash
# Sonntags um 06:00 — letztes Backup verifizieren
0 6 * * 0 LATEST=$(ls -td /opt/tempconnect/backups/*/ | head -1) && /opt/tempconnect/scripts/backup-verify.sh "$LATEST" >> /var/log/tempconnect-backup-verify.log 2>&1
```

### Logrotate

```
# /etc/logrotate.d/tempconnect-backup
/var/log/tempconnect-backup.log {
    weekly
    rotate 12
    compress
    missingok
    notifempty
}
```

---

## Restore-Testanleitung

### Warum testen?

Ein Backup ohne getesteten Restore ist kein Backup. Diese Anleitung beschreibt, wie der Restore **gefahrlos** validiert wird.

### Variante A: Lokaler Test (empfohlen, kein Risiko)

Diesen Test kann jeder Entwickler auf seinem Rechner durchführen:

```bash
# 1. Backup von Produktion auf lokalen Rechner kopieren
scp -r server:/opt/tempconnect/backups/2026-03-13_083000 ./test-backup/

# 2. Lokale Testumgebung starten (falls nicht läuft)
docker compose up -d

# 3. Verifizieren
./scripts/backup-verify.sh ./test-backup/2026-03-13_083000

# 4. Restore in lokale Umgebung
./scripts/restore.sh ./test-backup/2026-03-13_083000

# 5. Prüfen
curl http://localhost:3000/health
# → In der UI: Benutzer, Listings, Uploads prüfen
# → SQL: SELECT count(*) FROM users; SELECT count(*) FROM offer_assets;
```

### Variante B: Isolierter Container-Test

Für Teams, die die lokale DB nicht überschreiben wollen:

```bash
# 1. Separate Test-Instanz starten
docker run -d --name restore-test-db \
  -e POSTGRES_DB=tempconnect \
  -e POSTGRES_USER=tempconnect \
  -e POSTGRES_PASSWORD=testpw \
  postgres:16-alpine

# 2. Warten bis ready
until docker exec restore-test-db pg_isready -U tempconnect; do sleep 1; done

# 3. DB-Dump einspielen
docker cp backups/2026-03-13_083000/db.dump restore-test-db:/tmp/
docker exec restore-test-db pg_restore /tmp/db.dump \
  --dbname=tempconnect --username=tempconnect \
  --no-owner --no-privileges || true

# 4. Validieren
docker exec restore-test-db psql -U tempconnect -d tempconnect -c "
  SELECT 'users' AS t, count(*) FROM users
  UNION ALL
  SELECT 'listings', count(*) FROM listings
  UNION ALL
  SELECT 'subscriptions', count(*) FROM subscriptions;
"

# 5. Aufräumen
docker rm -f restore-test-db
```

### Validierungs-Checkliste

Nach jedem Restore (Test oder Ernstfall):

- [ ] `curl http://localhost:3000/health` → 200 OK
- [ ] Login als bestehender User möglich
- [ ] Listings werden in der Suche angezeigt
- [ ] Mindestens ein Upload-Bild wird korrekt geladen
- [ ] Tabellen-Zählung plausibel: `SELECT count(*) FROM users;`
- [ ] Migrations-Tabelle konsistent: `SELECT * FROM _migrations ORDER BY id;`

---

## Umgebungsvariablen

| Variable | Default | Beschreibung |
|---|---|---|
| `BACKUP_DIR` | `./backups` | Zielverzeichnis für Backups |
| `BACKUP_RETENTION_DAYS` | `30` | Aufbewahrungsdauer in Tagen |
| `DATABASE_URL` | — | Managed DB Connection String (Hetzner, AWS, etc.) |
| `DB_CONTAINER` | `tempconnect_db` | Name des PostgreSQL Docker-Containers |
| `API_CONTAINER` | `tempconnect_api` | Name des API Docker-Containers |

---

## Risiken und Voraussetzungen

### Voraussetzungen

- **bash** (Linux/macOS) — Die Skripte sind Bash-Skripte, nicht Windows-nativ
- **Docker** muss laufen und die Container müssen gestartet sein
- **pg_dump / pg_restore** — Bei Managed DB lokal installiert (meist via `postgresql-client`)
- **python3** — Für sicheres JSON-Parsing im Manifest (Fallback auf grep vorhanden)
- **sha256sum oder shasum** — Für Checksums (auf allen gängigen Systemen vorhanden)

### Bekannte Risiken

| Risiko | Beschreibung | Mitigation |
|---|---|---|
| **Disk voll** | Backup schlägt fehl wenn kein Platz | Speicherplatz überwachen; `BACKUP_DIR` auf separates Volume |
| **Managed DB Timeout** | Große DBs können bei pg_dump timeout erreichen | Hetzner: Timeout in Managed DB Console erhöhen |
| **Upload-Konsistenz** | Zwischen DB-Dump und Upload-Archiv können neue Uploads entstehen | Zeitfenster ist minimal (Sekunden); für absolute Konsistenz: API kurz stoppen |
| **Keine Verschlüsselung** | Backups liegen im Klartext | Für externe Speicherung: `gpg --symmetric` auf die Dateien anwenden |
| **Single-Point-of-Storage** | Wenn Backups auf derselben Disk wie die DB liegen | `BACKUP_DIR` auf externe Storage setzen (S3, separate Disk, Remote Mount) |
| **Keine Windows-Skripte** | Skripte laufen nicht nativ in Windows | Auf Windows: WSL, Git Bash, oder im Docker-Container ausführen |

### Was NICHT abgedeckt werden muss

- **Point-in-Time Recovery (PITR)** — Benötigt WAL-Archivierung; bei Managed DB vom Provider konfigurierbar. Anleitung: `docs/BACKUP_DISASTER_RECOVERY.md` Abschnitt 7.
- **Automatisches Off-Site Backup** — Manuell oder via Cron + `rclone`/`s3cmd` ergänzbar
- **Verschlüsselung at rest** — Manuell mit `gpg` ergänzbar
- **Automatischer Restore-Test** — Verfügbar via `scripts/restore-test.sh` (isolierter Container, kein Risiko für Produktionsdaten)

---

## Skript-Referenz

| Skript | Beschreibung |
|---|---|
| `scripts/backup.sh` | Erstellt Backup (DB + Uploads + Manifest) |
| `scripts/backup-verify.sh` | Prüft Backup auf Integrität |
| `scripts/restore.sh` | Stellt Backup wieder her |
| `scripts/restore-test.sh` | Automatisierter Restore-Test (isolierter Container) |

Alle Skripte unterstützen `--help` für vollständige Nutzungshinweise.

---

## Weiterführende Dokumentation

- **Disaster Recovery:** `docs/BACKUP_DISASTER_RECOVERY.md` — RPO/RTO, Szenario-Matrix, Post-Restore-Integritätsprüfung, PITR-Anleitung, Verantwortlichkeiten
- **Incident Runbook:** `docs/INCIDENT_RUNBOOK.md` — Sofortmaßnahmen bei DB-Ausfall, Disk-Full, Service-Crash
