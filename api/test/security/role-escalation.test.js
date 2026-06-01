/**
 * Security Regression: Role Escalation Prevention
 *
 * Verifies that lower-privilege roles (viewer, member, recruiter, finance)
 * cannot escalate to perform admin/owner-only operations through
 * requirePermission or requireRole middleware.
 *
 * Attack class: Vertical privilege escalation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { requirePermission, requireRole } from "../../middleware/rbac.js";
import { PERMISSIONS, hasPermission } from "../../services/rbacService.js";
import {
  mockReq, mockRes, noop, mockLogger, returnPool, sequencePool,
  USER_A, ORG_A, membership
} from "../helpers/security-mocks.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pool that simulates: checkPermission → getMembership returns a membership with given role.
 * Used when org_id is present in the request.
 */
function poolForRole(role) {
  return returnPool([{
    ...membership(role),
    is_active: true
  }]);
}

/**
 * Pool that simulates getPrimaryOrg fallback:
 * 1) users table → org_id
 * 2) getMembership → membership row
 */
function poolForPrimaryOrgRole(role) {
  return sequencePool(
    { rows: [{ org_id: ORG_A }] },
    { rows: [{ ...membership(role), is_active: true }] }
  );
}

function deps(pool) {
  return { pool, logger: mockLogger() };
}

// ── requirePermission: viewer cannot escalate ───────────────────────────────

describe("ESCALATION: viewer cannot access admin-only permissions", () => {
  const adminOnlyPerms = [
    "org.settings", "org.members", "org.locations", "org.departments",
    "contract.terminate", "settings.edit"
  ];

  for (const perm of adminOnlyPerms) {
    it(`viewer blocked from ${perm} (explicit org_id)`, async () => {
      const mw = requirePermission(perm, deps(poolForRole("viewer")));
      const req = mockReq({
        session: { userId: USER_A },
        body: { org_id: ORG_A }
      });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });

    it(`viewer blocked from ${perm} (primary org fallback)`, async () => {
      const mw = requirePermission(perm, deps(poolForPrimaryOrgRole("viewer")));
      const req = mockReq({
        session: { userId: USER_A },
        body: {}, query: {}, params: {}
      });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }
});

// ── requirePermission: member cannot escalate ───────────────────────────────

describe("ESCALATION: member cannot access management permissions", () => {
  const restrictedPerms = [
    "requisition.create", "requisition.edit", "requisition.approve",
    "org.settings", "org.billing", "compliance.manage",
    "vendor_pool.manage", "report.executive", "approval.decide",
    "contract.terminate", "contract.create"
  ];

  for (const perm of restrictedPerms) {
    it(`member blocked from ${perm}`, async () => {
      const mw = requirePermission(perm, deps(poolForRole("member")));
      const req = mockReq({
        session: { userId: USER_A },
        body: { org_id: ORG_A }
      });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }
});

// ── requirePermission: recruiter cannot escalate to admin ops ───────────────

describe("ESCALATION: recruiter cannot access admin/finance operations", () => {
  const blockedForRecruiter = [
    "org.settings", "org.members", "org.billing",
    "compliance.manage", "vendor_pool.manage",
    "report.executive", "approval.decide",
    "contract.terminate"
  ];

  for (const perm of blockedForRecruiter) {
    it(`recruiter blocked from ${perm}`, async () => {
      const mw = requirePermission(perm, deps(poolForRole("recruiter")));
      const req = mockReq({
        session: { userId: USER_A },
        body: { org_id: ORG_A }
      });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }
});

// ── requirePermission: finance cannot escalate to owner ops ─────────────────

describe("ESCALATION: finance cannot access non-finance management", () => {
  const blockedForFinance = [
    "org.settings", "org.members", "org.locations", "org.departments",
    "requisition.create", "requisition.edit", "requisition.approve",
    "vendor_pool.manage", "compliance.manage",
    "contract.create", "contract.terminate"
  ];

  for (const perm of blockedForFinance) {
    it(`finance blocked from ${perm}`, async () => {
      const mw = requirePermission(perm, deps(poolForRole("finance")));
      const req = mockReq({
        session: { userId: USER_A },
        body: { org_id: ORG_A }
      });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }
});

// ── requireRole: lower roles blocked from admin-only role gates ─────────────

describe("ESCALATION: requireRole blocks insufficient roles", () => {
  const scenarios = [
    { allowed: ["owner"],          test: "admin",            expect: 403 },
    { allowed: ["owner"],          test: "program_manager",  expect: 403 },
    { allowed: ["owner"],          test: "viewer",           expect: 403 },
    { allowed: ["owner", "admin"], test: "program_manager",  expect: 403 },
    { allowed: ["owner", "admin"], test: "member",           expect: 403 },
    { allowed: ["owner", "admin"], test: "viewer",           expect: 403 },
    { allowed: ["owner", "admin"], test: "recruiter",        expect: 403 },
    { allowed: ["owner", "admin"], test: "finance",          expect: 403 },
  ];

  for (const { allowed, test: role, expect: expectedStatus } of scenarios) {
    it(`role=${role} blocked from [${allowed.join(",")}]`, async () => {
      const mw = requireRole(allowed, deps(poolForRole(role)));
      const req = mockReq({
        session: { userId: USER_A },
        body: { org_id: ORG_A }
      });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, expectedStatus);
      assert.equal(res._json.error, "ROLE_DENIED");
    });
  }
});

// ── requireRole: valid roles are allowed through ────────────────────────────

describe("ESCALATION: requireRole allows matching roles", () => {
  const positives = [
    { allowed: ["owner", "admin"], test: "owner" },
    { allowed: ["owner", "admin"], test: "admin" },
    { allowed: ["owner", "admin", "program_manager"], test: "program_manager" },
  ];

  for (const { allowed, test: role } of positives) {
    it(`role=${role} allowed for [${allowed.join(",")}]`, async () => {
      const mw = requireRole(allowed, deps(poolForRole(role)));
      const req = mockReq({
        session: { userId: USER_A },
        body: { org_id: ORG_A }
      });
      const res = mockRes();
      let nextCalled = false;
      await mw(req, res, () => { nextCalled = true; });
      assert.ok(nextCalled, "next() should be called for matching role");
    });
  }
});

// ── Comprehensive: every permission has at least one excluded role ───────────

describe("ESCALATION: every restricted permission denies at least one role", () => {
  const allRoles = [
    "owner", "admin", "program_manager", "hiring_manager",
    "supplier_manager", "finance", "recruiter", "dispatcher",
    "member", "supplier_user", "viewer"
  ];

  for (const [perm] of Object.entries(PERMISSIONS)) {
    // Use hasPermission to account for role hierarchy inheritance
    const deniedRoles = allRoles.filter(r => !hasPermission(r, perm));
    if (deniedRoles.length === 0) continue; // skip universally allowed perms

    // Test first denied role
    const testRole = deniedRoles[0];
    it(`${perm}: ${testRole} denied`, async () => {
      const mw = requirePermission(perm, deps(poolForRole(testRole)));
      const req = mockReq({
        session: { userId: USER_A },
        body: { org_id: ORG_A }
      });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403, `${testRole} should be denied ${perm}`);
    });
  }
});
