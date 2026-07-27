/**
 * Notification Matrix unit tests.
 * Covers dispatch with dedup, unknown events, empty recipients,
 * findOrgMembersWithPermission, getMatrix.
 * Uses mock pool — no database required.
 *
 * Run: node --test --test-force-exit test/notificationMatrix.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/notificationMatrix.js";
import * as rbac from "../services/rbacService.js";

// ── Mock helpers ──────────────────────────────────────────────

function returnPool(rows = []) {
  return { query: async () => ({ rows, rowCount: rows.length }) };
}

function capturePool() {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// getMatrix
// ═══════════════════════════════════════════════════════════════

describe("notificationMatrix — getMatrix", () => {
  it("returns a copy of the matrix config", () => {
    const matrix = svc.getMatrix();
    assert.ok(matrix["requisition.approved"]);
    assert.strictEqual(matrix["requisition.approved"].severity, "success");
    assert.ok(matrix["deal.completed"]);
  });

  it("includes capacity exchange events", () => {
    const matrix = svc.getMatrix();
    assert.ok(matrix["capacity.interest_received"]);
    assert.ok(matrix["capacity.match_found"]);
    assert.ok(matrix["demand.match_found"]);
  });

  it("wires the marketplace deal-agreement lifecycle to deals-surface types", () => {
    const matrix = svc.getMatrix();
    // Diese Events werden in routes/marketplace.js dispatched und waren ohne
    // Matrix-Eintrag No-ops. Ihre Typen muessen auf die deals-Surface mappen.
    assert.equal(matrix["deal.agreement_created"].type, "deal_offer_sent");
    assert.equal(matrix["deal.agreement_confirmed"].type, "deal_confirmed");
    assert.equal(matrix["deal.agreement_activated"].type, "deal_assignment_started");
    assert.equal(matrix["deal.agreement_cancelled"].type, "deal_cancelled");
    assert.equal(matrix["deal.agreement_signature_prepared"].type, "deal_confirmed");
    assert.equal(matrix["deal.emergency_agreement_created"].type, "deal_offer_sent");
  });

  it("wires capacity/demand deal-initiation + emergency commitment events", () => {
    const matrix = svc.getMatrix();
    assert.equal(matrix["capacity.deal_accepted"].type, "deal_accepted");
    assert.equal(matrix["capacity.deal_negotiation_started"].type, "deal_offer_sent");
    assert.equal(matrix["demand.deal_accepted"].type, "deal_accepted");
    assert.equal(matrix["demand.deal_negotiation_started"].type, "deal_offer_sent");
    assert.equal(matrix["emergency.commitment_received"].type, "demand_match");
  });
});

// ═══════════════════════════════════════════════════════════════
// dispatch
// ═══════════════════════════════════════════════════════════════

describe("notificationMatrix — dispatch", () => {
  it("returns sent=0 for unknown event", async () => {
    const result = await svc.dispatch(returnPool(), "unknown.event", { recipientUserIds: [1] });
    assert.strictEqual(result.sent, 0);
  });

  it("returns sent=0 when no recipients", async () => {
    const result = await svc.dispatch(returnPool(), "requisition.approved", { recipientUserIds: [] });
    assert.strictEqual(result.sent, 0);
  });

  it("returns sent=0 when recipients not provided", async () => {
    const result = await svc.dispatch(returnPool(), "requisition.approved", {});
    assert.strictEqual(result.sent, 0);
  });

  it("inserts notification for each recipient (dedup pass)", async () => {
    const pool = capturePool();
    const result = await svc.dispatch(pool, "requisition.approved", {
      recipientUserIds: [1, 2],
      orgId: "org-1",
      entityType: "requisition",
      entityId: "req-1",
      message: "Approved!",
      _skipPreferenceCheck: true
    });
    assert.strictEqual(result.sent, 2);
    // Filter to INSERT calls only (integration dispatch may add a SELECT)
    const insertCalls = pool.calls.filter(c => c.sql.includes('INSERT'));
    assert.strictEqual(insertCalls.length, 2);
    // Check SQL uses dedup WHERE NOT EXISTS
    assert.ok(insertCalls[0].sql.includes("NOT EXISTS"));
  });

  it("counts only rows actually inserted (dedup skip)", async () => {
    let callIdx = 0;
    const pool = {
      query: async () => {
        callIdx++;
        // First insert succeeds, second is deduped
        return { rows: [], rowCount: callIdx === 1 ? 1 : 0 };
      }
    };
    const result = await svc.dispatch(pool, "offer.received", {
      recipientUserIds: [1, 2],
      message: "Offer",
      _skipPreferenceCheck: true
    });
    assert.strictEqual(result.sent, 1);
  });

  it("uses custom linkPath from context", async () => {
    const pool = capturePool();
    await svc.dispatch(pool, "deal.completed", {
      recipientUserIds: [1],
      linkPath: "/custom/path",
      _skipPreferenceCheck: true
    });
    // The linkPath param should be the custom one
    const params = pool.calls[0].params;
    assert.ok(params.includes("/custom/path"));
  });

  it("handles all event types without error", async () => {
    const matrix = svc.getMatrix();
    const pool = { query: async () => ({ rows: [], rowCount: 1 }) };
    for (const eventKey of Object.keys(matrix)) {
      const result = await svc.dispatch(pool, eventKey, { recipientUserIds: [1] });
      assert.strictEqual(result.sent, 1, `Failed for event: ${eventKey}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
