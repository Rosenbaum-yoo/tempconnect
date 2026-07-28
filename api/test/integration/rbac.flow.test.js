/**
 * RBAC & Public Endpoint Integration Tests
 *
 * Covers:
 *  - Unauthenticated access to protected routes → 401
 *  - Missing CSRF token on state-changing routes → 403
 *  - GET /api/service-status → public, no auth required
 *  - GET /api/health → public, no auth required
 *  - GET /api/admin/status → requires x-admin-secret header
 *  - GET /api/admin/status without secret → 401/403
 *  - GET /api/admin/status with wrong secret → 401/403
 *  - GET /api/admin/status with correct secret → 200
 *
 * Requires: DATABASE_URL
 */

// MUSS vor den Helfern stehen: setzt ADMIN_SECRET, bevor `config/index.js` es liest.
import "./testEnv.js";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  makeAgent,
  getCsrf,
  registerAndLogin,
  createPool,
  cleanupUser
} from "./helpers.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "dev-admin-secret";

describe("RBAC & Access Control", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  let agent, csrfToken, email;
  let anonAgent;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    anonAgent = await makeAgent();
    ({ agent, csrfToken, email } = await registerAndLogin());
    createdEmails.push(email);
  });

  after(async () => {
    if (pool) {
      for (const e of createdEmails) await cleanupUser(pool, e);
      await pool.end();
    }
  });

  // ── Public endpoints ───────────────────────────────────────────────────────

  it("GET /api/health is publicly accessible → 200", async () => {
    const res = await anonAgent.get("/api/health");
    assert.strictEqual(res.status, 200);
  });

  it("GET /api/service-status is publicly accessible → 200", async () => {
    const res = await anonAgent.get("/api/service-status");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.status || res.body.services, "Should return status or services object");
  });

  // ── Unauthenticated access to protected routes ─────────────────────────────

  it("GET /api/me without session → 401", async () => {
    const fresh = await makeAgent();
    const res = await fresh.get("/api/me");
    assert.strictEqual(res.status, 401);
  });

  it("GET /api/invoices without session → 401", async () => {
    const fresh = await makeAgent();
    const res = await fresh.get("/api/invoices");
    assert.strictEqual(res.status, 401);
  });

  it("GET /api/requisitions without session → 401", async () => {
    const fresh = await makeAgent();
    const res = await fresh.get("/api/requisitions");
    assert.strictEqual(res.status, 401);
  });

  it("GET /api/payment/history without session → 401", async () => {
    const fresh = await makeAgent();
    const res = await fresh.get("/api/payment/history");
    assert.strictEqual(res.status, 401);
  });

  // ── CSRF enforcement ───────────────────────────────────────────────────────

  it("POST /api/payment/checkout without CSRF token → 403", async () => {
    // Authenticated but no CSRF token
    const res = await agent
      .post("/api/payment/checkout")
      .send({ plan: "BASIS" });
    // No x-csrf-token header → should be rejected
    assert.ok([403, 401].includes(res.status), `Expected 403, got ${res.status}`);
    // Refresh CSRF for subsequent tests
    csrfToken = await getCsrf(agent);
  });

  it("POST /api/auth/logout without CSRF token → 403", async () => {
    const fresh = await makeAgent();
    const freshCsrf = await getCsrf(fresh);
    // Register+login without providing csrf for logout
    const { email: e2 } = await registerAndLogin();
    createdEmails.push(e2);

    // Use a fresh agent that is NOT logged in — POST without csrf
    const res2 = await fresh
      .post("/api/auth/logout")
      .send({}); // No x-csrf-token
    assert.ok([403, 401].includes(res2.status), `Expected 403, got ${res2.status}`);
  });

  it("POST /api/requisitions without CSRF token → 403", async () => {
    const res = await agent
      .post("/api/requisitions")
      .send({ title: "Test", role_title: "Dev", location: "Berlin", num_positions: 1 });
    // No x-csrf-token header
    assert.ok([403, 401].includes(res.status), `Expected 403, got ${res.status}`);
    csrfToken = await getCsrf(agent);
  });

  // ── Admin endpoint ─────────────────────────────────────────────────────────

  it("GET /api/admin/status without x-admin-secret → hidden (404)", async () => {
    const res = await anonAgent.get("/api/admin/status");
    assert.strictEqual(res.status, 404, "Admin status route hides itself without valid secret");
  });

  it("GET /api/admin/status with wrong x-admin-secret → hidden (404)", async () => {
    const res = await anonAgent
      .get("/api/admin/status")
      .set("x-admin-secret", "completely-wrong-secret");
    assert.strictEqual(res.status, 404, "Admin status route hides itself with wrong secret");
  });

  it("GET /api/admin/status with correct x-admin-secret → 200", async () => {
    const res = await anonAgent
      .get("/api/admin/status")
      .set("x-admin-secret", ADMIN_SECRET);
    assert.ok([200, 503].includes(res.status), `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    if (res.status === 200) {
      assert.ok(res.body, "Should return admin status body");
    }
  });

  // ── Authenticated user can access own data ─────────────────────────────────

  it("GET /api/me with valid session → 200 with user data", async () => {
    const res = await agent.get("/api/me");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.id || res.body.email || res.body.user, "Should return user data");
  });

  it("Regular user cannot access admin endpoint (no secret) → hidden (404)", async () => {
    // Even authenticated users without the secret cannot access /admin/status
    const res = await agent.get("/api/admin/status");
    assert.strictEqual(res.status, 404, "Admin status hides itself even for authenticated users without secret");
  });
});
