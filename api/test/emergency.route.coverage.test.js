/**
 * Emergency staffing route handler coverage tests — routes/emergency.js.
 *
 * Constructs the router via createEmergencyRouter(deps) with mocked deps,
 * extracts each handler from router.stack, and invokes it with mock req/res
 * plus a dispatching mock pool. Asserts real behaviour: status codes, response
 * body shape, audit metadata in res.locals.audit, and SQL params via the pool.
 *
 * The handlers delegate to the real emergencyStaffingService /
 * emergencyCommitmentService / dealAgreementService modules and to the real
 * isEmergency()/URGENCY_CONFIG/canAccessAsOwner helpers (these are static
 * imports, not injectable). The dispatching pool returns controlled rows so the
 * service early-return branches (NOT_FOUND / NOT_EMERGENCY / NOT_OPEN /
 * SUPPLIER_NOT_MATCHED / FORBIDDEN / COMMITMENT_NOT_ACTIVE) are reached as the
 * production code would reach them.
 *
 * Run: node --test --test-force-exit test/emergency.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEmergencyRouter } from "../routes/emergency.js";

/* ── Mock infrastructure ───────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

const requireAuth = (_req, _res, next) => next();
const requireFeature = () => (_req, _res, next) => next();

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    params: {},
    body: {},
    query: {},
    headers: {},
    ip: "127.0.0.1",
    get: () => "",
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    _body: null,
    locals: {},
    status(c) { this._status = c; return this; },
    json(b) { this._json = b; return this; },
    send(b) { this._body = b; return this; },
    set() { return this; },
    type() { return this; },
    end() { return this; }
  };
  return res;
}

/**
 * Dispatching pool: records every {sql, params} and resolves rows by matching
 * the SQL against an ordered list of [substring, rowsOrFn] handlers. Supports
 * connect() so transaction-based service functions (withTransaction / FOR
 * UPDATE) run against the same dispatch table. BEGIN/COMMIT/ROLLBACK are
 * consumed transparently.
 */
function dispatchPool(handlers = []) {
  const calls = [];
  const TX = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);
  const run = async (sql, params = []) => {
    if (typeof sql === "string" && TX.has(sql.trim().toUpperCase())) {
      return { rows: [], rowCount: 0 };
    }
    calls.push({ sql, params });
    for (const [needle, value] of handlers) {
      if (typeof sql === "string" && sql.includes(needle)) {
        const rows = typeof value === "function" ? value(sql, params) : value;
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  const pool = {
    calls,
    query: run,
    connect: async () => ({ query: run, release() {} })
  };
  return pool;
}

function baseDeps(pool, role = "company", plan = "PRO") {
  return {
    pool,
    requireAuth,
    requireFeature,
    logger: mockLogger(),
    getUserAndPlan: async (id) => ({ id, role, plan, org_id: id })
  };
}

function findHandler(router, method, exactPath) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== exactPath) continue;
    if (!layer.route.methods[method]) continue;
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  }
  throw new Error(`Route ${method.toUpperCase()} ${exactPath} not found`);
}

/* A valid emergency demand row used by getDemandById / commitment list. */
function emergencyDemandRow(overrides = {}) {
  return {
    id: "demand-1",
    requester_company_id: "company-1",
    urgency: "notdienst",
    status: "open",
    required_total_count: 5,
    currently_committed_count: 1,
    remaining_open_count: 4,
    ...overrides
  };
}

/* ── Router registration ───────────────────────────────── */

describe("emergency router — registration", () => {
  it("registers all expected routes", () => {
    const router = createEmergencyRouter(baseDeps(dispatchPool()));
    const routes = router.stack
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    const expected = [
      "POST /emergency/request",
      "GET /emergency/active",
      "GET /emergency/dashboard",
      "POST /emergency/:id/respond",
      "POST /emergency/:id/escalate",
      "GET /emergency/history",
      "GET /emergency/config",
      "GET /emergency/:id/commitments",
      "POST /emergency/:id/commitments",
      "PATCH /emergency/commitments/:id",
      "POST /emergency/:id/commitments/:cid/create-agreement"
    ];
    for (const e of expected) {
      assert.ok(routes.includes(e), `route ${e} must be registered`);
    }
  });
});

/* ── POST /emergency/request ───────────────────────────── */

describe("POST /emergency/request", () => {
  it("returns 403 COMPANY_ONLY for non-company role", async () => {
    const pool = dispatchPool();
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/request");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    assert.strictEqual(res._status, 403);
    assert.deepStrictEqual(res._json, { error: "COMPANY_ONLY" });
    assert.strictEqual(pool.calls.length, 0);
  });

  it("returns 400 VALIDATION for an invalid payload", async () => {
    const pool = dispatchPool();
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "post", "/emergency/request");
    const res = mockRes();
    // missing required title/role/start_date/location_city
    await handler(mockReq({ body: { headcount: 2 } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
    assert.ok(Array.isArray(res._json.details));
    assert.ok(res._json.details.length > 0);
  });

  it("returns 500 SERVER_ERROR when the service throws", async () => {
    // Pool with no matching handler for the create-flow → service hits an
    // unexpected shape and throws; handler must convert to 500 (not crash).
    const pool = {
      query: async () => { throw new Error("boom"); },
      connect: async () => ({ query: async () => { throw new Error("boom"); }, release() {} })
    };
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "post", "/emergency/request");
    const res = mockRes();
    const validBody = {
      title: "Notdienst Pflege",
      role: "Pflegekraft",
      start_date: "2026-07-01",
      location_city: "Hamburg"
    };
    await handler(mockReq({ body: validBody }), res);
    assert.strictEqual(res._status, 500);
    assert.deepStrictEqual(res._json, { error: "SERVER_ERROR" });
  });
});

/* ── GET /emergency/active ─────────────────────────────── */

describe("GET /emergency/active", () => {
  it("returns items scoped to the session user by default", async () => {
    const pool = dispatchPool([
      ["FROM demand_requests dr", () => [
        emergencyDemandRow({ id: "d-a", urgency: "notdienst", company_name: "ACME", age_minutes: 12, sla_overdue: false })
      ]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/active");
    const res = mockRes();
    await handler(mockReq({ session: { userId: "company-99" }, query: {} }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.count, 1);
    assert.strictEqual(res._json.items.length, 1);
    assert.strictEqual(res._json.items[0].id, "d-a");
    // default scope → orgId passed to service equals session user
    assert.ok(pool.calls[0].params.includes("company-99"));
    assert.strictEqual(res._json.items[0].urgency_level, "NOTDIENST");
  });

  it("passes null org scope when all=1", async () => {
    const pool = dispatchPool([["FROM demand_requests dr", () => []]]);
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/active");
    const res = mockRes();
    await handler(mockReq({ session: { userId: "company-99" }, query: { all: "1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.count, 0);
    assert.deepStrictEqual(pool.calls[0].params, [null]);
  });

  it("returns 500 SERVER_ERROR on query failure", async () => {
    const pool = { query: async () => { throw new Error("db"); } };
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/active");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.deepStrictEqual(res._json, { error: "SERVER_ERROR" });
  });
});

/* ── GET /emergency/dashboard ──────────────────────────── */

describe("GET /emergency/dashboard", () => {
  it("returns the aggregated dashboard shape", async () => {
    const pool = dispatchPool([
      ["total_active", () => [{
        total_active: 3, escalated: 1, sla_breached: 0, notdienst_count: 2, urgent_count: 1
      }]],
      ["total_emergencies_30d", () => [{
        total_emergencies_30d: 10, responded_count: 8, avg_response_minutes: 22.4,
        sla_met_count: 7, sla_breached_count: 1, filled_count: 6
      }]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/dashboard");
    const res = mockRes();
    await handler(mockReq({ session: { userId: "company-7" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.active.total, 3);
    assert.strictEqual(res._json.active.notdienst, 2);
    assert.strictEqual(res._json.metrics_30d.total, 10);
    assert.strictEqual(res._json.metrics_30d.response_rate, 80);
    assert.strictEqual(res._json.metrics_30d.avg_response_minutes, 22);
    assert.ok(pool.calls[0].params.includes("company-7"));
  });

  it("returns 500 SERVER_ERROR on failure", async () => {
    const pool = { query: async () => { throw new Error("db"); } };
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/dashboard");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

/* ── POST /emergency/:id/respond ───────────────────────── */

describe("POST /emergency/:id/respond", () => {
  it("returns 403 AGENCY_ONLY for non-agency role", async () => {
    const pool = dispatchPool();
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "post", "/emergency/:id/respond");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" } }), res);
    assert.strictEqual(res._status, 403);
    assert.deepStrictEqual(res._json, { error: "AGENCY_ONLY" });
  });

  it("returns 404 when the demand does not exist", async () => {
    const pool = dispatchPool([
      ["FROM demand_requests WHERE id = $1", () => []]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/respond");
    const res = mockRes();
    await handler(mockReq({ params: { id: "missing" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("returns 400 NOT_EMERGENCY for a non-emergency urgency", async () => {
    const pool = dispatchPool([
      ["FROM demand_requests WHERE id = $1", () => [{ id: "d-1", urgency: "normal", status: "open" }]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/respond");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "NOT_EMERGENCY");
  });

  it("returns 409 NOT_OPEN when the demand is not open", async () => {
    const pool = dispatchPool([
      ["FROM demand_requests WHERE id = $1", () => [{ id: "d-1", urgency: "notdienst", status: "filled" }]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/respond");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "NOT_OPEN");
  });

  it("records a response and writes audit on success", async () => {
    const pool = dispatchPool([
      ["FROM demand_requests WHERE id = $1", () => [{ id: "d-1", urgency: "notdienst", status: "open" }]],
      ["UPDATE demand_requests", () => [{ supplier_response_count: 2, first_supplier_response_at: "2026-07-01T10:00:00Z" }]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/respond");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" }, session: { userId: "agency-1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.response_count, 2);
    assert.strictEqual(res.locals.audit.action, "emergency.respond");
    assert.strictEqual(res.locals.audit.entity_type, "demand_request");
    assert.strictEqual(res.locals.audit.entity_id, "d-1");
    assert.strictEqual(res.locals.audit.details.response_count, 2);
  });
});

/* ── POST /emergency/:id/escalate ──────────────────────── */

describe("POST /emergency/:id/escalate", () => {
  it("returns 404 NOT_FOUND when the demand is missing", async () => {
    // escalateEmergency first SELECTs the demand; empty → NOT_FOUND
    const pool = dispatchPool([
      ["FROM demand_requests", () => []]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "post", "/emergency/:id/escalate");
    const res = mockRes();
    await handler(mockReq({ params: { id: "missing" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("returns 500 SERVER_ERROR when the service throws", async () => {
    const pool = { query: async () => { throw new Error("db"); } };
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "post", "/emergency/:id/escalate");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" } }), res);
    assert.strictEqual(res._status, 500);
    assert.deepStrictEqual(res._json, { error: "SERVER_ERROR" });
  });
});

/* ── GET /emergency/history ────────────────────────────── */

describe("GET /emergency/history", () => {
  it("returns items with the requested pagination", async () => {
    const pool = dispatchPool([
      ["FROM demand_requests", () => [emergencyDemandRow({ id: "h-1" })]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/history");
    const res = mockRes();
    await handler(mockReq({ session: { userId: "company-1" }, query: { limit: "5", offset: "10" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.count, 1);
    assert.strictEqual(res._json.items[0].id, "h-1");
    // limit/offset forwarded as SQL params
    assert.ok(pool.calls[0].params.includes(5));
    assert.ok(pool.calls[0].params.includes(10));
  });

  it("returns 500 SERVER_ERROR on failure", async () => {
    const pool = { query: async () => { throw new Error("db"); } };
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/history");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

/* ── GET /emergency/config ─────────────────────────────── */

describe("GET /emergency/config", () => {
  it("returns the urgency-level catalogue with emergency flags", async () => {
    const router = createEmergencyRouter(baseDeps(dispatchPool()));
    const handler = findHandler(router, "get", "/emergency/config");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.urgency_levels));
    const byLevel = Object.fromEntries(res._json.urgency_levels.map((l) => [l.level, l]));
    // Catalogue must expose every configured level
    for (const key of ["NORMAL", "HIGH", "URGENT", "CRITICAL", "NOTDIENST"]) {
      assert.ok(byLevel[key], `level ${key} must be present`);
    }
    // NOTDIENST is an emergency, NORMAL is not
    assert.strictEqual(byLevel.NOTDIENST.is_emergency, true);
    assert.strictEqual(byLevel.NORMAL.is_emergency, false);
    assert.strictEqual(byLevel.NOTDIENST.label, "Notdienst");
    assert.strictEqual(byLevel.NOTDIENST.sla_minutes, 30);
  });
});

/* ── GET /emergency/:id/commitments ────────────────────── */

describe("GET /emergency/:id/commitments", () => {
  it("returns 404 NOT_FOUND when the demand does not exist", async () => {
    const pool = dispatchPool([
      ["FROM demand_requests dr", () => []]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/:id/commitments");
    const res = mockRes();
    await handler(mockReq({ params: { id: "missing" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("returns 400 NOT_EMERGENCY when the demand is not an emergency", async () => {
    const pool = dispatchPool([
      ["FROM demand_requests dr", () => [emergencyDemandRow({ urgency: "normal" })]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/:id/commitments");
    const res = mockRes();
    await handler(mockReq({ params: { id: "demand-1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "NOT_EMERGENCY");
  });

  it("returns 403 FORBIDDEN when caller is neither requester nor matched agency", async () => {
    const pool = dispatchPool([
      ["FROM demand_requests dr", () => [emergencyDemandRow({ requester_company_id: "company-OTHER" })]],
      // canAccessAsOwner → org_memberships lookup empty → not requester
      ["FROM org_memberships", () => []],
      // canAgencyAccessEmergency → matches lookup empty (only for agency role)
      ["FROM matches m", () => []]
    ]);
    // session user is an unrelated company (no org membership, not agency)
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/:id/commitments");
    const res = mockRes();
    await handler(mockReq({ params: { id: "demand-1" }, session: { userId: "stranger" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("returns commitments when caller is the requester (direct owner match)", async () => {
    const pool = dispatchPool([
      ["FROM demand_requests dr", () => [emergencyDemandRow({ requester_company_id: "company-1" })]],
      ["FROM emergency_provider_commitments c", () => [
        { id: "c-1", supplier_company_id: "sup-1", committed_quantity: 2, status: "committed", supplier_company_name: "Sup GmbH" }
      ]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "get", "/emergency/:id/commitments");
    const res = mockRes();
    // session user == requester_company_id → canAccessAsOwner direct match (no org query)
    await handler(mockReq({ params: { id: "demand-1" }, session: { userId: "company-1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.demand_id, "demand-1");
    assert.strictEqual(res._json.required_total_count, 5);
    assert.strictEqual(res._json.remaining_open_count, 4);
    assert.strictEqual(res._json.commitments.length, 1);
    assert.strictEqual(res._json.commitments[0].id, "c-1");
  });
});

/* ── POST /emergency/:id/commitments ───────────────────── */

describe("POST /emergency/:id/commitments", () => {
  it("returns 403 AGENCY_ONLY for non-agency role", async () => {
    const pool = dispatchPool();
    const router = createEmergencyRouter(baseDeps(pool, "company"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" }, body: { committed_quantity: 1 } }), res);
    assert.strictEqual(res._status, 403);
    assert.deepStrictEqual(res._json, { error: "AGENCY_ONLY" });
  });

  it("returns 400 VALIDATION for an invalid body", async () => {
    const pool = dispatchPool();
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" }, body: { committed_quantity: 0 } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("returns 403 SUPPLIER_NOT_MATCHED when agency has no match on the demand", async () => {
    // createCommitment → hasSupplierMatch → matches lookup empty → SUPPLIER_NOT_MATCHED
    const pool = dispatchPool([
      ["FROM matches m", () => []]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" }, body: { committed_quantity: 2 } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "SUPPLIER_NOT_MATCHED");
  });

  it("returns 404 NOT_FOUND when the demand row is missing inside the transaction", async () => {
    const pool = dispatchPool([
      ["FROM matches m", () => [{ "?column?": 1 }]],          // supplier matched
      ["FROM demand_requests", () => []]                       // FOR UPDATE select empty
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" }, body: { committed_quantity: 2 } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("returns 409 NOT_OPEN when the demand is not in an open state", async () => {
    const pool = dispatchPool([
      ["FROM matches m", () => [{ "?column?": 1 }]],
      ["FROM demand_requests", () => [{
        id: "d-1", urgency: "notdienst", status: "filled",
        required_total_count: 5, currently_committed_count: 5, remaining_open_count: 0,
        overfill_allowed: false
      }]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" }, body: { committed_quantity: 1 } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "NOT_OPEN");
  });

  it("returns 409 OVERFILL_NOT_ALLOWED when quantity exceeds remaining and overfill is off", async () => {
    const pool = dispatchPool([
      ["FROM matches m", () => [{ "?column?": 1 }]],
      ["FROM demand_requests", () => [{
        id: "d-1", urgency: "notdienst", status: "open",
        required_total_count: 5, currently_committed_count: 4, remaining_open_count: 1,
        overfill_allowed: false
      }]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1" }, body: { committed_quantity: 5 } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "OVERFILL_NOT_ALLOWED");
  });
});

/* ── PATCH /emergency/commitments/:id ──────────────────── */

describe("PATCH /emergency/commitments/:id", () => {
  it("returns 400 VALIDATION for an invalid status", async () => {
    const pool = dispatchPool();
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "patch", "/emergency/commitments/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "c-1" }, body: { status: "accepted" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("returns 404 NOT_FOUND when the commitment does not exist", async () => {
    const pool = dispatchPool([
      ["FROM emergency_provider_commitments c", () => []]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "patch", "/emergency/commitments/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "missing" }, body: { status: "withdrawn" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("returns 403 FORBIDDEN when actor is neither owner nor admin", async () => {
    const pool = dispatchPool([
      ["FROM emergency_provider_commitments c", () => [{
        id: "c-1", supplier_company_id: "sup-X", requester_company_id: "company-Y",
        demand_request_id: "d-1", status: "committed"
      }]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "patch", "/emergency/commitments/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "c-1" }, body: { status: "withdrawn" }, session: { userId: "stranger" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("returns 409 INVALID_TRANSITION when the commitment is not committed", async () => {
    const pool = dispatchPool([
      ["FROM emergency_provider_commitments c", () => [{
        id: "c-1", supplier_company_id: "sup-1", requester_company_id: "company-1",
        demand_request_id: "d-1", status: "withdrawn"
      }]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "patch", "/emergency/commitments/:id");
    const res = mockRes();
    // actor is the supplier owner
    await handler(mockReq({ params: { id: "c-1" }, body: { status: "withdrawn" }, session: { userId: "sup-1" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "INVALID_TRANSITION");
  });
});

/* ── POST /emergency/:id/commitments/:cid/create-agreement ── */

describe("POST /emergency/:id/commitments/:cid/create-agreement", () => {
  it("returns 400 VALIDATION for an invalid body", async () => {
    const pool = dispatchPool();
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments/:cid/create-agreement");
    const res = mockRes();
    // quantity below min(1) → schema rejects
    await handler(mockReq({ params: { id: "d-1", cid: "c-1" }, body: { quantity: 0 } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("returns 404 NOT_FOUND when the commitment is missing", async () => {
    const pool = dispatchPool([
      ["FROM emergency_provider_commitments c", () => []]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments/:cid/create-agreement");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1", cid: "missing" }, body: {} }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("returns 403 FORBIDDEN when actor is neither requester nor supplier", async () => {
    const pool = dispatchPool([
      ["FROM emergency_provider_commitments c", () => [{
        id: "c-1", demand_request_id: "d-1", requester_company_id: "company-1",
        supplier_company_id: "sup-1", status: "committed", committed_quantity: 2
      }]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments/:cid/create-agreement");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1", cid: "c-1" }, body: {}, session: { userId: "stranger" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("returns 409 COMMITMENT_NOT_ACTIVE when the commitment is not committed", async () => {
    const pool = dispatchPool([
      ["FROM emergency_provider_commitments c", () => [{
        id: "c-1", demand_request_id: "d-1", requester_company_id: "company-1",
        supplier_company_id: "sup-1", status: "withdrawn", committed_quantity: 2
      }]]
    ]);
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments/:cid/create-agreement");
    const res = mockRes();
    // actor is the supplier owner → passes ownership, fails on status
    await handler(mockReq({ params: { id: "d-1", cid: "c-1" }, body: {}, session: { userId: "sup-1" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "COMMITMENT_NOT_ACTIVE");
  });

  it("returns 500 SERVER_ERROR when the service throws", async () => {
    const pool = {
      query: async () => { throw new Error("db"); },
      connect: async () => ({ query: async () => { throw new Error("db"); }, release() {} })
    };
    const router = createEmergencyRouter(baseDeps(pool, "agency"));
    const handler = findHandler(router, "post", "/emergency/:id/commitments/:cid/create-agreement");
    const res = mockRes();
    await handler(mockReq({ params: { id: "d-1", cid: "c-1" }, body: {} }), res);
    assert.strictEqual(res._status, 500);
    assert.deepStrictEqual(res._json, { error: "SERVER_ERROR" });
  });
});
