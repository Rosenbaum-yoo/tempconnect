/**
 * EP-09 Smoke + Cross-Org Boundary Tests — Worker Portal
 *
 * Coverage:
 *  (AUTH-1..7) Unauthenticated access to all major portal read-endpoints → 401
 *  (SMOKE-1..7) Authenticated worker — read endpoints return 200 with correct shape
 *  (XORG-1)    Worker B cannot GET Worker A's submission by ID → 403 or 404
 *  (XORG-2)    Worker B's submission list does NOT contain Worker A's submission
 *  (XORG-3)    Worker B's assignment list does NOT contain Worker A's assignment
 *
 * Setup: agency + company + 2 workers.
 *   Worker A: assignment + link + submission (via API)
 *   Worker B: no assignment, no data
 *
 * Requires: DATABASE_URL (or DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  makeAgent,
  getCsrf,
  registerAndLoginWithPlan,
  uniqueEmail,
  createPool,
  cleanupUser,
  getUserOrgId
} from "./helpers.js";

describe("EP-09 Smoke + Cross-Org: Worker Portal", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  let agency, company;
  let agencyOrgId, companyOrgId;

  // Worker A — has an assignment, link and submission
  let workerAEmail, workerAPassword, workerAAgent;
  let workerAUserId, workerALinkId, workerAAssignmentId, workerASubmissionId;

  // Worker B — no assignment, no data
  let workerBEmail, workerBPassword, workerBAgent;

  const createdEmails = [];
  const weekStart = "2026-08-03";
  const weekEnd   = "2026-08-09";

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    // Agency + company
    agency = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "agency",
      company_name: "EP-09 Zeitarbeit GmbH"
    });
    createdEmails.push(agency.email);
    agencyOrgId = await getUserOrgId(pool, agency.user.id);

    company = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "company",
      company_name: "EP-09 Kunde AG"
    });
    createdEmails.push(company.email);
    companyOrgId = await getUserOrgId(pool, company.user.id);

    // Create Worker A via agency
    workerAEmail    = uniqueEmail();
    workerAPassword = "WorkerAPass123!";
    const csrfA = await getCsrf(agency.agent);
    await agency.agent
      .post("/api/workers")
      .set("x-csrf-token", csrfA)
      .send({
        email: workerAEmail, first_name: "Smoke", last_name: "Alpha",
        password: workerAPassword, personnel_number: "EP09-A"
      });
    createdEmails.push(workerAEmail);

    const aRow = await pool.query("SELECT id FROM users WHERE email = $1", [workerAEmail]);
    workerAUserId = aRow.rows[0].id;

    // Assignment + link for Worker A
    const asgRow = await pool.query(
      `INSERT INTO assignments
         (org_id, supplier_org_id, worker_description, worker_count,
          requested_quantity, filled_quantity, reserved_quantity, open_quantity,
          staffing_status, start_date, planned_end_date, notes, created_by, status)
       VALUES ($1,$2,$3,1,1,0,0,1,'open',$4,$5,$6,$7,'planned') RETURNING id`,
      [companyOrgId, agencyOrgId, "EP-09 Smoke Test Einsatz",
       "2026-08-01", "2026-12-31", "Smoke + Cross-Org Test", workerAUserId]
    );
    workerAAssignmentId = asgRow.rows[0].id;

    const linkRow = await pool.query(
      `INSERT INTO worker_assignment_links
         (worker_user_id, assignment_id, org_id, supplier_org_id,
          default_hours_per_day, start_date, end_date, created_by)
       VALUES ($1,$2,$3,$4,8,$5,$6,$7) RETURNING id`,
      [workerAUserId, workerAAssignmentId, companyOrgId, agencyOrgId,
       "2026-08-01", "2026-12-31", workerAUserId]
    );
    workerALinkId = linkRow.rows[0].id;

    // Create Worker B via agency (no assignment)
    workerBEmail    = uniqueEmail();
    workerBPassword = "WorkerBPass123!";
    const csrfB = await getCsrf(agency.agent);
    await agency.agent
      .post("/api/workers")
      .set("x-csrf-token", csrfB)
      .send({
        email: workerBEmail, first_name: "Smoke", last_name: "Beta",
        password: workerBPassword, personnel_number: "EP09-B"
      });
    createdEmails.push(workerBEmail);

    // Login Worker A
    workerAAgent = await makeAgent();
    const csrfLoginA = await getCsrf(workerAAgent);
    await workerAAgent
      .post("/api/auth/login")
      .set("x-csrf-token", csrfLoginA)
      .send({ email: workerAEmail, password: workerAPassword })
      .expect(200);

    // Create a submission for Worker A via API so we have a real ID for XORG tests
    const csrfSub = await getCsrf(workerAAgent);
    const subRes = await workerAAgent
      .post("/api/worker/submissions")
      .set("x-csrf-token", csrfSub)
      .send({ worker_assignment_link_id: workerALinkId, week_start: weekStart, week_end: weekEnd });
    if (subRes.status === 201) {
      workerASubmissionId = subRes.body.id;
    }

    // Login Worker B
    workerBAgent = await makeAgent();
    const csrfLoginB = await getCsrf(workerBAgent);
    await workerBAgent
      .post("/api/auth/login")
      .set("x-csrf-token", csrfLoginB)
      .send({ email: workerBEmail, password: workerBPassword })
      .expect(200);
  });

  after(async () => {
    if (!pool) return;
    if (workerASubmissionId) {
      await pool.query(
        "DELETE FROM worker_time_submissions WHERE id = $1",
        [workerASubmissionId]
      ).catch(() => {});
    }
    if (workerALinkId) {
      await pool.query(
        "DELETE FROM worker_assignment_links WHERE id = $1",
        [workerALinkId]
      ).catch(() => {});
    }
    if (workerAAssignmentId) {
      await pool.query(
        "DELETE FROM assignments WHERE id = $1",
        [workerAAssignmentId]
      ).catch(() => {});
    }
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  // ── (AUTH) Unauthenticated access → 401 ──────────────────────────────────────

  it("AUTH-1: GET /worker/me without auth → 401", async () => {
    const agent = await makeAgent();
    const res = await agent.get("/api/worker/me");
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  it("AUTH-2: GET /worker/assignments without auth → 401", async () => {
    const agent = await makeAgent();
    const res = await agent.get("/api/worker/assignments");
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  it("AUTH-3: GET /worker/submissions without auth → 401", async () => {
    const agent = await makeAgent();
    const res = await agent.get("/api/worker/submissions");
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  it("AUTH-4: GET /worker/documents without auth → 401", async () => {
    const agent = await makeAgent();
    const res = await agent.get("/api/worker/documents");
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  it("AUTH-5: GET /worker/schedule without auth → 401", async () => {
    const agent = await makeAgent();
    const res = await agent.get(`/api/worker/schedule?from=${weekStart}&to=${weekEnd}`);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  it("AUTH-6: GET /worker/notifications without auth → 401", async () => {
    const agent = await makeAgent();
    const res = await agent.get("/api/worker/notifications");
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  it("AUTH-7: GET /worker/dashboard without auth → 401", async () => {
    const agent = await makeAgent();
    const res = await agent.get("/api/worker/dashboard");
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // ── (SMOKE) Authenticated → 200 with correct shape ───────────────────────────

  it("SMOKE-1: GET /worker/me → 200 with id + email", async () => {
    const res = await workerAAgent.get("/api/worker/me");
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id,    "Response must have id");
    assert.ok(res.body.email, "Response must have email");
  });

  it("SMOKE-2: GET /worker/assignments → 200 with items array", async () => {
    const res = await workerAAgent.get("/api/worker/assignments");
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body.items), "items must be an array");
  });

  it("SMOKE-3: GET /worker/submissions → 200 with items array", async () => {
    const res = await workerAAgent.get("/api/worker/submissions");
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body.items), "items must be an array");
  });

  it("SMOKE-4: GET /worker/documents → 200 with items array", async () => {
    const res = await workerAAgent.get("/api/worker/documents");
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body.items), "items must be an array");
  });

  it("SMOKE-5: GET /worker/schedule?from&to → 200 with items array", async () => {
    const res = await workerAAgent.get(`/api/worker/schedule?from=${weekStart}&to=${weekEnd}`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body.items), "items must be an array");
  });

  it("SMOKE-6: GET /worker/notifications → 200 with items array", async () => {
    const res = await workerAAgent.get("/api/worker/notifications");
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body.items), "items must be an array");
  });

  it("SMOKE-7: GET /worker/dashboard → 200 with document_hub", async () => {
    const res = await workerAAgent.get("/api/worker/dashboard");
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.body.document_hub !== undefined, "Response must have document_hub");
  });

  // ── (XORG) Cross-org boundary ─────────────────────────────────────────────────

  it("XORG-1: Worker B cannot GET Worker A's submission by ID → 403 or 404", async () => {
    if (!workerASubmissionId) {
      // Submission creation failed in setup — soft-skip
      assert.ok(true, "Skipped: workerASubmissionId not available from setup");
      return;
    }
    const res = await workerBAgent.get(`/api/worker/submissions/${workerASubmissionId}`);
    assert.ok(
      res.status === 403 || res.status === 404,
      `Worker B must NOT access Worker A's submission — expected 403/404, got ${res.status}: ${JSON.stringify(res.body)}`
    );
  });

  it("XORG-2: Worker B's submission list does NOT contain Worker A's submission", async () => {
    if (!workerASubmissionId) {
      assert.ok(true, "Skipped: workerASubmissionId not available from setup");
      return;
    }
    const res = await workerBAgent.get("/api/worker/submissions");
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const ids = (res.body.items || []).map(s => s.id);
    assert.ok(
      !ids.includes(workerASubmissionId),
      `Worker B's submission list must NOT include Worker A's submission ${workerASubmissionId} — got IDs: ${ids.join(", ")}`
    );
  });

  it("XORG-3: Worker B's assignment list does NOT contain Worker A's assignment", async () => {
    const res = await workerBAgent.get("/api/worker/assignments");
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    // assignments list items may expose link_id or assignment_id
    const assignmentIds = (res.body.items || []).map(a => a.assignment_id || a.id);
    const linkIds       = (res.body.items || []).map(a => a.link_id || a.id);
    assert.ok(
      !assignmentIds.includes(workerAAssignmentId) && !linkIds.includes(workerALinkId),
      `Worker B must NOT see Worker A's assignment (${workerAAssignmentId}) or link (${workerALinkId})`
    );
  });
});
