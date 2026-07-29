# TempConnect — Release Runbook

**Zielgruppe:** Release Engineer, DevOps, On-Call
**Gültig für:** Produktionsdeployments mit `docker-compose.prod.yml`

---

## Grundsätze

1. **Kein Deployment ohne CI-Green.** Alle 6 CI-Jobs müssen grün sein.
2. **Kein Deployment ohne Release-Artefakt.** Produktion wird aus einem verifizierten Artefakt aus einem Git-Ref betrieben.
3. **Kein Deployment ohne Backup.** Vor jeder Produktionsänderung wird ein Backup erstellt und verifiziert.
4. **Kein Deployment ohne Smoke-Test.** Health-, Scheduler- und Admin-Checks sind Pflicht.
5. **Rollback-Inputs müssen bekannt sein.** Letztes stabiles Release, letzter stabiler Tag/Commit und letztes verifiziertes Backup sind dokumentiert.
6. **Produktionsrealität schlägt Annahmen.** Maßgeblich sind `docker-compose.prod.yml`, die tatsächlichen Skripte und die hostseitig erreichbaren Endpunkte auf `127.0.0.1:8080`.

---

## 1. Release-Ablauf

1. Release-Ref festlegen (Commit oder Tag)
2. CI prüfen (6 Jobs)
3. Lokale QA und Migrations-Review abschließen
4. Release-Artefakt aus dem Git-Ref bauen oder aus CI herunterladen
5. Backup erstellen und verifizieren
6. Artefakt auf den Server deployen
7. Smoke-Tests ausführen
8. Monitoring für mindestens 30 Minuten beobachten
9. Release freigeben oder Rollback auslösen

---

## 2. CI-Pipeline

Die CI in `.github/workflows/ci.yml` muss vollständig grün sein:

1. `lint-typecheck`
2. `frontend-lint`
3. `unit-tests`
4. `integration-tests`
5. `docker-build`
6. `release-artifact`

### CI-Status prüfen

```bash
gh run list --branch master --limit 5
gh run view --exit-status
```

`release-artifact` ist dabei kein optionaler Komfort-Job, sondern der Nachweis, dass aus dem freigegebenen Git-Stand ein sauberes Artefakt erzeugt und erneut validiert werden kann.

---

## 3. Pre-Release-QA

### Lokale QA

```bash
cd api && npm run verify
cd api && npm run qa:full
```

### Migrations-Review

```bash
git --no-pager diff HEAD~5..HEAD --name-only -- sql/migrations/
```

Vor jedem Release mit Datenbankschema-Änderungen prüfen:

- keine destruktiven Überraschungen
- Idempotenz, wo sinnvoll
- klares Rollback-Verständnis
- keine Vermischung von heikler Migration und fachlich breiten Änderungen in einem unklaren Release

---

## 4. Release-Artefakt erzeugen

**Kanonisch ist der CI-Job `release-artifact`** in [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml)
— so steht es auch in der Go-Live-Checkliste ([`GO_LIVE_FINAL.md`](GO_LIVE_FINAL.md)). Ein auf
einem Entwicklungsrechner gebautes Artefakt trägt dessen Zustand mit sich; das aus der CI ist
reproduzierbar und an einen grünen Lauf gebunden.

### Ablauf

1. Git-Ref oder Release-Tag festlegen
2. CI für diesen Stand vollständig grün laufen lassen
3. Artefakt `release-artifact` aus GitHub Actions herunterladen

### Rückfallweg: lokal bauen

Nur wenn die CI nicht verfügbar ist. Das Ergebnis vor dem Ausrollen gegen die
Validierungsregeln unten prüfen.

```bash
./scripts/release-package.sh v2026.04.07 <git-ref>
```

```powershell
.\scripts\release-package.ps1 -Version v2026.04.07 -Ref <git-ref>
```

### Validierungsregeln des Artefakts

Das Artefakt darf insbesondere **nicht** enthalten:

- `.env`
- `.git`
- `.github`
- `node_modules`
- `coverage`, `.c8_output`, `.nyc_output`
- Log-, Temp- oder alte Release-Artefakte
- fehlende Pflichtdateien wie `docker-compose.prod.yml`, `scripts/prod-update.sh`,
  `scripts/prod-up.sh`, Backup-/Restore-Skripte oder `README.md`

Das Artefakt enthält ein Manifest mit Quelle (`git-archive` oder Fallback), Git-Ref und SHA-256.

---

## 5. Pre-Deploy

### Release markieren

```bash
VERSION="v$(date +%Y.%m.%d)-$(git rev-parse --short HEAD)"
git tag -a "$VERSION" -m "Release $VERSION"
git push origin "$VERSION"
```

### Backup erstellen und verifizieren

```bash
./scripts/backup.sh
LATEST=$(ls -td backups/*/ | head -1)
./scripts/backup-verify.sh "$LATEST"
```

Wenn `backup-verify.sh` fehlschlägt, wird **nicht** deployed.

### Rollback-Inputs dokumentieren

Vor dem Deploy festhalten:

- `LAST_GOOD_RELEASE`
- `LAST_GOOD_TAG` oder `LAST_GOOD_COMMIT`
- `LAST_BACKUP`

---

## 6. Deployment

### Kanonischer Deployment-Pfad

Empfohlene Serverstruktur:

- `/opt/tempconnect/releases/` – versionierte Releases
- `/opt/tempconnect/shared/.env` – produktive Runtime-Konfiguration

### Standard-Deployment

```bash
VERSION=v2026.04.07
mkdir -p /opt/tempconnect/releases
cp tempconnect-${VERSION}.tar.gz /opt/tempconnect/releases/
cd /opt/tempconnect/releases
tar -xzf tempconnect-${VERSION}.tar.gz
cp /opt/tempconnect/shared/.env /opt/tempconnect/releases/tempconnect-${VERSION}/.env
cd /opt/tempconnect/releases/tempconnect-${VERSION}
./scripts/prod-update.sh
```

### Deployment mit Managed Redis Overlay

```bash
MANAGED_REDIS=1 ./scripts/prod-update.sh
```

### Wichtige Realität des Deploy-Pfads

- `prod-update.sh` führt nur dann `git pull` aus, wenn wirklich ein Git-Checkout vorliegt.
- Ein entpacktes Release-Artefakt ist daher ein vollwertiger Produktionsstand.
- Maßgeblich ist `docker-compose.prod.yml`, nicht `docker-compose.yml` oder dev-orientierte Overrides.

---

## 7. Smoke-Tests

### Health-Checks

```bash
curl -sf http://127.0.0.1:8080/health
curl -sf http://127.0.0.1:8080/api/health
curl -sf http://127.0.0.1:8080/api/ready
curl -sf http://127.0.0.1:8080/api/service-status | python3 -m json.tool
```

### Admin-Status

```bash
curl -sf -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:8080/api/admin/status | python3 -m json.tool
```

Wichtige Prüfpunkte:

- `database.connected = true`
- `migrations.pending = 0`
- `uptime_s > 0`
- keine offensichtlichen Fehler im Komponentenstatus

### Scheduler-Smoke

```bash
INTERNAL_CRON_SECRET=$INTERNAL_CRON_SECRET ./scripts/scheduler-smoke.sh http://127.0.0.1:8080
```

### Migrations-Status

```bash
docker logs tempconnect_migrate
```

Wenn zusätzliche Prüfung nötig ist, ist der Admin-Status der bevorzugte Runtime-Nachweis. Ein lokaler `tempconnect_db`-Container ist **nicht** Teil des kanonischen Produktionsmodells.

### Manuelle UI-Stichprobe

- Login
- Dashboard
- mindestens ein kritischer Kernpfad des aktuellen Releases
- bei produktionsnahen Business-Releases zusätzlich Requisition / Deal / Timesheet prüfen

---

## 8. Monitoring nach dem Deploy

### Prometheus / Alertmanager

```bash
curl -sf http://localhost:9090/api/v1/alerts
curl -sf http://localhost:9093/api/v2/alerts
```

### Grafana

- Operations-Dashboard prüfen
- Alerts & SLO prüfen
- Error-Rate, Latenz und Ressourcennutzung im Blick behalten

### Container / Logs

```bash
docker compose -f docker-compose.prod.yml ps
docker logs tempconnect_api --since=5m
docker stats --no-stream
```

### Beobachtungsphase

Ein Release gilt erst als belastbar, wenn nach etwa 30 Minuten gilt:

- keine aktiven Alerts
- Health stabil
- keine auffälligen Fehler-Logs
- Memory und CPU ohne anhaltende Ausreißer
- keine fachlichen Fehlermeldungen aus dem Pilotbetrieb

---

## 9. Rollback

### Code-Rollback ohne DB-Restore

Voraussetzung: keine inkompatible Migration.

```bash
CURRENT_RELEASE=/opt/tempconnect/releases/tempconnect-v2026.04.07
LAST_GOOD_RELEASE=/opt/tempconnect/releases/tempconnect-v2026.04.05
cp /opt/tempconnect/shared/.env "$LAST_GOOD_RELEASE/.env"
cd "$CURRENT_RELEASE" && ./scripts/prod-down.sh
cd "$LAST_GOOD_RELEASE" && ./scripts/prod-up.sh
```

### Vollständiger Rollback mit Restore

Voraussetzung: das fehlerhafte Release hat das Schema inkompatibel verändert oder Daten korrumpiert.

```bash
LAST_GOOD_RELEASE=/opt/tempconnect/releases/tempconnect-v2026.04.05
LAST_BACKUP=/opt/tempconnect/backups/2026-04-07T101500Z
cp /opt/tempconnect/shared/.env "$LAST_GOOD_RELEASE/.env"
cd "$LAST_GOOD_RELEASE"
./scripts/prod-down.sh
./scripts/restore.sh "$LAST_BACKUP" --force
./scripts/prod-up.sh
```

### Transiente Fehler ohne Rollback

```bash
docker compose -f docker-compose.prod.yml restart api
```

oder, wenn der gesamte Stack neu initialisiert werden soll:

```bash
./scripts/prod-up.sh
```

---

## 10. Deployment-Checkliste

### Vor dem Deploy

- [ ] 6/6 CI-Jobs grün
- [ ] Release-Artefakt aus richtigem Git-Ref vorhanden
- [ ] lokale QA / Freigabe abgeschlossen
- [ ] Migrations-Review abgeschlossen
- [ ] Backup erstellt und verifiziert
- [ ] letzter stabiler Release und letztes Backup dokumentiert

### Direkt nach dem Deploy

- [ ] `GET /health` → 200
- [ ] `GET /api/health` → 200
- [ ] `GET /api/service-status` plausibel
- [ ] `GET /api/admin/status` ohne offene Migrationen
- [ ] Scheduler-Smoke erfolgreich
- [ ] keine offensichtlichen Fehler in Container-Logs

### Beobachtungsphase

- [ ] keine Alerts
- [ ] keine wachsende Fehlerrate
- [ ] keine regressiven Business-Fehler
- [ ] Rollback nicht erforderlich

---

## 11. Hotfix-Prozedur

1. Hotfix-Branch anlegen
2. Fix implementieren und lokal verifizieren
3. CI vollständig grün laufen lassen
4. Release-Artefakt für den Hotfix bauen
5. Backup erstellen
6. Hotfix deployen
7. Smoke-Tests und Monitoring **nicht** überspringen

Beispiel:

```bash
git checkout -b hotfix/beschreibung master
cd api && npm run verify
git checkout master
git merge --no-ff hotfix/beschreibung
```

Danach normaler Artefakt- und Deploy-Pfad.

---

## 12. Schnellreferenz

### Artefakt

```bash
./scripts/release-package.sh v2026.04.07 <git-ref>
```

### Backup

```bash
./scripts/backup.sh
LATEST=$(ls -td backups/*/ | head -1)
./scripts/backup-verify.sh "$LATEST"
```

### Deploy

```bash
./scripts/prod-update.sh
```

### Smoke

```bash
curl -sf http://127.0.0.1:8080/health
curl -sf http://127.0.0.1:8080/api/health
curl -sf http://127.0.0.1:8080/api/service-status
INTERNAL_CRON_SECRET=$INTERNAL_CRON_SECRET ./scripts/scheduler-smoke.sh http://127.0.0.1:8080
```

### Rollback

```bash
./scripts/prod-down.sh
./scripts/restore.sh <BACKUP> --force
./scripts/prod-up.sh
```

---

## Verwandte Dokumentation

- `DEPLOYMENT.md` – technischer Produktionspfad
- [`GO_LIVE_FINAL.md`](GO_LIVE_FINAL.md) – Go-Live-Checkliste (kanonisch; `GO-LIVE.md` im Wurzelverzeichnis ist nur noch ein Wegweiser)
- `docs/BACKUP.md` – Backup, Verify, Restore
- `docs/BACKUP_DISASTER_RECOVERY.md` – DR-Konzept
- `docs/MONITORING.md` – Monitoring und Alerting
