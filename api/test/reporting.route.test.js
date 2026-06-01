/**
 * Reporting route handler tests.
 * Covers GET /reporting/finance-truth/export format handling, payload shape, and audit details.
 *
 * Run: node --test --test-force-exit test/reporting.route.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createReportingRouter } from "../routes/reporting.js";

function recordingPool(defaultResponse = { rows: [] }) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      return defaultResponse;
    }
  };
}

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "user-1" },
    user: { id: "user-1" },
    params: {},
    query: {},
    body: {},
    orgId: "org-1",
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
    locals: {},
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; return res; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    send(payload) { res._send = payload; return res; }
  };
  return res;
}

function createDeps(pool) {
  return {
    pool,
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next()
  };
}

function getRouteHandlers(router, method, exactPath) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== exactPath) continue;
    if (!layer.route.methods[method]) continue;
    return layer.route.stack.map((stackLayer) => stackLayer.handle);
  }
  throw new Error(`Route ${method.toUpperCase()} ${exactPath} not found`);
}

describe("reporting routes — GET /reporting/dashboard — location scope", () => {
  /**
   * Pool-Helper: gibt leere Zeilen zurück — außer für den org_locations-
   * Validierungsquery (is_active = TRUE), der gesteuert werden kann.
   */
  function locationPool(locationIsValid) {
    return {
      query: async (sql) => {
        if (sql.includes("is_active = TRUE")) {
          return locationIsValid ? { rows: [{ 1: 1 }] } : { rows: [] };
        }
        // Alle anderen Service-Queries: Leerdaten (zero-fallback)
        return { rows: [] };
      }
    };
  }

  it("gibt 403 ORG_BOUNDARY_VIOLATION zurück wenn location_id nicht zur Org gehört", async () => {
    const pool = locationPool(false); // Standort ist fremd
    const router = createReportingRouter(createDeps(pool));
    const handlers = getRouteHandlers(router, "get", "/reporting/dashboard");
    const handler = handlers[handlers.length - 1];
    const req = mockReq({ orgId: "org-1", query: { location_id: "loc-fremd-123" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("gibt scope-Sektion zurück wenn location_id zur Org gehört", async () => {
    const pool = locationPool(true); // Standort ist valide
    const router = createReportingRouter(createDeps(pool));
    const handlers = getRouteHandlers(router, "get", "/reporting/dashboard");
    const handler = handlers[handlers.length - 1];
    const req = mockReq({ orgId: "org-scope-77", query: { location_id: "loc-scope-42" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.ok(res._json, "Antwort muss ein JSON-Objekt sein");
    assert.ok(res._json.scope, "scope-Sektion muss vorhanden sein");
    assert.strictEqual(res._json.scope.org_id, "org-scope-77");
    assert.strictEqual(res._json.scope.location_id, "loc-scope-42");
    assert.ok(res._json.scope.date_from, "date_from muss gesetzt sein");
    assert.ok(res._json.scope.date_to, "date_to muss gesetzt sein");
    assert.strictEqual(typeof res._json.scope.window_days, "number");
  });

  it("scope.location_id ist null wenn kein Standort-Filter übergeben", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const router = createReportingRouter(createDeps(pool));
    const handlers = getRouteHandlers(router, "get", "/reporting/dashboard");
    const handler = handlers[handlers.length - 1];
    const req = mockReq({ orgId: "org-no-loc", query: {} });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.scope.location_id, null);
    assert.strictEqual(res._json.scope.org_id, "org-no-loc");
  });
});

describe("reporting routes — GET /reporting/finance-truth/export", () => {
  it("registers auth, permission middleware, and route handler", () => {
    const router = createReportingRouter(createDeps(recordingPool()));
    const handlers = getRouteHandlers(router, "get", "/reporting/finance-truth/export");
    assert.ok(Array.isArray(handlers));
    assert.ok(handlers.length >= 3);
  });

  it("rejects unsupported formats with INVALID_FORMAT", async () => {
    const pool = recordingPool();
    const router = createReportingRouter(createDeps(pool));
    const handlers = getRouteHandlers(router, "get", "/reporting/finance-truth/export");
    const handler = handlers[handlers.length - 1];
    const req = mockReq({ query: { format: "xlsx" } });
    const res = mockRes();

    let passedError = null;
    await handler(req, res, (err) => { passedError = err; });

    assert.strictEqual(passedError, null);
    assert.strictEqual(res._status, 400);
    assert.deepStrictEqual(res._json, {
      error: "INVALID_FORMAT",
      message: "format must be csv or json"
    });
    assert.strictEqual(pool.calls.length, 0);
  });

  it("returns JSON export payload and writes audit details", async () => {
    const pool = recordingPool();
    const router = createReportingRouter(createDeps(pool));
    const handlers = getRouteHandlers(router, "get", "/reporting/finance-truth/export");
    const handler = handlers[handlers.length - 1];
    const req = mockReq({
      orgId: "org-42",
      session: { userId: "user-42" },
      user: { id: "user-42" },
      query: { format: "json" }
    });
    const res = mockRes();

    let passedError = null;
    await handler(req, res, (err) => { passedError = err; });

    assert.strictEqual(passedError, null);
    assert.strictEqual(res._status, 200);
    assert.ok(res._json);
    assert.strictEqual(res._json.org_id, "org-42");
    assert.ok(Array.isArray(res._json.rows));
    assert.ok(res._json.rows.length > 0);
    assert.ok(res._json.finance);
    assert.strictEqual(res.locals.audit.action, "report.finance_truth_export");
    assert.strictEqual(res.locals.audit.entity_type, "organization");
    assert.strictEqual(res.locals.audit.entity_id, "org-42");
    assert.strictEqual(res.locals.audit.details.format, "json");
    assert.strictEqual(res.locals.audit.details.row_count, res._json.rows.length);
    assert.strictEqual(res.locals.audit.details.generator, "reporting.executiveFinanceTruthExport");
    assert.strictEqual(res.locals.audit.details.source, "revenueMetricsService.getRevenueMetrics");
    assert.strictEqual(res.locals.audit.details.responsible_actor_user_id, "user-42");
    assert.ok(res.locals.audit.details.generated_at);
  });

  it("returns CSV attachment and sets matching audit metadata", async () => {
    const pool = recordingPool();
    const router = createReportingRouter(createDeps(pool));
    const handlers = getRouteHandlers(router, "get", "/reporting/finance-truth/export");
    const handler = handlers[handlers.length - 1];
    const req = mockReq({
      orgId: "org-7",
      session: { userId: "user-7" },
      user: { id: "user-7" },
      query: { format: "csv" }
    });
    const res = mockRes();

    let passedError = null;
    await handler(req, res, (err) => { passedError = err; });

    assert.strictEqual(passedError, null);
    assert.strictEqual(res._status, 200);
    assert.equal(typeof res._send, "string");
    assert.match(res._send, /^generated_at,org_id,section,metric_key,metric_value,unit,available,source/m);
    assert.match(String(res._headers["content-type"] || ""), /^text\/csv/i);
    assert.match(String(res._headers["content-disposition"] || ""), /^attachment;\s*filename="finance-truth-/i);
    assert.strictEqual(res.locals.audit.details.format, "csv");
    assert.strictEqual(res.locals.audit.details.source, "revenueMetricsService.getRevenueMetrics");
    assert.strictEqual(res.locals.audit.details.responsible_actor_user_id, "user-7");
    assert.strictEqual(res.locals.audit.details.row_count > 0, true);
  });
});
