/**
 * Router-handler coverage for routes/requests.js (createRequestsRouter).
 *
 * Strategy: the route handlers delegate to thin service wrappers that all funnel
 * through pool.query(sql, params). So instead of module-mocking the services we
 * drive the real handler + real service code with a SQL-substring-dispatching
 * tracking pool. Middleware (requireAuth / requestLimiter / requirePermission /
 * requireCompanyOrg) is bypassed by invoking only the LAST handler in the route
 * stack — the same idiom the repo's reporting.route.test.js uses.
 *
 * Run: node --test --test-force-exit test/requests.route.coverage.test.js
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequestsRouter } from "../routes/requests.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool. `handlers` is an ordered list of { match(sql) -> bool, rows / fn }.
 * First matching entry wins; unmatched queries return { rows: [] } so non-critical
 * paths (audit writes, sla events, analytics) degrade to no-ops.
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
    // withTransaction(pool, fn) needs connect() → client with query + release.
    connect: async () => ({ query, release() {} }),
    find(substr) {
      return calls.filter((c) => c.sql.includes(substr));
    }
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    user: { id: "u1" },
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

function makeDeps(pool, planOverrides = {}) {
  const me = {
    id: "u1",
    plan: planOverrides.plan ?? "PRO",
    role: planOverrides.role ?? "company",
    org_id: "org-1",
    limits: {
      requests_send: -1,
      notdienst: true,
      max_workers_per_request: -1,
      ...(planOverrides.limits || {})
    },
    usage: { sent_count: 0, ...(planOverrides.usage || {}) }
  };
  return {
    pool,
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next(),
    requestLimiter: (_req, _res, next) => next(),
    sendMail: async () => true,
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

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("requests router — registration", () => {
  it("registers all expected routes", () => {
    const router = createRequestsRouter(makeDeps(trackingPool()));
    const seen = new Set(
      router.stack
        .filter((l) => l.route)
        .map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "post /requests",
      "post /requests/broadcast",
      "get /requests/:id",
      "get /requests/:id/sla-report",
      "post /requests/:id/sla",
      "get /suppliers/:agencyId/scorecard",
      "post /policies/compliance",
      "get /my/requests/sent",
      "get /my/requests/received",
      "patch /requests/:id/status",
      "get /requests/export/csv"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });
});

/* ── POST /requests (listing branch) ───────────────────────────────────── */

describe("POST /requests — listing request", () => {
  it("403 LIMIT_REACHED when send-quota exhausted", async () => {
    const pool = trackingPool();
    const deps = makeDeps(pool, { limits: { requests_send: 5 }, usage: { sent_count: 5 } });
    const handler = getHandler(createRequestsRouter(deps), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { listing_id: "11111111-1111-1111-1111-111111111111" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "LIMIT_REACHED");
    assert.strictEqual(res._json.type, "requests_send");
  });

  it("400 VALIDATION when neither listing_id nor capacity_id present", async () => {
    const pool = trackingPool();
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("403 PLAN_REQUIRED_NOTDIENST when priority NOTDIENST but plan lacks notdienst", async () => {
    const pool = trackingPool();
    const deps = makeDeps(pool, { limits: { notdienst: false } });
    const handler = getHandler(createRequestsRouter(deps), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { listing_id: "11111111-1111-1111-1111-111111111111", priority: "NOTDIENST" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "PLAN_REQUIRED_NOTDIENST");
  });

  it("404 LISTING_NOT_FOUND when listing inactive/missing", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM listings WHERE id=$1 AND is_active=TRUE"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { listing_id: "11111111-1111-1111-1111-111111111111" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "LISTING_NOT_FOUND");
  });

  it("400 CANNOT_REQUEST_OWN_LISTING when caller owns the listing", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM listings WHERE id=$1 AND is_active=TRUE"),
        respond: { rows: [{ id: "L1", owner_id: "u1", type: "supply" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { listing_id: "11111111-1111-1111-1111-111111111111" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "CANNOT_REQUEST_OWN_LISTING");
  });

  it("403 ROLE_MISMATCH when company requests a demand listing", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM listings WHERE id=$1 AND is_active=TRUE"),
        respond: { rows: [{ id: "L1", owner_id: "owner-2", type: "demand" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool, { role: "company" })), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { listing_id: "11111111-1111-1111-1111-111111111111" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ROLE_MISMATCH");
  });

  it("success: creates listing request, returns row, sets audit", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM listings WHERE id=$1 AND is_active=TRUE"),
        respond: { rows: [{ id: "L1", owner_id: "owner-2", type: "supply" }] }
      },
      {
        match: (s) => s.includes("INSERT INTO requests") && s.includes("listing_id, requester_id, receiver_id, message, priority"),
        respond: { rows: [{ id: "REQ-NEW", status: "SENT", listing_id: "L1", receiver_id: "owner-2" }] }
      },
      {
        match: (s) => s.includes("category, region FROM listings"),
        respond: { rows: [{ category: "Pflege", region: "Berlin" }] }
      },
      {
        match: (s) => s.includes("email, company_name, phone FROM users"),
        respond: { rows: [{ email: "x@y.de", company_name: "ACME", phone: null }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool, { role: "company" })), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { listing_id: "11111111-1111-1111-1111-111111111111", message: "Hi" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, "REQ-NEW");
    assert.strictEqual(res.locals.audit.action, "request.create");
    assert.strictEqual(res.locals.audit.entity_id, "REQ-NEW");
    assert.strictEqual(res.locals.audit.details.type, "listing");
    // INSERT was actually issued with the listing id + caller as requester
    const ins = pool.find("INSERT INTO requests")[0];
    assert.ok(ins);
    assert.strictEqual(ins.params[1], "u1"); // requester_id
    assert.strictEqual(ins.params[2], "owner-2"); // receiver_id
  });
});

/* ── POST /requests (capacity branch) ──────────────────────────────────── */

describe("POST /requests — capacity request", () => {
  const CAP_ID = "22222222-2222-2222-2222-222222222222";

  // NOTE: the capacity-branch FEATURE_NOT_ALLOWED gate (requests.js:61-63, hasFeature(plan,"sla_access"))
  // is effectively unreachable: planFeatures.js:71 grants sla_access to ALL plans (DEMO/BASIS/PLUS/PRO/INDIVIDUELL).
  // hasFeature is a real static import (not injectable), so this 403 branch cannot be exercised by a unit test.

  it("400 VALIDATION when capacity body fails schema (missing end_date+duration_days)", async () => {
    const pool = trackingPool();
    const handler = getHandler(createRequestsRouter(makeDeps(pool, { plan: "PRO" })), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { capacity_id: CAP_ID } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("403 WORKER_LIMIT_EXCEEDED when quantity above plan limit", async () => {
    const pool = trackingPool();
    const deps = makeDeps(pool, { plan: "PRO", limits: { max_workers_per_request: 2 } });
    const handler = getHandler(createRequestsRouter(deps), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { capacity_id: CAP_ID, quantity: 5, duration_days: 3 } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "WORKER_LIMIT_EXCEEDED");
    assert.strictEqual(res._json.limit, 2);
    assert.strictEqual(res._json.requested, 5);
  });

  it("404 CAPACITY_NOT_FOUND when capacity inactive/missing", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM capacities WHERE id=$1 AND is_active=TRUE"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool, { plan: "PRO" })), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { capacity_id: CAP_ID, duration_days: 3 } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "CAPACITY_NOT_FOUND");
  });

  it("400 CANNOT_REQUEST_OWN_CAPACITY when caller owns the capacity", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM capacities WHERE id=$1 AND is_active=TRUE"),
        respond: { rows: [{ id: CAP_ID, agency_id: "u1" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool, { plan: "PRO" })), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { capacity_id: CAP_ID, duration_days: 3 } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "CANNOT_REQUEST_OWN_CAPACITY");
  });

  it("403 ROLE_MISMATCH when non-company requests capacity", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM capacities WHERE id=$1 AND is_active=TRUE"),
        respond: { rows: [{ id: CAP_ID, agency_id: "agency-2" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool, { plan: "PRO", role: "agency" })), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { capacity_id: CAP_ID, duration_days: 3 } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ROLE_MISMATCH");
  });

  it("201 success: creates capacity request + reservation, returns row", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM capacities WHERE id=$1 AND is_active=TRUE"),
        respond: { rows: [{ id: CAP_ID, agency_id: "agency-2" }] }
      },
      {
        match: (s) => s.includes("INSERT INTO requests") && s.includes("sla_minutes, sla_respond_by, sla_started_at, sla_status"),
        respond: { rows: [{ id: "CAPREQ-1", status: "SENT", receiver_id: "agency-2", capacity_id: CAP_ID }] }
      },
      {
        match: (s) => s.includes("email, company_name, phone FROM users"),
        respond: { rows: [{ email: "a@b.de", company_name: "Agency", phone: null }] }
      },
      {
        match: (s) => s.includes("role, region FROM capacities"),
        respond: { rows: [{ role: "Pflege", region: "Berlin" }] }
      }
      // capacityService.reserve queries are unmatched -> { rows: [] } -> no reservation
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool, { plan: "PRO", role: "company" })), "post", "/requests");
    const res = mockRes();
    await handler(mockReq({ body: { capacity_id: CAP_ID, duration_days: 3, quantity: 1 } }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._json.id, "CAPREQ-1");
    assert.strictEqual(res._json.reservation, null);
    // capacity request INSERT actually issued
    assert.ok(pool.find("sla_started_at, sla_status").length >= 1);
  });
});

/* ── POST /requests/broadcast ──────────────────────────────────────────── */

describe("POST /requests/broadcast", () => {
  it("403 LIMIT_REACHED when quota exhausted", async () => {
    const pool = trackingPool();
    const deps = makeDeps(pool, { limits: { requests_send: 3 }, usage: { sent_count: 3 } });
    const handler = getHandler(createRequestsRouter(deps), "post", "/requests/broadcast");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "LIMIT_REACHED");
  });

  it("403 PLAN_REQUIRED_NOTDIENST for NOTDIENST without entitlement", async () => {
    const pool = trackingPool();
    const deps = makeDeps(pool, { limits: { notdienst: false } });
    const handler = getHandler(createRequestsRouter(deps), "post", "/requests/broadcast");
    const res = mockRes();
    await handler(mockReq({ body: { priority: "NOTDIENST" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "PLAN_REQUIRED_NOTDIENST");
  });

  it("creates one request per target, capped by remaining slots", async () => {
    const targets = [
      { listing_id: "L1", receiver_id: "r1" },
      { listing_id: "L2", receiver_id: "r2" },
      { listing_id: "L3", receiver_id: "r3" }
    ];
    const pool = trackingPool([
      { match: (s) => s.includes("FROM listings l") && s.includes("AS listing_id"), respond: { rows: targets } }
    ]);
    // limit 5, already used 3 -> 2 remaining slots; 3 targets -> 2 created, limited=true
    const deps = makeDeps(pool, { limits: { requests_send: 5 }, usage: { sent_count: 3 } });
    const handler = getHandler(createRequestsRouter(deps), "post", "/requests/broadcast");
    const res = mockRes();
    await handler(mockReq({ body: { message: "hey" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.created, 2);
    assert.strictEqual(res._json.limited, true);
    assert.strictEqual(pool.find("INSERT INTO requests").length, 2);
    assert.strictEqual(res.locals.audit.action, "request.broadcast");
    assert.strictEqual(res.locals.audit.details.created, 2);
  });

  it("creates all targets when slots are unlimited", async () => {
    const targets = [
      { listing_id: "L1", receiver_id: "r1" },
      { listing_id: "L2", receiver_id: "r2" }
    ];
    const pool = trackingPool([
      { match: (s) => s.includes("FROM listings l") && s.includes("AS listing_id"), respond: { rows: targets } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "post", "/requests/broadcast");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    assert.strictEqual(res._json.created, 2);
    assert.strictEqual(res._json.limited, false);
  });
});

/* ── GET /requests/:id ─────────────────────────────────────────────────── */

describe("GET /requests/:id", () => {
  it("404 NOT_FOUND for missing request", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM requests r") && s.includes("LEFT JOIN listings l"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "REQ-X" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 FORBIDDEN when caller is neither requester nor receiver", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM requests r") && s.includes("LEFT JOIN listings l"),
        respond: { rows: [{ id: "REQ-1", requester_id: "other-a", receiver_id: "other-b", status: "SENT" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "REQ-1" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("200 returns detail + compliance + sla_events + scorecard for participant", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM requests r") && s.includes("LEFT JOIN listings l") && s.includes("u_recv"),
        respond: { rows: [{ id: "REQ-1", requester_id: "u1", receiver_id: "agency-2", status: "SENT" }] }
      },
      {
        match: (s) => s.includes("FROM request_compliance WHERE request_id=$1"),
        respond: { rows: [{ compliance_status: "OK", compliance_reasons: ["ok"] }] }
      },
      {
        match: (s) => s.includes("FROM sla_events WHERE request_id=$1"),
        respond: { rows: [{ id: "e1", event_type: "deadline_set", details: {}, created_at: "2026-01-01" }] }
      },
      {
        match: (s) => s.includes("FROM supplier_metrics WHERE agency_id=$1"),
        respond: { rows: [{ requests_received: 10, requests_accepted: 8, requests_finalized: 6, sla_breaches: 1, avg_rating: 4.5 }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "REQ-1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, "REQ-1");
    assert.strictEqual(res._json.compliance_status, "OK");
    assert.strictEqual(res._json.sla_events.length, 1);
    assert.ok(res._json.scorecard, "scorecard should be present");
    assert.strictEqual(res._json.scorecard.avg_rating, 4.5);
    assert.strictEqual(res._json.scorecard.fill_rate, 0.8);
  });
});

/* ── GET /requests/:id/sla-report ──────────────────────────────────────── */

describe("GET /requests/:id/sla-report", () => {
  it("404 NOT_FOUND for missing request", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT * FROM requests WHERE id=$1"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/requests/:id/sla-report");
    const res = mockRes();
    await handler(mockReq({ params: { id: "REQ-X" } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("403 FORBIDDEN for non-participant", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("SELECT * FROM requests WHERE id=$1"),
        respond: { rows: [{ id: "REQ-1", requester_id: "a", receiver_id: "b" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/requests/:id/sla-report");
    const res = mockRes();
    await handler(mockReq({ params: { id: "REQ-1" } }), res);
    assert.strictEqual(res._status, 403);
  });

  it("200 returns SLA report shape for participant", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("SELECT * FROM requests WHERE id=$1"),
        respond: {
          rows: [{
            id: "REQ-1", requester_id: "u1", receiver_id: "b",
            created_at: "2026-01-01", sla_started_at: "2026-01-01",
            sla_respond_by: "2026-01-02", sla_status: "RUNNING",
            sla_met_at: null, sla_breached_at: null,
            first_matching_attempt_at: null, first_notification_sent_at: null, sla_minutes: 60
          }]
        }
      },
      {
        match: (s) => s.includes("FROM sla_events WHERE request_id=$1"),
        respond: { rows: [{ id: "e1", event_type: "deadline_set", details: {}, created_at: "2026-01-01" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/requests/:id/sla-report");
    const res = mockRes();
    await handler(mockReq({ params: { id: "REQ-1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.request_id, "REQ-1");
    assert.strictEqual(res._json.sla_status, "RUNNING");
    assert.strictEqual(res._json.sla_minutes, 60);
    assert.strictEqual(res._json.sla_events.length, 1);
  });
});

/* ── POST /requests/:id/sla ────────────────────────────────────────────── */

describe("POST /requests/:id/sla", () => {
  it("404 when setSla reports NOT_FOUND", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("SELECT id, created_at, requester_id FROM requests WHERE id=$1"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "post", "/requests/:id/sla");
    const res = mockRes();
    await handler(mockReq({ params: { id: "REQ-X" }, body: { sla_minutes: 120 } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 when caller is not the requester", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("SELECT id, created_at, requester_id FROM requests WHERE id=$1"),
        respond: { rows: [{ id: "REQ-1", created_at: "2026-01-01", requester_id: "someone-else" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "post", "/requests/:id/sla");
    const res = mockRes();
    await handler(mockReq({ params: { id: "REQ-1" }, body: { sla_minutes: 120 } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("200 sets SLA + audit when caller is requester", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("SELECT id, created_at, requester_id FROM requests WHERE id=$1"),
        respond: { rows: [{ id: "REQ-1", created_at: "2026-01-01T00:00:00Z", requester_id: "u1" }] }
      },
      {
        match: (s) => s.includes("SELECT id, sla_minutes, sla_respond_by, sla_status FROM requests WHERE id=$1"),
        respond: { rows: [{ id: "REQ-1", sla_minutes: 120, sla_respond_by: "2026-01-01T02:00:00Z", sla_status: "RUNNING" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "post", "/requests/:id/sla");
    const res = mockRes();
    await handler(mockReq({ params: { id: "REQ-1" }, body: { sla_minutes: 120 } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.sla_minutes, 120);
    assert.strictEqual(res.locals.audit.action, "request.sla.set");
    assert.strictEqual(res.locals.audit.details.sla_minutes, 120);
  });

  it("clamps sla_minutes to [15,10080] before persisting", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("SELECT id, created_at, requester_id FROM requests WHERE id=$1"),
        respond: { rows: [{ id: "REQ-1", created_at: "2026-01-01T00:00:00Z", requester_id: "u1" }] }
      },
      {
        match: (s) => s.includes("SELECT id, sla_minutes, sla_respond_by, sla_status FROM requests WHERE id=$1"),
        respond: { rows: [{ id: "REQ-1", sla_minutes: 15, sla_respond_by: "x", sla_status: "RUNNING" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "post", "/requests/:id/sla");
    const res = mockRes();
    await handler(mockReq({ params: { id: "REQ-1" }, body: { sla_minutes: 1 } }), res);
    assert.strictEqual(res._status, 200);
    // audit reflects clamped value
    assert.strictEqual(res.locals.audit.details.sla_minutes, 15);
    // setSla UPDATE was issued with clamped minutes
    const upd = pool.find("UPDATE requests SET sla_minutes=$1")[0];
    assert.ok(upd);
    assert.strictEqual(upd.params[0], 15);
  });
});

/* ── GET /suppliers/:agencyId/scorecard ────────────────────────────────── */

describe("GET /suppliers/:agencyId/scorecard", () => {
  it("200 returns cached scorecard and clamps window", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM supplier_metrics WHERE agency_id=$1"),
        respond: { rows: [{ requests_received: 4, requests_accepted: 2, requests_finalized: 1, sla_breaches: 0, avg_rating: 4 }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/suppliers/:agencyId/scorecard");
    const res = mockRes();
    await handler(mockReq({ params: { agencyId: "agency-9" }, query: { window: "500" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.agency_id, "agency-9");
    assert.strictEqual(res._json.window_days, 90); // clamped from 500
    assert.strictEqual(res._json.fill_rate, 0.5);
  });

  it("500 SERVER_ERROR when metrics service throws", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("FROM supplier_metrics WHERE agency_id=$1"),
        respond: () => { throw new Error("db down"); }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/suppliers/:agencyId/scorecard");
    const res = mockRes();
    await handler(mockReq({ params: { agencyId: "agency-9" }, query: {} }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── POST /policies/compliance ─────────────────────────────────────────── */

describe("POST /policies/compliance", () => {
  it("403 COMPANY_ONLY for non-company role", async () => {
    const pool = trackingPool();
    const handler = getHandler(createRequestsRouter(makeDeps(pool, { role: "agency" })), "post", "/policies/compliance");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "COMPANY_ONLY");
  });

  it("201 creates compliance policy + audit for company", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("SELECT * FROM compliance_policies WHERE company_id=$1"),
        respond: { rows: [{ id: "POL-1", company_id: "u1", strict_mode: true }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool, { role: "company" })), "post", "/policies/compliance");
    const res = mockRes();
    await handler(mockReq({ body: { role_pattern: "Pflege%", required_fields: ["cert"], strict_mode: true } }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._json.id, "POL-1");
    assert.strictEqual(res.locals.audit.action, "compliance.policy.create");
    assert.strictEqual(res.locals.audit.details.strict_mode, true);
    // INSERT issued with caller as company_id
    const ins = pool.find("INSERT INTO compliance_policies")[0];
    assert.ok(ins);
    assert.strictEqual(ins.params[0], "u1");
  });
});

/* ── GET /my/requests/sent + /received ─────────────────────────────────── */

describe("GET /my/requests/sent + /received", () => {
  it("sent: returns rows scoped to caller", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("WHERE r.requester_id=$1"), respond: { rows: [{ id: "S1" }, { id: "S2" }] } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/my/requests/sent");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 2);
    const q = pool.find("WHERE r.requester_id=$1")[0];
    assert.strictEqual(q.params[0], "u1");
  });

  it("received: returns rows scoped to caller", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("WHERE r.receiver_id=$1"), respond: { rows: [{ id: "R1" }] } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/my/requests/received");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 1);
    const q = pool.find("WHERE r.receiver_id=$1")[0];
    assert.strictEqual(q.params[0], "u1");
  });
});

/* ── PATCH /requests/:id/status ────────────────────────────────────────── */

describe("PATCH /requests/:id/status", () => {
  it("400 INVALID_STATUS for unknown status", async () => {
    const pool = trackingPool();
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "patch", "/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "R1" }, body: { status: "NONSENSE" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_STATUS");
  });

  it("404 NOT_FOUND when request missing", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("id, requester_id, receiver_id, listing_id, capacity_id, status FROM requests"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "patch", "/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "R1" }, body: { status: "ACCEPTED" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("409 invalid_transition when status step is not allowed", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("id, requester_id, receiver_id, listing_id, capacity_id, status FROM requests"),
        respond: { rows: [{ id: "R1", requester_id: "u1", receiver_id: "u2", listing_id: "L1", capacity_id: null, status: "DECLINED" }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "patch", "/requests/:id/status");
    const res = mockRes();
    // DECLINED is terminal -> ACCEPTED not allowed
    await handler(mockReq({ params: { id: "R1" }, body: { status: "ACCEPTED" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "invalid_transition");
    assert.strictEqual(res._json.from, "DECLINED");
    assert.strictEqual(res._json.to, "ACCEPTED");
  });

  it("403 FORBIDDEN: listing ACCEPTED requires receiver", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("id, requester_id, receiver_id, listing_id, capacity_id, status FROM requests"),
        respond: { rows: [{ id: "R1", requester_id: "u1", receiver_id: "u2", listing_id: "L1", capacity_id: null, status: "SENT" }] }
      }
    ]);
    // caller u1 is requester, not receiver -> ACCEPTED forbidden
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "patch", "/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "R1" }, body: { status: "ACCEPTED" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("400 MUST_BE_ACCEPTED_FIRST: listing FINALIZED requires prior ACCEPTED", async () => {
    // requester finalizing a SENT (not ACCEPTED) listing request.
    // SENT->FINALIZED is also an invalid state-machine transition, so the
    // handler returns 409 first. We instead drive the documented branch by
    // using a capacity_id=null request already in ACCEPTED requested by u1.
    const pool = trackingPool([
      {
        match: (s) => s.includes("id, requester_id, receiver_id, listing_id, capacity_id, status FROM requests"),
        respond: { rows: [{ id: "R1", requester_id: "u1", receiver_id: "u2", listing_id: "L1", capacity_id: null, status: "ACCEPTED" }] }
      },
      {
        match: (s) => s.includes("UPDATE requests SET status=$1"),
        respond: { rows: [{ id: "R1", status: "FINALIZED", contact_email: null, contact_phone: null }] }
      },
      {
        match: (s) => s.includes("email, company_name, phone FROM users"),
        respond: { rows: [{ email: "x@y.de", company_name: "ACME", phone: null }] }
      }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "patch", "/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "R1" }, body: { status: "FINALIZED" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.status, "FINALIZED");
    // status_change audit recorded
    assert.ok(pool.find("UPDATE requests SET status=$1").length >= 1);
  });

  it("200 listing ACCEPTED by receiver updates status + audit", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("id, requester_id, receiver_id, listing_id, capacity_id, status FROM requests"),
        respond: { rows: [{ id: "R1", requester_id: "u-req", receiver_id: "u1", listing_id: "L1", capacity_id: null, status: "SENT" }] }
      },
      {
        match: (s) => s.includes("UPDATE requests SET status=$1"),
        respond: { rows: [{ id: "R1", status: "ACCEPTED", contact_email: null, contact_phone: null }] }
      },
      {
        match: (s) => s.includes("email, company_name, phone FROM users"),
        respond: { rows: [{ email: "x@y.de", company_name: "ACME", phone: null }] }
      }
    ]);
    // caller u1 is receiver
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "patch", "/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "R1" }, body: { status: "ACCEPTED" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.status, "ACCEPTED");
  });

  it("capacity ACCEPTED requires receiver (403 for requester)", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("id, requester_id, receiver_id, listing_id, capacity_id, status FROM requests"),
        respond: { rows: [{ id: "R1", requester_id: "u1", receiver_id: "u2", listing_id: null, capacity_id: "C1", status: "SENT" }] }
      }
    ]);
    // u1 is requester, capacity ACCEPTED needs receiver
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "patch", "/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "R1" }, body: { status: "ACCEPTED" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("capacity FINALIZED requires requester (403 for receiver)", async () => {
    const pool = trackingPool([
      {
        match: (s) => s.includes("id, requester_id, receiver_id, listing_id, capacity_id, status FROM requests"),
        respond: { rows: [{ id: "R1", requester_id: "u2", receiver_id: "u1", listing_id: null, capacity_id: "C1", status: "ACCEPTED" }] }
      }
    ]);
    // u1 is receiver, capacity FINALIZED needs requester
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "patch", "/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "R1" }, body: { status: "FINALIZED" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });
});

/* ── GET /requests/export/csv ──────────────────────────────────────────── */

describe("GET /requests/export/csv", () => {
  it("200 returns CSV attachment of sent+received deals", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("WHERE r.requester_id=$1"), respond: { rows: [{ id: "S1", status: "SENT", created_at: "2026-01-01" }] } },
      { match: (s) => s.includes("WHERE r.receiver_id=$1"), respond: { rows: [{ id: "R1", status: "ACCEPTED", created_at: "2026-01-02" }] } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/requests/export/csv");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(typeof res._send, "string");
    assert.match(String(res._headers["content-type"] || ""), /text\/csv/i);
    assert.match(String(res._headers["content-disposition"] || ""), /attachment;\s*filename="deals-/i);
  });

  it("500 SERVER_ERROR when a query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("WHERE r.requester_id=$1"), respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(createRequestsRouter(makeDeps(pool)), "get", "/requests/export/csv");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});
