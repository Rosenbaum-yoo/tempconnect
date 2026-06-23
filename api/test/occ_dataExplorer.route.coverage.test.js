/**
 * Router-handler coverage for routes/occ/dataExplorer.js (createOccDataExplorerRouter).
 *
 * All four handlers are inline `async (req, res) => res.json(...)` — there is NO
 * try/catch → next(err) path. Every DB access funnels through the _helpers
 * safeQuery / safeScalar / columnExists wrappers, which swallow errors and return
 * fallbacks. So behavior is fully observable via res._json directly; there is no
 * central error-mapper to mount and no next(err) branch to assert.
 *
 * Strategy: drive the REAL handler + REAL _helpers with a SQL-substring-dispatching
 * tracking pool. We control:
 *   - columnExists (information_schema.columns) → toggles last_login_at SELECT branch
 *   - the COUNT(*) AS n scalar → total
 *   - the paginated row SELECT → items + has_more math
 *
 * Run: node --test --test-force-exit test/occ_dataExplorer.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOccDataExplorerRouter } from "../routes/occ/dataExplorer.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

/**
 * Tracking pool. `routes` is an ordered list of { match(sql) -> bool, respond }.
 * First matching entry wins; unmatched queries return { rows: [] }.
 * Includes connect() for parity with the verified template (not used here, but
 * mandated by the route-test contract).
 */
function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    calls.push({ sql: text, params });
    for (const r of routes) {
      if (r.match(text)) {
        const out = typeof r.respond === "function" ? r.respond(text, params) : r.respond;
        return out ?? { rows: [] };
      }
    }
    return { rows: [] };
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

function makeDeps(pool) {
  return { pool };
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

/* Reusable match fragments */
const COLUMN_EXISTS = (s) => s.includes("FROM information_schema.columns");
const COUNT_N = (s) => s.includes("COUNT(*)::int AS n");

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("occ dataExplorer router — registration", () => {
  it("registers all four data-explorer routes", () => {
    const router = createOccDataExplorerRouter(makeDeps(trackingPool()));
    const seen = new Set(
      router.stack
        .filter((l) => l.route)
        .map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "get /data-explorer/users",
      "get /data-explorer/organizations",
      "get /data-explorer/subscriptions",
      "get /data-explorer/integrity-checks"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });
});

/* ── GET /data-explorer/users ──────────────────────────────────────────── */

describe("GET /data-explorer/users", () => {
  it("200 default page: maps + masks email, defaults plan FREE, has_more=false", async () => {
    const pool = trackingPool([
      { match: COLUMN_EXISTS, respond: { rows: [{ "?column?": 1 }] } }, // last_login_at exists
      { match: COUNT_N, respond: { rows: [{ n: 1 }] } },
      {
        match: (s) => s.includes("FROM users u") && s.includes("LEFT JOIN LATERAL"),
        respond: {
          rows: [{
            id: "U1", email: "Alice@Example.COM", company_name: "ACME",
            created_at: "2026-01-01T00:00:00Z", last_login_at: "2026-02-01T00:00:00Z",
            is_verified: true, plan: "PRO", org_count: 3
          }]
        }
      }
    ]);
    const handler = getHandler(createOccDataExplorerRouter(makeDeps(pool)), "get", "/data-explorer/users");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.error, null);
    const item = res._json.data.items[0];
    assert.strictEqual(item.id, "U1");
    assert.strictEqual(item.email, "a***@example.com"); // masked + lowercased
    assert.strictEqual(item.company_name, "ACME");
    assert.strictEqual(item.created_at, "2026-01-01T00:00:00.000Z");
    assert.strictEqual(item.last_login_at, "2026-02-01T00:00:00.000Z");
    assert.strictEqual(item.status, "active");
    assert.strictEqual(item.plan, "PRO");
    assert.strictEqual(item.org_count, 3);
    assert.strictEqual(res._json.data.total, 1);
    assert.strictEqual(res._json.data.page, 1);
    assert.strictEqual(res._json.data.per_page, 30);
    assert.strictEqual(res._json.data.has_more, false); // offset 0 + 1 row >= total 1

    // last_login_at column present -> real column selected, not NULL::timestamptz
    const rowQuery = pool.find("LEFT JOIN LATERAL")[0];
    assert.ok(rowQuery.sql.includes("u.last_login_at"));
    assert.ok(!rowQuery.sql.includes("NULL::timestamptz AS last_login_at"));
  });

  it("selects NULL::timestamptz when last_login_at column absent", async () => {
    const pool = trackingPool([
      { match: COLUMN_EXISTS, respond: { rows: [] } }, // column missing
      { match: COUNT_N, respond: { rows: [{ n: 0 }] } }
    ]);
    const handler = getHandler(createOccDataExplorerRouter(makeDeps(pool)), "get", "/data-explorer/users");
    const res = mockRes();
    await handler(mockReq(), res);

    const rowQuery = pool.find("LEFT JOIN LATERAL")[0];
    assert.ok(rowQuery.sql.includes("NULL::timestamptz AS last_login_at"));
  });

  it("applies search filter, pagination math, and has_more=true; unverified -> pending_verification", async () => {
    const pool = trackingPool([
      { match: COLUMN_EXISTS, respond: { rows: [{ "?column?": 1 }] } },
      { match: COUNT_N, respond: { rows: [{ n: 100 }] } },
      {
        match: (s) => s.includes("FROM users u") && s.includes("LEFT JOIN LATERAL"),
        respond: {
          rows: [{
            id: "U2", email: "no-at-symbol", company_name: null,
            created_at: null, last_login_at: null, is_verified: false,
            plan: null, org_count: null
          }]
        }
      }
    ]);
    const handler = getHandler(createOccDataExplorerRouter(makeDeps(pool)), "get", "/data-explorer/users");
    const res = mockRes();
    await handler(mockReq({ query: { search: "Bob", page: "2", per_page: "10" } }), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.page, 2);
    assert.strictEqual(res._json.data.per_page, 10);
    assert.strictEqual(res._json.data.total, 100);
    // offset (2-1)*10 = 10; 10 + 1 row = 11 < 100 -> has_more true
    assert.strictEqual(res._json.data.has_more, true);
    const item = res._json.data.items[0];
    assert.strictEqual(item.email, null); // maskEmail("no-at-symbol") -> null
    assert.strictEqual(item.company_name, null);
    assert.strictEqual(item.created_at, null);
    assert.strictEqual(item.last_login_at, null);
    assert.strictEqual(item.status, "pending_verification");
    assert.strictEqual(item.plan, "FREE"); // null -> FREE fallback
    assert.strictEqual(item.org_count, 0);

    // search term + pagination params reached the row query
    const rowQuery = pool.find("LEFT JOIN LATERAL")[0];
    assert.ok(rowQuery.sql.includes("WHERE"));
    assert.strictEqual(rowQuery.params[0], "%bob%"); // lowercased like-term
    assert.strictEqual(rowQuery.params[rowQuery.params.length - 2], 10); // perPage
    assert.strictEqual(rowQuery.params[rowQuery.params.length - 1], 10); // offset
  });
});

/* ── GET /data-explorer/organizations ──────────────────────────────────── */

describe("GET /data-explorer/organizations", () => {
  it("200 maps org row fields with null-safe fallbacks", async () => {
    const pool = trackingPool([
      { match: COUNT_N, respond: { rows: [{ n: 1 }] } },
      {
        match: (s) => s.includes("FROM organizations o") && s.includes("LEFT JOIN LATERAL"),
        respond: {
          rows: [{
            id: "O1", name: "Org One", slug: "org-one", type: "company",
            plan: "PLUS", is_active: true, created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-03-01T00:00:00Z", member_count: 5, active_subscriptions: 2
          }]
        }
      }
    ]);
    const handler = getHandler(createOccDataExplorerRouter(makeDeps(pool)), "get", "/data-explorer/organizations");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    const item = res._json.data.items[0];
    assert.strictEqual(item.id, "O1");
    assert.strictEqual(item.name, "Org One");
    assert.strictEqual(item.slug, "org-one");
    assert.strictEqual(item.type, "company");
    assert.strictEqual(item.plan, "PLUS");
    assert.strictEqual(item.is_active, true);
    assert.strictEqual(item.created_at, "2026-01-01T00:00:00.000Z");
    assert.strictEqual(item.updated_at, "2026-03-01T00:00:00.000Z");
    assert.strictEqual(item.member_count, 5);
    assert.strictEqual(item.active_subscriptions, 2);
    assert.strictEqual(res._json.data.total, 1);
    assert.strictEqual(res._json.data.has_more, false);
  });

  it("is_active false stays false; null fields -> null; search wiring", async () => {
    const pool = trackingPool([
      { match: COUNT_N, respond: { rows: [{ n: 50 }] } },
      {
        match: (s) => s.includes("FROM organizations o") && s.includes("LEFT JOIN LATERAL"),
        respond: {
          rows: [{
            id: "O2", name: "Org Two", slug: null, type: null, plan: null,
            is_active: false, created_at: null, updated_at: null,
            member_count: null, active_subscriptions: null
          }]
        }
      }
    ]);
    const handler = getHandler(createOccDataExplorerRouter(makeDeps(pool)), "get", "/data-explorer/organizations");
    const res = mockRes();
    await handler(mockReq({ query: { search: "ZWO" } }), res);

    const item = res._json.data.items[0];
    assert.strictEqual(item.slug, null);
    assert.strictEqual(item.type, null);
    assert.strictEqual(item.plan, null);
    assert.strictEqual(item.is_active, false);
    assert.strictEqual(item.created_at, null);
    assert.strictEqual(item.member_count, 0);
    assert.strictEqual(item.active_subscriptions, 0);
    assert.strictEqual(res._json.data.has_more, true); // 0 + 1 < 50

    const rowQuery = pool.find("LEFT JOIN LATERAL")[0];
    assert.ok(rowQuery.sql.includes("WHERE"));
    assert.strictEqual(rowQuery.params[0], "%zwo%");
  });
});

/* ── GET /data-explorer/subscriptions ──────────────────────────────────── */

describe("GET /data-explorer/subscriptions", () => {
  it("200 maps subscription row + masks email + iso dates", async () => {
    const pool = trackingPool([
      { match: COUNT_N, respond: { rows: [{ n: 1 }] } },
      {
        match: (s) => s.includes("FROM subscriptions s") && s.includes("LEFT JOIN users u"),
        respond: {
          rows: [{
            id: "S1", user_id: "U9", plan: "PRO", status: "active",
            current_period_start: "2026-01-01T00:00:00Z",
            current_period_end: "2026-02-01T00:00:00Z",
            cancel_at: null, canceled_at: null,
            created_at: "2025-12-01T00:00:00Z", updated_at: "2026-01-15T00:00:00Z",
            user_email: "User@Mail.de", organization_id: "O7", organization_name: "Org Seven"
          }]
        }
      }
    ]);
    const handler = getHandler(createOccDataExplorerRouter(makeDeps(pool)), "get", "/data-explorer/subscriptions");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    const item = res._json.data.items[0];
    assert.strictEqual(item.id, "S1");
    assert.strictEqual(item.user_id, "U9");
    assert.strictEqual(item.user_email, "u***@mail.de");
    assert.strictEqual(item.organization_id, "O7");
    assert.strictEqual(item.organization_name, "Org Seven");
    assert.strictEqual(item.plan, "PRO");
    assert.strictEqual(item.status, "active");
    assert.strictEqual(item.current_period_start, "2026-01-01T00:00:00.000Z");
    assert.strictEqual(item.current_period_end, "2026-02-01T00:00:00.000Z");
    assert.strictEqual(item.cancel_at, null);
    assert.strictEqual(item.canceled_at, null);
    assert.strictEqual(item.created_at, "2025-12-01T00:00:00.000Z");
    assert.strictEqual(res._json.data.total, 1);
    assert.strictEqual(res._json.data.has_more, false);
  });

  it("null-safe fallbacks + search hits 4-column LIKE wiring", async () => {
    const pool = trackingPool([
      { match: COUNT_N, respond: { rows: [{ n: 200 }] } },
      {
        match: (s) => s.includes("FROM subscriptions s") && s.includes("LEFT JOIN users u"),
        respond: {
          rows: [{
            id: "S2", user_id: null, plan: null, status: null,
            current_period_start: null, current_period_end: null,
            cancel_at: null, canceled_at: null, created_at: null, updated_at: null,
            user_email: null, organization_id: null, organization_name: null
          }]
        }
      }
    ]);
    const handler = getHandler(createOccDataExplorerRouter(makeDeps(pool)), "get", "/data-explorer/subscriptions");
    const res = mockRes();
    await handler(mockReq({ query: { search: "PRO" } }), res);

    const item = res._json.data.items[0];
    assert.strictEqual(item.user_id, null);
    assert.strictEqual(item.user_email, null);
    assert.strictEqual(item.organization_id, null);
    assert.strictEqual(item.organization_name, null);
    assert.strictEqual(item.plan, null);
    assert.strictEqual(item.status, null);
    assert.strictEqual(item.created_at, null);
    assert.strictEqual(res._json.data.has_more, true);

    const rowQuery = pool.find("ORDER BY s.created_at DESC")[0];
    assert.ok(rowQuery.sql.includes("WHERE"));
    assert.ok(rowQuery.sql.includes("LOWER(COALESCE(s.plan"));
    assert.strictEqual(rowQuery.params[0], "%pro%");
  });
});

/* ── GET /data-explorer/integrity-checks ───────────────────────────────── */

describe("GET /data-explorer/integrity-checks", () => {
  it("200 returns 5 integrity items with distinct counts from per-query scalars", async () => {
    // Each COUNT(*) query is distinguished by a unique FROM/EXISTS fragment.
    const pool = trackingPool([
      { match: (s) => s.includes("FROM organizations o") && s.includes("NOT EXISTS"), respond: { rows: [{ n: 11 }] } },
      { match: (s) => s.includes("FROM users u") && s.includes("FROM org_memberships om"), respond: { rows: [{ n: 22 }] } },
      { match: (s) => s.includes("FROM subscriptions s") && s.includes("FROM payment_sessions ps"), respond: { rows: [{ n: 33 }] } },
      { match: (s) => s.includes("FROM commercial_offers co"), respond: { rows: [{ n: 44 }] } },
      { match: (s) => s.includes("FROM occ_decisions od") && s.includes("FROM audit_log al"), respond: { rows: [{ n: 55 }] } }
    ]);
    const handler = getHandler(createOccDataExplorerRouter(makeDeps(pool)), "get", "/data-explorer/integrity-checks");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.error, null);
    const items = res._json.data.items;
    assert.strictEqual(items.length, 5);
    assert.deepStrictEqual(items.map((i) => i.id), [
      "integrity-1", "integrity-2", "integrity-3", "integrity-4", "integrity-5"
    ]);
    assert.deepStrictEqual(items.map((i) => i.count), [11, 22, 33, 44, 55]);
    assert.strictEqual(items[0].name, "Orgs ohne aktive Subscription");
    assert.strictEqual(items[4].name, "OCC-Decisions ohne Audit-Eintrag");
  });

  it("defaults every count to 0 when scalars are unavailable (soft-fail)", async () => {
    // No routes registered -> all queries return { rows: [] } -> safeScalar fallback 0.
    const pool = trackingPool([]);
    const handler = getHandler(createOccDataExplorerRouter(makeDeps(pool)), "get", "/data-explorer/integrity-checks");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    const items = res._json.data.items;
    assert.strictEqual(items.length, 5);
    assert.ok(items.every((i) => i.count === 0));
  });

  it("safeScalar swallows a throwing pool and still returns 0-counts (no 500)", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(createOccDataExplorerRouter(makeDeps(pool)), "get", "/data-explorer/integrity-checks");
    const res = mockRes();
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    assert.ok(res._json.data.items.every((i) => i.count === 0));
  });
});
