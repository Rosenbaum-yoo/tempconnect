/**
 * EP-03 Security Tests — worker_time_submissions org-boundary hardening
 *
 * Verifies that POST /api/worker/submissions:
 *  (A) Rejects requests without worker_assignment_link_id (400 VALIDATION)
 *  (B) Silently rejects requests that send org_id/supplier_org_id without link_id (400)
 *  (C) Rejects a link_id that belongs to a different worker (403 ASSIGNMENT_LINK_FORBIDDEN)
 *  (D) Accepts a valid own link_id WITHOUT org_id/supplier_org_id in body (201)
 *      — and the created submission carries the org from the DB link, not from client
 *
 * Root cause closed: B-02 from EP_BASELINE.md
 * Route change: createSubmissionSchema removed org_id/supplier_org_id; added required link_id.
 * org_id / supplier_org_id / assignment_id are always derived server-side.
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

describe("EP-03 Security: worker_submission org-boundary", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  let agency;
  let agencyOrgId, companyOrgId;

  let workerAEmail, workerAPassword, workerAAgent, workerALinkId;
  let workerBEmail, workerBPassword, workerBAgent;
  let testAssignmentId;

  const createdEmails = [];

  const weekStart = "2026-07-07"; // distinct from flow test week to avoid DUPLICATE_WEEK
  const weekEnd   = "2026-07-13";

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    // Set up agency (supplier) and company (buyer)
    agency = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "agency",
      company_name: "EP-03 Zeitarbeit GmbH"
    });
    createdEmails.push(agency.email);
    agencyOrgId = await getUserOrgId(pool, agency.user.id);

    const company = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "company",
      company_name: "EP-03 Kunde AG"
    });
    createdEmails.push(company.email);
    companyOrgId = await getUserOrgId(pool, company.user.id);

    // Create Worker A
    workerAEmail    = uniqueEmail();
    workerAPassword = "WorkerAPass123!";
    const csrfA = await getCsrf(agency.agent);
    await agency.agent
      .post("/api/workers")
      .set("x-csrf-token", csrfA)
      .send({
        email: workerAEmail, first_name: "Worker", last_name: "Alpha",
        password: workerAPassword, personnel_number: "EP03-A"
      });
    createdEmails.push(workerAEmail);

    // Create Worker B (no link — should never access A's submissions)
    workerBEmail    = uniqueEmail();
    workerBPassword = "WorkerBPass123!";
    const csrfB = await getCsrf(agency.agent);
    await agency.agent
      .post("/api/workers")
      .set("x-csrf-token", csrfB)
      .send({
        email: workerBEmail, first_name: "Worker", last_name: "Beta",
        password: workerBPassword, personnel_number: "EP03-B"
      });
    createdEmails.push(workerBEmail);

    // Fetch user IDs from DB
    const aRow = await pool.query("SELECT id FROM users WHERE email = $1", [workerAEmail]);
    const bRow = await pool.query("SELECT id FROM users WHERE email = $1", [workerBEmail]);
    const workerAUserId = aRow.rows[0].id;

    // Create assignment + link for Worker A only
    const asgRow = await pool.query(
      `INSERT INTO assignments
         (org_id, supplier_org_id, worker_description, worker_count,
          requested_quantity, filled_quantity, reserved_quantity, open_quantity,
          staffing_status, start_date, planned_end_date, notes, created_by, status)
       VALUES ($1, $2, $3, 1, 1, 0, 0, 1, 'open', $4, $5, $6, $7, 'planned')
       RETURNING id`,
      [companyOrgId, agencyOrgId, "EP-03 Sicherheitstest-Einsatz",
       "2026-07-01", "2026-12-31", "Org-Boundary-Test", workerAUserId]
    );
    testAssignmentId = asgRow.rows[0].id;

    const linkRow = await pool.query(
      `INSERT INTO worker_assignment_links
         (worker_user_id, assignment_id, org_id, supplier_org_id,
          default_hours_per_day, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, 8, $5, $6, $7)
       RETURNING id`,
      [workerAUserId, testAssignmentId, companyOrgId, agencyOrgId,
       "2026-07-01", "2026-12-31", workerAUserId]
    );
    workerALinkId = linkRow.rows[0].id;

    // Log in Worker A
    workerAAgent = await makeAgent();
    const csrfLoginA = await getCsrf(workerAAgent);
    await workerAAgent
      .post("/api/auth/login")
      .set("x-csrf-token", csrfLoginA)
      .send({ email: workerAEmail, password: workerAPassword })
      .expect(200);

    // Log in Worker B
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

    if (workerALinkId) {
      await pool.query("DELETE FROM worker_assignment_links WHERE id = $1", [workerALinkId]).catch(() => {});
    }
    if (testAssignmentId) {
      await pool.query("DELETE FROM assignments WHERE id = $1", [testAssignmentId]).catch(() => {});
    }

    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  // ── (A) Missing worker_assignment_link_id → 400 VALIDATION ─────────────────

  it("(A) rejects POST without worker_assignment_link_id — schema requires it", async () => {
    const csrf = await getCsrf(workerAAgent);
    const res = await workerAAgent
      .post("/api/worker/submissions")
      .set("x-csrf-token", csrf)
      .send({ week_start: weekStart, week_end: weekEnd });

    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, "VALIDATION");
  });

  // ── (B) Sending org_id/supplier_org_id without link_id still → 400 ─────────

  it("(B) rejects POST with org_id/supplier_org_id but no link_id — those fields are no longer accepted", async () => {
    const csrf = await getCsrf(workerAAgent);
    const res = await workerAAgent
      .post("/api/worker/submissions")
      .set("x-csrf-token", csrf)
      .send({
        org_id:          companyOrgId,  // legacy — no longer accepted
        supplier_org_id: agencyOrgId,   // legacy — no longer accepted
        week_start:      weekStart,
        week_end:        weekEnd
      });

    // link_id is missing → 400 regardless of org_id/supplier_org_id presence
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, "VALIDATION");
  });

  // ── (C) Worker B uses Worker A's link_id → 403 ─────────────────────────────

  it("(C) rejects cross-org submission attempt: Worker B cannot use Worker A's link_id (403)", async () => {
    const csrf = await getCsrf(workerBAgent);
    const res = await workerBAgent
      .post("/api/worker/submissions")
      .set("x-csrf-token", csrf)
      .send({
        worker_assignment_link_id: workerALinkId, // belongs to Worker A, not B
        week_start: weekStart,
        week_end:   weekEnd
      });

    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, "ASSIGNMENT_LINK_FORBIDDEN",
      "Cross-org access must return ASSIGNMENT_LINK_FORBIDDEN, not a 200/201");
  });

  // ── (D) Valid own link_id, no org_id in body → 201 with org from DB ─────────

  it("(D) accepts valid own link_id without org_id in body — org derived server-side (201)", async () => {
    const csrf = await getCsrf(workerAAgent);
    const res = await workerAAgent
      .post("/api/worker/submissions")
      .set("x-csrf-token", csrf)
      .send({
        worker_assignment_link_id: workerALinkId,
        week_start: weekStart,
        week_end:   weekEnd
        // No org_id, no supplier_org_id — server derives them from the link
      });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.status, "draft");
    assert.ok(res.body.id, "Submission must have an id");

    // Verify org context was populated from DB (not from client)
    assert.strictEqual(res.body.org_id,          companyOrgId,  "org_id must come from DB link, not client body");
    assert.strictEqual(res.body.supplier_org_id,  agencyOrgId,   "supplier_org_id must come from DB link, not client body");
    assert.strictEqual(res.body.assignment_id,    testAssignmentId, "assignment_id must come from DB link");

    // Cleanup: delete this submission so it doesn't interfere with other tests
    await pool.query(
      "DELETE FROM worker_time_submissions WHERE id = $1",
      [res.body.id]
    ).catch(() => {});
  });
});
