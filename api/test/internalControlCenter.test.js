import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasInternalPermission, resolvePermissions } from "../services/internalControlCenterService.js";
import { requireInternalPermission } from "../middleware/internalAccess.js";
import { createInternalControlCenterRouter } from "../routes/internalControlCenter.js";

function mockRes() {
  let statusCode = 200;
  let body = null;
  return {
    locals: {},
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
    get statusCode() { return statusCode; },
    get body() { return body; }
  };
}

describe("internalControlCenterService permissions", () => {
  it("support_agent cannot execute platform actions", () => {
    assert.equal(hasInternalPermission(["support_agent"], "internal.platform.execute"), false);
  });

  it("audit_readonly has read-only permissions", () => {
    const perms = resolvePermissions(["audit_readonly"]);
    assert.ok(perms.includes("internal.audit.read"));
    assert.equal(perms.includes("internal.support.execute"), false);
  });
});

describe("requireInternalPermission middleware", () => {
  it("denies user without internal role", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const logger = { warn() {} };
    const mw = requireInternalPermission("internal.platform.read", { pool, logger });
    const req = { session: { userId: "u1" } };
    const res = mockRes();
    await mw(req, res, () => assert.fail("next should not be called"));
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, "INTERNAL_ACCESS_REQUIRED");
  });

  it("allows user with matching permission", async () => {
    const pool = { query: async () => ({ rows: [{ internal_role_key: "support_lead" }] }) };
    const logger = { warn() {} };
    const mw = requireInternalPermission("internal.support.execute", { pool, logger });
    const req = { session: { userId: "u1" } };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});

describe("internal control center router", () => {
  it("registers core ICC endpoints", () => {
    const noop = (_req, _res, next) => next();
    const router = createInternalControlCenterRouter({
      pool: { query: async () => ({ rows: [{ total: 0 }] }) },
      logger: { warn() {}, error() {}, info() {} },
      requireAuth: noop,
      sendMail: async () => true,
      config: { BASE_URL: "http://localhost:8080" }
    });
    const paths = router.stack
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    assert.ok(paths.includes("GET /internal-control/me"));
    assert.ok(paths.includes("GET /internal-control/platform/dashboard"));
    assert.ok(paths.includes("GET /internal-control/platform/product-insights/overview"));
    assert.ok(paths.includes("GET /internal-control/platform/product-insights/dropoff"));
    assert.ok(paths.includes("GET /internal-control/platform/product-insights/session-to-completion"));
    assert.ok(paths.includes("GET /internal-control/platform/product-insights/role-conversion"));
    assert.ok(paths.includes("POST /internal-control/support/users/:userId/resend-verification"));
  });
});
