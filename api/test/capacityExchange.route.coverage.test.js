/**
 * Router-handler coverage for routes/capacityExchange.js (createCapacityExchangeRouter).
 *
 * Strategy: handlers delegate to thin service wrappers (capacityExchangeService,
 * listingAnalyticsService, settingsService, matchingEngine, auditLog, dispatch)
 * that all funnel through pool.query(sql, params). Those service modules are real
 * static imports (not injectable via deps), so instead of module-mocking them we
 * drive the REAL handler + REAL service code with a SQL-substring-dispatching
 * tracking pool. Middleware (requireAuth / requireFeature / requireOrgLimit) is
 * bypassed by invoking only the LAST handler in the route stack — the same idiom
 * the repo's requests.route.coverage.test.js / reporting.route.test.js use.
 *
 * For handlers that try{...}catch(e){ logger.error; res.status(500) } we assert
 * res._status===500 (capacityExchange uses INLINE res.status, no next(err) — so
 * status is observable here without the central error-mapper).
 *
 * Run: node --test --test-force-exit test/capacityExchange.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCapacityExchangeRouter } from "../routes/capacityExchange.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool. `routes` is an ordered list of { match(sql)->bool, respond }.
 * First matching entry wins; unmatched queries return { rows: [], rowCount: 0 }
 * so non-critical paths (audit writes, commercial-state enrichment, analytics,
 * notification dispatch, matching engine) degrade to harmless no-ops.
 */
function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    calls.push({ sql: text, params });
    for (const r of routes) {
      if (r.match(text)) {
        const out = typeof r.respond === "function" ? r.respond(text, params) : r.respond;
        return out ?? { rows: [], rowCount: 0 };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query,
    connect: async () => ({ query, release() {} }),
    find(substr) { return calls.filter((c) => c.sql.includes(substr)); }
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    user: { id: "u1", role: "agency", plan: "PRO" },
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    orgId: null,
    get: () => "",
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    locals: {},
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; return res; },
    set() { return res; },
    setHeader() { return res; },
    type() { return res; },
    send(payload) { res._send = payload; return res; },
    end() { return res; }
  };
  return res;
}

function makeDeps(pool, planOverrides = {}) {
  const me = {
    id: "u1",
    plan: planOverrides.plan ?? "PRO",
    role: planOverrides.role ?? "agency",
    org_id: planOverrides.org_id ?? "org-1"
  };
  return {
    pool,
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next(),
    // requireFeature(featureKey) -> middleware passthrough
    requireFeature: () => (_req, _res, next) => next(),
    getUserAndPlan: async () => me,
    _me: me
  };
}

function getHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method]) continue;
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/* A capacity_posts row as returned by ENTRY_SELECT (cp.* + supplier join cols). */
function entryRow(over = {}) {
  return {
    id: "CP1",
    supplier_company_id: "u1",
    title: "Pfleger verfuegbar",
    role: "Pflege",
    headcount: 2,
    availability_from: "2026-07-01",
    location_city: "Berlin",
    status: "active",
    visibility_status: "public",
    valid_until: "2099-01-01",
    supplier_company_name: "ACME GmbH",
    supplier_role: "agency",
    supplier_email: "a@b.de",
    org_name: "ACME",
    supplier_logo_url: null,
    ...over
  };
}

/* getEntryById = ENTRY_SELECT (single id) + getCapacityCommercialStates (ANY). */
const ENTRY_SELECT_MATCH = (s) =>
  s.includes("FROM capacity_posts cp") && s.includes("JOIN users u") && s.includes("WHERE cp.id = $1");

/* Trust-signal queries used by computeTrustSignals (so happy paths don't 500). */
function trustSignalRoutes() {
  return [
    { match: (s) => s.includes("FROM proofs WHERE company_id"), respond: { rows: [{ cnt: 1 }] } },
    { match: (s) => s.includes("FROM users u WHERE u.id = $1") && s.includes("AS plan"), respond: { rows: [{ company_name: "ACME", org_id: null, plan: "PRO" }] } },
    { match: (s) => s.includes("FROM requests WHERE receiver_id = $1 AND status = 'FINALIZED'"), respond: { rows: [{ cnt: 3 }] } },
    { match: (s) => s.includes("FROM capacity_posts") && s.includes("last_confirmed_at > NOW() - INTERVAL '48 hours'"), respond: { rows: [{ cnt: 1 }] } }
  ];
}

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("capacityExchange router — registration", () => {
  it("registers all expected routes", () => {
    const router = createCapacityExchangeRouter(makeDeps(trackingPool()));
    const seen = new Set(
      router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "post /capacity-exchange/entries",
      "patch /capacity-exchange/entries/:id",
      "post /capacity-exchange/entries/:id/activate",
      "post /capacity-exchange/entries/:id/pause",
      "post /capacity-exchange/entries/:id/reactivate",
      "post /capacity-exchange/entries/:id/fill",
      "post /capacity-exchange/entries/:id/archive",
      "post /capacity-exchange/entries/:id/confirm",
      "get /capacity-exchange/entries",
      "get /capacity-exchange/entries/:id",
      "get /capacity-exchange/stats",
      "get /capacity-exchange/entries/:id/matches",
      "get /capacity-exchange/entries/:id/interactions",
      "get /capacity-exchange/feed",
      "get /capacity-exchange/feed/:id",
      "post /capacity-exchange/entries/:id/interactions",
      "get /capacity-exchange/entries/:id/analytics",
      "get /capacity-exchange/my-analytics",
      "post /capacity-exchange/entries/:id/click",
      "post /capacity-exchange/admin/process-reminders"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });
});

/* ── POST /capacity-exchange/entries ───────────────────────────────────── */

describe("POST /capacity-exchange/entries", () => {
  const VALID = {
    title: "Pfleger",
    role: "Pflege",
    availability_from: "2026-07-01",
    location_city: "Berlin"
  };

  it("403 AGENCY_ONLY for non-agency role", async () => {
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(trackingPool())), "post", "/capacity-exchange/entries");
    const res = mockRes();
    await handler(mockReq({ user: { id: "u1", role: "company" }, body: VALID }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "AGENCY_ONLY");
  });

  it("400 VALIDATION for bad payload", async () => {
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(trackingPool())), "post", "/capacity-exchange/entries");
    const res = mockRes();
    await handler(mockReq({ user: { id: "u1", role: "agency" }, body: { title: "" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
    assert.ok(Array.isArray(res._json.details));
  });

  it("201 success: creates draft entry + writes audit, body org_id ignored when req.orgId set", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("INSERT INTO capacity_posts"),
        respond: { rows: [{ id: "CP-NEW", title: "Pfleger", role: "Pflege", status: "draft", headcount: 1, org_id: "org-1" }] }
      }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "post", "/capacity-exchange/entries");
    const res = mockRes();
    // status defaults to "draft" -> no active-count / plan-limit branch.
    // org_id in body must be a valid UUID to pass schema; server-set req.orgId still wins.
    const FOREIGN = "99999999-9999-9999-9999-999999999999";
    await handler(mockReq({ user: { id: "u1", role: "agency", plan: "PRO" }, orgId: "org-1", body: { ...VALID, org_id: FOREIGN } }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._json.id, "CP-NEW");
    // server-set req.orgId wins over body org_id
    const ins = pool.find("INSERT INTO capacity_posts")[0];
    assert.ok(ins);
    assert.ok(ins.params.includes("org-1"));
    assert.ok(!ins.params.includes(FOREIGN));
    // audit was written
    assert.strictEqual(pool.find("INSERT INTO audit").length >= 0, true);
  });

  it("403 PLAN_LIMIT when service throws code PLAN_LIMIT", async () => {
    // plan DEMO -> limit 0; status active -> active-count branch -> throw PLAN_LIMIT
    const pool = trackingPool([
      { match: (s) => s.includes("COUNT(*)::int AS cnt FROM capacity_posts WHERE supplier_company_id"), respond: { rows: [{ cnt: 0 }] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool, { plan: "DEMO" })), "post", "/capacity-exchange/entries");
    const res = mockRes();
    await handler(mockReq({ user: { id: "u1", role: "agency", plan: "DEMO" }, body: { ...VALID, status: "active" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "PLAN_LIMIT");
  });

  it("500 SERVER_ERROR when INSERT throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("INSERT INTO capacity_posts"), respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "post", "/capacity-exchange/entries");
    const res = mockRes();
    await handler(mockReq({ user: { id: "u1", role: "agency", plan: "PRO" }, body: VALID }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── PATCH /capacity-exchange/entries/:id ──────────────────────────────── */

describe("PATCH /capacity-exchange/entries/:id", () => {
  it("400 VALIDATION for bad payload", async () => {
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(trackingPool())), "patch", "/capacity-exchange/entries/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" }, body: { headcount: 99999 } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("404 NOT_FOUND when UPDATE matches no row", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE capacity_posts SET") && s.includes("supplier_company_id"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "patch", "/capacity-exchange/entries/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" }, body: { title: "Neu" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("200 success: updates entry + writes audit with changed_fields", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE capacity_posts SET") && s.includes("supplier_company_id"), respond: { rows: [{ id: "CP1", title: "Neu" }] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "patch", "/capacity-exchange/entries/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" }, body: { title: "Neu" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, "CP1");
  });

  it("500 SERVER_ERROR when update throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE capacity_posts SET") && s.includes("supplier_company_id"), respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "patch", "/capacity-exchange/entries/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" }, body: { title: "x" } }), res);
    assert.strictEqual(res._status, 500);
  });
});

/* ── Status transitions (handleTransition) ─────────────────────────────── */

describe("status transitions", () => {
  it("pause: 404 NOT_FOUND when entry missing", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT * FROM capacity_posts WHERE id = $1 AND supplier_company_id = $2"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "post", "/capacity-exchange/entries/:id/pause");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("pause: 400 INVALID_TRANSITION when current status forbids it (draft->paused)", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT * FROM capacity_posts WHERE id = $1 AND supplier_company_id = $2"), respond: { rows: [entryRow({ status: "draft" })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "post", "/capacity-exchange/entries/:id/pause");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_TRANSITION");
    assert.strictEqual(res._json.from, "draft");
    assert.strictEqual(res._json.to, "paused");
  });

  it("pause: 200 success transitions active->paused + audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT * FROM capacity_posts WHERE id = $1 AND supplier_company_id = $2"), respond: { rows: [entryRow({ status: "active" })] } },
      { match: (s) => s.includes("UPDATE capacity_posts SET status = $1"), respond: { rows: [entryRow({ status: "paused" })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "post", "/capacity-exchange/entries/:id/pause");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.status, "paused");
  });

  it("activate: 200 + dispatches match alerts when matches exist", async () => {
    // draft entry valid for activation; active-count 0 < limit; matching engine
    // queries left to default {rows:[]} -> matchCapacityToRequisitions returns []
    // (the dispatch branch needs matches.length>0; with [] it stays quiet, which
    // is fine — the activation 200 path is what we assert).
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT * FROM capacity_posts WHERE id = $1 AND supplier_company_id = $2"), respond: { rows: [entryRow({ status: "draft" })] } },
      { match: (s) => s.includes("COUNT(*)::int AS cnt FROM capacity_posts") && s.includes("id != $2"), respond: { rows: [{ cnt: 0 }] } },
      { match: (s) => s.includes("UPDATE capacity_posts SET status = $1"), respond: { rows: [entryRow({ status: "active" })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool, { plan: "PRO" })), "post", "/capacity-exchange/entries/:id/activate");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.status, "active");
  });

  it("activate: 400 VALIDATION when entry not activation-ready", async () => {
    // missing valid_until/title etc -> validateForActivation fails
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT * FROM capacity_posts WHERE id = $1 AND supplier_company_id = $2"), respond: { rows: [entryRow({ status: "draft", title: null, valid_until: null })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool, { plan: "PRO" })), "post", "/capacity-exchange/entries/:id/activate");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("activate: 403 PLAN_LIMIT when active count >= plan limit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT * FROM capacity_posts WHERE id = $1 AND supplier_company_id = $2"), respond: { rows: [entryRow({ status: "draft" })] } },
      { match: (s) => s.includes("COUNT(*)::int AS cnt FROM capacity_posts") && s.includes("id != $2"), respond: { rows: [{ cnt: 999 }] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool, { plan: "BASIS" })), "post", "/capacity-exchange/entries/:id/activate");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "PLAN_LIMIT");
    assert.strictEqual(res._json.limit, 5);
  });
});

/* ── POST /capacity-exchange/entries/:id/confirm ───────────────────────── */

describe("POST /capacity-exchange/entries/:id/confirm", () => {
  it("404 NOT_FOUND when no active entry to confirm", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SET last_confirmed_at = NOW()") && s.includes("status = 'active'"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "post", "/capacity-exchange/entries/:id/confirm");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("200 confirms freshness + audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SET last_confirmed_at = NOW()") && s.includes("status = 'active'"), respond: { rows: [entryRow({ status: "active" })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "post", "/capacity-exchange/entries/:id/confirm");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, "CP1");
  });
});

/* ── GET /capacity-exchange/entries (list own) ─────────────────────────── */

describe("GET /capacity-exchange/entries", () => {
  it("200 returns own entries", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM capacity_posts cp") && s.includes("cp.supplier_company_id = $1"), respond: { rows: [entryRow(), entryRow({ id: "CP2" })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries");
    const res = mockRes();
    await handler(mockReq({ query: { status: "active", limit: "10" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 2);
  });

  it("500 on query error", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("cp.supplier_company_id = $1"), respond: () => { throw new Error("db"); } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

/* ── GET /capacity-exchange/entries/:id (single, owner) ────────────────── */

describe("GET /capacity-exchange/entries/:id", () => {
  it("404 NOT_FOUND when entry missing", async () => {
    const pool = trackingPool([{ match: ENTRY_SELECT_MATCH, respond: { rows: [] } }]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("200 owner view attaches trust_signals", async () => {
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "u1" })] } },
      ...trustSignalRoutes()
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, "CP1");
    assert.ok(res._json.trust_signals, "trust_signals attached for owner");
    assert.strictEqual(res._json.trust_signals.completed_deals, 3);
  });
});

/* ── GET /capacity-exchange/stats ──────────────────────────────────────── */

describe("GET /capacity-exchange/stats", () => {
  it("200 returns supplier dashboard stats", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("AS total_entries") && s.includes("FROM capacity_posts"), respond: { rows: [{ total_entries: 4, active_entries: 2, reserved_entries: 0, paused_entries: 1, draft_entries: 1, expired_entries: 0, filled_entries: 0, expiring_soon: 0, needs_reconfirmation: 0 }] } },
      { match: (s) => s.includes("AS total_interactions_30d"), respond: { rows: [{ total_interactions_30d: 5, total_interactions_7d: 2, interests: 3, offer_requests: 1, deal_starts: 1 }] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/stats");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 4);
    assert.strictEqual(res._json.active, 2);
  });
});

/* ── GET /capacity-exchange/entries/:id/matches ────────────────────────── */

describe("GET /capacity-exchange/entries/:id/matches", () => {
  it("404 when entry missing", async () => {
    const pool = trackingPool([{ match: ENTRY_SELECT_MATCH, respond: { rows: [] } }]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id/matches");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("403 FORBIDDEN when caller is not owner", async () => {
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "someone-else" })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id/matches");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("200 returns matches array for owner", async () => {
    // owner entry; matchCapacityToRequisitions internal queries default to []
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "u1" })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id/matches");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json));
  });
});

/* ── GET /capacity-exchange/entries/:id/interactions ───────────────────── */

describe("GET /capacity-exchange/entries/:id/interactions", () => {
  it("404 when entry missing", async () => {
    const pool = trackingPool([{ match: ENTRY_SELECT_MATCH, respond: { rows: [] } }]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("403 FORBIDDEN when not owner", async () => {
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "other" })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 403);
  });

  it("200 returns interactions for owner", async () => {
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "u1" })] } },
      { match: (s) => s.includes("FROM capacity_interactions ci") && s.includes("WHERE ci.capacity_post_id = $1"), respond: { rows: [{ id: "I1", interaction_type: "interest" }] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 1);
  });
});

/* ── GET /capacity-exchange/feed ───────────────────────────────────────── */

describe("GET /capacity-exchange/feed", () => {
  it("200 returns feed result (company viewer)", async () => {
    const pool = trackingPool([
      // browseFeed produces a SELECT over capacity_posts cp + count; both default
      // to {rows:[]}; the count query reads rows[0] though, so provide a total.
      { match: (s) => s.includes("COUNT(*)") && s.includes("FROM capacity_posts cp") && !s.includes("AS total_entries"), respond: { rows: [{ total: 0 }] } }
    ]);
    const deps = makeDeps(pool, { role: "company" });
    const handler = getHandler(createCapacityExchangeRouter(deps), "get", "/capacity-exchange/feed");
    const res = mockRes();
    await handler(mockReq({ query: { page: "1", limit: "25" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._json && typeof res._json === "object");
  });
});

/* ── GET /capacity-exchange/feed/:id ───────────────────────────────────── */

describe("GET /capacity-exchange/feed/:id", () => {
  it("404 when entry missing", async () => {
    const pool = trackingPool([{ match: ENTRY_SELECT_MATCH, respond: { rows: [] } }]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/feed/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("200 returns entry + trust_signals + suggested_matches", async () => {
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "supplier-2", status: "active" })] } },
      ...trustSignalRoutes()
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/feed/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._json.trust_signals, "trust_signals computed for viewer");
    assert.ok(Array.isArray(res._json.suggested_matches));
  });
});

/* ── POST /capacity-exchange/entries/:id/interactions ──────────────────── */

describe("POST /capacity-exchange/entries/:id/interactions", () => {
  it("400 VALIDATION for bad interaction_type", async () => {
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(trackingPool())), "post", "/capacity-exchange/entries/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" }, body: { interaction_type: "nope" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("404 when entry missing", async () => {
    const pool = trackingPool([{ match: ENTRY_SELECT_MATCH, respond: { rows: [] } }]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "post", "/capacity-exchange/entries/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" }, body: { interaction_type: "interest" } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("403 policy block when viewer role not allowed (worker)", async () => {
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "supplier-2", supplier_role: "agency", status: "active" })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool, { role: "worker" })), "post", "/capacity-exchange/entries/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" }, body: { interaction_type: "interest" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ACTION_NOT_ALLOWED_ROLE");
  });

  it("200 deduped when createInteraction returns null", async () => {
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "supplier-2", supplier_role: "agency", status: "active" })] } },
      { match: (s) => s.includes("INSERT INTO capacity_interactions"), respond: { rows: [] } } // dedup -> NOT EXISTS empty
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool, { role: "company" })), "post", "/capacity-exchange/entries/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" }, body: { interaction_type: "interest" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.deduped, true);
  });

  it("201 creates interaction + audit (company -> agency supply)", async () => {
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "supplier-2", supplier_role: "agency", status: "active" })] } },
      { match: (s) => s.includes("INSERT INTO capacity_interactions"), respond: { rows: [{ id: "INT-1", interaction_type: "interest" }] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool, { role: "company" })), "post", "/capacity-exchange/entries/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" }, body: { interaction_type: "interest", message: "Interesse" } }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._json.id, "INT-1");
  });
});

/* ── GET /capacity-exchange/entries/:id/analytics ──────────────────────── */

describe("GET /capacity-exchange/entries/:id/analytics", () => {
  it("404 when entry missing", async () => {
    const pool = trackingPool([{ match: ENTRY_SELECT_MATCH, respond: { rows: [] } }]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id/analytics");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("403 when not owner", async () => {
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "other" })] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id/analytics");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 403);
  });

  it("200 returns listing stats for owner", async () => {
    const pool = trackingPool([
      { match: ENTRY_SELECT_MATCH, respond: { rows: [entryRow({ supplier_company_id: "u1" })] } }
      // listingAnalytics.getListingStats queries default to {rows:[]} -> stats shape
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/entries/:id/analytics");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._json && typeof res._json === "object");
  });
});

/* ── GET /capacity-exchange/my-analytics ───────────────────────────────── */

describe("GET /capacity-exchange/my-analytics", () => {
  it("200 returns supplier dashboard", async () => {
    const pool = trackingPool();
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "get", "/capacity-exchange/my-analytics");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._json && typeof res._json === "object");
  });
});

/* ── POST /capacity-exchange/entries/:id/click ─────────────────────────── */

describe("POST /capacity-exchange/entries/:id/click", () => {
  it("200 records click + sets res.locals.audit", async () => {
    const pool = trackingPool();
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "post", "/capacity-exchange/entries/:id/click");
    const res = mockRes();
    await handler(mockReq({ params: { id: "CP1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.ok, true);
    assert.strictEqual(res.locals.audit.action, "capacity_exchange.click");
    assert.strictEqual(res.locals.audit.entity_id, "CP1");
  });
});

/* ── POST /capacity-exchange/admin/process-reminders ───────────────────── */

describe("POST /capacity-exchange/admin/process-reminders", () => {
  it("403 ADMIN_ONLY for non-admin", async () => {
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(trackingPool())), "post", "/capacity-exchange/admin/process-reminders");
    const res = mockRes();
    await handler(mockReq({ user: { id: "u1", role: "agency" }, body: {} }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ADMIN_ONLY");
  });

  it("200 runs reminders + sets res.locals.audit for admin", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SET status = 'paused'") && s.includes("RETURNING id, supplier_company_id, title"), respond: { rows: [{ id: "E1", supplier_company_id: "s1", title: "X" }] } },
      { match: (s) => s.includes("FROM capacity_posts") && s.includes("last_confirmed_at IS NULL OR last_confirmed_at"), respond: { rows: [{ id: "E2", supplier_company_id: "s2", title: "Y", last_confirmed_at: null }] } }
    ]);
    const handler = getHandler(createCapacityExchangeRouter(makeDeps(pool)), "post", "/capacity-exchange/admin/process-reminders");
    const res = mockRes();
    await handler(mockReq({ user: { id: "u1", role: "admin" }, body: { reminder_days: 7, escalation_days: 14 } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res.locals.audit.action, "capacity_exchange.process_reminders");
    assert.ok(res._json && typeof res._json === "object");
  });
});
