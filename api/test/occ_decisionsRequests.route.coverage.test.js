/**
 * Router-handler coverage for routes/occ/decisionsRequests.js
 * (factory createOccDecisionsRouter).
 *
 * Strategy: construct the router with a mocked deps object (pool WITH connect(),
 * logger), then extract the LAST handle in each route stack — bypassing the
 * mfaGuard middleware layer the same way the repo's reporting/requests coverage
 * tests bypass auth/permission middleware. Handlers are driven directly with a
 * SQL-substring-dispatching tracking pool.
 *
 * ALL three handlers return inline res.status().json() (including their try/catch
 * 500 branches), so we assert res._status/_json directly. There are NO
 * catch->next(err) paths in this file.
 *
 * Run: node --test --test-force-exit test/occ_decisionsRequests.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOccDecisionsRouter } from "../routes/occ/decisionsRequests.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool. `routes` is an ordered list of { match(sql)->bool, respond }.
 * First matching entry wins; unmatched queries return { rows: [], rowCount: 0 }
 * so non-critical paths (audit writes, COUNT scalars) degrade to safe defaults.
 * respond may be a value or a function(text, params) (can throw to simulate DB error).
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
    // withTransaction(pool, fn) / writeAudit fallbacks may call connect().
    connect: async () => ({ query, release() {} }),
    find(substr) {
      return calls.filter((c) => c.sql.includes(substr));
    }
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    occAccess: { user_id: "owner-1" },
    params: {},
    query: {},
    body: {},
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
    locals: {},
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; return res; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    set() { return res; },
    type() { return res; },
    send(payload) { res._send = payload; return res; },
    end() { return res; }
  };
  return res;
}

function makeDeps(pool) {
  return { pool, logger: mockLogger() };
}

/** Extract the LAST handler in the matching route stack (skips mfaGuard). */
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

const UPDATE_MATCH = (s) => s.includes("UPDATE occ_decisions");

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("occ decisions router — registration", () => {
  it("registers all expected routes", () => {
    const router = createOccDecisionsRouter(makeDeps(trackingPool()));
    const seen = new Set(
      router.stack
        .filter((l) => l.route)
        .map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "get /decisions-requests",
      "post /decisions-requests/decide",
      "post /decisions-requests/triage"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });

  it("decide/triage have an mfaGuard middleware layer before the handler", () => {
    const router = createOccDecisionsRouter(makeDeps(trackingPool()));
    for (const path of ["/decisions-requests/decide", "/decisions-requests/triage"]) {
      const layer = router.stack.find((l) => l.route && l.route.path === path);
      assert.ok(layer, `route ${path} present`);
      // handler + mfaGuard => at least 2 stack entries
      assert.ok(layer.route.stack.length >= 2, `${path} should have a guard + handler`);
    }
  });
});

/* ── GET /decisions-requests ───────────────────────────────────────────── */

describe("GET /decisions-requests", () => {
  it("200 default open list — maps rows, computes paging + pending count", async () => {
    const row = {
      id: "D1", type: "custom_offer", status: "waiting_for_owner_decision",
      priority: "high", source: "platform", org_id: "org-9", org_name: "ACME",
      title: "Sondertarif", summary: "x", risk_level: "high", sla_state: "ok",
      tags: ["vip"], created_at: "2026-01-01T00:00:00Z"
    };
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT COUNT(*)::int AS n FROM occ_decisions od"), respond: { rows: [{ n: 1 }] } },
      { match: (s) => s.includes("status = 'waiting_for_owner_decision'"), respond: { rows: [{ n: 3 }] } },
      { match: (s) => s.includes("FROM occ_decisions od") && s.includes("ORDER BY od.created_at DESC"), respond: { rows: [row] } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "get", "/decisions-requests");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.total, 1);
    assert.strictEqual(res._json.data.page, 1);
    assert.strictEqual(res._json.data.per_page, 30);
    assert.strictEqual(res._json.data.has_more, false);
    assert.strictEqual(res._json.data.pending_owner_decisions, 3);
    assert.strictEqual(res._json.data.items.length, 1);
    const item = res._json.data.items[0];
    assert.strictEqual(item.id, "D1");
    assert.strictEqual(item.organization_id, "org-9");
    assert.strictEqual(item.risk_level, "high");
    assert.deepStrictEqual(item.tags, ["vip"]);
    assert.strictEqual(item.pending_owner_decisions, 3);
    assert.strictEqual(item.created_at, "2026-01-01T00:00:00.000Z");
  });

  it("applies default OPEN statuses when no status filter is given", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "get", "/decisions-requests");
    await handler(mockReq(), mockRes());
    // the list query must carry the default open statuses as a $N::text[] param
    const listCall = pool.find("ORDER BY od.created_at DESC")[0];
    assert.ok(listCall, "list query issued");
    const statusParam = listCall.params.find((p) => Array.isArray(p) && p.includes("new"));
    assert.ok(statusParam, "default open statuses applied");
    assert.deepStrictEqual(statusParam, ["new", "triaged", "waiting_for_owner_decision"]);
  });

  it("log=true mode drops the default status filter (no status WHERE clause)", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "get", "/decisions-requests");
    await handler(mockReq({ query: { log: "true" } }), mockRes());
    const listCall = pool.find("ORDER BY od.created_at DESC")[0];
    assert.ok(listCall);
    // no status array param should be present, and no od.status ANY clause in SQL
    const hasStatusArray = listCall.params.some((p) => Array.isArray(p) && p.includes("new"));
    assert.strictEqual(hasStatusArray, false);
    assert.ok(!listCall.sql.includes("od.status = ANY"), "no status filter in log mode");
  });

  it("builds type/priority/risk_level/search filters into WHERE + params", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "get", "/decisions-requests");
    await handler(mockReq({
      query: {
        type: "custom_offer,bogus",
        priority: "high",
        risk_level: "critical",
        search: "ACME",
        status: "approved"
      }
    }), mockRes());
    const listCall = pool.find("ORDER BY od.created_at DESC")[0];
    assert.ok(listCall);
    assert.ok(listCall.sql.includes("od.type = ANY"), "type filter present");
    assert.ok(listCall.sql.includes("od.priority = ANY"), "priority filter present");
    assert.ok(listCall.sql.includes("od.risk_level = ANY"), "risk filter present");
    assert.ok(listCall.sql.includes("ILIKE"), "search filter present");
    // invalid 'bogus' type filtered out; only custom_offer remains
    const typeParam = listCall.params.find((p) => Array.isArray(p) && p.includes("custom_offer"));
    assert.deepStrictEqual(typeParam, ["custom_offer"]);
    // explicit valid status overrides defaults
    const statusParam = listCall.params.find((p) => Array.isArray(p) && p.includes("approved"));
    assert.deepStrictEqual(statusParam, ["approved"]);
    // search param wrapped with %...%
    assert.ok(listCall.params.includes("%ACME%"), "search param wrapped");
  });

  it("has_more=true when extra row beyond per_page returned (slices to per_page)", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: `D${i}`, status: "new", created_at: "2026-01-01" }));
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT COUNT(*)::int AS n FROM occ_decisions od"), respond: { rows: [{ n: 10 }] } },
      { match: (s) => s.includes("ORDER BY od.created_at DESC"), respond: { rows } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "get", "/decisions-requests");
    const res = mockRes();
    await handler(mockReq({ query: { per_page: "2" } }), res);
    assert.strictEqual(res._json.data.has_more, true);
    assert.strictEqual(res._json.data.items.length, 2);
    // LIMIT param = per_page + 1 = 3
    const listCall = pool.find("ORDER BY od.created_at DESC")[0];
    assert.ok(listCall.params.includes(3), "LIMIT is per_page+1");
  });

  it("clamps page/per_page and computes offset for page 2", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "get", "/decisions-requests");
    const res = mockRes();
    await handler(mockReq({ query: { page: "2", per_page: "5" } }), res);
    assert.strictEqual(res._json.data.page, 2);
    assert.strictEqual(res._json.data.per_page, 5);
    const listCall = pool.find("ORDER BY od.created_at DESC")[0];
    // offset = (2-1)*5 = 5 ; LIMIT = 5+1 = 6
    assert.ok(listCall.params.includes(5), "offset present");
    assert.ok(listCall.params.includes(6), "limit = per_page+1");
  });
});

/* ── POST /decisions-requests/decide ───────────────────────────────────── */

describe("POST /decisions-requests/decide", () => {
  it("400 REQUEST_ID_REQUIRED when no request_id", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({ body: { action: "approve", confirmed: true, reason: "long enough reason" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "REQUEST_ID_REQUIRED");
  });

  it("400 INVALID_ACTION for unsupported action", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", action: "nuke", confirmed: true, reason: "long enough reason" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ACTION");
  });

  it("400 CONFIRM_REQUIRED when confirmed missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", action: "approve", reason: "long enough reason" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "CONFIRM_REQUIRED");
  });

  it("400 REASON_TOO_SHORT when reason < 10 chars", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", action: "approve", confirmed: true, reason: "short" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "REASON_TOO_SHORT");
  });

  it("400 ASSIGNED_TO_REQUIRED for action=assign without assigned_to", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", action: "assign", confirmed: true, reason: "long enough reason" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "ASSIGNED_TO_REQUIRED");
  });

  it("404 REQUEST_NOT_FOUND when UPDATE affects 0 rows", async () => {
    const pool = trackingPool([
      { match: UPDATE_MATCH, respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D-missing", action: "reject", confirmed: true, reason: "long enough reason" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "REQUEST_NOT_FOUND");
  });

  it("200 approve updates row + maps decision; UPDATE carries action->status mapping", async () => {
    const updated = { id: "D1", type: "feature_request", status: "approved", risk_level: "medium", created_at: "2026-01-01" };
    const pool = trackingPool([
      { match: UPDATE_MATCH, respond: { rows: [updated], rowCount: 1 } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", action: "approve", confirmed: true, reason: "valid approval reason" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.request.id, "D1");
    assert.strictEqual(res._json.data.decision.status, "approved");
    // UPDATE params: [requestId, status, outcome, reason, actorId, resolveNow, isAssign, assignedTo, riskLevel]
    const upd = pool.find("UPDATE occ_decisions")[0];
    assert.strictEqual(upd.params[0], "D1");
    assert.strictEqual(upd.params[1], "approved");
    assert.strictEqual(upd.params[2], "approved");
    assert.strictEqual(upd.params[3], "valid approval reason");
    assert.strictEqual(upd.params[4], "owner-1"); // occAccess.user_id
    assert.strictEqual(upd.params[5], true); // resolveNow
    assert.strictEqual(upd.params[6], false); // not assign
  });

  it("200 assign passes assigned_to + isAssign=true into UPDATE", async () => {
    const updated = { id: "D2", type: "operational", status: "assigned", created_at: "2026-01-01" };
    const pool = trackingPool([
      { match: UPDATE_MATCH, respond: { rows: [updated], rowCount: 1 } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({
      body: { request_id: "D2", action: "assign", assigned_to: "staff-7", confirmed: true, reason: "assigning to staff" }
    }), res);
    assert.strictEqual(res._status, 200);
    const upd = pool.find("UPDATE occ_decisions")[0];
    assert.strictEqual(upd.params[1], "assigned");
    assert.strictEqual(upd.params[6], true); // isAssign
    assert.strictEqual(upd.params[7], "staff-7"); // assignedTo
  });

  it("200 approve of custom_offer triggers commercial_offers upsert", async () => {
    const updated = {
      id: "D3", type: "custom_offer", status: "approved", org_id: "org-5", org_name: "ACME",
      title: "Sondertarif", commercial_context: { requested_users: 50, billing_cycle: "yearly" }, created_at: "2026-01-01"
    };
    const pool = trackingPool([
      { match: UPDATE_MATCH, respond: { rows: [updated], rowCount: 1 } },
      { match: (s) => s.includes("INSERT INTO commercial_offers"), respond: { rows: [], rowCount: 1 } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D3", action: "approve", confirmed: true, reason: "approve custom offer" } }), res);
    assert.strictEqual(res._status, 200);
    const offer = pool.find("INSERT INTO commercial_offers")[0];
    assert.ok(offer, "commercial_offers upsert issued");
    assert.strictEqual(offer.params[0], "D3"); // occ_decision_id
    assert.strictEqual(offer.params[1], "org-5"); // org_id
    assert.strictEqual(offer.params[4], "approved"); // status
  });

  it("applies explicit valid risk_level override into UPDATE param", async () => {
    const updated = { id: "D4", type: "operational", status: "deferred", created_at: "2026-01-01" };
    const pool = trackingPool([
      { match: UPDATE_MATCH, respond: { rows: [updated], rowCount: 1 } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({
      body: { request_id: "D4", action: "defer", confirmed: true, reason: "defer with risk", risk_level: "critical" }
    }), res);
    assert.strictEqual(res._status, 200);
    const upd = pool.find("UPDATE occ_decisions")[0];
    assert.strictEqual(upd.params[8], "critical"); // nextRiskLevel
    assert.strictEqual(upd.params[5], false); // defer => resolveNow false
  });

  it("500 SERVER_ERROR when the UPDATE query throws", async () => {
    const pool = trackingPool([
      { match: UPDATE_MATCH, respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/decide");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", action: "close", confirmed: true, reason: "closing the request" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── POST /decisions-requests/triage ───────────────────────────────────── */

describe("POST /decisions-requests/triage", () => {
  it("400 REQUEST_ID_REQUIRED when no request_id (no action required)", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/triage");
    const res = mockRes();
    await handler(mockReq({ body: { confirmed: true, reason: "long enough reason" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "REQUEST_ID_REQUIRED");
  });

  it("400 CONFIRM_REQUIRED when confirmed missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/triage");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", reason: "long enough reason" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "CONFIRM_REQUIRED");
  });

  it("400 REASON_TOO_SHORT when reason < 10 chars", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/triage");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", confirmed: true, reason: "x" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "REASON_TOO_SHORT");
  });

  it("400 INVALID_STATUS when status is not 'triaged'", async () => {
    const pool = trackingPool();
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/triage");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", confirmed: true, reason: "long enough reason", status: "approved" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_STATUS");
  });

  it("404 REQUEST_NOT_FOUND when UPDATE affects 0 rows", async () => {
    const pool = trackingPool([
      { match: UPDATE_MATCH, respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/triage");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D-missing", confirmed: true, reason: "long enough reason" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "REQUEST_NOT_FOUND");
  });

  it("200 triages — UPDATE sets status=triaged + reason + actor; returns mapped request", async () => {
    const updated = { id: "D1", type: "support_escalation", status: "triaged", risk_level: "medium", created_at: "2026-01-01" };
    const pool = trackingPool([
      { match: UPDATE_MATCH, respond: { rows: [updated], rowCount: 1 } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/triage");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", confirmed: true, reason: "triage this request" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.request.id, "D1");
    assert.strictEqual(res._json.data.request.status, "triaged");
    const upd = pool.find("UPDATE occ_decisions")[0];
    assert.strictEqual(upd.params[0], "D1"); // requestId
    assert.strictEqual(upd.params[1], "triage this request"); // reason
    assert.strictEqual(upd.params[2], "owner-1"); // actor
  });

  it("defaults status to 'triaged' when status omitted (200 success)", async () => {
    const updated = { id: "D9", status: "triaged", created_at: "2026-01-01" };
    const pool = trackingPool([
      { match: UPDATE_MATCH, respond: { rows: [updated], rowCount: 1 } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/triage");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D9", confirmed: true, reason: "default status triage" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.request.id, "D9");
  });

  it("500 SERVER_ERROR when the UPDATE query throws", async () => {
    const pool = trackingPool([
      { match: UPDATE_MATCH, respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(createOccDecisionsRouter(makeDeps(pool)), "post", "/decisions-requests/triage");
    const res = mockRes();
    await handler(mockReq({ body: { request_id: "D1", confirmed: true, reason: "triage this request" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});
