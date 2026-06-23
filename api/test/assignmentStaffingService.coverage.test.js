/**
 * assignmentStaffingService — comprehensive behavior coverage.
 *
 * Run: node --test --test-force-exit test/assignmentStaffingService.coverage.test.js
 *
 * Strategy:
 *  - Pure/exported helpers (getAutoBackfillBatchSize, deriveStaffingStatus,
 *    getSuggestionQuickAssignState) are tested directly with no DB.
 *  - DB-backed exports are driven with a "trackingPool": a mock pool that
 *    dispatches each query to a handler keyed by SQL fragments, records the
 *    calls, and returns realistic { rows, rowCount } shapes. This lets us
 *    assert real behavior (return shape, SQL params, state transitions,
 *    error branches) instead of just touching lines.
 *  - The BullMQ queue is unavailable in the test env (no Redis), so
 *    enqueue() returns null and invite delivery runs inline against the
 *    mock pool — we account for those queries in the handlers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/assignmentStaffingService.js";

// ── trackingPool ───────────────────────────────────────────────
// handler(sql, params) → { rows, rowCount } | undefined (defaults to empty)
const TX = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);

function trackingPool(handler) {
  const calls = [];
  const query = async (sql, params) => {
    const text = String(sql);
    if (TX.has(text.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    calls.push({ sql: text, params: params || [] });
    const out = handler(text, params || []);
    if (out === undefined || out === null) return { rows: [], rowCount: 0 };
    return out;
  };
  const pool = {
    query,
    connect: async () => ({ query, release() {} }),
    calls
  };
  return pool;
}

function rows(arr) {
  return { rows: arr, rowCount: arr.length };
}

// Match helper: does any recorded call's SQL include the fragment?
function sqlSeen(pool, fragment) {
  return pool.calls.some((c) => c.sql.includes(fragment));
}
function callWith(pool, fragment) {
  return pool.calls.find((c) => c.sql.includes(fragment));
}

// ═══════════════════════════════════════════════════════════════
// getAutoBackfillBatchSize  (pure)
// ═══════════════════════════════════════════════════════════════
describe("getAutoBackfillBatchSize", () => {
  it("returns 3x open quantity within [1,20]", () => {
    assert.strictEqual(svc.getAutoBackfillBatchSize(2), 6);
    assert.strictEqual(svc.getAutoBackfillBatchSize(1), 3);
  });

  it("clamps to a minimum of 1 for zero/negative/invalid input", () => {
    // openQuantity normalized to >= 1, so 1*3 = 3
    assert.strictEqual(svc.getAutoBackfillBatchSize(0), 3);
    assert.strictEqual(svc.getAutoBackfillBatchSize(-5), 3);
    assert.strictEqual(svc.getAutoBackfillBatchSize("nonsense"), 3);
  });

  it("caps the batch size at 20", () => {
    assert.strictEqual(svc.getAutoBackfillBatchSize(50), 20);
  });
});

// ═══════════════════════════════════════════════════════════════
// deriveStaffingStatus  (pure)
// ═══════════════════════════════════════════════════════════════
describe("deriveStaffingStatus", () => {
  const base = { requested_quantity: 2, status: "active" };

  it("returns 'cancelled' when assignment is cancelled", () => {
    const s = svc.deriveStaffingStatus({ ...base, status: "cancelled" }, {
      filledQuantity: 0, reservedQuantity: 0, openQuantity: 2, sourcingCount: 0
    });
    assert.strictEqual(s, "cancelled");
  });

  it("returns 'closed' when assignment is completed", () => {
    const s = svc.deriveStaffingStatus({ ...base, status: "completed" }, {
      filledQuantity: 0, reservedQuantity: 0, openQuantity: 2, sourcingCount: 0
    });
    assert.strictEqual(s, "closed");
  });

  it("returns 'filled' when open<=0 and filled meets requested", () => {
    const s = svc.deriveStaffingStatus({ ...base, requested_quantity: 2 }, {
      filledQuantity: 2, reservedQuantity: 0, openQuantity: 0, sourcingCount: 0
    });
    assert.strictEqual(s, "filled");
  });

  it("returns 'partially_filled' when some filled but still open", () => {
    const s = svc.deriveStaffingStatus({ ...base, requested_quantity: 3 }, {
      filledQuantity: 1, reservedQuantity: 0, openQuantity: 2, sourcingCount: 0
    });
    assert.strictEqual(s, "partially_filled");
  });

  it("returns 'sourcing' when reservations or live invites exist", () => {
    assert.strictEqual(
      svc.deriveStaffingStatus(base, { filledQuantity: 0, reservedQuantity: 1, openQuantity: 1, sourcingCount: 0 }),
      "sourcing"
    );
    assert.strictEqual(
      svc.deriveStaffingStatus(base, { filledQuantity: 0, reservedQuantity: 0, openQuantity: 1, sourcingCount: 2 }),
      "sourcing"
    );
  });

  it("returns 'open' when nothing in flight", () => {
    const s = svc.deriveStaffingStatus(base, {
      filledQuantity: 0, reservedQuantity: 0, openQuantity: 2, sourcingCount: 0
    });
    assert.strictEqual(s, "open");
  });
});

// ═══════════════════════════════════════════════════════════════
// getSuggestionQuickAssignState  (pure)
// ═══════════════════════════════════════════════════════════════
describe("getSuggestionQuickAssignState", () => {
  it("blocks with 'not_suggested' when suggestion missing", () => {
    const r = svc.getSuggestionQuickAssignState(null);
    assert.strictEqual(r.quick_assign_eligible, false);
    assert.strictEqual(r.quick_assign_blockers[0].code, "not_suggested");
  });

  it("is eligible when no blockers present", () => {
    const r = svc.getSuggestionQuickAssignState({
      hard_failures: [],
      missing_requirements: [],
      has_open_invite: false,
      already_contacted: false
    });
    assert.strictEqual(r.quick_assign_eligible, true);
    assert.deepStrictEqual(r.quick_assign_blockers, []);
  });

  it("aggregates and dedupes blockers from all sources", () => {
    const r = svc.getSuggestionQuickAssignState({
      hard_failures: [{ code: "schedule_conflict", label: "X" }, { code: "schedule_conflict", label: "dup" }],
      missing_requirements: [{ code: "skills", label: "S" }],
      has_open_invite: true,
      already_contacted: true
    });
    assert.strictEqual(r.quick_assign_eligible, false);
    const codes = r.quick_assign_blockers.map((b) => b.code).sort();
    assert.deepStrictEqual(codes, ["already_contacted", "open_invite", "schedule_conflict", "skills"]);
    // dedup: schedule_conflict appears only once
    assert.strictEqual(r.quick_assign_blockers.filter((b) => b.code === "schedule_conflict").length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// recalcAssignmentStaffing
// ═══════════════════════════════════════════════════════════════
describe("recalcAssignmentStaffing", () => {
  it("returns null when assignment not found", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignments a")) return rows([]); // loadAssignmentContext
      return rows([]);
    });
    const result = await svc.recalcAssignmentStaffing(pool, "missing-id");
    assert.strictEqual(result, null);
  });

  it("computes filled/reserved/open and persists derived status", async () => {
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1",
      requested_quantity: 3, worker_count: 3, status: "active",
      start_date: "2026-07-01", planned_end_date: "2026-07-10"
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]); // load
      if (sql.includes("AS filled_quantity")) {
        return rows([{ filled_quantity: 1, pending_quantity: 1, reservation_quantity: 0, live_invite_quantity: 1 }]);
      }
      if (sql.includes("UPDATE assignments")) {
        return rows([{ ...assignment, filled_quantity: 1, reserved_quantity: 1, open_quantity: 1, staffing_status: "partially_filled" }]);
      }
      if (sql.includes("FROM demand_requests")) return rows([]); // no demand
      return rows([]);
    });

    const result = await svc.recalcAssignmentStaffing(pool, "a1", { writeEvent: true });
    assert.strictEqual(result.filled_quantity, 1);
    assert.strictEqual(result.reserved_quantity, 1);
    assert.strictEqual(result.open_quantity, 1);
    assert.strictEqual(result.staffing_status, "partially_filled");

    // UPDATE was called with computed values: requested=3, filled=1, reserved=1, open=1
    const upd = callWith(pool, "UPDATE assignments");
    assert.deepStrictEqual(upd.params.slice(0, 6), ["a1", 3, 1, 1, 1, "partially_filled"]);
    // a staffing event was written
    assert.ok(sqlSeen(pool, "INSERT INTO assignment_staffing_events"));
  });

  it("skips event write when writeEvent=false", async () => {
    const assignment = { id: "a2", org_id: "o1", supplier_org_id: "s1", requested_quantity: 1, status: "active" };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, filled_quantity: 0, reserved_quantity: 0, open_quantity: 1, staffing_status: "open" }]);
      return rows([]);
    });
    await svc.recalcAssignmentStaffing(pool, "a2", { writeEvent: false });
    assert.strictEqual(sqlSeen(pool, "INSERT INTO assignment_staffing_events"), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// listOpenStaffingAssignments / listClosedDealAssignments
// ═══════════════════════════════════════════════════════════════
describe("listOpenStaffingAssignments", () => {
  it("returns rows and clamps the limit param", async () => {
    const expected = [{ assignment_id: "a1", open_quantity: 2 }];
    const pool = trackingPool(() => rows(expected));
    const result = await svc.listOpenStaffingAssignments(pool, "s1", { limit: 9999 });
    assert.deepStrictEqual(result, expected);
    const call = pool.calls[0];
    assert.strictEqual(call.params[0], "s1");
    assert.strictEqual(call.params[1], 250); // clamped to max
  });

  it("uses the default limit when none provided", async () => {
    const pool = trackingPool(() => rows([]));
    await svc.listOpenStaffingAssignments(pool, "s1");
    assert.strictEqual(pool.calls[0].params[1], 50);
  });
});

describe("listClosedDealAssignments", () => {
  it("returns rows for the supplier org", async () => {
    const expected = [{ assignment_id: "a9" }];
    const pool = trackingPool(() => rows(expected));
    const result = await svc.listClosedDealAssignments(pool, "s1", { limit: 5 });
    assert.deepStrictEqual(result, expected);
    assert.strictEqual(pool.calls[0].params[0], "s1");
  });
});

// ═══════════════════════════════════════════════════════════════
// listAssignmentsReadyForAutoBackfill
// ═══════════════════════════════════════════════════════════════
describe("listAssignmentsReadyForAutoBackfill", () => {
  it("clamps cooldown + limit and returns rows", async () => {
    const expected = [{ assignment_id: "a1", open_quantity: 1, campaign_id: "c1" }];
    const pool = trackingPool(() => rows(expected));
    const result = await svc.listAssignmentsReadyForAutoBackfill(pool, { limit: 9999, cooldownMinutes: 99999 });
    assert.deepStrictEqual(result, expected);
    const call = pool.calls[0];
    assert.strictEqual(call.params[0], 1440); // cooldown clamped to max
    assert.strictEqual(call.params[1], 100);  // limit clamped to max
  });
});

// ═══════════════════════════════════════════════════════════════
// loadAssignmentContext-gated exports: error branches
// ═══════════════════════════════════════════════════════════════
describe("getAssignmentStaffingOverview", () => {
  it("returns null when assignment cannot be loaded", async () => {
    const pool = trackingPool(() => rows([])); // every load returns empty
    const result = await svc.getAssignmentStaffingOverview(pool, "a1", "s1");
    assert.strictEqual(result, null);
  });

  it("returns null when supplierOrgId does not match", async () => {
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "OTHER", requested_quantity: 1, status: "active" };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 1, staffing_status: "open" }]);
      return rows([]);
    });
    const result = await svc.getAssignmentStaffingOverview(pool, "a1", "s1");
    assert.strictEqual(result, null);
  });
});

describe("listAssignmentSuggestions", () => {
  it("returns null when assignment not found / not owned", async () => {
    const pool = trackingPool(() => rows([])); // loadAssignmentContext empty
    const result = await svc.listAssignmentSuggestions(pool, "a1", "s1");
    assert.strictEqual(result, null);
  });

  it("scores workers and returns summary + suggestions", async () => {
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1", requested_quantity: 2, status: "active",
      start_date: "2026-07-01", planned_end_date: "2026-07-10",
      requisition_skill_tags: ["pflege"]
    };
    const worker = {
      user_id: "w1", first_name: "Anna", last_name: "Beispiel", city: "Hamburg",
      skill_tags: ["pflege"], qualifications: [], is_active: true, email: "a@b.de",
      verified_doc_count: 1, confirmed_assignment_count: 3
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM worker_profiles wp") && sql.includes("link_stats")) return rows([worker]); // queryWorkerSuggestionBase
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]); // load + recalc load
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      if (sql.includes("FROM assignment_staffing_waitlist")) return rows([{ queued_count: 0, invited_count: 0, reserved_count: 0, assigned_count: 0, removed_count: 0 }]);
      return rows([]);
    });

    const result = await svc.listAssignmentSuggestions(pool, "a1", "s1", { limit: 10 });
    assert.ok(result);
    assert.strictEqual(result.summary.total_candidates, 1);
    assert.strictEqual(result.suggestions.length, 1);
    assert.strictEqual(result.suggestions[0].worker_user_id, "w1");
    // worker had the required skill → hard_match true, selectable
    assert.strictEqual(result.suggestions[0].is_selectable, true);
    assert.strictEqual(result.requirements.required_skills.includes("pflege"), true);
  });
});

// ═══════════════════════════════════════════════════════════════
// createStaffingCampaign — error branches
// ═══════════════════════════════════════════════════════════════
describe("createStaffingCampaign", () => {
  it("errors ASSIGNMENT_NOT_FOUND when load fails", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.createStaffingCampaign(pool, {
      assignmentId: "a1", supplierOrgId: "s1", actorId: "u1", workerUserIds: ["w1"]
    });
    assert.deepStrictEqual(result, { error: "ASSIGNMENT_NOT_FOUND" });
  });

  it("errors ASSIGNMENT_NOT_ASSIGNABLE for non-assignable status", async () => {
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "completed", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.createStaffingCampaign(pool, {
      assignmentId: "a1", supplierOrgId: "s1", actorId: "u1", workerUserIds: ["w1"]
    });
    assert.strictEqual(result.error, "ASSIGNMENT_NOT_ASSIGNABLE");
    assert.strictEqual(result.status, "completed");
  });

  it("errors ASSIGNMENT_FILLED when no open quantity", async () => {
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 1, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, filled_quantity: 1, open_quantity: 0, staffing_status: "filled" }]);
      return rows([]);
    });
    const result = await svc.createStaffingCampaign(pool, {
      assignmentId: "a1", supplierOrgId: "s1", actorId: "u1", workerUserIds: ["w1"]
    });
    assert.deepStrictEqual(result, { error: "ASSIGNMENT_FILLED" });
  });

  it("errors NO_WORKERS_SELECTED when worker list empty", async () => {
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 2 };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      return rows([]);
    });
    const result = await svc.createStaffingCampaign(pool, {
      assignmentId: "a1", supplierOrgId: "s1", actorId: "u1", workerUserIds: []
    });
    assert.deepStrictEqual(result, { error: "NO_WORKERS_SELECTED" });
  });

  it("errors NO_ELIGIBLE_WORKERS when selected worker cannot be invited", async () => {
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active",
      requested_quantity: 2, start_date: "2026-07-01", planned_end_date: "2026-07-10"
    };
    // worker already has an open invite → can_invite false → skipped
    const worker = {
      user_id: "w1", first_name: "A", last_name: "B", skill_tags: [], qualifications: [],
      is_active: true, open_invite_count: 1, historical_invite_count: 1
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      if (sql.includes("FROM worker_profiles wp") && sql.includes("link_stats")) return rows([worker]);
      return rows([]);
    });
    const result = await svc.createStaffingCampaign(pool, {
      assignmentId: "a1", supplierOrgId: "s1", actorId: "u1", workerUserIds: ["w1"]
    });
    assert.strictEqual(result.error, "NO_ELIGIBLE_WORKERS");
    // historical_invite_count>0 → already_contacted is checked first, so it wins
    // over open_invite as the skip reason.
    assert.strictEqual(result.skipped_workers[0].reason, "already_contacted");
    assert.strictEqual(result.skipped_workers[0].worker_user_id, "w1");
  });
});

// ═══════════════════════════════════════════════════════════════
// queueAssignmentWaitlistWorkers — error branches
// ═══════════════════════════════════════════════════════════════
describe("queueAssignmentWaitlistWorkers", () => {
  it("errors ASSIGNMENT_NOT_FOUND", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.queueAssignmentWaitlistWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "s1", actorId: "u1", workerUserIds: ["w1"]
    });
    assert.deepStrictEqual(result, { error: "ASSIGNMENT_NOT_FOUND" });
  });

  it("errors NO_WORKERS_SELECTED when list empty", async () => {
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active" };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.queueAssignmentWaitlistWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "s1", actorId: "u1", workerUserIds: []
    });
    assert.deepStrictEqual(result, { error: "NO_WORKERS_SELECTED" });
  });
});

// ═══════════════════════════════════════════════════════════════
// sendStaffingWaitlistWave — error branches
// ═══════════════════════════════════════════════════════════════
describe("sendStaffingWaitlistWave", () => {
  it("errors ASSIGNMENT_NOT_FOUND", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.sendStaffingWaitlistWave(pool, { assignmentId: "a1", supplierOrgId: "s1", actorId: "u1" });
    assert.deepStrictEqual(result, { error: "ASSIGNMENT_NOT_FOUND" });
  });

  it("errors NO_WAITLIST_CANDIDATES when queue is empty", async () => {
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 2, start_date: "2026-07-01" };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      // getAssignmentWaitlistRootCampaignId + selectQueuedWaitlistCandidatesForWave both empty
      return rows([]);
    });
    const result = await svc.sendStaffingWaitlistWave(pool, { assignmentId: "a1", supplierOrgId: "s1", actorId: "u1" });
    assert.strictEqual(result.error, "NO_WAITLIST_CANDIDATES");
  });
});

// ═══════════════════════════════════════════════════════════════
// markStaffingInviteViewed
// ═══════════════════════════════════════════════════════════════
describe("markStaffingInviteViewed", () => {
  it("returns null when no live invite matches", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("UPDATE assignment_staffing_invites")) return rows([]);
      return rows([]);
    });
    const result = await svc.markStaffingInviteViewed(pool, "i1", "w1");
    assert.strictEqual(result, null);
  });

  it("transitions invite to viewed, refreshes metrics, writes event", async () => {
    const invite = { id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1", status: "viewed" };
    const pool = trackingPool((sql) => {
      if (sql.includes("UPDATE assignment_staffing_invites")) return rows([invite]);
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) return rows([{ id: "c1", status: "active" }]);
      if (sql.includes("AS total_count")) return rows([{ total_count: 1, live_count: 1 }]);
      if (sql.includes("UPDATE assignment_staffing_campaigns")) return rows([{ id: "c1", status: "active" }]);
      return rows([]);
    });
    const result = await svc.markStaffingInviteViewed(pool, "i1", "w1");
    assert.strictEqual(result.id, "i1");
    assert.ok(sqlSeen(pool, "INSERT INTO assignment_staffing_events"));
  });
});

// ═══════════════════════════════════════════════════════════════
// listWorkerStaffingRequests
// ═══════════════════════════════════════════════════════════════
describe("listWorkerStaffingRequests", () => {
  it("returns [] when worker has no live invites", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i")) return rows([]);
      return rows([]);
    });
    const result = await svc.listWorkerStaffingRequests(pool, "w1");
    assert.deepStrictEqual(result, []);
  });

  it("enriches invites with priority + request context + conflicts", async () => {
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      status: "sent", score: 85, sent_at: "2026-06-01T00:00:00Z",
      start_date: "2026-07-01", planned_end_date: "2026-07-10",
      request_snapshot: JSON.stringify({ title: "Pflegekraft", open_quantity: 1 }),
      delivery_status: "delivered"
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("ORDER BY i.sent_at DESC")) return rows([invite]);
      // message aggregation (latest_messages) → empty
      if (sql.includes("latest_messages")) return rows([]);
      // scheduling conflicts → none
      if (sql.includes("conflict_type")) return rows([]);
      return rows([]);
    });
    const result = await svc.listWorkerStaffingRequests(pool, "w1");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "i1");
    assert.strictEqual(result[0].priority.level, "high"); // score 85 → high
    assert.strictEqual(result[0].request_context.title, "Pflegekraft");
    assert.strictEqual(result[0].message_summary.total_messages, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// askStaffingInviteQuestion
// ═══════════════════════════════════════════════════════════════
describe("askStaffingInviteQuestion", () => {
  it("errors QUESTION_REQUIRED for blank question", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.askStaffingInviteQuestion(pool, { inviteId: "i1", workerUserId: "w1", question: "   " });
    assert.deepStrictEqual(result, { error: "QUESTION_REQUIRED" });
    assert.strictEqual(pool.calls.length, 0); // short-circuits before any query
  });

  it("errors INVITE_NOT_FOUND when invite missing", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i")) return rows([]); // loadWorkerInviteActionContext
      return rows([]);
    });
    const result = await svc.askStaffingInviteQuestion(pool, { inviteId: "i1", workerUserId: "w1", question: "Wann?" });
    assert.deepStrictEqual(result, { error: "INVITE_NOT_FOUND" });
  });

  it("writes a question message and moves the invite to interested", async () => {
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status: "sent", campaign_created_by: "disp1",
      first_name: "Anna", last_name: "B"
    };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([invite]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]); // expire ctx load
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 1, staffing_status: "open" }]);
      if (sql.includes("UPDATE assignment_staffing_invites")) return rows([{ ...invite, status: "interested" }]);
      if (sql.includes("INSERT INTO assignment_staffing_messages")) return rows([{ id: "m1", message_type: "question" }]);
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) return rows([{ id: "c1", status: "active" }]);
      if (sql.includes("AS total_count")) return rows([{ total_count: 1, live_count: 1 }]);
      if (sql.includes("UPDATE assignment_staffing_campaigns")) return rows([{ id: "c1", status: "active" }]);
      return rows([]);
    });
    const result = await svc.askStaffingInviteQuestion(pool, { inviteId: "i1", workerUserId: "w1", question: "Wann startet es?" });
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.invite.status, "interested");
    assert.strictEqual(result.message.id, "m1");
    assert.strictEqual(result.dispatcher_user_id, "disp1");
    assert.strictEqual(result.worker_name, "Anna B");
    // the worker question was persisted with the trimmed body
    const msg = callWith(pool, "INSERT INTO assignment_staffing_messages");
    assert.ok(msg.params.includes("Wann startet es?"));
  });
});

// ═══════════════════════════════════════════════════════════════
// requestStaffingInviteReminder
// ═══════════════════════════════════════════════════════════════
describe("requestStaffingInviteReminder", () => {
  it("errors INVITE_NOT_FOUND when invite missing", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i")) return rows([]);
      return rows([]);
    });
    const result = await svc.requestStaffingInviteReminder(pool, { inviteId: "i1", workerUserId: "w1" });
    assert.deepStrictEqual(result, { error: "INVITE_NOT_FOUND" });
  });

  it("errors INVITE_EXPIRES_TOO_SOON when expiry leaves no reminder window", async () => {
    const soon = new Date(Date.now() + 60 * 1000).toISOString(); // 1 min away
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status: "sent", expires_at: soon
    };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([invite]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 1, staffing_status: "open" }]);
      return rows([]);
    });
    // expires_at is in the future but < min reminder window → but also expire ctx
    // treats it as still-live (not yet expired). resolveReminderTarget returns error.
    const result = await svc.requestStaffingInviteReminder(pool, { inviteId: "i1", workerUserId: "w1" });
    assert.deepStrictEqual(result, { error: "INVITE_EXPIRES_TOO_SOON" });
  });

  it("schedules a reminder and writes a reminder_request message", async () => {
    const farFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status: "sent", expires_at: farFuture
    };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([invite]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 1, staffing_status: "open" }]);
      if (sql.includes("UPDATE assignment_staffing_invites")) return rows([{ ...invite, status: "viewed" }]);
      if (sql.includes("INSERT INTO assignment_staffing_messages")) return rows([{ id: "m1", message_type: "reminder_request" }]);
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) return rows([{ id: "c1", status: "active" }]);
      if (sql.includes("AS total_count")) return rows([{ total_count: 1, live_count: 1 }]);
      if (sql.includes("UPDATE assignment_staffing_campaigns")) return rows([{ id: "c1", status: "active" }]);
      return rows([]);
    });
    const result = await svc.requestStaffingInviteReminder(pool, { inviteId: "i1", workerUserId: "w1", remindAfterMinutes: 120 });
    assert.strictEqual(result.error, undefined);
    assert.ok(result.remind_after instanceof Date);
    assert.ok(result.reminder_minutes >= 15);
    assert.ok(sqlSeen(pool, "INSERT INTO assignment_staffing_messages"));
  });
});

// ═══════════════════════════════════════════════════════════════
// respondToStaffingInvite — decline + accept + error
// ═══════════════════════════════════════════════════════════════
describe("respondToStaffingInvite", () => {
  it("errors INVITE_NOT_FOUND", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i")) return rows([]);
      return rows([]);
    });
    const result = await svc.respondToStaffingInvite(pool, { inviteId: "i1", workerUserId: "w1", action: "accept" });
    assert.deepStrictEqual(result, { error: "INVITE_NOT_FOUND" });
  });

  it("declines an invite and updates waitlist/metrics", async () => {
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status: "sent", campaign_created_by: "disp1",
      first_name: "Anna", last_name: "B", source_campaign_id: "c1"
    };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([invite]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 1, staffing_status: "open" }]);
      if (sql.includes("status = 'declined'")) return rows([{ ...invite, status: "declined" }]);
      if (sql.includes("UPDATE assignment_staffing_waitlist")) return rows([{ id: "wl1", status: "removed" }]);
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) return rows([{ id: "c1", status: "active" }]);
      if (sql.includes("AS total_count")) return rows([{ total_count: 1, live_count: 0 }]);
      if (sql.includes("UPDATE assignment_staffing_campaigns")) return rows([{ id: "c1", status: "completed" }]);
      return rows([]);
    });
    const result = await svc.respondToStaffingInvite(pool, { inviteId: "i1", workerUserId: "w1", action: "decline", note: "kein Interesse" });
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.invite.status, "declined");
    assert.strictEqual(result.dispatcher_user_id, "disp1");
    assert.ok(sqlSeen(pool, "status = 'declined'"));
  });

  it("blocks accept with ASSIGNMENT_FILLED when no open quantity", async () => {
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status: "sent", campaign_created_by: "disp1",
      promotion_mode: "manual_review"
    };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([invite]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 1, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, filled_quantity: 1, open_quantity: 0, staffing_status: "filled" }]);
      return rows([]);
    });
    const result = await svc.respondToStaffingInvite(pool, { inviteId: "i1", workerUserId: "w1", action: "accept" });
    assert.deepStrictEqual(result, { error: "ASSIGNMENT_FILLED" });
  });
});

// ═══════════════════════════════════════════════════════════════
// promoteReservation
// ═══════════════════════════════════════════════════════════════
describe("promoteReservation", () => {
  it("errors RESERVATION_NOT_FOUND when no reservation row", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_reservations")) return rows([]);
      return rows([]);
    });
    const result = await svc.promoteReservation(pool, "r1", { actorId: "u1" });
    assert.deepStrictEqual(result, { error: "RESERVATION_NOT_FOUND" });
  });

  it("errors RESERVATION_NOT_ACTIVE when reservation is not 'reserved'", async () => {
    const reservation = { id: "r1", assignment_id: "a1", worker_user_id: "w1", status: "expired", campaign_id: "c1" };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_reservations")) return rows([reservation]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.promoteReservation(pool, "r1", { actorId: "u1" });
    assert.strictEqual(result.error, "RESERVATION_NOT_ACTIVE");
    assert.strictEqual(result.current_status, "expired");
  });
});

// ═══════════════════════════════════════════════════════════════
// expireStaleStaffingState
// ═══════════════════════════════════════════════════════════════
describe("expireStaleStaffingState", () => {
  it("returns zero counts when nothing is stale", async () => {
    const pool = trackingPool(() => rows([])); // no invites, no reservations
    const result = await svc.expireStaleStaffingState(pool);
    assert.deepStrictEqual(result, { expired_invites: 0, expired_reservations: 0 });
  });

  it("expires stale invites and reservations and recalculates", async () => {
    const staleInvite = { id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1" };
    const staleRes = { id: "r1", assignment_id: "a1", campaign_id: "c1", invite_id: "i2", worker_user_id: "w2" };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 2 };
    let inviteSelectDone = false;
    const pool = trackingPool((sql) => {
      // first FOR UPDATE select = invites, second = reservations
      if (sql.includes("FROM assignment_staffing_invites") && sql.includes("expires_at <= NOW()") && sql.includes("FOR UPDATE")) {
        return rows([staleInvite]);
      }
      if (sql.includes("FROM assignment_staffing_reservations") && sql.includes("expires_at <= NOW()") && sql.includes("FOR UPDATE")) {
        return rows([staleRes]);
      }
      if (sql.includes("COALESCE(source_campaign_id, id)")) return rows([{ root_campaign_id: "c1" }]);
      if (sql.includes("UPDATE assignment_staffing_waitlist")) return rows([{ id: "wl", status: "removed" }]);
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) return rows([{ id: "c1", status: "active" }]);
      if (sql.includes("AS total_count")) return rows([{ total_count: 1, live_count: 0 }]);
      if (sql.includes("UPDATE assignment_staffing_campaigns")) return rows([{ id: "c1", status: "completed" }]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      return rows([]);
    });
    const result = await svc.expireStaleStaffingState(pool);
    assert.strictEqual(result.expired_invites, 1);
    assert.strictEqual(result.expired_reservations, 1);
    assert.ok(sqlSeen(pool, "status = 'expired'"));
  });
});

// ═══════════════════════════════════════════════════════════════
// dispatchDueStaffingReminders
// ═══════════════════════════════════════════════════════════════
describe("dispatchDueStaffingReminders", () => {
  it("returns 0 when no reminders are due", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.dispatchDueStaffingReminders(pool, { limit: 10 });
    assert.deepStrictEqual(result, { reminders_queued: 0 });
  });

  it("queues reminder delivery for each due invite", async () => {
    const due = [{ id: "i1" }, { id: "i2" }];
    const pool = trackingPool((sql) => {
      if (sql.includes("remind_after <= NOW()") && sql.includes("FOR UPDATE SKIP LOCKED")) return rows(due);
      // markInviteDeliveryQueued: UPDATE ... delivery_status = 'queued' returns the invite
      if (sql.includes("delivery_status = 'queued'")) return rows([{ id: "i1", assignment_id: "a1", campaign_id: "c1", status: "sent", remind_after: null }]);
      return rows([]);
    });
    const result = await svc.dispatchDueStaffingReminders(pool, { limit: 10 });
    assert.strictEqual(result.reminders_queued, 2);
  });
});

// ═══════════════════════════════════════════════════════════════
// runAutoBackfill — no candidates path
// ═══════════════════════════════════════════════════════════════
describe("runAutoBackfill", () => {
  it("returns an empty summary when no assignments are ready", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.runAutoBackfill(pool, { limit: 5 });
    assert.strictEqual(result.assignments_considered, 0);
    assert.strictEqual(result.assignments_backfilled, 0);
    assert.strictEqual(result.campaigns_created, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// createStaffingChoiceSet — validation branches
// ═══════════════════════════════════════════════════════════════
describe("createStaffingChoiceSet", () => {
  it("errors INSUFFICIENT_OPTIONS with fewer than 2 distinct assignments", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.createStaffingChoiceSet(pool, {
      workerUserId: "w1", supplierOrgId: "s1", actorId: "u1", assignmentIds: ["a1"]
    });
    assert.deepStrictEqual(result, { error: "INSUFFICIENT_OPTIONS" });
    assert.strictEqual(pool.calls.length, 0);
  });

  it("errors INVALID_CHOICE_MODE for unknown mode", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.createStaffingChoiceSet(pool, {
      workerUserId: "w1", supplierOrgId: "s1", actorId: "u1",
      assignmentIds: ["a1", "a2"], choiceMode: "bogus"
    });
    assert.deepStrictEqual(result, { error: "INVALID_CHOICE_MODE" });
  });

  it("errors INVALID_RESPONSE_DEADLINE for an unparseable deadline", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.createStaffingChoiceSet(pool, {
      workerUserId: "w1", supplierOrgId: "s1", actorId: "u1",
      assignmentIds: ["a1", "a2"], responseDeadlineAt: "not-a-date"
    });
    assert.deepStrictEqual(result, { error: "INVALID_RESPONSE_DEADLINE" });
  });

  it("errors WORKER_NOT_FOUND when worker not in supplier org", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM worker_profiles wp")) return rows([]); // worker lookup empty
      return rows([]);
    });
    const result = await svc.createStaffingChoiceSet(pool, {
      workerUserId: "w1", supplierOrgId: "s1", actorId: "u1",
      assignmentIds: ["a1", "a2"]
    });
    assert.deepStrictEqual(result, { error: "WORKER_NOT_FOUND" });
  });

  it("errors WORKER_INACTIVE for inactive worker", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM worker_profiles wp") && sql.includes("wp.is_active")) {
        return rows([{ user_id: "w1", is_active: false, first_name: "A", last_name: "B" }]);
      }
      return rows([]);
    });
    const result = await svc.createStaffingChoiceSet(pool, {
      workerUserId: "w1", supplierOrgId: "s1", actorId: "u1",
      assignmentIds: ["a1", "a2"]
    });
    assert.deepStrictEqual(result, { error: "WORKER_INACTIVE" });
  });

  it("errors CHOICE_SET_OPTION_ALREADY_ACTIVE when an option overlaps an active set", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM worker_profiles wp") && sql.includes("wp.is_active")) {
        return rows([{ user_id: "w1", is_active: true, first_name: "A", last_name: "B" }]);
      }
      if (sql.includes("FROM assignment_staffing_choice_sets cs") && sql.includes("opt.assignment_id = ANY")) {
        return rows([{ assignment_id: "a1" }]);
      }
      return rows([]);
    });
    const result = await svc.createStaffingChoiceSet(pool, {
      workerUserId: "w1", supplierOrgId: "s1", actorId: "u1",
      assignmentIds: ["a1", "a2"]
    });
    assert.strictEqual(result.error, "CHOICE_SET_OPTION_ALREADY_ACTIVE");
    assert.deepStrictEqual(result.assignment_ids, ["a1"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// submitStaffingChoicePreferences — error branches (no live set)
// ═══════════════════════════════════════════════════════════════
describe("submitStaffingChoicePreferences", () => {
  it("errors CHOICE_SET_NOT_FOUND when the set cannot be loaded", async () => {
    const pool = trackingPool(() => rows([])); // loadSingleStaffingChoiceSet empty
    const result = await svc.submitStaffingChoicePreferences(pool, {
      choiceSetId: "cs1", workerUserId: "w1", primaryOptionId: "o1"
    });
    assert.strictEqual(result.error, "CHOICE_SET_NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// declineStaffingChoiceSet — error branch
// ═══════════════════════════════════════════════════════════════
describe("declineStaffingChoiceSet", () => {
  it("errors CHOICE_SET_NOT_FOUND when the set cannot be loaded", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.declineStaffingChoiceSet(pool, { choiceSetId: "cs1", workerUserId: "w1" });
    assert.strictEqual(result.error, "CHOICE_SET_NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// selectStaffingChoiceOption — error branch
// ═══════════════════════════════════════════════════════════════
describe("selectStaffingChoiceOption", () => {
  it("errors CHOICE_SET_NOT_FOUND when the set cannot be loaded", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.selectStaffingChoiceOption(pool, {
      choiceSetId: "cs1", workerUserId: "w1", optionId: "o1"
    });
    assert.strictEqual(result.error, "CHOICE_SET_NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// submitStaffingChoiceRanking — error branch
// ═══════════════════════════════════════════════════════════════
describe("submitStaffingChoiceRanking", () => {
  it("errors CHOICE_SET_NOT_FOUND when the set cannot be loaded", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.submitStaffingChoiceRanking(pool, {
      choiceSetId: "cs1", workerUserId: "w1", ranking: [{ option_id: "o1", rank: 1 }]
    });
    assert.strictEqual(result.error, "CHOICE_SET_NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// listWorkerStaffingChoiceSets / getStaffingChoiceSet
// ═══════════════════════════════════════════════════════════════
describe("listWorkerStaffingChoiceSets", () => {
  it("returns [] when worker has no active choice sets", async () => {
    const pool = trackingPool(() => rows([])); // listStaffingChoiceSetIds empty
    const result = await svc.listWorkerStaffingChoiceSets(pool, "w1");
    assert.deepStrictEqual(result, []);
  });
});

describe("getStaffingChoiceSet", () => {
  it("returns null when the choice set does not exist", async () => {
    const pool = trackingPool(() => rows([]));
    const result = await svc.getStaffingChoiceSet(pool, "cs1", { workerUserId: "w1" });
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// autoStopFilledAssignment
// ═══════════════════════════════════════════════════════════════
describe("autoStopFilledAssignment", () => {
  it("returns null staffing when assignment missing", async () => {
    const pool = trackingPool(() => rows([])); // recalc load empty → null
    const result = await svc.autoStopFilledAssignment(pool, "a1", "u1");
    assert.strictEqual(result, null);
  });

  it("does not auto-stop while open quantity remains", async () => {
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 2 };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      return rows([]);
    });
    const result = await svc.autoStopFilledAssignment(pool, "a1", "u1");
    assert.strictEqual(result.open_quantity, 2);
    // no campaign auto-stop happened
    assert.strictEqual(sqlSeen(pool, "status = 'auto_stopped'"), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// runStaffingMaintenance — orchestration
// ═══════════════════════════════════════════════════════════════
describe("runStaffingMaintenance", () => {
  it("aggregates expire + reminder + backfill results", async () => {
    const pool = trackingPool(() => rows([])); // everything empty/no-op
    const result = await svc.runStaffingMaintenance(pool, { limit: 5 });
    assert.strictEqual(result.expired_invites, 0);
    assert.strictEqual(result.expired_reservations, 0);
    assert.strictEqual(result.reminders_queued, 0);
    assert.strictEqual(result.assignments_considered, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// processStaffingDeliveryJob — skipped paths
// ═══════════════════════════════════════════════════════════════
describe("processStaffingDeliveryJob", () => {
  it("skips when the invite is not found", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i")) return rows([]); // loadInviteDeliveryContext
      return rows([]);
    });
    const result = await svc.processStaffingDeliveryJob(pool, { inviteId: "i1", kind: "initial" });
    assert.deepStrictEqual(result, { skipped: "INVITE_NOT_FOUND" });
  });

  it("skips when the invite is no longer live", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i")) {
        return rows([{ id: "i1", status: "declined", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1" }]);
      }
      return rows([]);
    });
    const result = await svc.processStaffingDeliveryJob(pool, { inviteId: "i1", kind: "initial" });
    assert.deepStrictEqual(result, { skipped: "INVITE_NOT_LIVE" });
  });

  it("skips a reminder that is not yet due", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i")) {
        return rows([{ id: "i1", status: "sent", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1", remind_after: future }]);
      }
      return rows([]);
    });
    const result = await svc.processStaffingDeliveryJob(pool, { inviteId: "i1", kind: "reminder" });
    assert.deepStrictEqual(result, { skipped: "REMINDER_NOT_DUE" });
  });
});
