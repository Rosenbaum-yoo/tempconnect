# TempConnect – Deployment & Operations

Diese Datei beschreibt den kanonischen Produktionspfad für TempConnect. Produktion wird aus einem **verifizierten Release-Artefakt** betrieben – nicht aus einem offenen Working Tree.

---

## Produktionsmodell

- **Release-Quelle:** verifiziertes CI-Artefakt aus einem Git-Ref (`release-artifact` in `.github/workflows/ci.yml`)
- **Kanonischer Compose-Pfad:** `docker-compose.prod.yml`
- **Optionaler Overlay:** `docker-compose.prod.managed.yml` für Managed Redis
- **Datenbank-Modell:** Managed PostgreSQL über `DATABASE_URL`
- **Host-Port in Produktion:** nur Frontend auf `127.0.0.1:${FRONTEND_PORT:-8080}:80`
- **API-Erreichbarkeit:** über Frontend/Reverse Proxy, nicht direkt als öffentlicher Host-Port 3000
- **Konfiguration:** `.env` liegt im entpackten Release-Verzeichnis und wird aus `.env.prod.example` abgeleitet

---

## Frontend-Build (React: OCC + SCC)

Die React-Oberflächen werden aus dem Quellcode (`frontend/src/`) erzeugt — nicht aus dem Repo bezogen:

- **OCC** (`build:occ`) → `frontend/owner-control/` (gitignored)
- **SCC** (`build:scc`) → `frontend/public/staff/` (`staff.html` + `assets/*`)
- **SOC** (`build:soc`) → `frontend/support-ops/`; ausgeliefert wird SOC separat aus `./support-ops-dist` (eigener Mount).

**Automatisch beim Deploy:** Der Compose-Service `frontend-build` (in `docker-compose.yml` + `docker-compose.prod.yml`) läuft als Einmal-Job `npm ci && npm run build:occ && npm run build:scc` in den gemounteten `./frontend`-Baum, **bevor** nginx serviert (`frontend.depends_on: frontend-build: service_completed_successfully`). Damit existieren OCC/SCC bei jedem `docker compose up` frisch — auch das gitignorte `owner-control/`.

**Verifikation (einmalig vor erstem Verlass darauf):**
```bash
docker compose -f docker-compose.prod.yml up -d
# erwartet: Service tempconnect_frontend_build endet mit Code 0; danach startet nginx
ls frontend/owner-control/index.html frontend/public/staff/staff.html   # müssen existieren
```

**Offen (bewusst gated): staff/support-Bundles aus Git nehmen.** Die gehashten Build-Artefakte
(`frontend/public/staff/`) sind derzeit noch **getrackt** (erzeugen Dev-Diff-Churn). Sie können
nach erfolgreicher Build-on-Deploy-Verifikation entfernt werden:
```bash
git rm -r --cached frontend/public/staff
echo "frontend/public/staff/" >> .gitignore
```
**Rollback:** Falls ein Deploy danach OCC/SCC nicht baut → `git revert <commit>` stellt die committeten
Bundles sofort wieder her. Erst untracken, wenn ein realer Deploy die Regenerierung bestätigt hat.

---

## Release-Artefakt beziehen

Der kanonische Release-Pfad läuft über die CI:

1. Git-Ref oder Release-Tag festlegen
2. CI für diesen Stand vollständig grün laufen lassen
3. Artefakt `release-artifact` aus GitHub Actions herunterladen

Die CI prüft vor dem Upload denselben Kernstandard:

- keine `.env`-Dateien im Artefakt
- kein `.git`
- keine `.github`
- keine `node_modules`
- keine Coverage-/Temp-/Log-Artefakte
- Pflichtdateien für den Produktionsbetrieb sind im Artefakt enthalten

---

## Deployment auf dem Server

Empfohlene Struktur:

- `/opt/tempconnect/releases/` – entpackte versionierte Releases
- `/opt/tempconnect/shared/.env` – produktive Secrets und Runtime-Konfiguration

### Standardablauf

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

### Managed Redis Overlay

```bash
MANAGED_REDIS=1 ./scripts/prod-update.sh
```

`prod-update.sh` ist artefaktfähig: Wenn kein `.git` vorhanden ist, wird **kein** `git pull` erzwungen.

---

## Health- und Smoke-Checks

Nach jedem Deploy mindestens diese Checks ausführen:

```bash
curl -sf http://127.0.0.1:8080/health
curl -sf http://127.0.0.1:8080/api/health
curl -sf http://127.0.0.1:8080/api/service-status | python3 -m json.tool
curl -sf -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:8080/api/admin/status | python3 -m json.tool
INTERNAL_CRON_SECRET=$INTERNAL_CRON_SECRET ./scripts/scheduler-smoke.sh http://127.0.0.1:8080
```

Prüfkriterien:

- `/health` liefert 200
- `/api/health` liefert 200
- `/api/service-status` zeigt nur erwartete Stati (`ok` / `configured`)
- Admin-Status meldet `migrations.pending = 0`
- Scheduler-Smoke läuft ohne 5xx/403/Timeout

---

## Backup, Verify, Restore

### Backup vor jeder Produktionsänderung

```bash
./scripts/backup.sh
LATEST=$(ls -td backups/*/ | head -1)
./scripts/backup-verify.sh "$LATEST"
```

### Restore

```bash
./scripts/restore.sh backups/DATUM --dry-run
./scripts/restore.sh backups/DATUM --force
./scripts/restore-test.sh backups/DATUM
```

Minimaler DR-Standard für den kanonischen Produktionspfad:
- tägliches Backup plus Provider-PITR, wenn Managed PostgreSQL genutzt wird
- vor jedem Deploy letztes verifiziertes Backup dokumentieren
- mindestens monatlich `./scripts/restore-test.sh <backup-dir>` gegen ein verifiziertes Backup ausführen
- RPO/RTO, Restore-Fenster und Verantwortliche pro Zielumgebung separat dokumentieren

---

## Rollback

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

Voraussetzung: Release enthielt eine nicht abwärtskompatible Schemaänderung.

```bash
LAST_GOOD_RELEASE=/opt/tempconnect/releases/tempconnect-v2026.04.05
LAST_BACKUP=/opt/tempconnect/backups/2026-04-07T101500Z
cp /opt/tempconnect/shared/.env "$LAST_GOOD_RELEASE/.env"
cd "$LAST_GOOD_RELEASE"
./scripts/prod-down.sh
./scripts/restore.sh "$LAST_BACKUP" --force
./scripts/prod-up.sh
```

Rollback-Inputs müssen vor jedem Deploy dokumentiert sein:

- letzter stabiler Release-Pfad
- letzter stabiler Commit/Tag
- letztes verifiziertes Backup

---

## Reverse Proxy & Firewall

Produktion läuft hinter Caddy oder Nginx auf dem **Host**:

- öffentliche Ports: nur `22`, `80`, `443`
- Frontend-Container: nur `127.0.0.1:8080`
- API-Port `3000`: nicht öffentlich exponieren
- PostgreSQL `5432`: nicht öffentlich exponieren
- Redis `6379`: nicht öffentlich exponieren

Externe Checks laufen typischerweise gegen:

- `https://deine-domain.de/health`
- `https://deine-domain.de/api/health`

---

## Hetzner Single-VM Kurzpfad

1. Server, Domain, SSH und Docker bereitstellen
2. Release-Artefakt aus CI herunterladen
3. Artefakt nach `/opt/tempconnect/releases` kopieren und entpacken
4. `.env` aus sicherem Store in das Release legen
5. `./scripts/prod-up.sh` oder `./scripts/prod-update.sh` ausführen
6. Host-seitig Caddy/Nginx für TLS und Reverse Proxy konfigurieren

---

## Referenzen

- `.github/workflows/ci.yml` – kanonischer CI-Artefaktpfad (`release-artifact`)
- `README.md` – Einstieg und Artefaktüberblick
- `docs/GO_LIVE_FINAL.md` – Go-Live-Checkliste
- `docs/MONITORING.md` – Prometheus, Grafana, Alerting
- `docker-compose.prod.yml` – kanonischer Produktions-Compose-Stack
- `scripts/prod-up.sh` – Produktionsstart
- `scripts/prod-update.sh` – artefaktfähiges Update mit Backup und Healthcheck
- `scripts/backup.sh` – Backup-Erstellung
- `scripts/backup-verify.sh` – Backup-Verifikation
- `scripts/restore.sh` – Restore aus verifiziertem Backup
- `scripts/restore-test.sh` – isolierter Restore-Test
