# TempConnect — Developer Setup & Onboarding Guide

> Alles, was ein neuer Entwickler braucht, um TempConnect lokal zu starten, zu verstehen und produktiv zu arbeiten.
> Fuer den Quick Start (Installation, Docker Compose, .env) siehe [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).

---

## Inhaltsverzeichnis

1. [Architektur-Ueberblick](#architektur-ueberblick)
2. [Lokale Entwicklungsumgebung](#lokale-entwicklungsumgebung)
3. [Dev Scripts](#dev-scripts)
4. [Projekt-Struktur](#projekt-struktur)
5. [Code-Konventionen](#code-konventionen)
6. [Haeufige Workflows](#haeufige-workflows)
7. [Testing](#testing)
8. [Monitoring & Observability](#monitoring--observability)
9. [Troubleshooting](#troubleshooting)
10. [Weiterführende Docs](#weiterführende-docs)

---

## Architektur-Ueberblick

TempConnect ist eine B2B SaaS-Plattform (VMS-light) fuer Zeitarbeit. Die Architektur ist Docker-basiert mit klarer Service-Trennung:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend   │────▶│   Nginx     │────▶│   API       │
│ (Static HTML)│     │ (Reverse    │     │ (Express.js)│
│  Port 8080   │     │  Proxy)     │     │  Port 3000  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                    ┌───────────────────────────┼───────────────┐
                    │                           │               │
              ┌─────▼─────┐            ┌────────▼──────┐  ┌────▼────┐
              │ PostgreSQL │            │    Redis      │  │ Mailpit │
              │    16      │            │ (BullMQ +     │  │ (Dev    │
              │  Port 5432 │            │  Rate Limits) │  │  SMTP)  │
              └────────────┘            │  Port 6379    │  │  :8025  │
                                        └───────────────┘  └─────────┘
```

### Services

| Service     | Container              | Zweck                                           |
|-------------|------------------------|-------------------------------------------------|
| `db`        | `tempconnect_db`       | PostgreSQL 16 — Primaere Datenbank              |
| `api`       | `tempconnect_api`      | Node.js 20 Express API + BullMQ Worker          |
| `frontend`  | `tempconnect_frontend` | Nginx mit statischen HTML-Seiten                |
| `redis`     | `tempconnect_redis`    | Job-Queues (BullMQ), Rate-Limiting, Sessions    |
| `mailpit`   | `tempconnect_mailpit`  | Lokaler SMTP-Server (Dev-Profil), UI auf :8025  |
| `migrate`   | `tempconnect_migrate`  | Einmalig: fuehrt alle SQL-Migrations aus         |

### Application Layers

```
Express App (app.js)
├── Middleware
│   ├── helmet, cors, rate-limiting
│   ├── session (connect-pg-simple)
│   ├── CSRF-Protection
│   ├── orgContext (Multi-Tenancy)
│   ├── apiKeyAuth (API-Key Authentication)
│   └── auditWrite (Audit Trail)
├── Routes (/api/*)
│   ├── auth, users, listings, requests
│   ├── deals, contracts, timesheets, invoices
│   ├── matching, capacity, compliance
│   ├── admin, health, org, payment
│   └── webhooks, integrations
├── Services (Business Logic)
│   ├── authService, matchingService, timesheetService
│   ├── apiKeyService, healthService, slaService
│   └── ...
├── Workers (BullMQ Background Jobs)
│   ├── emailWorker — E-Mail-Versand
│   ├── matchWorker — Matching-Engine
│   └── capacityWorker — Kapazitaets-Updates
└── Database (pg Pool)
    ├── sql/init.sql — Basis-Schema
    └── sql/migrations/001-049 — Inkrementelle Migrations
```

---

## Lokale Entwicklungsumgebung

### Voraussetzungen

- **Docker Desktop** 4.x (Docker Compose v2)
- **Node.js** 20+ (fuer lokale Tool-Ausfuehrung, Tests)
- **Git** 2.x
- **Git Bash** oder **WSL2** (fuer Shell-Scripts unter Windows)
- Optional: **jq** (fuer Log-Filterung)

### Erster Start

```bash
# 1. Repository klonen
git clone <repo-url> && cd tempconnect_docker

# 2. Umgebungsvariablen konfigurieren
cp .env.example .env
# .env anpassen (siehe LOCAL_DEVELOPMENT.md fuer Details)

# 3. Alles starten (DB + Migrations + API + Frontend + Redis)
docker compose up -d

# 4. Seed-Daten laden (Demo-Accounts)
./scripts/dev/seed-data.sh

# 5. Fertig!
# Frontend: http://localhost:8080
# API:      http://localhost:3000
# Mailpit:  http://localhost:8025 (mit --profile dev)
# Health:   http://localhost:3000/health
```

### Demo-Accounts (nach Seeding)

| Rolle   | E-Mail              | Passwort      | Plan |
|---------|---------------------|---------------|------|
| Company | `demo@firma.de`     | `password123` | PLUS |
| Agency  | `test@agentur.de`   | `password123` | PLUS |

---

## Dev Scripts

Alle Dev-Scripts liegen in `scripts/dev/` und werden via Bash ausgefuehrt (Git Bash / WSL unter Windows).

### reset-db.sh — Datenbank zuruecksetzen

Loescht alle lokalen Daten, erstellt die DB komplett neu (init.sql + alle Migrations).

```bash
./scripts/dev/reset-db.sh              # Mit Bestaetigungsprompt
./scripts/dev/reset-db.sh --yes        # Ohne Bestaetigung
./scripts/dev/reset-db.sh --yes --seed # Reset + Demo-Daten laden
```

**Wann nutzen:** Schema-Aenderungen testen, korrupte DB, sauberer Neuanfang.

### seed-data.sh — Seed-Daten laden

Laedt Entwicklungs-/Demo-Daten aus `sql/seeds/` in die laufende DB.

```bash
./scripts/dev/seed-data.sh                       # Alle Seeds
./scripts/dev/seed-data.sh --file=dev-data.sql   # Nur eine Datei
./scripts/dev/seed-data.sh --clean               # Tabellen vorher leeren
./scripts/dev/seed-data.sh --list                # Verfuegbare Seeds anzeigen
```

**Seed-Dateien:**
- `sql/seeds/dev-data.sql` — Basis-Accounts + Listings
- `sql/seeds/demo-timesheets.sql` — Orgs, Timesheets in allen Status

### run-worker.sh — Worker-Management

Startet/ueberwacht die BullMQ-Background-Worker (email, match, capacity).

```bash
./scripts/dev/run-worker.sh                 # API + Worker starten
./scripts/dev/run-worker.sh --status        # Queue-Status anzeigen
./scripts/dev/run-worker.sh --watch-status  # Live-Queue-Monitor
./scripts/dev/run-worker.sh --drain=email   # Queue leeren
./scripts/dev/run-worker.sh --restart       # Worker neu starten
./scripts/dev/run-worker.sh --logs          # Worker-Logs filtern
```

**Queue-Status direkt im Container:**
```bash
docker compose exec api node scripts/queue-status.js --watch
```

### inspect-logs.sh — Log-Inspektion

Intelligente Log-Suche mit Filtern nach Service, Level und Zeitraum.

```bash
./scripts/dev/inspect-logs.sh                          # Alle Logs (follow)
./scripts/dev/inspect-logs.sh --service=api             # Nur API-Logs
./scripts/dev/inspect-logs.sh --errors                  # Nur Fehler (API)
./scripts/dev/inspect-logs.sh --level=warn --since=1h   # Warnungen letzte Stunde
./scripts/dev/inspect-logs.sh --service=db --no-follow  # DB-Logs einmalig
./scripts/dev/inspect-logs.sh --json | jq '.msg'        # Raw JSON pipen
```

### Weitere Dev-Utilities

| Script                                   | Zweck                                    |
|------------------------------------------|------------------------------------------|
| `docker compose exec api node scripts/list-routes.js`     | Alle registrierten API-Routen auflisten |
| `docker compose exec api node scripts/audit-coverage-check.js` | Audit-Coverage pruefen          |
| `docker compose exec api node scripts/queue-status.js`    | BullMQ Queue-Status (JSON/Table)        |
| `docker compose run --rm migrate`        | Migrations manuell ausfuehren            |

---

## Projekt-Struktur

```
tempconnect_docker/
├── api/                         # Node.js Express API
│   ├── app.js                   # Express App Factory (async createApp())
│   ├── server.js                # HTTP Server + Worker Bootstrap
│   ├── config/index.js          # Zentrale Konfiguration + Logger (pino)
│   ├── db/pool.js               # PostgreSQL Connection Pool
│   ├── middleware/               # Express Middleware
│   │   ├── apiKeyAuth.js        # API-Key Authentication + Scope Enforcement
│   │   ├── auditWrite.js        # Automatischer Audit Trail
│   │   ├── orgContext.js        # Multi-Tenancy (Org-Kontext setzen)
│   │   └── ...
│   ├── routes/                  # Route Handler (Express Router)
│   ├── services/                # Business Logic (pure Funktionen mit pool)
│   ├── workers/                 # BullMQ Worker (email, match, capacity)
│   ├── queue/                   # BullMQ Queue-Definitionen + Redis Connection
│   ├── utils/                   # Monitoring, Metrics, Helpers
│   ├── scripts/                 # Dev-Utilities (list-routes, queue-status)
│   ├── sql/migrations/          # PostgreSQL Migrations (001-049)
│   ├── test/                    # Tests (node:test + node:assert/strict)
│   │   ├── *.test.js            # Unit Tests
│   │   ├── integration/         # Integration Tests (supertest)
│   │   └── security/            # Security Tests
│   └── package.json
├── frontend/                    # Statische HTML-Dateien
│   └── public/                  # Seiten (Dark Theme, enterprise.css)
├── sql/
│   ├── init.sql                 # Basis-Schema (einmalig bei leerer DB)
│   ├── migrate.sh               # Migration-Runner (Docker)
│   ├── migrations/              # Alle Migrations (sortiert)
│   └── seeds/                   # Seed-Daten (nur Dev)
├── scripts/
│   ├── dev/                     # Entwickler-Scripts
│   │   ├── reset-db.sh
│   │   ├── seed-data.sh
│   │   ├── run-worker.sh
│   │   └── inspect-logs.sh
│   └── *.sh                     # Prod-Scripts (backup, restore, prod-up/down)
├── nginx/nginx.conf             # Nginx Reverse-Proxy Config
├── docs/                        # Dokumentation
├── docker-compose.yml           # Lokale Entwicklung
├── docker-compose.prod.yml      # Produktion
├── .env.example                 # Template fuer Umgebungsvariablen
└── package.json                 # Root (test/lint Shortcuts)
```

---

## Code-Konventionen

### JavaScript / ESM

- **Modulformat:** ES Modules (`import`/`export`), `"type": "module"` in package.json
- **Kein** `require()`, kein CommonJS
- **Node.js 20+** APIs bevorzugen (z.B. `node:test`, `node:assert/strict`, `node:crypto`)

### Express Patterns

- **Router Factory:** Jeder Router exportiert eine Factory-Funktion: `createXxxRouter({ pool, logger })`
- **Service Layer:** Business Logic in `services/*.js`, Router nur fuer HTTP-Handling + Validation
- **Validation:** Zod-Schemas fuer Request-Body/Query/Params
- **Error Handling:** Zentrale Error-Middleware, `next(err)` statt try/catch in jeder Route

### Multi-Tenancy (Org-Context)

```javascript
// req.orgId wird von orgContextMiddleware gesetzt
// ALLE DB-Queries muessen nach org_id filtern!
const rows = await pool.query(
  'SELECT * FROM listings WHERE org_id = $1 AND id = $2',
  [req.orgId, req.params.id]
);
```

### RBAC (Role-Based Access Control)

```javascript
import { requirePermission } from '../middleware/rbac.js';

// In Router:
router.post('/listings', requirePermission('listings:write'), async (req, res) => { ... });
```

Rollen-Hierarchie: `owner > admin > manager > member > viewer`

### Audit Trail

Schreibvorgaenge werden automatisch via `auditWrite` Middleware protokolliert. Fuer manuelle Audit-Eintraege:

```javascript
import { writeAuditLog } from '../services/auditLog.js';

await writeAuditLog(pool, {
  action: 'listing.created',
  userId: req.userId,
  orgId: req.orgId,
  resourceType: 'listing',
  resourceId: listing.id,
  details: { category: listing.category }
});
```

### API-Key Authentication

API-Keys werden mit SHA-256 gehasht gespeichert. Scope-basierte Autorisierung:

```javascript
import { requireScope } from '../middleware/apiKeyAuth.js';

// Endpoint nur fuer API-Keys mit 'read:listings' Scope
router.get('/listings', requireScope('read:listings'), async (req, res) => { ... });
```

### SQL Migrations

- Neue Migrations: `sql/migrations/NNN_beschreibung.sql`
- Nummerierung: fortlaufend (aktuell 001-049)
- Immer idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)
- Anwenden: `docker compose run --rm migrate`

### Frontend

- Dark Theme via `enterprise.css`
- XSS-Schutz: `esc()` Helper fuer alle dynamischen Inhalte
- CSRF-Token: `GET /api/csrf` → `x-csrf-token` Header
- Auth-Redirect: 401 → Login-Seite

---

## Haeufige Workflows

### Feature entwickeln

```bash
# 1. Branch erstellen
git checkout -b feature/mein-feature

# 2. Services starten
docker compose up -d

# 3. Code schreiben
#    - Route in api/routes/
#    - Service in api/services/
#    - Frontend in frontend/public/

# 4. Tests schreiben + ausfuehren
docker compose exec api node --test test/meinFeature.test.js

# 5. Lint + Typecheck
docker compose exec api npm run lint
docker compose exec api npm run typecheck

# 6. QA-Suite (lint + audit + tests + build)
docker compose exec api npm run qa
```

### Migration erstellen

```bash
# 1. Naechste Nummer ermitteln
ls sql/migrations/ | tail -5

# 2. Migration-Datei erstellen (z.B. 050_neue_tabelle.sql)
# 3. Immer idempotent schreiben:
#    CREATE TABLE IF NOT EXISTS ...
#    ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...

# 4. Anwenden
docker compose run --rm migrate

# 5. Bei Problemen: DB zuruecksetzen
./scripts/dev/reset-db.sh --yes --seed
```

### Test schreiben

```bash
# Test-Datei erstellen: api/test/meinService.test.js
# Pattern: node:test + node:assert/strict

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { meineFunktion } from '../services/meinService.js';

describe('meinService', () => {
  it('macht was es soll', () => {
    const result = meineFunktion('input');
    assert.equal(result, 'expected');
  });
});

# Ausfuehren
docker compose exec api node --test test/meinService.test.js

# Alle Tests
docker compose exec api npm test

# Mit Coverage
docker compose exec api npm run test:coverage
```

### Debugging

```bash
# API-Logs in Echtzeit
./scripts/dev/inspect-logs.sh --service=api

# Nur Fehler
./scripts/dev/inspect-logs.sh --errors

# Alle registrierten Routen pruefen
docker compose exec api node scripts/list-routes.js

# DB direkt abfragen
docker compose exec db psql -U tempconnect -d tempconnect

# Redis CLI
docker compose exec redis redis-cli

# Node.js Debugger (Chrome DevTools)
docker compose exec api node --inspect=0.0.0.0:9229 server.js
```

---

## Testing

### Test-Suiten

| Befehl                          | Beschreibung                           |
|---------------------------------|----------------------------------------|
| `npm test`                      | Unit Tests (standard Suite)            |
| `npm run test:unit`             | Unit Tests (explizit)                  |
| `npm run test:integration`      | Integration Tests (braucht laufende DB)|
| `npm run test:all`              | Alle Tests                             |
| `npm run test:coverage`         | Unit Tests mit c8 Coverage             |
| `npm run test:coverage:full`    | Alle Tests mit Coverage                |
| `npm run test:coverage:check`   | Coverage-Schwellwerte pruefen          |
| `npm run qa`                    | lint + audit + test + build            |
| `npm run qa:full`               | qa + coverage + coverage:check         |
| `npm run verify`                | lint + unit tests + build (schnell)    |

### Test-Framework

- **Runner:** `node:test` (built-in, kein Mocha/Jest)
- **Assertions:** `node:assert/strict`
- **HTTP Tests:** `supertest`
- **Coverage:** `c8`
- **Pattern:** `describe/it` Bloecke, Mock via `node:test` Mock-API

---

## Monitoring & Observability

### Health Endpoints

| Endpoint                  | Auth          | Beschreibung                          |
|---------------------------|---------------|---------------------------------------|
| `GET /health`             | Public        | Basis-Healthcheck (DB + Redis)        |
| `GET /health/ready`       | Public        | Readiness Probe (fuer Kubernetes)     |
| `GET /health/status`      | Admin Secret  | Detaillierter System-Status           |
| `GET /admin/system-health`| Admin Role    | Diagnostics Dashboard                 |

### Prometheus Metrics

Die API exportiert Prometheus-kompatible Metriken auf `GET /health/metrics`:

- **HTTP:** Request-Count, Latenz-Histogramm (p50/p95/p99), Error-Rate
- **DB:** Connection-Pool (active/idle/waiting)
- **Queues:** Waiting/Active/Completed/Failed per Queue
- **Process:** Memory, CPU, Event-Loop-Lag

### Logging

- **Format:** Pino JSON (Produktion), pino-pretty (Development)
- **Levels:** trace, debug, info, warn, error, fatal
- **Redaction:** Passwoerter, Tokens, Secrets werden automatisch maskiert
- **Container-Logs:** `docker compose logs -f api`

### Dashboards

- **System Health:** http://localhost:8080/public/system-health.html (Admin)
- **Mailpit (E-Mails):** http://localhost:8025 (Dev-Profil)

---

## Troubleshooting

### DB-Container startet nicht

```bash
# Logs pruefen
docker compose logs db

# Volume beschaedigt? Neu starten:
./scripts/dev/reset-db.sh --yes --seed
```

### Migrations schlagen fehl

```bash
# Welche Migrations sind angewendet?
docker compose exec db psql -U tempconnect -d tempconnect \
  -c "SELECT name, applied_at FROM _migrations ORDER BY applied_at;"

# Migration manuell anwenden
docker compose exec db psql -U tempconnect -d tempconnect \
  -f /migrations/049_org_api_keys.sql
```

### Worker laufen nicht (Queue-Jobs haengen)

```bash
# Redis laeuft?
docker compose ps redis

# Queue-Status pruefen
./scripts/dev/run-worker.sh --status

# Worker-Logs
./scripts/dev/run-worker.sh --logs

# Queue leeren
./scripts/dev/run-worker.sh --drain=email
```

### ESM Import-Fehler

- TempConnect nutzt `"type": "module"` — nur `import`/`export` verwenden
- Dateiendung `.js` bei Imports immer angeben
- Kein `require()`, kein `__dirname` (stattdessen: `import.meta.url`)

### Port-Konflikte

Standard-Ports in `.env` aendern:

```dotenv
FRONTEND_PORT=9080
API_EXTERNAL_PORT=4000
DB_EXTERNAL_PORT=5433
```

---

## Weiterführende Docs

| Dokument                                      | Inhalt                                      |
|-----------------------------------------------|---------------------------------------------|
| [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)  | Quick Start, Env-Vars, Basis-Setup          |
| [ARCHITECTURE.md](ARCHITECTURE.md)            | Detaillierte Architektur-Dokumentation       |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md)  | API-Referenz, Endpoints, Schemas            |
| [API_KEYS.md](API_KEYS.md)                    | API-Key-System, Scopes, Rotation            |
| [TESTING.md](TESTING.md)                      | Test-Strategie, Coverage, Patterns          |
| [SYSTEM_HEALTH.md](SYSTEM_HEALTH.md)          | Diagnostics, Metriken, Monitoring           |
| [ENTERPRISE_AUDIT.md](ENTERPRISE_AUDIT.md)    | Audit Trail, Compliance                     |
| [DEPLOYMENT.md](DEPLOYMENT.md)                | Produktion, CI/CD, Rollout                  |
| [SECURITY_AUDIT.md](SECURITY_AUDIT.md)        | Sicherheitskonzept, Penetration-Testing     |
| [BACKUP.md](BACKUP.md)                        | Backup & Restore, Disaster Recovery         |
| [ORGANIZATION_CONTROL_CENTER.md](ORGANIZATION_CONTROL_CENTER.md) | Org-Management, Multi-Tenancy |
