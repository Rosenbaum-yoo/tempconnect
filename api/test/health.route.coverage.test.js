/**
 * Health route handler coverage tests.
 *
 * Covers routes/health.js → createHealthRouter(deps) + simpleHealthHandler.
 * Routes exercised: GET /health, /ready, /live, /admin/status, /service-status,
 * /public/system-status, /debug/sentry-test, /admin/metrics-export.
 *
 * The route module imports its services as ESM namespaces (healthService,
 * platformMetrics, searchService) rather than via injected deps, so behaviour
 * is driven through the injectable surface that those services actually touch:
 *   - pool.query  (pingDb → "SELECT 1", getMigrations → "SELECT name...",
 *                  platformMetrics.getMetrics)
 *   - config      (ADMIN_SECRET, SMTP_HOST, billing/Stripe self-report)
 * searchService.getSearchStatus() resolves to a no-client DB fallback in the
 * test environment, and isQueueAvailable() reads the real config — both yield
 * deterministic "unconfigured/degraded" branches asserted below.
 *
 * Run: node --test --test-force-exit test/health.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHealthRouter, simpleHealthHandler } from "../routes/health.js";

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool: records every query and dispatches a response based on the SQL.
 * Default: pingDb ("SELECT 1") and getMigrations succeed. A `failOn` predicate
 * lets a test force a specific query to throw (DB-down branches).
 */
function trackingPool(opts = {}) {
  const calls = [];
  const failOn = opts.failOn || (() => false);
  const migrations = opts.migrations ?? [{ name: "001_init", applied_at: new Date("2026-01-01T00:00:00Z") }];
  const metricsRows = opts.metricsRows ?? [{ k: "v" }];
  return {
    calls,
    // pg Pool fields read by some service paths
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (failOn(sql)) throw new Error("DB_DOWN_SIMULATED");
      if (/SELECT\s+1/i.test(sql)) return { rows: [{ "?column?": 1 }] };
      if (/_migrations/i.test(sql)) return { rows: migrations };
      // platformMetrics.getMetrics and any other aggregate query
      return { rows: metricsRows };
    }
  };
}

function mockReq(overrides = {}) {
  return {
    params: {},
    body: {},
    query: {},
    session: { userId: "u1" },
    headers: {},
    ip: "127.0.0.1",
    get: () => "",
    ...overrides
  };
}

function mockRes() {
  const headers = {};
  const res = {
    _status: 200,
    _json: null,
    _send: null,
    _headers: headers,
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; return res; },
    send(payload) { res._send = payload; return res; },
    set(name, value) { if (name) headers[String(name).toLowerCase()] = value; return res; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    type() { return res; },
    end() { return res; }
  };
  return res;
}

function createDeps(pool, config = {}) {
  return { pool, config, logger: mockLogger() };
}

function getHandler(router, method, exactPath) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== exactPath) continue;
    if (!layer.route.methods[method]) continue;
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }
  throw new Error(`Route ${method.toUpperCase()} ${exactPath} not found`);
}

/* ─────────────────────────────────────────────────────────── */

describe("health routes — router wiring", () => {
  it("registers all expected routes", () => {
    const router = createHealthRouter(createDeps(trackingPool()));
    const registered = router.stack
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);

    for (const expected of [
      "GET /health",
      "GET /ready",
      "GET /live",
      "GET /admin/status",
      "GET /service-status",
      "GET /public/system-status",
      "GET /debug/sentry-test",
      "GET /admin/metrics-export"
    ]) {
      assert.ok(registered.includes(expected), `missing route ${expected}`);
    }
  });
});

describe("simpleHealthHandler", () => {
  it("returns 200 OK with no DB access", () => {
    const res = mockRes();
    simpleHealthHandler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._send, "OK");
  });
});

describe("health routes — GET /health", () => {
  it("returns ok:true when the DB ping succeeds", async () => {
    const pool = trackingPool();
    const handler = getHandler(createHealthRouter(createDeps(pool)), "get", "/health");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json, { ok: true, service: "api" });
    assert.ok(pool.calls.some((c) => /SELECT\s+1/i.test(c.sql)), "must ping DB");
  });

  it("returns 500 DB_DOWN when the ping throws", async () => {
    const pool = trackingPool({ failOn: (sql) => /SELECT\s+1/i.test(sql) });
    const handler = getHandler(createHealthRouter(createDeps(pool)), "get", "/health");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 500);
    assert.deepStrictEqual(res._json, { ok: false, error: "DB_DOWN" });
  });
});

describe("health routes — GET /ready", () => {
  it("returns 200 ready:true when the DB is reachable", async () => {
    const handler = getHandler(createHealthRouter(createDeps(trackingPool())), "get", "/ready");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.deepStrictEqual(res._json, { ok: true, ready: true });
  });

  it("returns 503 DB_UNREACHABLE when the ping throws", async () => {
    const pool = trackingPool({ failOn: (sql) => /SELECT\s+1/i.test(sql) });
    const handler = getHandler(createHealthRouter(createDeps(pool)), "get", "/ready");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 503);
    assert.deepStrictEqual(res._json, { ok: false, ready: false, error: "DB_UNREACHABLE" });
  });
});

describe("health routes — GET /live", () => {
  it("returns 200 live:true with a numeric uptime and no DB access", () => {
    const pool = trackingPool();
    const handler = getHandler(createHealthRouter(createDeps(pool)), "get", "/live");
    const res = mockRes();
    handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res._json.live, true);
    assert.strictEqual(typeof res._json.uptime_s, "number");
    assert.strictEqual(pool.calls.length, 0, "liveness must not touch the DB");
  });
});

describe("health routes — GET /admin/status (secret-gated)", () => {
  const SECRET = "top-secret-admin";

  it("returns 404 when ADMIN_SECRET is unset (route is hidden)", async () => {
    const pool = trackingPool();
    const handler = getHandler(createHealthRouter(createDeps(pool, {})), "get", "/admin/status");
    const res = mockRes();
    await handler(mockReq({ headers: { "x-admin-secret": "anything" } }), res);

    assert.strictEqual(res._status, 404);
    assert.deepStrictEqual(res._json, { error: "NOT_FOUND" });
    assert.strictEqual(pool.calls.length, 0, "must not query before passing the secret gate");
  });

  it("returns 404 when the provided secret is wrong", async () => {
    const handler = getHandler(
      createHealthRouter(createDeps(trackingPool(), { ADMIN_SECRET: SECRET })),
      "get",
      "/admin/status"
    );
    const res = mockRes();
    await handler(mockReq({ headers: { "x-admin-secret": "WRONG" } }), res);

    assert.strictEqual(res._status, 404);
    assert.deepStrictEqual(res._json, { error: "NOT_FOUND" });
  });

  it("accepts the secret via the ?secret query param and returns the full status payload", async () => {
    const pool = trackingPool();
    const handler = getHandler(
      createHealthRouter(createDeps(pool, { ADMIN_SECRET: SECRET })),
      "get",
      "/admin/status"
    );
    const res = mockRes();
    await handler(mockReq({ query: { secret: SECRET } }), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.db, "ok");
    assert.strictEqual(res._json.service, "api");
    // memory block
    assert.strictEqual(typeof res._json.memory.rss_mb, "number");
    assert.strictEqual(typeof res._json.memory.heap_used_mb, "number");
    // migrations come from the pool
    assert.deepStrictEqual(res._json.migrations, [
      { name: "001_init", applied_at: new Date("2026-01-01T00:00:00Z") }
    ]);
    // billing self-report (config-driven, no real key → manual default)
    assert.ok(res._json.billing, "billing self-report must be present");
    assert.strictEqual(res._json.billing.provider, "manual");
    // queue/search status strings present
    assert.ok(["configured", "unavailable"].includes(res._json.queue));
    assert.ok(res._json.search && typeof res._json.search.available === "boolean");
    // process metadata
    assert.strictEqual(res._json.node, process.version);
    assert.ok(pool.calls.some((c) => /_migrations/i.test(c.sql)), "must load migrations");
  });

  it("returns 500 with db:error when the DB ping throws after the secret gate", async () => {
    const pool = trackingPool({ failOn: (sql) => /SELECT\s+1/i.test(sql) });
    const handler = getHandler(
      createHealthRouter(createDeps(pool, { ADMIN_SECRET: SECRET })),
      "get",
      "/admin/status"
    );
    const res = mockRes();
    await handler(mockReq({ headers: { "x-admin-secret": SECRET } }), res);

    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.db, "error");
    assert.strictEqual(res._json.service, "api");
    assert.strictEqual(typeof res._json.error, "string");
  });
});

describe("health routes — GET /service-status (public, no secret)", () => {
  it("reports database ok and component checks when the DB is up", async () => {
    const pool = trackingPool();
    const handler = getHandler(
      createHealthRouter(createDeps(pool, { SMTP_HOST: "smtp.example.com", SMTP_PORT: 2525 })),
      "get",
      "/service-status"
    );
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.components.database.status, "ok");
    assert.strictEqual(typeof res._json.components.database.latency_ms, "number");
    // SMTP configured → status configured + host/port echoed
    assert.strictEqual(res._json.components.smtp.status, "configured");
    assert.strictEqual(res._json.components.smtp.host, "smtp.example.com");
    assert.strictEqual(res._json.components.smtp.port, 2525);
    // Stripe unconfigured (no real key in config)
    assert.strictEqual(res._json.components.stripe.status, "unconfigured");
    // overall + envelope fields
    assert.ok(["ok", "degraded"].includes(res._json.status));
    assert.strictEqual(typeof res._json.response_ms, "number");
    assert.strictEqual(res._json.node, process.version);
  });

  it("reports smtp unconfigured when SMTP_HOST is absent", async () => {
    const handler = getHandler(
      createHealthRouter(createDeps(trackingPool(), {})),
      "get",
      "/service-status"
    );
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.components.smtp.status, "unconfigured");
    assert.match(res._json.components.smtp.note, /SMTP_HOST/);
  });

  it("returns 503 and database:error when the DB ping throws", async () => {
    const pool = trackingPool({ failOn: (sql) => /SELECT\s+1/i.test(sql) });
    const handler = getHandler(createHealthRouter(createDeps(pool, {})), "get", "/service-status");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 503);
    assert.strictEqual(res._json.components.database.status, "error");
    assert.strictEqual(res._json.components.database.error, "DB_UNREACHABLE");
    assert.strictEqual(res._json.status, "degraded");
  });
});

describe("health routes — GET /public/system-status (Trust Center)", () => {
  it("reports all components ok when DB is up and SMTP configured", async () => {
    const pool = trackingPool();
    const handler = getHandler(
      createHealthRouter(createDeps(pool, { SMTP_HOST: "smtp.example.com" })),
      "get",
      "/public/system-status"
    );
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.components.api.status, "ok");
    assert.strictEqual(res._json.components.database.status, "ok");
    assert.strictEqual(res._json.components.matching_engine.status, "ok");
    assert.strictEqual(res._json.components.timesheet_processing.status, "ok");
    assert.strictEqual(res._json.components.notification_system.status, "ok");
    assert.ok(["ok", "partial"].includes(res._json.status));
    assert.strictEqual(typeof res._json.response_ms, "number");
  });

  it("marks notification_system degraded when SMTP is missing (overall partial)", async () => {
    const handler = getHandler(
      createHealthRouter(createDeps(trackingPool(), {})),
      "get",
      "/public/system-status"
    );
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.components.notification_system.status, "degraded");
    assert.match(res._json.components.notification_system.note, /E-Mail/);
    // a degraded (non-error) component drives overall to "partial"
    assert.strictEqual(res._json.status, "partial");
  });

  it("returns 503 and overall degraded when the DB ping throws", async () => {
    const pool = trackingPool({ failOn: (sql) => /SELECT\s+1/i.test(sql) });
    const handler = getHandler(
      createHealthRouter(createDeps(pool, { SMTP_HOST: "smtp.example.com" })),
      "get",
      "/public/system-status"
    );
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 503);
    assert.strictEqual(res._json.components.database.status, "error");
    assert.strictEqual(res._json.components.matching_engine.status, "error");
    assert.strictEqual(res._json.components.timesheet_processing.status, "error");
    assert.strictEqual(res._json.status, "degraded");
  });
});

describe("health routes — GET /debug/sentry-test (secret-gated)", () => {
  const SECRET = "sentry-admin-secret";

  it("returns 404 when ADMIN_SECRET is unset", () => {
    const handler = getHandler(createHealthRouter(createDeps(trackingPool(), {})), "get", "/debug/sentry-test");
    const res = mockRes();
    handler(mockReq({ headers: { "x-admin-secret": "x" } }), res);
    assert.strictEqual(res._status, 404);
    assert.deepStrictEqual(res._json, { error: "NOT_FOUND" });
  });

  it("returns 404 when the secret is wrong", () => {
    const handler = getHandler(
      createHealthRouter(createDeps(trackingPool(), { ADMIN_SECRET: SECRET })),
      "get",
      "/debug/sentry-test"
    );
    const res = mockRes();
    handler(mockReq({ headers: { "x-admin-secret": "nope" } }), res);
    assert.strictEqual(res._status, 404);
    assert.deepStrictEqual(res._json, { error: "NOT_FOUND" });
  });

  it("returns sentry:inactive when monitoring is not active (no SENTRY_DSN)", () => {
    const handler = getHandler(
      createHealthRouter(createDeps(trackingPool(), { ADMIN_SECRET: SECRET })),
      "get",
      "/debug/sentry-test"
    );
    const res = mockRes();
    handler(mockReq({ query: { secret: SECRET } }), res);

    // In the test environment Sentry is not initialised → inactive branch.
    // (Status defaults to 200; the body carries the inactive contract.)
    assert.strictEqual(res._json.ok, false);
    assert.strictEqual(res._json.sentry, "inactive");
    assert.match(res._json.hint, /SENTRY_DSN/);
  });
});

describe("health routes — GET /admin/metrics-export (secret-gated)", () => {
  const SECRET = "metrics-secret";

  it("returns 404 when ADMIN_SECRET is unset", async () => {
    const pool = trackingPool();
    const handler = getHandler(createHealthRouter(createDeps(pool, {})), "get", "/admin/metrics-export");
    const res = mockRes();
    await handler(mockReq({ query: { secret: "x" } }), res);

    assert.strictEqual(res._status, 404);
    assert.deepStrictEqual(res._json, { error: "NOT_FOUND" });
    assert.strictEqual(pool.calls.length, 0, "must not query metrics before the secret gate");
  });

  it("returns 404 when the secret is wrong", async () => {
    const handler = getHandler(
      createHealthRouter(createDeps(trackingPool(), { ADMIN_SECRET: SECRET })),
      "get",
      "/admin/metrics-export"
    );
    const res = mockRes();
    await handler(mockReq({ headers: { "x-admin-secret": "wrong" } }), res);
    assert.strictEqual(res._status, 404);
    assert.deepStrictEqual(res._json, { error: "NOT_FOUND" });
  });

  it("returns the platform metrics payload on a valid secret", async () => {
    const pool = trackingPool();
    const handler = getHandler(
      createHealthRouter(createDeps(pool, { ADMIN_SECRET: SECRET })),
      "get",
      "/admin/metrics-export"
    );
    const res = mockRes();
    await handler(mockReq({ headers: { "x-admin-secret": SECRET } }), res);

    assert.strictEqual(res._status, 200);
    assert.ok(res._json && typeof res._json === "object", "metrics object returned");
    // getMetrics(pool) must have queried the pool
    assert.ok(pool.calls.length > 0, "platform metrics must query the pool");
  });

  it("returns 500 METRICS_ERROR when the metrics query throws", async () => {
    // Fail every query except the secret gate (which does not query) so
    // platformMetrics.getMetrics rejects.
    const pool = trackingPool({ failOn: () => true });
    const handler = getHandler(
      createHealthRouter(createDeps(pool, { ADMIN_SECRET: SECRET })),
      "get",
      "/admin/metrics-export"
    );
    const res = mockRes();
    await handler(mockReq({ headers: { "x-admin-secret": SECRET } }), res);

    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "METRICS_ERROR");
    assert.strictEqual(typeof res._json.message, "string");
  });
});
