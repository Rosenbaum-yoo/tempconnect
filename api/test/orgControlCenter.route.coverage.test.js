/**
 * Router-handler coverage for routes/orgControlCenter.js (createOrgControlCenterRouter).
 *
 * The factory destructures { pool, requireAuth, logger }. The guard middlewares
 * (requirePermission / requireRole / requireOrgFeature / requireOrgLimit) are real
 * static imports — but the harness invokes only the LAST handler in each route
 * stack, so those guards are bypassed (same idiom as reporting.route.test.js).
 *
 * ALL handlers use inline res.status().json() (no central error-mapper / next(err)
 * paths), so we assert res._status / res._json directly. Special branches:
 *  - ensureOrg: req.orgId missing -> 400 ORG_REQUIRED
 *  - member role/update handlers: err.status -> res.status(err.status)
 *  - department/scope handlers: OrgBoundaryError -> 403
 *  - invite/accept handlers: inviteErrStatus mapping on service throw
 *
 * Service modules (orgService, apiKeyService, integrationService, settingsService,
 * billingMetricsService, auditLog, orgInviteService, emailService) are real static
 * imports and NOT injectable. They all funnel through pool.query, so we drive the
 * real service code with a SQL-substring-dispatching tracking pool. Where a service
 * call result is unobservable via the handler response (audit-only), we assert the
 * observable response shape instead.
 *
 * Run: node --test --test-force-exit test/orgControlCenter.route.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOrgControlCenterRouter } from "../routes/orgControlCenter.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/**
 * Tracking pool. `routes` is an ordered list of { match(sql)->bool, respond }.
 * First match wins; unmatched queries return { rows: [], rowCount: 0 }.
 * connect() is mandatory for withTransaction(pool, fn).
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
    user: { id: "u1" },
    orgId: "org-1",
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
  return {
    pool,
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next()
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

function build(routes = []) {
  const pool = trackingPool(routes);
  const router = createOrgControlCenterRouter(makeDeps(pool));
  return { pool, router };
}

/* ── Router shape ──────────────────────────────────────────────────────── */

describe("orgControlCenter router — registration", () => {
  it("registers all expected routes", () => {
    const { router } = build();
    const seen = new Set(
      router.stack.filter((l) => l.route)
        .map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const r of [
      "get /org/overview",
      "get /org/members",
      "patch /org/members/:userId",
      "delete /org/members/:userId",
      "post /org/members/invite",
      "get /org/invitations",
      "delete /org/invitations/:id",
      "get /org/invitations/lookup",
      "post /org/invitations/accept",
      "get /org/api-keys",
      "post /org/api-keys",
      "delete /org/api-keys/:id",
      "post /org/api-keys/:id/rotate",
      "get /org/api-keys/scopes",
      "get /org/webhooks",
      "get /org/audit-log",
      "get /org/usage",
      "get /org/security",
      "patch /org/security",
      "get /org/locations",
      "post /org/locations",
      "patch /org/locations/:locId",
      "delete /org/locations/:locId",
      "get /org/departments",
      "post /org/departments",
      "patch /org/departments/:deptId",
      "delete /org/departments/:deptId",
      "patch /org/members/:membershipId/role",
      "patch /org/members/:membershipId/scope",
      "get /org/roles-permissions"
    ]) {
      assert.ok(seen.has(r), `missing route: ${r}`);
    }
  });

  it("ensureOrg returns 400 ORG_REQUIRED when req.orgId is missing", async () => {
    // ensureOrg is the 2nd middleware; invoke it directly via the route stack.
    const { router } = build();
    let ensureOrg = null;
    for (const layer of router.stack) {
      if (layer.route && layer.route.path === "/org/overview") {
        ensureOrg = layer.route.stack[1].handle; // [requireAuth, ensureOrg, rperm, handler]
      }
    }
    assert.ok(ensureOrg, "ensureOrg middleware found");
    const res = mockRes();
    let nexted = false;
    ensureOrg(mockReq({ orgId: undefined }), res, () => { nexted = true; });
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "ORG_REQUIRED");
    assert.strictEqual(nexted, false);
  });
});

/* ── OVERVIEW ──────────────────────────────────────────────────────────── */

describe("GET /org/overview", () => {
  it("404 NOT_FOUND when org missing", async () => {
    // getOrganization -> first SELECT in Promise.all returns no rows
    const { pool, router } = build([
      { match: (s) => s.includes("FROM organizations") || s.includes("FROM orgs"), respond: { rows: [] } }
    ]);
    const handler = getHandler(router, "get", "/org/overview");
    const res = mockRes();
    await handler(mockReq(), res);
    // org null -> 404 (members/integrations/apiKeyCount all default to empty)
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
    assert.ok(pool.calls.length >= 1);
  });

  it("500 SERVER_ERROR when a query throws", async () => {
    const { router } = build([
      { match: () => true, respond: () => { throw new Error("db down"); } }
    ]);
    const handler = getHandler(router, "get", "/org/overview");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── MEMBERS list ──────────────────────────────────────────────────────── */

describe("GET /org/members", () => {
  it("200 returns items + total", async () => {
    const { router } = build([
      { match: (s) => /FROM\s+(org_memberships|memberships|users)/i.test(s), respond: { rows: [{ id: "m1" }, { id: "m2" }] } }
    ]);
    const handler = getHandler(router, "get", "/org/members");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok(Array.isArray(res._json.data.items));
    assert.strictEqual(res._json.data.total, res._json.data.items.length);
  });

  it("500 SERVER_ERROR when service throws", async () => {
    const { router } = build([
      { match: () => true, respond: () => { throw new Error("boom"); } }
    ]);
    const handler = getHandler(router, "get", "/org/members");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── PATCH /org/members/:userId ────────────────────────────────────────── */

describe("PATCH /org/members/:userId", () => {
  it("400 VALIDATION for invalid role_key", async () => {
    const { router } = build();
    const handler = getHandler(router, "patch", "/org/members/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: "u9" }, body: { role_key: "not-a-role" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
  });

  it("404 NOT_FOUND when updateMemberRole returns falsy", async () => {
    // updateMemberRole UPDATE returns no rows -> null
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "patch", "/org/members/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: "u9" }, body: { role_key: "admin" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 + audit when role updated", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "mem-1", role_key: "admin" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "patch", "/org/members/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: "u9" }, body: { role_key: "admin" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res.locals.audit.action, "org.member.role_change");
    assert.strictEqual(res.locals.audit.entity_id, "u9");
    assert.strictEqual(res.locals.audit.details.new_role, "admin");
  });

  it("maps err.status to that status", async () => {
    const e = new Error("forbidden role"); e.status = 409; e.code = "ROLE_CONFLICT";
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: () => { throw e; } }
    ]);
    const handler = getHandler(router, "patch", "/org/members/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: "u9" }, body: { role_key: "admin" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error.code, "ROLE_CONFLICT");
  });

  it("500 SERVER_ERROR for generic throw", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: () => { throw new Error("db"); } }
    ]);
    const handler = getHandler(router, "patch", "/org/members/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: "u9" }, body: { role_key: "admin" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── DELETE /org/members/:userId ───────────────────────────────────────── */

describe("DELETE /org/members/:userId", () => {
  it("404 NOT_FOUND when deactivateMember falsy", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "delete", "/org/members/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: "u9" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 removed + audit", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "mem-1" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "delete", "/org/members/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: "u9" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.removed, true);
    assert.strictEqual(res.locals.audit.action, "org.member.remove");
  });

  it("maps err.status", async () => {
    const e = new Error("cannot remove owner"); e.status = 422; e.code = "CANNOT_REMOVE_OWNER";
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: () => { throw e; } }
    ]);
    const handler = getHandler(router, "delete", "/org/members/:userId");
    const res = mockRes();
    await handler(mockReq({ params: { userId: "u9" } }), res);
    assert.strictEqual(res._status, 422);
    assert.strictEqual(res._json.error.code, "CANNOT_REMOVE_OWNER");
  });
});

/* ── POST /org/members/invite ──────────────────────────────────────────── */

describe("POST /org/members/invite", () => {
  it("400 VALIDATION for malformed email", async () => {
    const { router } = build();
    const handler = getHandler(router, "post", "/org/members/invite");
    const res = mockRes();
    await handler(mockReq({ body: { email: "not-an-email" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
  });

  it("maps service error (ALREADY_MEMBER) to 409", async () => {
    // createInvite throws "ALREADY_MEMBER" -> inviteErrStatus[ALREADY_MEMBER]=409
    const { router } = build([
      { match: () => true, respond: () => { throw new Error("ALREADY_MEMBER"); } }
    ]);
    const handler = getHandler(router, "post", "/org/members/invite");
    const res = mockRes();
    await handler(mockReq({ body: { email: "new@x.de", role_key: "member" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error.code, "ALREADY_MEMBER");
  });

  it("500 SERVER_ERROR for unmapped service error", async () => {
    const { router } = build([
      { match: () => true, respond: () => { throw new Error("unexpected db"); } }
    ]);
    const handler = getHandler(router, "post", "/org/members/invite");
    const res = mockRes();
    await handler(mockReq({ body: { email: "new@x.de" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── GET /org/invitations ──────────────────────────────────────────────── */

describe("GET /org/invitations", () => {
  it("200 items + total", async () => {
    const { router } = build([
      { match: (s) => s.includes("SELECT"), respond: { rows: [{ id: "inv1" }] } }
    ]);
    const handler = getHandler(router, "get", "/org/invitations");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, res._json.data.items.length);
  });

  it("500 SERVER_ERROR on throw", async () => {
    const { router } = build([
      { match: () => true, respond: () => { throw new Error("x"); } }
    ]);
    const handler = getHandler(router, "get", "/org/invitations");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

/* ── DELETE /org/invitations/:id ───────────────────────────────────────── */

describe("DELETE /org/invitations/:id", () => {
  it("404 NOT_FOUND when revokeInvite falsy", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE") || s.includes("DELETE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "delete", "/org/invitations/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "inv9" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 revoked + audit", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE") || s.includes("DELETE"), respond: { rows: [{ id: "inv9" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "delete", "/org/invitations/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "inv9" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.revoked, true);
    assert.strictEqual(res.locals.audit.action, "org.member.invite_revoke");
  });
});

/* ── GET /org/invitations/lookup ───────────────────────────────────────── */

describe("GET /org/invitations/lookup", () => {
  it("404 INVITE_INVALID when token has no invite", async () => {
    const { router } = build([
      { match: (s) => s.includes("SELECT"), respond: { rows: [] } }
    ]);
    const handler = getHandler(router, "get", "/org/invitations/lookup");
    const res = mockRes();
    await handler(mockReq({ query: { token: "bad" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "INVITE_INVALID");
  });

  it("200 returns invite metadata", async () => {
    const { router } = build([
      { match: (s) => s.includes("SELECT"), respond: { rows: [{ org_name: "ACME", email: "a@x.de", role_key: "member", expires_at: "2026-12-31" }] } }
    ]);
    const handler = getHandler(router, "get", "/org/invitations/lookup");
    const res = mockRes();
    await handler(mockReq({ query: { token: "tok" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.org_name, "ACME");
    assert.strictEqual(res._json.data.role_key, "member");
  });
});

/* ── POST /org/invitations/accept ──────────────────────────────────────── */

describe("POST /org/invitations/accept", () => {
  it("400 MISSING_TOKEN when token absent", async () => {
    const { router } = build();
    const handler = getHandler(router, "post", "/org/invitations/accept");
    const res = mockRes();
    await handler(mockReq({ body: {} }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "MISSING_TOKEN");
  });

  it("maps service error (EMAIL_MISMATCH) to 403", async () => {
    // first query (SELECT email FROM users) returns a row, acceptInvite throws EMAIL_MISMATCH
    const { router } = build([
      { match: (s) => s.includes("SELECT email FROM users"), respond: { rows: [{ email: "me@x.de" }] } },
      { match: () => true, respond: () => { throw new Error("EMAIL_MISMATCH"); } }
    ]);
    const handler = getHandler(router, "post", "/org/invitations/accept");
    const res = mockRes();
    await handler(mockReq({ body: { token: "tok" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error.code, "EMAIL_MISMATCH");
  });

  it("500 SERVER_ERROR for unmapped error", async () => {
    const { router } = build([
      { match: (s) => s.includes("SELECT email FROM users"), respond: { rows: [{ email: "me@x.de" }] } },
      { match: () => true, respond: () => { throw new Error("weird"); } }
    ]);
    const handler = getHandler(router, "post", "/org/invitations/accept");
    const res = mockRes();
    await handler(mockReq({ body: { token: "tok" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

/* ── API KEYS ──────────────────────────────────────────────────────────── */

describe("GET /org/api-keys", () => {
  it("200 items + total", async () => {
    const { router } = build([
      { match: (s) => s.includes("SELECT"), respond: { rows: [{ id: "k1" }] } }
    ]);
    const handler = getHandler(router, "get", "/org/api-keys");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, res._json.data.items.length);
  });

  it("500 SERVER_ERROR on throw", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "get", "/org/api-keys");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

describe("POST /org/api-keys", () => {
  it("400 VALIDATION for invalid scope", async () => {
    const { router } = build();
    const handler = getHandler(router, "post", "/org/api-keys");
    const res = mockRes();
    await handler(mockReq({ body: { scopes: ["__definitely_not_a_scope__"] } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
  });

  it("500 SERVER_ERROR when createApiKey throws", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "post", "/org/api-keys");
    const res = mockRes();
    await handler(mockReq({ body: { label: "CI" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

describe("DELETE /org/api-keys/:id", () => {
  it("404 NOT_FOUND when revoke falsy", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE") || s.includes("DELETE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "delete", "/org/api-keys/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "k9" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 revoked + audit", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE") || s.includes("DELETE"), respond: { rows: [{ id: "k9" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "delete", "/org/api-keys/:id");
    const res = mockRes();
    await handler(mockReq({ params: { id: "k9" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.revoked, true);
    assert.strictEqual(res.locals.audit.action, "org.api_key.revoke");
  });
});

describe("POST /org/api-keys/:id/rotate", () => {
  it("404 NOT_FOUND when rotate returns falsy", async () => {
    // rotateApiKey returns null when key not found; force all queries empty
    const { router } = build([{ match: () => true, respond: { rows: [], rowCount: 0 } }]);
    const handler = getHandler(router, "post", "/org/api-keys/:id/rotate");
    const res = mockRes();
    await handler(mockReq({ params: { id: "k9" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("500 SERVER_ERROR when rotate throws", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "post", "/org/api-keys/:id/rotate");
    const res = mockRes();
    await handler(mockReq({ params: { id: "k9" } }), res);
    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error.code, "SERVER_ERROR");
  });
});

describe("GET /org/api-keys/scopes", () => {
  it("200 returns scopes array (no DB)", async () => {
    const { router } = build();
    const handler = getHandler(router, "get", "/org/api-keys/scopes");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(Array.isArray(res._json.data.scopes));
    assert.ok(res._json.data.scopes.length > 0);
  });
});

/* ── WEBHOOKS ──────────────────────────────────────────────────────────── */

describe("GET /org/webhooks", () => {
  it("200 items + total", async () => {
    const { router } = build([
      { match: (s) => s.includes("SELECT"), respond: { rows: [{ id: "i1" }] } }
    ]);
    const handler = getHandler(router, "get", "/org/webhooks");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, res._json.data.items.length);
  });

  it("500 SERVER_ERROR on throw", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "get", "/org/webhooks");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

/* ── AUDIT LOG ─────────────────────────────────────────────────────────── */

describe("GET /org/audit-log", () => {
  it("200 returns items + clamped limit/offset", async () => {
    const { router } = build([
      { match: (s) => s.includes("COUNT") || s.includes("count("), respond: { rows: [{ count: "0", total: "0" }] } },
      { match: () => true, respond: { rows: [] } }
    ]);
    const handler = getHandler(router, "get", "/org/audit-log");
    const res = mockRes();
    await handler(mockReq({ query: { limit: "9999", offset: "5" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.limit, 500); // clamped from 9999
    assert.strictEqual(res._json.data.offset, 5);
    assert.ok(Array.isArray(res._json.data.items));
  });

  it("500 SERVER_ERROR on throw", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "get", "/org/audit-log");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

/* ── USAGE ─────────────────────────────────────────────────────────────── */

describe("GET /org/usage", () => {
  it("200 returns dashboard + monthly_snapshots", async () => {
    const { router } = build([{ match: () => true, respond: { rows: [] } }]);
    const handler = getHandler(router, "get", "/org/usage");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.ok("monthly_snapshots" in res._json.data);
  });

  it("500 SERVER_ERROR on throw", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "get", "/org/usage");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

/* ── SECURITY ──────────────────────────────────────────────────────────── */

describe("GET /org/security", () => {
  it("200 returns settings + security_summary with always-on flags", async () => {
    const { router } = build([
      { match: (s) => s.includes("SELECT"), respond: { rows: [{ approval_required: true, compliance_strictness: "strict" }] } }
    ]);
    const handler = getHandler(router, "get", "/org/security");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._json.data.security_summary);
    assert.strictEqual(res._json.data.security_summary.rbac_enforced, true);
    assert.strictEqual(res._json.data.security_summary.audit_logging, true);
    assert.strictEqual(res._json.data.security_summary.csrf_protection, true);
  });

  it("500 SERVER_ERROR on throw", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "get", "/org/security");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

describe("PATCH /org/security", () => {
  it("400 VALIDATION for out-of-range radius", async () => {
    const { router } = build();
    const handler = getHandler(router, "patch", "/org/security");
    const res = mockRes();
    await handler(mockReq({ body: { default_radius_km: 9999 } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
  });

  it("200 + audit with changed_fields", async () => {
    const { router } = build([
      { match: () => true, respond: { rows: [{ approval_required: true }] } }
    ]);
    const handler = getHandler(router, "patch", "/org/security");
    const res = mockRes();
    await handler(mockReq({ body: { approval_required: true } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res.locals.audit.action, "org.security.update");
    assert.deepStrictEqual(res.locals.audit.details.changed_fields, ["approval_required"]);
  });

  it("500 SERVER_ERROR on throw", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "patch", "/org/security");
    const res = mockRes();
    await handler(mockReq({ body: { approval_required: true } }), res);
    assert.strictEqual(res._status, 500);
  });
});

/* ── LOCATIONS ─────────────────────────────────────────────────────────── */

describe("GET /org/locations", () => {
  it("200 items + total", async () => {
    const { router } = build([
      { match: (s) => s.includes("SELECT"), respond: { rows: [{ id: "l1" }, { id: "l2" }] } }
    ]);
    const handler = getHandler(router, "get", "/org/locations");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, 2);
  });

  it("500 SERVER_ERROR on throw", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "get", "/org/locations");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

describe("POST /org/locations", () => {
  it("400 VALIDATION for missing required name/city", async () => {
    const { router } = build();
    const handler = getHandler(router, "post", "/org/locations");
    const res = mockRes();
    await handler(mockReq({ body: { street: "Main 1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
  });

  it("201 + audit on create", async () => {
    const { router } = build([
      { match: () => true, respond: { rows: [{ id: "loc-new", name: "HQ" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "post", "/org/locations");
    const res = mockRes();
    await handler(mockReq({ body: { name: "HQ", city: "Berlin" } }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res.locals.audit.action, "org.location.create");
    assert.strictEqual(res.locals.audit.details.city, "Berlin");
  });

  it("500 SERVER_ERROR on throw", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "post", "/org/locations");
    const res = mockRes();
    await handler(mockReq({ body: { name: "HQ", city: "Berlin" } }), res);
    assert.strictEqual(res._status, 500);
  });
});

describe("PATCH /org/locations/:locId", () => {
  it("400 VALIDATION for bad type", async () => {
    const { router } = build();
    const handler = getHandler(router, "patch", "/org/locations/:locId");
    const res = mockRes();
    await handler(mockReq({ params: { locId: "l1" }, body: { is_active: "yes" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
  });

  it("404 NOT_FOUND when updateLocation falsy", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "patch", "/org/locations/:locId");
    const res = mockRes();
    await handler(mockReq({ params: { locId: "l1" }, body: { name: "New" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 + audit on update", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "l1", name: "New" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "patch", "/org/locations/:locId");
    const res = mockRes();
    await handler(mockReq({ params: { locId: "l1" }, body: { name: "New" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res.locals.audit.action, "org.location.update");
    assert.deepStrictEqual(res.locals.audit.details.changed_fields, ["name"]);
  });
});

describe("DELETE /org/locations/:locId", () => {
  it("404 NOT_FOUND when deactivate falsy", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "delete", "/org/locations/:locId");
    const res = mockRes();
    await handler(mockReq({ params: { locId: "l1" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 deactivated + audit", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "l1" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "delete", "/org/locations/:locId");
    const res = mockRes();
    await handler(mockReq({ params: { locId: "l1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.deactivated, true);
    assert.strictEqual(res.locals.audit.action, "org.location.deactivate");
  });
});

/* ── DEPARTMENTS ───────────────────────────────────────────────────────── */

describe("GET /org/departments", () => {
  it("200 items + total", async () => {
    const { router } = build([
      { match: (s) => s.includes("SELECT"), respond: { rows: [{ id: "d1" }] } }
    ]);
    const handler = getHandler(router, "get", "/org/departments");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.total, 1);
  });

  it("500 SERVER_ERROR on throw", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "get", "/org/departments");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 500);
  });
});

describe("POST /org/departments", () => {
  it("400 VALIDATION for missing name", async () => {
    const { router } = build();
    const handler = getHandler(router, "post", "/org/departments");
    const res = mockRes();
    await handler(mockReq({ body: { cost_center: "CC1" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
  });

  it("201 + audit on create", async () => {
    const { router } = build([
      { match: () => true, respond: { rows: [{ id: "dep-new", name: "Care" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "post", "/org/departments");
    const res = mockRes();
    await handler(mockReq({ body: { name: "Care" } }), res);
    assert.strictEqual(res._status, 201);
    assert.strictEqual(res.locals.audit.action, "org.department.create");
    assert.strictEqual(res.locals.audit.details.name, "Care");
  });

  it("403 LOCATION_NOT_IN_ORG when createDepartment throws OrgBoundaryError", async () => {
    const { OrgBoundaryError } = await import("../utils/orgBoundary.js");
    const { router } = build([
      { match: () => true, respond: () => { throw new OrgBoundaryError("location not in org"); } }
    ]);
    const handler = getHandler(router, "post", "/org/departments");
    const res = mockRes();
    await handler(mockReq({ body: { name: "Care" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error.code, "LOCATION_NOT_IN_ORG");
  });

  it("500 SERVER_ERROR for generic throw", async () => {
    const { router } = build([{ match: () => true, respond: () => { throw new Error("x"); } }]);
    const handler = getHandler(router, "post", "/org/departments");
    const res = mockRes();
    await handler(mockReq({ body: { name: "Care" } }), res);
    assert.strictEqual(res._status, 500);
  });
});

describe("PATCH /org/departments/:deptId", () => {
  it("400 VALIDATION for bad location_id uuid", async () => {
    const { router } = build();
    const handler = getHandler(router, "patch", "/org/departments/:deptId");
    const res = mockRes();
    await handler(mockReq({ params: { deptId: "d1" }, body: { location_id: "not-a-uuid" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
  });

  it("403 LOCATION_NOT_IN_ORG when assertLocationBelongsToOrg fails", async () => {
    // valid uuid for location_id -> assertLocationBelongsToOrg runs -> no rows -> OrgBoundaryError
    const { router } = build([
      { match: () => true, respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "patch", "/org/departments/:deptId");
    const res = mockRes();
    await handler(mockReq({ params: { deptId: "d1" }, body: { location_id: "11111111-1111-1111-1111-111111111111" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error.code, "LOCATION_NOT_IN_ORG");
  });

  it("404 NOT_FOUND when updateDepartment falsy (no location_id)", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "patch", "/org/departments/:deptId");
    const res = mockRes();
    await handler(mockReq({ params: { deptId: "d1" }, body: { name: "Renamed" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 + audit on update", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "d1", name: "Renamed" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "patch", "/org/departments/:deptId");
    const res = mockRes();
    await handler(mockReq({ params: { deptId: "d1" }, body: { name: "Renamed" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res.locals.audit.action, "org.department.update");
  });
});

describe("DELETE /org/departments/:deptId", () => {
  it("404 NOT_FOUND when deactivate falsy", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "delete", "/org/departments/:deptId");
    const res = mockRes();
    await handler(mockReq({ params: { deptId: "d1" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 deactivated + audit", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "d1" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "delete", "/org/departments/:deptId");
    const res = mockRes();
    await handler(mockReq({ params: { deptId: "d1" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.data.deactivated, true);
    assert.strictEqual(res.locals.audit.action, "org.department.deactivate");
  });
});

/* ── MEMBERS by membership id ──────────────────────────────────────────── */

describe("PATCH /org/members/:membershipId/role", () => {
  it("400 VALIDATION for bad role", async () => {
    const { router } = build();
    const handler = getHandler(router, "patch", "/org/members/:membershipId/role");
    const res = mockRes();
    await handler(mockReq({ params: { membershipId: "m1" }, body: { role_key: "nope" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
  });

  it("404 NOT_FOUND when update falsy", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "patch", "/org/members/:membershipId/role");
    const res = mockRes();
    await handler(mockReq({ params: { membershipId: "m1" }, body: { role_key: "admin" } }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });

  it("200 + audit on success", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "m1", role_key: "admin" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "patch", "/org/members/:membershipId/role");
    const res = mockRes();
    await handler(mockReq({ params: { membershipId: "m1" }, body: { role_key: "admin" } }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res.locals.audit.action, "org.member.role_change");
    assert.strictEqual(res.locals.audit.entity_id, "m1");
  });

  it("maps err.status", async () => {
    const e = new Error("conflict"); e.status = 409; e.code = "ROLE_CONFLICT";
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: () => { throw e; } }
    ]);
    const handler = getHandler(router, "patch", "/org/members/:membershipId/role");
    const res = mockRes();
    await handler(mockReq({ params: { membershipId: "m1" }, body: { role_key: "admin" } }), res);
    assert.strictEqual(res._status, 409);
    assert.strictEqual(res._json.error.code, "ROLE_CONFLICT");
  });
});

describe("PATCH /org/members/:membershipId/scope", () => {
  it("400 VALIDATION for bad location_id uuid", async () => {
    const { router } = build();
    const handler = getHandler(router, "patch", "/org/members/:membershipId/scope");
    const res = mockRes();
    await handler(mockReq({ params: { membershipId: "m1" }, body: { location_id: "bad" } }), res);
    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error.code, "VALIDATION");
  });

  it("403 ORG_BOUNDARY_VIOLATION when scope assert fails", async () => {
    // valid uuid -> assertMemberScopeBelongsToOrg runs -> no rows -> OrgBoundaryError
    const { router } = build([
      { match: () => true, respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "patch", "/org/members/:membershipId/scope");
    const res = mockRes();
    await handler(mockReq({ params: { membershipId: "m1" }, body: { location_id: "11111111-1111-1111-1111-111111111111" } }), res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error.code, "ORG_BOUNDARY_VIOLATION");
  });

  it("200 + audit when scope set (no location/department to assert)", async () => {
    // empty body passes schema; assertMemberScopeBelongsToOrg with null ids is a no-op;
    // updateMemberScope UPDATE returns a row.
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [{ id: "m1" }], rowCount: 1 } }
    ]);
    const handler = getHandler(router, "patch", "/org/members/:membershipId/scope");
    const res = mockRes();
    await handler(mockReq({ params: { membershipId: "m1" }, body: {} }), res);
    assert.strictEqual(res._status, 200);
    assert.strictEqual(res.locals.audit.action, "org.member.scope_change");
    assert.strictEqual(res.locals.audit.details.location_id, null);
  });

  it("404 NOT_FOUND when updateMemberScope falsy", async () => {
    const { router } = build([
      { match: (s) => s.includes("UPDATE"), respond: { rows: [], rowCount: 0 } }
    ]);
    const handler = getHandler(router, "patch", "/org/members/:membershipId/scope");
    const res = mockRes();
    await handler(mockReq({ params: { membershipId: "m1" }, body: {} }), res);
    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error.code, "NOT_FOUND");
  });
});

/* ── ROLES & PERMISSIONS ───────────────────────────────────────────────── */

describe("GET /org/roles-permissions", () => {
  it("200 returns permissions, roles, hierarchy (no DB)", async () => {
    const { router } = build();
    const handler = getHandler(router, "get", "/org/roles-permissions");
    const res = mockRes();
    await handler(mockReq(), res);
    assert.strictEqual(res._status, 200);
    assert.ok(res._json.data.permissions);
    assert.ok(Array.isArray(res._json.data.roles));
    assert.ok(res._json.data.roles.includes("owner"));
    assert.ok(res._json.data.hierarchy);
  });
});
