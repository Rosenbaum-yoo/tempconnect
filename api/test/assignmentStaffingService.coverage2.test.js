/**
 * assignmentStaffingService — COMPLEMENTARY behavior coverage (coverage2).
 *
 * Run: node --test --test-force-exit test/assignmentStaffingService.coverage2.test.js
 *
 * This suite is intentionally non-overlapping with
 * assignmentStaffingService.coverage.test.js. That file covers:
 *   - the pure helpers (getAutoBackfillBatchSize / deriveStaffingStatus /
 *     getSuggestionQuickAssignState),
 *   - the "not found / empty / first validation" error branch of most
 *     DB-backed exports.
 *
 * Here we drive the REMAINING uncovered behavior:
 *   - happy paths (success returns + state transitions) for
 *     queueAssignmentWaitlistWorkers, sendStaffingWaitlistWave,
 *     respondToStaffingInvite (accept→reserve→promote), promoteReservation,
 *     markStaffingInviteViewed (no-op status), getStaffingChoiceSet,
 *     syncStaffingChoiceSetsForAssignmentLink,
 *   - additional error branches not asserted in coverage.test.js
 *     (ASSIGNMENT_NOT_ASSIGNABLE, ASSIGNMENT_FILLED, INVITE_NOT_ACTIONABLE,
 *     INVITE_CONTROLLED_BY_CHOICE_SET, SCHEDULE_CONFLICT, RESERVATION_EXPIRED,
 *     CHOICE_SET_MODE_MISMATCH, NO_PREFERENCE_SELECTED, NO_RANKING_SELECTED,
 *     CHOICE_OPTION_NOT_FOUND, CHOICE_SET_ALREADY_ASSIGNED, …).
 *
 * Same trackingPool idiom: a mock pool that routes each query to a handler
 * keyed by SQL fragments, records all calls, and returns realistic
 * { rows, rowCount } shapes. The BullMQ enqueue() returns null in the test
 * env (no Redis) so invite delivery runs inline against this mock pool.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/assignmentStaffingService.js";

// ── trackingPool ───────────────────────────────────────────────
const TX = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);

function trackingPool(handler) {
  const calls = [];
  const query = async (sql, params) => {
    const text = String(sql);
    if (TX.has(text.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    calls.push({ sql: text, params: params || [] });
    /* Fixture-Pflege (Befund E-12): die Zugehoerigkeitswache vor der
       Neuberechnung. Siehe Kommentar in
       dealStaffingFastTrackService.coverage.test.js. */
    if (/SELECT 1 FROM assignments\s+WHERE id = \$1 AND supplier_org_id = \$2/i.test(text)) {
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    }
    /* Fixture-Pflege (Befund E-13): `getStaffingChoiceSet` klaert seit der
       Reparatur ZUERST die Zugehoerigkeit, bevor der Lebenszyklus
       fortgeschrieben wird — vorher schrieb ein fremder Zugriff den Status
       einer fremden Auswahl fort. Diese Tests fahren die passende Kennung. */
    if (/SELECT 1 FROM assignment_staffing_choice_sets/i.test(text)) {
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    }
    const out = handler(text, params || []);
    if (out === undefined || out === null) return { rows: [], rowCount: 0 };
    return out;
  };
  return {
    query,
    connect: async () => ({ query, release() {} }),
    calls
  };
}

function rows(arr) {
  return { rows: arr, rowCount: arr.length };
}

function sqlSeen(pool, fragment) {
  return pool.calls.some((c) => c.sql.includes(fragment));
}
function callWith(pool, fragment) {
  return pool.calls.find((c) => c.sql.includes(fragment));
}
function callsWith(pool, fragment) {
  return pool.calls.filter((c) => c.sql.includes(fragment));
}

// Shared loader stubs reused across many handlers.
const COUNTERS_EMPTY = { filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 };

// ═══════════════════════════════════════════════════════════════
// STAFFING_CHOICE_MODES (exported constant)
// ═══════════════════════════════════════════════════════════════
describe("STAFFING_CHOICE_MODES", () => {
  it("freezes the canonical mode list", () => {
    assert.deepStrictEqual(svc.STAFFING_CHOICE_MODES, ["preference_only", "ranked_choice", "free_choice"]);
    assert.strictEqual(Object.isFrozen(svc.STAFFING_CHOICE_MODES), true);
  });
});

// ═══════════════════════════════════════════════════════════════
// queueAssignmentWaitlistWorkers — uncovered branches + happy path
// ═══════════════════════════════════════════════════════════════
describe("queueAssignmentWaitlistWorkers (complementary)", () => {
  it("errors ASSIGNMENT_NOT_ASSIGNABLE for a completed assignment", async () => {
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "completed" };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.queueAssignmentWaitlistWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "s1", actorId: "u1", workerUserIds: ["w1"]
    });
    assert.strictEqual(result.error, "ASSIGNMENT_NOT_ASSIGNABLE");
    assert.strictEqual(result.status, "completed");
  });

  it("errors NO_ELIGIBLE_WORKERS when the only worker has an open invite", async () => {
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active",
      requested_quantity: 2, start_date: "2026-07-01", planned_end_date: "2026-07-10"
    };
    const worker = {
      user_id: "w1", first_name: "A", last_name: "B", skill_tags: [], qualifications: [],
      is_active: true, open_invite_count: 1, historical_invite_count: 0
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("FROM worker_profiles wp") && sql.includes("link_stats")) return rows([worker]);
      return rows([]);
    });
    const result = await svc.queueAssignmentWaitlistWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "s1", actorId: "u1", workerUserIds: ["w1"]
    });
    assert.strictEqual(result.error, "NO_ELIGIBLE_WORKERS");
    // historical_invite_count==0 but open_invite_count>0 → reason = open_invite
    assert.strictEqual(result.skipped_workers[0].reason, "open_invite");
  });

  it("queues an eligible worker onto the waitlist and returns the queued rows", async () => {
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active",
      requested_quantity: 2, start_date: "2026-07-01", planned_end_date: "2026-07-10"
    };
    const worker = {
      user_id: "w1", first_name: "Anna", last_name: "Beispiel", city: "Hamburg",
      skill_tags: [], qualifications: [], is_active: true,
      open_invite_count: 0, historical_invite_count: 0
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("FROM worker_profiles wp") && sql.includes("link_stats")) return rows([worker]);
      if (sql.includes("COALESCE(source_campaign_id, id)")) return rows([{ root_campaign_id: "root1" }]);
      if (sql.includes("COALESCE(MAX(queue_rank)")) return rows([{ max_rank: 0 }]);
      if (sql.includes("INSERT INTO assignment_staffing_waitlist")) {
        return rows([{ id: "wl1", worker_user_id: "w1", status: "queued", queue_rank: 1, root_campaign_id: "root1" }]);
      }
      if (sql.includes("AS filled_quantity")) return rows([COUNTERS_EMPTY]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      return rows([]);
    });
    const result = await svc.queueAssignmentWaitlistWorkers(pool, {
      assignmentId: "a1", supplierOrgId: "s1", actorId: "u1", workerUserIds: ["w1", "w1"]
    });
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.root_campaign_id, "root1");
    assert.strictEqual(result.waitlist.length, 1);
    assert.strictEqual(result.waitlist[0].worker_user_id, "w1");
    assert.deepStrictEqual(result.skipped_workers, []);
    // queued status was upserted with status param 'queued'
    const upsert = callWith(pool, "INSERT INTO assignment_staffing_waitlist");
    assert.ok(upsert.params.includes("queued"));
  });
});

// ═══════════════════════════════════════════════════════════════
// sendStaffingWaitlistWave — uncovered branches
// ═══════════════════════════════════════════════════════════════
describe("sendStaffingWaitlistWave (complementary)", () => {
  it("errors ASSIGNMENT_NOT_ASSIGNABLE for non-assignable status", async () => {
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "cancelled" };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.sendStaffingWaitlistWave(pool, { assignmentId: "a1", supplierOrgId: "s1", actorId: "u1" });
    assert.strictEqual(result.error, "ASSIGNMENT_NOT_ASSIGNABLE");
    assert.strictEqual(result.status, "cancelled");
  });

  it("errors ASSIGNMENT_FILLED when no open quantity remains", async () => {
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 1, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, filled_quantity: 1, open_quantity: 0, staffing_status: "filled" }]);
      return rows([]);
    });
    const result = await svc.sendStaffingWaitlistWave(pool, { assignmentId: "a1", supplierOrgId: "s1", actorId: "u1" });
    assert.deepStrictEqual(result, { error: "ASSIGNMENT_FILLED" });
  });
});

// ═══════════════════════════════════════════════════════════════
// markStaffingInviteViewed — invite already past 'sent' (status unchanged)
// ═══════════════════════════════════════════════════════════════
describe("markStaffingInviteViewed (complementary)", () => {
  it("keeps an already-interested invite's status and still writes an event", async () => {
    const invite = { id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1", status: "interested" };
    const pool = trackingPool((sql) => {
      if (sql.includes("UPDATE assignment_staffing_invites")) return rows([invite]);
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) return rows([{ id: "c1", status: "active" }]);
      if (sql.includes("AS total_count")) return rows([{ total_count: 1, live_count: 1 }]);
      if (sql.includes("UPDATE assignment_staffing_campaigns")) return rows([{ id: "c1", status: "active" }]);
      return rows([]);
    });
    const result = await svc.markStaffingInviteViewed(pool, "i1", "w1");
    assert.strictEqual(result.status, "interested");
    // event type is invite_viewed
    const ev = callWith(pool, "INSERT INTO assignment_staffing_events");
    assert.ok(ev.params.includes("invite_viewed"));
  });
});

// ═══════════════════════════════════════════════════════════════
// respondToStaffingInvite — accept happy path + extra error branches
// ═══════════════════════════════════════════════════════════════
describe("respondToStaffingInvite (complementary)", () => {
  it("blocks when the invite is controlled by an active choice set", async () => {
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status: "sent", choice_set_id: "cs1",
      choice_set_status: "options_presented", choice_mode: "free_choice"
    };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([invite]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.respondToStaffingInvite(pool, { inviteId: "i1", workerUserId: "w1", action: "accept" });
    assert.strictEqual(result.error, "INVITE_CONTROLLED_BY_CHOICE_SET");
    assert.strictEqual(result.choice_set_id, "cs1");
    assert.strictEqual(result.choice_mode, "free_choice");
  });

  it("errors INVITE_NOT_ACTIONABLE when the invite is already accepted", async () => {
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status: "accepted"
    };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([invite]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.respondToStaffingInvite(pool, { inviteId: "i1", workerUserId: "w1", action: "accept" });
    assert.strictEqual(result.error, "INVITE_NOT_ACTIONABLE");
    assert.strictEqual(result.current_status, "accepted");
  });

  it("returns SCHEDULE_CONFLICT when the worker has an overlapping assignment", async () => {
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status: "sent", promotion_mode: "manual_review"
    };
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active",
      requested_quantity: 2, start_date: "2026-07-01", planned_end_date: "2026-07-10"
    };
    const conflict = {
      conflict_type: "assignment", conflict_id: "lnk1", assignment_id: "aX",
      title: "Anderer Einsatz", start_date: "2026-07-02", planned_end_date: "2026-07-05", status: "worker_confirmed"
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([invite]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      if (sql.includes("conflict_type")) return rows([conflict]);
      return rows([]);
    });
    const result = await svc.respondToStaffingInvite(pool, { inviteId: "i1", workerUserId: "w1", action: "accept" });
    assert.strictEqual(result.error, "SCHEDULE_CONFLICT");
    assert.deepStrictEqual(result.conflicting_link_ids, ["lnk1"]);
    assert.deepStrictEqual(result.conflicting_reservation_ids, []);
  });

  it("accept under manual_review creates a reservation without promoting", async () => {
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status: "sent", promotion_mode: "manual_review",
      campaign_created_by: "disp1", reservation_window_minutes: 30,
      first_name: "Anna", last_name: "B", source_campaign_id: "c1"
    };
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active",
      requested_quantity: 2, start_date: "2026-07-01", planned_end_date: "2026-07-10"
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([invite]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      if (sql.includes("conflict_type")) return rows([]); // no conflicts
      if (sql.includes("INSERT INTO assignment_staffing_reservations")) {
        return rows([{ id: "res1", assignment_id: "a1", invite_id: "i1", worker_user_id: "w1", status: "reserved", expires_at: new Date(Date.now() + 1800000).toISOString() }]);
      }
      if (sql.includes("status = 'accepted'")) return rows([{ ...invite, status: "accepted" }]);
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) return rows([{ id: "c1", status: "active" }]);
      if (sql.includes("AS total_count")) return rows([{ total_count: 1, live_count: 1 }]);
      if (sql.includes("UPDATE assignment_staffing_campaigns")) return rows([{ id: "c1", status: "active" }]);
      return rows([]);
    });
    const result = await svc.respondToStaffingInvite(pool, { inviteId: "i1", workerUserId: "w1", action: "accept" });
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.invite.status, "accepted");
    assert.strictEqual(result.reservation.id, "res1");
    assert.strictEqual(result.link, null); // manual_review → no auto-promote
    assert.strictEqual(result.dispatcher_user_id, "disp1");
    assert.strictEqual(result.promotion_mode, "manual_review");
    // no worker_assignment_links INSERT happened (promotion skipped)
    assert.strictEqual(sqlSeen(pool, "INSERT INTO worker_assignment_links"), false);
  });

  it("accept under auto_finalize promotes the reservation into a link", async () => {
    const invite = {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status: "sent", promotion_mode: "auto_finalize",
      campaign_created_by: "disp1", reservation_window_minutes: 30,
      first_name: "Anna", last_name: "B", source_campaign_id: "c1"
    };
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active",
      requested_quantity: 2, start_date: "2026-07-01", planned_end_date: "2026-07-10",
      client_org_name: "Klinik"
    };
    const reservation = { id: "res1", assignment_id: "a1", campaign_id: "c1", invite_id: "i1", worker_user_id: "w1", status: "reserved", expires_at: new Date(Date.now() + 1800000).toISOString() };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([invite]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      if (sql.includes("conflict_type")) return rows([]); // no conflicts (also used by promote)
      if (sql.includes("INSERT INTO assignment_staffing_reservations")) return rows([reservation]);
      if (sql.includes("status = 'accepted'")) return rows([{ ...invite, status: "accepted" }]);
      // promoteReservationInternal: existing link check (empty → create)
      if (sql.includes("FROM worker_assignment_links") && sql.includes("LIMIT 1")) return rows([]);
      if (sql.includes("INSERT INTO worker_assignment_links")) return rows([{ id: "link1", assignment_id: "a1", worker_user_id: "w1" }]);
      if (sql.includes("status = 'promoted'")) return rows([{ ...reservation, status: "promoted", promoted_link_id: "link1" }]);
      if (sql.includes("COALESCE(source_campaign_id, id)")) return rows([{ root_campaign_id: "c1" }]);
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) return rows([{ id: "c1", status: "active" }]);
      if (sql.includes("AS total_count")) return rows([{ total_count: 1, live_count: 1 }]);
      if (sql.includes("UPDATE assignment_staffing_campaigns")) return rows([{ id: "c1", status: "active" }]);
      return rows([]);
    });
    const result = await svc.respondToStaffingInvite(pool, { inviteId: "i1", workerUserId: "w1", action: "accept" });
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.link.id, "link1");
    assert.strictEqual(result.reservation.status, "promoted");
    // a worker_assignment_links row WAS created
    assert.ok(sqlSeen(pool, "INSERT INTO worker_assignment_links"));
    assert.ok(sqlSeen(pool, "status = 'promoted'"));
  });
});

// ═══════════════════════════════════════════════════════════════
// promoteReservation — uncovered branches + happy path
// ═══════════════════════════════════════════════════════════════
describe("promoteReservation (complementary)", () => {
  it("errors ASSIGNMENT_NOT_FOUND when the reservation's assignment is gone", async () => {
    const reservation = { id: "r1", assignment_id: "a1", worker_user_id: "w1", status: "reserved", campaign_id: "c1" };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_reservations") && sql.includes("FOR UPDATE")) return rows([reservation]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([]); // assignment missing
      return rows([]);
    });
    const result = await svc.promoteReservation(pool, "r1", { actorId: "u1" });
    assert.deepStrictEqual(result, { error: "ASSIGNMENT_NOT_FOUND" });
  });

  it("errors ASSIGNMENT_NOT_ASSIGNABLE when assignment is completed", async () => {
    const reservation = { id: "r1", assignment_id: "a1", worker_user_id: "w1", status: "reserved", campaign_id: "c1" };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "completed", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_reservations") && sql.includes("FOR UPDATE")) return rows([reservation]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.promoteReservation(pool, "r1", { actorId: "u1" });
    assert.strictEqual(result.error, "ASSIGNMENT_NOT_ASSIGNABLE");
    assert.strictEqual(result.status, "completed");
  });

  it("errors RESERVATION_EXPIRED and marks the reservation expired", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const reservation = { id: "r1", assignment_id: "a1", worker_user_id: "w1", status: "reserved", campaign_id: "c1", expires_at: past };
    const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_reservations") && sql.includes("FOR UPDATE")) return rows([reservation]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.promoteReservation(pool, "r1", { actorId: "u1" });
    assert.deepStrictEqual(result, { error: "RESERVATION_EXPIRED" });
    // it issued the timeout-expire UPDATE
    assert.ok(sqlSeen(pool, "release_reason = 'timeout'"));
  });

  it("passes supplierOrgId into the reservation lookup query", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_reservations") && sql.includes("FOR UPDATE")) return rows([]);
      return rows([]);
    });
    const result = await svc.promoteReservation(pool, "r1", { actorId: "u1", supplierOrgId: "s1" });
    assert.deepStrictEqual(result, { error: "RESERVATION_NOT_FOUND" });
    const lookup = callWith(pool, "FROM assignment_staffing_reservations");
    assert.deepStrictEqual(lookup.params, ["r1", "s1"]);
    assert.ok(lookup.sql.includes("supplier_org_id = $2"));
  });

  it("promotes an active reservation into a worker assignment link", async () => {
    const reservation = { id: "r1", assignment_id: "a1", campaign_id: "c1", invite_id: "i1", worker_user_id: "w1", status: "reserved", expires_at: new Date(Date.now() + 3600000).toISOString() };
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active",
      requested_quantity: 2, start_date: "2026-07-01", planned_end_date: "2026-07-10", client_org_name: "Klinik"
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_reservations") && sql.includes("FOR UPDATE")) return rows([reservation]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("conflict_type")) return rows([]); // no conflicts
      if (sql.includes("FROM worker_assignment_links") && sql.includes("LIMIT 1")) return rows([]);
      if (sql.includes("INSERT INTO worker_assignment_links")) return rows([{ id: "link1", assignment_id: "a1", worker_user_id: "w1" }]);
      if (sql.includes("status = 'promoted'")) return rows([{ ...reservation, status: "promoted", promoted_link_id: "link1" }]);
      if (sql.includes("COALESCE(source_campaign_id, id)")) return rows([{ root_campaign_id: "c1" }]);
      if (sql.includes("AS filled_quantity")) return rows([{ filled_quantity: 1, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, filled_quantity: 1, open_quantity: 1, staffing_status: "partially_filled" }]);
      return rows([]);
    });
    const result = await svc.promoteReservation(pool, "r1", { actorId: "u1", note: "ok" });
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.link.id, "link1");
    assert.strictEqual(result.reservation.status, "promoted");
    // reservation_promoted event written
    const ev = callWith(pool, "INSERT INTO assignment_staffing_events");
    assert.ok(callsWith(pool, "INSERT INTO assignment_staffing_events").some((c) => c.params.includes("reservation_promoted")));
    assert.ok(ev);
  });

  it("blocks promotion with WORKER_ALREADY_LINKED when a link already exists", async () => {
    const reservation = { id: "r1", assignment_id: "a1", campaign_id: "c1", invite_id: "i1", worker_user_id: "w1", status: "reserved", expires_at: new Date(Date.now() + 3600000).toISOString() };
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active",
      requested_quantity: 2, start_date: "2026-07-01", planned_end_date: "2026-07-10"
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_reservations") && sql.includes("FOR UPDATE")) return rows([reservation]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      if (sql.includes("conflict_type")) return rows([]);
      if (sql.includes("FROM worker_assignment_links") && sql.includes("LIMIT 1")) return rows([{ id: "existing-link" }]);
      return rows([]);
    });
    const result = await svc.promoteReservation(pool, "r1", { actorId: "u1" });
    assert.strictEqual(result.error, "WORKER_ALREADY_LINKED");
    assert.strictEqual(result.existing_link_id, "existing-link");
  });
});

// ═══════════════════════════════════════════════════════════════
// getStaffingChoiceSet — scoping branches (found / worker mismatch / supplier mismatch)
// ═══════════════════════════════════════════════════════════════
describe("getStaffingChoiceSet (complementary)", () => {
  // Minimal choice-set row pair (set + one option) the loader can map.
  function choiceRows({ status = "options_presented", worker = "w1", supplier = "s1" } = {}) {
    return rows([{
      id: "cs1", worker_user_id: worker, supplier_org_id: supplier, status,
      choice_mode: "preference_only", title: "Auswahl", message: null,
      response_deadline_at: new Date(Date.now() + 86400000).toISOString(),
      created_by: "disp1", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-01T00:00:00Z",
      option_id: "opt1", option_assignment_id: "a1", option_invite_id: "i1", option_campaign_id: "c1",
      option_order: 1, worker_response: "pending", worker_rank: null,
      invite_status: "sent", expires_at: new Date(Date.now() + 86400000).toISOString(),
      delivery_status: "delivered", reservation_status: null, promoted_link_id: null,
      start_date: "2026-07-01", planned_end_date: "2026-07-10"
    }]);
  }

  it("returns the mapped choice set when found (terminal status skips lifecycle UPDATE)", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_choice_sets cs") && sql.includes("opt.id AS option_id")) {
        return choiceRows({ status: "assigned" }); // terminal → refresh returns as-is
      }
      return rows([]);
    });
    const result = await svc.getStaffingChoiceSet(pool, "cs1", { workerUserId: "w1" });
    assert.ok(result);
    assert.strictEqual(result.id, "cs1");
    assert.strictEqual(result.is_terminal, true);
    assert.strictEqual(result.options.length, 1);
    // terminal set → no choice_sets status UPDATE issued
    assert.strictEqual(sqlSeen(pool, "UPDATE assignment_staffing_choice_sets"), false);
  });

  it("returns null when the workerUserId does not match the set owner", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_choice_sets cs") && sql.includes("opt.id AS option_id")) {
        return choiceRows({ status: "assigned", worker: "OTHER" });
      }
      return rows([]);
    });
    const result = await svc.getStaffingChoiceSet(pool, "cs1", { workerUserId: "w1" });
    assert.strictEqual(result, null);
  });

  it("returns null when the supplierOrgId does not match", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_choice_sets cs") && sql.includes("opt.id AS option_id")) {
        return choiceRows({ status: "assigned", supplier: "OTHER" });
      }
      return rows([]);
    });
    const result = await svc.getStaffingChoiceSet(pool, "cs1", { supplierOrgId: "s1" });
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// syncStaffingChoiceSetsForAssignmentLink — no active sets → []
// ═══════════════════════════════════════════════════════════════
describe("syncStaffingChoiceSetsForAssignmentLink", () => {
  it("returns [] when there are no active choice sets for the assignment", async () => {
    const pool = trackingPool(() => rows([])); // listStaffingChoiceSetIds empty
    const result = await svc.syncStaffingChoiceSetsForAssignmentLink(pool, {
      assignmentId: "a1", workerUserId: "w1", linkId: "link1"
    });
    assert.deepStrictEqual(result, []);
  });

  it("skips a targeted set that is terminal (is_terminal=true)", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_choice_sets cs") && sql.includes("opt.id AS option_id")) {
        return rows([{
          id: "cs1", worker_user_id: "w1", supplier_org_id: "s1", status: "assigned",
          choice_mode: "preference_only", title: "X", created_at: "2026-06-01T00:00:00Z",
          option_id: "opt1", option_assignment_id: "a1", option_invite_id: "i1", option_campaign_id: "c1",
          option_order: 1, worker_response: "pending", invite_status: "cancelled"
        }]);
      }
      return rows([]);
    });
    const result = await svc.syncStaffingChoiceSetsForAssignmentLink(pool, {
      assignmentId: "a1", workerUserId: "w1", linkId: "link1", choiceSetId: "cs1"
    });
    // terminal set is skipped → no finalize, empty result
    assert.deepStrictEqual(result, []);
    assert.strictEqual(sqlSeen(pool, "final_link_id"), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Choice-set worker actions — additional error branches
// (coverage.test.js only asserts CHOICE_SET_NOT_FOUND for each)
// ═══════════════════════════════════════════════════════════════
describe("choice-set action error branches (complementary)", () => {
  function singleSetRows({ choiceMode = "preference_only", status = "options_presented", workerResponse = "pending" } = {}) {
    return rows([{
      id: "cs1", worker_user_id: "w1", supplier_org_id: "s1", status,
      choice_mode: choiceMode, title: "Auswahl", created_by: "disp1",
      created_at: "2026-06-01T00:00:00Z",
      option_id: "opt1", option_assignment_id: "a1", option_invite_id: "i1", option_campaign_id: "c1",
      option_order: 1, worker_response: workerResponse, worker_rank: null,
      invite_status: "sent", start_date: "2026-07-01", planned_end_date: "2026-07-10"
    }]);
  }
  const matchSetLoad = (sql) => sql.includes("FROM assignment_staffing_choice_sets cs") && sql.includes("opt.id AS option_id");

  it("submitStaffingChoicePreferences → CHOICE_SET_MODE_MISMATCH for a ranked set", async () => {
    const pool = trackingPool((sql) => matchSetLoad(sql) ? singleSetRows({ choiceMode: "ranked_choice" }) : rows([]));
    const result = await svc.submitStaffingChoicePreferences(pool, { choiceSetId: "cs1", workerUserId: "w1", primaryOptionId: "opt1" });
    assert.strictEqual(result.error, "CHOICE_SET_MODE_MISMATCH");
    assert.strictEqual(result.choice_mode, "ranked_choice");
  });

  it("submitStaffingChoicePreferences → CHOICE_SET_ALREADY_ASSIGNED for an assigned set", async () => {
    const pool = trackingPool((sql) => matchSetLoad(sql) ? singleSetRows({ status: "assigned" }) : rows([]));
    const result = await svc.submitStaffingChoicePreferences(pool, { choiceSetId: "cs1", workerUserId: "w1", primaryOptionId: "opt1" });
    assert.strictEqual(result.error, "CHOICE_SET_ALREADY_ASSIGNED");
  });

  it("submitStaffingChoicePreferences → NO_PREFERENCE_SELECTED when nothing chosen", async () => {
    const pool = trackingPool((sql) => matchSetLoad(sql) ? singleSetRows() : rows([]));
    const result = await svc.submitStaffingChoicePreferences(pool, { choiceSetId: "cs1", workerUserId: "w1" });
    assert.strictEqual(result.error, "NO_PREFERENCE_SELECTED");
  });

  it("submitStaffingChoicePreferences → CHOICE_OPTION_NOT_FOUND for an unknown primary option", async () => {
    const pool = trackingPool((sql) => matchSetLoad(sql) ? singleSetRows() : rows([]));
    const result = await svc.submitStaffingChoicePreferences(pool, { choiceSetId: "cs1", workerUserId: "w1", primaryOptionId: "ghost" });
    assert.strictEqual(result.error, "CHOICE_OPTION_NOT_FOUND");
  });

  it("submitStaffingChoiceRanking → NO_RANKING_SELECTED on an empty ranking", async () => {
    const pool = trackingPool((sql) => matchSetLoad(sql) ? singleSetRows({ choiceMode: "ranked_choice" }) : rows([]));
    const result = await svc.submitStaffingChoiceRanking(pool, { choiceSetId: "cs1", workerUserId: "w1", rankedOptionIds: [] });
    assert.strictEqual(result.error, "NO_RANKING_SELECTED");
  });

  it("submitStaffingChoiceRanking → CHOICE_OPTION_NOT_FOUND for an unknown ranked option", async () => {
    const pool = trackingPool((sql) => matchSetLoad(sql) ? singleSetRows({ choiceMode: "ranked_choice" }) : rows([]));
    const result = await svc.submitStaffingChoiceRanking(pool, { choiceSetId: "cs1", workerUserId: "w1", rankedOptionIds: ["ghost"] });
    assert.strictEqual(result.error, "CHOICE_OPTION_NOT_FOUND");
  });

  it("selectStaffingChoiceOption → CHOICE_OPTION_NOT_FOUND for an unknown option", async () => {
    const pool = trackingPool((sql) => matchSetLoad(sql) ? singleSetRows({ choiceMode: "free_choice" }) : rows([]));
    const result = await svc.selectStaffingChoiceOption(pool, { choiceSetId: "cs1", workerUserId: "w1", choiceOptionId: "ghost" });
    assert.strictEqual(result.error, "CHOICE_OPTION_NOT_FOUND");
  });

  it("selectStaffingChoiceOption → CHOICE_OPTION_NOT_AVAILABLE when the option is not actionable", async () => {
    // invite_status 'accepted' → live_state 'selected' → is_actionable false
    const pool = trackingPool((sql) => {
      if (matchSetLoad(sql)) {
        return rows([{
          id: "cs1", worker_user_id: "w1", supplier_org_id: "s1", status: "options_presented",
          choice_mode: "free_choice", title: "Auswahl", created_by: "disp1", created_at: "2026-06-01T00:00:00Z",
          option_id: "opt1", option_assignment_id: "a1", option_invite_id: "i1", option_campaign_id: "c1",
          option_order: 1, worker_response: "pending", worker_rank: null, invite_status: "accepted"
        }]);
      }
      return rows([]);
    });
    const result = await svc.selectStaffingChoiceOption(pool, { choiceSetId: "cs1", workerUserId: "w1", choiceOptionId: "opt1" });
    // an accepted invite makes the set ALREADY_SELECTED (selected live_state) before option check
    assert.ok(["CHOICE_OPTION_NOT_AVAILABLE", "CHOICE_SET_ALREADY_SELECTED"].includes(result.error));
  });

  it("declineStaffingChoiceSet → CHOICE_SET_ALREADY_SELECTED when an option is already reserved", async () => {
    const pool = trackingPool((sql) => {
      if (matchSetLoad(sql)) {
        return rows([{
          id: "cs1", worker_user_id: "w1", supplier_org_id: "s1", status: "preference_submitted",
          choice_mode: "free_choice", title: "Auswahl", created_by: "disp1", created_at: "2026-06-01T00:00:00Z",
          option_id: "opt1", option_assignment_id: "a1", option_invite_id: "i1", option_campaign_id: "c1",
          option_order: 1, worker_response: "acceptable", worker_rank: null,
          invite_status: "accepted", reservation_status: "reserved"
        }]);
      }
      return rows([]);
    });
    const result = await svc.declineStaffingChoiceSet(pool, { choiceSetId: "cs1", workerUserId: "w1" });
    assert.strictEqual(result.error, "CHOICE_SET_ALREADY_SELECTED");
  });
});

// ═══════════════════════════════════════════════════════════════
// askStaffingInviteQuestion / requestStaffingInviteReminder
//   — INVITE_NOT_ACTIONABLE branch (not asserted in coverage.test.js)
// ═══════════════════════════════════════════════════════════════
describe("worker invite actions — INVITE_NOT_ACTIONABLE (complementary)", () => {
  function actionCtx(status) {
    return {
      id: "i1", assignment_id: "a1", campaign_id: "c1", worker_user_id: "w1",
      supplier_org_id: "s1", status
    };
  }
  const assignment = { id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 1 };

  it("askStaffingInviteQuestion rejects an accepted (non-actionable) invite", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([actionCtx("accepted")]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.askStaffingInviteQuestion(pool, { inviteId: "i1", workerUserId: "w1", question: "Wann?" });
    assert.strictEqual(result.error, "INVITE_NOT_ACTIONABLE");
    assert.strictEqual(result.current_status, "accepted");
  });

  it("requestStaffingInviteReminder rejects an accepted (non-actionable) invite", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("FOR UPDATE OF i, c")) return rows([actionCtx("accepted")]);
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]);
      return rows([]);
    });
    const result = await svc.requestStaffingInviteReminder(pool, { inviteId: "i1", workerUserId: "w1" });
    assert.strictEqual(result.error, "INVITE_NOT_ACTIONABLE");
    assert.strictEqual(result.current_status, "accepted");
  });
});

// ═══════════════════════════════════════════════════════════════
// getAssignmentStaffingOverview — full success aggregation
//   (coverage.test.js only covers the two null branches)
// ═══════════════════════════════════════════════════════════════
describe("getAssignmentStaffingOverview (success aggregation)", () => {
  it("assembles workers, reservations, invites, campaigns, waitlist + choice sets", async () => {
    const assignment = {
      id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active", requested_quantity: 2,
      start_date: "2026-07-01", planned_end_date: "2026-07-10"
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([assignment]); // recalc load
      if (sql.includes("AS filled_quantity")) return rows([COUNTERS_EMPTY]);
      if (sql.includes("UPDATE assignments")) return rows([{ ...assignment, open_quantity: 2, staffing_status: "open" }]);
      if (sql.includes("FROM worker_assignment_links wal") && sql.includes("worker_email")) {
        return rows([{ id: "lnk1", worker_user_id: "w1", first_name: "Anna", last_name: "B", is_active: true }]);
      }
      if (sql.includes("FROM assignment_staffing_reservations r") && sql.includes("reserved_at DESC")) {
        return rows([{ id: "res1", worker_user_id: "w2", status: "reserved" }]);
      }
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("total_messages")) {
        return rows([{ id: "i1", worker_user_id: "w3", status: "sent" }]);
      }
      // getAssignmentWaitlistRootCampaignId selects COALESCE(...) AS root_campaign_id;
      // must be matched BEFORE the generic campaigns-list query (both share
      // "FROM assignment_staffing_campaigns ... ORDER BY created_at DESC").
      if (sql.includes("COALESCE(source_campaign_id, id)")) return rows([{ root_campaign_id: "c1" }]);
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("ORDER BY created_at DESC")) {
        return rows([{ id: "c1", status: "active" }]);
      }
      if (sql.includes("FROM assignment_staffing_waitlist w") && sql.includes("invite_status")) {
        return rows([{ id: "wl1", worker_user_id: "w4", status: "queued", queue_rank: 1 }]);
      }
      if (sql.includes("queued_count")) {
        return rows([{ queued_count: 1, invited_count: 0, reserved_count: 1, assigned_count: 0, removed_count: 0 }]);
      }
      return rows([]); // listStaffingChoiceSetIds empty → choice_sets []
    });
    const result = await svc.getAssignmentStaffingOverview(pool, "a1", "s1");
    assert.ok(result);
    assert.strictEqual(result.assignment.id, "a1");
    assert.strictEqual(result.current_workers.length, 1);
    assert.strictEqual(result.reservations.length, 1);
    assert.strictEqual(result.recent_invites.length, 1);
    assert.strictEqual(result.campaigns.length, 1);
    assert.strictEqual(result.waitlist.length, 1);
    assert.strictEqual(result.waitlist_summary.queued_count, 1);
    assert.strictEqual(result.root_campaign_id, "c1");
    assert.deepStrictEqual(result.choice_sets, []);
    assert.ok(result.requirements);
  });
});
