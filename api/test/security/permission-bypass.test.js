/**
 * Security Regression: Permission Bypass Prevention
 *
 * Tests that each permission gate correctly blocks users who lack
 * the required permission, and allows users who have it.
 * Covers all critical permission keys used across the platform.
 *
 * Attack class: Horizontal privilege escalation / permission bypass.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { requirePermission } from "../../middleware/rbac.js";
import { PERMISSIONS, hasPermission } from "../../services/rbacService.js";
import {
  mockReq, mockRes, noop, mockLogger, returnPool,
  USER_A, ORG_A, membership
} from "../helpers/security-mocks.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function poolForRole(role) {
  return returnPool([{ ...membership(role), is_active: true }]);
}

function deps(pool) {
  return { pool, logger: mockLogger() };
}

// ── Critical permission gates: unauthorized role → 403 ──────────────────────

describe("PERM-BYPASS: org.billing rejects unauthorized roles", () => {
  // org.billing: only owner, admin, finance
  const denied = ["program_manager", "hiring_manager", "supplier_manager", "recruiter", "member", "viewer"];

  for (const role of denied) {
    it(`${role} → 403 for org.billing`, async () => {
      const mw = requirePermission("org.billing", deps(poolForRole(role)));
      const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }

  // Positive: finance allowed
  it("finance → allowed for org.billing", async () => {
    const mw = requirePermission("org.billing", deps(poolForRole("finance")));
    const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
    const res = mockRes();
    let called = false;
    await mw(req, res, () => { called = true; });
    assert.ok(called);
  });
});

describe("PERM-BYPASS: compliance.manage rejects unauthorized roles", () => {
  // compliance.manage: only owner, admin, supplier_manager
  const denied = ["program_manager", "hiring_manager", "finance", "recruiter", "member", "viewer"];

  for (const role of denied) {
    it(`${role} → 403 for compliance.manage`, async () => {
      const mw = requirePermission("compliance.manage", deps(poolForRole(role)));
      const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }

  it("supplier_manager → allowed for compliance.manage", async () => {
    const mw = requirePermission("compliance.manage", deps(poolForRole("supplier_manager")));
    const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
    const res = mockRes();
    let called = false;
    await mw(req, res, () => { called = true; });
    assert.ok(called);
  });
});

describe("PERM-BYPASS: org.settings rejects unauthorized roles", () => {
  // org.settings: only owner, admin
  const denied = ["program_manager", "hiring_manager", "supplier_manager", "finance", "recruiter", "member", "viewer"];

  for (const role of denied) {
    it(`${role} → 403 for org.settings`, async () => {
      const mw = requirePermission("org.settings", deps(poolForRole(role)));
      const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }

  it("admin → allowed for org.settings", async () => {
    const mw = requirePermission("org.settings", deps(poolForRole("admin")));
    const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
    const res = mockRes();
    let called = false;
    await mw(req, res, () => { called = true; });
    assert.ok(called);
  });
});

describe("PERM-BYPASS: report.executive rejects unauthorized roles", () => {
  // report.executive: owner, admin, program_manager, finance
  const denied = ["hiring_manager", "supplier_manager", "recruiter", "member", "viewer"];

  for (const role of denied) {
    it(`${role} → 403 for report.executive`, async () => {
      const mw = requirePermission("report.executive", deps(poolForRole(role)));
      const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }

  it("program_manager → allowed for report.executive", async () => {
    const mw = requirePermission("report.executive", deps(poolForRole("program_manager")));
    const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
    const res = mockRes();
    let called = false;
    await mw(req, res, () => { called = true; });
    assert.ok(called);
  });
});

describe("PERM-BYPASS: vendor_pool.manage rejects unauthorized roles", () => {
  // vendor_pool.manage: owner, admin, supplier_manager, program_manager
  const denied = ["hiring_manager", "finance", "recruiter", "member", "viewer"];

  for (const role of denied) {
    it(`${role} → 403 for vendor_pool.manage`, async () => {
      const mw = requirePermission("vendor_pool.manage", deps(poolForRole(role)));
      const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }

  it("supplier_manager → allowed for vendor_pool.manage", async () => {
    const mw = requirePermission("vendor_pool.manage", deps(poolForRole("supplier_manager")));
    const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
    const res = mockRes();
    let called = false;
    await mw(req, res, () => { called = true; });
    assert.ok(called);
  });
});

describe("PERM-BYPASS: contract.terminate rejects unauthorized roles", () => {
  // contract.terminate: only owner, admin
  const denied = ["program_manager", "hiring_manager", "supplier_manager", "finance", "recruiter", "member", "viewer"];

  for (const role of denied) {
    it(`${role} → 403 for contract.terminate`, async () => {
      const mw = requirePermission("contract.terminate", deps(poolForRole(role)));
      const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }

  it("owner → allowed for contract.terminate", async () => {
    const mw = requirePermission("contract.terminate", deps(poolForRole("owner")));
    const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
    const res = mockRes();
    let called = false;
    await mw(req, res, () => { called = true; });
    assert.ok(called);
  });
});

describe("PERM-BYPASS: approval.decide rejects unauthorized roles", () => {
  // approval.decide: owner, admin, program_manager
  const denied = ["hiring_manager", "supplier_manager", "finance", "recruiter", "member", "viewer"];

  for (const role of denied) {
    it(`${role} → 403 for approval.decide`, async () => {
      const mw = requirePermission("approval.decide", deps(poolForRole(role)));
      const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }
});

describe("PERM-BYPASS: requisition.approve rejects unauthorized roles", () => {
  // requisition.approve: owner, admin, program_manager
  const denied = ["hiring_manager", "supplier_manager", "finance", "recruiter", "member", "viewer"];

  for (const role of denied) {
    it(`${role} → 403 for requisition.approve`, async () => {
      const mw = requirePermission("requisition.approve", deps(poolForRole(role)));
      const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
      const res = mockRes();
      await mw(req, res, noop);
      assert.equal(res._status, 403);
    });
  }
});

// ── hasPermission utility: spot-check matrix correctness ────────────────────

describe("PERM-BYPASS: hasPermission matrix validation", () => {
  it("owner has all permissions", () => {
    for (const perm of Object.keys(PERMISSIONS)) {
      assert.ok(hasPermission("owner", perm), `owner should have ${perm}`);
    }
  });

  it("viewer has no write permissions", () => {
    const writePerms = Object.entries(PERMISSIONS)
      .filter(([k]) => k.includes("create") || k.includes("edit") || k.includes("manage") || k.includes("terminate") || k.includes("approve") || k.includes("decide"))
      .map(([k]) => k);

    for (const perm of writePerms) {
      assert.ok(!hasPermission("viewer", perm), `viewer should NOT have ${perm}`);
    }
  });

  it("unknown role has no permissions", () => {
    for (const perm of Object.keys(PERMISSIONS)) {
      assert.ok(!hasPermission("nonexistent_role", perm), `unknown role should not have ${perm}`);
    }
  });

  it("unknown permission returns false for all roles", () => {
    const roles = ["owner", "admin", "member", "viewer"];
    for (const role of roles) {
      assert.ok(!hasPermission(role, "nonexistent.permission"));
    }
  });
});

// ── Inactive membership → denied ────────────────────────────────────────────

describe("PERM-BYPASS: inactive membership denied", () => {
  it("active=false membership → 403", async () => {
    const pool = returnPool([{ ...membership("owner"), is_active: false }]);
    const mw = requirePermission("requisition.view", deps(pool));
    const req = mockReq({ session: { userId: USER_A }, body: { org_id: ORG_A } });
    const res = mockRes();
    await mw(req, res, noop);
    assert.equal(res._status, 403);
  });
});
