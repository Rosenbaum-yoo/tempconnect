/**
 * Deal Progress Helper unit tests — pure logic, no DB required.
 * Tests: getNextAction mapping, getDealProgress with mock pool.
 *
 * Run: node --test --test-force-exit test/dealProgressHelper.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { getNextAction, getDealProgress } from "../services/dealProgressHelper.js";

// ─────────────────────────────────────────────────────────────
// getNextAction — pure status → next action mapping
// ─────────────────────────────────────────────────────────────

describe("getNextAction — active statuses", () => {
  it("CREATED requires requester to send offer", () => {
    const action = getNextAction("CREATED");
    assert.strictEqual(action.actor, "requester");
    assert.strictEqual(action.action, "send_offer");
    assert.ok(action.label.length > 0);
  });

  it("SENT requires receiver to respond", () => {
    const action = getNextAction("SENT");
    assert.strictEqual(action.actor, "receiver");
    assert.strictEqual(action.action, "respond");
  });

  it("OFFER_SENT requires requester to review offer", () => {
    const action = getNextAction("OFFER_SENT");
    assert.strictEqual(action.actor, "requester");
    assert.strictEqual(action.action, "review_offer");
  });

  it("ACCEPTED requires requester to confirm deal", () => {
    const action = getNextAction("ACCEPTED");
    assert.strictEqual(action.actor, "requester");
    assert.strictEqual(action.action, "confirm_deal");
  });

  it("CONFIRMED requires receiver to start assignment", () => {
    const action = getNextAction("CONFIRMED");
    assert.strictEqual(action.actor, "receiver");
    assert.strictEqual(action.action, "start_assignment");
  });

  it("FILLED requires requester to finalize", () => {
    const action = getNextAction("FILLED");
    assert.strictEqual(action.actor, "requester");
    assert.strictEqual(action.action, "finalize");
  });

  it("ASSIGNMENT_STARTED requires both to complete", () => {
    const action = getNextAction("ASSIGNMENT_STARTED");
    assert.strictEqual(action.actor, "both");
    assert.strictEqual(action.action, "complete");
  });
});

describe("getNextAction — terminal statuses", () => {
  for (const status of ["FINALIZED", "COMPLETED", "DECLINED", "CANCELED"]) {
    it(`${status} returns null (terminal)`, () => {
      assert.strictEqual(getNextAction(status), null);
    });
  }
});

describe("getNextAction — unknown status", () => {
  it("returns null for unknown status", () => {
    assert.strictEqual(getNextAction("NONEXISTENT"), null);
  });

  it("returns null for empty string", () => {
    assert.strictEqual(getNextAction(""), null);
  });
});

// ─────────────────────────────────────────────────────────────
// getDealProgress — with mock pool
// ─────────────────────────────────────────────────────────────

function mockPool(status, { notFound = false, transitionRows = [] } = {}) {
  return {
    query: async (sql, params) => {
      if (sql.includes("FROM requests")) {
        if (notFound) return { rows: [] };
        return {
          rows: [{
            id: params[0],
            status,
            requester_id: "user-req",
            receiver_id: "user-rec",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-15T00:00:00Z"
          }]
        };
      }
      if (sql.includes("state_transitions")) {
        return { rows: transitionRows };
      }
      return { rows: [] };
    }
  };
}

describe("getDealProgress — basic responses", () => {
  it("returns null for non-existent request", async () => {
    const pool = mockPool(null, { notFound: true });
    const result = await getDealProgress(pool, "nonexistent");
    assert.strictEqual(result, null);
  });

  it("returns correct progress for CREATED status", async () => {
    const pool = mockPool("CREATED");
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.status, "CREATED");
    assert.strictEqual(result.progress_pct, 10);
    assert.strictEqual(result.status_label, "Erstellt");
    assert.ok(result.next_action);
    assert.strictEqual(result.next_action.action, "send_offer");
    assert.strictEqual(result.requester_id, "user-req");
    assert.strictEqual(result.receiver_id, "user-rec");
  });

  it("returns 100% for COMPLETED", async () => {
    const pool = mockPool("COMPLETED");
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.progress_pct, 100);
    assert.strictEqual(result.next_action, null);
  });

  it("returns 0% for DECLINED", async () => {
    const pool = mockPool("DECLINED");
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.progress_pct, 0);
    assert.strictEqual(result.next_action, null);
  });

  it("returns 50% for ACCEPTED", async () => {
    const pool = mockPool("ACCEPTED");
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.progress_pct, 50);
  });

  it("returns 85% for ASSIGNMENT_STARTED", async () => {
    const pool = mockPool("ASSIGNMENT_STARTED");
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.progress_pct, 85);
  });
});

describe("getDealProgress — timeline", () => {
  it("includes transition timeline", async () => {
    const transitions = [
      { from_status: "CREATED", to_status: "OFFER_SENT", actor_id: "a1", created_at: "2025-01-02", details: {} },
      { from_status: "OFFER_SENT", to_status: "ACCEPTED", actor_id: "a2", created_at: "2025-01-03", details: {} }
    ];
    const pool = mockPool("ACCEPTED", { transitionRows: transitions });
    const result = await getDealProgress(pool, "deal-1");
    assert.strictEqual(result.timeline.length, 2);
    assert.strictEqual(result.timeline[0].to, "OFFER_SENT");
    assert.strictEqual(result.timeline[1].to, "ACCEPTED");
    assert.ok(result.timeline[0].label);
  });

  it("returns empty timeline on error (graceful fallback)", async () => {
    const pool = {
      query: async (sql) => {
        if (sql.includes("FROM requests")) {
          return { rows: [{ id: "d1", status: "CREATED", requester_id: "r", receiver_id: "s", created_at: new Date(), updated_at: new Date() }] };
        }
        throw new Error("state_transitions table missing");
      }
    };
    const result = await getDealProgress(pool, "d1");
    assert.ok(Array.isArray(result.timeline));
    assert.strictEqual(result.timeline.length, 0);
  });
});
