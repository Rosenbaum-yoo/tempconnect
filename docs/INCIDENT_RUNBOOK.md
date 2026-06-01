# TempConnect — Incident Runbook

## Zweck

Dieses Dokument beschreibt verbindliche Abläufe für die Behandlung kritischer Störungen im TempConnect-Betrieb. Jeder On-Call-Engineer muss dieses Runbook kennen und anwenden können.

**Grundsatz:** Erst stabilisieren, dann analysieren, dann dauerhaft beheben.

---

## Severity-Klassifikation

### SEV-1 — Kritisch (sofortige Reaktion)

- Plattform komplett nicht erreichbar
- Datenbank nicht verfügbar / Datenverlust
- Zahlungen (Stripe) schlagen fehl
- Sicherheitsvorfall (Datenleck, unbefugter Zugriff)

**Reaktionszeit:** < 15 Minuten
**Eskalation:** Sofort an Tech Lead + Geschäftsleitung
**Kommunikation:** Statuspage + Kunden-E-Mail innerhalb 30 Minuten

### SEV-2 — Hoch (schnelle Reaktion)

- Einzelner Service degradiert (z.B. Suche langsam, E-Mails verzögert)
- Hohe Fehlerrate (>5% 5xx-Responses)
- Datenbank-Performance stark eingebrochen
- Migration fehlgeschlagen (neue Features nicht verfügbar)

**Reaktionszeit:** < 30 Minuten
**Eskalation:** Tech Lead informieren
**Kommunikation:** Internes Ticket, bei Kunden-Impact Statuspage-Update

### SEV-3 — Mittel (geplante Bearbeitung)

- Einzelner Cron-Job schlägt fehl
- Monitoring-Lücke erkannt
- Performance-Degradierung unter Schwellwert
- Nicht-kritischer Drittanbieter temporär nicht erreichbar

**Reaktionszeit:** < 4 Stunden (Geschäftszeiten)
**Eskalation:** Ticket erstellen, nächster Sprint
**Kommunikation:** Nur intern

---

## Sofortmaßnahmen-Checkliste (alle Incidents)

Bei jedem Incident, unabhängig vom Typ:

1. **Zeitstempel notieren** — Wann wurde das Problem bemerkt?
2. **Auswirkung einschätzen** — Wie viele Nutzer/Organisationen betroffen?
3. **Severity festlegen** — SEV-1, SEV-2, oder SEV-3?
4. **Incident-Channel öffnen** — Dedizierter Kommunikationskanal (Slack/Teams)
5. **Diagnostik starten** — Siehe Szenario-spezifische Abschnitte unten

---

## Diagnostik-Schnellreferenz

### Systemstatus prüfen (erste 60 Sekunden)

```bash
# 1. Container-Status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep tempconnect

# 2. API erreichbar?
curl -sf http://localhost:3000/health && echo "OK" || echo "FAIL"

# 3. DB erreichbar?
curl -sf http://localhost:3000/api/health && echo "OK" || echo "FAIL"

# 4. Komponenten-Status (DB, Redis, SMTP, Stripe, Search)
curl -sf http://localhost:3000/api/service-status | python3 -m json.tool

# 5. Detaillierter Admin-Status (Uptime, Memory, Migrations, Queue)
curl -sf -H "X-Admin-Secret: $ADMIN_SECRET" http://localhost:3000/api/admin/status | python3 -m json.tool
```

### Logs abrufen

```bash
# API-Logs (letzte 200 Zeilen)
./scripts/prod-logs.sh api 200

# DB-Logs
docker logs tempconnect_db --tail=100

# Redis-Logs
docker logs tempconnect_redis --tail=50

# Alle Container-Logs
./scripts/prod-logs.sh

# API-Logs nach Fehlern filtern (JSON-Logs)
docker logs tempconnect_api --since=10m 2>&1 | grep '"level":50'
```

### Monitoring prüfen

```bash
# Prometheus Alerts (aktive Alerts)
curl -sf http://localhost:9090/api/v1/alerts | python3 -m json.tool

# Alertmanager (gefeuerte Alerts)
curl -sf http://localhost:9093/api/v2/alerts | python3 -m json.tool

# Prometheus Metriken direkt (Fehlerrate letzte 5min)
curl -sf "http://localhost:9090/api/v1/query?query=sum(rate(http_requests_total{status_code=~\"5..\"}[5m]))"
```

**Grafana:** http://localhost:3001 → Dashboards → TempConnect Operations / Alerts & SLO

---

## Szenario 1 — Service-Ausfall (API nicht erreichbar)

### Symptome

- `/health` antwortet nicht oder liefert nicht-200
- Prometheus Alert: `ServiceDown`
- Nutzer sehen Fehlermeldungen im Frontend

### Diagnose

```bash
# Schritt 1: Container-Status
docker ps -a | grep tempconnect_api

# Schritt 2: Exit-Code und Restart-Count prüfen
docker inspect tempconnect_api --format='{{.State.Status}} ExitCode={{.State.ExitCode}} Restarts={{.RestartCount}}'

# Schritt 3: Letzte Logs vor Crash
docker logs tempconnect_api --tail=100

# Schritt 4: Ressourcen prüfen
docker stats tempconnect_api --no-stream

# Schritt 5: Disk-Space
df -h
```

### Sofortmaßnahmen

**Fall A: Container gestoppt/crashed**

```bash
# Container neustarten
docker compose -f docker-compose.prod.yml restart api

# Warten auf Healthcheck (max 30s)
sleep 10
curl -sf http://localhost:3000/health && echo "API recovered" || echo "STILL DOWN"
```

**Fall B: Container läuft, aber antwortet nicht (Hänger/Deadlock)**

```bash
# Forcierter Neustart
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml up -d api

# Healthcheck
sleep 15
curl -sf http://localhost:3000/api/service-status
```

**Fall C: OOM (Out of Memory)**

```bash
# OOM prüfen
docker inspect tempconnect_api --format='{{.State.OOMKilled}}'
# → true = Container wurde durch Speichermangel beendet

# Aktuelle Memory-Limits
docker inspect tempconnect_api --format='{{.HostConfig.Memory}}'

# Neustart mit erhöhtem Limit (temporär, in docker-compose.prod.yml dauerhaft)
docker compose -f docker-compose.prod.yml up -d api
```

**Fall D: Kompletter Stack down**

```bash
# Alles neustarten
./scripts/prod-up.sh

# Healthcheck
sleep 15
curl -sf http://localhost:3000/health
curl -sf http://localhost:3000/api/service-status
```

### Eskalation

- Wenn API nach 2 Neustarts nicht stabil: → SEV-1, Rollback auf letzte funktionierende Version (siehe Szenario 5)
- Wenn OOM wiederholt auftritt: → Memory-Profiling planen, Container-Limits anpassen

---

## Szenario 2 — Datenbank-Fehler

### 2a. DB nicht erreichbar

#### Symptome

- `/api/health` liefert `{ ok: false, error: "DB_DOWN" }`
- `/api/service-status` → `database.status: "error"`
- Prometheus Alert: `ServiceDown` (weil API 500er liefert)
- Alle API-Requests liefern 500

#### Diagnose

```bash
# Container läuft?
docker ps | grep tempconnect_db

# DB-Logs
docker logs tempconnect_db --tail=50

# Kann die DB Verbindungen annehmen?
docker exec tempconnect_db pg_isready -U tempconnect
# → "accepting connections" = OK
# → "no response" = Problem

# Aktive Verbindungen prüfen
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
"
```

#### Sofortmaßnahmen

```bash
# DB-Container neustarten
docker compose -f docker-compose.prod.yml restart db

# Warten bis ready
until docker exec tempconnect_db pg_isready -U tempconnect; do sleep 2; done

# API wird automatisch reconnecten (pg Pool), aber sicherheitshalber:
docker compose -f docker-compose.prod.yml restart api

# Verifizieren
curl -sf http://localhost:3000/api/health
```

### 2b. DB-Performance-Probleme (langsame Queries)

#### Symptome

- Prometheus Alert: `HighLatencyP95`, `HighLatencyP99`
- Grafana: DB Query Duration steigt
- `/api/service-status` → `database.latency_ms` > 100

#### Diagnose

```bash
# Aktive Queries (laufend seit >5s)
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
  FROM pg_stat_activity
  WHERE state != 'idle'
    AND (now() - pg_stat_activity.query_start) > interval '5 seconds'
  ORDER BY duration DESC;
"

# Lock-Konflikte
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  SELECT blocked_locks.pid AS blocked_pid,
         blocking_locks.pid AS blocking_pid,
         blocked_activity.query AS blocked_query
  FROM pg_catalog.pg_locks blocked_locks
  JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
  JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.pid != blocked_locks.pid
  WHERE NOT blocked_locks.granted;
"

# Tabellen-Statistiken (tote Tupel = VACUUM nötig)
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  SELECT relname, n_dead_tup, last_vacuum, last_autovacuum
  FROM pg_stat_user_tables
  WHERE n_dead_tup > 10000
  ORDER BY n_dead_tup DESC LIMIT 10;
"
```

#### Sofortmaßnahmen

```bash
# Langlaufende Queries abbrechen (>30s)
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'active'
    AND (now() - query_start) > interval '30 seconds'
    AND pid <> pg_backend_pid();
"

# Manuelles VACUUM auf große Tabellen
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  VACUUM ANALYZE listings;
  VACUUM ANALYZE requests;
  VACUUM ANALYZE audit_log;
"

# Index-Rebuild (bei fragmentierten Indexes)
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "REINDEX DATABASE tempconnect;"
```

### 2c. Connection Pool erschöpft

#### Symptome

- Prometheus Alert: `DbPoolExhausted`, `DbPoolNoIdle`
- Grafana: db_pool_waiting_count steigt

#### Diagnose

```bash
# Pool-Status über Metriken
curl -sf "http://localhost:3000/metrics?secret=$ADMIN_SECRET" | grep db_pool

# Erwartete Ausgabe:
# db_pool_total_count 20
# db_pool_idle_count 5
# db_pool_waiting_count 0   ← Problem wenn >0
```

#### Sofortmaßnahmen

```bash
# Idle-Connections in der DB killen (nicht vom Pool)
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle'
    AND (now() - state_change) > interval '5 minutes'
    AND pid <> pg_backend_pid();
"

# API neustarten (Pool wird neu aufgebaut)
docker compose -f docker-compose.prod.yml restart api
```

**Langfristig:** Pool-Größe in `.env` anpassen (`PGPOOL_MAX`, Default: 20). Bei >50 gleichzeitigen Connections: PgBouncer evaluieren.

### 2d. Disk Full (Datenbank)

#### Symptome

- DB schreibt keine Daten mehr
- Logs: `could not write to file` oder `No space left on device`

#### Diagnose

```bash
df -h
du -sh /var/lib/docker/volumes/tempconnect_docker_dbdata/_data/
```

#### Sofortmaßnahmen

```bash
# 1. Alte Backups löschen (sofort Platz schaffen)
ls -la backups/
# → Älteste manuell löschen wenn nötig

# 2. Docker Cleanup
docker system prune -f
docker volume prune -f  # ACHTUNG: Nur unused Volumes!

# 3. DB: Alte Audit-Logs archivieren/löschen (wenn >90 Tage)
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '180 days';
  VACUUM FULL audit_log;
"

# 4. WAL-Segmente prüfen (bei Managed DB: im Provider-Panel)
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  SELECT pg_size_pretty(pg_database_size('tempconnect')) AS db_size;
"
```

**Eskalation:** Wenn Disk <10% frei und kein schneller Cleanup möglich → SEV-1, Volume vergrößern (Hetzner Panel → Volume resize).

---

## Szenario 3 — Migration-Fehler

### Symptome

- `tempconnect_migrate` Container exitiert mit Code 1
- API startet, aber neue Features fehlen
- Logs: SQL-Fehlermeldungen bei Migration

### Diagnose

```bash
# Migration-Container Logs
docker logs tempconnect_migrate

# Welche Migrations sind applied?
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  SELECT name, applied_at FROM _migrations ORDER BY applied_at DESC LIMIT 10;
"

# Welche Migration hat gefehlt?
# → Vergleiche mit den Dateien in sql/migrations/
ls -la sql/migrations/ | tail -5
```

### Sofortmaßnahmen

**Fall A: Migration hat SQL-Fehler (Syntax, Constraint-Verletzung)**

```bash
# 1. BACKUP ERSTELLEN (IMMER vor manuellen DB-Änderungen)
./scripts/backup.sh --db-only

# 2. Fehlerhafte Migration manuell prüfen
cat sql/migrations/046_audit_trail_enhancement.sql

# 3. Problem in der SQL-Datei beheben (z.B. fehlende Bedingung)
# → Datei editieren

# 4. Migration manuell anwenden
docker exec -i tempconnect_db psql -U tempconnect -d tempconnect < sql/migrations/046_audit_trail_enhancement.sql

# 5. In _migrations-Tabelle registrieren
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  INSERT INTO _migrations (name) VALUES ('046_audit_trail_enhancement.sql');
"

# 6. API neustarten
docker compose -f docker-compose.prod.yml restart api
```

**Fall B: Migration ist partially applied (halb durch)**

```bash
# 1. BACKUP ERSTELLEN
./scripts/backup.sh --db-only

# 2. Prüfen was schon applied ist
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
"

# 3. Teile der Migration rückgängig machen (wenn möglich)
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  -- Beispiel: Wenn eine Tabelle erstellt aber ein Index fehlgeschlagen ist
  DROP INDEX IF EXISTS idx_new_feature;
  -- Dann Migration erneut ausführen
"

# 4. Komplette Migration erneut ausführen
# → _migrations-Eintrag vorher entfernen:
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  DELETE FROM _migrations WHERE name = '046_audit_trail_enhancement.sql';
"

# 5. Migrate-Container erneut ausführen
docker compose -f docker-compose.prod.yml run --rm migrate
```

**Fall C: Migration inkompatibel mit laufender API**

```bash
# 1. BACKUP ERSTELLEN
./scripts/backup.sh --db-only

# 2. API stoppen (Downtime nötig)
docker compose -f docker-compose.prod.yml stop api

# 3. Migration ausführen
docker compose -f docker-compose.prod.yml run --rm migrate

# 4. API starten
docker compose -f docker-compose.prod.yml up -d api

# 5. Healthcheck
sleep 15
curl -sf http://localhost:3000/api/health
```

### Rollback einer Migration

```bash
# 1. BACKUP ERSTELLEN (falls noch nicht geschehen)
./scripts/backup.sh --db-only

# 2. Manuelle Rollback-SQL ausführen
# → Jede Migration sollte ein Rollback-SQL-Kommentar im Header haben
# → Falls nicht vorhanden: DROP TABLE / DROP COLUMN / etc. manuell

# 3. _migrations-Eintrag entfernen
docker exec tempconnect_db psql -U tempconnect -d tempconnect -c "
  DELETE FROM _migrations WHERE name = '046_audit_trail_enhancement.sql';
"

# 4. Vorherige API-Version deployen (git checkout)
git checkout HEAD~1
docker compose -f docker-compose.prod.yml up -d --build api
```

### Prävention

- Migrations immer zuerst lokal testen (`docker compose up`)
- Migrations idempotent schreiben: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Keine destruktiven Operationen (DROP COLUMN) in derselben Migration wie neue Features
- Große Datenmigrations in Batches ausführen

---

## Szenario 4 — Drittanbieter-Ausfall

### 4a. Stripe-Ausfall (Zahlungen)

#### Symptome

- Nutzer können nicht bezahlen / Abo nicht abschließen
- Stripe Webhook liefert keine Events
- `/api/service-status` → `stripe.status: "error"` (nur wenn konfiguriert)

#### Diagnose

```bash
# Stripe-Status prüfen
curl -sf http://localhost:3000/api/service-status | python3 -c "
import json,sys; d=json.load(sys.stdin); print('Stripe:', d['components'].get('stripe',{}))"

# Stripe Status Page
# → https://status.stripe.com
```

#### Sofortmaßnahmen

1. **Stripe Status Page prüfen** — https://status.stripe.com
2. **Webhook-Queue prüfen** — Stripe Dashboard → Webhooks → Events (Stripe retried automatisch bis 72h)
3. **PAYMENT_MODE temporär auf demo setzen** (falls kritisch und Stripe länger down):

```bash
# In .env: PAYMENT_MODE=demo
# → Nutzer können die Plattform nutzen, Zahlungen werden nachgeholt
docker compose -f docker-compose.prod.yml restart api
```

4. **Nach Stripe-Recovery:**
   - `PAYMENT_MODE=stripe` zurücksetzen
   - Stripe Dashboard → Webhooks → fehlgeschlagene Events manuell retriggen
   - Nutzer-Abos prüfen: `/api/admin/metrics` → Subscription-Zahlen

#### Kunden-Kommunikation

> Aktuell treten bei unserem Zahlungsdienstleister technische Störungen auf. Die Plattform-Nutzung ist nicht beeinträchtigt. Laufende Zahlungen werden nachgeholt, sobald der Dienst wiederhergestellt ist.

### 4b. SMTP-Ausfall (E-Mails)

#### Symptome

- E-Mails werden nicht zugestellt (Registrierung, Benachrichtigungen)
- API-Logs: SMTP-Connection-Fehler

#### Diagnose

```bash
# SMTP-Status
curl -sf http://localhost:3000/api/service-status | python3 -c "
import json,sys; d=json.load(sys.stdin); print('SMTP:', d['components'].get('smtp',{}))"

# API-Logs nach SMTP-Fehlern
docker logs tempconnect_api --since=10m 2>&1 | grep -i "smtp\|mail\|email"
```

#### Sofortmaßnahmen

1. **Provider-Status prüfen** (SendGrid Status, Mailgun, etc.)
2. **SMTP-Credentials prüfen** — API-Key abgelaufen? Rate-Limit erreicht?
3. **Fallback-SMTP konfigurieren** (falls verfügbar):

```bash
# In .env: SMTP_HOST/SMTP_USER/SMTP_PASS auf Fallback setzen
docker compose -f docker-compose.prod.yml restart api
```

**Auswirkung:** E-Mail-Ausfall ist SEV-2 solange Registrierung und Passwort-Reset betroffen sind. SLA-Notifications haben sekundäre Priorität.

### 4c. Sentry-Ausfall (Error Tracking)

#### Symptome

- Keine neuen Errors in Sentry
- API-Logs: Sentry-Connection-Timeout (non-blocking)

#### Sofortmaßnahmen

- **Kein Handlungsbedarf** — Sentry-Ausfall beeinträchtigt die API nicht (fire-and-forget)
- API-Logs bleiben als Fallback verfügbar (`docker logs tempconnect_api`)
- Sentry Status: https://status.sentry.io
- Nach Recovery: Prüfen ob Events nachgeliefert wurden

### 4d. Redis-Ausfall

#### Symptome

- `/api/service-status` → `redis.status: "error"`
- Rate-Limiting funktioniert nicht / Sessions fallback auf DB

#### Diagnose

```bash
# Redis-Container
docker ps | grep tempconnect_redis
docker logs tempconnect_redis --tail=20

# Redis Ping
docker exec tempconnect_redis redis-cli ping
```

#### Sofortmaßnahmen

```bash
# Redis neustarten
docker compose -f docker-compose.prod.yml restart redis

# Verifizieren
docker exec tempconnect_redis redis-cli ping
```

**Auswirkung:** Redis ist Cache + Rate-Limiter. Bei Ausfall: Rate-Limiting deaktiviert, Performance-Impact möglich, aber Plattform funktional (Sessions in DB). SEV-2.

---

## Szenario 5 — Deployment-Fehler

> **Release-Prozess & Rollback:** Für den vollständigen Release-Ablauf mit Pre-Deploy-Checkliste, Smoke Tests und strukturierter Rollback-Prozedur siehe [../RELEASE.md](../RELEASE.md).

### 5a. API startet nicht nach Deployment

#### Symptome

- `prod-update.sh` → Healthcheck schlägt fehl
- Container restarted in Schleife

#### Diagnose

```bash
# Container-Status
docker ps -a | grep tempconnect_api

# Startup-Logs
docker logs tempconnect_api --tail=50

# Häufige Ursachen:
# - Fehlende Umgebungsvariable
# - Syntax-Fehler im Code
# - npm-Dependency-Fehler
# - Migration nicht applied
```

#### Sofortmaßnahmen — Rollback

```bash
# 1. Prüfen, ob das automatische Pre-Deploy-Backup erfolgreich lief
# Falls unklar oder fehlgeschlagen:
./scripts/backup.sh --db-only

# 2. Auf letzten funktionierenden Stand zurück
git log --oneline -5            # Letzten guten Commit finden
git checkout <COMMIT_HASH>      # Auf guten Commit wechseln

# 3. Neu bauen
docker compose -f docker-compose.prod.yml up -d --build api

# 4. Healthcheck
sleep 15
curl -sf http://localhost:3000/health
curl -sf http://localhost:3000/api/service-status
```

### 5b. Frontend nicht erreichbar nach Deployment

#### Symptome

- Browser zeigt Nginx 502/503
- API funktioniert direkt auf Port 3000, aber nicht über Nginx

#### Diagnose

```bash
# Nginx-Container
docker ps | grep tempconnect_frontend
docker logs tempconnect_frontend --tail=20

# Nginx-Config testen
docker exec tempconnect_frontend nginx -t

# Kann Nginx die API erreichen?
docker exec tempconnect_frontend wget -q -O- http://api:3000/health
```

#### Sofortmaßnahmen

```bash
# Nginx neustarten
docker compose -f docker-compose.prod.yml restart frontend

# Falls Config-Fehler:
docker exec tempconnect_frontend nginx -t
# → Fehlermeldung zeigt die problematische Zeile
```

### 5c. Migrations laufen nicht beim Deployment

Siehe **Szenario 3 — Migration-Fehler**.

### 5d. Cron-Jobs laufen nicht nach Deployment

#### Diagnose

```bash
# Cron-Endpoints manuell testen
./scripts/scheduler-smoke.sh http://127.0.0.1:8080

# Einzelnen Endpoint testen
curl -sf -X POST \
  -H "X-Internal-Secret: $INTERNAL_CRON_SECRET" \
  http://127.0.0.1:8080/api/internal/sla-scan
```

#### Sofortmaßnahmen

1. `INTERNAL_CRON_SECRET` prüfen — stimmt der Wert in `.env` mit dem in crontab überein?
2. API-Logs nach `Cron secret invalid` durchsuchen
3. Crontab prüfen: `crontab -l` → Alle Einträge vorhanden?

---

## Eskalationspfade

### Stufe 1 — On-Call Engineer (0–15 Min)

- Diagnose durchführen
- Sofortmaßnahmen gemäß Runbook anwenden
- Wenn innerhalb von 15 Min nicht gelöst → Stufe 2

### Stufe 2 — Tech Lead (15–30 Min)

- Tiefere Root-Cause-Analyse
- Entscheidung über Rollback
- Koordination bei Multi-System-Problemen
- Wenn innerhalb von 30 Min nicht gelöst oder SEV-1 → Stufe 3

### Stufe 3 — Incident Commander + Geschäftsleitung (30+ Min)

- Kunden-Kommunikation freigeben
- Business-Impact bewerten
- Externe Provider kontaktieren (Hetzner, Stripe, SendGrid)
- Post-Incident-Review planen

### Kontakte (Platzhalter — mit echten Daten befüllen)

```
On-Call:           [Rufnummer / Slack-Handle]
Tech Lead:         [Rufnummer / Slack-Handle]
Geschäftsleitung:  [Rufnummer]
Hetzner Support:   https://console.hetzner.cloud → Support Ticket
Stripe Support:    https://support.stripe.com
SendGrid Support:  https://support.sendgrid.com
```

---

## Kommunikationsvorlagen

### SEV-1 — Erstmeldung (innerhalb 30 Min)

> **Betreff:** [TempConnect] Störung — [Kurzbeschreibung]
>
> Aktuell liegt eine Störung bei TempConnect vor. [Betroffene Funktion] ist derzeit eingeschränkt verfügbar.
>
> Unser Team arbeitet an der Behebung. Wir informieren Sie, sobald die Störung behoben ist.
>
> Zeitpunkt der Erkennung: [YYYY-MM-DD HH:MM UTC]

### SEV-1 — Entwarnung

> **Betreff:** [TempConnect] Störung behoben — [Kurzbeschreibung]
>
> Die Störung bei [betroffene Funktion] wurde um [HH:MM UTC] behoben. Die Plattform ist wieder vollständig verfügbar.
>
> Ursache: [Kurze, nicht-technische Erklärung]
>
> Wir entschuldigen uns für die Unannehmlichkeiten.

---

## Post-Incident Review (PIR)

### Ablauf

Innerhalb von 48 Stunden nach jedem SEV-1 und SEV-2 Incident:

1. **Timeline erstellen** — Was passierte wann? (minutengenau)
2. **Root Cause identifizieren** — Nicht "wer", sondern "was" und "warum"
3. **Impact quantifizieren** — Dauer, betroffene Nutzer/Organisationen, Umsatz-Impact
4. **Action Items definieren** — Konkrete Maßnahmen mit Owner und Deadline

### PIR-Template

```markdown
## Post-Incident Review — [YYYY-MM-DD] [Titel]

### Zusammenfassung
- **Severity:** SEV-[1/2]
- **Dauer:** [Start] bis [Ende] ([X] Minuten)
- **Impact:** [Anzahl] Nutzer, [Beschreibung]
- **Root Cause:** [1-2 Sätze]

### Timeline
| Zeit (UTC) | Ereignis |
|---|---|
| HH:MM | Problem erkannt |
| HH:MM | Diagnose gestartet |
| HH:MM | Sofortmaßnahme angewendet |
| HH:MM | Service wiederhergestellt |

### Was lief gut
- [...]

### Was lief schlecht
- [...]

### Action Items
| # | Maßnahme | Owner | Deadline | Status |
|---|---|---|---|---|
| 1 | [...] | [...] | [...] | offen |
```

---

## Präventive Maßnahmen

### Tägliche Checks (automatisiert)

- Backup läuft erfolgreich (02:00 UTC via `scripts/backup.sh`)
- Alle Cron-Jobs laufen (`scripts/scheduler-smoke.sh`)
- Healthcheck OK (`/api/service-status`)
- Disk-Space >20% frei

### Wöchentliche Checks (manuell)

- Grafana-Dashboards auf Trends prüfen (Latenz, Fehlerrate, Memory)
- Backup-Verifizierung (`scripts/backup-verify.sh`)
- `_migrations` Tabelle konsistent
- Docker Image Updates prüfen (`postgres:16-alpine`, `redis:7-alpine`, `nginx:alpine`)

### Monatliche Checks

- Restore-Test durchführen (siehe `docs/BACKUP.md` → Restore-Testanleitung)
- Sentry-Errors reviewen — wiederkehrende Muster?
- DB-Größe und -Wachstum analysieren
- SSL-Zertifikat Ablaufdatum prüfen

---

## Schnellreferenz — Wichtige Befehle

| Aktion | Befehl |
|---|---|
| Stack starten | `./scripts/prod-up.sh` |
| Stack stoppen | `./scripts/prod-down.sh` |
| Stack aktualisieren | `./scripts/prod-update.sh` |
| Logs ansehen | `./scripts/prod-logs.sh [service] [lines]` |
| Backup erstellen | `./scripts/backup.sh` |
| Backup verifizieren | `./scripts/backup-verify.sh backups/DATUM` |
| Restore | `./scripts/restore.sh backups/DATUM` |
| Restore Dry-Run | `./scripts/restore.sh backups/DATUM --dry-run` |
| Cron-Jobs testen | `./scripts/scheduler-smoke.sh` |
| Health API | `curl http://localhost:3000/health` |
| Health DB | `curl http://localhost:3000/api/health` |
| Komponenten-Status | `curl http://localhost:3000/api/service-status` |
| Admin-Status | `curl -H "X-Admin-Secret: $ADMIN_SECRET" http://localhost:3000/api/admin/status` |
| Prometheus Metriken | `curl "http://localhost:3000/metrics?secret=$ADMIN_SECRET"` |
| DB Shell | `docker exec -it tempconnect_db psql -U tempconnect -d tempconnect` |
| Redis Shell | `docker exec -it tempconnect_redis redis-cli` |

---

## Dokumenten-Historie

| Version | Datum | Änderung |
|---|---|---|
| 1.0 | 2026-03-14 | Initiale Version — 5 Szenarien, Eskalationspfade, PIR-Prozess |
