/**
 * Auth Flow Integration Tests
 *
 * Covers:
 *  - Register new user (happy path)
 *  - Duplicate email rejection
 *  - Login with wrong password → 401
 *  - Login with correct credentials → session established
 *  - GET /api/me while authenticated → user data returned
 *  - Logout → session destroyed
 *  - GET /api/me after logout → 401
 *  - CSRF enforcement: POST without token → 403
 *  - Unauthenticated access to protected endpoint → 401
 *
 * Requires: DATABASE_URL (or DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  makeAgent,
  getCsrf,
  registerUser,
  registerAndLogin,
  uniqueEmail,
  createPool,
  cleanupUser
} from "./helpers.js";

describe("Auth Flow", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
  });

  after(async () => {
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool?.end();
  });

  // ── Register ───────────────────────────────────────────────────────────────

  it("registers a new user successfully", async () => {
    const agent = await makeAgent();
    const csrf = await getCsrf(agent);
    const email = uniqueEmail();
    createdEmails.push(email);

    const res = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrf)
      .send({ role: "company", email, password: "ValidPass123!", company_name: "Test GmbH" });

    assert.ok([200, 201].includes(res.status), `Expected 200/201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id || res.body.email, "Response should include user data");
  });

  it("rejects registration with duplicate email", async () => {
    const agent = await makeAgent();
    const csrf = await getCsrf(agent);
    const email = uniqueEmail();
    createdEmails.push(email);

    // First registration
    await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrf)
      .send({ role: "company", email, password: "ValidPass123!" });

    // Second agent, same email
    const agent2 = await makeAgent();
    const csrf2 = await getCsrf(agent2);
    const res2 = await agent2
      .post("/api/auth/register")
      .set("x-csrf-token", csrf2)
      .send({ role: "company", email, password: "DifferentPass123!" });

    assert.strictEqual(res2.status, 409);
    assert.strictEqual(res2.body.error, "EMAIL_EXISTS");
  });

  it("rejects registration with invalid password (too short)", async () => {
    const agent = await makeAgent();
    const csrf = await getCsrf(agent);
    const email = uniqueEmail();

    const res = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrf)
      .send({ role: "company", email, password: "short" });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error, "Expected error in response");
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  it("rejects login with wrong password", async () => {
    const { email } = await registerUser();
    createdEmails.push(email);

    const agent = await makeAgent();
    const csrf = await getCsrf(agent);

    const res = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf)
      .send({ email, password: "WrongPassword999!" });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "INVALID_CREDENTIALS");
  });

  it("rejects login for non-existent user", async () => {
    const agent = await makeAgent();
    const csrf = await getCsrf(agent);

    const res = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf)
      .send({ email: uniqueEmail(), password: "SomePassword123!" });

    assert.strictEqual(res.status, 401);
  });

  it("logs in with correct credentials and establishes session", async () => {
    const { email, password } = await registerUser();
    createdEmails.push(email);

    const agent = await makeAgent();
    const csrf = await getCsrf(agent);

    const res = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf)
      .send({ email, password });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.id || res.body.email, "Login should return user data");
  });

  // ── /me ────────────────────────────────────────────────────────────────────

  it("returns current user data on GET /api/me when authenticated", async () => {
    const { agent, email } = await registerAndLogin();
    createdEmails.push(email);

    const res = await agent.get("/api/me");

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.email || res.body.id, "Should return user object");
  });

  it("returns 401 on GET /api/me when not authenticated", async () => {
    const agent = await makeAgent(); // fresh agent, no session
    const res = await agent.get("/api/me");
    assert.strictEqual(res.status, 401);
  });

  // ── Logout ─────────────────────────────────────────────────────────────────

  it("logout destroys session — subsequent /me returns 401", async () => {
    const { agent, csrfToken, email } = await registerAndLogin();
    createdEmails.push(email);

    // Verify logged in
    await agent.get("/api/me").expect(200);

    // Logout
    const logoutRes = await agent
      .post("/api/auth/logout")
      .set("x-csrf-token", csrfToken);
    assert.strictEqual(logoutRes.status, 200);
    assert.strictEqual(logoutRes.body.ok, true);

    // Now /me should 401
    await agent.get("/api/me").expect(401);
  });

  // ── CSRF enforcement ───────────────────────────────────────────────────────

  it("POST without x-csrf-token returns 403 CSRF_INVALID", async () => {
    const agent = await makeAgent();

    // Do NOT fetch CSRF token — just POST without it
    const res = await agent
      .post("/api/auth/login")
      .send({ email: "anyone@test.com", password: "password" });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "CSRF_INVALID");
  });

  it("POST with wrong x-csrf-token returns 403", async () => {
    const agent = await makeAgent();

    const res = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", "totally-wrong-token")
      .send({ email: "anyone@test.com", password: "password" });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "CSRF_INVALID");
  });
});
