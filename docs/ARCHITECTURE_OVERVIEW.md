# TempConnect – Architecture Overview

## Stack
- **Runtime**: Node 20, ESM modules
- **Framework**: Express.js
- **Database**: PostgreSQL 16 (19 Migrationen)
- **Session**: connect-pg-simple (PostgreSQL-backed)
- **Containerisierung**: Docker Compose (api, postgres, nginx, redis)
- **Frontend**: Static HTML + Vanilla JS, served by Nginx
- **CSS**: Custom Dark Theme (`frontend/public/css/enterprise.css`)

## Verzeichnisstruktur
```
api/
  app.js              – Express App Factory, Router-Registrierung
  server.js           – HTTP-Server + Graceful Shutdown
  config/             – Env-Validierung, Plan-Features
  db/pool.js          – PostgreSQL Connection Pool
  middleware/          – auth, rbac, rateLimit, featureGate, idempotency, csrf
  routes/             – 19 Router-Module (REST-Endpunkte)
  services/           – Business-Logik (15+ Services)
frontend/public/      – HTML-Seiten, CSS, JS
sql/migrations/       – 001-019 PostgreSQL-Migrationen
docs/                 – Projektdokumentation
```

## API-Module (app.js registriert)
| Router | Pfad-Prefix | Beschreibung |
|--------|-------------|--------------|
| auth | /api | Login, Register, Logout |
| me | /api | Profil, Plan |
| csrf | /api | CSRF-Token |
| health | /api | Health-Check |
| plans | /api | Abo-Pläne |
| geo | /api | Geocoding |
| listings | /api | Inserate |
| capacities | /api | Kapazitäten (Model B) |
| requests | /api | Anfragen + Reservierungen |
| ratings | /api | Bewertungen |
| reports | /api | Reports |
| payment | /api | Stripe-Zahlung |
| proofs | /api | Nachweise |
| marketplace | /api | Capacity Posts, Demand Requests, Matching |
| slaSearchJobs | /api | SLA-Suchaufträge |
| **requisitions** | /api | Requisitions CRUD + Workflow (NEU) |
| **vendorPool** | /api | Vendor Pool Management (NEU) |
| **reporting** | /api | Executive Dashboard + KPIs (NEU) |

## Datenfluss
1. Nginx → Express API (Port 3000)
2. Express Session → PostgreSQL (session-Tabelle)
3. CSRF-Token-Validierung auf allen /api/ POST/PATCH/DELETE
4. RBAC-Middleware prüft org_memberships für VMS-Endpunkte
5. Services → PostgreSQL Pool → Response

## Sicherheit
- Helmet (CSP, HSTS, X-Frame)
- CORS (Whitelist)
- Rate Limiting (express-rate-limit)
- CSRF (Double Submit Cookie)
- Session-Cookies (HttpOnly, SameSite, Secure in Prod)
- XSS: Frontend nutzt `esc()` für alle dynamischen Inhalte
- RBAC: Rollen-basierte Zugangskontrolle für VMS-Features
