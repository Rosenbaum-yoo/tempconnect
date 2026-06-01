# TempConnect API — Coverage Strategy

## Source of Truth

Coverage is enforced through `c8`, with configuration centralized in `api/.c8rc.json`.
The authoritative runtime behavior is:

- `all: true`
- `check-coverage: true`
- thresholds are read from `.c8rc.json`
- package scripts call `c8 check-coverage` without duplicating threshold values

This keeps code, CI, and documentation aligned.

Test execution scope is resolved automatically via `api/scripts/run-tests.js`:

- `non-integration` = every `*.test.js` outside `test/integration/`
- `integration` = every `*.test.js` inside `test/integration/`
- `all` = every API test under `test/`

## Current Enforced Thresholds

| Metric | Threshold |
|---|---|
| Lines | 35 % |
| Branches | 75 % |
| Functions | 55 % |
| Statements | 35 % |

## Measured Scope

Coverage includes:

- `config/**`
- `db/**`
- `middleware/**`
- `routes/**`
- `services/**`
- `utils/**`
- `queue/**`
- `workers/**`
- `app.js`

Coverage excludes:

- `test/**`
- `scripts/**`
- `eslint.config.js`
- `server.js`
- `coverage/**`
- `node_modules/**`

## npm Scripts

```bash
npm run test:coverage
npm run test:coverage:full
npm run test:coverage:check
npm run test:coverage:report
npm run qa:full
```

Behavior summary:

- `test:coverage` = unit/service coverage gate
- `test:coverage:full` = full suite coverage including integration tests
- `test:coverage:check` = verify thresholds against the latest c8 output
- `qa:full` = local release-oriented QA gate

## CI Contract

Coverage is enforced in two CI jobs:

1. `unit-tests`
   - `npm run test:coverage`
   - `npm run test:coverage:check`
2. `integration-tests`
   - `npm run test:coverage:full`
   - `npm run test:coverage:check`

A drop below thresholds blocks the pipeline.

## Change Discipline

When thresholds change:

1. update `api/.c8rc.json`
2. update this file and `docs/COVERAGE.md`
3. keep local QA and CI descriptions aligned

When tests are added:

1. add the test file under the correct suite path
2. run `npm run test:coverage`
3. run `npm run test:coverage:check`

## Strategy Principle

Coverage is a regression guard, not the end goal.
The real goal is resilient protection of critical business flows, security boundaries, and operational behavior.
