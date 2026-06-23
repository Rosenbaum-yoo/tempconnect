/**
 * Router-handler coverage for routes/marketplace.js (createMarketplaceRouter).
 *
 * Strategy mirrors test/requests.route.coverage.test.js: the route handlers
 * delegate to thin service wrappers that all funnel through pool.query(sql, params)
 * (and withTransaction(pool, fn) -> pool.connect()). So instead of module-mocking
 * the services we drive the real handler + real service code with a SQL-substring-
 * dispatching tracking pool. Middleware (requireAuth / slaAccess) is bypassed by
 * invoking only the LAST handler in each route stack.
 *
 * Run (cwd = api/):
 *   node --test --test-force-exit test/marketplace.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMarketplaceRouter } from "../routes/marketplace.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool. `routes` is an ordered list of { match(sql) -> bool, respond }.
 * First matching entry wins; unmatched queries return { rows: [] } so non-critical
 * paths (audit writes, notifications, analytics) degrade to no-ops.
 * Exposes query + connect() so withTransaction works.
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
    company_name: planOverrides.company_name ?? "ACME",
    org_id: "org-1",
    limits: {
      notdienst: true,
      max_workers_per_request: -1,
      ...(planOverrides.limits || {})
    }
  };
  return {
    pool,
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next(),
    requireFeature: () => (_req, _res, next) => next(),
    sendMail: async () => true,
    getUserAndPlan: async () => (planOverrides.noUser ? null : me),
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

const UUID = "11111111-1111-1111-1111-111111111111";

/* SQL matchers for the thin service wrappers we lean on. */
const isGetDemandById = (s) => s.includes("FROM demand_requests dr") && s.includes("WHERE dr.id = $1");
const isListCapacityPosts = (s) => s.includes("FROM capacity_posts cp") && s.includes("cp.status = 'active'");
const isListDemandRequests = (s) => s.includes("FROM demand_requests dr") && s.includes("WHERE 1=1");

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("marketplace router — registration", () => {
  it("registers the expected routes", () => {
    const router = createMarketplaceRouter(makeDeps(trackingPool()));
    const seen = new Set(
      router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "get /marketplace/capacity-posts",
      "post /marketplace/capacity-posts",
      "post /marketplace/offers/:id/prepare-signature",
      "get /marketplace/premium/price",
      "post /marketplace/premium/feature",
      "post /marketplace/capacity-posts/:id/accept-deal",
      "post /marketplace/capacity-posts/:id/negotiate-deal",
      "get /marketplace/demand-requests",
      "post /marketplace/demand-requests",
      "get /marketplace/demand-requests/:id",
      "get /marketplace/demand-requests/:id/sla-report",
      "get /marketplace/demand-requests/:id/matches",
      "post /marketplace/demand-requests/:id/accept-deal",
      "post /marketplace/demand-requests/:id/negotiate-deal",
      "post /marketplace/demand-requests/:id/offers",
      "get /marketplace/demand-requests/:id/offers",
      "patch /marketplace/offers/:id/status",
      "post /marketplace/offers/:id/accept",
      "post /marketplace/offers/:id/counter",
      "post /marketplace/offers/:id/withdraw",
      "get /marketplace/my-offers",
      "get /marketplace/received-offers",
      "get /marketplace/offers/:id/detail",
      "post /marketplace/offers/:id/create-agreement",
      "post /marketplace/offers/:id/confirm-agreement",
      "post /marketplace/offers/:id/activate",
      "post /marketplace/offers/:id/cancel-agreement",
      "get /marketplace/offers/:id/staffing-context",
      "post /marketplace/offers/:id/quick-assign-to-deal",
      "get /marketplace/offers/:id/document",
      "get /marketplace/offers/:id/dossier",
      "get /marketplace/deals/:id/progress",
      "get /marketplace/my-deals",
      "get /marketplace/public/capacity-posts",
      "get /marketplace/demand-requests/:id/interactions",
      "post /marketplace/demand-requests/:id/interactions",
      "get /marketplace/public/demand-requests/:id",
      "get /marketplace/public/demand-requests"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });
});

/* ── GET /marketplace/capacity-posts ───────────────────────────────────── */

describe("GET /marketplace/capacity-posts", () => {
  it("200 returns rows from listCapacityPosts", async () => {
    const pool = trackingPool([
      { match: isListCapacityPosts, respond: { rows: [{ id: "cp1" }, { id: "cp2" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/capacity-posts");
    const res = mockRes();
    await handler(mockReq({ query: { mine: "1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 2);
    // mine=1 -> supplier filter is the session user
    const q = pool.find("cp.supplier_company_id = $")[0];
    assert.ok(q);
    assert.strictEqual(q.params[0], "u1");
  });

  it("500 SERVER_ERROR when the query throws", async () => {
    const pool = trackingPool([
      { match: isListCapacityPosts, respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/capacity-posts");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── POST /marketplace/capacity-posts ──────────────────────────────────── */

describe("POST /marketplace/capacity-posts", () => {
  it("403 AGENCY_ONLY for non-agency role", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "company" })), "post", "/marketplace/capacity-posts");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "AGENCY_ONLY");
  });

  it("400 VALIDATION when body fails schema", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/capacity-posts");
    const res = mockRes();
    await handler(mockReq({ body: { title: "x" } }), res); // missing role/city/availability
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("403 WORKER_LIMIT_EXCEEDED when headcount above plan limit", async () => {
    const pool = trackingPool();
    const deps = makeDeps(pool, { role: "agency", limits: { max_workers_per_request: 2 } });
    const handler = getHandler(createMarketplaceRouter(deps), "post", "/marketplace/capacity-posts");
    const res = mockRes();
    await handler(mockReq({ body: {
      title: "Pflege", role: "Pflegekraft", availability_from: "2026-07-01",
      location_city: "Berlin", headcount: 9
    } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "WORKER_LIMIT_EXCEEDED");
    assert.strictEqual(res._json.limit, 2);
    assert.strictEqual(res._json.requested, 9);
  });

  it("201 creates capacity post + audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("INSERT INTO capacity_posts"), respond: { rows: [{ id: "CP-NEW", role: "Pflegekraft" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/capacity-posts");
    const res = mockRes();
    await handler(mockReq({ body: {
      title: "Pflege", role: "Pflegekraft", availability_from: "2026-07-01", location_city: "Berlin", headcount: 1
    } }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._json.id, "CP-NEW");
    assert.strictEqual(res.locals.audit.action, "marketplace.capacity_post.create");
    assert.strictEqual(res.locals.audit.entity_id, "CP-NEW");
  });
});

/* ── GET /marketplace/premium/price ────────────────────────────────────── */

describe("GET /marketplace/premium/price", () => {
  it("200 returns price config", async () => {
    const handler = getHandler(createMarketplaceRouter(makeDeps(trackingPool())), "get", "/marketplace/premium/price");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.currency, "EUR");
    assert.strictEqual(typeof res._json.price_cents, "number");
    assert.strictEqual(typeof res._json.duration_days, "number");
  });
});

/* ── POST /marketplace/premium/feature ─────────────────────────────────── */

describe("POST /marketplace/premium/feature", () => {
  it("400 VALIDATION on bad body", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/premium/feature");
    const res = mockRes();
    await handler(mockReq({ body: { listing_type: "capacity" } }), res); // missing listing_id + confirmed
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });
});

/* ── POST /marketplace/capacity-posts/:id/accept-deal ──────────────────── */

describe("POST /marketplace/capacity-posts/:id/accept-deal", () => {
  it("403 COMPANY_ONLY for non-company role", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/capacity-posts/:id/accept-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "COMPANY_ONLY");
  });

  it("404 NOT_FOUND when capacity post is missing (locked SELECT empty)", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FOR UPDATE OF cp"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "company" })), "post", "/marketplace/capacity-posts/:id/accept-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 SELF_DEAL_FORBIDDEN when caller owns the capacity post", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FOR UPDATE OF cp"), respond: { rows: [{ id: UUID, supplier_company_id: "u1", status: "active", headcount: 1 }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "company" })), "post", "/marketplace/capacity-posts/:id/accept-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "SELF_DEAL_FORBIDDEN");
  });
});

/* ── POST /marketplace/capacity-posts/:id/negotiate-deal ───────────────── */

describe("POST /marketplace/capacity-posts/:id/negotiate-deal", () => {
  it("403 COMPANY_ONLY for non-company role", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/capacity-posts/:id/negotiate-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "COMPANY_ONLY");
  });

  it("404 NOT_FOUND when capacity post is missing", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FOR UPDATE OF cp"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "company" })), "post", "/marketplace/capacity-posts/:id/negotiate-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── GET /marketplace/demand-requests ──────────────────────────────────── */

describe("GET /marketplace/demand-requests", () => {
  it("200 returns rows scoped to caller", async () => {
    const pool = trackingPool([
      { match: isListDemandRequests, respond: { rows: [{ id: "d1" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 1);
    const q = pool.find("dr.requester_company_id = $")[0];
    assert.strictEqual(q.params[0], "u1");
  });

  it("500 SERVER_ERROR when the query throws", async () => {
    const pool = trackingPool([
      { match: isListDemandRequests, respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ── POST /marketplace/demand-requests ─────────────────────────────────── */

describe("POST /marketplace/demand-requests", () => {
  it("403 COMPANY_ONLY for non-company role", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/demand-requests");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "COMPANY_ONLY");
  });

  it("403 PLAN_REQUIRED_NOTDIENST when notdienst without entitlement", async () => {
    const pool = trackingPool();
    const deps = makeDeps(pool, { role: "company", limits: { notdienst: false } });
    const handler = getHandler(createMarketplaceRouter(deps), "post", "/marketplace/demand-requests");
    const res = mockRes();
    await handler(mockReq({ body: { urgency: "notdienst" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "PLAN_REQUIRED_NOTDIENST");
  });

  it("400 VALIDATION on bad body", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "company" })), "post", "/marketplace/demand-requests");
    const res = mockRes();
    await handler(mockReq({ body: { title: "x" } }), res); // missing role/start_date/city
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "VALIDATION");
  });

  it("403 WORKER_LIMIT_EXCEEDED when headcount above plan limit", async () => {
    const pool = trackingPool();
    const deps = makeDeps(pool, { role: "company", limits: { max_workers_per_request: 1 } });
    const handler = getHandler(createMarketplaceRouter(deps), "post", "/marketplace/demand-requests");
    const res = mockRes();
    await handler(mockReq({ body: {
      title: "Bedarf", role: "Pflege", start_date: "2026-07-01", location_city: "Berlin", headcount: 5
    } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "WORKER_LIMIT_EXCEEDED");
    assert.strictEqual(res._json.limit, 1);
  });
});

/* ── GET /marketplace/demand-requests/:id ──────────────────────────────── */

describe("GET /marketplace/demand-requests/:id", () => {
  it("404 NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([{ match: isGetDemandById, respond: { rows: [] } }]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 FORBIDDEN when caller is not the owner", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "other" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "FORBIDDEN");
  });

  it("200 returns demand + events + matches + suggested_matches for owner", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "u1", title: "Bedarf" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, UUID);
    assert.ok(Array.isArray(res._json.sla_events));
    assert.ok(Array.isArray(res._json.matches));
    assert.ok(Array.isArray(res._json.suggested_matches));
  });
});

/* ── GET /marketplace/demand-requests/:id/sla-report ───────────────────── */

describe("GET /marketplace/demand-requests/:id/sla-report", () => {
  it("404 NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([{ match: isGetDemandById, respond: { rows: [] } }]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id/sla-report");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("200 returns SLA report shape for owner", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "u1", created_at: "2026-01-01", sla_status: "RUNNING" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id/sla-report");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.demand_request_id, UUID);
    assert.strictEqual(res._json.sla_status, "RUNNING");
    assert.ok(Array.isArray(res._json.sla_events));
  });
});

/* ── GET /marketplace/demand-requests/:id/matches ──────────────────────── */

describe("GET /marketplace/demand-requests/:id/matches", () => {
  it("403 FORBIDDEN for non-owner", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "other" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id/matches");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 403);
  });

  it("200 returns matches array for owner", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "u1" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id/matches");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json));
  });
});

/* ── POST /marketplace/demand-requests/:id/accept-deal ─────────────────── */

describe("POST /marketplace/demand-requests/:id/accept-deal", () => {
  it("403 AGENCY_ONLY for non-agency role", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "company" })), "post", "/marketplace/demand-requests/:id/accept-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "AGENCY_ONLY");
  });

  it("404 NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([{ match: isGetDemandById, respond: { rows: [] } }]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/demand-requests/:id/accept-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("403 SELF_DEAL_FORBIDDEN when caller owns the demand", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "u1", status: "open" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/demand-requests/:id/accept-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "SELF_DEAL_FORBIDDEN");
  });

  it("409 DEMAND_NOT_OPEN when demand is not commercially open", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "other", status: "fulfilled", headcount: 1, remaining_open_count: 0 }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/demand-requests/:id/accept-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "DEMAND_NOT_OPEN");
  });
});

/* ── POST /marketplace/demand-requests/:id/negotiate-deal ──────────────── */

describe("POST /marketplace/demand-requests/:id/negotiate-deal", () => {
  it("403 AGENCY_ONLY for non-agency role", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "company" })), "post", "/marketplace/demand-requests/:id/negotiate-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "AGENCY_ONLY");
  });

  it("404 NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([{ match: isGetDemandById, respond: { rows: [] } }]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/demand-requests/:id/negotiate-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("409 DEMAND_NOT_OPEN for closed demand", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "other", status: "fulfilled", headcount: 1, remaining_open_count: 0 }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/demand-requests/:id/negotiate-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "DEMAND_NOT_OPEN");
  });

  it("201 creates negotiation offer for open demand", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "other", status: "open", headcount: 2, remaining_open_count: 2, title: "Bedarf" }] } },
      { match: (s) => s.includes("INSERT INTO offers"), respond: { rows: [{ id: "OFF-1", status: "sent" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/demand-requests/:id/negotiate-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID }, body: {} }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._json.offer.id, "OFF-1");
    assert.strictEqual(res._json.status, "negotiating");
    assert.strictEqual(res.locals.audit.action, "demand.deal_negotiation_started");
  });
});

/* ── POST /marketplace/demand-requests/:id/offers ──────────────────────── */

describe("POST /marketplace/demand-requests/:id/offers", () => {
  it("404 NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([{ match: isGetDemandById, respond: { rows: [] } }]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/demand-requests/:id/offers");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID }, body: {} }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });

  it("400 DEMAND_ALREADY_FULFILLED for fulfilled demand", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, status: "fulfilled" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/demand-requests/:id/offers");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID }, body: {} }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "DEMAND_ALREADY_FULFILLED");
  });
});

/* ── GET /marketplace/demand-requests/:id/offers ───────────────────────── */

describe("GET /marketplace/demand-requests/:id/offers", () => {
  it("404 NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([{ match: isGetDemandById, respond: { rows: [] } }]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id/offers");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("403 FORBIDDEN for non-owner", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "other" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id/offers");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 403);
  });

  it("200 returns sorted offers with next_action for owner", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "u1" }] } },
      { match: (s) => s.includes("FROM offers o") && s.includes("o.demand_request_id"), respond: { rows: [
        { id: "o1", status: "sent", created_at: "2026-01-01" }
      ] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id/offers");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json));
    assert.strictEqual(res._json[0].id, "o1");
    assert.ok(res._json[0].next_action);
  });
});

/* ── PATCH /marketplace/offers/:id/status ──────────────────────────────── */

describe("PATCH /marketplace/offers/:id/status", () => {
  it("400 INVALID_STATUS for unknown status", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "patch", "/marketplace/offers/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID }, body: { status: "NONSENSE" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_STATUS");
  });
});

/* ── POST /marketplace/offers/:id/accept ───────────────────────────────── */

describe("POST /marketplace/offers/:id/accept", () => {
  it("404 NOT_FOUND when acceptOffer reports NOT_FOUND", async () => {
    // acceptOffer's first lookup returns no row -> result.error NOT_FOUND.
    const pool = trackingPool(); // all queries return rows: [] -> service yields NOT_FOUND
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/offers/:id/accept");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── POST /marketplace/offers/:id/counter ──────────────────────────────── */

describe("POST /marketplace/offers/:id/counter", () => {
  it("404 NOT_FOUND when counterOffer reports NOT_FOUND", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/offers/:id/counter");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID }, body: {} }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── POST /marketplace/offers/:id/withdraw ─────────────────────────────── */

describe("POST /marketplace/offers/:id/withdraw", () => {
  it("404 NOT_FOUND when withdrawOffer reports NOT_FOUND", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/offers/:id/withdraw");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── GET /marketplace/my-offers ────────────────────────────────────────── */

describe("GET /marketplace/my-offers", () => {
  it("200 returns wrapped items scoped to supplier", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("WHERE o.supplier_company_id = $1"), respond: { rows: [
        { id: "o1", status: "sent", created_at: "2026-01-02" },
        { id: "o2", status: "accepted", created_at: "2026-01-01" }
      ] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/my-offers");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.count, 2);
    const q = pool.find("WHERE o.supplier_company_id = $1")[0];
    assert.strictEqual(q.params[0], "u1");
  });

  it("500 SERVER_ERROR when query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("WHERE o.supplier_company_id = $1"), respond: () => { throw new Error("x"); } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/my-offers");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

/* ── GET /marketplace/received-offers ──────────────────────────────────── */

describe("GET /marketplace/received-offers", () => {
  it("200 returns wrapped items scoped to requester", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("WHERE d.requester_company_id = $1"), respond: { rows: [{ id: "o1", status: "sent", created_at: "2026-01-01" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/received-offers");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.count, 1);
    const q = pool.find("WHERE d.requester_company_id = $1")[0];
    assert.strictEqual(q.params[0], "u1");
  });
});

/* ── GET /marketplace/offers/:id/detail ────────────────────────────────── */

describe("GET /marketplace/offers/:id/detail", () => {
  it("404 NOT_FOUND when offer missing", async () => {
    const pool = trackingPool(); // getAgreementDetails -> no row
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/offers/:id/detail");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── POST /marketplace/offers/:id/create-agreement ─────────────────────── */

describe("POST /marketplace/offers/:id/create-agreement", () => {
  it("404 NOT_FOUND when offer missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/offers/:id/create-agreement");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── POST /marketplace/offers/:id/confirm-agreement ────────────────────── */

describe("POST /marketplace/offers/:id/confirm-agreement", () => {
  it("404 NOT_FOUND when offer missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/offers/:id/confirm-agreement");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── POST /marketplace/offers/:id/activate ─────────────────────────────── */

describe("POST /marketplace/offers/:id/activate", () => {
  it("404 NOT_FOUND when offer missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/offers/:id/activate");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── POST /marketplace/offers/:id/cancel-agreement ─────────────────────── */

describe("POST /marketplace/offers/:id/cancel-agreement", () => {
  it("404 NOT_FOUND when offer missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/offers/:id/cancel-agreement");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID }, body: {} }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── GET /marketplace/offers/:id/staffing-context ──────────────────────── */

describe("GET /marketplace/offers/:id/staffing-context", () => {
  it("404 NOT_FOUND when offer missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/offers/:id/staffing-context");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── POST /marketplace/offers/:id/quick-assign-to-deal ─────────────────── */

describe("POST /marketplace/offers/:id/quick-assign-to-deal", () => {
  it("404 NOT_FOUND when offer missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/offers/:id/quick-assign-to-deal");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID }, body: { worker_user_ids: [UUID] } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── GET /marketplace/offers/:id/document ──────────────────────────────── */

describe("GET /marketplace/offers/:id/document", () => {
  it("404 NOT_FOUND when offer missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/offers/:id/document");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── GET /marketplace/offers/:id/dossier ───────────────────────────────── */

describe("GET /marketplace/offers/:id/dossier", () => {
  it("404 NOT_FOUND when offer missing", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/offers/:id/dossier");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── GET /marketplace/deals/:id/progress ───────────────────────────────── */

describe("GET /marketplace/deals/:id/progress", () => {
  it("404 NOT_FOUND when no progress found", async () => {
    const pool = trackingPool();
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/deals/:id/progress");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "NOT_FOUND");
  });
});

/* ── GET /marketplace/my-deals ─────────────────────────────────────────── */

describe("GET /marketplace/my-deals", () => {
  it("200 returns plain array (no meta) scoped to caller", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM offers o") && s.includes("deal_history_sort_at"), respond: { rows: [
        { id: "o1", status: "accepted", capacity_post_id: null, supplier_company_id: "u1", offered_quantity: 1 }
      ] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/my-deals");
    const res = mockRes();
    await handler(mockReq({ query: {} }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json));
    assert.strictEqual(res._json[0].id, "o1");
    assert.strictEqual(res._json[0].viewer_role, "supplier");
  });

  it("200 returns meta envelope when include_meta=1", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("action_required_count"), respond: { rows: [{
        active_count: 1, completed_count: 0, cancelled_count: 0, all_count: 1,
        active_headcount: 2, completed_headcount: 0, cancelled_headcount: 0, all_headcount: 2,
        action_required_count: 1
      }] } },
      { match: (s) => s.includes("FROM offers o") && s.includes("deal_history_sort_at"), respond: { rows: [
        { id: "o1", status: "accepted", capacity_post_id: null, supplier_company_id: "u1", offered_quantity: 2 }
      ] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/my-deals");
    const res = mockRes();
    await handler(mockReq({ query: { include_meta: "1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.items));
    assert.strictEqual(res._json.counts.active, 1);
    assert.strictEqual(res._json.kpis.action_required, 1);
    assert.ok(res._json.pagination);
  });
});

/* ── GET /marketplace/public/capacity-posts ────────────────────────────── */

describe("GET /marketplace/public/capacity-posts", () => {
  it("200 returns contact-stripped public projection", async () => {
    const pool = trackingPool([
      { match: isListCapacityPosts, respond: { rows: [
        { id: "cp1", title: "Pflege", role: "PK", location_city: "Berlin", supplier_company_name: "Agentur", email: "secret@x.de", contact_phone: "0123" }
      ] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/public/capacity-posts");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 1);
    assert.strictEqual(res._json[0].id, "cp1");
    // contact fields stripped
    assert.strictEqual(res._json[0].email, undefined);
    assert.strictEqual(res._json[0].contact_phone, undefined);
  });
});

/* ── GET/POST /marketplace/demand-requests/:id/interactions ────────────── */

describe("GET /marketplace/demand-requests/:id/interactions", () => {
  it("404 NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([{ match: isGetDemandById, respond: { rows: [] } }]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("403 FORBIDDEN for non-owner", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "other" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 403);
  });

  it("200 returns interactions array for owner", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "u1" }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/demand-requests/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json));
  });
});

describe("POST /marketplace/demand-requests/:id/interactions", () => {
  it("404 NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([{ match: isGetDemandById, respond: { rows: [] } }]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "post", "/marketplace/demand-requests/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID }, body: {} }), res);
    assert.strictEqual(res._status, 404);
  });

  it("409 DEMAND_NOT_INTERACTABLE for closed demand", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "other", status: "fulfilled", headcount: 1, remaining_open_count: 0 }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool, { role: "agency" })), "post", "/marketplace/demand-requests/:id/interactions");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID }, body: { interaction_type: "interest" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error, "DEMAND_NOT_INTERACTABLE");
  });
});

/* ── GET /marketplace/public/demand-requests/:id ───────────────────────── */

describe("GET /marketplace/public/demand-requests/:id", () => {
  it("404 NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([{ match: isGetDemandById, respond: { rows: [] } }]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/public/demand-requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("404 NOT_FOUND when demand is not commercially open", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{ id: UUID, requester_company_id: "u1", status: "fulfilled", headcount: 1, remaining_open_count: 0, is_capacity_origin: false }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/public/demand-requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 404);
  });

  it("200 returns public projection for open demand", async () => {
    const pool = trackingPool([
      { match: isGetDemandById, respond: { rows: [{
        id: UUID, requester_company_id: "u1", title: "Bedarf", role: "PK", status: "open",
        headcount: 2, required_total_count: 2, remaining_open_count: 2, currently_committed_count: 0,
        is_capacity_origin: false
      }] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/public/demand-requests/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: UUID } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.id, UUID);
    assert.strictEqual(res._json.remaining_open_count, 2);
    // requester-only/internal fields not leaked
    assert.strictEqual(res._json.requester_company_id, undefined);
    assert.strictEqual(res._json.sla_status, undefined);
  });
});

/* ── GET /marketplace/public/demand-requests ───────────────────────────── */

describe("GET /marketplace/public/demand-requests", () => {
  it("200 returns public list projection", async () => {
    const pool = trackingPool([
      { match: isListDemandRequests, respond: { rows: [
        { id: "d1", title: "Bedarf", role: "PK", status: "open", headcount: 1, remaining_open_count: 1, currently_committed_count: 0 }
      ] } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/public/demand-requests");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.length, 1);
    assert.strictEqual(res._json[0].id, "d1");
  });

  it("500 SERVER_ERROR when query throws", async () => {
    const pool = trackingPool([
      { match: isListDemandRequests, respond: () => { throw new Error("x"); } }
    ]);
    const handler = getHandler(createMarketplaceRouter(makeDeps(pool)), "get", "/marketplace/public/demand-requests");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});
