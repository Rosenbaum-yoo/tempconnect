# Testing & QA Guide

> Stand: 2026-05-26 | Phase 2 WAVE 04 | 3912 Unit-Tests, 0 Failures

## Architecture

TempConnect uses Node.js built-in `node:test` runner with ESM modules.
No external test framework needed. Frontend is linted with HTMLHint + ESLint.

**Test tiers:**

- **Unit tests** — pure logic, mock pools, no DB — `api/test/*.test.js`
- **Service tests** — some tests skip gracefully without DB — included in `api/test/*.test.js`
- **Security tests** — RBAC, auth boundaries, hardening — `api/test/security/`
- **Tenant tests** — org-boundary isolation — `api/test/orgBoundary*.test.js`
- **Pilot tests** — pilot model, policy, conversion — `api/test/pilot*.test.js`
- **Integration tests** — full HTTP flows via supertest against live app + DB — `api/test/integration/*.flow.test.js`
- **Frontend lint** — HTMLHint + ESLint — `frontend/`

Die API-Skripte selektieren ihre Suites nicht mehr über manuell gepflegte Dateilisten.
Stattdessen erkennt `api/scripts/run-tests.js` die reale Suite-Struktur automatisch:

- `--suite=non-integration` → alle `*.test.js` außerhalb von `api/test/integration/`
- `--suite=integration` → alle `*.test.js` unter `api/test/integration/`
- `--suite=all` → alle API-Tests unter `api/test/`
- `--suite=ci` → wie `non-integration` (CI-Kurzform, `--test-force-exit` inklusive)
- `--suite=security` → `test/security/` + security/rbac/auth-hardening files
- `--suite=tenant` → orgBoundary + org-boundary tests
- `--suite=pilot` → pilot model/policy/conversion tests

---

## Quick Reference

```
# Fast local check (no DB required)
npm run verify          # API lint + unit tests + build + frontend lint

# Full local QA (no DB required)
npm run qa              # API lint + tests + build + audit check + frontend lint

# Main API test suite (non-integration)
npm run test
npm run test:unit

# Focused sub-suites (no DB required)
npm run test:security   # RBAC, auth hardening, security tests (626 tests)
npm run test:tenant     # Org-boundary / tenant isolation tests (66 tests)
npm run test:pilot      # Pilot model, policy, conversion tests (49 tests)

# CI (same as unit but explicit)
npm run test:ci

# DB-dependent tests
npm run test:integration
npm run test:all

# Coverage (c8, includes all source files via --all)
npm run test:coverage
npm run test:coverage:full
npm run test:coverage:check
npm run test:coverage:report

# Lint
npm run lint:all
npm run lint:frontend
```

All commands run from the project root.

---

## Test Structure

```
api/test/
├── stateMachine.test.js          # Requisition state machine transitions
├── stateMachineEnterprise.test.js # Enterprise state extensions
├── rbac.test.js                  # Role-based access control logic
├── matchingEngine.test.js        # Capacity-request matching algorithm
├── planFeatures.test.js          # SLA plan feature gate logic
├── auth.test.js                  # Auth middleware (bcrypt, session, CSRF)
├── featureGate.test.js           # Feature gating middleware
├── validate.test.js              # Zod validation middleware
├── invoiceCsv.test.js            # Invoice CSV export
├── dealWorkflow.test.js          # Deal lifecycle transitions (mock pool)
├── timesheetLifecycle.test.js    # Timesheet state machine (mock pool)
├── enterprise-hardening.test.js  # Request status machine, idempotency paths
├── idempotency.test.js           # Idempotency middleware (mock + DB-skip)
├── capacities.test.js            # Capacity service (mock + DB-skip)
├── audit-write.test.js           # Audit-write middleware (mock pool)
├── org-boundary.test.js          # Org isolation enforcement (DB required)
└── integration/
    ├── helpers.js                # Shared: app singleton, agents, CSRF, cleanup
    ├── auth.flow.test.js         # Register → login → /me → logout; CSRF
    ├── invoice.flow.test.js      # Payment checkout → confirm → invoice list
    ├── listing.flow.test.js      # Listings CRUD: create/search/update/delete + ownership
    ├── rbac.flow.test.js         # Auth boundaries, CSRF, public vs protected
    ├── requisition.flow.test.js  # Full requisition CRUD + org isolation
    └── subscription.flow.test.js # Feature-gating: plan upgrade/downgrade + SLA access

frontend/
├── .htmlhintrc                   # HTMLHint config (pragmatic rules)
├── eslint.config.js              # ESLint 9 flat config for public/js/
├── package.json                  # Lint tooling
└── public/
    ├── js/                       # Shared JS modules (linted by ESLint)
    └── *.html                    # HTML surfaces (linted by HTMLHint)
```

---

## Script Reference

### api/package.json

| Script | Scope | DB? | Purpose |
|--------|-------|-----|-----|
| `test` | All non-integration API tests | Optional | Main fast suite via automatic discovery |
| `test:unit` | All non-integration API tests | Optional | Alias for fast local verification |
| `test:ci` | Same as `test:unit` | No | CI-Kurzform (force-exit garantiert) |
| `test:security` | `test/security/` + hardening files | No | RBAC, auth, security hardening (626 tests) |
| `test:tenant` | orgBoundary + org-boundary files | No | Tenant/Org-Isolation (66 tests) |
| `test:pilot` | pilot*.test.js files | No | Pilot-Modell, Policy, Conversion (49 tests) |
| `test:integration` | `api/test/integration/**/*.test.js` | Yes | HTTP flow tests (supertest + live app) |
| `test:all` | All API tests | Optional/Yes | Complete suite: non-integration + integration |
| `test:coverage` | Non-integration API tests | Optional | c8 coverage for the fast suite |
| `test:coverage:full` | All API tests | Optional/Yes | c8 coverage for the full suite |
| `test:coverage:check` | — | No | Enforce coverage thresholds (runs on last report) |
| `test:coverage:report` | — | No | Re-generate report from stored V8 data |
| `lint` | — | No | ESLint with `--max-warnings=0` |
| `build` | — | No | `node --check` + `tsc --noEmit` |
| `audit:check` | — | No | Static analysis: audit coverage of mutation endpoints |
| `qa` | — | No | lint → test → build → audit:check |
| `verify` | — | No | lint → test:unit → build (fast pre-push) |

### root package.json

| Script | Delegates to | Purpose |
|--------|-------------|-----|
| `qa` | api:qa + frontend:lint | Full local QA pipeline |
| `verify` | api:verify + frontend:lint | Fast pre-push check |
| `test` | api:test | Main test suite |
| `test:unit` | api:test:unit | Fast unit tests |
| `test:all` | api:test:all | All tests (needs DB) |
| `test:integration` | api:test:integration | Flow tests (needs DB) |
| `test:coverage` | api:test:coverage | c8 coverage (unit tests) |
| `test:coverage:full` | api:test:coverage:full | c8 coverage (all tests, needs DB) |
| `test:coverage:check` | api:test:coverage:check | Enforce coverage thresholds |
| `lint:all` | api:lint + frontend:lint | All linters |

---

## CI Pipeline

`.github/workflows/ci.yml` — 6 jobs:

```
Jobs 1-3 run in parallel:

  Job 1: lint-typecheck
    API ESLint (0 warnings) → TypeScript → Build

  Job 2: frontend-lint
    HTMLHint (68 files) → ESLint (12 JS files)

  Job 3: unit-tests
    non-integration suite → c8 coverage report → threshold check → artifact upload

After Jobs 1-3 pass:

  Job 4: integration-tests
    PostgreSQL 16 service container
    Schema init (sql/init.sql) + migrations
    full-suite coverage run → threshold check (Hard-Gate) → artifact upload

After all pass:

  Job 5: docker-build
    Docker Compose build + start + health check

  Job 6: release-artifact
    Build + verify Git-ref release artifact
```

**Go/No-Go:** All 6 jobs are hard gates. Coverage thresholds are enforced in `unit-tests` und `integration-tests`.

---

## Coverage

Coverage uses [c8](https://github.com/bcoe/c8) with `all: true`.
The executed test files are discovered automatically through `api/scripts/run-tests.js`, so new tests under `api/test/` are picked up without duplicating file lists in package scripts.
See [COVERAGE.md](./COVERAGE.md) for thresholds, interpretation, and CI integration.

---

## Integration Test Helpers (`test/integration/helpers.js`)

| Export | Description |
|--------|-------------|
| `hasDb` | `boolean` — `true` if DB env vars are present |
| `makeAgent()` | Returns a `supertest.agent` with a fresh session |
| `getCsrf(agent)` | Calls `GET /api/csrf` and returns the CSRF token |
| `registerUser(opts?)` | Registers a new user, returns `{ agent, csrfToken, email }` |
| `registerAndLogin(opts?)` | Register + login, returns authenticated session |
| `registerAndLoginAgency(opts?)` | Register + login as agency user (role=agency) |
| `createPool()` | Creates a `pg.Pool` for direct DB cleanup |
| `cleanupUser(pool, email)` | Removes test user and all related data (full schema cascade) |
| `ensureSubscription(pool, userId, plan)` | Upserts subscription row for feature-gate tests |
| `uniqueEmail()` | Generates collision-free test email address |
| `skipIfNoDb(t)` | Skips the current test if no DB is configured |

### Writing new integration tests

```js
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, registerAndLogin, createPool, cleanupUser } from "./helpers.js";

describe("My Feature", { skip: !hasDb && "No database configured" }, () => {
  let pool, agent, csrfToken, email;

  before(async () => {
    pool = createPool();
    ({ agent, csrfToken, email } = await registerAndLogin());
  });

  after(async () => {
    await cleanupUser(pool, email);
    await pool.end();
  });

  it("POST /api/my-endpoint → 200", async () => {
    const res = await agent
      .post("/api/my-endpoint")
      .set("x-csrf-token", csrfToken)
      .send({ key: "value" });
    assert.strictEqual(res.status, 200);
  });
});
```

---

## CSRF Token Flow

All state-changing requests (POST, PATCH, PUT, DELETE) require a valid CSRF token:

1. `GET /api/csrf` → sets session token, returns `{ token: "..." }`
2. Include `x-csrf-token: <token>` header on all mutation requests
3. Refresh token after any action that modifies session state

In tests: `csrfToken = await getCsrf(agent)` after state changes.

---

## Troubleshooting

**"Test skipped: No database configured"**
Integration tests need `DATABASE_URL` (or `DB_HOST` + `POSTGRES_PASSWORD`).
Start your local DB and set the env var.

**"CSRF token mismatch"**
Call `getCsrf(agent)` before any mutation, especially after login/register.

**Test isolation**
Each suite creates its own user via `registerAndLogin()`.
Cleanup in `after()`, not `afterEach()`. Don't share mutable state across `it()` blocks.
