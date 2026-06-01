# Local Development Guide

## Prerequisites

| Tool | Min. Version | Notes |
|------|-------------|-------|
| Node.js | 20 LTS | Uses built-in test runner (`node:test`) |
| npm | 9+ | Bundled with Node 20 |
| Docker Desktop | 4.x | For local PostgreSQL + Redis |
| PostgreSQL | 15+ | Via Docker Compose or native |
| Git | 2.x | |

---

## Quick Start

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd tempconnect_docker
npm install            # root (if applicable)
cd api
npm install
```

### 2. Start infrastructure (Docker Compose)

From the project root:

```bash
docker compose up -d postgres redis
```

Default ports:
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379` *(if used for caching/sessions)*

### 3. Configure environment

Copy the template and fill in your values:

```bash
cp api/.env.example api/.env
```

Minimum required variables for local development:

```dotenv
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tempconnect_dev
# Or individual vars:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=tempconnect_dev
# DB_USER=postgres
# POSTGRES_PASSWORD=postgres

# Session
SESSION_SECRET=local-dev-session-secret-min-32-chars

# CSRF
CSRF_SECRET=local-dev-csrf-secret

# Payment (demo mode for local dev)
PAYMENT_MODE=demo
STRIPE_SECRET_KEY=sk_test_...   # Only needed for Stripe mode

# Email (log to console locally)
EMAIL_PROVIDER=log

# Admin
ADMIN_SECRET=dev-admin-secret

# App
PORT=3000
NODE_ENV=development
```

### 4. Run database migrations

```bash
cd api
node scripts/migrate.js
# or
psql $DATABASE_URL -f sql/migrations/<latest>.sql
```

All migration files are in `api/sql/migrations/`, numbered sequentially (`001_*` through `032_*`).

### 5. Start the API server

```bash
cd api
npm run dev        # nodemon watch mode
# or
npm start          # production start
```

The API is now available at `http://localhost:3000`.

---

## Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes* | — | Full Postgres connection string |
| `DB_HOST` | Yes* | — | Postgres host (alt. to DATABASE_URL) |
| `DB_PORT` | No | `5432` | Postgres port |
| `DB_NAME` | No | `tempconnect` | Database name |
| `DB_USER` | No | `postgres` | Database user |
| `POSTGRES_PASSWORD` | Yes* | — | Database password (if using DB_HOST) |
| `SESSION_SECRET` | Yes | — | Min 32 chars, random string |
| `CSRF_SECRET` | No | derived | CSRF session key |
| `PORT` | No | `3000` | HTTP listen port |
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `PAYMENT_MODE` | No | `demo` | `demo` \| `stripe` |
| `STRIPE_SECRET_KEY` | Stripe only | — | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe only | — | Stripe webhook signing secret |
| `EMAIL_PROVIDER` | No | `log` | `log` \| `ses` \| `smtp` |
| `ADMIN_SECRET` | No | — | Bearer token for `/api/admin/*` |
| `LOG_LEVEL` | No | `info` | `debug` \| `info` \| `warn` \| `error` |

*One of `DATABASE_URL` or (`DB_HOST` + `POSTGRES_PASSWORD`) is required.

---

## Common Development Tasks

### Run all unit tests

```bash
cd api
npm test
# or
npm run test:unit
```

### Run integration tests (requires live DB)

```bash
cd api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tempconnect_dev npm run test:integration
```

### Syntax check all JS files

```bash
cd api
find . -name "*.js" -not -path "*/node_modules/*" | xargs node --check
```

### Full verify (syntax + unit tests)

```bash
cd api
npm run verify
```

### Add a database migration

1. Create `api/sql/migrations/NNN_description.sql`
2. Apply with `psql $DATABASE_URL -f api/sql/migrations/NNN_description.sql`
3. Commit the migration file

---

## Project Structure

```
tempconnect_docker/
├── api/                        # Node.js Express API
│   ├── app.js                  # Express app factory (async createApp())
│   ├── server.js               # HTTP server entry point
│   ├── config.js               # Config/env loader
│   ├── middleware/             # Auth, CSRF, validation, error handling
│   ├── routes/                 # Route handlers by domain
│   ├── services/               # Business logic services
│   ├── sql/migrations/         # PostgreSQL migration files
│   ├── types/                  # TypeScript type declarations
│   ├── test/                   # Test suite
│   │   ├── unit/               # Unit tests (node:test)
│   │   └── integration/        # Integration tests (supertest + node:test)
│   ├── openapi/spec.json       # OpenAPI 3.1 specification
│   └── package.json
├── docs/                       # Architecture & operations docs
├── docker-compose.yml          # Local infrastructure
└── .github/workflows/          # CI/CD pipelines
```

---

## Troubleshooting

### "Cannot connect to database"
- Ensure Docker is running: `docker compose ps`
- Check `DATABASE_URL` is correct
- Verify port 5432 is not blocked by another process

### "SESSION_SECRET must be at least 32 characters"
- Set a sufficiently long `SESSION_SECRET` in `.env`

### "CSRF token invalid"
- Always call `GET /api/csrf` first to obtain a token
- Include `x-csrf-token: <token>` on all POST/PATCH/PUT/DELETE requests
- The CSRF token is tied to the session; a new login creates a new session

### ESM import errors
- The API uses `"type": "module"` — all imports must be ESM (`import`/`export`)
- Dynamic `require()` is not supported

### Migration out of order
- Apply migrations sequentially; each builds on the previous schema state
- Check `api/sql/migrations/` for the full ordered list
