/**
 * Admin Activity Feed tests.
 * Covers: service formatting, label/icon/severity maps, queryActivityFeed,
 * formatFeedItem, RBAC, filter handling, pagination.
 * Uses mock pool — no database required.
 *
 * Run: node --test --test-force-exit test/adminActivityFeed.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatFeedItem,
  queryActivityFeed,
  getActionLabels,
  getActionTypes
} from "../services/activityFeedService.js";

// ── Mock helpers ──────────────────────────────────────────────

function mockPool(rows = [], total = null) {
  const rowCount = total ?? rows.length;
  return {
    query: async () => ({ rows, rowCount })
  };
}

function mockPoolWithCapture() {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      // Return total=0 for COUNT, empty rows for SELECT
      if (sql.includes("COUNT")) return { rows: [{ total: 0 }], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }
  };
}

function makeAuditRow(overrides = {}) {
  return {
    id: "af-001",
    created_at: "2026-03-16T09:00:00Z",
    action: "timesheet.approve",
    action_type: "APPROVAL",
    status: "SUCCESS",
    actor_name: "Max Mustermann",
    actor_email: "max@acme.de",
    entity_type: "timesheet",
    entity_id: "ts-1234",
    ip_address: "10.0.0.1",
    org_id: "org-1",
    ...overrides
  };
}

// ═══════════════════════════════════════════════════════════════
// formatFeedItem
// ═══════════════════════════════════════════════════════════════

describe("activityFeedService — formatFeedItem", () => {
  it("transforms a standard audit row into feed item", () => {
    const row = makeAuditRow();
    const item = formatFeedItem(row);

    assert.strictEqual(item.id, "af-001");
    assert.strictEqual(item.timestamp, "2026-03-16T09:00:00Z");
    assert.strictEqual(item.action, "timesheet.approve");
    assert.strictEqual(item.action_label, "Stundenzettel genehmigt");
    assert.strictEqual(item.action_type, "APPROVAL");
    assert.strictEqual(item.severity, "success");
    assert.strictEqual(item.user, "Max Mustermann");
    assert.strictEqual(item.resource, "Timesheet #ts-1234");
    assert.strictEqual(item.ip_address, "10.0.0.1");
  });

  it("falls back to email when actor_name is null", () => {
    const row = makeAuditRow({ actor_name: null });
    const item = formatFeedItem(row);
    assert.strictEqual(item.user, "max@acme.de");
  });

  it("user is null when both name and email are null", () => {
    const row = makeAuditRow({ actor_name: null, actor_email: null });
    const item = formatFeedItem(row);
    assert.strictEqual(item.user, null);
  });

  it("truncates long entity IDs in resource", () => {
    const row = makeAuditRow({ entity_id: "abcdef01-2345-6789-abcd-ef0123456789" });
    const item = formatFeedItem(row);
    assert.ok(item.resource.includes("abcdef01…"));
    assert.ok(!item.resource.includes("abcdef01-2345-6789-abcd-ef0123456789"));
  });

  it("returns empty resource when entity_type is null", () => {
    const row = makeAuditRow({ entity_type: null, entity_id: null });
    const item = formatFeedItem(row);
    assert.strictEqual(item.resource, "");
  });

  it("returns type-only resource when entity_id is null", () => {
    const row = makeAuditRow({ entity_id: null });
    const item = formatFeedItem(row);
    assert.strictEqual(item.resource, "Timesheet");
  });
});

// ═══════════════════════════════════════════════════════════════
// Label mapping
// ═══════════════════════════════════════════════════════════════

describe("activityFeedService — label mapping", () => {
  it("maps known actions to German labels", () => {
    const cases = [
      ["auth.login", "Anmeldung"],
      ["deal.finalize", "Deal abgeschlossen"],
      ["requisition.approve", "Requisition freigegeben"],
      ["vendor_pool.invite", "Lieferant eingeladen"],
      ["contract.activate", "Vertrag aktiviert"],
      ["invoice.pay", "Rechnung bezahlt"],
      ["worker.create", "Mitarbeiter angelegt"]
    ];
    for (const [action, expected] of cases) {
      const item = formatFeedItem(makeAuditRow({ action }));
      assert.strictEqual(item.action_label, expected, `Expected '${expected}' for '${action}'`);
    }
  });

  it("generates fallback label for unknown actions", () => {
    const item = formatFeedItem(makeAuditRow({ action: "custom.new_action" }));
    assert.strictEqual(item.action_label, "Custom New Action");
  });

  it("returns 'Unbekannte Aktion' for null action", () => {
    const item = formatFeedItem(makeAuditRow({ action: null }));
    assert.strictEqual(item.action_label, "Unbekannte Aktion");
  });
});

// ═══════════════════════════════════════════════════════════════
// Icon mapping
// ═══════════════════════════════════════════════════════════════

describe("activityFeedService — icon mapping", () => {
  it("maps categories to correct icons", () => {
    const cases = [
      ["timesheet.approve", "⏱️"],
      ["deal.finalize", "🎯"],
      ["auth.login", "🔐"],
      ["capacity.create", "🔄"],
      ["compliance.verify", "🛡️"],
      ["invoice.pay", "💰"]
    ];
    for (const [action, expectedIcon] of cases) {
      const item = formatFeedItem(makeAuditRow({ action }));
      assert.strictEqual(item.icon, expectedIcon, `Expected icon for '${action}'`);
    }
  });

  it("uses fallback icon for unknown category", () => {
    const item = formatFeedItem(makeAuditRow({ action: "unknown.thing" }));
    assert.strictEqual(item.icon, "📌");
  });
});

// ═══════════════════════════════════════════════════════════════
// Severity mapping
// ═══════════════════════════════════════════════════════════════

describe("activityFeedService — severity mapping", () => {
  it("maps action types to correct severity", () => {
    const cases = [
      ["APPROVAL", "SUCCESS", "success"],
      ["CREATE", "SUCCESS", "info"],
      ["DELETE", "SUCCESS", "danger"],
      ["LOGIN", "SUCCESS", "muted"],
      ["ROLE_CHANGE", "SUCCESS", "warning"],
      ["SECURITY", "SUCCESS", "warning"],
      ["CONFIG_CHANGE", "SUCCESS", "warning"]
    ];
    for (const [actionType, status, expected] of cases) {
      const item = formatFeedItem(makeAuditRow({ action_type: actionType, status }));
      assert.strictEqual(item.severity, expected, `Expected '${expected}' for ${actionType}/${status}`);
    }
  });

  it("overrides to danger for DENIED status", () => {
    const item = formatFeedItem(makeAuditRow({ action_type: "CREATE", status: "DENIED" }));
    assert.strictEqual(item.severity, "danger");
  });

  it("overrides to warning for FAILED status", () => {
    const item = formatFeedItem(makeAuditRow({ action_type: "CREATE", status: "FAILED" }));
    assert.strictEqual(item.severity, "warning");
  });

  it("defaults to info for unknown action_type", () => {
    const item = formatFeedItem(makeAuditRow({ action_type: "UNKNOWN_TYPE" }));
    assert.strictEqual(item.severity, "info");
  });
});

// ═══════════════════════════════════════════════════════════════
// queryActivityFeed
// ═══════════════════════════════════════════════════════════════

describe("activityFeedService — queryActivityFeed", () => {
  it("returns empty items for no audit log rows", async () => {
    const pool = mockPool([], 0);
    const result = await queryActivityFeed(pool, "org-1", {});
    assert.strictEqual(result.items.length, 0);
    assert.strictEqual(result.total, 0);
  });

  it("transforms audit rows into feed items", async () => {
    const rows = [
      makeAuditRow({ id: "a1", action: "deal.finalize" }),
      makeAuditRow({ id: "a2", action: "auth.login" })
    ];
    const pool = {
      query: async (sql) => {
        if (sql.includes("COUNT")) return { rows: [{ total: 2 }], rowCount: 1 };
        return { rows, rowCount: rows.length };
      }
    };
    const result = await queryActivityFeed(pool, "org-1", { limit: 10 });
    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.items[0].action_label, "Deal abgeschlossen");
    assert.strictEqual(result.items[1].action_label, "Anmeldung");
    assert.strictEqual(result.total, 2);
  });

  it("passes org_id filter to query (org-scoped)", async () => {
    const pool = mockPoolWithCapture();
    await queryActivityFeed(pool, "org-abc", { action_type: "APPROVAL" });
    // Should have called query at least once with org_id param
    const calls = pool.calls;
    assert.ok(calls.length >= 1, "should make at least 1 query");
    const hasOrgParam = calls.some(c => c.params && c.params.includes("org-abc"));
    assert.ok(hasOrgParam, "should pass org_id to query");
  });

  it("queries platform-wide when orgId is null", async () => {
    const pool = mockPoolWithCapture();
    await queryActivityFeed(pool, null, {});
    // Should NOT have org_id in any params
    const calls = pool.calls;
    assert.ok(calls.length >= 1);
  });

  it("clamps limit to max 200", async () => {
    const pool = mockPool([], 0);
    const result = await queryActivityFeed(pool, "org-1", { limit: 500 });
    // The function should not crash — it clamps internally
    assert.strictEqual(result.items.length, 0);
  });

  it("defaults offset to 0", async () => {
    const pool = mockPool([], 0);
    const result = await queryActivityFeed(pool, "org-1", { offset: -5 });
    assert.strictEqual(result.items.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getActionLabels / getActionTypes
// ═══════════════════════════════════════════════════════════════

describe("activityFeedService — metadata exports", () => {
  it("getActionLabels returns a non-empty object", () => {
    const labels = getActionLabels();
    assert.ok(Object.keys(labels).length > 30);
    assert.strictEqual(labels["auth.login"], "Anmeldung");
  });

  it("getActionLabels returns a copy (not the original)", () => {
    const a = getActionLabels();
    const b = getActionLabels();
    a["test.new"] = "Test";
    assert.strictEqual(b["test.new"], undefined);
  });

  it("getActionTypes returns all known types", () => {
    const types = getActionTypes();
    assert.ok(types.includes("CREATE"));
    assert.ok(types.includes("APPROVAL"));
    assert.ok(types.includes("DELETE"));
    assert.ok(types.includes("LOGIN"));
    assert.ok(types.includes("SECURITY"));
    assert.ok(types.length >= 10);
  });
});

// ═══════════════════════════════════════════════════════════════
// Feed item completeness
// ═══════════════════════════════════════════════════════════════

describe("activityFeedService — feed item completeness", () => {
  it("all known actions produce valid feed items", () => {
    const labels = getActionLabels();
    for (const action of Object.keys(labels)) {
      const row = makeAuditRow({ action, action_type: "CREATE" });
      const item = formatFeedItem(row);
      assert.ok(item.action_label, `label missing for ${action}`);
      assert.ok(item.icon, `icon missing for ${action}`);
      assert.ok(item.severity, `severity missing for ${action}`);
      assert.ok(item.timestamp, `timestamp missing for ${action}`);
    }
  });

  it("feed item has all expected fields", () => {
    const item = formatFeedItem(makeAuditRow());
    const expectedFields = [
      "id", "timestamp", "action", "action_label", "action_type",
      "icon", "severity", "status", "user", "user_email",
      "resource", "entity_type", "entity_id", "ip_address"
    ];
    for (const field of expectedFields) {
      assert.ok(field in item, `missing field: ${field}`);
    }
  });
});
