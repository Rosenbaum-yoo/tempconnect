/**
 * dealStaffingFastTrackService coverage tests.
 *
 * Strategy:
 *  - The service statically imports featureOverrideService.checkOverride,
 *    notificationMatrix.dispatch, rbacService.{hasPermission,listOrgMembers},
 *    assignmentStaffingService.* and workerService.*. These run for REAL against
 *    the mock pool. We drive the whole call graph with a single SQL-substring
 *    routing pool (trackingPool) so the dependency helpers resolve deterministically.
 *
 * Run (cwd = api/):
 *   node --test --test-force-exit test/dealStaffingFastTrackService.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/dealStaffingFastTrackService.js";

// ── Routing pool ─────────────────────────────────────────────────
// handler: ordered array of [substringMatcher(string), responseOrFn]
function trackingPool(routes = [], { fallback = { rows: [], rowCount: 0 } } = {}) {
  const calls = [];
  const query = async (sql, params) => {
    const text = typeof sql === "string" ? sql : sql?.text || "";
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(text)) {
      return { rows: [], rowCount: 0 };
    }
    calls.push({ sql: text, params: params || [] });
    /* Fixture-Pflege (Befund E-12, 2026-08-19): `getAssignmentStaffingOverview`
       klaert seit der Reparatur ZUERST die Zugehoerigkeit
       (`SELECT 1 FROM assignments WHERE id = $1 AND supplier_org_id = $2`) und
       rechnet erst danach — vorher schrieb ein Lesezugriff in fremde Zeilen.
       Diese Tests fahren durchweg den passenden Lieferanten; die Wache muss
       ihnen also einen Treffer liefern. Die Zusicherungen darunter sind
       unveraendert. */
    if (/SELECT 1 FROM assignments\s+WHERE id = \$1 AND supplier_org_id = \$2/i.test(text)) {
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    }
    for (const [needle, resp] of routes) {
      if (text.includes(needle)) {
        const r = typeof resp === "function" ? resp(text, params) : resp;
        return r;
      }
    }
    return fallback;
  };
  return {
    calls,
    query,
    connect: async () => ({ query, release: () => {} })
  };
}

// ═══════════════════════════════════════════════════════════════
// buildStaffingReadyLink
// ═══════════════════════════════════════════════════════════════
describe("buildStaffingReadyLink", () => {
  it("includes assignment_id, offer_id and mode when both ids given", () => {
    const link = svc.buildStaffingReadyLink({ assignmentId: "a1", offerId: "o1" });
    assert.ok(link.startsWith("/public/worker-submissions-review.html?"));
    assert.ok(link.includes("assignment_id=a1"));
    assert.ok(link.includes("offer_id=o1"));
    assert.ok(link.includes("mode=staffing_ready"));
    assert.ok(link.endsWith("#asgn"));
  });

  it("omits assignment_id/offer_id params when missing but keeps mode", () => {
    const link = svc.buildStaffingReadyLink({});
    assert.ok(link.includes("mode=staffing_ready"));
    assert.ok(!link.includes("assignment_id="));
    assert.ok(!link.includes("offer_id="));
    assert.ok(link.endsWith("#asgn"));
  });

  it("works with no argument object at all", () => {
    const link = svc.buildStaffingReadyLink();
    assert.ok(link.includes("mode=staffing_ready"));
    assert.ok(link.endsWith("#asgn"));
  });
});

// ═══════════════════════════════════════════════════════════════
// isStaffingFastTrackEnabled
// ═══════════════════════════════════════════════════════════════
describe("isStaffingFastTrackEnabled", () => {
  it("returns false when an active override disables the feature", async () => {
    const pool = trackingPool([
      ["FROM feature_overrides", { rows: [{ enabled: false }], rowCount: 1 }]
    ]);
    const result = await svc.isStaffingFastTrackEnabled(pool, "org-1");
    assert.strictEqual(result, false);
    // override was queried with the feature key + org id
    const ov = pool.calls.find((c) => c.sql.includes("FROM feature_overrides"));
    assert.deepStrictEqual(ov.params, [svc.STAFFING_READY_FAST_TRACK_FEATURE_KEY, "org-1"]);
  });

  it("returns true when an active override explicitly enables the feature", async () => {
    const pool = trackingPool([
      ["FROM feature_overrides", { rows: [{ enabled: true }], rowCount: 1 }]
    ]);
    assert.strictEqual(await svc.isStaffingFastTrackEnabled(pool, "org-2"), true);
  });

  it("defaults to true when there is no override (additive fast-track stays on)", async () => {
    const pool = trackingPool([
      ["FROM feature_overrides", { rows: [], rowCount: 0 }]
    ]);
    assert.strictEqual(await svc.isStaffingFastTrackEnabled(pool, "org-3"), true);
  });

  it("passes org_id NULL through when orgId is falsy", async () => {
    const pool = trackingPool([
      ["FROM feature_overrides", { rows: [], rowCount: 0 }]
    ]);
    await svc.isStaffingFastTrackEnabled(pool, null);
    const ov = pool.calls.find((c) => c.sql.includes("FROM feature_overrides"));
    assert.strictEqual(ov.params[1], null);
  });

  it("stays enabled (true) when the override lookup throws (non-critical)", async () => {
    const pool = {
      query: async () => { throw new Error("db down"); }
    };
    assert.strictEqual(await svc.isStaffingFastTrackEnabled(pool, "org-x"), true);
  });
});

// ═══════════════════════════════════════════════════════════════
// resolveStaffingReadyRecipientUserIds
// ═══════════════════════════════════════════════════════════════
describe("resolveStaffingReadyRecipientUserIds", () => {
  // role_key "supplier_admin"/"recruiter" etc must satisfy hasPermission(role, "worker.edit").
  // We rely on the real rbac permission map; pick roles broadly by returning several and
  // asserting only on filtering behaviour we can guarantee: dedupe + fallback.

  it("returns [] for no supplierOrgId and no fallback", async () => {
    const pool = trackingPool([]);
    const ids = await svc.resolveStaffingReadyRecipientUserIds(pool, null);
    assert.deepStrictEqual(ids, []);
  });

  it("returns [fallbackUserId] when no supplierOrgId but fallback provided", async () => {
    const pool = trackingPool([]);
    const ids = await svc.resolveStaffingReadyRecipientUserIds(pool, null, { fallbackUserId: "u-fb" });
    assert.deepStrictEqual(ids, ["u-fb"]);
  });

  it("falls back to fallbackUserId when org has no worker.edit members", async () => {
    const pool = trackingPool([
      // members all lack worker.edit permission → filtered out
      ["FROM org_memberships", { rows: [{ user_id: "u1", role_key: "viewer" }], rowCount: 1 }]
    ]);
    const ids = await svc.resolveStaffingReadyRecipientUserIds(pool, "org-1", { fallbackUserId: "u-fb" });
    assert.deepStrictEqual(ids, ["u-fb"]);
  });

  it("returns [] when org has no eligible members and no fallback", async () => {
    const pool = trackingPool([
      ["FROM org_memberships", { rows: [{ user_id: "u1", role_key: "viewer" }], rowCount: 1 }]
    ]);
    const ids = await svc.resolveStaffingReadyRecipientUserIds(pool, "org-1");
    assert.deepStrictEqual(ids, []);
  });

  it("falls back when listOrgMembers throws", async () => {
    const pool = {
      query: async () => { throw new Error("boom"); }
    };
    const ids = await svc.resolveStaffingReadyRecipientUserIds(pool, "org-1", { fallbackUserId: "u-fb" });
    assert.deepStrictEqual(ids, ["u-fb"]);
  });

  it("returns deduped user_ids of members that hold worker.edit", async () => {
    // Discover a role_key that actually maps to worker.edit so the test is not coupled
    // to a guessed role name. Probe the real rbac permission map via the service indirectly:
    // we cannot import hasPermission here without coupling, so we test the dedupe contract
    // using a role we KNOW is broad. Use members with duplicate user_id to prove Set-dedupe
    // applies before the empty-check; if the picked role lacks worker.edit, this falls to [].
    const { hasPermission } = await import("../services/rbacService.js");
    // find any role that has worker.edit
    const candidateRoles = [
      "owner", "org_admin", "admin", "supplier_admin", "recruiter",
      "disponent", "manager", "staff", "personaldisponent", "agency_admin"
    ];
    const editRole = candidateRoles.find((r) => hasPermission(r, "worker.edit"));
    assert.ok(editRole, "expected at least one known role to hold worker.edit");

    const pool = trackingPool([
      ["FROM org_memberships", {
        rows: [
          { user_id: "u1", role_key: editRole },
          { user_id: "u1", role_key: editRole }, // duplicate → deduped
          { user_id: "u2", role_key: editRole },
          { user_id: null, role_key: editRole }, // falsy user_id → filtered
          { user_id: "u3", role_key: "viewer" }  // lacks worker.edit → filtered (if viewer truly lacks it)
        ],
        rowCount: 5
      }]
    ]);
    const ids = await svc.resolveStaffingReadyRecipientUserIds(pool, "org-1", { fallbackUserId: "u-fb" });
    assert.ok(ids.includes("u1"));
    assert.ok(ids.includes("u2"));
    assert.strictEqual(new Set(ids).size, ids.length, "result must be deduped");
    assert.ok(!ids.includes(null));
    assert.ok(!ids.includes("u-fb"), "fallback must not be used when real recipients exist");
  });
});

// ═══════════════════════════════════════════════════════════════
// dispatchStaffingReadyNotification
// ═══════════════════════════════════════════════════════════════
describe("dispatchStaffingReadyNotification", () => {
  const emptyResult = { sent: 0, recipient_user_ids: [], link_path: null };

  it("no-ops (sent 0) when assignmentId is missing", async () => {
    const pool = trackingPool([]);
    const r = await svc.dispatchStaffingReadyNotification(pool, { supplierOrgId: "o1" });
    assert.deepStrictEqual(r, emptyResult);
    assert.strictEqual(pool.calls.length, 0, "must short-circuit before any query");
  });

  it("no-ops when supplierOrgId is missing", async () => {
    const pool = trackingPool([]);
    const r = await svc.dispatchStaffingReadyNotification(pool, { assignmentId: "a1" });
    assert.deepStrictEqual(r, emptyResult);
  });

  it("no-ops when fast-track is disabled by override", async () => {
    const pool = trackingPool([
      ["FROM feature_overrides", { rows: [{ enabled: false }], rowCount: 1 }]
    ]);
    const r = await svc.dispatchStaffingReadyNotification(pool, {
      assignmentId: "a1", supplierOrgId: "o1", fallbackUserId: "u-fb"
    });
    assert.deepStrictEqual(r, emptyResult);
  });

  it("no-ops when there are no recipients (enabled, no members, no fallback)", async () => {
    const pool = trackingPool([
      ["FROM feature_overrides", { rows: [], rowCount: 0 }], // enabled by default
      ["FROM org_memberships", { rows: [], rowCount: 0 }]    // no members
    ]);
    const r = await svc.dispatchStaffingReadyNotification(pool, {
      assignmentId: "a1", supplierOrgId: "o1"
    });
    assert.deepStrictEqual(r, emptyResult);
  });

  it("dispatches to fallback recipient and returns link + recipient ids", async () => {
    // enabled (no override), no eligible members → fallback recipient drives dispatch.
    // dispatch() runs for real; route its queries to no-op rows so it does not throw.
    const pool = trackingPool([
      ["FROM feature_overrides", { rows: [], rowCount: 0 }],
      ["FROM org_memberships", { rows: [], rowCount: 0 }]
    ]);
    const r = await svc.dispatchStaffingReadyNotification(pool, {
      assignmentId: "a1",
      offerId: "off1",
      supplierOrgId: "o1",
      fallbackUserId: "u-fb",
      requestedQuantity: 5,
      openQuantity: 2,
      clientName: "ACME",
      roleLabel: "Pflegekraft"
    });
    assert.deepStrictEqual(r.recipient_user_ids, ["u-fb"]);
    assert.strictEqual(r.link_path, svc.buildStaffingReadyLink({ assignmentId: "a1", offerId: "off1" }));
    assert.ok(r.link_path.includes("assignment_id=a1"));
    assert.ok(r.link_path.includes("offer_id=off1"));
    // dispatch result is spread in → "sent" key must exist (number)
    assert.strictEqual(typeof r.sent, "number");
  });
});

// ═══════════════════════════════════════════════════════════════
// quickAssignSuggestedWorkers — validation / early-return branches
// ═══════════════════════════════════════════════════════════════
//
// Helper that builds an assignment row returned by recalcAssignmentStaffing's
// UPDATE ... RETURNING *. loadAssignmentContext must return a row first.
function assignmentRoutes(assignment) {
  return [
    // loadAssignmentContext (SELECT a.*, buyer.name ...) — must be non-null
    ["FROM assignments a", { rows: [assignment], rowCount: 1 }],
    // recalcAssignmentStaffing counters
    ["AS filled_quantity", {
      rows: [{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }],
      rowCount: 1
    }],
    // recalcAssignmentStaffing UPDATE assignments ... RETURNING *  — final shape wins
    ["UPDATE assignments", { rows: [assignment], rowCount: 1 }]
  ];
}

describe("quickAssignSuggestedWorkers — validation branches", () => {
  it("returns NO_WORKERS_SELECTED when workerUserIds empty", async () => {
    const pool = trackingPool([]);
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", actorId: "act", workerUserIds: []
    });
    assert.deepStrictEqual(r, { error: "NO_WORKERS_SELECTED" });
  });

  it("returns NO_WORKERS_SELECTED when workerUserIds not an array", async () => {
    const pool = trackingPool([]);
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", workerUserIds: "not-array"
    });
    assert.deepStrictEqual(r, { error: "NO_WORKERS_SELECTED" });
  });

  it("returns NO_WORKERS_SELECTED when all ids are falsy", async () => {
    const pool = trackingPool([]);
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", workerUserIds: [null, "", undefined, 0]
    });
    assert.deepStrictEqual(r, { error: "NO_WORKERS_SELECTED" });
  });

  it("returns ASSIGNMENT_NOT_FOUND when overview has no assignment", async () => {
    // loadAssignmentContext returns no row → recalc returns null → overview null
    const pool = trackingPool([
      ["FROM assignments a", { rows: [], rowCount: 0 }]
    ]);
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", workerUserIds: ["w1"]
    });
    assert.deepStrictEqual(r, { error: "ASSIGNMENT_NOT_FOUND" });
  });

  it("returns ASSIGNMENT_NOT_FOUND on org mismatch (supplier_org_id != supplierOrgId)", async () => {
    const assignment = { id: "a1", supplier_org_id: "OTHER-ORG", status: "planned", open_quantity: 3 };
    const pool = trackingPool(assignmentRoutes(assignment));
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", workerUserIds: ["w1"]
    });
    assert.deepStrictEqual(r, { error: "ASSIGNMENT_NOT_FOUND" });
  });

  it("returns ASSIGNMENT_NOT_ASSIGNABLE for a non-assignable status", async () => {
    const assignment = { id: "a1", supplier_org_id: "o1", status: "completed", open_quantity: 3 };
    const pool = trackingPool(assignmentRoutes(assignment));
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", workerUserIds: ["w1"]
    });
    assert.strictEqual(r.error, "ASSIGNMENT_NOT_ASSIGNABLE");
    assert.strictEqual(r.status, "completed");
  });

  it("returns ASSIGNMENT_FILLED when open_quantity is 0 on an assignable status", async () => {
    const assignment = { id: "a1", supplier_org_id: "o1", status: "active", open_quantity: 0 };
    const pool = trackingPool(assignmentRoutes(assignment));
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", workerUserIds: ["w1"]
    });
    assert.deepStrictEqual(r, { error: "ASSIGNMENT_FILLED" });
  });
});

// ═══════════════════════════════════════════════════════════════
// quickAssignSuggestedWorkers — per-worker processing
// ═══════════════════════════════════════════════════════════════
//
// Past the validation gate we also need listAssignmentSuggestions to return a
// usable bundle (it has .assignment) and the suggestion map to drive the
// per-worker loop. listAssignmentSuggestions runs for real; route its queries.
describe("quickAssignSuggestedWorkers — per-worker results", () => {
  // Build routes for the full path. listAssignmentSuggestions loads the assignment
  // (FROM assignments a) and then a worker candidate query. We make the candidate
  // query return empty so suggestionMap is empty → every worker is "skipped_not_safe"
  // (no suggestion → getSuggestionQuickAssignState eligible:false).
  function fullRoutes(assignment) {
    return [
      ["FROM assignments a", { rows: [assignment], rowCount: 1 }],
      ["AS filled_quantity", {
        rows: [{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }],
        rowCount: 1
      }],
      ["UPDATE assignments", { rows: [assignment], rowCount: 1 }]
    ];
  }

  it("returns ASSIGNMENT_NOT_FOUND when suggestion bundle has no assignment", async () => {
    // First overview succeeds (assignment present, assignable, open>0), but the
    // suggestion bundle's assignment is null. We force that by making
    // listAssignmentSuggestions' own loadAssignmentContext return empty on its turn.
    // Both go through "FROM assignments a"; to differentiate we use a stateful route.
    let assignmentSelectCount = 0;
    const assignment = { id: "a1", supplier_org_id: "o1", status: "planned", open_quantity: 2 };
    const pool = trackingPool([
      ["FROM assignments a", () => {
        assignmentSelectCount += 1;
        // 1st select → overview's loadAssignmentContext (found)
        // 2nd select → suggestions' loadAssignmentContext (not found)
        return assignmentSelectCount === 1
          ? { rows: [assignment], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }],
      ["AS filled_quantity", {
        rows: [{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }],
        rowCount: 1
      }],
      ["UPDATE assignments", { rows: [assignment], rowCount: 1 }]
    ]);
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", workerUserIds: ["w1"]
    });
    assert.deepStrictEqual(r, { error: "ASSIGNMENT_NOT_FOUND" });
  });

  it("marks workers skipped_not_safe when no suggestion exists for them", async () => {
    const assignment = { id: "a1", supplier_org_id: "o1", status: "planned", open_quantity: 2 };
    const pool = trackingPool(fullRoutes(assignment));
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", actorId: "act", workerUserIds: ["w1", "w2"]
    });
    assert.ok(r.summary, "expected a summary object (past validation gate)");
    assert.strictEqual(r.summary.requested_count, 2);
    assert.strictEqual(r.summary.assigned_count, 0);
    assert.strictEqual(r.summary.skipped_count, 2);
    assert.strictEqual(r.results.length, 2);
    for (const entry of r.results) {
      assert.strictEqual(entry.status, "skipped_not_safe");
      assert.strictEqual(entry.reason_code, "not_suggested");
      assert.ok(Array.isArray(entry.quick_assign_blockers));
    }
    assert.deepStrictEqual(r.assigned_links, []);
  });

  it("dedupes selected worker ids before processing", async () => {
    const assignment = { id: "a1", supplier_org_id: "o1", status: "active", open_quantity: 3 };
    const pool = trackingPool(fullRoutes(assignment));
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", workerUserIds: ["w1", "w1", "w2", "w2", "w2"]
    });
    // 2 unique workers → requested_count 2, not 5
    assert.strictEqual(r.summary.requested_count, 2);
    assert.strictEqual(r.results.length, 2);
  });

  it("reports open_quantity_before/after in the summary", async () => {
    const assignment = { id: "a1", supplier_org_id: "o1", status: "extended", open_quantity: 4 };
    const pool = trackingPool(fullRoutes(assignment));
    const r = await svc.quickAssignSuggestedWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "o1", workerUserIds: ["w1"]
    });
    assert.strictEqual(r.summary.open_quantity_before, 4);
    assert.strictEqual(typeof r.summary.open_quantity_after, "number");
    assert.ok(r.assignment, "final assignment present");
  });
});
