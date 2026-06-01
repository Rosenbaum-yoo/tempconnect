/**
 * Feature gate middleware unit tests — requireFeature.
 * Uses dependency injection (getUserAndPlan, logger) — no DB needed.
 * Tests the critical access-control boundary between plans and features.
 *
 * Run: node --test --test-force-exit test/featureGate.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { requireFeature } from "../middleware/featureGate.js";

// Disable dev-env feature gate bypass so these tests verify real plan-gating logic.
process.env.FEATURE_GATE_BYPASS = "false";

/* ── Test helpers ───────────────────────────────────────── */

function mockRes() {
  let _status, _json;
  return {
    status(code) { _status = code; return this; },
    json(body) { _json = body; return this; },
    get _status() { return _status; },
    get _json() { return _json; }
  };
}

function mockLogger() {
  const warnings = [];
  return {
    warn(obj, msg) { warnings.push({ obj, msg }); },
    get warnings() { return warnings; }
  };
}

function makeDeps(getUserAndPlanFn) {
  return {
    getUserAndPlan: getUserAndPlanFn,
    logger: mockLogger()
  };
}

// ─────────────────────────────────────────────────────────────
// Unauthenticated — no session
// ─────────────────────────────────────────────────────────────

describe("requireFeature — unauthenticated", () => {
  it("returns 401 when session has no userId", async () => {
    const deps = makeDeps(async () => null);
    const mw = requireFeature("sla_access", deps);
    const req = { session: {} };
    const res = mockRes();
    await mw(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error, "NOT_AUTHENTICATED");
  });

  it("returns 401 when session is missing", async () => {
    const deps = makeDeps(async () => null);
    const mw = requireFeature("sla_access", deps);
    const req = {};
    const res = mockRes();
    await mw(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 401);
  });
});

// ─────────────────────────────────────────────────────────────
// Feature allowed — user has correct plan
// ─────────────────────────────────────────────────────────────

describe("requireFeature — access granted", () => {
  it("allows PRO user to access sla_access", async () => {
    const deps = makeDeps(async () => ({ id: "u1", plan: "PRO" }));
    const mw = requireFeature("sla_access", deps);
    const req = { session: { userId: "u1" } };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("sets req.user to the resolved user object", async () => {
    const user = { id: "u1", plan: "ENTERPRISE" };
    const deps = makeDeps(async () => user);
    const mw = requireFeature("departments", deps);
    const req = { session: { userId: "u1" } };
    const res = mockRes();
    await mw(req, res, () => {});
    assert.strictEqual(req.user, user);
  });

  it("allows ENTERPRISE user to access enterprise-only features", async () => {
    const deps = makeDeps(async () => ({ id: "u1", plan: "ENTERPRISE" }));
    const mw = requireFeature("approval_workflows", deps);
    const req = { session: { userId: "u1" } };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("allows DEMO user to access legacy_access", async () => {
    const deps = makeDeps(async () => ({ id: "u1", plan: "DEMO" }));
    const mw = requireFeature("legacy_access", deps);
    const req = { session: { userId: "u1" } };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });
});

// ─────────────────────────────────────────────────────────────
// Feature denied — plan too low
// ─────────────────────────────────────────────────────────────

describe("requireFeature — access denied", () => {
  it("blocks DEMO user from creating offers (sla_offers_create)", async () => {
    const logger = mockLogger();
    const deps = { getUserAndPlan: async () => ({ id: "u1", plan: "DEMO" }), logger };
    const mw = requireFeature("sla_offers_create", deps);
    const req = { session: { userId: "u1" } };
    const res = mockRes();
    await mw(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.code, "FEATURE_NOT_ALLOWED");
    assert.strictEqual(res._json.feature, "sla_offers_create");
    assert.strictEqual(res._json.ok, false);
  });

  it("blocks PRO user from enterprise-only feature", async () => {
    const logger = mockLogger();
    const deps = { getUserAndPlan: async () => ({ id: "u2", plan: "PRO" }), logger };
    const mw = requireFeature("departments", deps);
    const req = { session: { userId: "u2" } };
    const res = mockRes();
    await mw(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.code, "FEATURE_NOT_ALLOWED");
    assert.strictEqual(res._json.plan, "PRO");
  });

  it("logs a warning on feature gate violation", async () => {
    const logger = mockLogger();
    const deps = { getUserAndPlan: async () => ({ id: "u1", plan: "BASIS" }), logger };
    const mw = requireFeature("advanced_matching", deps);
    const req = { session: { userId: "u1" } };
    const res = mockRes();
    await mw(req, res, () => {});
    assert.strictEqual(logger.warnings.length, 1);
    assert.strictEqual(logger.warnings[0].obj.featureKey, "advanced_matching");
    assert.strictEqual(logger.warnings[0].obj.plan, "BASIS");
    assert.strictEqual(logger.warnings[0].msg, "Feature gate violation");
  });
});

// ─────────────────────────────────────────────────────────────
// Default plan fallback — user not found or plan missing
// ─────────────────────────────────────────────────────────────

describe("requireFeature — default plan fallback", () => {
  it("defaults to DEMO when getUserAndPlan returns null", async () => {
    const deps = makeDeps(async () => null);
    const mw = requireFeature("legacy_access", deps);
    const req = { session: { userId: "unknown-user" } };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    // DEMO has legacy_access -> should pass
    assert.strictEqual(nextCalled, true);
  });

  it("defaults to DEMO when user has no plan field", async () => {
    const deps = makeDeps(async () => ({ id: "u1" }));
    const mw = requireFeature("legacy_access", deps);
    const req = { session: { userId: "u1" } };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("defaults to DEMO and blocks premium features when user not found", async () => {
    const deps = makeDeps(async () => null);
    const mw = requireFeature("sla_offers_create", deps);
    const req = { session: { userId: "unknown-user" } };
    const res = mockRes();
    await mw(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.plan, "DEMO");
  });
});
