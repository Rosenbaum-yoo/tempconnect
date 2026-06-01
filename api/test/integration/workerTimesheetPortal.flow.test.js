/**
 * Worker Portal Timesheet Flow Integration Tests
 *
 * Covers (API-level, browser-free):
 *  - Worker creates a draft weekly submission via worker_assignment_link_id (EP-03)
 *  - Worker can edit the same draft multiple times (before submit locks)
 *  - Submitting an incomplete week is blocked (INCOMPLETE_WEEK + completion details)
 *  - Submitting a complete week (including explicit 0-hour days) is allowed
 *  - After submit, worker is locked from editing (SUBMISSION_NOT_EDITABLE)
 *  - Returned for correction (needs_correction) allows editing again and re-submission
 *
 * EP-03 change: org_id/supplier_org_id are no longer accepted in the POST body.
 * Tests now use worker_assignment_link_id; org context is derived server-side.
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

describe("Worker Portal Timesheet Flow", { skip: !hasDb && "No database configured" }, () => {
  let pool;

  let agency, company;
  let agencyOrgId, companyOrgId;

  let workerEmail, workerPassword;
  let workerAgent;
  let workerSubmissionId;
  let incompleteSubmissionId;
  // EP-03: set after worker creation; used in POST body instead of org_id/supplier_org_id
  let workerAssignmentLinkId;
  let testAssignmentId;

  const createdEmails = [];
  const createdSubmissionIds = [];

  const weekCompleteStart = "2026-04-06";
  const weekCompleteEnd = "2026-04-12"; // 7 calendar days

  const weekIncompleteStart = "2026-04-13";
  const weekIncompleteEnd = "2026-04-19"; // 7 calendar days

  const weekDates = (startIso) => {
    const d = new Date(startIso);
    // Always interpret as UTC date-only input
    d.setUTCHours(0, 0, 0, 0);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const dd = new Date(d);
      dd.setUTCDate(d.getUTCDate() + i);
      dates.push(dd.toISOString().slice(0, 10));
    }
    return dates;
  };

  const completeEntries = [
    { work_date: "2026-04-06", hours_regular: 8, hours_overtime: 0, break_minutes: 30 },
    { work_date: "2026-04-07", hours_regular: 0, hours_overtime: 0, break_minutes: 0 }, // explicit 0h day
    { work_date: "2026-04-08", hours_regular: 5, hours_overtime: 0, break_minutes: 30 },
    { work_date: "2026-04-09", hours_regular: 0, hours_overtime: 0, break_minutes: 0 }, // explicit 0h day
    { work_date: "2026-04-10", hours_regular: 8, hours_overtime: 0, break_minutes: 30 },
    { work_date: "2026-04-11", hours_regular: 0, hours_overtime: 0, break_minutes: 0 }, // explicit 0h day
    { work_date: "2026-04-12", hours_regular: 2, hours_overtime: 0, break_minutes: 15 }
  ];

  const incompleteEntries = [
    { work_date: "2026-04-13", hours_regular: 8, hours_overtime: 0, break_minutes: 30 },
    { work_date: "2026-04-14", hours_regular: 4, hours_overtime: 0, break_minutes: 15 }
  ];

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    agency = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "agency",
      company_name: "E2E Zeitarbeit GmbH (Worker Portal)"
    });
    createdEmails.push(agency.email);
    agencyOrgId = await getUserOrgId(pool, agency.user.id);

    company = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "company",
      company_name: "E2E Kunde AG (Worker Portal)"
    });
    createdEmails.push(company.email);
    companyOrgId = await getUserOrgId(pool, company.user.id);

    workerEmail = uniqueEmail();
    workerPassword = "WorkerPass123!";
  });

  after(async () => {
    if (!pool) return;

    // Best-effort cleanup (avoid FK conflicts on teardown)
    for (const id of createdSubmissionIds) {
      try {
        await pool.query("DELETE FROM worker_time_submission_entries WHERE submission_id = $1", [id]).catch(() => {});
        await pool.query("DELETE FROM worker_submission_events WHERE submission_id = $1", [id]).catch(() => {});
        await pool.query("DELETE FROM worker_time_submissions WHERE id = $1", [id]).catch(() => {});
      } catch {
        // Non-critical
      }
    }

    // EP-03: clean up assignment + link rows (in FK order)
    if (workerAssignmentLinkId) {
      await pool.query("DELETE FROM worker_assignment_links WHERE id = $1", [workerAssignmentLinkId]).catch(() => {});
    }
    if (testAssignmentId) {
      await pool.query("DELETE FROM assignments WHERE id = $1", [testAssignmentId]).catch(() => {});
    }

    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  it("creates a worker account via supplier API and sets up an assignment link", async () => {
    const csrf = await getCsrf(agency.agent);
    const res = await agency.agent
      .post("/api/workers")
      .set("x-csrf-token", csrf)
      .send({
        email: workerEmail,
        first_name: "Max",
        last_name: "Worker",
        password: workerPassword,
        personnel_number: "W-2026-001"
      });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body?.profile?.id || res.body?.user?.id, "Expected worker create response");
    createdEmails.push(workerEmail);

    // EP-03: Create assignment + worker_assignment_link directly via DB so that
    // the flow tests can use worker_assignment_link_id in the POST body.
    const workerRow = await pool.query("SELECT id FROM users WHERE email = $1", [workerEmail]);
    assert.strictEqual(workerRow.rows.length, 1, "Worker user not found in DB");
    const workerUserId = workerRow.rows[0].id;

    // Minimal assignment (org = company, supplier = agency)
    const asgRow = await pool.query(
      `INSERT INTO assignments
         (org_id, supplier_org_id, worker_description, worker_count,
          requested_quantity, filled_quantity, reserved_quantity, open_quantity,
          staffing_status, start_date, planned_end_date, notes, created_by, status)
       VALUES ($1, $2, $3, 1, 1, 0, 0, 1, 'open', $4, $5, $6, $7, 'planned')
       RETURNING id`,
      [companyOrgId, agencyOrgId, "Testposition EP-03", "2026-04-01", "2026-12-31",
       "Integration-Test-Einsatz", workerUserId]
    );
    testAssignmentId = asgRow.rows[0].id;

    // Assignment link: connects worker → assignment, org context
    const linkRow = await pool.query(
      `INSERT INTO worker_assignment_links
         (worker_user_id, assignment_id, org_id, supplier_org_id,
          default_hours_per_day, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, 8, $5, $6, $7)
       RETURNING id`,
      [workerUserId, testAssignmentId, companyOrgId, agencyOrgId,
       "2026-04-01", "2026-12-31", workerUserId]
    );
    workerAssignmentLinkId = linkRow.rows[0].id;

    assert.ok(workerAssignmentLinkId, "worker_assignment_link_id must be set");
  });

  it("worker logs in and creates a draft weekly submission (7 days)", async () => {
    workerAgent = await makeAgent();
    const csrf1 = await getCsrf(workerAgent);
    await workerAgent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf1)
      .send({ email: workerEmail, password: workerPassword })
      .expect(200);

    const csrf2 = await getCsrf(workerAgent);

    const res = await workerAgent
      .post("/api/worker/submissions")
      .set("x-csrf-token", csrf2)
      .send({
        worker_assignment_link_id: workerAssignmentLinkId, // EP-03: link_id replaces org_id/supplier_org_id
        week_start: weekCompleteStart,
        week_end: weekCompleteEnd
      });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.status, "draft", "New weekly submission must start as draft");
    assert.ok(res.body.id, "Expected submission id");

    workerSubmissionId = res.body.id;
    createdSubmissionIds.push(workerSubmissionId);
  });

  it("allows multiple draft edits and blocks creating a duplicate week submission", async () => {
    const csrf = await getCsrf(workerAgent);

    // Edit #1: Monday
    const day1 = completeEntries[0];
    const up1 = await workerAgent
      .put(`/api/worker/submissions/${workerSubmissionId}/entries`)
      .set("x-csrf-token", csrf)
      .send(day1);
    assert.strictEqual(up1.status, 200, `PUT day failed: ${up1.status} ${JSON.stringify(up1.body)}`);

    // Duplicate week creation attempt
    const csrfDup = await getCsrf(workerAgent);
    const dupRes = await workerAgent
      .post("/api/worker/submissions")
      .set("x-csrf-token", csrfDup)
      .send({
        worker_assignment_link_id: workerAssignmentLinkId, // EP-03
        week_start: weekCompleteStart,
        week_end: weekCompleteEnd
      });

    assert.strictEqual(dupRes.status, 409, `Expected 409 on duplicate week, got ${dupRes.status}`);
    assert.strictEqual(dupRes.body.error, "DUPLICATE_WEEK");

    // Edit #2: Wednesday
    const csrf2 = await getCsrf(workerAgent);
    const day3 = completeEntries[2];
    const up2 = await workerAgent
      .put(`/api/worker/submissions/${workerSubmissionId}/entries`)
      .set("x-csrf-token", csrf2)
      .send(day3);
    assert.strictEqual(up2.status, 200, `PUT day failed: ${up2.status} ${JSON.stringify(up2.body)}`);

    const csrfGet = await getCsrf(workerAgent);
    const readRes = await workerAgent
      .get(`/api/worker/submissions/${workerSubmissionId}`)
      .set("x-csrf-token", csrfGet);
    assert.strictEqual(readRes.status, 200);
    assert.strictEqual(readRes.body.status, "draft", "After multiple edits, submission must still be editable (draft)");
    assert.ok(readRes.body.completion, "Expected completion details");
    assert.strictEqual(readRes.body.completion.is_complete, false, "Incomplete draft must not be complete");
  });

  it("rejects submit for incomplete week and returns completion details", async () => {
    const csrfCreate = await getCsrf(workerAgent);
    const createRes = await workerAgent
      .post("/api/worker/submissions")
      .set("x-csrf-token", csrfCreate)
      .send({
        worker_assignment_link_id: workerAssignmentLinkId, // EP-03
        week_start: weekIncompleteStart,
        week_end: weekIncompleteEnd
      });

    assert.strictEqual(createRes.status, 201);
    incompleteSubmissionId = createRes.body.id;
    createdSubmissionIds.push(incompleteSubmissionId);

    // Only fill two days, leave remaining 5 days without entries
    for (const entry of incompleteEntries) {
      const csrfPut = await getCsrf(workerAgent);
      const up = await workerAgent
        .put(`/api/worker/submissions/${incompleteSubmissionId}/entries`)
        .set("x-csrf-token", csrfPut)
        .send(entry);
      assert.strictEqual(up.status, 200, `PUT failed for ${entry.work_date}`);
    }

    const csrfSubmit = await getCsrf(workerAgent);
    const submitRes = await workerAgent
      .post(`/api/worker/submissions/${incompleteSubmissionId}/submit`)
      .set("x-csrf-token", csrfSubmit)
      .send();

    assert.strictEqual(submitRes.status, 422, `Expected 422, got ${submitRes.status}: ${JSON.stringify(submitRes.body)}`);
    assert.strictEqual(submitRes.body.error, "INCOMPLETE_WEEK");
    assert.ok(submitRes.body.completion, "Expected completion details on INCOMPLETE_WEEK");
    assert.strictEqual(submitRes.body.completion.is_complete, false);
    assert.strictEqual(submitRes.body.completion.missing_dates.length, 5, "Exactly 5 days must be missing");
  });

  it("submits a complete week (incl. explicit 0-hour days) and locks editing after submit", async () => {
    // Fill remaining days explicitly (including 0-hour days)
    for (const entry of completeEntries) {
      const csrfPut = await getCsrf(workerAgent);
      const up = await workerAgent
        .put(`/api/worker/submissions/${workerSubmissionId}/entries`)
        .set("x-csrf-token", csrfPut)
        .send(entry);
      assert.strictEqual(up.status, 200, `PUT failed for ${entry.work_date}`);
    }

    const csrfSubmit = await getCsrf(workerAgent);
    const submitRes = await workerAgent
      .post(`/api/worker/submissions/${workerSubmissionId}/submit`)
      .set("x-csrf-token", csrfSubmit)
      .send();

    assert.strictEqual(submitRes.status, 200, `Expected 200, got ${submitRes.status}: ${JSON.stringify(submitRes.body)}`);

    const csrfRead = await getCsrf(workerAgent);
    const readRes = await workerAgent
      .get(`/api/worker/submissions/${workerSubmissionId}`)
      .set("x-csrf-token", csrfRead);
    assert.strictEqual(readRes.status, 200);
    assert.strictEqual(readRes.body.status, "submitted", "After successful submit, status must become submitted");

    // Editing after submit must be blocked
    const csrfEdit = await getCsrf(workerAgent);
    const editRes = await workerAgent
      .put(`/api/worker/submissions/${workerSubmissionId}/entries`)
      .set("x-csrf-token", csrfEdit)
      .send({ work_date: "2026-04-06", hours_regular: 7, hours_overtime: 0, break_minutes: 30 });

    assert.strictEqual(editRes.status, 409, `Expected 409 after submit lock, got ${editRes.status}: ${JSON.stringify(editRes.body)}`);
    assert.strictEqual(editRes.body.error, "SUBMISSION_NOT_EDITABLE");
  });

  it("returned for correction (needs_correction) allows editing again and re-submitting", async () => {
    // Request correction from supplier side
    const agencyCsrf = await getCsrf(agency.agent);
    const corrRes = await agency.agent
      .post(`/api/worker-submissions/${workerSubmissionId}/request-correction`)
      .set("x-csrf-token", agencyCsrf)
      .send({ note: "Stunden bitte prüfen und korrigieren" });

    assert.strictEqual(corrRes.status, 200, `Expected 200 correction request, got ${corrRes.status}: ${JSON.stringify(corrRes.body)}`);

    const csrfRead1 = await getCsrf(workerAgent);
    const read1 = await workerAgent
      .get(`/api/worker/submissions/${workerSubmissionId}`)
      .set("x-csrf-token", csrfRead1);
    assert.strictEqual(read1.status, 200);
    assert.strictEqual(read1.body.status, "needs_correction");

    // Worker edits again
    const csrfEdit = await getCsrf(workerAgent);
    const editRes = await workerAgent
      .put(`/api/worker/submissions/${workerSubmissionId}/entries`)
      .set("x-csrf-token", csrfEdit)
      .send({ work_date: "2026-04-06", hours_regular: 6, hours_overtime: 0, break_minutes: 30 });
    assert.strictEqual(editRes.status, 200, `Edit in needs_correction must be allowed: ${editRes.status}`);

    // Re-submit correction
    const csrfCorrect = await getCsrf(workerAgent);
    const correctRes = await workerAgent
      .post(`/api/worker/submissions/${workerSubmissionId}/correct`)
      .set("x-csrf-token", csrfCorrect)
      .send();
    assert.strictEqual(correctRes.status, 200, `Expected 200 on /correct, got ${correctRes.status}: ${JSON.stringify(correctRes.body)}`);

    const csrfRead2 = await getCsrf(workerAgent);
    const read2 = await workerAgent
      .get(`/api/worker/submissions/${workerSubmissionId}`)
      .set("x-csrf-token", csrfRead2);
    assert.strictEqual(read2.status, 200);
    assert.strictEqual(read2.body.status, "submitted");
  });
});

