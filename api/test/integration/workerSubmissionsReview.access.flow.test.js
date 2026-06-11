import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  registerAndLoginWithPlan,
  registerAndLoginAgency,
  createPool,
  cleanupUser,
  getUserOrgId
} from "./helpers.js";

describe("Worker submissions review access contract", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  let reviewOwner;
  let reviewMember;
  let demoAgency;
  let ownerOrgId;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    reviewOwner = await registerAndLoginWithPlan(pool, "ENTERPRISE", {
      role: "agency",
      company_name: "Worker Review Owner GmbH"
    });
    createdEmails.push(reviewOwner.email);
    ownerOrgId = await getUserOrgId(pool, reviewOwner.user.id);
    assert.ok(ownerOrgId, "Owner org must exist");

    reviewMember = await registerAndLoginWithPlan(pool, "ENTERPRISE", {
      role: "agency",
      company_name: "Worker Review Member GmbH"
    });
    createdEmails.push(reviewMember.email);
    const memberOriginalOrgId = await getUserOrgId(pool, reviewMember.user.id);
    await pool.query(
      "UPDATE org_memberships SET is_active = FALSE WHERE user_id = $1 AND org_id = $2",
      [reviewMember.user.id, memberOriginalOrgId]
    );
    await pool.query(
      `INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
       VALUES ($1, $2, 'member', TRUE)
       ON CONFLICT (user_id, org_id) DO UPDATE SET role_key = 'member', is_active = TRUE`,
      [reviewMember.user.id, ownerOrgId]
    );
    await pool.query("UPDATE users SET org_id = $1 WHERE id = $2", [ownerOrgId, reviewMember.user.id]);

    demoAgency = await registerAndLoginAgency({
      company_name: "Worker Review Demo Agency GmbH"
    });
    createdEmails.push(demoAgency.email);
  });

  after(async () => {
    if (!pool) return;
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  it("GET /api/me exposes worker capabilities for a review-capable agency owner", async () => {
    const res = await reviewOwner.agent.get("/api/me");

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.capabilities, {
      worker_module: true,
      worker_view: true,
      worker_review: true,
      worker_create: true,
      worker_manage: true,
      worker_edit: true
    });
  });

  it("GET /api/me reflects read-only worker access for a member in the same org", async () => {
    const res = await reviewMember.agent.get("/api/me");

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.capabilities, {
      worker_module: true,
      worker_view: true,
      worker_review: false,
      worker_create: false,
      worker_manage: false,
      worker_edit: false
    });
  });

  it("GET /api/agency/submissions allows worker.review users but blocks member-only access", async () => {
    const ownerRes = await reviewOwner.agent.get("/api/agency/submissions?limit=10");
    assert.strictEqual(ownerRes.status, 200, `Expected 200, got ${ownerRes.status}: ${JSON.stringify(ownerRes.body)}`);
    assert.ok(Array.isArray(ownerRes.body.items), "Expected submissions list payload");

    const memberRes = await reviewMember.agent.get("/api/agency/submissions?limit=10");
    assert.strictEqual(memberRes.status, 403);
    assert.strictEqual(memberRes.body.error, "PERMISSION_DENIED");
  });

  it("GET /api/agency/submissions enforces the worker_module feature gate", async () => {
    const res = await demoAgency.agent.get("/api/agency/submissions?limit=10");

    // C-01: env-aware — FEATURE_GATE_BYPASS=true (Docker-Dev) oeffnet das Gate bewusst (200),
    // strikte Envs (CI) erzwingen weiter das harte 403 inkl. Fehler-Shape. Kein Abschwaechen.
    const GATE_BYPASS = String(process.env.FEATURE_GATE_BYPASS || "").trim().toLowerCase() === "true";
    if (GATE_BYPASS) {
      assert.strictEqual(res.status, 200, "Bypass-Env: Gate ist bewusst offen (FEATURE_GATE_BYPASS=true)");
    } else {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error, "FEATURE_NOT_ALLOWED");
      assert.strictEqual(res.body.feature, "worker_module");
    }
  });
});
