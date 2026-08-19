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

## Der Org-Grenzen-Wächter — was ein 403-Test nicht beweist

`api/test/orgGrenzenWaechter.test.js` (Register: `api/test/fixtures/orgGrenzen.json`,
Werkzeug: `api/test/helpers/orgGrenzenSpion.js`).

**Warum er zusätzlich zu `test/security/coreFlowCrossTenant.test.js` existiert:**
Jener prüft `res._status === 403` — und sonst nichts. Damit besteht ihn auch
eine Route, die erst schreibt und *danach* 403 meldet, ebenso eine, die über die
falsche Kennung urteilt. Beide Muster waren real (Befunde E-5 und E-8, siehe
`docs/features/H_KUNDENANSICHT_UND_ORG_GRENZEN.md`).

**Vier Schichten:** (A) jede `:id`-Route braucht ein Urteil im Register,
aufgezählt über das **Router-Objekt** statt über den Quelltext · (B) Spion-Pool,
der jede Abfrage mitschreibt (403 · kein Schreibvorgang · Ressourcen-ID in der
Abfrage · Org und Adressat in derselben Anweisung) plus Gegenprobe mit der
eigenen Org · (C) Bestandsbuch aller 82 Route-Dateien mit Sperrklinke ·
(D) Selbstprobe an drei absichtlich kaputten Mini-Routern.

**Drei Fallen, die er umgeht — alle real aufgetreten:**

1. **Quelltext statt Verhalten.** `if (false && X)` trägt die gesuchte
   Zeichenkette weiterhin. Der Wächter führt aus, statt zu lesen — gemessen:
   diese Mutation macht ihn rot.
2. **Grenze in einer Middleware.** `findHandlerExact` liefert nur den letzten
   Handler; liegt die Grenze in `sameOrgParam`, meldet eine naive Probe eine
   bewachte Route als Lücke. Dafür gibt es `findChainFrom(router, ..., mwName)`
   und das Registerfeld `grenzeIn`.
3. **Pauschales `return 403`.** Ohne Gegenprobe bestünde es jede Prüfung. Sie
   fängt zugleich die stillgelegte Route (`schreibtBeiErfolg`).

**Was er nicht kann:** beweisen, dass ein Service-SQL seine `AND org_id`-Klausel
behalten hat. Diese Hälfte tragen die Grenz-Abschnitte in
`rateCardService.test.js`, `approvalService.test.js` und
`operationalInvoice.test.js`, die das abgesetzte SQL selbst befragen.

**Eine neue `:id`-Route anlegen?** Dann wird dieser Test rot, bis sie im Register
steht. Das ist die Absicht.

---

## Mutation Testing — was Coverage nicht beweist

Coverage sagt: **„diese Zeile wurde ausgeführt"**. Mutation Testing sagt:
**„ein eingebauter Bug wird von einem Test gefangen"**. Der Unterschied ist
nicht akademisch — in dieser Codebasis hat er dreißig Testlücken sichtbar
gemacht, die alle bei grüner Suite und hoher Coverage bestanden. Ein Beispiel
aus dem Bestand:

```js
// Test: mockPool({ rows: [LOC_ROW] })  → antwortet auf JEDE Abfrage gleich
const result = await getAllowedLocationsForMembership(pool, membership);
assert.strictEqual(result.length, 1);          // grün
```

Entfernt man den Rumpf von `if (membership.location_id)`, fällt der Code in die
org-weite Abfrage — und bekommt vom Mock dieselbe Zeile zurück. Der Test bleibt
grün, obwohl ein an einen Standort gebundenes Mitglied jetzt **alle**
Niederlassungen sähe. Die Lehre, die sich durch alle Wellen zieht: **ein Test,
der das Ergebnis prüft statt WELCHE Abfrage lief, beweist nichts.**

### Ausführen

```bash
cd api && npm run test:mutation:rbac        # ~1 h, 1292 Mutanten
```

Bericht danach unter `api/reports/mutation/rbac/index.html` — dort steht je
Zeile, welcher eingebaute Bug überlebt hat. `reports/` ist gitignored.

### Wann ein Bereich mutiert wird

Nicht überall — jeder Mutant kostet einen kompletten Testlauf. Die Faustregel
aus der Projektdirektive: **„Würde ein umgedrehtes `if` hier zu 403→200,
frei-statt-bezahlt, kein-Audit oder falschem Betrag führen?"** Reines
UI/Format/Logging wird nicht mutiert.

### Das Gate

Score-Ziel **und** null überlebende Mutanten im Entscheidungs-Branch — Letzteres
wiegt schwerer als die Prozentzahl. **100 % sind kein Ziel:** es gibt
äquivalente Mutanten ohne beobachtbare Wirkung (z. B. eine Zuweisung nach
bestandener Prüfung, wo beide Werte ohnehin identisch sind). Die zu „töten"
hiesse, Tests auf Implementierungsdetails zu schreiben. Jeder verbleibende
Überlebende wird stattdessen mit einem Satz Begründung eingestuft.

### Zwei Fallen, beide real aufgetreten

- **`incremental: true` beim `command`-Runner.** Stryker sieht dort nur *einen*
  „Test" (das ganze Kommando) und bemerkt nicht, wenn sich die Testliste ändert.
  Ein Lauf übernahm die Ergebnisse eines früheren mit halber Testmenge — das
  Gate hätte auf einer erfundenen Zahl bestanden. Bei jeder Änderung des
  Kommandos `stryker-incremental.json` **löschen**.
- **Pfadauflösung über `process.cwd()`.** Stryker läuft in
  `api/.stryker-tmp/sandbox-XXXXXX/`. Tests, die Projektdateien über feste
  Ebenen suchen, brechen dort ab oder überspringen lautlos. Aufwärts suchen, bis
  die Datei wirklich gefunden ist.

### Stand und Plan

| Bereich | Score |
|---|---|
| `services/rbacService.js` | 95,04 % |
| `middleware/rbac.js` | 87,82 % |
| `utils/orgContext.js` | 93,94 % |
| `middleware/orgContext.js` | 86,96 % |
| `utils/orgBoundary.js` | 82,20 % |
| `services/enterpriseSurfaceAccessService.js` | 89,29 % |

Weitere Bereiche in der Reihenfolge ihrer Wirkung: Auth/Session-Trennung,
Plan-Entitlement, Geld-Mathematik, Audit-Trail, Status-Maschinen,
CSRF/Idempotency, DSGVO-Löschung. Je Bereich eine eigene
`stryker.<bereich>.conf.json` nach demselben Muster.

Nächtlich in CI über [`.github/workflows/mutation.yml`](../.github/workflows/mutation.yml);
der Bericht wird 30 Tage als Artefakt aufbewahrt. Architektur-Befund zur
Mandantengrenze: [ORG_GRENZE_BEFUND.md](./ORG_GRENZE_BEFUND.md).

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
