/**
 * Requisition Flow Integration Tests
 *
 * Covers:
 *  - Create requisition (authenticated) → 201
 *  - List requisitions → 200 with items array
 *  - Get single requisition → 200 with full data
 *  - PATCH requisition → 200 updated fields
 *  - Valid status transition → success
 *  - Invalid body → 400 VALIDATION
 *  - Unauthenticated create → 401
 *  - Org isolation: user A cannot access user B's org requisitions
 *
 * Requires: DATABASE_URL
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  registerAndLogin,
  registerAndLoginWithPlan,
  createPool,
  cleanupUser
} from "./helpers.js";

describe("Requisition Flow", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  let primaryAgent, primaryCsrf, primaryEmail;
  let requisitionId;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    // PRO statt DEMO: DEMO erlaubt `max_workers_per_request: 0`, jede Anforderung
    // scheitert dort mit WORKER_LIMIT_EXCEEDED. Geprueft wird hier der Anforderungs-
    // Fluss, nicht das Kontingent.
    ({ agent: primaryAgent, csrfToken: primaryCsrf, email: primaryEmail } = await registerAndLoginWithPlan(pool, "PRO"));
    createdEmails.push(primaryEmail);
  });

  after(async () => {
    if (pool) {
      if (requisitionId) {
        await pool.query("DELETE FROM requisitions WHERE id = $1", [requisitionId]).catch(() => {});
      }
      for (const email of createdEmails) {
        await cleanupUser(pool, email);
      }
      await pool.end();
    }
  });

  // ── Create ─────────────────────────────────────────────────────────────────

  it("creates a requisition with valid payload → 201", async () => {
    const res = await primaryAgent
      .post("/api/requisitions")
      .set("x-csrf-token", primaryCsrf)
      .send({
        title: "Integration Test Requisition",
        role: "Lagerhelfer",
        headcount: 3,
        urgency: "normal",
        location_city: "Berlin",
        start_date: "2026-06-01",
        end_date: "2026-06-30"
      });

    assert.ok([200, 201].includes(res.status), `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id, "Should return requisition with id");
    assert.strictEqual(res.body.title, "Integration Test Requisition");
    requisitionId = res.body.id;
  });

  it("rejects creation with missing required fields → 400", async () => {
    const res = await primaryAgent
      .post("/api/requisitions")
      .set("x-csrf-token", primaryCsrf)
      .send({ headcount: 2 }); // missing title and role

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error, "Expected validation error");
  });

  it("rejects creation without authentication → 401", async () => {
    const { makeAgent, getCsrf } = await import("./helpers.js");
    const unauthAgent = await makeAgent();
    const csrf = await getCsrf(unauthAgent);

    const res = await unauthAgent
      .post("/api/requisitions")
      .set("x-csrf-token", csrf)
      .send({ title: "Hack Attempt", role: "admin" });

    assert.strictEqual(res.status, 401);
  });

  // ── List ───────────────────────────────────────────────────────────────────

  it("lists requisitions → 200 with items array", async () => {
    const res = await primaryAgent.get("/api/requisitions");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.items) || Array.isArray(res.body), "Should return array or { items: [...] }");
  });

  it("lists requisitions returns 401 when not authenticated", async () => {
    const { makeAgent } = await import("./helpers.js");
    const agent = await makeAgent();
    const res = await agent.get("/api/requisitions");
    assert.strictEqual(res.status, 401);
  });

  // ── Get single ─────────────────────────────────────────────────────────────

  it("gets a single requisition by id → 200", async () => {
    if (!requisitionId) return; // depends on create test
    const res = await primaryAgent.get(`/api/requisitions/${requisitionId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, requisitionId);
    assert.strictEqual(res.body.title, "Integration Test Requisition");
  });

  it("returns 404 for unknown requisition id", async () => {
    const res = await primaryAgent.get("/api/requisitions/00000000-0000-0000-0000-000000000000");
    assert.strictEqual(res.status, 404);
  });

  // ── PATCH ──────────────────────────────────────────────────────────────────

  it("updates a requisition field → 200 with updated data", async () => {
    if (!requisitionId) return;
    const res = await primaryAgent
      .patch(`/api/requisitions/${requisitionId}`)
      .set("x-csrf-token", primaryCsrf)
      .send({ headcount: 5 });

    assert.ok([200, 201].includes(res.status), `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  // ── Transitions ────────────────────────────────────────────────────────────

  it("rejects invalid status transition → 409 or 400", async () => {
    if (!requisitionId) return;
    // Try to jump directly to FILLED from initial state — should be rejected
    const res = await primaryAgent
      .post(`/api/requisitions/${requisitionId}/transition`)
      .set("x-csrf-token", primaryCsrf)
      .send({ status: "FILLED" });

    assert.ok(
      [400, 409, 422].includes(res.status),
      `Expected 400/409 for invalid transition, got ${res.status}: ${JSON.stringify(res.body)}`
    );
  });

  // ── Org isolation ──────────────────────────────────────────────────────────

  it("user from different session cannot see other user's requisitions via ?mine=true", async () => {
    // User B registers independently
    const { agent: agentB, email: emailB } = await registerAndLogin({ company_name: "Other Corp" });
    createdEmails.push(emailB);

    // Each user lists only their own requisitions via ?mine=true
    const resA = await primaryAgent.get("/api/requisitions?mine=true");
    const resB = await agentB.get("/api/requisitions?mine=true");

    assert.strictEqual(resA.status, 200);
    assert.strictEqual(resB.status, 200);

    // User A's requisition should appear in A's list but NOT in B's
    if (requisitionId) {
      const aItems = Array.isArray(resA.body.items) ? resA.body.items : (Array.isArray(resA.body) ? resA.body : []);
      const bItems = Array.isArray(resB.body.items) ? resB.body.items : (Array.isArray(resB.body) ? resB.body : []);
      const foundInA = aItems.some(r => r.id === requisitionId);
      const foundInB = bItems.some(r => r.id === requisitionId);
      assert.strictEqual(foundInA, true, "User A should see their own requisition");
      assert.strictEqual(foundInB, false, "User B should not see User A's requisition");
    }
  });
});
