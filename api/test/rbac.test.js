/**
 * RBAC Unit Tests
 *
 * Tests hasPermission(), PERMISSIONS matrix consistency, and ROLE_HIERARCHY.
 * No database required — pure function tests.
 *
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  hasPermission,
  PERMISSIONS,
  ROLE_HIERARCHY
} from "../services/rbacService.js";

// ─────────────────────────────────────────────────────────────
// hasPermission — direct role match
// ─────────────────────────────────────────────────────────────

describe("hasPermission — direct role match", () => {
  it("owner can do requisition.create", () => {
    assert.strictEqual(hasPermission("owner", "requisition.create"), true);
  });

  it("viewer cannot do requisition.create", () => {
    assert.strictEqual(hasPermission("viewer", "requisition.create"), false);
  });

  it("hiring_manager can do requisition.create", () => {
    assert.strictEqual(hasPermission("hiring_manager", "requisition.create"), true);
  });

  it("member cannot approve a requisition", () => {
    assert.strictEqual(hasPermission("member", "requisition.approve"), false);
  });

  it("finance can view a requisition", () => {
    assert.strictEqual(hasPermission("finance", "requisition.view"), true);
  });

  it("supplier_user can upload compliance docs", () => {
    assert.strictEqual(hasPermission("supplier_user", "compliance.upload"), true);
  });

  it("supplier_user cannot manage vendor pool", () => {
    assert.strictEqual(hasPermission("supplier_user", "vendor_pool.manage"), false);
  });

  it("dispatcher can create timesheets", () => {
    assert.strictEqual(hasPermission("dispatcher", "timesheet.create"), true);
  });

  it("viewer cannot edit settings", () => {
    assert.strictEqual(hasPermission("viewer", "settings.edit"), false);
  });

  it("finance has org.billing permission", () => {
    assert.strictEqual(hasPermission("finance", "org.billing"), true);
  });
});

// ─────────────────────────────────────────────────────────────
// hasPermission — inherited role match via ROLE_HIERARCHY
// ─────────────────────────────────────────────────────────────

describe("hasPermission — inherited permissions via ROLE_HIERARCHY", () => {
  it("platform_admin inherits owner perms — can do org.settings", () => {
    // owner is in org.settings, platform_admin inherits owner -> should be allowed
    assert.strictEqual(hasPermission("platform_admin", "org.settings"), true);
  });

  it("admin inherits program_manager — can do requisition.create via program_manager", () => {
    assert.strictEqual(hasPermission("admin", "requisition.create"), true);
  });

  it("program_manager inherits hiring_manager — candidate.review works", () => {
    assert.strictEqual(hasPermission("program_manager", "candidate.review"), true);
  });

  it("supplier_user does NOT inherit anything — only direct perms", () => {
    // supplier_user has no hierarchy, cannot approve timesheets
    assert.strictEqual(hasPermission("supplier_user", "timesheet.approve"), false);
  });
});

// ─────────────────────────────────────────────────────────────
// hasPermission — unknown permission
// ─────────────────────────────────────────────────────────────

describe("hasPermission — unknown permission key", () => {
  it("returns false for non-existent permission", () => {
    assert.strictEqual(hasPermission("owner", "nonexistent.permission"), false);
  });

  it("returns false for empty string permission", () => {
    assert.strictEqual(hasPermission("owner", ""), false);
  });
});

// ─────────────────────────────────────────────────────────────
// ROLE_HIERARCHY consistency
// ─────────────────────────────────────────────────────────────

describe("ROLE_HIERARCHY structure", () => {
  it("has entries for all key roles", () => {
    const expectedRoles = [
      "platform_admin", "owner", "admin", "program_manager",
      "hiring_manager", "supplier_manager", "finance",
      "recruiter", "dispatcher", "member", "supplier_user", "viewer"
    ];
    for (const role of expectedRoles) {
      assert.ok(role in ROLE_HIERARCHY, `Missing role in hierarchy: ${role}`);
    }
  });

  it("terminal roles have empty inheritance arrays", () => {
    assert.deepStrictEqual(ROLE_HIERARCHY.member, []);
    assert.deepStrictEqual(ROLE_HIERARCHY.supplier_user, []);
    assert.deepStrictEqual(ROLE_HIERARCHY.viewer, []);
  });

  it("owner inherits admin", () => {
    assert.ok(ROLE_HIERARCHY.owner.includes("admin"));
  });

  it("platform_admin inherits all roles", () => {
    const inherited = ROLE_HIERARCHY.platform_admin;
    assert.ok(inherited.includes("owner"));
    assert.ok(inherited.includes("admin"));
    assert.ok(inherited.includes("member"));
  });

  it("inherited roles are valid known role keys", () => {
    const allRoles = new Set(Object.keys(ROLE_HIERARCHY));
    for (const [role, inherited] of Object.entries(ROLE_HIERARCHY)) {
      for (const subRole of inherited) {
        assert.ok(
          allRoles.has(subRole),
          `Role "${role}" inherits unknown role "${subRole}"`
        );
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// PERMISSIONS matrix consistency
// ─────────────────────────────────────────────────────────────

describe("PERMISSIONS matrix integrity", () => {
  it("every permission maps to a non-empty array of roles", () => {
    for (const [perm, roles] of Object.entries(PERMISSIONS)) {
      assert.ok(Array.isArray(roles), `${perm} roles is not an array`);
      assert.ok(roles.length > 0, `${perm} has no allowed roles`);
    }
  });

  it("all roles referenced in PERMISSIONS exist in ROLE_HIERARCHY", () => {
    const knownRoles = new Set(Object.keys(ROLE_HIERARCHY));
    for (const [perm, roles] of Object.entries(PERMISSIONS)) {
      for (const role of roles) {
        assert.ok(
          knownRoles.has(role),
          `Permission "${perm}" references unknown role "${role}"`
        );
      }
    }
  });

  it("owner is allowed in every critical operation", () => {
    const criticalPerms = [
      "requisition.create", "requisition.approve", "requisition.cancel",
      "org.settings", "org.members", "org.billing",
      "vendor_pool.manage", "compliance.manage",
      "timesheet.approve", "contract.terminate"
    ];
    for (const perm of criticalPerms) {
      assert.strictEqual(
        hasPermission("owner", perm), true,
        `owner should have ${perm}`
      );
    }
  });

  it("viewer is read-only — can view but cannot create/edit", () => {
    assert.strictEqual(hasPermission("viewer", "requisition.view"), true);
    assert.strictEqual(hasPermission("viewer", "offer.view"), true);
    assert.strictEqual(hasPermission("viewer", "requisition.create"), false);
    assert.strictEqual(hasPermission("viewer", "requisition.approve"), false);
    assert.strictEqual(hasPermission("viewer", "org.settings"), false);
    assert.strictEqual(hasPermission("viewer", "compliance.manage"), false);
  });

  it("covers at least 30 distinct permissions", () => {
    assert.ok(Object.keys(PERMISSIONS).length >= 30, "Expected at least 30 permissions");
  });
});

// ─────────────────────────────────────────────────────────────
// Role separation — supplier_user vs internal roles
// ─────────────────────────────────────────────────────────────

describe("supplier_user role isolation", () => {
  const internalOnlyPerms = [
    "requisition.approve", "vendor_pool.manage", "org.settings",
    "org.members", "report.executive", "contract.terminate",
    "approval.decide"
  ];

  it("supplier_user cannot access internal-only operations", () => {
    for (const perm of internalOnlyPerms) {
      assert.strictEqual(
        hasPermission("supplier_user", perm), false,
        `supplier_user should NOT have ${perm}`
      );
    }
  });

  it("supplier_user CAN create offers", () => {
    assert.strictEqual(hasPermission("supplier_user", "offer.create"), true);
  });

  it("supplier_user CAN view timesheets and notifications", () => {
    assert.strictEqual(hasPermission("supplier_user", "timesheet.view"), true);
    assert.strictEqual(hasPermission("supplier_user", "notification.view"), true);
  });
});
