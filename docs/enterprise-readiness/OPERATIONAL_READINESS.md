# TempConnect — Operational Readiness

> Betriebsbereitschaft: Health-Endpoints, Monitoring, Backup/Restore, Runbooks.
> WAVE 15 — Phase 2 — 2026-05-27

---

## Health & Readiness Endpoints

| Endpoint | Zweck | Status | Auth |
|---|---|---|---|
| `GET /health` | LB Liveness (kein DB) | ✅ Aktiv | Nein |
| `GET /api/health` | API Health (DB-Ping) | ✅ Aktiv | Nein |
| `GET /api/ready` | Readiness (DB erreichbar?) | ✅ Aktiv | Nein |
| `GET /api/live` | Liveness (Prozess läuft?) | ✅ Aktiv | Nein |
| `GET /api/service-status` | Komponentenstatus | ✅ Aktiv | Nein |
| `GET /api/public/system-status` | Trust Center Status | ✅ Aktiv | Nein |
| `GET /api/admin/status` | Vollständiger Status | ✅ Aktiv | X-Admin-Secret |

---

## Monitoring

| Komponente | Implementierung | Status |
|---|---|---|
| Prometheus Metrics | `GET /metrics` (Admin-Secret) | ✅ Aktiv |
| DB Pool Metrics | `registerDbPoolMetrics(pool)` | ✅ Aktiv |
| Error Tracking | Sentry (via `SENTRY_DSN` ENV) | ✅ Optional |
| Strukturierte Logs | Pino (JSON + Correlation-ID) | ✅ Aktiv |
| Log Rotation | Docker `json-file` (50MB, 5 Files) | ✅ Aktiv |

---

## Backup

**Script:** `scripts/backup.sh`

```bash
# Vollbackup (DB + Uploads)
./scripts/backup.sh

# Nur DB
./scripts/backup.sh --db-only
```

**Features:**
- Erkennt automatisch: Managed DB (DATABASE_URL) vs. Docker-Container
- Format: `pg_dump` Custom-Format (`.dump`)
- Manifest mit SHA-256-Checksums
- Automatische Retention (Standard: 30 Tage)
- Status-File für Monitoring (`last_success_epoch`)

**Empfehlung:** Tägliche Ausführung via Cron, Backup auf getrenntem Storage.

---

## Restore

**Scripts:** `scripts/restore.sh` + `scripts/restore-test.sh`

```bash
# Restore
./scripts/restore.sh backups/2026-05-27_020000

# Automatisierter Restore-Test (ohne Produktionsdaten zu überschreiben)
./scripts/restore-test.sh backups/2026-05-27_020000
```

**Restore Drill:** Mindestens 1× vor Pilot Go-Live, danach monatlich.
**Vollständige Dokumentation:** `docs/BACKUP_DISASTER_RECOVERY.md`

---

## Runbooks

| Runbook | Pfad | Abdeckung |
|---|---|---|
| Operations | `docs/engineering/OPERATIONS_RUNBOOK.md` | Deployment, Backup, Restore, Incident, Pilot-Support |
| Incident | `docs/INCIDENT_RUNBOOK.md` | SEV-1/2/3, Eskalation, Kommunikation |
| Release | `docs/RELEASE_RUNBOOK.md` | Deployment, Rollback, Migrations |
| Hetzner HA | `docs/HETZNER_HA_RUNBOOK.md` | Hochverfügbarkeit |
| Backup/DR | `docs/BACKUP_DISASTER_RECOVERY.md` | Katastrophenwiederherstellung |

---

## Production Compose

**Datei:** `docker-compose.prod.yml`

- Kein Dev-Mounts (`.claude` entfernt in WAVE 12)
- Redis für Session + Rate-Limiting
- Health-Checks auf allen Services
- Log-Rotation konfiguriert
- Keine Bind-Mounts auf Source-Code (nur Config + Static Files)

---

## SLA-Ziele (intern)

| Kategorie | Ziel |
|---|---|
| API Availability | 99.5% |
| Datenbankverbindung | 99.9% |
| Security-Patches (Critical) | < 72h |
| Security-Patches (High) | < 7 Tage |
| Incident Response (SEV-1) | < 15 Minuten |
| Backup-Frequenz | Täglich |
| Restore-Drill | Monatlich |

---

*WAVE 15 — Phase 2 — 2026-05-27*
