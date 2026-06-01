# TempConnect — Backup & Restore Test Template

> Erstellt: 2026-05-28 | Enterprise Pack | I-01
> Zweck: Nachweis-Template für Backup/Restore-Dry-Run vor Go-Live.
> Status: Dry-Run NOCH NICHT durchgeführt (Owner-Task I-01 ausstehend).

---

## Backup-Infrastruktur

### Verfügbare Scripts

| Script | Zweck |
|---|---|
| `scripts/backup.sh` | Vollständiges PostgreSQL-Dump erstellen |
| `scripts/backup-verify.sh` | Dump-Datei auf Integrität prüfen |
| `scripts/restore.sh` | Dump in Zieldatenbank einspielen |
| `scripts/restore-test.sh` | Restore in Staging/Test-Umgebung |

### Dokumentation

- `docs/BACKUP.md` — Backup-Konzept und Konfiguration
- `docs/BACKUP_DISASTER_RECOVERY.md` — Disaster Recovery Runbook

---

## Dry-Run Checkliste (vor Go-Live)

### Voraussetzungen

- [ ] Produktions-Datenbank läuft auf Hetzner
- [ ] Staging-Umgebung verfügbar (separater DB-Container)
- [ ] `DATABASE_URL` für Staging-DB gesetzt
- [ ] Backup-Zielverzeichnis mit ausreichend Speicherplatz

### Schritt 1: Backup erstellen

```bash
# Vollständiges Dump
./scripts/backup.sh

# Erwartetes Ergebnis:
# - Dump-Datei unter backups/YYYY-MM-DD_HH-MM-SS.dump
# - Exitcode: 0
# - Dateigröße: > 0 Bytes
```

- [ ] Backup-Script erfolgreich (Exitcode 0)
- [ ] Dump-Datei existiert und ist > 0 Bytes
- [ ] Datum/Zeit im Dateinamen korrekt

### Schritt 2: Integrität prüfen

```bash
./scripts/backup-verify.sh backups/YYYY-MM-DD_HH-MM-SS.dump

# Erwartetes Ergebnis:
# - Checksumme valide
# - Dump-Format: custom (nicht korrupt)
```

- [ ] Verify-Script erfolgreich (Exitcode 0)
- [ ] Keine Fehlermeldungen

### Schritt 3: Restore in Staging

```bash
# Staging-DB muss leer/bereit sein
./scripts/restore-test.sh backups/YYYY-MM-DD_HH-MM-SS.dump $STAGING_DATABASE_URL

# Erwartetes Ergebnis:
# - Alle Tabellen erstellt
# - Zeilenzahlen entsprechen Original
# - Kein Fehler
```

- [ ] Restore-Script erfolgreich (Exitcode 0)
- [ ] Tabellen-Check: `users`, `organizations`, `subscriptions`, `requisitions`, `timesheets`, `audit_log` vorhanden
- [ ] Zeilenzahl Produktions-DB ≈ Zeilenzahl Staging-DB (Toleranz: 0)

### Schritt 4: Applikations-Smoke-Test

Nach Restore:

- [ ] API startet in Staging (`GET /health` → 200)
- [ ] Login-Flow funktioniert
- [ ] Ein Testbenutzer kann sich einloggen
- [ ] Keine DB-Schema-Fehler im Log

### Schritt 5: Dokumentation

| Feld | Wert |
|---|---|
| Dry-Run Datum | ________________ |
| Durchgeführt von | ________________ |
| Backup-Dateigröße | ________________ |
| Backup-Dauer | ________________ |
| Restore-Dauer | ________________ |
| Tabellen nach Restore | ________________ |
| Smoke-Test-Ergebnis | ________________ |
| Anmerkungen | ________________ |

---

## Produktions-Backup-Konfiguration

| Parameter | Wert | Quelle |
|---|---|---|
| Backup-Frequenz | Täglich (Cron) | `docs/BACKUP.md` |
| Aufbewahrung | 14 Tage | `docs/BACKUP.md` |
| Speicherort | Hetzner Object Storage oder Volume | `docs/DEPLOYMENT_HETZNER.md` |
| Verschlüsselung | Empfohlen (AES-256) | `docs/TOMS.md` Abschnitt 8 |
| Restore-Ziel | Separater DB-Container (nicht Prod) | `scripts/restore-test.sh` |

---

## Recovery Time Objective (RTO) / Recovery Point Objective (RPO)

| Metrik | Zielwert | Stand |
|---|---|---|
| **RPO** (maximaler Datenverlust) | 24 Stunden | Tägliches Backup |
| **RTO** (Zeit bis Wiederherstellung) | < 2 Stunden | Geschätzt — noch nicht gemessen |
| **RTO gemessen** | ________________ | Nach Dry-Run ausfüllen |

---

## Offene Owner-Aufgabe (I-01)

**Status:** Ausstehend vor Go-Live
**Verantwortlich:** Owner
**Aufwand:** 2 Stunden
**Akzeptanzkriterium:** Dry-Run durchgeführt, obige Checkliste vollständig abgehakt, Tabelle ausgefüllt.
