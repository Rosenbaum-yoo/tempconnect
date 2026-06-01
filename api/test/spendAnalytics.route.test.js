/**
 * Spend analytics route handler tests.
 * Covers query forwarding for executive spend drilldowns.
 *
 * Run: node --test --test-force-exit test/spendAnalytics.route.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSpendAnalyticsRouter } from "../routes/spendAnalytics.js";

function recordingSequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "user-1" },
    params: {},
    query: {},
    body: {},
    orgId: "org-1",
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    locals: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; }
  };
  return res;
}

const requireAuth = (_req, _res, next) => next();
const requireFeature = () => (_req, _res, next) => next();

function baseDeps(pool) {
  return {
    pool,
    requireAuth,
    requireFeature,
    logger: mockLogger()
  };
}

function findHandler(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const routePath = layer.route.path;
    const routeMethod = Object.keys(layer.route.methods)[0];
    if (routeMethod === method && routePath.includes(pathFragment)) {
      const handlers = layer.route.stack.map((stackLayer) => stackLayer.handle);
      return handlers[handlers.length - 1];
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${pathFragment} not found`);
}

describe("GET /spend-analytics/summary", () => {
  it("forwards executive date-window and drilldown filters into the spend summary stack", async () => {
    const pool = recordingSequencePool(
      { rows: [{ total_spend_cents: 100000, overtime_spend_cents: 5000, assignment_count: 2, vendor_count: 1, avg_rate_cents: 3500, timesheet_count: 4, total_hours: "40.00" }] },
      { rows: [{ projected_spend_cents: 150000, active_assignments: 1 }] },
      { rows: [{ over_rate_spend_cents: 10000, over_rate_count: 1 }] }
    );
    const router = createSpendAnalyticsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/spend-analytics/summary");
    const req = mockReq({
      query: {
        date_from: "2026-04-01",
        date_to: "2026-04-30",
        vendor_id: "sup-1",
        category: "Pflege",
        region: "Berlin",
        assignment_status: "active"
      }
    });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.total_spend_cents, 100000);
    assert.ok(pool.calls[0].params.includes("2026-04-01"));
    assert.ok(pool.calls[0].params.includes("2026-04-30"));
    assert.ok(pool.calls[0].params.includes("sup-1"));
    assert.ok(pool.calls[0].params.includes("%Pflege%"));
    assert.ok(pool.calls[0].params.includes("%Berlin%"));
    assert.ok(pool.calls[0].params.includes("active"));
    assert.ok(pool.calls[1].params.includes("sup-1"));
    assert.ok(pool.calls[1].params.includes("%Pflege%"));
    assert.ok(pool.calls[1].params.includes("%Berlin%"));
    assert.ok(pool.calls[1].params.includes("active"));
    assert.ok(pool.calls[2].params.includes("2026-04-01"));
    assert.ok(pool.calls[2].params.includes("2026-04-30"));
  });

  it("liefert scope-Objekt und generated_at fuer den Frontend-ScopeBar", async () => {
    const pool = recordingSequencePool(
      { rows: [{ total_spend_cents: 0, overtime_spend_cents: 0, assignment_count: 0,
                 vendor_count: 0, avg_rate_cents: null, timesheet_count: 0, total_hours: "0.00" }] },
      { rows: [{ projected_spend_cents: 0, active_assignments: 0 }] },
      { rows: [{ over_rate_spend_cents: 0, over_rate_count: 0 }] }
    );
    const router = createSpendAnalyticsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/spend-analytics/summary");
    const req = mockReq({
      orgId: "org-scope-42",
      query: { date_from: "2026-01-01", date_to: "2026-03-31", location_id: null }
    });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    // scope-Objekt muss vorhanden sein (Frontend renderScopeBar liest diese Felder)
    assert.ok(res._json.scope, "scope muss im Response enthalten sein");
    assert.strictEqual(res._json.scope.org_id, "org-scope-42", "scope.org_id muss zur anfragenden Org passen");
    assert.strictEqual(res._json.scope.date_from, "2026-01-01", "scope.date_from muss dem Filter-Param entsprechen");
    assert.strictEqual(res._json.scope.date_to, "2026-03-31", "scope.date_to muss dem Filter-Param entsprechen");
    assert.strictEqual(res._json.scope.location_id, null, "scope.location_id ist null wenn kein Standortfilter gesetzt");
    // generated_at muss ISO-Timestamp sein (Frontend fmtDateTime liest diesen Wert)
    assert.ok(typeof res._json.generated_at === "string", "generated_at muss als ISO-String vorhanden sein");
    assert.ok(!isNaN(new Date(res._json.generated_at).getTime()), "generated_at muss parsebarer ISO-Timestamp sein");
  });

  it("scope.location_id wird korrekt befuellt wenn Standortfilter gesetzt ist", async () => {
    const pool = {
      calls: [],
      query: async (sql, params = []) => {
        pool.calls.push({ sql, params });
        if (sql.includes("is_active = TRUE")) return { rows: [{ 1: 1 }] }; // location valid
        return { rows: [{ total_spend_cents: 0, overtime_spend_cents: 0, assignment_count: 0,
                          vendor_count: 0, avg_rate_cents: null, timesheet_count: 0, total_hours: "0.00",
                          projected_spend_cents: 0, active_assignments: 0, over_rate_spend_cents: 0, over_rate_count: 0 }] };
      }
    };
    const router = createSpendAnalyticsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/spend-analytics/summary");
    const req = mockReq({ orgId: "org-1", query: { location_id: "loc-123" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.scope.location_id, "loc-123", "scope.location_id muss den aktiven Standortfilter widerspiegeln");
  });

  it("returns ORG_CONTEXT_REQUIRED without an organization context", async () => {
    const pool = recordingSequencePool();
    const router = createSpendAnalyticsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/spend-analytics/summary");
    const res = mockRes();

    await handler(mockReq({ orgId: null }), res);

    assert.strictEqual(res._status, 400);
    assert.deepStrictEqual(res._json, { error: "ORG_CONTEXT_REQUIRED" });
    assert.strictEqual(pool.calls.length, 0);
  });
});

describe("GET /spend-analytics/summary — location boundary", () => {
  it("gibt 403 ORG_BOUNDARY_VIOLATION zurück wenn location_id nicht zur Org gehört", async () => {
    // Pool gibt leere Rows für org_locations → Standort gehört nicht zur Org → 403
    const pool = {
      query: async (sql) => {
        if (sql.includes("is_active = TRUE")) return { rows: [] };
        return { rows: [] };
      }
    };
    const router = createSpendAnalyticsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/spend-analytics/summary");
    const req = mockReq({ orgId: "org-1", query: { location_id: "loc-fremd-999" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("gibt success:true zurück wenn location_id zur Org gehört", async () => {
    // Pool: org_locations gibt Row zurück → valid → Service wird aufgerufen
    const pool = {
      calls: [],
      query: async (sql, params = []) => {
        pool.calls.push({ sql, params });
        if (sql.includes("is_active = TRUE")) return { rows: [{ 1: 1 }] };
        // Spend-Queries: Leerdaten (zero-fallback)
        return { rows: [{ total_spend_cents: 0, overtime_spend_cents: 0, assignment_count: 0,
                          vendor_count: 0, avg_rate_cents: null, timesheet_count: 0, total_hours: "0.00",
                          projected_spend_cents: 0, active_assignments: 0 }] };
      }
    };
    const router = createSpendAnalyticsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/spend-analytics/summary");
    const req = mockReq({ orgId: "org-1", query: { location_id: "loc-eigen-42" } });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    // Standort-UUID muss in mindestens einem Service-Call auftauchen
    const locationInCalls = pool.calls.some((c) => c.params.includes("loc-eigen-42"));
    assert.ok(locationInCalls, "locationId muss als SQL-Parameter an den Service weitergegeben werden");
  });
});

describe("GET /spend-analytics/over-time", () => {
  it("forwards granularity and scoped filters to the time-series query", async () => {
    const pool = recordingSequencePool(
      { rows: [{ period: "2026-04-01", spend_cents: 50000, hours: "20.00", avg_rate_cents: 2500, assignment_count: 1 }] }
    );
    const router = createSpendAnalyticsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/spend-analytics/over-time");
    const req = mockReq({
      query: {
        date_from: "2026-01-01",
        date_to: "2026-06-30",
        vendor_id: "sup-77",
        granularity: "quarterly"
      }
    });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.length, 1);
    // Service uses parameterized DATE_TRUNC($N, ...) for injection safety — verify both the SQL pattern and the param value
    assert.match(pool.calls[0].sql, /DATE_TRUNC\(\$\d+/i);
    assert.ok(pool.calls[0].params.includes("quarter"), "granularity 'quarter' should be passed as SQL param");
    assert.ok(pool.calls[0].params.includes("2026-01-01"));
    assert.ok(pool.calls[0].params.includes("2026-06-30"));
    assert.ok(pool.calls[0].params.includes("sup-77"));
  });
});
