/**
 * Timesheet Workflow Integration Tests
 *
 * Full lifecycle against real database:
 *   1.  Create timesheet (draft) — agency side
 *   2.  Add daily entries (3 work days)
 *   3.  Read timesheet with entries
 *   4.  Submit timesheet (draft → submitted)
 *   5.  Company approves (submitted → approved)
 *   6.  Reject cycle: submit → reject → return-to-draft → re-submit → approve
 *   7.  Cancel workflow: draft → cancelled
 *   8.  Feature gate: FREE user → 403 FEATURE_NOT_AVAILABLE
 *   9.  Org-boundary: outsider cannot read timesheet → 403
 *  10.  Invalid transitions: approve already-approved → 409
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
  registerAndLoginAgency,
  makeAgent,
  getCsrf,
  createPool,
  cleanupUser,
  ensureSubscription,
  getUserOrgId
} from "./helpers.js";

describe("Timesheet Workflow E2E", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  const createdTimesheetIds = [];
  const createdAssignmentIds = [];

  // Actors
  let agency, company;
  let agencyOrgId, companyOrgId;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    // Agency (supplier side) — needs PLUS plan for timesheet feature
    agency = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "agency",
      company_name: "E2E Zeitarbeit GmbH"
    });
    createdEmails.push(agency.email);
    agencyOrgId = await getUserOrgId(pool, agency.user.id);

    // Company (buyer side) — needs PLUS plan for timesheet feature
    company = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "company",
      company_name: "E2E Industriekunde AG"
    });
    createdEmails.push(company.email);
    companyOrgId = await getUserOrgId(pool, company.user.id);
  });

  after(async () => {
    if (!pool) return;
    // Clean timesheet entries + timesheets
    for (const tsId of createdTimesheetIds) {
      await pool.query("DELETE FROM timesheet_entries WHERE timesheet_id = $1", [tsId]).catch(() => {});
      await pool.query("DELETE FROM timesheets WHERE id = $1", [tsId]).catch(() => {});
    }
    // Clean assignments
    for (const aId of createdAssignmentIds) {
      await pool.query("DELETE FROM assignments WHERE id = $1", [aId]).catch(() => {});
    }
    // Clean users
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: Create timesheet (draft)
  // ═══════════════════════════════════════════════════════════════════════════

  let timesheetId;

  it("Step 1: agency creates a draft timesheet → 201", async () => {
    const csrf = await getCsrf(agency.agent);

    const res = await agency.agent
      .post("/api/timesheets")
      .set("x-csrf-token", csrf)
      .send({
        org_id: companyOrgId,
        supplier_org_id: agencyOrgId,
        worker_name: "Max Mustermann",
        worker_identifier: "P-2026-001",
        week_start: "2026-04-06",
        week_end: "2026-04-10",
        notes: "Lagerlogistik KW15"
      });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id, "Timesheet must have an ID");
    assert.strictEqual(res.body.status, "draft");
    assert.strictEqual(res.body.worker_name, "Max Mustermann");
    assert.strictEqual(res.body.org_id, companyOrgId);
    assert.strictEqual(res.body.supplier_org_id, agencyOrgId);
    timesheetId = res.body.id;
    createdTimesheetIds.push(timesheetId);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: Add daily entries
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 2: adds 3 daily entries to timesheet", async () => {
    assert.ok(timesheetId, "Timesheet must exist from Step 1");

    const csrf = await getCsrf(agency.agent);
    const days = [
      { work_date: "2026-04-06", hours_regular: 8, hours_overtime: 0, break_minutes: 30, shift_start: "07:00", shift_end: "15:30" },
      { work_date: "2026-04-07", hours_regular: 8, hours_overtime: 2, break_minutes: 30, shift_start: "07:00", shift_end: "17:30" },
      { work_date: "2026-04-08", hours_regular: 6, hours_overtime: 0, break_minutes: 30, shift_start: "08:00", shift_end: "14:30" }
    ];

    for (const day of days) {
      const res = await agency.agent
        .post(`/api/timesheets/${timesheetId}/entries`)
        .set("x-csrf-token", csrf)
        .send(day);

      assert.strictEqual(res.status, 201, `Expected 201 for ${day.work_date}, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.id, "Entry must have an ID");
      assert.strictEqual(res.body.work_date, day.work_date);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 3: Read timesheet with entries
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 3: GET /api/timesheets/:id returns timesheet with entries", async () => {
    assert.ok(timesheetId, "Timesheet must exist");

    const res = await agency.agent.get(`/api/timesheets/${timesheetId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, timesheetId);
    assert.strictEqual(res.body.status, "draft");
    assert.ok(Array.isArray(res.body.entries), "Should include entries array");
    assert.strictEqual(res.body.entries.length, 3, "Should have 3 daily entries");
    // Entries should be sorted by work_date ASC
    assert.strictEqual(res.body.entries[0].work_date, "2026-04-06");
    assert.strictEqual(res.body.entries[2].work_date, "2026-04-08");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 4: Submit timesheet (draft → submitted)
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 4: submit timesheet → draft to submitted", async () => {
    assert.ok(timesheetId, "Timesheet must exist");

    const csrf = await getCsrf(agency.agent);
    const res = await agency.agent
      .post(`/api/timesheets/${timesheetId}/submit`)
      .set("x-csrf-token", csrf)
      .send();

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.status, "submitted");
    assert.ok(res.body.submitted_at, "submitted_at should be set");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 5: Company approves (submitted → approved)
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 5: company approves timesheet → submitted to approved", async () => {
    assert.ok(timesheetId, "Timesheet must exist");

    const csrf = await getCsrf(company.agent);
    const res = await company.agent
      .post(`/api/timesheets/${timesheetId}/approve`)
      .set("x-csrf-token", csrf)
      .send();

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.status, "approved");
    assert.ok(res.body.approved_at, "approved_at should be set");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 6: Invalid transition — approve already-approved → 409
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 6: re-approving already approved timesheet → 409", async () => {
    assert.ok(timesheetId, "Timesheet must exist");

    const csrf = await getCsrf(company.agent);
    const res = await company.agent
      .post(`/api/timesheets/${timesheetId}/approve`)
      .set("x-csrf-token", csrf)
      .send();

    assert.strictEqual(res.status, 409, `Expected 409 for invalid transition, got ${res.status}`);
    assert.strictEqual(res.body.error, "INVALID_TRANSITION");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 7: DB persistence verification
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 7: approved status and hours persisted in DB", async () => {
    assert.ok(timesheetId, "Timesheet must exist");

    const { rows } = await pool.query(
      "SELECT status, total_hours, overtime_hours FROM timesheets WHERE id = $1",
      [timesheetId]
    );
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].status, "approved");
    // 8+0 + 8+2 + 6+0 = 24 total, 2 overtime
    assert.strictEqual(parseFloat(rows[0].total_hours), 24);
    assert.strictEqual(parseFloat(rows[0].overtime_hours), 2);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 8: Reject → return-to-draft → re-submit → approve cycle
  // ═══════════════════════════════════════════════════════════════════════════

  let rejectedTsId;

  it("Step 8a: create and submit a second timesheet for reject cycle", async () => {
    const csrf = await getCsrf(agency.agent);

    const createRes = await agency.agent
      .post("/api/timesheets")
      .set("x-csrf-token", csrf)
      .send({
        org_id: companyOrgId,
        supplier_org_id: agencyOrgId,
        worker_name: "Erika Musterfrau",
        week_start: "2026-04-13",
        week_end: "2026-04-17"
      });
    assert.strictEqual(createRes.status, 201);
    rejectedTsId = createRes.body.id;
    createdTimesheetIds.push(rejectedTsId);

    // Add an entry so submission succeeds (requires total_hours > 0)
    await agency.agent
      .post(`/api/timesheets/${rejectedTsId}/entries`)
      .set("x-csrf-token", csrf)
      .send({ work_date: "2026-04-13", hours_regular: 8 });

    // Submit
    const submitRes = await agency.agent
      .post(`/api/timesheets/${rejectedTsId}/submit`)
      .set("x-csrf-token", csrf)
      .send();
    assert.strictEqual(submitRes.status, 200);
    assert.strictEqual(submitRes.body.status, "submitted");
  });

  it("Step 8b: company rejects the timesheet with reason", async () => {
    assert.ok(rejectedTsId, "Timesheet must exist");

    const csrf = await getCsrf(company.agent);
    const res = await company.agent
      .post(`/api/timesheets/${rejectedTsId}/reject`)
      .set("x-csrf-token", csrf)
      .send({ reason: "Stunden stimmen nicht – bitte korrigieren" });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "rejected");
  });

  it("Step 8c: agency returns rejected timesheet to draft", async () => {
    assert.ok(rejectedTsId, "Timesheet must exist");

    const csrf = await getCsrf(agency.agent);
    const res = await agency.agent
      .post(`/api/timesheets/${rejectedTsId}/return-to-draft`)
      .set("x-csrf-token", csrf)
      .send();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "draft");
  });

  it("Step 8d: re-submit and approve corrected timesheet", async () => {
    assert.ok(rejectedTsId, "Timesheet must exist");

    // Re-submit
    const csrf = await getCsrf(agency.agent);
    const submitRes = await agency.agent
      .post(`/api/timesheets/${rejectedTsId}/submit`)
      .set("x-csrf-token", csrf)
      .send();
    assert.strictEqual(submitRes.status, 200);
    assert.strictEqual(submitRes.body.status, "submitted");

    // Company approves
    const csrf2 = await getCsrf(company.agent);
    const approveRes = await company.agent
      .post(`/api/timesheets/${rejectedTsId}/approve`)
      .set("x-csrf-token", csrf2)
      .send();
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.body.status, "approved");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 9: Cancel workflow (draft → cancelled)
  // ═══════════════════════════════════════════════════════════════════════════

  it("Step 9: cancel a draft timesheet", async () => {
    const csrf = await getCsrf(agency.agent);

    const createRes = await agency.agent
      .post("/api/timesheets")
      .set("x-csrf-token", csrf)
      .send({
        org_id: companyOrgId,
        supplier_org_id: agencyOrgId,
        worker_name: "Cancelled Worker",
        week_start: "2026-04-20",
        week_end: "2026-04-24"
      });
    assert.strictEqual(createRes.status, 201);
    const cancelTsId = createRes.body.id;
    createdTimesheetIds.push(cancelTsId);

    const cancelRes = await agency.agent
      .post(`/api/timesheets/${cancelTsId}/cancel`)
      .set("x-csrf-token", csrf)
      .send();
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.body.status, "cancelled");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Feature gate: FREE user blocked
  // ═══════════════════════════════════════════════════════════════════════════

  it("FREE user is blocked from timesheets → 403 FEATURE_NOT_AVAILABLE", async () => {
    const freeUser = await registerAndLogin({ role: "company", company_name: "Free Plan Corp" });
    createdEmails.push(freeUser.email);

    const res = await freeUser.agent.get("/api/timesheets");
    assert.strictEqual(res.status, 403, `Expected 403 for FREE plan, got ${res.status}`);
    assert.strictEqual(res.body.error, "FEATURE_NOT_AVAILABLE");
    assert.strictEqual(res.body.feature, "timesheets");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Org-boundary: outsider cannot read timesheet
  // ═══════════════════════════════════════════════════════════════════════════

  it("outsider cannot read another org's timesheet → 403", async () => {
    assert.ok(timesheetId, "Timesheet must exist");

    const outsider = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "company",
      company_name: "Outsider Timesheet Corp"
    });
    createdEmails.push(outsider.email);

    const res = await outsider.agent.get(`/api/timesheets/${timesheetId}`);
    assert.strictEqual(res.status, 403, "Outsider must be blocked from reading timesheet");
    assert.strictEqual(res.body.error, "ORG_BOUNDARY_VIOLATION");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation: invalid date range
  // ═══════════════════════════════════════════════════════════════════════════

  it("rejects timesheet with week_end before week_start → 400 or error", async () => {
    const csrf = await getCsrf(agency.agent);

    const res = await agency.agent
      .post("/api/timesheets")
      .set("x-csrf-token", csrf)
      .send({
        org_id: companyOrgId,
        supplier_org_id: agencyOrgId,
        worker_name: "Bad Range Worker",
        week_start: "2026-04-17",
        week_end: "2026-04-13"  // before week_start
      });

    // Service returns INVALID_DATE_RANGE
    assert.ok([400, 422].includes(res.status), `Expected 400/422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unauthenticated access
  // ═══════════════════════════════════════════════════════════════════════════

  it("unauthenticated GET /api/timesheets → 401", async () => {
    const agent = await makeAgent();
    const res = await agent.get("/api/timesheets");
    assert.strictEqual(res.status, 401);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // List timesheets — agency sees own org's timesheets
  // ═══════════════════════════════════════════════════════════════════════════

  it("GET /api/timesheets returns agency's timesheets", async () => {
    const res = await agency.agent.get("/api/timesheets");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.items, "Should have items array");
    assert.ok(res.body.items.length > 0, "Agency should see at least one timesheet");
  });
});
