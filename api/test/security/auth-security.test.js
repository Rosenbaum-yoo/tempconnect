/**
 * Security Regression: Authentication Enforcement
 *
 * Verifies that all RBAC middleware (requirePermission, requireRole, requireOrgContext)
 * correctly reject unauthenticated requests with 401/403.
 *
 * Attack class: Missing / invalid session tokens.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { requirePermission, requireRole, requireOrgContext } from "../../middleware/rbac.js";
import {
  mockReq, mockRes, noop, mockLogger, returnPool, sequencePool,
  USER_A, ORG_A, MEMBERSHIPS
} from "../helpers/security-mocks.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

const deps = () => ({ pool: returnPool(), logger: mockLogger() });

/**
 * Build a pool that returns a valid membership for getPrimaryOrg flow.
 * checkPermission path: getMembership → returns membership row.
 * getPrimaryOrg path:  users query → { org_id } → getMembership → membership row.
 */
function poolWithMembership(role = "owner") {
  return sequencePool(
    { rows: [{ org_id: ORG_A }] },                                       // users lookup
    { rows: [{ ...MEMBERSHIPS.ownerA, role_key: role }] }                 // getMembership
  );
}

// ── requirePermission: auth checks ──────────────────────────────────────────

describe("AUTH-SEC: requirePermission rejects unauthenticated requests", () => {
  it("returns 401 when session is undefined", async () => {
    const mw = requirePermission("requisition.view", deps());
    const req = mockReq({ session: undefined });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 401);
    assert.equal(res._json.error, "NOT_AUTHENTICATED");
  });

  it("returns 401 when session is null", async () => {
    const mw = requirePermission("requisition.view", deps());
    const req = mockReq({ session: null });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 401);
    assert.equal(res._json.error, "NOT_AUTHENTICATED");
  });

  it("returns 401 when session.userId is undefined", async () => {
    const mw = requirePermission("requisition.view", deps());
    const req = mockReq({ session: {} });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 401);
    assert.equal(res._json.error, "NOT_AUTHENTICATED");
  });

  it("returns 401 when session.userId is null", async () => {
    const mw = requirePermission("requisition.view", deps());
    const req = mockReq({ session: { userId: null } });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 401);
    assert.equal(res._json.error, "NOT_AUTHENTICATED");
  });

  it("returns 401 when session.userId is empty string", async () => {
    const mw = requirePermission("requisition.view", deps());
    const req = mockReq({ session: { userId: "" } });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 401);
    assert.equal(res._json.error, "NOT_AUTHENTICATED");
  });

  for (const perm of [
    "requisition.create", "requisition.view", "org.billing",
    "compliance.manage", "vendor_pool.manage", "report.executive",
    "approval.decide", "contract.terminate", "settings.view"
  ]) {
    it(`rejects no-session for permission ${perm}`, async () => {
      const mw = requirePermission(perm, deps());
      const req = mockReq({ session: undefined });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 401);
    });
  }
});

// ── requireRole: auth checks ────────────────────────────────────────────────

describe("AUTH-SEC: requireRole rejects unauthenticated requests", () => {
  it("returns 401 when session is undefined", async () => {
    const mw = requireRole(["owner", "admin"], deps());
    const req = mockReq({ session: undefined });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 401);
    assert.equal(res._json.error, "NOT_AUTHENTICATED");
  });

  it("returns 401 when session is null", async () => {
    const mw = requireRole(["owner", "admin"], deps());
    const req = mockReq({ session: null });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 401);
  });

  it("returns 401 when session.userId is missing", async () => {
    const mw = requireRole(["owner"], deps());
    const req = mockReq({ session: {} });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 401);
  });

  it("returns 401 when session.userId is null", async () => {
    const mw = requireRole(["owner"], deps());
    const req = mockReq({ session: { userId: null } });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 401);
  });
});

// ── requireOrgContext: missing org context ───────────────────────────────────

describe("AUTH-SEC: requireOrgContext rejects missing org context", () => {
  it("returns 403 when orgId is undefined", () => {
    const req = mockReq({ orgId: undefined });
    const res = mockRes();
    requireOrgContext(req, res, noop);
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "NO_ORG_CONTEXT");
  });

  it("returns 403 when orgId is null", () => {
    const req = mockReq({ orgId: null });
    const res = mockRes();
    requireOrgContext(req, res, noop);
    assert.equal(res._status, 403);
  });

  it("returns 403 when orgId is empty string", () => {
    const req = mockReq({ orgId: "" });
    const res = mockRes();
    requireOrgContext(req, res, noop);
    assert.equal(res._status, 403);
  });

  it("calls next() when orgId is present", () => {
    const req = mockReq({ orgId: ORG_A });
    const res = mockRes();
    let called = false;
    requireOrgContext(req, res, () => { called = true; });
    assert.ok(called, "next() should be called when orgId is present");
  });
});

// ── requirePermission: no org membership → 403 ─────────────────────────────

describe("AUTH-SEC: requirePermission denies users without org membership", () => {
  it("returns 403 with NO_ORG_MEMBERSHIP when user has no membership (no org_id in req)", async () => {
    // Pool: getPrimaryOrg → users query returns null org_id, then no membership found
    const pool = sequencePool(
      { rows: [] },   // users lookup: no org_id
      { rows: [] }    // fallback membership: none
    );
    const mw = requirePermission("requisition.view", { pool, logger: mockLogger() });
    // orgId: null — kein Org-Kontext → Fallback-Pfad (getPrimaryOrg) → NO_ORG_MEMBERSHIP
    const req = mockReq({ session: { userId: USER_A }, body: {}, query: {}, params: {}, orgId: null });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "NO_ORG_MEMBERSHIP");
  });

  it("returns 403 PERMISSION_DENIED when explicit org_id and no membership", async () => {
    // checkPermission path → getMembership → no rows
    const pool = returnPool([]);
    const mw = requirePermission("requisition.view", { pool, logger: mockLogger() });
    const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 403);
    // SEC-003: sanitized response — no reason field leaked
    assert.equal(res._json.error, "PERMISSION_DENIED");
    assert.equal(res._json.reason, undefined, "Must not leak reason");
  });
});

// ── requireRole: no membership → 403 ───────────────────────────────────────

describe("AUTH-SEC: requireRole denies users without org membership", () => {
  it("returns 403 NO_ORG_MEMBERSHIP when no membership found", async () => {
    const pool = sequencePool(
      { rows: [] },   // users lookup
      { rows: [] }    // fallback
    );
    const mw = requireRole(["owner", "admin"], { pool, logger: mockLogger() });
    const req = mockReq({ session: { userId: USER_A }, body: {}, query: {}, params: {} });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "NO_ORG_MEMBERSHIP");
  });
});
