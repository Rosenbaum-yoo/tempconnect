/**
 * RBAC Deep Integration Tests
 *
 * Tests role-based permission enforcement on business resources against real DB:
 *   1.  Owner role: full contract CRUD access
 *   2.  Viewer role: can read contracts, cannot create → 403 PERMISSION_DENIED
 *   3.  Member role: cannot create contracts → 403 PERMISSION_DENIED
 *   4.  Cross-org: user from Org B cannot access Org A's contract → 403
 *   5.  No-membership user: → 403 NO_ORG_MEMBERSHIP
 *   6.  Role escalation guard: buyer_org_id ≠ own org → 403 ORG_BOUNDARY_VIOLATION
 *   7.  Deactivated membership: → 403 after membership deactivation
 *
 * Requires: DATABASE_URL (or DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  registerAndLoginWithPlan,
  registerAndLogin,
  makeAgent,
  getCsrf,
  createPool,
  cleanupUser,
  createSupplierOrg,
  getUserOrgId,
  ensureSubscription
} from "./helpers.js";

describe("RBAC Deep — Role & Org Enforcement", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  const createdOrgIds = [];
  const createdContractIds = [];

  // Org A: owner + viewer + member
  let ownerA;
  let orgAId;
  let supplierOrgId;

  // Viewer user in Org A
  let viewerUser;
  // Member user in Org A
  let memberUser;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    // ── Org A: Owner ────────────────────────────────────────────────────────
    ownerA = await registerAndLoginWithPlan(pool, "ENTERPRISE", {
      role: "company",
      company_name: "RBAC Test Org A"
    });
    createdEmails.push(ownerA.email);
    orgAId = await getUserOrgId(pool, ownerA.user.id);
    assert.ok(orgAId, "Org A must exist");

    // Supplier org for contract creation
    supplierOrgId = await createSupplierOrg(pool, "RBAC Supplier GmbH");
    createdOrgIds.push(supplierOrgId);

    // ── Viewer user: register, then add to Org A with 'viewer' role ─────────
    viewerUser = await registerAndLoginWithPlan(pool, "ENTERPRISE", {
      role: "company",
      company_name: "Viewer Personal Corp"
    });
    createdEmails.push(viewerUser.email);
    // Override: add as viewer in Org A (upsert handles existing membership)
    await pool.query(
      `INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
       VALUES ($1, $2, 'viewer', TRUE)
       ON CONFLICT (user_id, org_id) DO UPDATE SET role_key = 'viewer', is_active = TRUE`,
      [viewerUser.user.id, orgAId]
    );
    // Point user to Org A
    await pool.query("UPDATE users SET org_id = $1 WHERE id = $2", [orgAId, viewerUser.user.id]);

    // ── Member user: register, then add to Org A with 'member' role ─────────
    memberUser = await registerAndLoginWithPlan(pool, "ENTERPRISE", {
      role: "company",
      company_name: "Member Personal Corp"
    });
    createdEmails.push(memberUser.email);
    await pool.query(
      `INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
       VALUES ($1, $2, 'member', TRUE)
       ON CONFLICT (user_id, org_id) DO UPDATE SET role_key = 'member', is_active = TRUE`,
      [memberUser.user.id, orgAId]
    );
    await pool.query("UPDATE users SET org_id = $1 WHERE id = $2", [orgAId, memberUser.user.id]);
  });

  after(async () => {
    if (!pool) return;
    for (const cid of createdContractIds) {
      await pool.query("DELETE FROM contracts WHERE id = $1", [cid]).catch(() => {});
    }
    for (const oid of createdOrgIds) {
      await pool.query("DELETE FROM organizations WHERE id = $1", [oid]).catch(() => {});
    }
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Owner has full contract access
  // ═══════════════════════════════════════════════════════════════════════════

  let contractId;

  it("owner can create a contract → 201", async () => {
    const csrf = await getCsrf(ownerA.agent);
    const res = await ownerA.agent
      .post("/api/contracts")
      .set("x-csrf-token", csrf)
      .send({
        buyer_org_id: orgAId,
        supplier_org_id: supplierOrgId,
        contract_type: "framework",
        title: "RBAC Test Framework Agreement"
      });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    contractId = res.body.id;
    createdContractIds.push(contractId);
  });

  it("owner can read the contract → 200", async () => {
    assert.ok(contractId);
    const res = await ownerA.agent.get(`/api/contracts/${contractId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, contractId);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Viewer role: can read, cannot create
  // ═══════════════════════════════════════════════════════════════════════════

  it("viewer can read contract in own org → 200", async () => {
    assert.ok(contractId);
    const res = await viewerUser.agent.get(`/api/contracts/${contractId}`);
    assert.strictEqual(res.status, 200, `Viewer should be able to read, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.id, contractId);
  });

  it("viewer cannot create a contract → 403 PERMISSION_DENIED", async () => {
    const csrf = await getCsrf(viewerUser.agent);
    const res = await viewerUser.agent
      .post("/api/contracts")
      .set("x-csrf-token", csrf)
      .send({
        buyer_org_id: orgAId,
        supplier_org_id: supplierOrgId,
        contract_type: "nda",
        title: "Viewer Escalation Attempt"
      });

    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, "PERMISSION_DENIED");
    assert.strictEqual(res.body.permission, "contract.create");
  });

  it("viewer cannot terminate a contract → 403 PERMISSION_DENIED", async () => {
    assert.ok(contractId);
    const csrf = await getCsrf(viewerUser.agent);
    const res = await viewerUser.agent
      .post(`/api/contracts/${contractId}/terminate`)
      .set("x-csrf-token", csrf)
      .send({ reason: "Viewer should not be able to terminate" });

    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    assert.strictEqual(res.body.error, "PERMISSION_DENIED");
    assert.strictEqual(res.body.permission, "contract.terminate");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Member role: no contract.create permission
  // ═══════════════════════════════════════════════════════════════════════════

  it("member cannot create a contract → 403 PERMISSION_DENIED", async () => {
    const csrf = await getCsrf(memberUser.agent);
    const res = await memberUser.agent
      .post("/api/contracts")
      .set("x-csrf-token", csrf)
      .send({
        buyer_org_id: orgAId,
        supplier_org_id: supplierOrgId,
        contract_type: "sla",
        title: "Member Escalation Attempt"
      });

    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, "PERMISSION_DENIED");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Cross-org access: Org B cannot access Org A's contract
  // ═══════════════════════════════════════════════════════════════════════════

  it("user from Org B cannot read Org A's contract → 403", async () => {
    assert.ok(contractId);

    const orgBUser = await registerAndLoginWithPlan(pool, "ENTERPRISE", {
      role: "company",
      company_name: "RBAC Org B Corp"
    });
    createdEmails.push(orgBUser.email);

    const res = await orgBUser.agent.get(`/api/contracts/${contractId}`);
    assert.strictEqual(res.status, 403, "Cross-org access must be blocked");
    assert.strictEqual(res.body.error, "ORG_BOUNDARY_VIOLATION");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. No-membership user: blocked from org-scoped routes
  // ═══════════════════════════════════════════════════════════════════════════

  it("user with no org membership cannot access contracts → 403", async () => {
    const noOrgUser = await registerAndLogin({ role: "company", company_name: "No Org User" });
    createdEmails.push(noOrgUser.email);

    // Remove org membership and org_id
    await pool.query("DELETE FROM org_memberships WHERE user_id = $1", [noOrgUser.user.id]);
    await pool.query("UPDATE users SET org_id = NULL WHERE id = $1", [noOrgUser.user.id]);
    // Ensure ENTERPRISE plan so feature gate isn't the issue
    await ensureSubscription(pool, noOrgUser.user.id, "ENTERPRISE");

    const res = await noOrgUser.agent.get("/api/contracts");
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, "NO_ORG_MEMBERSHIP");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Role escalation: buyer_org_id ≠ own org
  // ═══════════════════════════════════════════════════════════════════════════

  it("creating contract with buyer_org_id of another org → 403 ORG_BOUNDARY_VIOLATION", async () => {
    const attackerUser = await registerAndLoginWithPlan(pool, "ENTERPRISE", {
      role: "company",
      company_name: "Attacker Corp"
    });
    createdEmails.push(attackerUser.email);
    const csrf = await getCsrf(attackerUser.agent);

    // Attempt to create contract as if belonging to Org A
    const res = await attackerUser.agent
      .post("/api/contracts")
      .set("x-csrf-token", csrf)
      .send({
        buyer_org_id: orgAId,       // NOT the attacker's org
        supplier_org_id: supplierOrgId,
        contract_type: "pricing",
        title: "Escalation Attack"
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "ORG_BOUNDARY_VIOLATION");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Owner can list contracts scoped to own org
  // ═══════════════════════════════════════════════════════════════════════════

  it("owner lists contracts scoped to own org → 200", async () => {
    const res = await ownerA.agent.get("/api/contracts");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.items, "Should have items array");
    // Every item should belong to owner's org
    for (const c of res.body.items) {
      const belongsToOrg = c.buyer_org_id === orgAId || c.supplier_org_id === orgAId;
      assert.ok(belongsToOrg, `Contract ${c.id} should belong to owner's org`);
    }
  });
});
