/**
 * Subscription / Feature-Gating Flow Integration Tests
 *
 * Covers:
 *  - FREE user → 403 on SLA-only endpoints (capacities)
 *  - FREE user → can access legacy_access endpoints (listings)
 *  - Plan upgrade to PLUS → SLA endpoints become accessible
 *  - Plan upgrade persists in DB (subscriptions table verified)
 *  - Downgrade to FREE → SLA access revoked again
 *
 * Requires: DATABASE_URL (or DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  registerAndLogin,
  registerAndLoginAgency,
  createPool,
  cleanupUser,
  ensureSubscription
} from "./helpers.js";

// C-01: FEATURE_GATE_BYPASS=true (Docker-Dev) macht Feature-Gates BEWUSST durchlaessig
// (dokumentiertes Verhalten, vgl. CLAUDE.md P1-B). Die Gating-Assertions sind env-aware:
// im Bypass-Env wird der Bypass-Kontrakt (200) exakt geprueft, in strikten Envs (CI)
// bleibt das harte 403-Denial inkl. Fehler-Shape erzwungen. KEIN Abschwaechen —
// beide Zweige asserten praezise. (Naiver Env-Flip wurde 2026-06-07 als nicht
// tragfaehig verifiziert: Router-Build-Zeit-Gates lesen das Flag nicht zur Request-Zeit.)
const GATE_BYPASS = String(process.env.FEATURE_GATE_BYPASS || "").trim().toLowerCase() === "true";

describe("Subscription Feature-Gating Flow", { skip: !hasDb && "No database configured" }, () => {
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

  // ── FREE plan: legacy access allowed, SLA blocked ───────────────────────

  it("FREE user can access GET /api/listings (legacy_access)", async () => {
    const { agent, email } = await registerAndLogin();
    createdEmails.push(email);

    const res = await agent.get("/api/listings");
    assert.strictEqual(res.status, 200, "FREE plan should grant legacy_access");
    assert.ok(Array.isArray(res.body));
  });

  it("FREE user gets 403 FEATURE_NOT_ALLOWED on GET /api/capacities", async () => {
    const { agent, email } = await registerAndLogin();
    createdEmails.push(email);

    const res = await agent.get("/api/capacities");
    if (GATE_BYPASS) {
      assert.strictEqual(res.status, 200, "Bypass-Env: Gate ist bewusst offen (FEATURE_GATE_BYPASS=true)");
    } else {
      assert.strictEqual(res.status, 403, "FREE plan should NOT have sla_access");
      assert.strictEqual(res.body.code, "FEATURE_NOT_ALLOWED");
      assert.strictEqual(res.body.feature, "sla_access");
      assert.strictEqual(res.body.plan, "FREE");
    }
  });

  it("FREE agency user gets 403 on POST /api/capacities", async () => {
    const { agent, csrfToken, email } = await registerAndLoginAgency();
    createdEmails.push(email);

    const res = await agent
      .post("/api/capacities")
      .set("x-csrf-token", csrfToken)
      .send({
        role: "Fachkraft Lager",
        region: "Berlin",
        available_from: "2026-04-01",
        available_workers: 5
      });

    assert.strictEqual(res.status, 403, "FREE agency should not create capacities");
    assert.strictEqual(res.body.code, "FEATURE_NOT_ALLOWED");
  });

  // ── Upgrade to PLUS: SLA access granted ─────────────────────────────────

  it("upgrading to PLUS grants access to GET /api/capacities", async () => {
    const { agent, email, user } = await registerAndLogin();
    createdEmails.push(email);

    // Verify blocked before upgrade (im Bypass-Env bewusst offen)
    const before = await agent.get("/api/capacities");
    assert.strictEqual(before.status, GATE_BYPASS ? 200 : 403, "Should be blocked before upgrade (ausser Bypass-Env)");

    // Upgrade plan via DB
    await ensureSubscription(pool, user.id, "PLUS");

    // Now SLA endpoints should be accessible
    const after = await agent.get("/api/capacities");
    assert.strictEqual(after.status, 200, "PLUS plan should grant sla_access");
  });

  it("PLUS agency user can POST /api/capacities", async () => {
    const { agent, csrfToken, email, user } = await registerAndLoginAgency();
    createdEmails.push(email);

    await ensureSubscription(pool, user.id, "PLUS");

    const res = await agent
      .post("/api/capacities")
      .set("x-csrf-token", csrfToken)
      .send({
        role: "Fachkraft Lager",
        region: "Berlin",
        available_from: "2026-04-01",
        available_workers: 5
      });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id, "Created capacity should have an ID");
    assert.strictEqual(res.body.role, "Fachkraft Lager");
    assert.strictEqual(res.body.region, "Berlin");
  });

  // ── DB persistence check ────────────────────────────────────────────────

  it("subscription upgrade persists in DB", async () => {
    const { email, user } = await registerAndLogin();
    createdEmails.push(email);

    await ensureSubscription(pool, user.id, "PRO");

    const result = await pool.query(
      "SELECT plan, status FROM subscriptions WHERE user_id = $1",
      [user.id]
    );

    assert.ok(result.rows.length > 0, "Subscription row must exist");
    assert.strictEqual(result.rows[0].plan, "PRO");
    assert.strictEqual(result.rows[0].status, "active");
  });

  // ── Downgrade: access revoked ───────────────────────────────────────────

  it("downgrade from PLUS to FREE revokes SLA access", async () => {
    const { agent, email, user } = await registerAndLogin();
    createdEmails.push(email);

    // Upgrade first
    await ensureSubscription(pool, user.id, "PLUS");
    const granted = await agent.get("/api/capacities");
    assert.strictEqual(granted.status, 200, "PLUS should grant access");

    // Downgrade
    await ensureSubscription(pool, user.id, "FREE");
    const revoked = await agent.get("/api/capacities");
    if (GATE_BYPASS) {
      assert.strictEqual(revoked.status, 200, "Bypass-Env: Gate ist bewusst offen (FEATURE_GATE_BYPASS=true)");
    } else {
      assert.strictEqual(revoked.status, 403, "FREE should revoke sla_access");
      assert.strictEqual(revoked.body.code, "FEATURE_NOT_ALLOWED");
    }
  });

  // ── PLUS user still has legacy_access ───────────────────────────────────

  it("PLUS user loses legacy_access (PLUS not in legacy_access plans)", async () => {
    const { agent, email, user } = await registerAndLogin();
    createdEmails.push(email);

    await ensureSubscription(pool, user.id, "PLUS");

    // PLUS is NOT in the legacy_access plan list [FREE, BASIS]
    // So listings should be blocked for PLUS users (im Bypass-Env bewusst offen)
    const res = await agent.get("/api/listings");
    assert.strictEqual(res.status, GATE_BYPASS ? 200 : 403,
      "PLUS plan is not in legacy_access — listings should be blocked (ausser Bypass-Env)");
  });
});
