/**
 * Subscription cancellation flow integration tests.
 *
 * Requires: DATABASE_URL (or DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  registerAndLogin,
  createPool,
  cleanupUser,
  ensureSubscription
} from "./helpers.js";

describe("Subscription Cancellation Flow", { skip: !hasDb && "No database configured" }, () => {
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

  it("owner can schedule cancellation for paid plan", async () => {
    const { agent, csrfToken, email, user } = await registerAndLogin();
    createdEmails.push(email);

    await ensureSubscription(pool, user.id, "PLUS");

    const res = await agent
      .post("/api/me/plan/cancel")
      .set("x-csrf-token", csrfToken)
      .send({});

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.plan, "PLUS");
    assert.strictEqual(res.body.subscription?.status, "canceling");
    assert.ok(res.body.subscription?.cancel_at, "cancel_at should be set");

    const { rows } = await pool.query(
      "SELECT status, cancel_at FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [user.id]
    );
    assert.strictEqual(rows[0]?.status, "canceling");
    assert.ok(rows[0]?.cancel_at, "cancel_at should be stored");
  });

  it("non-billing role cannot cancel subscription", async () => {
    const { agent, csrfToken, email, user } = await registerAndLogin({ org_role: "member" });
    createdEmails.push(email);

    await ensureSubscription(pool, user.id, "PLUS");

    const res = await agent
      .post("/api/me/plan/cancel")
      .set("x-csrf-token", csrfToken)
      .send({});

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "PERMISSION_DENIED");
  });

  it("INDIVIDUELL contract requires manual cancellation", async () => {
    const { agent, csrfToken, email } = await registerAndLogin({
      plan: "INDIVIDUELL",
      individual_signup_mode: "direct",
      employee_count: 120
    });
    createdEmails.push(email);

    const res = await agent
      .post("/api/me/plan/cancel")
      .set("x-csrf-token", csrfToken)
      .send({});

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, "MANUAL_CANCELLATION_REQUIRED");
  });
});
