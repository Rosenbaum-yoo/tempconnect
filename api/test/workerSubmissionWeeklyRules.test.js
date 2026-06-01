import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/workerSubmissionService.js";

function buildSubmitPool({ entries }) {
  const submissionRow = {
    id: "sub-1",
    worker_user_id: "worker-1",
    week_start: "2026-04-06",
    week_end: "2026-04-12",
    status: "draft",
    total_hours: "0"
  };

  const query = async (sql) => {
    const s = String(sql);
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(s.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    if (s.includes("FROM worker_time_submissions wts")) return { rows: [submissionRow], rowCount: 1 };
    if (s.includes("FROM worker_time_submission_entries")) return { rows: entries, rowCount: entries.length };
    if (s.includes("FROM worker_submission_events")) return { rows: [], rowCount: 0 };
    if (s.includes("UPDATE worker_time_submissions SET")) return { rows: [], rowCount: 1 };
    if (s.includes("INSERT INTO worker_submission_events")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };

  return {
    query,
    connect: async () => ({ query, release: () => {} })
  };
}

describe("worker submission weekly rules", () => {
  it("blocks submit when week is not fully captured", async () => {
    const pool = buildSubmitPool({
      entries: [
        { work_date: "2026-04-06", hours_regular: 8, hours_overtime: 0 },
        { work_date: "2026-04-07", hours_regular: 8, hours_overtime: 0 },
        { work_date: "2026-04-08", hours_regular: 8, hours_overtime: 0 }
      ]
    });

    const result = await svc.submitSubmission(pool, "sub-1", "worker-1");
    assert.equal(result.error, "INCOMPLETE_WEEK");
    assert.equal(result.completion.is_complete, false);
    assert.equal(result.completion.expected_days, 7);
    assert.equal(result.completion.filled_days, 3);
  });

  it("handles DATE objects for work_date (pg DATE parsing)", async () => {
    const pool = buildSubmitPool({
      entries: [
        { work_date: new Date("2026-04-06"), hours_regular: 8, hours_overtime: 0 },
        { work_date: new Date("2026-04-07"), hours_regular: 8, hours_overtime: 0 },
        { work_date: new Date("2026-04-08"), hours_regular: 8, hours_overtime: 0 }
      ]
    });

    const result = await svc.submitSubmission(pool, "sub-1", "worker-1");
    assert.equal(result.error, "INCOMPLETE_WEEK");
    assert.equal(result.completion.is_complete, false);
    assert.equal(result.completion.expected_days, 7);
    assert.equal(result.completion.filled_days, 3);
  });

  it("allows submit when all 7 days are present (including 0h days)", async () => {
    const entries = [
      { work_date: "2026-04-06", hours_regular: 8, hours_overtime: 0 },
      { work_date: "2026-04-07", hours_regular: 8, hours_overtime: 0 },
      { work_date: "2026-04-08", hours_regular: 8, hours_overtime: 0 },
      { work_date: "2026-04-09", hours_regular: 8, hours_overtime: 0 },
      { work_date: "2026-04-10", hours_regular: 8, hours_overtime: 0 },
      { work_date: "2026-04-11", hours_regular: 0, hours_overtime: 0 },
      { work_date: "2026-04-12", hours_regular: 0, hours_overtime: 0 }
    ];
    const pool = buildSubmitPool({ entries });
    const result = await svc.submitSubmission(pool, "sub-1", "worker-1");
    assert.equal(result.ok, true);
    assert.equal(result.to, "submitted");
  });

  it("rejects submission creation when range is not exactly 7 days", async () => {
    const pool = {
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
      query: async () => ({ rows: [] })
    };
    const result = await svc.createSubmission(pool, {
      workerUserId: "worker-1",
      workerAssignmentLinkId: "link-1",
      orgId: "org-1",
      supplierOrgId: "sup-1",
      assignmentId: "asg-1",
      weekStart: "2026-04-06",
      weekEnd: "2026-04-10"
    });
    assert.equal(result.error, "INVALID_WEEK_RANGE");
  });
});
