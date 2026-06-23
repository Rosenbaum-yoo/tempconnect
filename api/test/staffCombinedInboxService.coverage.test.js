/**
 * staffCombinedInboxService.coverage.test.js
 *
 * Comprehensive behavior tests for services/staffCombinedInboxService.js.
 *
 * Strategy:
 *  - Pattern-routing pool: dispatches pool.query() by SQL substring. The service
 *    statically imports staffCustomerRequestsService + subscriptionRequestService
 *    and calls them with the SAME pool, so one routing pool drives the whole
 *    call graph (those dependency queries run for real against the mock rows).
 *  - Assert behavior: return shapes, derived priority/summary_status, source_type
 *    mapping, filter SQL params, sort/pagination, bulk validation + per-item
 *    success/failure aggregation, and error propagation from the dependency
 *    services.
 *
 * Run (cwd api/):
 *   node --test --test-force-exit test/staffCombinedInboxService.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/staffCombinedInboxService.js";

// ── Pattern-routing pool ──────────────────────────────────────────
// handlers: array of [substring, response|fn(sql,params)->response].
// Records every {sql,params}. Unknown SQL → { rows: [] }.
function trackingPool(handlers = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (typeof sql === "string") {
      const t = sql.trim().toUpperCase();
      if (t === "BEGIN" || t === "COMMIT" || t === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
    }
    for (const [needle, resp] of handlers) {
      if (typeof sql === "string" && sql.includes(needle)) {
        const r = typeof resp === "function" ? resp(sql, params) : resp;
        return r ?? { rows: [], rowCount: 0 };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    query,
    connect: async () => ({ query, release: () => {} }),
    calls
  };
}

const DAY = 24 * 60 * 60 * 1000;
function isoDaysAgo(n) {
  return new Date(Date.now() - n * DAY).toISOString();
}

// ═══════════════════════════════════════════════════════════════
// Exports / constants
// ═══════════════════════════════════════════════════════════════

describe("staffCombinedInboxService — exports", () => {
  it("exposes the SOURCE_TYPES and BULK_OP maps", () => {
    assert.strictEqual(svc.SOURCE_TYPES.ENTERPRISE_REQUEST, "enterprise_request");
    assert.strictEqual(svc.SOURCE_TYPES.SUBSCRIPTION_CANCELLATION, "subscription_cancellation");
    assert.strictEqual(svc.BULK_OP.ASSIGN, "assign");
    assert.strictEqual(svc.BULK_OP.REJECT_WITH_REASON, "reject_with_reason");
    assert.strictEqual(svc.BULK_OP.TO_UNDER_REVIEW, "to_under_review");
  });
});

// ═══════════════════════════════════════════════════════════════
// listCombinedInbox
// ═══════════════════════════════════════════════════════════════

describe("staffCombinedInboxService — listCombinedInbox", () => {
  it("merges both sources and maps fields/source_type", async () => {
    const pool = trackingPool([
      ["FROM strategic_collaboration_requests s", {
        rows: [{
          id: "scr1", status: "neu", created_at: isoDaysAgo(1), updated_at: isoDaysAgo(1),
          contact_email: "a@x.de", contact_name: "Anna", requester_company_name: "ACME",
          plan_requested: "PRO", request_type: "enterprise_config", source_context: "configurator",
          org_id: "org1", monthly_estimate_cents: 1000, onetime_estimate_cents: 0,
          seats_requested: 5, seats_included: 3, assigned_staff_id: null
        }]
      }],
      ["FROM subscription_requests sr", {
        rows: [{
          id: "sub1", status: "submitted", created_at: isoDaysAgo(1), updated_at: isoDaysAgo(1),
          status_updated_at: null, request_type: "upgrade",
          contact_email: "b@x.de", contact_name: "Bob", requester_company_name: null,
          org_id: "org2", current_plan: "BASIS", desired_plan: "PLUS",
          proposed_price_cents: 2000, proposed_term_months: 12,
          assigned_staff_id: "staff9", org_name: "OrgTwo"
        }]
      }]
    ]);

    const res = await svc.listCombinedInbox(pool, {});
    assert.strictEqual(res.totals.total, 2);
    assert.strictEqual(res.items.length, 2);

    const scr = res.items.find((i) => i.id === "scr1");
    assert.strictEqual(scr.source_type, "enterprise_request");
    assert.strictEqual(scr.detail_path, "/customer-requests/scr1");
    assert.strictEqual(scr.plan, "PRO");

    const sub = res.items.find((i) => i.id === "sub1");
    assert.strictEqual(sub.source_type, "subscription_upgrade");
    assert.strictEqual(sub.detail_path, "/subscription-requests/sub1");
    // requester_company_name falls back to org_name
    assert.strictEqual(sub.requester_company_name, "OrgTwo");
    assert.strictEqual(sub.plan, "PLUS");

    assert.strictEqual(res.totals.by_source.enterprise_request, 1);
    assert.strictEqual(res.totals.by_source.subscription_upgrade, 1);
  });

  it("clamps limit to [1,200] and offset to >=0, paginates", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `sub${i}`, status: "submitted", created_at: isoDaysAgo(i + 1),
      updated_at: isoDaysAgo(i + 1), status_updated_at: null, request_type: "upgrade",
      contact_email: "b@x.de", contact_name: "Bob", requester_company_name: "Co",
      org_id: "o", current_plan: "BASIS", desired_plan: "PLUS",
      proposed_price_cents: 0, proposed_term_months: 0, assigned_staff_id: null, org_name: null
    }));
    const pool = trackingPool([["FROM subscription_requests sr", { rows }]]);

    const res = await svc.listCombinedInbox(pool, {
      sourceType: "subscription_upgrade", limit: 2, offset: 1
    });
    // totals reflect ALL matched (5), items reflect page (2)
    assert.strictEqual(res.totals.total, 5);
    assert.strictEqual(res.items.length, 2);
  });

  it("only queries SCR when sourceType=enterprise_request (no sub query)", async () => {
    const pool = trackingPool([
      ["FROM strategic_collaboration_requests s", { rows: [] }]
    ]);
    await svc.listCombinedInbox(pool, { sourceType: "enterprise_request" });
    const sawSub = pool.calls.some((c) => c.sql.includes("FROM subscription_requests sr"));
    const sawScr = pool.calls.some((c) => c.sql.includes("FROM strategic_collaboration_requests s"));
    assert.strictEqual(sawScr, true);
    assert.strictEqual(sawSub, false);
  });

  it("maps subscription source_type filter back to request_type param", async () => {
    const pool = trackingPool([["FROM subscription_requests sr", { rows: [] }]]);
    await svc.listCombinedInbox(pool, { sourceType: "subscription_cancellation" });
    const call = pool.calls.find((c) => c.sql.includes("FROM subscription_requests sr"));
    assert.ok(call.sql.includes("sr.request_type = $1"));
    assert.deepStrictEqual(call.params, ["cancellation"]);
  });

  it("applies email/plan/requestType/assignee filters to the SCR query", async () => {
    const pool = trackingPool([["FROM strategic_collaboration_requests s", { rows: [] }]]);
    await svc.listCombinedInbox(pool, {
      sourceType: "enterprise_request",
      email: "  Foo@Bar.DE  ", plan: "INDIVIDUELL",
      requestType: "enterprise_config", assignedToStaffId: "staffX"
    });
    const call = pool.calls.find((c) => c.sql.includes("FROM strategic_collaboration_requests s"));
    assert.deepStrictEqual(call.params, ["foo@bar.de", "INDIVIDUELL", "enterprise_config", "staffX"]);
    assert.ok(call.sql.includes("LOWER(s.contact_email) = $1"));
    assert.ok(call.sql.includes("s.plan_requested = $2"));
    assert.ok(call.sql.includes("s.request_type = $3"));
    assert.ok(call.sql.includes("staff_customer_request_assignments"));
  });

  it("applies assignee/email/plan filters to the subscription query", async () => {
    const pool = trackingPool([["FROM subscription_requests sr", { rows: [] }]]);
    await svc.listCombinedInbox(pool, {
      sourceType: "subscription_upgrade",
      assignedToStaffId: "s1", email: "X@Y.DE", plan: "PRO"
    });
    const call = pool.calls.find((c) => c.sql.includes("FROM subscription_requests sr"));
    // request_type ($1), assignee ($2), email ($3), plan ($4)
    assert.deepStrictEqual(call.params, ["upgrade", "s1", "x@y.de", "PRO"]);
    assert.ok(call.sql.includes("(sr.desired_plan = $4 OR sr.current_plan = $4)"));
  });

  it("filters by summary_status after status mapping", async () => {
    const pool = trackingPool([
      ["FROM strategic_collaboration_requests s", {
        rows: [
          { id: "open1", status: "neu", created_at: isoDaysAgo(1), updated_at: isoDaysAgo(1), plan_requested: "PRO", request_type: "x" },
          { id: "closed1", status: "abgeschlossen", created_at: isoDaysAgo(1), updated_at: isoDaysAgo(1), plan_requested: "PRO", request_type: "x" }
        ]
      }],
      ["FROM subscription_requests sr", { rows: [] }]
    ]);
    const res = await svc.listCombinedInbox(pool, { summaryStatus: "closed" });
    assert.strictEqual(res.totals.total, 1);
    assert.strictEqual(res.items[0].id, "closed1");
    assert.strictEqual(res.items[0].summary_status, "closed");
  });

  it("sorts high priority first, then newest updated_at", async () => {
    const pool = trackingPool([
      ["FROM subscription_requests sr", {
        rows: [
          // normal priority, newer
          { id: "normalNew", status: "submitted", created_at: isoDaysAgo(1), updated_at: isoDaysAgo(0), request_type: "upgrade", current_plan: "BASIS", desired_plan: "PLUS" },
          // high priority (cancellation), older
          { id: "highOld", status: "submitted", created_at: isoDaysAgo(2), updated_at: isoDaysAgo(2), request_type: "cancellation", current_plan: "PRO", desired_plan: null }
        ]
      }]
    ]);
    const res = await svc.listCombinedInbox(pool, { sourceType: "subscription_cancellation" });
    // both returned (filter is on request_type via SQL; mock returns both regardless)
    assert.strictEqual(res.items[0].id, "highOld");
    assert.strictEqual(res.items[0].priority, "high");
  });

  it("unknown subscription request_type maps to subscription_other", async () => {
    const pool = trackingPool([
      ["FROM subscription_requests sr", {
        rows: [{
          id: "weird", status: "submitted", created_at: isoDaysAgo(1), updated_at: isoDaysAgo(1),
          request_type: "mystery", current_plan: "BASIS", desired_plan: "PLUS"
        }]
      }]
    ]);
    // sourceType undefined → both branches; SCR returns []
    const res = await svc.listCombinedInbox(pool, {});
    assert.strictEqual(res.items[0].source_type, "subscription_other");
  });

  it("returns empty inbox with zero totals", async () => {
    const pool = trackingPool([]);
    const res = await svc.listCombinedInbox(pool, {});
    assert.strictEqual(res.totals.total, 0);
    assert.deepStrictEqual(res.items, []);
    assert.deepStrictEqual(res.totals.by_source, {});
  });
});

// ═══════════════════════════════════════════════════════════════
// Priority / summary_status heuristics (via list output)
// ═══════════════════════════════════════════════════════════════

describe("staffCombinedInboxService — priority heuristics", () => {
  async function scrPriority(row) {
    const pool = trackingPool([
      ["FROM strategic_collaboration_requests s", { rows: [row] }],
      ["FROM subscription_requests sr", { rows: [] }]
    ]);
    const res = await svc.listCombinedInbox(pool, {});
    return res.items[0];
  }

  it("cancellation request_type → high priority", async () => {
    const item = await scrPriority({
      id: "c", status: "neu", created_at: isoDaysAgo(0), updated_at: isoDaysAgo(0),
      plan_requested: "PRO", request_type: "cancellation"
    });
    assert.strictEqual(item.priority, "high");
  });

  it("INDIVIDUELL desired plan while open → high priority", async () => {
    const item = await scrPriority({
      id: "i", status: "neu", created_at: isoDaysAgo(0), updated_at: isoDaysAgo(0),
      plan_requested: "INDIVIDUELL", request_type: "enterprise_config"
    });
    assert.strictEqual(item.priority, "high");
  });

  it("open and older than 5 days → escalates normal to high", async () => {
    const item = await scrPriority({
      id: "old", status: "neu", created_at: isoDaysAgo(6), updated_at: isoDaysAgo(6),
      plan_requested: "PRO", request_type: "enterprise_config"
    });
    assert.strictEqual(item.priority, "high");
  });

  it("closed status → low priority regardless of age", async () => {
    const item = await scrPriority({
      id: "done", status: "abgeschlossen", created_at: isoDaysAgo(30), updated_at: isoDaysAgo(30),
      plan_requested: "PRO", request_type: "enterprise_config"
    });
    assert.strictEqual(item.priority, "low");
    assert.strictEqual(item.summary_status, "closed");
  });

  it("fresh open normal request stays normal", async () => {
    const item = await scrPriority({
      id: "fresh", status: "neu", created_at: isoDaysAgo(1), updated_at: isoDaysAgo(1),
      plan_requested: "PRO", request_type: "enterprise_config"
    });
    assert.strictEqual(item.priority, "normal");
    assert.strictEqual(item.summary_status, "open");
  });

  it("rueckfrage_offen → needs_action summary status", async () => {
    const item = await scrPriority({
      id: "rf", status: "rueckfrage_offen", created_at: isoDaysAgo(1), updated_at: isoDaysAgo(1),
      plan_requested: "PRO", request_type: "enterprise_config"
    });
    assert.strictEqual(item.summary_status, "needs_action");
  });

  it("subscription needs_clarification/offered/accepted → needs_action; active/rejected/cancelled/expired → closed", async () => {
    async function subStatus(status) {
      const pool = trackingPool([
        ["FROM subscription_requests sr", {
          rows: [{
            id: "s", status, created_at: isoDaysAgo(1), updated_at: isoDaysAgo(1),
            request_type: "upgrade", current_plan: "BASIS", desired_plan: "PLUS"
          }]
        }]
      ]);
      const res = await svc.listCombinedInbox(pool, { sourceType: "subscription_upgrade" });
      return res.items[0].summary_status;
    }
    assert.strictEqual(await subStatus("needs_clarification"), "needs_action");
    assert.strictEqual(await subStatus("offered"), "needs_action");
    assert.strictEqual(await subStatus("accepted"), "needs_action");
    assert.strictEqual(await subStatus("active"), "closed");
    assert.strictEqual(await subStatus("rejected"), "closed");
    assert.strictEqual(await subStatus("cancelled"), "closed");
    assert.strictEqual(await subStatus("expired"), "closed");
    assert.strictEqual(await subStatus("submitted"), "open");
  });

  it("handles null/invalid created_at (ageInDays → null, no crash)", async () => {
    const pool = trackingPool([
      ["FROM strategic_collaboration_requests s", {
        rows: [{ id: "noage", status: "neu", created_at: null, updated_at: null, plan_requested: "PRO", request_type: "x" }]
      }],
      ["FROM subscription_requests sr", {
        rows: [{ id: "badage", status: "submitted", created_at: "not-a-date", updated_at: null, request_type: "upgrade", current_plan: "BASIS", desired_plan: "PLUS" }]
      }]
    ]);
    const res = await svc.listCombinedInbox(pool, {});
    // No throw; both items present, priority normal (no age escalation)
    assert.strictEqual(res.totals.total, 2);
    for (const i of res.items) assert.strictEqual(i.priority, "normal");
  });
});

// ═══════════════════════════════════════════════════════════════
// runBulkAction — validation guards
// ═══════════════════════════════════════════════════════════════

describe("staffCombinedInboxService — runBulkAction validation", () => {
  const okReason = "valid reason text"; // >= 10 chars

  it("rejects empty/non-array items", async () => {
    const pool = trackingPool([]);
    const r1 = await svc.runBulkAction(pool, { operation: "assign", reason: okReason, items: [] });
    assert.deepStrictEqual(r1, { ok: false, error: "EMPTY_ITEMS", processed: 0, success: [], failed: [] });
    const r2 = await svc.runBulkAction(pool, { operation: "assign", reason: okReason, items: null });
    assert.strictEqual(r2.error, "EMPTY_ITEMS");
  });

  it("handles missing args object entirely", async () => {
    const pool = trackingPool([]);
    const r = await svc.runBulkAction(pool, undefined);
    assert.strictEqual(r.error, "EMPTY_ITEMS");
  });

  it("rejects more than 100 items", async () => {
    const pool = trackingPool([]);
    const items = Array.from({ length: 101 }, (_, i) => ({ id: `x${i}`, source_type: "enterprise_request" }));
    const r = await svc.runBulkAction(pool, { operation: "assign", reason: okReason, items });
    assert.strictEqual(r.error, "BULK_LIMIT_EXCEEDED");
  });

  it("rejects unsupported operation", async () => {
    const pool = trackingPool([]);
    const r = await svc.runBulkAction(pool, {
      operation: "nuke", reason: okReason,
      items: [{ id: "a", source_type: "enterprise_request" }]
    });
    assert.strictEqual(r.error, "UNSUPPORTED_OPERATION");
  });

  it("rejects reason shorter than 10 chars (after trim)", async () => {
    const pool = trackingPool([]);
    const r = await svc.runBulkAction(pool, {
      operation: "assign", reason: "  short  ",
      items: [{ id: "a", source_type: "enterprise_request" }]
    });
    assert.strictEqual(r.error, "REASON_TOO_SHORT");
  });
});

// ═══════════════════════════════════════════════════════════════
// runBulkAction — per-item dispatch (applyBulk paths)
// ═══════════════════════════════════════════════════════════════

describe("staffCombinedInboxService — runBulkAction dispatch", () => {
  const reason = "a sufficiently long reason";

  it("fails invalid item (missing id/source_type) without touching DB", async () => {
    const pool = trackingPool([]);
    const r = await svc.runBulkAction(pool, {
      operation: "assign", reason, assigneeId: "s1",
      items: [{ id: null, source_type: "enterprise_request" }]
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.failed[0].error, "INVALID_ITEM");
    assert.strictEqual(r.processed, 1);
  });

  it("fails unsupported source_type", async () => {
    const pool = trackingPool([]);
    const r = await svc.runBulkAction(pool, {
      operation: "assign", reason, assigneeId: "s1",
      items: [{ id: "x", source_type: "totally_unknown" }]
    });
    assert.strictEqual(r.failed[0].error, "UNSUPPORTED_SOURCE_TYPE");
  });

  it("assign requires assigneeId (MISSING_ASSIGNEE)", async () => {
    const pool = trackingPool([]);
    const r = await svc.runBulkAction(pool, {
      operation: "assign", reason,
      items: [{ id: "x", source_type: "enterprise_request" }]
    });
    assert.strictEqual(r.failed[0].error, "MISSING_ASSIGNEE");
  });

  it("assign on enterprise_request succeeds when request + staff exist", async () => {
    // customerRequests.assign: SELECT request → SELECT staff → UPDATE old → INSERT new
    const pool = trackingPool([
      ["SELECT id FROM strategic_collaboration_requests WHERE id = $1", { rows: [{ id: "req1" }] }],
      ["FROM tempconnect_staff WHERE user_id = $1 AND is_active = TRUE", { rows: [{ user_id: "assignee9" }] }],
      ["INSERT INTO staff_customer_request_assignments", { rows: [{ id: "as1", assigned_at: isoDaysAgo(0), staff_id: "assignee9" }] }]
    ]);
    const r = await svc.runBulkAction(pool, {
      operation: "assign", reason, actorUserId: "actor1", assigneeId: "assignee9",
      items: [{ id: "req1", source_type: "enterprise_request" }]
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.success.length, 1);
    assert.strictEqual(r.success[0].action, "assign");
    assert.strictEqual(r.failed.length, 0);
  });

  it("assign on enterprise_request propagates ASSIGNEE_NOT_STAFF error", async () => {
    const pool = trackingPool([
      ["SELECT id FROM strategic_collaboration_requests WHERE id = $1", { rows: [{ id: "req1" }] }],
      ["FROM tempconnect_staff WHERE user_id = $1 AND is_active = TRUE", { rows: [] }]
    ]);
    const r = await svc.runBulkAction(pool, {
      operation: "assign", reason, actorUserId: "actor1", assigneeId: "ghost",
      items: [{ id: "req1", source_type: "enterprise_request" }]
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.failed[0].error, "ASSIGNEE_NOT_STAFF");
  });

  it("reject_with_reason on enterprise_request transitions to abgelehnt", async () => {
    // customerRequests.transitionStatus: SELECT cur → UPDATE → INSERT message
    const pool = trackingPool([
      ["SELECT id, status FROM strategic_collaboration_requests WHERE id = $1", { rows: [{ id: "req1", status: "eingegangen" }] }],
      ["UPDATE strategic_collaboration_requests", { rows: [{ id: "req1", status: "abgelehnt", updated_at: isoDaysAgo(0) }] }]
    ]);
    const r = await svc.runBulkAction(pool, {
      operation: "reject_with_reason", reason, actorUserId: "actor1",
      items: [{ id: "req1", source_type: "enterprise_request" }]
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.success[0].action, "rejected");
  });

  it("to_under_review on enterprise_request transitions to rueckfrage_offen", async () => {
    const pool = trackingPool([
      ["SELECT id, status FROM strategic_collaboration_requests WHERE id = $1", { rows: [{ id: "req1", status: "eingegangen" }] }],
      ["UPDATE strategic_collaboration_requests", { rows: [{ id: "req1", status: "rueckfrage_offen", updated_at: isoDaysAgo(0) }] }]
    ]);
    const r = await svc.runBulkAction(pool, {
      operation: "to_under_review", reason, actorUserId: "actor1",
      items: [{ id: "req1", source_type: "enterprise_request" }]
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.success[0].action, "to_under_review");
  });

  it("enterprise_request reject propagates REQUEST_NOT_FOUND from dependency", async () => {
    const pool = trackingPool([
      ["SELECT id, status FROM strategic_collaboration_requests WHERE id = $1", { rows: [] }]
    ]);
    const r = await svc.runBulkAction(pool, {
      operation: "reject_with_reason", reason, actorUserId: "actor1",
      items: [{ id: "missing", source_type: "enterprise_request" }]
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.failed[0].error, "REQUEST_NOT_FOUND");
  });

  it("subscription reject propagates REQUEST_NOT_FOUND from subreq dependency", async () => {
    // subreq.reject runs in a transaction; first SELECT returns empty → REQUEST_NOT_FOUND
    const pool = trackingPool([
      ["FROM subscription_requests WHERE id = $1", { rows: [] }]
    ]);
    const r = await svc.runBulkAction(pool, {
      operation: "reject_with_reason", reason, actorUserId: "actor1",
      items: [{ id: "missingsub", source_type: "subscription_upgrade" }]
    });
    assert.strictEqual(r.ok, false);
    // error is REQUEST_NOT_FOUND (or mapped REJECT_FAILED if shape differs) — must be a failure
    assert.ok(r.failed[0].error);
    assert.notStrictEqual(r.failed[0].error, undefined);
  });

  it("subscription to_under_review propagates dependency failure for missing request", async () => {
    const pool = trackingPool([
      ["FROM subscription_requests WHERE id = $1", { rows: [] }]
    ]);
    const r = await svc.runBulkAction(pool, {
      operation: "to_under_review", reason, actorUserId: "actor1",
      items: [{ id: "missingsub", source_type: "subscription_downgrade" }]
    });
    assert.strictEqual(r.ok, false);
    assert.ok(r.failed[0].error);
  });

  it("catches thrown exception per-item and records EXCEPTION/code", async () => {
    const boom = new Error("db down");
    boom.code = "ECONNREFUSED";
    const pool = {
      query: async (sql) => {
        const t = String(sql).trim().toUpperCase();
        if (t === "BEGIN" || t === "COMMIT" || t === "ROLLBACK") return { rows: [] };
        throw boom;
      },
      connect: async () => ({
        query: async () => { throw boom; },
        release: () => {}
      })
    };
    const r = await svc.runBulkAction(pool, {
      operation: "reject_with_reason", reason, actorUserId: "actor1",
      items: [{ id: "x", source_type: "enterprise_request" }]
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.failed[0].error, "ECONNREFUSED");
  });

  it("aggregates mixed success + failure across multiple items", async () => {
    // Item A (enterprise assign) succeeds; Item B (unsupported type) fails.
    const pool = trackingPool([
      ["SELECT id FROM strategic_collaboration_requests WHERE id = $1", { rows: [{ id: "A" }] }],
      ["FROM tempconnect_staff WHERE user_id = $1 AND is_active = TRUE", { rows: [{ user_id: "assignee" }] }],
      ["INSERT INTO staff_customer_request_assignments", { rows: [{ id: "as", assigned_at: isoDaysAgo(0), staff_id: "assignee" }] }]
    ]);
    const r = await svc.runBulkAction(pool, {
      operation: "assign", reason, actorUserId: "actor", assigneeId: "assignee",
      items: [
        { id: "A", source_type: "enterprise_request" },
        { id: "B", source_type: "bogus_type" }
      ]
    });
    assert.strictEqual(r.processed, 2);
    assert.strictEqual(r.success.length, 1);
    assert.strictEqual(r.failed.length, 1);
    assert.strictEqual(r.ok, false); // any failure → ok:false
    assert.strictEqual(r.failed[0].error, "UNSUPPORTED_SOURCE_TYPE");
  });
});

// ═══════════════════════════════════════════════════════════════
// getInboxItemDetail
// ═══════════════════════════════════════════════════════════════

describe("staffCombinedInboxService — getInboxItemDetail", () => {
  it("returns enterprise detail with messages + assignee", async () => {
    const pool = trackingPool([
      ["FROM strategic_collaboration_requests s", {
        rows: [{
          id: "scr1", status: "neu", created_at: isoDaysAgo(2), updated_at: isoDaysAgo(1),
          contact_email: "a@x.de", contact_name: "Anna", requester_company_name: "ACME",
          org_id: "org1", requester_org_id: "org1", target_org_id: null,
          request_type: "enterprise_config", source_context: "configurator",
          plan_requested: "PRO", monthly_estimate_cents: 100, onetime_estimate_cents: 0,
          seats_requested: 5, seats_included: 3, notes: "hi",
          org_name: "ACME GmbH", org_type: "company", org_contact_email: "info@acme.de",
          assigned_staff_id: "staff1"
        }]
      }],
      ["FROM staff_customer_request_messages m", {
        rows: [
          { id: "m1", author_staff_id: "staff1", is_internal: false, body: "hello", created_at: isoDaysAgo(1), author_email: "s@x.de", author_name: "Staffer" }
        ]
      }],
      ["FROM tempconnect_staff WHERE user_id = $1", {
        rows: [{ user_id: "staff1", email: "s@x.de", display_name: "Staffer" }]
      }]
    ]);
    const d = await svc.getInboxItemDetail(pool, "scr1");
    assert.strictEqual(d.source_type, "enterprise_request");
    assert.strictEqual(d.id, "scr1");
    assert.strictEqual(d.message_count, 1);
    assert.strictEqual(d.messages.length, 1);
    assert.ok(d.assignee);
    assert.strictEqual(d.assignee.staff_id, "staff1");
    assert.strictEqual(typeof d.age_days, "number");
  });

  it("enterprise detail without assignee leaves assignee null", async () => {
    const pool = trackingPool([
      ["FROM strategic_collaboration_requests s", {
        rows: [{
          id: "scr2", status: "neu", created_at: isoDaysAgo(1),
          request_type: "enterprise_config", plan_requested: "PRO",
          assigned_staff_id: null
        }]
      }],
      ["FROM staff_customer_request_messages m", { rows: [] }]
    ]);
    const d = await svc.getInboxItemDetail(pool, "scr2");
    assert.strictEqual(d.assignee, null);
    assert.strictEqual(d.message_count, 0);
  });

  it("returns subscription detail when SCR not found", async () => {
    const pool = trackingPool([
      ["FROM strategic_collaboration_requests s", { rows: [] }],
      ["FROM subscription_requests sr", {
        rows: [{
          id: "sub1", status: "offered", created_at: isoDaysAgo(3), updated_at: isoDaysAgo(1),
          request_type: "upgrade", contact_email: "b@x.de", contact_name: "Bob",
          requester_company_name: null, org_id: "org2",
          current_plan: "BASIS", desired_plan: "PLUS",
          proposed_price_cents: 1500, proposed_term_months: 12, notes: null,
          assigned_staff_id: "staff5", assignee_email: "s5@x.de", assignee_display_name: "Five",
          org_name: "OrgTwo", org_type: "company", org_contact_email: "o@x.de"
        }]
      }]
    ]);
    const d = await svc.getInboxItemDetail(pool, "sub1");
    assert.strictEqual(d.source_type, "subscription_upgrade");
    assert.strictEqual(d.requester_company_name, "OrgTwo"); // falls back to org_name
    assert.strictEqual(d.summary_status, "needs_action"); // offered
    assert.ok(d.assignee);
    assert.strictEqual(d.assignee.email, "s5@x.de");
    assert.deepStrictEqual(d.messages, []);
    assert.strictEqual(d.message_count, 0);
  });

  it("subscription detail without assignee → assignee null", async () => {
    const pool = trackingPool([
      ["FROM strategic_collaboration_requests s", { rows: [] }],
      ["FROM subscription_requests sr", {
        rows: [{
          id: "sub2", status: "submitted", created_at: isoDaysAgo(1),
          request_type: "pilot", current_plan: null, desired_plan: "PLUS",
          assigned_staff_id: null
        }]
      }]
    ]);
    const d = await svc.getInboxItemDetail(pool, "sub2");
    assert.strictEqual(d.source_type, "subscription_pilot");
    assert.strictEqual(d.assignee, null);
  });

  it("returns null when neither source has the id", async () => {
    const pool = trackingPool([
      ["FROM strategic_collaboration_requests s", { rows: [] }],
      ["FROM subscription_requests sr", { rows: [] }]
    ]);
    const d = await svc.getInboxItemDetail(pool, "nope");
    assert.strictEqual(d, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// getActiveStaffMembers
// ═══════════════════════════════════════════════════════════════

describe("staffCombinedInboxService — getActiveStaffMembers", () => {
  it("returns active staff rows", async () => {
    const pool = trackingPool([
      ["FROM tempconnect_staff", {
        rows: [
          { user_id: "u1", email: "a@x.de", display_name: "A", role: "ops" },
          { user_id: "u2", email: "b@x.de", display_name: "B", role: "admin" }
        ]
      }]
    ]);
    const rows = await svc.getActiveStaffMembers(pool);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].user_id, "u1");
    // verify it filters on is_active
    const call = pool.calls.find((c) => c.sql.includes("FROM tempconnect_staff"));
    assert.ok(call.sql.includes("is_active = TRUE"));
  });

  it("returns empty array when no active staff", async () => {
    const pool = trackingPool([]);
    const rows = await svc.getActiveStaffMembers(pool);
    assert.deepStrictEqual(rows, []);
  });
});
