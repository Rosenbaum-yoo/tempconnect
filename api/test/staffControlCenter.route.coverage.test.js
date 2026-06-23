/**
 * Router-handler coverage for routes/staffControlCenter.js
 * (createStaffControlCenterRouter + createStaffControlAuthRouter).
 *
 * Strategy: the SCC router builds its guards INSIDE the factory
 * (createStaffControlAccessMiddleware / createStaffStepUpMiddleware /
 * requireConfirmAndReason / requireMfa). We do NOT inject guards — we bypass
 * them the same way the repo's requests.route.coverage.test.js /
 * admin.route.coverage.test.js do: invoke ONLY the LAST handler in each route
 * stack. The handlers read req.sccActorId / req.sccStaff / req.sccReason
 * (normally populated by those guards), so the mock req sets them directly.
 *
 * The handlers delegate to real service modules (staffControlService,
 * staffCustomerRequestsService, staffCustomerRequestsService,
 * staffSubscriptionRequestsService, staffCombinedInboxService,
 * staffCustomerOperationsService, orgAccessSuspensionService,
 * staffBillingOverviewService, staffMailCenterService, staffIncidentService,
 * pilotPolicyService, pilotPreregistrationService, searchModerationService,
 * supportVendorAdminService, profileVisibilityService, ratingService,
 * profileBountyService, staffAuditService, subscriptionRequestService, …) that
 * all funnel through pool.query(sql, params). So instead of module-mocking we
 * drive the REAL handler + REAL service code with a SQL-substring-dispatching
 * tracking pool. Audit writes (writeStaffAudit -> INSERT INTO
 * staff_control_audit_log) and unmatched queries degrade to no-ops ({ rows: [] }).
 *
 * Contract per task:
 *  - INLINE res.status().json() -> assert res._status / res._json
 *  - catch -> next(err)         -> assert nextErr instanceof Error
 *    (the error-mapper middleware is NOT mounted, so we never assert res._status
 *     for those branches).
 *
 * Run (cwd = api/):
 *   node --test --test-force-exit test/staffControlCenter.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createStaffControlCenterRouter,
  createStaffControlAuthRouter
} from "../routes/staffControlCenter.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool. `routes` is an ordered list of { match(sql)->bool, respond }.
 * First matching entry wins; unmatched queries return { rows: [], rowCount: 0 }
 * so audit writes / non-critical reads degrade to no-ops. connect() returns a
 * client sharing the same query fn — withTransaction(pool, fn) needs it.
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
    // sccActorId / sccReason / sccStaff are normally set by the bypassed guards.
    sccActorId: "s1",
    sccReason: "valid reason >= 10 chars",
    sccStaff: {
      user_id: "s1",
      email: "staff@tempconnect.test",
      display_name: "Staff One",
      requires_step_up: false
    },
    session: { staffUserId: "s1", userId: "s1", staffStepUpAt: Date.now(), destroy(cb) { cb && cb(); }, save(cb) { cb && cb(); } },
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    get: () => "",
    clearCookie() {},
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
    clearCookie() { return res; },
    send(payload) { res._send = payload; return res; },
    end() { return res; }
  };
  return res;
}

function makeDeps(pool, overrides = {}) {
  return {
    pool,
    logger: mockLogger(),
    sendMail: async () => true,
    ...overrides
  };
}

/** Returns the LAST handler in the route stack (bypasses all guard middleware). */
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

/** Invoke a handler and capture next(err). */
async function invoke(router, method, path, req) {
  const handler = getHandler(router, method, path);
  const res = mockRes();
  let nextErr;
  const next = (e) => { nextErr = e; };
  await handler(req, res, next);
  return { res, nextErr };
}

function router(pool, overrides) {
  return createStaffControlCenterRouter(makeDeps(pool, overrides));
}

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("SCC router — registration", () => {
  it("registers a representative set of routes", () => {
    const r = router(trackingPool());
    const seen = new Set(
      r.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const route of [
      "get /bootstrap",
      "get /pilots",
      "post /pilots/:orgId/extend",
      "get /preregistrations",
      "post /auth/step-up",
      "post /auth/logout",
      "get /customer-requests",
      "get /customer-requests/:id",
      "post /customer-requests/:id/messages",
      "post /customer-requests/:id/transition",
      "get /inbox",
      "post /inbox/bulk",
      "get /inbox/meta",
      "get /staff-access",
      "patch /staff-access/:userId/deactivate",
      "get /support-vendors",
      "post /support-vendors/:id/verify",
      "get /audit",
      "get /subscription-requests",
      "get /customers",
      "post /customers/:orgId/suspend",
      "get /billing/overview",
      "get /incidents",
      "post /incidents",
      "get /support/cases",
      "post /platform/feature-flags",
      "post /hetzner/action",
      "post /audit-decisions",
      "get /marketplace-visibility/snapshot",
      "get /search-moderation/flagged"
    ]) {
      assert.ok(seen.has(route), `missing route: ${route}`);
    }
  });

  it("auth router registers POST /auth/login", () => {
    const authR = createStaffControlAuthRouter(makeDeps(trackingPool()));
    const seen = new Set(
      authR.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    assert.ok(seen.has("post /auth/login"));
  });
});

/* ── GET /bootstrap ────────────────────────────────────────────────────── */

describe("GET /bootstrap", () => {
  it("200 returns staff identity + snapshots", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/bootstrap", mockReq());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.staff.user_id, "s1");
    assert.strictEqual(res._json.data.staff.email, "staff@tempconnect.test");
    assert.ok("executive_summary" in res._json.data);
    assert.ok("platform_summary" in res._json.data);
    assert.ok("hetzner_mode" in res._json.data);
  });
});

/* ── Pilots ────────────────────────────────────────────────────────────── */

describe("Pilots", () => {
  it("GET /pilots — 200 list with total", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM organizations/i.test(s) && /pilot/i.test(s), respond: { rows: [{ id: "o1" }, { id: "o2" }] } }
    ]);
    const { res } = await invoke(router(pool), "get", "/pilots", mockReq());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(Array.isArray(res._json.data.items));
    assert.strictEqual(res._json.data.total, res._json.data.items.length);
  });

  it("GET /pilots — 500 SERVER_ERROR when service throws", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db down"); } }
    ]);
    const { res } = await invoke(router(pool), "get", "/pilots", mockReq());
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });

  it("POST /pilots/:orgId/extend — 404 ORG_NOT_FOUND maps from service code", async () => {
    // pilotPolicy.extendPilotForOrganization throws { code: 'ORG_NOT_FOUND' }
    // when the org row is absent -> handler maps to 404.
    const pool = trackingPool(); // every query -> { rows: [] } => org not found
    const { res } = await invoke(
      router(pool), "post", "/pilots/:orgId/extend",
      mockReq({ params: { orgId: "o-missing" }, body: { months: 2 } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "ORG_NOT_FOUND");
  });

  it("POST /pilots/:orgId/end — 404 ORG_NOT_FOUND maps from service code", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/pilots/:orgId/end",
      mockReq({ params: { orgId: "o-missing" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "ORG_NOT_FOUND");
  });

  it("POST /pilots/:orgId/exception — 404 ORG_NOT_FOUND maps from service code", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/pilots/:orgId/exception",
      mockReq({ params: { orgId: "o-missing" }, body: { allowed: true } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "ORG_NOT_FOUND");
  });
});

/* ── Preregistrations ──────────────────────────────────────────────────── */

describe("Preregistrations", () => {
  it("GET /preregistrations — 200 items + counts", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM pilot_preregistrations/i.test(s) && /SELECT/i.test(s) && !/COUNT/i.test(s), respond: { rows: [{ id: "p1" }] } }
    ]);
    const { res } = await invoke(router(pool), "get", "/preregistrations", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(Array.isArray(res._json.data.items));
    assert.ok("counts" in res._json.data);
  });

  it("POST /preregistrations/:id/status — 400 INVALID_STATUS for bad status", async () => {
    // setPreregStatus rejects unknown status with code INVALID_STATUS.
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/preregistrations/:id/status",
      mockReq({ params: { id: "p1" }, body: { status: "nonsense_status" } })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_STATUS");
  });
});

/* ── Step-up + Logout ──────────────────────────────────────────────────── */

describe("Auth step-up + logout", () => {
  it("POST /auth/step-up — 400 STEP_UP_METHOD_UNSUPPORTED for non-password", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/auth/step-up", mockReq({ body: { method: "totp" } })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "STEP_UP_METHOD_UNSUPPORTED");
  });

  it("POST /auth/step-up — 400 STEP_UP_CREDENTIAL_REQUIRED when password missing", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/auth/step-up", mockReq({ body: { method: "password" } })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "STEP_UP_CREDENTIAL_REQUIRED");
  });

  it("POST /auth/step-up — 401 SCC_STEP_UP_FAILED when user row missing", async () => {
    const pool = trackingPool([
      { match: (s) => /SELECT password_hash FROM users/i.test(s), respond: { rows: [] } }
    ]);
    const { res } = await invoke(
      router(pool), "post", "/auth/step-up", mockReq({ body: { method: "password", password: "pw" } })
    );
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error.code, "SCC_STEP_UP_FAILED");
  });

  it("POST /auth/step-up — 401 SCC_STEP_UP_FAILED on wrong password", async () => {
    // bcrypt.compare("pw", "not-a-hash") resolves false -> wrong_password branch.
    const pool = trackingPool([
      { match: (s) => /SELECT password_hash FROM users/i.test(s), respond: { rows: [{ password_hash: "$2a$10$invalidhashvalueforcomparexxxxxxxxxxxxxxxxxxxxxxxxxxx" }] } }
    ]);
    const { res } = await invoke(
      router(pool), "post", "/auth/step-up", mockReq({ body: { method: "password", password: "wrong" } })
    );
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error.code, "SCC_STEP_UP_FAILED");
  });

  it("POST /auth/logout — 200 success, sets staff session destroy", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "post", "/auth/logout", mockReq());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });
});

/* ── Customer Requests ─────────────────────────────────────────────────── */

describe("Customer Requests", () => {
  it("GET /customer-requests — 200 items", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM strategic_collaboration_requests/i.test(s), respond: { rows: [{ id: "cr1" }] } }
    ]);
    const { res } = await invoke(router(pool), "get", "/customer-requests", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.data.items));
  });

  it("GET /customer-requests/:id — 404 REQUEST_NOT_FOUND when absent", async () => {
    const pool = trackingPool(); // getRequest -> no row -> null
    const { res } = await invoke(
      router(pool), "get", "/customer-requests/:id", mockReq({ params: { id: "missing" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "REQUEST_NOT_FOUND");
  });

  it("POST /customer-requests/:id/messages — 400 MISSING_BODY when body empty", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/customer-requests/:id/messages",
      mockReq({ params: { id: "cr1" }, body: {} })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_BODY");
  });

  it("POST /customer-requests/:id/transition — 400 MISSING_NEXT_STATUS", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/customer-requests/:id/transition",
      mockReq({ params: { id: "cr1" }, body: {} })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_NEXT_STATUS");
  });

  it("POST /customer-requests/:id/transition — 400 REQUEST_NOT_FOUND from service", async () => {
    // transitionStatus -> no current row -> { error: REQUEST_NOT_FOUND } -> 400 inline.
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/customer-requests/:id/transition",
      mockReq({ params: { id: "cr1" }, body: { next_status: "rueckfrage_offen" } })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "REQUEST_NOT_FOUND");
  });

  it("POST /customer-requests/:id/assign — 400 MISSING_ASSIGNEE", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/customer-requests/:id/assign",
      mockReq({ params: { id: "cr1" }, body: {} })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_ASSIGNEE");
  });

  it("GET /customer-requests-meta/statuses — 200 allowed_transitions map", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/customer-requests-meta/statuses", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok(res._json.data.allowed_transitions);
    assert.ok(Array.isArray(res._json.data.allowed_transitions.eingegangen));
  });
});

/* ── Combined Inbox ────────────────────────────────────────────────────── */

describe("Combined Inbox", () => {
  it("GET /inbox — 200 success (aggregates two sources)", async () => {
    const pool = trackingPool(); // empty sources -> zero-state shape
    const { res } = await invoke(router(pool), "get", "/inbox", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(res._json.data);
  });

  it("GET /inbox/meta — 200 static meta (source_types, bulk_operations)", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/inbox/meta", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.data.source_types));
    assert.ok(Array.isArray(res._json.data.bulk_operations));
    assert.strictEqual(res._json.data.bulk_limit, 100);
  });

  it("POST /inbox/bulk — 400 EMPTY_ITEMS / UNSUPPORTED for empty op+items", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/inbox/bulk",
      mockReq({ body: { operation: "", items: [] } })
    );
    assert.strictEqual(res._json.success, false);
    assert.ok(res._status === 400 || res._status === 413);
    assert.ok(res._json.error.code);
  });

  it("GET /inbox/:id — 404 INBOX_ITEM_NOT_FOUND when detail absent", async () => {
    const pool = trackingPool(); // getInboxItemDetail -> null
    const { res } = await invoke(
      router(pool), "get", "/inbox/:id", mockReq({ params: { id: "missing" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "INBOX_ITEM_NOT_FOUND");
  });

  it("GET /inbox/:id — 500 SCC_INTERNAL_ERROR when service throws", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("boom"); } }
    ]);
    const { res } = await invoke(
      router(pool), "get", "/inbox/:id", mockReq({ params: { id: "x" } })
    );
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SCC_INTERNAL_ERROR");
  });

  it("GET /staff-members — 200 members", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM tempconnect_staff/i.test(s), respond: { rows: [{ user_id: "s1" }] } }
    ]);
    const { res } = await invoke(router(pool), "get", "/staff-members", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.data.members));
  });

  it("PATCH /inbox/:id/assign — 400 ASSIGNEE_REQUIRED when missing", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "patch", "/inbox/:id/assign",
      mockReq({ params: { id: "i1" }, body: { source_type: "customer_request" } })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "ASSIGNEE_REQUIRED");
  });

  it("PATCH /inbox/:id/assign — 400 SOURCE_TYPE_REQUIRED when missing", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "patch", "/inbox/:id/assign",
      mockReq({ params: { id: "i1" }, body: { assignee_id: "s2" } })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "SOURCE_TYPE_REQUIRED");
  });
});

/* ── Staff Access ──────────────────────────────────────────────────────── */

describe("Staff Access Management", () => {
  it("GET /staff-access — 200 members", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM tempconnect_staff/i.test(s), respond: { rows: [{ user_id: "s1", email: "a@b" }] } }
    ]);
    const { res } = await invoke(router(pool), "get", "/staff-access", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.data.members));
  });

  it("GET /staff-access — 500 SCC_INTERNAL_ERROR when query throws", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db down"); } }
    ]);
    const { res } = await invoke(router(pool), "get", "/staff-access", mockReq());
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SCC_INTERNAL_ERROR");
  });

  it("PATCH /staff-access/:userId/deactivate — 400 SELF_DEACTIVATE_FORBIDDEN", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "patch", "/staff-access/:userId/deactivate",
      mockReq({ params: { userId: "s1" }, body: { reason: "x" } }) // actorId == userId
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "SCC_SELF_DEACTIVATE_FORBIDDEN");
  });

  it("PATCH /staff-access/:userId/deactivate — 404 SCC_STAFF_NOT_FOUND when 0 rows", async () => {
    const pool = trackingPool([
      { match: (s) => /UPDATE tempconnect_staff SET is_active = FALSE/i.test(s), respond: { rows: [], rowCount: 0 } }
    ]);
    const { res } = await invoke(
      router(pool), "patch", "/staff-access/:userId/deactivate",
      mockReq({ params: { userId: "s2" }, body: { reason: "offboarding" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "SCC_STAFF_NOT_FOUND");
  });

  it("PATCH /staff-access/:userId/deactivate — 200 deactivated when 1 row updated", async () => {
    const pool = trackingPool([
      { match: (s) => /UPDATE tempconnect_staff SET is_active = FALSE/i.test(s), respond: { rows: [], rowCount: 1 } }
    ]);
    const { res } = await invoke(
      router(pool), "patch", "/staff-access/:userId/deactivate",
      mockReq({ params: { userId: "s2" }, body: { reason: "offboarding" } })
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.deactivated, "s2");
  });
});

/* ── Support Vendors ───────────────────────────────────────────────────── */

describe("Support Vendors", () => {
  it("GET /support-vendors — 200 items + total", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM support_vendors/i.test(s), respond: { rows: [{ id: "v1" }, { id: "v2" }] } }
    ]);
    const { res } = await invoke(router(pool), "get", "/support-vendors", mockReq());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, 2);
  });

  it("GET /support-vendors — 500 SERVER_ERROR when service throws", async () => {
    const pool = trackingPool([
      { match: () => true, respond: () => { throw new Error("db"); } }
    ]);
    const { res } = await invoke(router(pool), "get", "/support-vendors", mockReq());
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });

  it("GET /support-vendors/:id — 404 NOT_FOUND when vendor absent", async () => {
    const pool = trackingPool(); // getVendorDetail -> { ok: false }
    const { res } = await invoke(
      router(pool), "get", "/support-vendors/:id", mockReq({ params: { id: "missing" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("POST /support-vendors/:id/verify — 404 when verifyVendor returns not-ok", async () => {
    const pool = trackingPool(); // verifyVendor -> no row -> { ok:false, error:NOT_FOUND }
    const { res } = await invoke(
      router(pool), "post", "/support-vendors/:id/verify", mockReq({ params: { id: "missing" } })
    );
    assert.strictEqual(res._status, 404);
    assert.ok(res._json.error.code);
  });

  it("POST /support-vendors/agents/:agentId/suspend — 404 when not found", async () => {
    const pool = trackingPool(); // suspendAgent -> not ok
    const { res } = await invoke(
      router(pool), "post", "/support-vendors/agents/:agentId/suspend",
      mockReq({ params: { agentId: "missing" } })
    );
    assert.strictEqual(res._status, 404);
    assert.ok(res._json.error.code);
  });
});

/* ── Audit feed + meta ─────────────────────────────────────────────────── */

describe("Audit feed", () => {
  it("GET /audit — 200 items + echoed filters", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM staff_control_audit_log/i.test(s) && /SELECT/i.test(s), respond: { rows: [{ id: "a1" }] } }
    ]);
    const { res } = await invoke(
      router(pool), "get", "/audit", mockReq({ query: { area: "auth", limit: "10" } })
    );
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.data.items));
    assert.strictEqual(res._json.data.filters.area, "auth");
  });
});

/* ── Subscription Requests ─────────────────────────────────────────────── */

describe("Subscription Requests", () => {
  it("GET /subscription-requests — 200 items + counters", async () => {
    const pool = trackingPool(); // empty inbox + counters
    const { res } = await invoke(router(pool), "get", "/subscription-requests", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.ok("items" in res._json.data);
    assert.ok("counters" in res._json.data);
  });

  it("GET /subscription-requests-meta — 200 request_types + allowed_transitions", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/subscription-requests-meta", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.data.request_types));
    assert.ok(Array.isArray(res._json.data.statuses));
    assert.ok(res._json.data.allowed_transitions);
  });

  it("GET /subscription-requests/:id — 404 REQUEST_NOT_FOUND when absent", async () => {
    const pool = trackingPool(); // getInboxDetail -> null
    const { res } = await invoke(
      router(pool), "get", "/subscription-requests/:id", mockReq({ params: { id: "missing" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "REQUEST_NOT_FOUND");
  });

  it("POST /subscription-requests/:id/transition — 400 MISSING_NEXT_STATUS", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/subscription-requests/:id/transition",
      mockReq({ params: { id: "r1" }, body: {} })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_NEXT_STATUS");
  });

  it("POST /subscription-requests/:id/transition — 404 REQUEST_NOT_FOUND from service", async () => {
    const pool = trackingPool(); // transitionStatus -> { ok:false, error: REQUEST_NOT_FOUND }
    const { res } = await invoke(
      router(pool), "post", "/subscription-requests/:id/transition",
      mockReq({ params: { id: "r1" }, body: { next_status: "under_review" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "REQUEST_NOT_FOUND");
  });

  it("POST /subscription-requests/:id/approve — 404 when approveRequest not-ok", async () => {
    const pool = trackingPool(); // approveRequest -> not found
    const { res } = await invoke(
      router(pool), "post", "/subscription-requests/:id/approve",
      mockReq({ params: { id: "r1" } })
    );
    assert.strictEqual(res._status, 404);
    assert.ok(res._json.error.code);
  });

  it("POST /subscription-requests/:id/reject — 404/409 when rejectRequest not-ok", async () => {
    const pool = trackingPool(); // rejectRequest -> not ok
    const { res } = await invoke(
      router(pool), "post", "/subscription-requests/:id/reject",
      mockReq({ params: { id: "r1" } })
    );
    assert.ok(res._status === 404 || res._status === 409);
    assert.ok(res._json.error.code);
  });

  it("POST /subscription-requests/:id/assign — 400 STAFF_USER_ID_REQUIRED", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/subscription-requests/:id/assign",
      mockReq({ params: { id: "r1" }, body: {} })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "STAFF_USER_ID_REQUIRED");
  });

  it("GET /subscription-requests/:id/documents — 200 items list", async () => {
    const pool = trackingPool(); // listForRequest -> []
    const { res } = await invoke(
      router(pool), "get", "/subscription-requests/:id/documents",
      mockReq({ params: { id: "r1" } })
    );
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.data.items));
  });

  it("POST /subscription-requests/:id/documents — 400 DOCUMENT_TYPE_REQUIRED", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/subscription-requests/:id/documents",
      mockReq({ params: { id: "r1" }, body: {} })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "DOCUMENT_TYPE_REQUIRED");
  });

  it("GET /subscription-documents/:id/download — 404 DOCUMENT_NOT_FOUND", async () => {
    const pool = trackingPool(); // getDocument -> null
    const { res } = await invoke(
      router(pool), "get", "/subscription-documents/:id/download",
      mockReq({ params: { id: "d1" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "DOCUMENT_NOT_FOUND");
  });

  it("POST /strategic-requests/:id/convert-to-subscription — 404 when strategic request missing", async () => {
    // linkEnterpriseRequestToSubscription -> STRATEGIC_REQUEST_NOT_FOUND -> 404 inline.
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/strategic-requests/:id/convert-to-subscription",
      mockReq({ params: { id: "missing" }, body: {} })
    );
    assert.ok(res._json.success === false);
    assert.ok(res._status === 404 || res._status === 400);
    assert.ok(res._json.error.code);
  });
});

/* ── Customers (Customer Operations) ───────────────────────────────────── */

describe("Customer Operations", () => {
  it("GET /customers — 200 aggregated roster", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/customers", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("GET /customers-meta — 200 merged meta", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/customers-meta", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok(res._json.data);
  });

  it("GET /customers/:orgId — 404 CUSTOMER_NOT_FOUND when absent", async () => {
    const pool = trackingPool(); // getCustomerDetail -> null
    const { res } = await invoke(
      router(pool), "get", "/customers/:orgId", mockReq({ params: { orgId: "missing" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "CUSTOMER_NOT_FOUND");
  });

  it("POST /customers/:orgId/suspend — 404 ORG_NOT_FOUND when service not-ok", async () => {
    // suspendOrgAccess -> { ok:false, error: ORG_NOT_FOUND } -> 404 inline + error audit.
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/customers/:orgId/suspend",
      mockReq({ params: { orgId: "missing" }, body: { kind: "billing" } })
    );
    assert.ok(res._json.success === false);
    assert.ok([404, 409, 400].includes(res._status));
    assert.ok(res._json.error.code);
  });

  it("POST /customers/:orgId/reactivate — error path returns failure code", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/customers/:orgId/reactivate",
      mockReq({ params: { orgId: "missing" } })
    );
    assert.ok(res._json.success === false);
    assert.ok([404, 409, 400].includes(res._status));
    assert.ok(res._json.error.code);
  });
});

/* ── Billing / Mail overview ───────────────────────────────────────────── */

describe("Billing + Mail overview", () => {
  it("GET /billing/overview — 200 aggregated", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/billing/overview", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("GET /billing/meta — 200 static meta", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/billing/meta", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok(res._json.data);
  });

  it("GET /mail/overview — 200 aggregated", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/mail/overview", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("GET /mail/meta — 200 static meta", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/mail/meta", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok(res._json.data);
  });
});

/* ── Incidents ─────────────────────────────────────────────────────────── */

describe("Incidents", () => {
  it("GET /incidents — 200 aggregated", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/incidents", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("GET /incidents/meta — 200 static meta", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/incidents/meta", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok(res._json.data);
  });

  it("GET /incidents/signals — 200 open signals", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/incidents/signals", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("POST /incidents — 400 when openIncident not-ok (missing title/severity)", async () => {
    // openIncident validates payload and returns { ok:false } for invalid input.
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/incidents", mockReq({ body: {} })
    );
    assert.strictEqual(res._status, 400);
    assert.ok(res._json.error.code);
  });

  it("POST /incidents/:id/acknowledge — 404 INCIDENT_NOT_FOUND when absent", async () => {
    const pool = trackingPool(); // acknowledgeIncident -> not found
    const { res } = await invoke(
      router(pool), "post", "/incidents/:id/acknowledge", mockReq({ params: { id: "missing" } })
    );
    assert.ok(res._json.success === false);
    assert.ok([404, 409, 400].includes(res._status));
    assert.ok(res._json.error.code);
  });

  it("POST /incidents/:id/resolve — error path returns failure code", async () => {
    const pool = trackingPool(); // resolveIncident -> not found
    const { res } = await invoke(
      router(pool), "post", "/incidents/:id/resolve",
      mockReq({ params: { id: "missing" }, body: { resolution_note: "n" } })
    );
    assert.ok(res._json.success === false);
    assert.ok([404, 409, 400].includes(res._status));
    assert.ok(res._json.error.code);
  });
});

/* ── Support cases ─────────────────────────────────────────────────────── */

describe("Support cases", () => {
  it("GET /support/cases — 200 items + total + clamped pagination", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM\s+support_cases sc/i.test(s) && /LEFT JOIN/i.test(s), respond: { rows: [{ id: "sc1" }] } },
      { match: (s) => /COUNT\(\*\)::int AS total FROM support_cases/i.test(s), respond: { rows: [{ total: 1 }] } }
    ]);
    const { res } = await invoke(
      router(pool), "get", "/support/cases", mockReq({ query: { limit: "999", offset: "-5" } })
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.limit, 100); // clamped down from 999
    assert.strictEqual(res._json.data.offset, 0);  // clamped up from -5
    assert.strictEqual(res._json.data.total, 1);
  });

  it("GET /support/cases — 500 SCC_INTERNAL_ERROR when query throws", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM\s+support_cases sc/i.test(s), respond: () => { throw new Error("db"); } }
    ]);
    const { res } = await invoke(router(pool), "get", "/support/cases", mockReq({ query: {} }));
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SCC_INTERNAL_ERROR");
  });

  it("GET /support/cases/:id — 404 SUPPORT_CASE_NOT_FOUND when absent", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM\s+support_cases sc/i.test(s), respond: { rows: [] } }
    ]);
    const { res } = await invoke(
      router(pool), "get", "/support/cases/:id", mockReq({ params: { id: "missing" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "SUPPORT_CASE_NOT_FOUND");
  });

  it("GET /support/cases/:id — 200 detail with notes + escalations", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM\s+support_cases sc/i.test(s) && /sc\.\*/.test(s), respond: { rows: [{ id: "sc1", subject: "x" }] } },
      { match: (s) => /FROM\s+support_case_notes/i.test(s), respond: { rows: [{ id: "n1" }] } },
      { match: (s) => /FROM\s+support_escalations/i.test(s), respond: { rows: [{ id: "e1" }] } }
    ]);
    const { res } = await invoke(
      router(pool), "get", "/support/cases/:id", mockReq({ params: { id: "sc1" } })
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.id, "sc1");
    assert.strictEqual(res._json.data.notes.length, 1);
    assert.strictEqual(res._json.data.escalations.length, 1);
  });
});

/* ── Read-only aggregation snapshots ───────────────────────────────────── */

describe("Read-only snapshots", () => {
  for (const path of ["/executive", "/platform", "/support", "/operations", "/revenue", "/risk-trust"]) {
    it(`GET ${path} — 200 success`, async () => {
      const pool = trackingPool();
      const { res } = await invoke(router(pool), "get", path, mockReq());
      assert.strictEqual(res._status, 200);
      assert.strictEqual(res._json.success, true);
    });
  }

  it("GET /hetzner — 200 overview (mock mode default)", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/hetzner", mockReq());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("GET /data-explorer — 200 views list", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/data-explorer", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.data.views));
  });

  it("GET /data-explorer/:key — 404 VIEW_NOT_FOUND for unknown key", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "get", "/data-explorer/:key", mockReq({ params: { key: "no-such-view" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "VIEW_NOT_FOUND");
  });

  it("GET /automation — 200 runbooks + safe_actions", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/automation", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok("runbooks" in res._json.data);
    assert.ok("safe_actions" in res._json.data);
  });

  it("GET /audit-decisions — 200 snapshot + audit", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/audit-decisions", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.ok("snapshot" in res._json.data);
    assert.ok("audit" in res._json.data);
  });
});

/* ── Risk/Trust drilldowns ─────────────────────────────────────────────── */

describe("Risk/Trust drilldowns", () => {
  it("GET /risk-trust/dsgvo-requests — 200 items + total", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM\s+data_governance_requests dgr/i.test(s), respond: { rows: [{ id: "dgr1" }] } },
      { match: (s) => /COUNT\(\*\)::int AS total FROM data_governance_requests/i.test(s), respond: { rows: [{ total: 1 }] } }
    ]);
    const { res } = await invoke(
      router(pool), "get", "/risk-trust/dsgvo-requests", mockReq({ query: {} })
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, 1);
    assert.strictEqual(res._json.data.items.length, 1);
  });

  it("GET /risk-trust/dsgvo-requests — 500 when query throws", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM\s+data_governance_requests dgr/i.test(s), respond: () => { throw new Error("db"); } }
    ]);
    const { res } = await invoke(router(pool), "get", "/risk-trust/dsgvo-requests", mockReq({ query: {} }));
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SCC_INTERNAL_ERROR");
  });

  it("GET /risk-trust/compliance-docs — 200 items + total", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM\s+compliance_documents cd/i.test(s), respond: { rows: [{ id: "cd1" }] } },
      { match: (s) => /COUNT\(\*\)::int AS total FROM compliance_documents/i.test(s), respond: { rows: [{ total: 1 }] } }
    ]);
    const { res } = await invoke(
      router(pool), "get", "/risk-trust/compliance-docs", mockReq({ query: {} })
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, 1);
  });
});

/* ── Mutating platform/hetzner/automation/decisions ────────────────────── */

describe("Mutating platform/hetzner/automation/decisions", () => {
  it("POST /platform/feature-flags — 400 INVALID_FLAG_PAYLOAD when bad body", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/platform/feature-flags", mockReq({ body: { flag_key: "x" } }) // enabled not boolean
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_FLAG_PAYLOAD");
  });

  it("POST /platform/feature-flags — 404 FLAG_NOT_FOUND when flag absent", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM staff_control_feature_flags WHERE flag_key/i.test(s), respond: { rows: [] } }
    ]);
    const { res } = await invoke(
      router(pool), "post", "/platform/feature-flags",
      mockReq({ body: { flag_key: "unknown.flag", enabled: true } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "FLAG_NOT_FOUND");
  });

  it("POST /platform/feature-flags — 400 SCC_TYPED_CONFIRMATION_REQUIRED for critical flag", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM staff_control_feature_flags WHERE flag_key/i.test(s), respond: { rows: [{ flag_key: "platform.read_only_mode", risk_level: "critical" }] } }
    ]);
    const { res } = await invoke(
      router(pool), "post", "/platform/feature-flags",
      mockReq({ body: { flag_key: "platform.read_only_mode", enabled: true } }) // no typed_confirmation
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "SCC_TYPED_CONFIRMATION_REQUIRED");
    assert.strictEqual(res._json.error.expected_hint, "READ ONLY ON");
  });

  it("POST /platform/feature-flags — 200 sets low-risk flag (no typed confirmation)", async () => {
    const pool = trackingPool([
      { match: (s) => /FROM staff_control_feature_flags WHERE flag_key/i.test(s), respond: { rows: [{ flag_key: "some.low", risk_level: "medium" }] } },
      { match: (s) => /UPDATE staff_control_feature_flags/i.test(s), respond: { rows: [], rowCount: 1 } }
    ]);
    const { res } = await invoke(
      router(pool), "post", "/platform/feature-flags",
      mockReq({ body: { flag_key: "some.low", enabled: false } })
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.flag_key, "some.low");
    assert.strictEqual(res._json.data.enabled, false);
    // UPDATE issued with enabled + actor + reason
    const upd = pool.find("UPDATE staff_control_feature_flags")[0];
    assert.ok(upd);
    assert.strictEqual(upd.params[0], false);
    assert.strictEqual(upd.params[1], "s1");
  });

  it("POST /hetzner/action — 400 MISSING_ACTION_KEY when absent", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "post", "/hetzner/action", mockReq({ body: {} }));
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_ACTION_KEY");
  });

  it("POST /automation/run — 400 MISSING_RUNBOOK_KEY when absent", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "post", "/automation/run", mockReq({ body: {} }));
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_RUNBOOK_KEY");
  });

  it("POST /audit-decisions — 400 MISSING_DECISION_FIELDS when incomplete", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/audit-decisions", mockReq({ body: { area: "ops" } }) // no title/decision
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_DECISION_FIELDS");
  });

  it("POST /audit-decisions — 200 records decision + returns id", async () => {
    const pool = trackingPool([
      { match: (s) => /INSERT INTO staff_control_decisions/i.test(s), respond: { rows: [{ id: "dec1", confirmed_at: "2026-06-23T00:00:00Z" }] } }
    ]);
    const { res } = await invoke(
      router(pool), "post", "/audit-decisions",
      mockReq({ body: { area: "ops", title: "T", decision: "D" } })
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.id, "dec1");
    const ins = pool.find("INSERT INTO staff_control_decisions")[0];
    assert.ok(ins);
  });

  it("PATCH /audit-decisions/:id/revert — 404 DECISION_NOT_FOUND when absent", async () => {
    const pool = trackingPool([
      { match: (s) => /SELECT id, title, area, reversible, reverted_at FROM staff_control_decisions/i.test(s), respond: { rows: [] } }
    ]);
    const { res } = await invoke(
      router(pool), "patch", "/audit-decisions/:id/revert", mockReq({ params: { id: "missing" } })
    );
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "DECISION_NOT_FOUND");
  });

  it("PATCH /audit-decisions/:id/revert — 409 DECISION_NOT_REVERSIBLE", async () => {
    const pool = trackingPool([
      { match: (s) => /SELECT id, title, area, reversible, reverted_at FROM staff_control_decisions/i.test(s), respond: { rows: [{ id: "d1", reversible: false, reverted_at: null }] } }
    ]);
    const { res } = await invoke(
      router(pool), "patch", "/audit-decisions/:id/revert", mockReq({ params: { id: "d1" } })
    );
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error.code, "DECISION_NOT_REVERSIBLE");
  });

  it("PATCH /audit-decisions/:id/revert — 409 DECISION_ALREADY_REVERTED", async () => {
    const pool = trackingPool([
      { match: (s) => /SELECT id, title, area, reversible, reverted_at FROM staff_control_decisions/i.test(s), respond: { rows: [{ id: "d1", reversible: true, reverted_at: "2026-06-01" }] } }
    ]);
    const { res } = await invoke(
      router(pool), "patch", "/audit-decisions/:id/revert", mockReq({ params: { id: "d1" } })
    );
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error.code, "DECISION_ALREADY_REVERTED");
  });

  it("PATCH /audit-decisions/:id/revert — 200 reverts reversible decision", async () => {
    const pool = trackingPool([
      { match: (s) => /SELECT id, title, area, reversible, reverted_at FROM staff_control_decisions/i.test(s), respond: { rows: [{ id: "d1", title: "T", area: "ops", reversible: true, reverted_at: null }] } },
      { match: (s) => /UPDATE staff_control_decisions SET reverted_at = NOW\(\)/i.test(s), respond: { rows: [{ reverted_at: "2026-06-23T00:00:00Z" }] } }
    ]);
    const { res } = await invoke(
      router(pool), "patch", "/audit-decisions/:id/revert", mockReq({ params: { id: "d1" } })
    );
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.id, "d1");
    assert.ok(res._json.data.reverted_at);
  });
});

/* ── Marketplace Visibility Center ─────────────────────────────────────── */

describe("Marketplace Visibility", () => {
  it("GET /marketplace-visibility/snapshot — 200 aggregated counts", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/marketplace-visibility/snapshot", mockReq());
    assert.strictEqual(res._status, 200);
    assert.ok("pending_submissions" in res._json.data);
    assert.ok("approved_profiles" in res._json.data);
  });

  it("GET /marketplace-visibility/pending — 200 list", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/marketplace-visibility/pending", mockReq());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("GET /marketplace-visibility/moderation-queue — 200 list", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/marketplace-visibility/moderation-queue", mockReq());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("GET /marketplace-visibility/bounties — 200 list", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/marketplace-visibility/bounties", mockReq());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("GET /marketplace-visibility/abuse-reports — 200 list", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/marketplace-visibility/abuse-reports", mockReq());
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("POST /marketplace-visibility/:orgId/approve — 400 when service not-ok", async () => {
    // approveVisibility on a non-existent org -> { ok:false, reason } -> 400 inline.
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/marketplace-visibility/:orgId/approve",
      mockReq({ params: { orgId: "missing" } })
    );
    assert.strictEqual(res._json.success, false);
    assert.ok(res._status === 400 || res._status === 500);
    assert.ok(res._json.error.code !== undefined);
  });

  it("POST /marketplace-visibility/ratings/:id/approve — failure path returns error", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/marketplace-visibility/ratings/:id/approve",
      mockReq({ params: { id: "missing" } })
    );
    assert.strictEqual(res._json.success, false);
    assert.ok(res._status === 400 || res._status === 500);
  });

  it("POST /marketplace-visibility/bounties/:id/approve — failure path returns error", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/marketplace-visibility/bounties/:id/approve",
      mockReq({ params: { id: "missing" }, body: {} })
    );
    assert.strictEqual(res._json.success, false);
    assert.ok(res._status === 400 || res._status === 500);
  });

  it("POST /marketplace-visibility/abuse-reports/:id/resolve — failure path returns error", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/marketplace-visibility/abuse-reports/:id/resolve",
      mockReq({ params: { id: "missing" } })
    );
    assert.strictEqual(res._json.success, false);
    assert.ok(res._status === 400 || res._status === 500);
  });
});

/* ── Document Vault + Data Governance ──────────────────────────────────── */

describe("Document Vault + Data Governance", () => {
  it("GET /document-vault/overview — 200 aggregated", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/document-vault/overview", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("GET /data-governance/requests — 200 requests + counts", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/data-governance/requests", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.ok("requests" in res._json.data);
    assert.ok("counts" in res._json.data);
  });

  it("GET /data-governance/requests.csv — 200 CSV attachment", async () => {
    const pool = trackingPool(); // no rows -> header-only CSV
    const { res } = await invoke(router(pool), "get", "/data-governance/requests.csv", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(typeof res._send, "string");
    assert.match(String(res._headers["content-type"] || ""), /text\/csv/i);
    assert.match(String(res._headers["content-disposition"] || ""), /attachment;\s*filename="dsgvo-anfragen\.csv"/i);
  });
});

/* ── Search Moderation ─────────────────────────────────────────────────── */

describe("Search Moderation", () => {
  it("GET /search-moderation/flagged — 200 list", async () => {
    const pool = trackingPool();
    const { res } = await invoke(router(pool), "get", "/search-moderation/flagged", mockReq({ query: {} }));
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
  });

  it("POST /search-moderation/flagged/:id/resolve — 400 INVALID_ACTION for bad action", async () => {
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/search-moderation/flagged/:id/resolve",
      mockReq({ params: { id: "f1" }, body: { action: "nope" } })
    );
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "INVALID_ACTION");
  });

  it("POST /search-moderation/flagged/:id/resolve — 404 NOT_FOUND from service", async () => {
    // valid action but flag row absent -> resolveFlaggedQuery -> { ok:false, error: NOT_FOUND } -> 404.
    const pool = trackingPool();
    const { res } = await invoke(
      router(pool), "post", "/search-moderation/flagged/:id/resolve",
      mockReq({ params: { id: "missing" }, body: { action: "dismiss" } })
    );
    assert.ok(res._json.success === false);
    assert.ok(res._status === 404 || res._status === 400);
    assert.ok(res._json.error.code);
  });
});

/* ── Auth router (login) ───────────────────────────────────────────────── */

describe("Auth router — POST /auth/login", () => {
  function authRouter(pool) {
    return createStaffControlAuthRouter(makeDeps(pool));
  }

  it("400 MISSING_CREDENTIALS when email/password absent", async () => {
    const pool = trackingPool();
    const { res } = await invoke(authRouter(pool), "post", "/auth/login", mockReq({ body: {} }));
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_CREDENTIALS");
  });

  it("401 SCC_LOGIN_FAILED when user not in tempconnect_staff", async () => {
    const pool = trackingPool([
      { match: (s) => /JOIN tempconnect_staff/i.test(s), respond: { rows: [] } }
    ]);
    const { res } = await invoke(
      authRouter(pool), "post", "/auth/login",
      mockReq({ body: { email: "x@y.de", password: "pw" } })
    );
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error.code, "SCC_LOGIN_FAILED");
  });

  it("401 SCC_LOGIN_FAILED on wrong password", async () => {
    const pool = trackingPool([
      { match: (s) => /JOIN tempconnect_staff/i.test(s), respond: { rows: [{ id: "s1", email: "x@y.de", password_hash: "$2a$10$invalidhashvalueforcomparexxxxxxxxxxxxxxxxxxxxxxxxxxx" }] } }
    ]);
    const { res } = await invoke(
      authRouter(pool), "post", "/auth/login",
      mockReq({ body: { email: "x@y.de", password: "wrong" } })
    );
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error.code, "SCC_LOGIN_FAILED");
  });
});
