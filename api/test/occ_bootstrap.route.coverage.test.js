/**
 * Router-handler coverage for routes/occ/bootstrap.js (createOccBootstrapRouter).
 *
 * The single route GET /bootstrap is fully inline: it aggregates ~13 scalar
 * COUNT/MAX queries via safeScalar(), probes the users.last_login_at column,
 * runs a system health check, assembles critical_signals[], and responds with
 * res.json(...). There is NO try/catch → next(err); every observable result is
 * on res. So we assert res._json directly.
 *
 * Module-level state note: ensureUserLastLoginColumn() caches its result in a
 * module-scoped flag (userLastLoginColumnChecked/Present) for the lifetime of
 * the module. To exercise BOTH the column-present and column-absent branches we
 * import the source FRESH per test via a cache-busting query string, which
 * gives each test its own module instance with reset module state.
 *
 * Run: node --test --test-force-exit test/occ_bootstrap.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── fresh module per test (resets module-level last-login-column cache) ──── */
let _v = 0;
async function freshFactory() {
  const mod = await import(`../routes/occ/bootstrap.js?v=${_v++}`);
  return mod.createOccBootstrapRouter;
}

/* ── Mocks ─────────────────────────────────────────────────────────────── */

/**
 * Tracking pool. `routes` is an ordered list of { match(sql)->bool, respond }.
 * First match wins; respond can be a value or fn(sql,params). Unmatched queries
 * return { rows: [], rowCount: 0 } so non-critical scalars degrade to fallbacks.
 * Includes connect() for transaction-safety (not used by this route, but the
 * route-test contract mandates it).
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

/* Match helpers for the well-known scalar queries in the handler. */
const M = {
  columnProbe: (s) => s.includes("information_schema.columns") && s.includes("last_login_at"),
  identity:    (s) => s.includes("company_name") && s.includes("contact_person") && s.includes("FROM users"),
  lastLogin:   (s) => s.includes("SELECT last_login_at") && s.includes("WHERE id = $1"),
  active30dLogin: (s) => s.includes("last_login_at > NOW() - INTERVAL '30 days'"),
  active30dCreated: (s) => s.includes("created_at > NOW() - INTERVAL '30 days'") && s.includes("FROM users"),
  activeOrgs:  (s) => s.includes("COUNT(DISTINCT org_id)") && s.includes("org_memberships"),
  mrr:         (s) => s.includes("payment_sessions") && s.includes("SUM(amount)"),
  openDecisions: (s) => s.includes("occ_decisions"),
  openRequests:  (s) => s.includes("strategic_collaboration_requests"),
  supportEsc:  (s) => s.includes("support_escalations se"),
  riskSignals: (s) => s.includes("risk_signals") && s.includes("resolved_at IS NULL"),
  warp:        (s) => s.includes("warp_executions"),
  infra:       (s) => s.includes("infrastructure_snapshots"),
  audit:       (s) => s.includes("audit_log") && s.includes("owner_control.%"),
  select1:     (s) => s.trim() === "SELECT 1"
};

/* A pool where the health-probe SELECT 1 succeeds (db up). Pass extra routes. */
function poolDbUp(extra = []) {
  return trackingPool([
    { match: M.select1, respond: { rows: [{ "?column?": 1 }] } },
    ...extra
  ]);
}

/* ── Router registration ───────────────────────────────────────────────── */

describe("occ bootstrap router — registration", () => {
  it("registers GET /bootstrap", async () => {
    const factory = await freshFactory();
    const router = factory({ pool: trackingPool() });
    const seen = router.stack
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`);
    assert.ok(seen.includes("get /bootstrap"), `routes: ${seen.join(", ")}`);
  });
});

/* ── GET /bootstrap — column present + identity hit + healthy ───────────── */

describe("GET /bootstrap — full happy path (column present, identity found)", () => {
  it("returns success envelope with executive_summary + healthy status", async () => {
    const factory = await freshFactory();
    const pool = poolDbUp([
      // last_login_at column EXISTS
      { match: M.columnProbe, respond: { rows: [{ "?column?": 1 }], rowCount: 1 } },
      // identity probe (safeScalar) + the follow-up identity query
      { match: M.identity, respond: { rows: [{ user_id: "u1", email: "owner@tc.de", company_name: "TempConnect", contact_person: "Dennis" }] } },
      { match: M.lastLogin, respond: { rows: [{ last_login_at: "2026-06-20T10:00:00Z" }] } },
      { match: M.active30dLogin, respond: { rows: [{ n: 42 }] } },
      { match: M.activeOrgs, respond: { rows: [{ n: 7 }] } },
      { match: M.mrr, respond: { rows: [{ mrr: 12345 }] } },
      { match: M.openDecisions, respond: { rows: [{ n: 3 }] } },
      { match: M.openRequests, respond: { rows: [{ n: 2 }] } },
      { match: M.audit, respond: { rows: [{ last_audit_at: "2026-06-22T08:00:00Z" }] } }
    ]);
    const handler = getHandler(factory({ pool }), "get", "/bootstrap");
    const res = mockRes();
    await handler(mockReq({ occAccess: { user_id: "u1", occ_role: "owner" } }), res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.error, null);

    const d = res._json.data;
    // identity resolved from DB row; display_name falls back to contact_person
    assert.strictEqual(d.identity.user_id, "u1");
    assert.strictEqual(d.identity.email, "owner@tc.de");
    assert.strictEqual(d.identity.display_name, "Dennis");
    assert.strictEqual(d.identity.occ_role, "owner");
    assert.strictEqual(d.identity.step_up_required, false);
    assert.strictEqual(d.identity.last_login_at, "2026-06-20T10:00:00.000Z"); // toIsoOrNull

    // login-based active count branch was used (column present)
    assert.strictEqual(d.executive_summary.active_users_30d, 42);
    assert.ok(pool.find("last_login_at > NOW()").length >= 1);
    assert.strictEqual(d.executive_summary.active_orgs, 7);
    assert.strictEqual(d.executive_summary.mrr_eur, 12345);
    assert.strictEqual(d.executive_summary.open_decisions, 3);

    // all 11 modules exposed
    assert.strictEqual(d.allowed_modules.length, 11);
    assert.ok(d.allowed_modules.every((m) => m.allowed === true));
    assert.deepStrictEqual(d.allowed_actions, []);

    // no critical signals when everything is zero + db up + redis null
    assert.strictEqual(d.system_status, "healthy");
    assert.strictEqual(d.critical_signals.length, 0);
    assert.strictEqual(d.executive_summary.critical_signals, 0);
    assert.strictEqual(d.last_audit_at, "2026-06-22T08:00:00.000Z");
    assert.strictEqual(d.open_decisions_count, 3);
    assert.strictEqual(d.open_requests_count, 2);
  });
});

/* ── column ABSENT branch + identity miss + session-derived userId ──────── */

describe("GET /bootstrap — column absent, identity miss, session userId", () => {
  it("uses created_at active count, null identity fields, default occ_role", async () => {
    const factory = await freshFactory();
    const pool = poolDbUp([
      // last_login_at column DOES NOT exist
      { match: M.columnProbe, respond: { rows: [], rowCount: 0 } },
      // identity safeScalar returns null user_id -> identityRow falsy -> no follow-up populate
      { match: M.identity, respond: { rows: [] } },
      { match: M.active30dCreated, respond: { rows: [{ n: 9 }] } }
    ]);
    const handler = getHandler(factory({ pool }), "get", "/bootstrap");
    const res = mockRes();
    // no occAccess -> userId from session, occRole defaults to "owner"
    await handler(mockReq(), res);

    assert.strictEqual(res._status, 200);
    const d = res._json.data;

    // identity falls back: user_id = session userId, email null, display_name null
    assert.strictEqual(d.identity.user_id, "u1");
    assert.strictEqual(d.identity.email, null);
    assert.strictEqual(d.identity.display_name, null);
    assert.strictEqual(d.identity.occ_role, "owner");
    assert.strictEqual(d.identity.last_login_at, null);

    // created_at branch used because column absent
    assert.ok(pool.find("created_at > NOW()").length >= 1);
    assert.strictEqual(pool.find("last_login_at > NOW()").length, 0);
    assert.strictEqual(d.executive_summary.active_users_30d, 9);

    // nothing breached
    assert.strictEqual(d.system_status, "healthy");
    assert.strictEqual(d.critical_signals.length, 0);
  });
});

/* ── DB down → critical status + DB_DOWN signal ─────────────────────────── */

describe("GET /bootstrap — database unreachable", () => {
  it("system_status=critical with DB_DOWN signal", async () => {
    const factory = await freshFactory();
    // SELECT 1 throws (db down); column probe also throws -> column absent path.
    const pool = trackingPool([
      { match: M.select1, respond: () => { throw new Error("connection refused"); } },
      { match: M.columnProbe, respond: () => { throw new Error("connection refused"); } }
    ]);
    const handler = getHandler(factory({ pool }), "get", "/bootstrap");
    const res = mockRes();
    await handler(mockReq({ occAccess: { user_id: "u1", occ_role: "owner" } }), res);

    assert.strictEqual(res._status, 200);
    const d = res._json.data;
    assert.strictEqual(d.system_status, "critical");
    const codes = d.critical_signals.map((s) => s.code);
    assert.ok(codes.includes("DB_DOWN"), `signals: ${codes.join(",")}`);
    const dbSig = d.critical_signals.find((s) => s.code === "DB_DOWN");
    assert.strictEqual(dbSig.severity, "critical");
    assert.strictEqual(d.executive_summary.critical_signals, d.critical_signals.length);
  });
});

/* ── all warning signals (infra/warp/support/risk) populated ────────────── */

describe("GET /bootstrap — warning signals from non-zero counts", () => {
  it("emits INFRA_CRITICAL / WARP_FAILURES_24H / SUPPORT_ESCALATIONS_OPEN / RISK_SIGNALS_OPEN", async () => {
    const factory = await freshFactory();
    const pool = poolDbUp([
      { match: M.columnProbe, respond: { rows: [{ "?column?": 1 }], rowCount: 1 } },
      { match: M.identity, respond: { rows: [{ user_id: "u1", email: null, company_name: "ACME", contact_person: null }] } },
      { match: M.lastLogin, respond: { rows: [{ last_login_at: null }] } },
      { match: M.active30dLogin, respond: { rows: [{ n: 1 }] } },
      { match: M.supportEsc, respond: { rows: [{ n: 4 }] } },
      { match: M.riskSignals, respond: { rows: [{ n: 2 }] } },
      { match: M.warp, respond: { rows: [{ n: 6 }] } },
      { match: M.infra, respond: { rows: [{ n: 3 }] } }
    ]);
    const handler = getHandler(factory({ pool }), "get", "/bootstrap");
    const res = mockRes();
    await handler(mockReq({ occAccess: { user_id: "u1", occ_role: "owner" } }), res);

    const d = res._json.data;
    const codes = d.critical_signals.map((s) => s.code).sort();
    assert.deepStrictEqual(codes, [
      "INFRA_CRITICAL", "RISK_SIGNALS_OPEN", "SUPPORT_ESCALATIONS_OPEN", "WARP_FAILURES_24H"
    ]);
    // breakdown reflects the raw counts
    assert.strictEqual(d.critical_signal_breakdown.support_escalations_open, 4);
    assert.strictEqual(d.critical_signal_breakdown.risk_signals_open, 2);
    assert.strictEqual(d.critical_signal_breakdown.warp_failures_24h, 6);
    assert.strictEqual(d.critical_signal_breakdown.infrastructure_critical_hosts, 3);
    // INFRA + DB up = still critical severity present, system_status stays healthy (db up, redis null)
    assert.strictEqual(d.system_status, "healthy");
    assert.strictEqual(d.executive_summary.open_support_escalations, 4);
    assert.strictEqual(d.executive_summary.critical_signals, 4);

    // message interpolation carries the count
    const infra = d.critical_signals.find((s) => s.code === "INFRA_CRITICAL");
    assert.match(infra.message, /3 Host/);
    assert.strictEqual(infra.severity, "critical");
  });
});

/* ── display_name fallback chain (company_name when contact_person null) ── */

describe("GET /bootstrap — display_name fallback to company_name then email", () => {
  it("uses company_name when contact_person is null", async () => {
    const factory = await freshFactory();
    const pool = poolDbUp([
      { match: M.columnProbe, respond: { rows: [{ "?column?": 1 }], rowCount: 1 } },
      { match: M.identity, respond: { rows: [{ user_id: "u1", email: "c@tc.de", company_name: "OnlyCompany", contact_person: null }] } },
      { match: M.lastLogin, respond: { rows: [{ last_login_at: null }] } },
      { match: M.active30dLogin, respond: { rows: [{ n: 0 }] } }
    ]);
    const handler = getHandler(factory({ pool }), "get", "/bootstrap");
    const res = mockRes();
    await handler(mockReq({ occAccess: { user_id: "u1", occ_role: "co-owner" } }), res);
    const d = res._json.data;
    assert.strictEqual(d.identity.display_name, "OnlyCompany");
    assert.strictEqual(d.identity.occ_role, "co-owner");
    assert.strictEqual(d.identity.last_login_at, null); // toIsoOrNull(null)
  });
});
