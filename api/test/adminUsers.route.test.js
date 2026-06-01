import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createAdminRouter } from "../routes/admin.js";

function recordingSequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const response = responses[idx++];
      if (response instanceof Error) throw response;
      return response;
    }
  };
}

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "user-1", userRole: "company" },
    params: {},
    query: {},
    body: {},
    orgId: "org-1",
    orgRole: "owner",
    orgMembership: { org_id: "org-1", role_key: "owner" },
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; return res; }
  };
  return res;
}

function createDeps(pool) {
  return {
    pool,
    logger: mockLogger(),
    config: {},
    requireAuth: (_req, _res, next) => next(),
    getUserAndPlan: async () => null
  };
}

function getAdminUsersHandlers(router) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== "/admin/users") continue;
    if (!layer.route.methods.get) continue;
    return layer.route.stack.map((stackLayer) => stackLayer.handle);
  }
  throw new Error("GET /admin/users route not found");
}

describe("admin routes — /admin/users RBAC", () => {
  it("denies non-admin users in requireAdmin middleware", () => {
    const pool = recordingSequencePool();
    const router = createAdminRouter(createDeps(pool));
    const handlers = getAdminUsersHandlers(router);
    const requireAdmin = handlers[1];
    const req = mockReq({ orgRole: "member", orgMembership: { org_id: "org-1", role_key: "member" }, session: { userId: "user-1", userRole: "company" } });
    const res = mockRes();
    let nextCalled = false;

    requireAdmin(req, res, function next() { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.equal(res._json.success, false);
    assert.equal(res._json.error.code, "ADMIN_REQUIRED");
  });

  it("allows org admins in requireAdmin middleware", () => {
    const pool = recordingSequencePool();
    const router = createAdminRouter(createDeps(pool));
    const handlers = getAdminUsersHandlers(router);
    const requireAdmin = handlers[1];
    const req = mockReq({ orgRole: "admin", orgMembership: { org_id: "org-1", role_key: "admin" } });
    const res = mockRes();
    let nextCalled = false;

    requireAdmin(req, res, function next() { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res._json, null);
  });
});

describe("admin routes — GET /admin/users", () => {
  it("returns paginated users with subscription-derived plan and org-scoped filtering for org admins", async () => {
    const pool = recordingSequencePool(
      {
        rows: [
          {
            id: "u-1",
            email: "owner@example.test",
            company_name: "Owner GmbH",
            role: "company",
            plan: "PRO",
            org_id: "org-1",
            org_name: "Org One",
            org_role: "owner",
            is_verified: true
          }
        ]
      },
      { rows: [{ total: 1 }] }
    );
    const router = createAdminRouter(createDeps(pool));
    const handlers = getAdminUsersHandlers(router);
    const handler = handlers[2];
    const req = mockReq({
      query: { limit: "50", offset: "0" },
      orgRole: "owner",
      orgId: "org-1",
      session: { userId: "user-1", userRole: "company" }
    });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 200);
    assert.equal(res._json.success, true);
    assert.equal(res._json.data.total, 1);
    assert.equal(res._json.data.limit, 50);
    assert.equal(res._json.data.offset, 0);
    assert.equal(res._json.data.items.length, 1);
    assert.match(pool.calls[0].sql, /COALESCE\(sub\.plan, 'DEMO'\) AS plan/);
    assert.match(pool.calls[0].sql, /FROM subscriptions s/);
    assert.match(pool.calls[0].sql, /om_scope/);
    assert.deepEqual(pool.calls[0].params, [50, 0, "org-1"]);
    assert.deepEqual(pool.calls[1].params, ["org-1"]);
  });

  it("clamps and defaults invalid pagination parameters", async () => {
    const pool = recordingSequencePool(
      { rows: [] },
      { rows: [{ total: 0 }] }
    );
    const router = createAdminRouter(createDeps(pool));
    const handlers = getAdminUsersHandlers(router);
    const handler = handlers[2];
    const req = mockReq({
      query: { limit: "abc", offset: "-10" },
      orgRole: "owner",
      orgId: "org-1",
      session: { userId: "user-1", userRole: "company" }
    });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 200);
    assert.deepEqual(pool.calls[0].params, [50, 0, "org-1"]);
  });

  it("requires org context for non-global admins", async () => {
    const pool = recordingSequencePool();
    const router = createAdminRouter(createDeps(pool));
    const handlers = getAdminUsersHandlers(router);
    const handler = handlers[2];
    const req = mockReq({
      orgRole: "owner",
      orgId: null,
      orgMembership: null,
      session: { userId: "user-1", userRole: "company" }
    });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "ORG_CONTEXT_REQUIRED");
    assert.equal(pool.calls.length, 0);
  });

  it("keeps platform-wide scope for global admins without org context", async () => {
    const pool = recordingSequencePool(
      { rows: [] },
      { rows: [{ total: 0 }] }
    );
    const router = createAdminRouter(createDeps(pool));
    const handlers = getAdminUsersHandlers(router);
    const handler = handlers[2];
    const req = mockReq({
      orgRole: null,
      orgId: null,
      orgMembership: null,
      query: { q: "alice" },
      session: { userId: "user-1", userRole: "platform_admin" }
    });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 200);
    assert.deepEqual(pool.calls[0].params, [50, 0, "%alice%"]);
    assert.doesNotMatch(pool.calls[0].sql, /om_scope/);
  });

  it("returns stable server error envelope on query failure", async () => {
    const pool = recordingSequencePool(new Error("relation users.plan does not exist"));
    const router = createAdminRouter(createDeps(pool));
    const handlers = getAdminUsersHandlers(router);
    const handler = handlers[2];
    const req = mockReq({
      orgRole: "owner",
      orgId: "org-1",
      session: { userId: "user-1", userRole: "company" }
    });
    const res = mockRes();

    await handler(req, res);

    assert.equal(res._status, 500);
    assert.equal(res._json.success, false);
    assert.equal(res._json.error.code, "SERVER_ERROR");
    assert.equal(res._json.error.message, "Benutzer konnten nicht geladen werden.");
  });
});
