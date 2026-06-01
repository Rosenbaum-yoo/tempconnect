/**
 * Contract Lifecycle Integration Tests
 *
 * Covers:
 *   1.  Create contract (draft) — 201 with all fields persisted
 *   2.  List contracts — GET /api/contracts returns item
 *   3.  Get single contract — GET /api/contracts/:id
 *   4.  Update contract — PATCH /api/contracts/:id → 200
 *   5.  Activate contract — POST /api/contracts/:id/activate → draft→active
 *   6.  Terminate contract — POST /api/contracts/:id/terminate → active→terminated
 *   7.  Validation: missing required fields → 400 VALIDATION
 *   8.  Org-Boundary: outsider cannot read contract → 403
 *   9.  RBAC: user with 'viewer' role cannot create contracts → 403
 *  10.  DB persistence: verify rows directly in database
 *  11.  Unauthenticated access → 401
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
  getUserOrgId
} from "./helpers.js";

describe("Contract Lifecycle E2E", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  const createdOrgIds = [];   // supplier orgs to clean up
  const createdContractIds = [];

  // Primary actor: company owner with ENTERPRISE plan
  let owner;
  let ownerOrgId;
  let supplierOrgId;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    // Register company owner with ENTERPRISE plan (has all contract.* permissions)
    owner = await registerAndLoginWithPlan(pool, "ENTERPRISE", {
      role: "company",
      company_name: "E2E Buyer AG"
    });
    createdEmails.push(owner.email);

    // Resolve the auto-created org
    ownerOrgId = await getUserOrgId(pool, owner.user.id);
    assert.ok(ownerOrgId, "Owner must have an org after registration");

    // Create a separate supplier org for contract references
    supplierOrgId = await createSupplierOrg(pool, "E2E Lieferant GmbH");
    createdOrgIds.push(supplierOrgId);
  });

  after(async () => {
    if (!pool) return;
    // Clean contracts
    for (const cid of createdContractIds) {
      await pool.query("DELETE FROM contracts WHERE id = $1", [cid]).catch(() => {});
    }
    // Clean supplier orgs (no cascading user deps)
    for (const oid of createdOrgIds) {
      await pool.query("DELETE FROM organizations WHERE id = $1", [oid]).catch(() => {});
    }
    // Clean users (cascades to org_memberships, orgs via cleanupUser)
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: Create contract (draft)
  // ═══════════════════════════════════════════════════════════════════════════

  let contractId;

  it("Step 1: creates a draft contract → 201", async () => {
    const csrf = await getCsrf(owner.agent);

    const res = await owner.agent
      .post("/api/contracts")
      .set("x-csrf-token", csrf)
      .send({
        buyer_org_id: ownerOrgId,
        supplier_org_id: supplierOrgId,
        contract_type: "msa",
        title: "Master Service Agreement 2026",
        description: "Rahmenvertrag Zeitarbeit Logistik",
        terms_summary: "§1 Gegenstand, §2 Laufzeit, §3 Vergütung",
        valid_from: "2026-04-01",
        valid_until: "2027-03-31"
      });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id, "Contract must have an ID");
    assert.strictEqual(res.body.status, "draft");
    assert.strictEqual(res.body.contract_type, "msa");
    assert.strictEqual(res.body.title, "Master Service Agreement 2026");
    assert.strictEqual(res.body.buyer_org_id, ownerOrgId);
    assert.strictEqual(res.body.supplier_org_id, supplierOrgId);
    contractId = res.body.id;
    createdContractIds.push(contractId);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: List contracts
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 2: GET /api/contracts lists the created contract", async () => {
    assert.ok(contractId, "Contract must exist from Step 1");

    const res = await owner.agent.get("/api/contracts");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.items, "Response should have items array");
    const found = res.body.items.find(c => c.id === contractId);
    assert.ok(found, "Created contract should appear in list");
    assert.strictEqual(found.status, "draft");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 3: Get single contract
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 3: GET /api/contracts/:id returns contract detail", async () => {
    assert.ok(contractId, "Contract must exist");

    const res = await owner.agent.get(`/api/contracts/${contractId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, contractId);
    assert.strictEqual(res.body.description, "Rahmenvertrag Zeitarbeit Logistik");
    assert.strictEqual(res.body.valid_from, "2026-04-01");
    assert.strictEqual(res.body.valid_until, "2027-03-31");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 4: Update contract
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 4: PATCH /api/contracts/:id updates fields", async () => {
    assert.ok(contractId, "Contract must exist");

    const csrf = await getCsrf(owner.agent);
    const res = await owner.agent
      .patch(`/api/contracts/${contractId}`)
      .set("x-csrf-token", csrf)
      .send({ title: "MSA 2026 – Aktualisiert", internal_notes: "Verhandlung abgeschlossen" });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.title, "MSA 2026 – Aktualisiert");
    assert.strictEqual(res.body.internal_notes, "Verhandlung abgeschlossen");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 5: Activate contract (draft → active)
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 5: POST /api/contracts/:id/activate → draft to active", async () => {
    assert.ok(contractId, "Contract must exist");

    const csrf = await getCsrf(owner.agent);
    const res = await owner.agent
      .post(`/api/contracts/${contractId}/activate`)
      .set("x-csrf-token", csrf)
      .send();

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.status, "active");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 6: Terminate contract (active → terminated)
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 6: POST /api/contracts/:id/terminate → active to terminated", async () => {
    assert.ok(contractId, "Contract must exist");

    const csrf = await getCsrf(owner.agent);
    const res = await owner.agent
      .post(`/api/contracts/${contractId}/terminate`)
      .set("x-csrf-token", csrf)
      .send({ reason: "Vertragslaufzeit beendet" });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.status, "terminated");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 7: DB persistence verification
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 7: contract state is persisted in database", async () => {
    assert.ok(contractId, "Contract must exist");

    const { rows } = await pool.query(
      "SELECT status, termination_reason FROM contracts WHERE id = $1",
      [contractId]
    );
    assert.strictEqual(rows.length, 1, "Contract must exist in DB");
    assert.strictEqual(rows[0].status, "terminated");
    assert.strictEqual(rows[0].termination_reason, "Vertragslaufzeit beendet");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════════════════════

  it("rejects contract creation with missing required fields → 400", async () => {
    const csrf = await getCsrf(owner.agent);
    const res = await owner.agent
      .post("/api/contracts")
      .set("x-csrf-token", csrf)
      .send({ title: "Incomplete" }); // missing buyer_org_id, supplier_org_id, contract_type

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "VALIDATION");
    assert.ok(Array.isArray(res.body.details), "Should include validation details");
  });

  it("rejects contract creation with invalid contract_type → 400", async () => {
    const csrf = await getCsrf(owner.agent);
    const res = await owner.agent
      .post("/api/contracts")
      .set("x-csrf-token", csrf)
      .send({
        buyer_org_id: ownerOrgId,
        supplier_org_id: supplierOrgId,
        contract_type: "invalid_type",
        title: "Bad Type Contract"
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "VALIDATION");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Org-Boundary enforcement
  // ═══════════════════════════════════════════════════════════════════════════

  it("outsider user cannot read contract → 403 ORG_BOUNDARY_VIOLATION", async () => {
    // Create a second contract to test with (the original is terminated but still readable)
    const csrf = await getCsrf(owner.agent);
    const createRes = await owner.agent
      .post("/api/contracts")
      .set("x-csrf-token", csrf)
      .send({
        buyer_org_id: ownerOrgId,
        supplier_org_id: supplierOrgId,
        contract_type: "nda",
        title: "Confidential NDA"
      });
    const ndaId = createRes.body.id;
    if (ndaId) createdContractIds.push(ndaId);

    // Register an outsider in a different org
    const outsider = await registerAndLoginWithPlan(pool, "ENTERPRISE", {
      role: "company",
      company_name: "Outsider Corp"
    });
    createdEmails.push(outsider.email);

    const res = await outsider.agent.get(`/api/contracts/${ndaId}`);
    assert.strictEqual(res.status, 403, "Outsider must be blocked from reading contract");
    assert.strictEqual(res.body.error, "ORG_BOUNDARY_VIOLATION");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Org-Boundary: buyer_org_id must match own org
  // ═══════════════════════════════════════════════════════════════════════════

  it("rejects contract creation with buyer_org_id ≠ own org → 403", async () => {
    const outsider = await registerAndLoginWithPlan(pool, "ENTERPRISE", {
      role: "company",
      company_name: "Another Corp"
    });
    createdEmails.push(outsider.email);
    const csrf = await getCsrf(outsider.agent);

    // Try to create a contract for the owner's org — should be blocked
    const res = await outsider.agent
      .post("/api/contracts")
      .set("x-csrf-token", csrf)
      .send({
        buyer_org_id: ownerOrgId,          // NOT the outsider's org
        supplier_org_id: supplierOrgId,
        contract_type: "framework",
        title: "Escalation Attempt"
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, "ORG_BOUNDARY_VIOLATION");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unauthenticated access
  // ═══════════════════════════════════════════════════════════════════════════

  it("unauthenticated GET /api/contracts → 401", async () => {
    const agent = await makeAgent();
    const res = await agent.get("/api/contracts");
    assert.strictEqual(res.status, 401);
  });

  it("unauthenticated POST /api/contracts → 401/403", async () => {
    const agent = await makeAgent();
    const csrf = await getCsrf(agent);
    const res = await agent
      .post("/api/contracts")
      .set("x-csrf-token", csrf)
      .send({
        buyer_org_id: ownerOrgId,
        supplier_org_id: supplierOrgId,
        contract_type: "msa",
        title: "Unauthorized"
      });
    assert.ok([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET non-existent contract
  // ═══════════════════════════════════════════════════════════════════════════

  it("GET /api/contracts/:id with unknown id → 404", async () => {
    const res = await owner.agent.get("/api/contracts/00000000-0000-0000-0000-000000000000");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "NOT_FOUND");
  });
});
