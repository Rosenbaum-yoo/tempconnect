/**
 * Router-handler coverage for routes/admin.js (createAdminRouter).
 *
 * Strategy: every handler in admin.js uses INLINE res.status().json() (no
 * catch→next(err)). The service layer it delegates to (pilotPolicyService,
 * requestService, strategicCollaborationService, auditLog, activityFeedService,
 * eventTrackingService, healthService, visibilityAuditService, adminControlCenter)
 * are all real static imports that funnel through pool.query(sql, params). So we
 * drive the REAL handler + REAL service code with a SQL-substring-dispatching
 * tracking pool. Middleware (requireAuth / requireAdmin / exportLimiter) is
 * bypassed by invoking only the LAST handler in the route stack — the same idiom
 * the repo's requests.route.coverage.test.js / reporting.route.test.js use.
 *
 * Handlers that dynamic-import services (revenueMetricsService, exportService,
 * featureOverrideService, auditLog.writeAuditEnhanced) still hit pool.query, so
 * the same tracking pool covers them; writeAuditEnhanced failures are swallowed
 * by the handlers (try/catch around audit), so unmatched audit queries no-op.
 *
 * Run: node --test --test-force-exit test/admin.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAdminRouter } from "../routes/admin.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool. `routes` is an ordered list of { match(sql)->bool, respond }.
 * First matching entry wins; unmatched queries return { rows: [] } so audit
 * writes and non-critical paths degrade to no-ops. connect() returns a client
 * sharing the same query fn (withTransaction safety, though admin.js does not
 * use it — kept per the route-test contract).
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
    session: { userId: "u1", userRole: "platform_admin" },
    user: { id: "u1" },
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    orgRole: "platform_admin",
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

function makeDeps(pool, overrides = {}) {
  return {
    pool,
    logger: mockLogger(),
    config: overrides.config || {},
    requireAuth: (_req, _res, next) => next(),
    requestLimiter: (_req, _res, next) => next(),
    getUserAndPlan: overrides.getUserAndPlan || (async (id) => ({
      id: id || "u1", plan: "PRO", role: "platform_admin",
      org_id: "org-1", org_name: "ACME", org_role: "platform_admin",
      limits: {}, usage: {}
    }))
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

describe("admin router — registration", () => {
  it("registers all expected routes", () => {
    const router = createAdminRouter(makeDeps(trackingPool()));
    const seen = new Set(
      router.stack
        .filter((l) => l.route)
        .map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "get /admin/visibility-audit",
      "get /admin/control-center",
      "get /admin/users",
      "get /admin/organizations",
      "patch /admin/organizations/:id/pilot-policy",
      "get /admin/requests",
      "patch /admin/requests/:id/status",
      "get /admin/strategic-collaboration/requests",
      "patch /admin/strategic-collaboration/requests/:id/status",
      "patch /admin/strategic-collaboration/requests/:id/assign",
      "patch /admin/strategic-collaboration/requests/:id/notes",
      "get /admin/audit-log",
      "get /admin/audit-log/recent-changes",
      "get /admin/metrics",
      "patch /admin/users/:id",
      "post /admin/users/:id/deactivate",
      "get /admin/activity-feed",
      "get /admin/activity-feed/action-types",
      "get /admin/revenue",
      "get /admin/system-health",
      "get /admin/audit-log/export/csv",
      "get /admin/feature-overrides",
      "put /admin/feature-overrides",
      "delete /admin/feature-overrides/:id",
      "get /admin/feature-keys"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });
});

/* ── requireAdmin guard (exercised via the SECOND-to-last layer) ─────────── */

describe("admin router — requireAdmin guard", () => {
  // requireAdmin is the layer just before the final handler on every route.
  function getGuard(router, path) {
    for (const layer of router.stack) {
      if (!layer.route || layer.route.path !== path) continue;
      const stack = layer.route.stack;
      return stack[stack.length - 2].handle; // requireAdmin sits before handler
    }
    throw new Error("route not found");
  }

  it("403 ADMIN_REQUIRED when no admin role present", () => {
    const router = createAdminRouter(makeDeps(trackingPool()));
    const guard = getGuard(router, "/admin/users");
    const res = mockRes();
    let nextCalled = false;
    guard(mockReq({ orgRole: null, session: { userId: "u1" } }), res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error.code, "ADMIN_REQUIRED");
  });

  it("next() for platform_admin org role", () => {
    const router = createAdminRouter(makeDeps(trackingPool()));
    const guard = getGuard(router, "/admin/users");
    const res = mockRes();
    let nextCalled = false;
    guard(mockReq({ orgRole: "platform_admin" }), res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("next() for legacy session.userRole=owner", () => {
    const router = createAdminRouter(makeDeps(trackingPool()));
    const guard = getGuard(router, "/admin/users");
    const res = mockRes();
    let nextCalled = false;
    guard(mockReq({ orgRole: null, session: { userId: "u1", userRole: "owner" } }), res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("next() under ADMIN_PANEL_OPEN for any authenticated user", () => {
    const router = createAdminRouter(makeDeps(trackingPool(), { config: { ADMIN_PANEL_OPEN: true } }));
    const guard = getGuard(router, "/admin/users");
    const res = mockRes();
    let nextCalled = false;
    guard(mockReq({ orgRole: null, session: { userId: "u1" } }), res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });
});

/* ── GET /admin/visibility-audit ───────────────────────────────────────── */

describe("GET /admin/visibility-audit", () => {
  it("200 returns the visibility audit report", () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "get", "/admin/visibility-audit");
    const res = mockRes();
    handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(res._json.data, "report payload present");
  });
});

/* ── GET /admin/control-center ─────────────────────────────────────────── */

describe("GET /admin/control-center", () => {
  it("401 when viewer cannot be resolved", async () => {
    const deps = makeDeps(trackingPool(), { getUserAndPlan: async () => null });
    const handler = getHandler(createAdminRouter(deps), "get", "/admin/control-center");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error.code, "NOT_AUTHENTICATED");
  });

  it("200 builds control center for resolved viewer", async () => {
    // buildAdminControlCenter runs many pool.query calls; all unmatched -> []
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "get", "/admin/control-center");
    const res = mockRes();
    await handler(mockReq({ orgId: "org-1", orgName: "ACME", orgRole: "platform_admin" }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(res._json.data, "control center data present");
  });
});

/* ── GET /admin/users ──────────────────────────────────────────────────── */

describe("GET /admin/users", () => {
  it("200 global-admin scope returns paginated list", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("active_org_memberships") && s.includes("FROM users u"),
        respond: { rows: [{ id: "U1", email: "a@b.de", plan: "PRO" }] } },
      { match: (s) => s.includes("COUNT(*)::int AS total") && s.includes("FROM users u"),
        respond: { rows: [{ total: 1 }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/users");
    const res = mockRes();
    await handler(mockReq({ query: { limit: "10", offset: "0", q: "a@b" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, 1);
    assert.strictEqual(res._json.data.items.length, 1);
    assert.strictEqual(res._json.data.limit, 10);
    // search term flowed into the list query params (ILIKE '%a@b%')
    const listQ = pool.find("active_org_memberships")[0];
    assert.ok(listQ.params.includes("%a@b%"));
  });

  it("403 ORG_CONTEXT_REQUIRED for non-global admin without org scope", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "get", "/admin/users");
    const res = mockRes();
    // not global admin (no platform_admin/owner) and no orgId
    await handler(mockReq({ orgRole: "viewer", session: { userId: "u1" }, orgId: null }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error.code, "ORG_CONTEXT_REQUIRED");
  });

  it("scoped admin restricts query to its org_id", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("active_org_memberships") && s.includes("FROM users u"), respond: { rows: [] } },
      { match: (s) => s.includes("COUNT(*)::int AS total") && s.includes("FROM users u"), respond: { rows: [{ total: 0 }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/users");
    const res = mockRes();
    await handler(mockReq({ orgRole: "manager", session: { userId: "u1" }, orgId: "org-9", query: {} }), res);
    assert.strictEqual(res._status, 200);
    const listQ = pool.find("active_org_memberships")[0];
    assert.ok(listQ.params.includes("org-9"), "scoped org_id present in list params");
  });

  it("500 SERVER_ERROR when list query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("active_org_memberships"), respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/users");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── GET /admin/organizations ──────────────────────────────────────────── */

describe("GET /admin/organizations", () => {
  it("200 returns org list + total", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("member_count") && s.includes("FROM organizations o"),
        respond: { rows: [{ id: "O1", name: "Org One", member_count: 3, location_count: 2 }] } },
      { match: (s) => s.includes("COUNT(*)::int AS total FROM organizations"),
        respond: { rows: [{ total: 1 }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/organizations");
    const res = mockRes();
    await handler(mockReq({ query: { limit: "5" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, 1);
    assert.strictEqual(res._json.data.items[0].id, "O1");
    assert.strictEqual(res._json.data.limit, 5);
  });

  it("500 SERVER_ERROR on query failure", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("member_count"), respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/organizations");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── PATCH /admin/organizations/:id/pilot-policy ───────────────────────── */

describe("PATCH /admin/organizations/:id/pilot-policy", () => {
  it("400 INVALID_ORG_ID when id missing", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/organizations/:id/pilot-policy");
    const res = mockRes();
    await handler(mockReq({ params: { id: "  " }, body: { reason: "documented reason here" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ORG_ID");
  });

  it("400 REASON_REQUIRED when reason too short", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/organizations/:id/pilot-policy");
    const res = mockRes();
    await handler(mockReq({ params: { id: "org-1" }, body: { reason: "short" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "REASON_REQUIRED");
  });

  it("404 NOT_FOUND when org row absent (service ORG_NOT_FOUND)", async () => {
    // setPilotException UPDATE ... RETURNING -> empty rows -> ORG_NOT_FOUND
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE organizations") && s.includes("pilot_exception_allowed"), respond: { rows: [] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/organizations/:id/pilot-policy");
    const res = mockRes();
    await handler(mockReq({ params: { id: "org-x" }, body: { allow_exception: true, reason: "documented exception reason" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 sets exception + audit when service returns the org", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE organizations") && s.includes("pilot_exception_allowed"),
        respond: { rows: [{ id: "org-1", pilot_status: "exception", pilot_exception_allowed: true }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/organizations/:id/pilot-policy");
    const res = mockRes();
    await handler(mockReq({ params: { id: "org-1" }, body: { allow_exception: true, reason: "documented exception reason" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.id, "org-1");
    assert.strictEqual(res.locals.audit.action, "admin.organization.pilot_policy.update");
    assert.strictEqual(res.locals.audit.entity_id, "org-1");
    assert.strictEqual(res.locals.audit.details.allow_exception, true);
  });
});

/* ── GET /admin/requests ───────────────────────────────────────────────── */

describe("GET /admin/requests", () => {
  it("200 returns admin request list", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM requests r") && s.includes("u_recv.email AS receiver_email"),
        respond: { rows: [{ id: "R1", status: "SENT" }] } },
      { match: (s) => s.includes("COUNT(*)::int AS total FROM requests r"), respond: { rows: [{ total: 1 }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/requests");
    const res = mockRes();
    await handler(mockReq({ query: { limit: "20", status: "SENT" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, 1);
    assert.strictEqual(res._json.data.items[0].id, "R1");
  });

  it("500 SERVER_ERROR on failure", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("u_recv.email AS receiver_email"), respond: () => { throw new Error("x"); } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/requests");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── PATCH /admin/requests/:id/status ──────────────────────────────────── */

describe("PATCH /admin/requests/:id/status", () => {
  it("400 INVALID_ID when id missing", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "" }, body: { status: "ACCEPTED" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ID");
  });

  it("400 INVALID_STATUS for unknown status", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "R1" }, body: { status: "NONSENSE" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_STATUS");
  });

  it("404 NOT_FOUND when request absent + sets attempt audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM requests WHERE id=$1") && s.includes("requester_id, receiver_id, listing_id"),
        respond: { rows: [] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "R1" }, body: { status: "ACCEPTED" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
    assert.strictEqual(res.locals.audit.action, "admin.request.status_update_attempt");
  });

  it("409 INVALID_TRANSITION for an illegal state step", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM requests WHERE id=$1") && s.includes("requester_id, receiver_id, listing_id"),
        respond: { rows: [{ id: "R1", status: "DECLINED" }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/requests/:id/status");
    const res = mockRes();
    // DECLINED is terminal -> ACCEPTED not allowed
    await handler(mockReq({ params: { id: "R1" }, body: { status: "ACCEPTED" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error.code, "INVALID_TRANSITION");
    assert.strictEqual(res._json.error.from, "DECLINED");
    assert.strictEqual(res._json.error.to, "ACCEPTED");
  });

  it("200 updates status + records success audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM requests WHERE id=$1") && s.includes("requester_id, receiver_id, listing_id"),
        respond: { rows: [{ id: "R1", status: "SENT" }] } },
      { match: (s) => s.includes("UPDATE requests SET status=$1"),
        respond: { rows: [{ id: "R1", status: "ACCEPTED" }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/requests/:id/status");
    const res = mockRes();
    // SENT -> ACCEPTED is a legal transition
    await handler(mockReq({ params: { id: "R1" }, body: { status: "ACCEPTED" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.status, "ACCEPTED");
    assert.strictEqual(res.locals.audit.action, "admin.request.status_update");
    assert.strictEqual(res.locals.audit.details.from, "SENT");
    assert.strictEqual(res.locals.audit.details.to, "ACCEPTED");
  });
});

/* ── GET /admin/strategic-collaboration/requests ───────────────────────── */

describe("GET /admin/strategic-collaboration/requests", () => {
  it("200 returns list + total", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM strategic_collaboration_requests scr") && s.includes("assigned_to_name"),
        respond: { rows: [{ id: "SCR1", status: "eingegangen" }] } },
      { match: (s) => s.includes("COUNT(*)::int AS total FROM strategic_collaboration_requests"),
        respond: { rows: [{ total: 1 }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/strategic-collaboration/requests");
    const res = mockRes();
    await handler(mockReq({ query: { status: "eingegangen" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, 1);
    assert.strictEqual(res._json.data.items[0].id, "SCR1");
  });
});

/* ── PATCH /admin/strategic-collaboration/requests/:id/status ──────────── */

describe("PATCH /admin/strategic-collaboration/requests/:id/status", () => {
  it("400 INVALID_ID when missing", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/strategic-collaboration/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "" }, body: { status: "bestaetigt" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ID");
  });

  it("400 INVALID_STATUS for status not in ALLOWED_STATUSES", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/strategic-collaboration/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: { status: "GARBAGE" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_STATUS");
  });

  it("404 NOT_FOUND when update returns no row + attempt audit set", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE strategic_collaboration_requests") && s.includes("status_updated_by"),
        respond: { rows: [] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/strategic-collaboration/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: { status: "bestaetigt" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
    assert.strictEqual(res.locals.audit.action, "admin.strategic_collaboration.status_update_attempt");
  });

  it("200 updates status + success audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE strategic_collaboration_requests") && s.includes("status_updated_by"),
        respond: { rows: [{ id: "SCR1", status: "bestaetigt" }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/strategic-collaboration/requests/:id/status");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: { status: "bestaetigt" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.status, "bestaetigt");
    assert.strictEqual(res.locals.audit.action, "admin.strategic_collaboration.status_update");
    assert.strictEqual(res.locals.audit.details.status, "bestaetigt");
  });
});

/* ── PATCH /admin/strategic-collaboration/requests/:id/assign ──────────── */

describe("PATCH /admin/strategic-collaboration/requests/:id/assign", () => {
  it("400 INVALID_ID when missing", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/strategic-collaboration/requests/:id/assign");
    const res = mockRes();
    await handler(mockReq({ params: { id: "" }, body: {} }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ID");
  });

  it("400 INVALID_ASSIGNEE for a non-uuid assignee", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/strategic-collaboration/requests/:id/assign");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: { assigned_to_user_id: "not-a-uuid" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ASSIGNEE");
  });

  it("200 assigns to self ('me') + audit (default to session user)", async () => {
    // session userId must be uuid-shaped: "me" resolves to it and is then uuid-validated.
    const SELF = "11111111-1111-1111-1111-111111111111";
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE strategic_collaboration_requests") && s.includes("assigned_to_user_id"),
        respond: { rows: [{ id: "SCR1", assigned_to_user_id: SELF }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/strategic-collaboration/requests/:id/assign");
    const res = mockRes();
    await handler(mockReq({ session: { userId: SELF, userRole: "platform_admin" }, params: { id: "SCR1" }, body: { assigned_to_user_id: "me" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.assigned_to_user_id, SELF);
    assert.strictEqual(res.locals.audit.action, "admin.strategic_collaboration.assign");
    // service called with session userId as assignee
    const upd = pool.find("assigned_to_user_id")[0];
    assert.strictEqual(upd.params[1], SELF);
  });

  it("200 unassign (empty string -> null)", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE strategic_collaboration_requests") && s.includes("assigned_to_user_id"),
        respond: { rows: [{ id: "SCR1", assigned_to_user_id: null }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/strategic-collaboration/requests/:id/assign");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: { assigned_to_user_id: "" } }), res);
    assert.strictEqual(res._status, 200);
    const upd = pool.find("assigned_to_user_id")[0];
    assert.strictEqual(upd.params[1], null);
  });

  it("404 NOT_FOUND when update returns no row", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE strategic_collaboration_requests") && s.includes("assigned_to_user_id"),
        respond: { rows: [] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/strategic-collaboration/requests/:id/assign");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: { assigned_to_user_id: "" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });
});

/* ── PATCH /admin/strategic-collaboration/requests/:id/notes ───────────── */

describe("PATCH /admin/strategic-collaboration/requests/:id/notes", () => {
  it("400 INVALID_ID when missing", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/strategic-collaboration/requests/:id/notes");
    const res = mockRes();
    await handler(mockReq({ params: { id: "" }, body: { ops_notes: "x" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ID");
  });

  it("400 MISSING_NOTES when ops_notes undefined", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/strategic-collaboration/requests/:id/notes");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: {} }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_NOTES");
  });

  it("400 INVALID_NOTES when ops_notes is not a string", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/strategic-collaboration/requests/:id/notes");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: { ops_notes: 123 } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_NOTES");
  });

  it("400 INVALID_NOTES_LENGTH when over 5000 chars", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/strategic-collaboration/requests/:id/notes");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: { ops_notes: "x".repeat(5001) } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_NOTES_LENGTH");
  });

  it("200 updates notes + success audit", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE strategic_collaboration_requests") && s.includes("ops_notes = $2"),
        respond: { rows: [{ id: "SCR1", ops_notes: "remember this" }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/strategic-collaboration/requests/:id/notes");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: { ops_notes: "  remember this  " } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.ops_notes, "remember this");
    assert.strictEqual(res.locals.audit.action, "admin.strategic_collaboration.ops_notes_update");
    assert.strictEqual(res.locals.audit.details.has_notes, true);
    // trimmed value persisted
    const upd = pool.find("ops_notes = $2")[0];
    assert.strictEqual(upd.params[1], "remember this");
  });

  it("404 NOT_FOUND when row absent", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE strategic_collaboration_requests") && s.includes("ops_notes = $2"),
        respond: { rows: [] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/strategic-collaboration/requests/:id/notes");
    const res = mockRes();
    await handler(mockReq({ params: { id: "SCR1" }, body: { ops_notes: "hi" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });
});

/* ── GET /admin/audit-log ──────────────────────────────────────────────── */

describe("GET /admin/audit-log", () => {
  it("200 returns formatted audit items + pagination", async () => {
    const pool = trackingPool([
      // queryAuditLog issues a COUNT and a SELECT; return rows on the data query,
      // total on the count query.
      { match: (s) => s.includes("COUNT(") && s.toLowerCase().includes("audit"),
        respond: { rows: [{ total: 2 }] } },
      { match: (s) => s.toLowerCase().includes("from audit") || s.includes("audit_log"),
        respond: { rows: [{ id: "A1", action: "x.y", created_at: "2026-01-01" }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log");
    const res = mockRes();
    await handler(mockReq({ query: { limit: "50" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(Array.isArray(res._json.data.items));
    assert.strictEqual(res._json.data.page_size, 50);
  });

  it("500 SERVER_ERROR when queryAuditLog throws", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db gone"); } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── GET /admin/audit-log/recent-changes ───────────────────────────────── */

describe("Admin-Audit — die Mandantengrenze", () => {
  /*
   * DER BEFUND, am 2026-08-21 gegen die laufende Datenbank gemessen:
   *
   * `requireAdmin` laesst jeden mit der ORG-Rolle `owner` oder `admin` durch —
   * das sind **201 von 395 Konten**, davon 142 in Unternehmens- und 59 in
   * Zeitarbeits-Organisationen. Kein einziges gehoert TempConnect.
   *
   * Die drei Audit-Routen dieser Datei uebergaben `org_id: req.query.org_id ||
   * null` an `queryAuditLog`. Ohne Angabe hiess das: **die gesamte Plattform**.
   * Inklusive CSV-Ausfuhr. Owner-Vorgabe: "Firmen duerfen nur Zugang zu den
   * Daten der eigenen Mitarbeiter haben."
   *
   * `/admin/users` machte es laengst richtig — die Audit-Routen hatten die
   * Frage nie gestellt. Diese Proben halten das fest.
   */

  /** Ein Kunden-Admin: Org-Rolle owner, Legacy-Rolle company. Genau die 142+59. */
  const kunde = (extra = {}) => mockReq({
    orgRole: "owner",
    orgId: "org-A",
    orgMembership: { org_id: "org-A", role_key: "owner" },
    session: { userId: "u-kunde", userRole: "company" },
    ...extra,
  });

  function auditPool() {
    return trackingPool([
      { match: (s) => s.includes("COUNT(") && s.toLowerCase().includes("audit"),
        respond: { rows: [{ total: 0 }] } },
      { match: (s) => s.toLowerCase().includes("audit"), respond: { rows: [] } },
    ]);
  }

  it("ein Kunden-Admin liest im Audit-Log nur die eigene Organisation", async () => {
    const pool = auditPool();
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log");
    const res = mockRes();
    await handler(kunde(), res);

    assert.strictEqual(res._status, 200);
    const params = pool.calls.flatMap((c) => c.params);
    assert.ok(params.includes("org-A"),
      "die eigene Org muss als Filter in der Abfrage stehen — sonst laeuft sie plattformweit");
  });

  it("ein Kunden-Admin kann den Umfang mit ?org_id NICHT erweitern", async () => {
    /* Der Angriffsfall. `org_id` aus der Anfrage darf nur verengen, nie oeffnen. */
    const pool = auditPool();
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log");
    const res = mockRes();
    await handler(kunde({ query: { org_id: "org-FREMD" } }), res);

    const params = pool.calls.flatMap((c) => c.params);
    assert.ok(!params.includes("org-FREMD"), "die fremde Org darf die Abfrage nie erreichen");
    assert.ok(params.includes("org-A"), "es bleibt bei der eigenen Org");
  });

  it("die CSV-Ausfuhr ist ebenso begrenzt — sie traegt die Zeilen ausser Haus", async () => {
    const pool = auditPool();
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log/export/csv");
    const res = mockRes();
    await handler(kunde({ query: { org_id: "org-FREMD" } }), res);

    const params = pool.calls.flatMap((c) => c.params);
    assert.ok(params.includes("org-A"), "die Ausfuhr muss auf die eigene Org begrenzt sein");
    assert.ok(!params.includes("org-FREMD"), "die fremde Org darf die Ausfuhr nie erreichen");
  });

  it("recent-changes nimmt fuer Kunden die org-gebundene Fassung", async () => {
    /* `getRecentChangesPlatformWide` ist bewusst so benannt, dass man sie nicht
     * versehentlich trifft (Befund E-5) — sie wurde hier trotzdem fuer jeden
     * `requireAdmin`-Passierer aufgerufen. */
    const pool = trackingPool([{ match: () => true, respond: { rows: [] } }]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log/recent-changes");
    const res = mockRes();
    await handler(kunde({ query: { entity_type: "timesheet", entity_id: "ts-1" } }), res);

    assert.strictEqual(res._status, 200);
    const params = pool.calls.flatMap((c) => c.params);
    assert.ok(params.includes("org-A"), "ohne die eigene Org waere es wieder die Plattformsicht");
  });

  it("ohne Organisationskontext gibt es keine Ersatz-Plattformsicht, sondern 403", async () => {
    /* Fail-closed. Frueher fiel der Aufruf hier auf `null` zurueck — und `null`
     * heisst in `queryAuditLog` "kein Filter", also alles. */
    const pool = auditPool();
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log");
    const res = mockRes();
    await handler(mockReq({
      orgRole: "owner", orgId: null, orgMembership: null,
      session: { userId: "u-ohne-org", userRole: "company" },
    }), res);

    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error.code, "ORG_CONTEXT_REQUIRED");
  });

  it("die Legacy-Rolle owner oeffnet die Plattformsicht nicht mehr", async () => {
    /*
     * `isGlobalAdminScope` liess frueher `session.userRole` in
     * ('platform_admin','admin','owner') plattformweit lesen. Gemessen traegt
     * KEIN Konto einen dieser Werte in `users.role` — ein Tor, das heute
     * niemand passiert und morgen jeder.
     */
    const pool = auditPool();
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log");
    const res = mockRes();
    await handler(mockReq({
      orgRole: null, orgId: null, orgMembership: null,
      session: { userId: "u-legacy", userRole: "owner" },
    }), res);

    assert.strictEqual(res._status, 403, "die Legacy-Rolle darf nicht mehr plattformweit lesen");
    assert.strictEqual(res._json.error.code, "ORG_CONTEXT_REQUIRED");
  });

  it("der platform_admin sieht weiterhin die ganze Plattform", async () => {
    /* Gegenprobe: eine Trennung, die auch die Plattformsicht schliesst, waere
     * keine Reparatur, sondern ein Ausfall. */
    const pool = auditPool();
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log");
    const res = mockRes();
    await handler(mockReq({ orgRole: "platform_admin", query: { org_id: "org-BELIEBIG" } }), res);

    assert.strictEqual(res._status, 200);
    const params = pool.calls.flatMap((c) => c.params);
    assert.ok(params.includes("org-BELIEBIG"),
      "der Plattform-Admin darf weiterhin gezielt jede Org waehlen");
  });
});

describe("GET /admin/audit-log/recent-changes", () => {
  it("400 MISSING_PARAMS when entity_type/entity_id absent", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "get", "/admin/audit-log/recent-changes");
    const res = mockRes();
    await handler(mockReq({ query: {} }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_PARAMS");
  });

  it("200 returns recent changes for entity", async () => {
    const pool = trackingPool([
      { match: () => true, respond: { rows: [{ id: "C1", action: "user.update" }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log/recent-changes");
    const res = mockRes();
    await handler(mockReq({ query: { entity_type: "user", entity_id: "u9", limit: "5" } }), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.data.items));
    assert.strictEqual(res._json.data.items[0].id, "C1");
  });
});

/* ── GET /admin/metrics ────────────────────────────────────────────────── */

describe("GET /admin/metrics", () => {
  it("200 aggregates platform metrics + summary + drilldowns", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM users"), respond: { rows: [{ total: 100, last_30d: 10 }] } },
      { match: (s) => s.includes("FROM organizations WHERE is_active = TRUE"), respond: { rows: [{ total: 12 }] } },
      { match: (s) => s.includes("FROM requisitions GROUP BY status"),
        respond: { rows: [{ status: "OPEN", count: 4 }, { status: "APPROVED", count: 2 }] } },
      { match: (s) => s.includes("FROM offers GROUP BY status"),
        respond: { rows: [{ status: "sent", count: 3 }, { status: "draft", count: 1 }] } },
      { match: (s) => s.includes("FROM capacity_posts WHERE is_active = TRUE"), respond: { rows: [{ active: 7 }] } }
      // eventService.eventCounts queries are unmatched -> []
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/metrics");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.users.total, 100);
    assert.strictEqual(res._json.data.organizations.total, 12);
    assert.strictEqual(res._json.data.requisitions.OPEN, 4);
    assert.strictEqual(res._json.data.offers.sent, 3);
    assert.strictEqual(res._json.data.capacity_posts.active, 7);
    // summary derived: backlog = OPEN(4)+APPROVED(2) = 6; active offers = sent(3)+draft(1) = 4
    assert.strictEqual(res._json.data.summary.requisition_backlog, 6);
    assert.strictEqual(res._json.data.summary.active_offers, 4);
    assert.ok(res._json.data.drilldowns.executive_dashboard);
  });

  it("500 SERVER_ERROR when an aggregate query throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM users"), respond: () => { throw new Error("db"); } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/metrics");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── PATCH /admin/users/:id ────────────────────────────────────────────── */

describe("PATCH /admin/users/:id", () => {
  it("400 INVALID_ID when missing", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/users/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "" }, body: { role: "x" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ID");
  });

  it("400 NO_FIELDS when no allowed field present", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "patch", "/admin/users/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "u9" }, body: { ignored: true } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "NO_FIELDS");
  });

  it("404 NOT_FOUND when update returns no row", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE users SET") && s.includes("RETURNING id, email, role, plan"),
        respond: { rows: [] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/users/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "u9" }, body: { role: "company" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 updates allowed fields + builds dynamic SET clause", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE users SET") && s.includes("RETURNING id, email, role, plan"),
        respond: { rows: [{ id: "u9", email: "a@b.de", role: "company", plan: "PRO", is_verified: true }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/users/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "u9" }, body: { role: "company", is_verified: true } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.id, "u9");
    // values: role, is_verified, then userId last
    const upd = pool.find("UPDATE users SET")[0];
    assert.deepStrictEqual(upd.params, ["company", true, "u9"]);
  });

  it("500 SERVER_ERROR when update throws", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE users SET"), respond: () => { throw new Error("db"); } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "patch", "/admin/users/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "u9" }, body: { role: "company" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── POST /admin/users/:id/deactivate ──────────────────────────────────── */

describe("POST /admin/users/:id/deactivate", () => {
  it("400 INVALID_ID when missing", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "post", "/admin/users/:id/deactivate");
    const res = mockRes();
    await handler(mockReq({ params: { id: "" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ID");
  });

  it("404 NOT_FOUND when user absent", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE users SET is_verified = FALSE, role = 'inactive'"),
        respond: { rows: [] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "post", "/admin/users/:id/deactivate");
    const res = mockRes();
    await handler(mockReq({ params: { id: "u9" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 deactivates user", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("UPDATE users SET is_verified = FALSE, role = 'inactive'"),
        respond: { rows: [{ id: "u9", email: "a@b.de", role: "inactive" }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "post", "/admin/users/:id/deactivate");
    const res = mockRes();
    await handler(mockReq({ params: { id: "u9" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.role, "inactive");
  });
});

/* ── GET /admin/activity-feed ──────────────────────────────────────────── */

describe("GET /admin/activity-feed", () => {
  it("200 returns governance timeline", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("COUNT("), respond: { rows: [{ total: 1 }] } },
      { match: () => true, respond: { rows: [{ id: "F1", action_type: "audit" }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/activity-feed");
    const res = mockRes();
    await handler(mockReq({ orgId: "org-1", query: { limit: "50" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(Array.isArray(res._json.data.items));
    assert.strictEqual(res._json.data.limit, 50);
  });

  it("500 SERVER_ERROR on failure", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("x"); } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/activity-feed");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── GET /admin/activity-feed/action-types ─────────────────────────────── */

describe("GET /admin/activity-feed/action-types", () => {
  it("200 returns the action_types catalog", () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "get", "/admin/activity-feed/action-types");
    const res = mockRes();
    handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(Array.isArray(res._json.data.action_types));
  });
});

/* ── GET /admin/revenue ────────────────────────────────────────────────── */

describe("GET /admin/revenue", () => {
  it("200 returns revenue metrics (dynamic import + pool.query)", async () => {
    // getRevenueMetrics runs several queries; all unmatched -> [] -> zero-fallback.
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "get", "/admin/revenue");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(res._json.data, "metrics payload present");
  });

  // NOTE: the /admin/revenue 500 SERVER_ERROR branch is effectively unreachable in a
  // unit test: getRevenueMetrics (revenueMetricsService.js) wraps every pool.query in
  // its own try/catch and returns zero-fallback Sets/arrays, so a throwing pool never
  // propagates an error up to the route handler's catch. Documented as uncoverable.
});

/* ── GET /admin/system-health ──────────────────────────────────────────── */

describe("GET /admin/system-health", () => {
  it("200 returns diagnostics", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "get", "/admin/system-health");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(res._json.data, "diagnostics payload present");
  });
});

/* ── GET /admin/audit-log/export/csv ───────────────────────────────────── */

describe("GET /admin/audit-log/export/csv", () => {
  it("200 returns CSV attachment", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("COUNT("), respond: { rows: [{ total: 1 }] } },
      { match: () => true, respond: { rows: [{ id: "A1", action: "x.y", created_at: "2026-01-01" }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log/export/csv");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(typeof res._send, "string");
    assert.match(String(res._headers["content-type"] || ""), /text\/csv/i);
    assert.match(String(res._headers["content-disposition"] || ""), /attachment;\s*filename="audit-log-/i);
  });

  it("500 SERVER_ERROR when query throws", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db"); } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/audit-log/export/csv");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── GET /admin/feature-overrides ──────────────────────────────────────── */

describe("GET /admin/feature-overrides", () => {
  it("200 returns override listing", async () => {
    // listOverrides runs pool.query; unmatched -> [] -> zero-fallback shape.
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "get", "/admin/feature-overrides");
    const res = mockRes();
    await handler(mockReq({ query: { limit: "50" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(res._json.data, "override result present");
  });

  it("500 SERVER_ERROR when listOverrides throws", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db"); } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "get", "/admin/feature-overrides");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── PUT /admin/feature-overrides ──────────────────────────────────────── */

describe("PUT /admin/feature-overrides", () => {
  it("400 MISSING_FEATURE_KEY when feature_key absent", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "put", "/admin/feature-overrides");
    const res = mockRes();
    await handler(mockReq({ body: { org_id: "org-1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_FEATURE_KEY");
  });

  it("200 upserts override", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("feature_overrides") && (s.includes("INSERT") || s.includes("ON CONFLICT") || s.includes("UPDATE")),
        respond: { rows: [{ id: 5, feature_key: "kpi_dashboard", enabled: true }] } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "put", "/admin/feature-overrides");
    const res = mockRes();
    await handler(mockReq({ body: { feature_key: "kpi_dashboard", enabled: true } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.id, 5);
  });

  it("500 SERVER_ERROR when upsert throws", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db"); } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "put", "/admin/feature-overrides");
    const res = mockRes();
    await handler(mockReq({ body: { feature_key: "kpi_dashboard" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── DELETE /admin/feature-overrides/:id ───────────────────────────────── */

describe("DELETE /admin/feature-overrides/:id", () => {
  it("400 INVALID_ID for non-numeric id", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "delete", "/admin/feature-overrides/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "abc" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ID");
  });

  it("404 NOT_FOUND when nothing deleted", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("feature_overrides") && s.includes("DELETE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "delete", "/admin/feature-overrides/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "7" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 deletes override", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("feature_overrides") && s.includes("DELETE"),
        respond: { rows: [{ id: 7 }], rowCount: 1 } }
    ]);
    const handler = getHandler(createAdminRouter(makeDeps(pool)), "delete", "/admin/feature-overrides/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "7" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });
});

/* ── GET /admin/feature-keys ───────────────────────────────────────────── */

describe("GET /admin/feature-keys", () => {
  it("200 returns the list of known feature keys", async () => {
    const handler = getHandler(createAdminRouter(makeDeps(trackingPool())), "get", "/admin/feature-keys");
    const res = mockRes();
    handler(mockReq(), res);
    // require() fails in ESM -> falls into the async import() fallback; await a tick.
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(Array.isArray(res._json.data.keys));
    assert.ok(res._json.data.keys.length > 0, "planFeatures keys present");
  });
});
