/**
 * Payment Service unit tests.
 * Tests all exported functions with mock pool — no database required.
 *
 * Run: node --test --test-force-exit test/paymentService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPaymentSession, getPaymentSession, completePaymentSession,
  getPaymentSessionByStripeSubscriptionId, getLatestStripeSessionForCustomerPortal, activatePlan,
  getPaymentSessionStatus, getPaymentHistory
} from "../services/paymentService.js";

// ── Mock pool that captures queries ───────────────────────────
function capturePool() {
  const queries = [];
  return {
    queries,
    query: (sql, params) => {
      queries.push({ sql: sql.trim(), params });
      return { rows: [{ id: "ps-1", status: "pending", plan: "PLUS", user_id: "u1" }] };
    }
  };
}

function returnPool(rows) {
  return { query: () => ({ rows }) };
}

// ═══════════════════════════════════════════════════════════════
// createPaymentSession
// ═══════════════════════════════════════════════════════════════

describe("createPaymentSession — insert with/without stripe session", () => {
  it("inserts with stripeSessionId when provided", async () => {
    const pool = capturePool();
    await createPaymentSession(pool, {
      id: "ps-1", userId: "u1", plan: "PLUS", amount: 49, method: "stripe", stripeSessionId: "cs_abc", orgId: "org-1"
    });
    assert.strictEqual(pool.queries.length, 1);
    assert.ok(pool.queries[0].sql.includes("stripe_session_id"));
    assert.deepStrictEqual(pool.queries[0].params, ["ps-1", "u1", "PLUS", 49, "stripe", "org-1", "cs_abc", null]);
  });

  it("inserts without stripeSessionId for demo payments", async () => {
    const pool = capturePool();
    await createPaymentSession(pool, {
      id: "ps-2", userId: "u1", plan: "BASIS", amount: 29, method: "demo", orgId: "org-2"
    });
    assert.strictEqual(pool.queries.length, 1);
    assert.ok(!pool.queries[0].sql.includes("stripe_session_id"));
    assert.deepStrictEqual(pool.queries[0].params, ["ps-2", "u1", "BASIS", 29, "demo", "org-2", null]);
  });
});

// ═══════════════════════════════════════════════════════════════
// getPaymentSession
// ═══════════════════════════════════════════════════════════════

describe("getPaymentSession — lookup by id + userId", () => {
  it("returns session when found", async () => {
    const pool = returnPool([{ id: "ps-1", plan: "PLUS", status: "pending" }]);
    const result = await getPaymentSession(pool, "ps-1", "u1");
    assert.strictEqual(result.id, "ps-1");
    assert.strictEqual(result.plan, "PLUS");
  });

  it("returns null when not found", async () => {
    const pool = returnPool([]);
    const result = await getPaymentSession(pool, "nope", "u1");
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// completePaymentSession — 3 branches
// ═══════════════════════════════════════════════════════════════

describe("completePaymentSession — completion variants", () => {
  it("branch: with stripeSubscriptionId", async () => {
    const pool = capturePool();
    await completePaymentSession(pool, "ps-1", {
      stripePaymentIntent: "pi_abc", stripeSubscriptionId: "sub_xyz"
    });
    assert.ok(pool.queries[0].sql.includes("stripe_subscription_id"));
    assert.deepStrictEqual(pool.queries[0].params, ["pi_abc", "sub_xyz", "ps-1"]);
  });

  it("branch: with stripePaymentIntent only", async () => {
    const pool = capturePool();
    await completePaymentSession(pool, "ps-1", { stripePaymentIntent: "pi_abc" });
    assert.ok(pool.queries[0].sql.includes("stripe_payment_intent"));
    assert.ok(!pool.queries[0].sql.includes("stripe_subscription_id"));
    assert.deepStrictEqual(pool.queries[0].params, ["pi_abc", "ps-1"]);
  });

  it("branch: no stripe info (demo completion)", async () => {
    const pool = capturePool();
    await completePaymentSession(pool, "ps-1");
    assert.ok(pool.queries[0].sql.includes("completed_at"));
    assert.deepStrictEqual(pool.queries[0].params, ["ps-1"]);
  });

  it("legacy: string opts treated as paymentIntent", async () => {
    const pool = capturePool();
    await completePaymentSession(pool, "ps-1", "pi_legacy");
    assert.deepStrictEqual(pool.queries[0].params, ["pi_legacy", "ps-1"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// getPaymentSessionByStripeSubscriptionId
// ═══════════════════════════════════════════════════════════════

describe("getPaymentSessionByStripeSubscriptionId", () => {
  it("returns session when found", async () => {
    const pool = returnPool([{ id: "ps-1", user_id: "u1", plan: "PRO" }]);
    const result = await getPaymentSessionByStripeSubscriptionId(pool, "sub_abc");
    assert.strictEqual(result.plan, "PRO");
  });

  it("returns null when not found", async () => {
    const pool = returnPool([]);
    const result = await getPaymentSessionByStripeSubscriptionId(pool, "sub_nope");
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// getLatestStripeSessionForCustomerPortal
// ═══════════════════════════════════════════════════════════════

describe("getLatestStripeSessionForCustomerPortal", () => {
  it("filters completed Stripe sessions for user + active org", async () => {
    const pool = capturePool();
    await getLatestStripeSessionForCustomerPortal(pool, { userId: "u1", orgId: "org-1" });
    assert.ok(pool.queries[0].sql.includes("method = 'stripe'"));
    assert.ok(pool.queries[0].sql.includes("status = 'completed'"));
    assert.ok(pool.queries[0].sql.includes("stripe_session_id IS NOT NULL"));
    assert.ok(pool.queries[0].sql.includes("org_id = $2 OR org_id IS NULL"));
    assert.deepStrictEqual(pool.queries[0].params, ["u1", "org-1"]);
  });

  it("returns null when no Stripe session exists", async () => {
    const pool = returnPool([]);
    const result = await getLatestStripeSessionForCustomerPortal(pool, { userId: "u1" });
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// activatePlan
// ═══════════════════════════════════════════════════════════════

describe("activatePlan — insert subscription", () => {
  it("inserts active subscription row", async () => {
    const pool = capturePool();
    await activatePlan(pool, "u1", "PRO");
    assert.ok(pool.queries[0].sql.includes("INSERT INTO subscriptions"));
    assert.deepStrictEqual(pool.queries[0].params, ["u1", "PRO"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// getPaymentSessionStatus
// ═══════════════════════════════════════════════════════════════

describe("getPaymentSessionStatus — status check", () => {
  it("returns status string when session exists", async () => {
    const pool = returnPool([{ status: "completed" }]);
    const result = await getPaymentSessionStatus(pool, "ps-1");
    assert.strictEqual(result, "completed");
  });

  it("returns null when session doesn't exist", async () => {
    const pool = returnPool([]);
    const result = await getPaymentSessionStatus(pool, "nope");
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// getPaymentHistory
// ═══════════════════════════════════════════════════════════════

describe("getPaymentHistory — user payment list", () => {
  it("returns array of payment rows", async () => {
    const pool = returnPool([
      { id: "ps-1", plan: "PLUS", amount: 49, status: "completed" },
      { id: "ps-2", plan: "PRO", amount: 99, status: "pending" }
    ]);
    const result = await getPaymentHistory(pool, "u1");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].plan, "PLUS");
  });

  it("returns empty array when no payments", async () => {
    const pool = returnPool([]);
    const result = await getPaymentHistory(pool, "u1");
    assert.deepStrictEqual(result, []);
  });
});
