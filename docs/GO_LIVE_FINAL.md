# TempConnect — Go-Live-Checkliste

> **Diese Datei ist die versionierte Go-Live-Checkliste.**
> Technische Details und Befehle stehen in `../DEPLOYMENT.md`; der kanonische Artefaktpfad ist der CI-Job `release-artifact` in `../.github/workflows/ci.yml`.

Stand: April 2026

---

## Bereits im Produkt verankert

- **Fail-fast Secrets:** Produktion startet nicht ohne `SESSION_SECRET`, `JWT_SECRET`, `INTERNAL_CRON_SECRET` und produktionsfähige Grundkonfiguration
- **Produktions-Compose:** `docker-compose.prod.yml` ist der kanonische Stack für Releases
- **Health-Endpunkte:** `GET /health`, `GET /api/health`, `GET /api/ready`, `GET /api/service-status`
- **Migrationspfad:** `migrate`-Container ist im Produktionsstack enthalten
- **Backups & Restore:** `backup.sh`, `backup-verify.sh`, `restore.sh`, `restore-test.sh` sind reale Skripte
- **Sicherheitsbasis:** Helmet, CORS-Allowlist, CSRF, Rate-Limits, Secure Cookies, `trust proxy`
- **Sessions:** PostgreSQL-basiert, damit mehrere API-Instanzen ohne Sticky Sessions möglich bleiben

---

## A) BLOCKER — Ohne diese Punkte nicht live gehen

### A1) Release- und Serverpfad

- [ ] Produktionsserver bereitgestellt
- [ ] Domain konfiguriert und DNS zeigt auf den Server
- [ ] SSH-Zugang getestet
- [ ] Docker und Docker Compose installiert
- [ ] Release-Artefakt aus einem Git-Ref gebaut oder aus CI heruntergeladen
- [ ] Deployment-Ziel für versionierte Releases festgelegt (z. B. `/opt/tempconnect/releases`)

### A2) Produktions-`.env`

Im Release-Verzeichnis muss eine echte `.env` liegen, abgeleitet aus `.env.prod.example`.

- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` zeigt auf die Managed DB (inkl. `?sslmode=require`, falls erforderlich)
- [ ] `SESSION_SECRET` gesetzt
- [ ] `JWT_SECRET` gesetzt
- [ ] `INTERNAL_CRON_SECRET` gesetzt
- [ ] `ADMIN_SECRET` gesetzt
- [ ] `BASE_URL=https://deine-domain.de`
- [ ] `CORS_ORIGIN=https://deine-domain.de`
- [ ] SMTP-Konfiguration gesetzt

### A3) Datenbank

- [ ] Managed PostgreSQL bereitgestellt
- [ ] Provider-Backups / PITR aktiviert
- [ ] `DATABASE_URL` aus realem Produktionssystem getestet
- [ ] Erststart über `./scripts/prod-up.sh` oder `./scripts/prod-update.sh` erfolgreich
- [ ] `migrations.pending = 0` über Admin-Status verifiziert

### A4) HTTPS / Reverse Proxy

- [ ] Caddy oder Nginx auf dem Host installiert
- [ ] TLS-Zertifikat aktiv
- [ ] HTTP → HTTPS Redirect aktiv
- [ ] Reverse Proxy leitet auf `127.0.0.1:8080`
- [ ] Test: `curl -I https://deine-domain.de/health` liefert 200/301→200

### A5) Ports & Firewall

- [ ] Von außen nur `22`, `80`, `443` erreichbar
- [ ] Frontend läuft intern auf `127.0.0.1:8080`
- [ ] API-Port `3000` ist nicht öffentlich offen
- [ ] DB-Port `5432` ist nicht öffentlich offen
- [ ] Redis-Port `6379` ist nicht öffentlich offen

### A6) E-Mail

- [ ] SMTP-Provider eingerichtet
- [ ] Zustellung für Registrierungs-/Systemmails getestet
- [ ] SPF/DKIM/DMARC gesetzt

### A7) Rechtliches

- [ ] Impressum mit echten Firmendaten
- [ ] Datenschutzerklärung mit echten Angaben
- [ ] AGB / Vertragsgrundlagen geprüft

### A8) Smoke-Test

- [ ] `https://deine-domain.de/health` → 200
- [ ] `https://deine-domain.de/api/health` → 200
- [ ] `https://deine-domain.de/api/service-status` → nur erwartete Stati
- [ ] Login funktioniert
- [ ] Dashboard lädt
- [ ] Kernpfade wie Anfrage / Deal / Timesheet sind erreichbar
- [ ] Admin-Status zeigt keine offenen Migrationsfehler

---

## B) WICHTIG — Vor echtem Geldfluss / ersten Pilotkunden

### B1) Stripe / Payment

- [ ] Stripe-Account eingerichtet
- [ ] Betriebsmodus bewusst gesetzt (`demo` oder Live-Modus)
- [ ] Webhook-Endpoint geprüft
- [ ] `STRIPE_WEBHOOK_SECRET` korrekt hinterlegt
- [ ] Test- oder Live-Checkout mit vollständigem Abschluss geprüft

### B2) Scheduler / Cron

Alle internen Endpunkte benötigen `X-Internal-Secret: <INTERNAL_CRON_SECRET>`.

- [ ] `POST /api/internal/sla-scan`
- [ ] `POST /api/internal/expire-reservations`
- [ ] `POST /api/internal/recompute-supplier-metrics`
- [ ] `POST /api/internal/recompute-compliance`
- [ ] `POST /api/internal/cleanup-idempotency`
- [ ] Scheduler-Smoke mit `./scripts/scheduler-smoke.sh http://127.0.0.1:8080` erfolgreich

### B3) Backup & Disaster Recovery

- [ ] Backup erstellt: `./scripts/backup.sh`
- [ ] Backup verifiziert: `./scripts/backup-verify.sh <backup-dir>`
- [ ] Mindestens ein Restore-Test bestanden: `./scripts/restore-test.sh <backup-dir>`
- [ ] Backup-Ziel und Retention festgelegt
- [ ] `.env` zusätzlich außerhalb des Release-Verzeichnisses gesichert
- [ ] RPO/RTO, Restore-Fenster und Verantwortliche für die Zielumgebung dokumentiert
      (Konzept: [BACKUP_DISASTER_RECOVERY.md](BACKUP_DISASTER_RECOVERY.md))

### B4) Monitoring

- [ ] Uptime-Check auf `https://deine-domain.de/health`
- [ ] Alarmierung eingerichtet
- [ ] Grafana/Prometheus optional aktiviert
- [ ] Admin-Status und Logs als Betriebswerkzeug getestet
- [ ] 30-Minuten-Beobachtungsphase nach Deploy organisatorisch vorgesehen

---

## C) EMPFOHLEN — Direkt nach Go-Live / bei Wachstum

### C1) HA / Mehrinstanzbetrieb

- [ ] Zweite App-Instanz geplant oder bereitgestellt
- [ ] Gemeinsame Managed DB und gemeinsame Secrets sichergestellt
- [ ] Reverse Proxy / Load Balancer Healthcheck auf `/health`
- [ ] Failover-Test vorgesehen

### C2) Performance

- [ ] Pool- und Timeout-Parameter an Managed-DB-Grenzen angepasst
- [ ] Kritische Dashboards und Kernflows unter realer Last geprüft

### C3) Betriebsdisziplin

- [ ] Versionierte Release-Verzeichnisse beibehalten
- [ ] Letztes stabiles Release jederzeit reproduzierbar
- [ ] Rollback-Pfad im Team bekannt

---

## Schnellstart: Single VM in 5 Schritten

1. Release-Artefakt aus Git-Ref bauen oder aus CI holen
2. Artefakt auf den Server kopieren und nach `/opt/tempconnect/releases` entpacken
3. `.env` aus sicherem Store in das entpackte Release legen
4. `./scripts/prod-up.sh` aus dem Release-Verzeichnis ausführen
5. Caddy oder Nginx auf dem Host für HTTPS und `127.0.0.1:8080` konfigurieren

---

## Referenzen

- [`ENTERPRISE_GO_LIVE_GATE.md`](ENTERPRISE_GO_LIVE_GATE.md) – verbindliches Enterprise-Abnahmegate (G0-G7)
- [`RELEASE_RUNBOOK.md`](RELEASE_RUNBOOK.md) – Release-, Monitoring- und Rollback-Ablauf
- [`BACKUP.md`](BACKUP.md) – Backup / Verify / Restore im Detail
- [`BACKUP_DISASTER_RECOVERY.md`](BACKUP_DISASTER_RECOVERY.md) – Wiederanlauf-Konzept
- [`MONITORING.md`](MONITORING.md) – Monitoring-Aufbau
- `../DEPLOYMENT.md` – technischer Produktions-, Rollback- und Restore-Pfad
- `../.github/workflows/ci.yml` – kanonischer CI-Artefaktpfad (`release-artifact`)
- `../scripts/backup.sh` – Backup-Erstellung
- `../scripts/backup-verify.sh` – Backup-Verifikation
- `../scripts/restore.sh` – Restore aus verifiziertem Backup
- `../scripts/restore-test.sh` – isolierter Restore-Test
- `../.env.prod.example` – Produktionsvorlage
