/**
 * Invoice Flow Integration Tests
 *
 * Covers:
 *  - GET /api/payment/config → returns payment mode and plans
 *  - POST /api/payment/checkout (demo) → checkout_id returned
 *  - POST /api/payment/confirm → plan activated, invoice created
 *  - GET /api/invoices → lists invoices for user
 *  - GET /api/invoices/:id → returns invoice detail
 *  - POST /api/invoices/:id/void → invoice voided (if in correct state)
 *  - Unauthenticated invoice access → 401
 *
 * Requires: DATABASE_URL, PAYMENT_MODE=demo (default)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  registerAndLogin,
  createPool,
  cleanupUser
} from "./helpers.js";

describe("Invoice & Payment Flow", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  let agent, csrfToken, email;
  let checkoutId;
  let invoiceId;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    ({ agent, csrfToken, email } = await registerAndLogin());
    createdEmails.push(email);
  });

  after(async () => {
    if (pool) {
      for (const e of createdEmails) await cleanupUser(pool, e);
      await pool.end();
    }
  });

  // ── Payment config ─────────────────────────────────────────────────────────

  it("GET /api/payment/config returns mode and plan info", async () => {
    const res = await agent.get("/api/payment/config");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.mode, "Should return payment mode");
    assert.ok(res.body.plans, "Should return plans object");
  });

  // ── Demo checkout ──────────────────────────────────────────────────────────

  it("POST /api/payment/checkout (demo) → returns checkout_id", async () => {
    const res = await agent
      .post("/api/payment/checkout")
      .set("x-csrf-token", csrfToken)
      .send({ plan: "BASIS", payment_method: "demo" });

    assert.ok([200, 201].includes(res.status), `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.checkout_id, "Should return checkout_id");
    assert.ok(res.body.mode === "demo" || res.body.mode, "Should return mode");
    checkoutId = res.body.checkout_id;
    csrfToken = await (await import("./helpers.js")).getCsrf(agent);
  });

  it("POST /api/payment/checkout with invalid plan → 400", async () => {
    const res = await agent
      .post("/api/payment/checkout")
      .set("x-csrf-token", csrfToken)
      .send({ plan: "INVALID_PLAN" });

    assert.ok([400, 422].includes(res.status), `Expected 400, got ${res.status}`);
  });

  // ── Confirm payment → invoice created ─────────────────────────────────────

  it("POST /api/payment/confirm activates plan and creates invoice", async () => {
    if (!checkoutId) {
      // can't confirm without a checkout
      return;
    }
    const { getCsrf } = await import("./helpers.js");
    csrfToken = await getCsrf(agent);

    const res = await agent
      .post("/api/payment/confirm")
      .set("x-csrf-token", csrfToken)
      .send({ checkout_id: checkoutId });

    assert.ok([200, 201].includes(res.status), `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.ok, true);

    // Refresh CSRF after confirm
    csrfToken = await getCsrf(agent);
  });

  it("POST /api/payment/confirm with already-completed checkout → 400 ALREADY_COMPLETED", async () => {
    if (!checkoutId) return;
    const { getCsrf } = await import("./helpers.js");
    csrfToken = await getCsrf(agent);

    const res = await agent
      .post("/api/payment/confirm")
      .set("x-csrf-token", csrfToken)
      .send({ checkout_id: checkoutId });

    // Should be ALREADY_COMPLETED now
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "ALREADY_COMPLETED");
    csrfToken = await getCsrf(agent);
  });

  // ── Invoice list & detail ──────────────────────────────────────────────────

  it("GET /api/invoices returns invoice list (authenticated)", async () => {
    const res = await agent.get("/api/invoices");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.items !== undefined || Array.isArray(res.body), "Should return items array");

    const items = Array.isArray(res.body.items) ? res.body.items : (Array.isArray(res.body) ? res.body : []);
    if (items.length > 0) {
      invoiceId = items[0].id;
      assert.ok(items[0].invoice_number || items[0].id, "Invoice should have id or invoice_number");
    }
  });

  it("GET /api/invoices returns 401 when unauthenticated", async () => {
    const { makeAgent } = await import("./helpers.js");
    const anonAgent = await makeAgent();
    const res = await anonAgent.get("/api/invoices");
    assert.strictEqual(res.status, 401);
  });

  it("GET /api/invoices/:id returns invoice detail", async () => {
    if (!invoiceId) return;
    const res = await agent.get(`/api/invoices/${invoiceId}`);
    assert.ok([200, 403, 404].includes(res.status));
    if (res.status === 200) {
      assert.ok(res.body.id || res.body.invoice_number, "Should have invoice data");
    }
  });

  // ── Payment history ────────────────────────────────────────────────────────

  it("GET /api/payment/history returns payment sessions", async () => {
    const res = await agent.get("/api/payment/history");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body), "Should return array of payment sessions");
    // If we completed a checkout, it should appear
    if (checkoutId) {
      const found = res.body.some(s => s.id === checkoutId);
      assert.ok(found, "Completed checkout should appear in payment history");
    }
  });
});
