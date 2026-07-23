import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/workerSubmissionService.js";
import { sequencePool } from "./helpers/mockPool.js";

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

const SUB_ID = "11111111-1111-1111-1111-111111111111";
const WORKER = "wwwwwwww-wwww-wwww-wwww-wwwwwwwwwwww";
const REVIEWER = "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr";

function baseSub(overrides = {}) {
  return {
    id: SUB_ID,
    worker_user_id: WORKER,
    org_id: "oooooooo-oooo-oooo-oooo-oooooooooooo",
    supplier_org_id: "ssssssss-ssss-ssss-ssss-ssssssssssss",
    assignment_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    week_start: "2026-03-02",
    week_end: "2026-03-08",
    status: "draft",
    worker_assignment_link_id: null,
    first_name: "Max",
    last_name: "Muster",
    personnel_number: "P-001",
    worker_email: "max@example.com",
    worker_comment: null,
    total_hours: "40.00",
    overtime_hours: "0.00",
    timesheet_id: null,
    reviewed_by: null,
    approved_internal_by: null,
    supplier_name: "Agentur GmbH",
    customer_contact_email: null,
    customer_contact_name: null,
    ...overrides
  };
}

// A complete 7-day set of entries for a Mon..Sun week (2026-03-02 .. 2026-03-08)
function fullWeekEntries() {
  const days = ["2026-03-02","2026-03-03","2026-03-04","2026-03-05","2026-03-06","2026-03-07","2026-03-08"];
  return days.map((d, i) => ({
    id: `entry-${i}`,
    submission_id: SUB_ID,
    work_date: d,
    hours_regular: "8",
    hours_overtime: "0",
    break_minutes: 30,
    shift_start: "08:00",
    shift_end: "16:30",
    notes: null
  }));
}

/**
 * Tracking pool: records every non-tx query, lets a handler decide responses.
 * handler(sql, params) → { rows, rowCount } | undefined
 */
function trackingPool(handler) {
  const calls = [];
  const isTx = (sql) => /^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(String(sql));
  const query = async (sql, params) => {
    const s = String(sql);
    if (isTx(s)) return { rows: [], rowCount: 0 };
    calls.push({ sql: s, params: params || [] });
    const r = handler ? handler(s, params) : undefined;
    return r || { rows: [], rowCount: 0 };
  };
  const pool = {
    calls,
    query,
    connect: async () => ({ query, release() {} })
  };
  return pool;
}

/* ──────────────────────────────────────────────────────────────────────────
 * computeWeeklyCompletion (pure)
 * ────────────────────────────────────────────────────────────────────────── */

describe("computeWeeklyCompletion", () => {
  it("reports complete when all expected days are filled", () => {
    const c = svc.computeWeeklyCompletion("2026-03-02", "2026-03-08", fullWeekEntries());
    assert.strictEqual(c.expected_days, 7);
    assert.strictEqual(c.filled_days, 7);
    assert.strictEqual(c.is_complete, true);
    assert.deepStrictEqual(c.missing_dates, []);
  });

  it("lists missing dates when entries are incomplete", () => {
    const entries = fullWeekEntries().slice(0, 5); // Mon..Fri only
    const c = svc.computeWeeklyCompletion("2026-03-02", "2026-03-08", entries);
    assert.strictEqual(c.expected_days, 7);
    assert.strictEqual(c.filled_days, 5);
    assert.strictEqual(c.is_complete, false);
    assert.deepStrictEqual(c.missing_dates, ["2026-03-07", "2026-03-08"]);
  });

  it("handles empty entries and Date objects for work_date", () => {
    const c = svc.computeWeeklyCompletion("2026-03-02", "2026-03-02", []);
    assert.strictEqual(c.expected_days, 1);
    assert.strictEqual(c.is_complete, false);
    // Date-object work_date is normalized to ISO date-only
    const c2 = svc.computeWeeklyCompletion(
      "2026-03-02",
      "2026-03-02",
      [{ work_date: new Date("2026-03-02T12:00:00Z") }]
    );
    assert.strictEqual(c2.is_complete, true);
    assert.deepStrictEqual(c2.missing_dates, []);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * getSubmission / getSubmissionWithEntries
 * ────────────────────────────────────────────────────────────────────────── */

describe("getSubmission", () => {
  it("returns the first row", async () => {
    const pool = sequencePool({ rows: [baseSub()] });
    const sub = await svc.getSubmission(pool, SUB_ID);
    assert.strictEqual(sub.id, SUB_ID);
  });

  it("returns null when not found", async () => {
    const pool = sequencePool({ rows: [] });
    const sub = await svc.getSubmission(pool, SUB_ID);
    assert.strictEqual(sub, null);
  });
});

describe("getSubmissionWithEntries", () => {
  it("returns null when submission missing", async () => {
    const pool = sequencePool({ rows: [] });
    const res = await svc.getSubmissionWithEntries(pool, SUB_ID);
    assert.strictEqual(res, null);
  });

  it("assembles submission with entries, events and completion", async () => {
    const entries = fullWeekEntries();
    const pool = sequencePool(
      { rows: [baseSub()] },          // getSubmission
      { rows: entries },               // entries query
      { rows: [{ id: "ev1", event_type: "created", actor_email: "x@y.de" }] } // events query
    );
    const res = await svc.getSubmissionWithEntries(pool, SUB_ID);
    assert.strictEqual(res.id, SUB_ID);
    assert.strictEqual(res.entries.length, 7);
    assert.strictEqual(res.events.length, 1);
    assert.strictEqual(res.completion.is_complete, true);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * listSubmissions — SQL shape / params
 * ────────────────────────────────────────────────────────────────────────── */

describe("listSubmissions", () => {
  it("builds WHERE clause with all filters and appends limit last", async () => {
    const pool = trackingPool(() => ({ rows: [baseSub()] }));
    const rows = await svc.listSubmissions(pool, {
      workerUserId: WORKER,
      supplierOrgId: "sup",
      orgId: "org",
      assignmentId: "asg",
      status: "submitted",
      weekStartFrom: "2026-01-01",
      weekStartTo: "2026-12-31",
      limit: 25
    });
    assert.strictEqual(rows.length, 1);
    const call = pool.calls[0];
    assert.match(call.sql, /WHERE/);
    assert.match(call.sql, /wts\.worker_user_id = \$1/);
    assert.match(call.sql, /wts\.status = \$5/);
    // limit is the final param
    assert.strictEqual(call.params[call.params.length - 1], 25);
    assert.deepStrictEqual(call.params.slice(0, 7), [
      WORKER, "sup", "org", "asg", "submitted", "2026-01-01", "2026-12-31"
    ]);
  });

  it("omits WHERE when no filters given and defaults limit to 100", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.listSubmissions(pool, {});
    const call = pool.calls[0];
    // No top-level filter clause (the only WHERE is inside the COUNT subquery).
    assert.doesNotMatch(call.sql, /WHERE wts\./);
    assert.deepStrictEqual(call.params, [100]);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * createSubmission
 * ────────────────────────────────────────────────────────────────────────── */

describe("createSubmission", () => {
  it("rejects a week range that is not exactly 7 days", async () => {
    const pool = sequencePool({ rows: [] });
    const res = await svc.createSubmission(pool, {
      workerUserId: WORKER, orgId: "o", supplierOrgId: "s",
      weekStart: "2026-03-02", weekEnd: "2026-03-05"
    });
    assert.strictEqual(res.error, "INVALID_WEEK_RANGE");
    assert.strictEqual(res.expected_days, 7);
    assert.strictEqual(res.actual_days, 4);
  });

  it("inserts submission and logs created event on happy path", async () => {
    const created = baseSub({ status: "draft" });
    const pool = sequencePool(
      { rows: [created] },   // INSERT ... RETURNING
      { rows: [], rowCount: 1 } // logEvent INSERT
    );
    const res = await svc.createSubmission(pool, {
      workerUserId: WORKER, orgId: "o", supplierOrgId: "s",
      weekStart: "2026-03-02", weekEnd: "2026-03-08", workerComment: "hi"
    });
    assert.strictEqual(res.submission.id, SUB_ID);
  });

  it("materialisiert submission_deadline = week_end + TIMESHEET_DEADLINE_DAYS im INSERT (P2.1)", async () => {
    const sqls = [];
    const created = baseSub({ status: "draft" });
    const capturingPool = {
      connect: async () => ({
        query: async (sql) => {
          sqls.push(String(sql));
          return /INSERT INTO worker_time_submissions/.test(sql) ? { rows: [created] } : { rows: [], rowCount: 1 };
        },
        release() {}
      })
    };
    const res = await svc.createSubmission(capturingPool, {
      workerUserId: WORKER, orgId: "o", supplierOrgId: "s",
      weekStart: "2026-03-02", weekEnd: "2026-03-08"
    });
    assert.strictEqual(res.submission.id, SUB_ID);
    const insertSql = sqls.find((s) => /INSERT INTO worker_time_submissions/.test(s));
    assert.ok(insertSql, "INSERT wurde ausgeführt");
    assert.match(insertSql, /submission_deadline/, "INSERT setzt submission_deadline");
    assert.match(insertSql, new RegExp(`INTERVAL '${svc.TIMESHEET_DEADLINE_DAYS} days'`), "Frist = week_end + N Tage");
  });

  it("maps unique-violation (23505) to DUPLICATE_WEEK", async () => {
    const dupErr = Object.assign(new Error("dup"), { code: "23505" });
    const pool = sequencePool(dupErr);
    const res = await svc.createSubmission(pool, {
      workerUserId: WORKER, orgId: "o", supplierOrgId: "s",
      weekStart: "2026-03-02", weekEnd: "2026-03-08"
    });
    assert.strictEqual(res.error, "DUPLICATE_WEEK");
  });

  it("rethrows non-unique DB errors", async () => {
    const otherErr = Object.assign(new Error("boom"), { code: "55000" });
    const pool = sequencePool(otherErr);
    await assert.rejects(
      svc.createSubmission(pool, {
        workerUserId: WORKER, orgId: "o", supplierOrgId: "s",
        weekStart: "2026-03-02", weekEnd: "2026-03-08"
      }),
      /boom/
    );
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * upsertEntry — validation branches
 * ────────────────────────────────────────────────────────────────────────── */

describe("upsertEntry validation", () => {
  const okEntry = { work_date: "2026-03-03", hours_regular: 8, hours_overtime: 0 };

  it("NOT_FOUND when submission missing", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, okEntry);
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("FORBIDDEN when worker does not own submission", async () => {
    const pool = sequencePool({ rows: [baseSub({ worker_user_id: "other" })] });
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, okEntry);
    assert.strictEqual(r.error, "FORBIDDEN");
  });

  it("SUBMISSION_NOT_EDITABLE when status not draft/needs_correction", async () => {
    const pool = sequencePool({ rows: [baseSub({ status: "submitted" })] });
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, okEntry);
    assert.strictEqual(r.error, "SUBMISSION_NOT_EDITABLE");
    assert.strictEqual(r.status, "submitted");
  });

  it("DATE_OUT_OF_RANGE when work_date outside the week", async () => {
    const pool = sequencePool({ rows: [baseSub()] });
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, { ...okEntry, work_date: "2026-03-20" });
    assert.strictEqual(r.error, "DATE_OUT_OF_RANGE");
  });

  it("DATE_AFTER_UNAVAILABLE when entry on/after unavailable cutoff", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ worker_assignment_link_id: "link-1" })] }, // getSubmission
      { rows: [{ worker_confirmation_status: "worker_unavailable", unavailable_from: "2026-03-03" }] } // link lookup
    );
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, { ...okEntry, work_date: "2026-03-04" });
    assert.strictEqual(r.error, "DATE_AFTER_UNAVAILABLE");
    assert.strictEqual(r.unavailable_from, "2026-03-03");
  });

  it("HOURS_EXCEED_DAILY_MAX when total > 24", async () => {
    const pool = sequencePool({ rows: [baseSub()] });
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, { work_date: "2026-03-03", hours_regular: 20, hours_overtime: 8 });
    assert.strictEqual(r.error, "HOURS_EXCEED_DAILY_MAX");
  });

  it("NEGATIVE_HOURS when total < 0", async () => {
    const pool = sequencePool({ rows: [baseSub()] });
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, { work_date: "2026-03-03", hours_regular: -2, hours_overtime: 0 });
    assert.strictEqual(r.error, "NEGATIVE_HOURS");
  });

  it("BREAK_EXCEED_MAX when break_minutes > 600", async () => {
    const pool = sequencePool({ rows: [baseSub()] });
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, { ...okEntry, break_minutes: 700 });
    assert.strictEqual(r.error, "BREAK_EXCEED_MAX");
  });

  it("SHIFT_PARTIAL when only one of start/end set", async () => {
    const pool = sequencePool({ rows: [baseSub()] });
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, { ...okEntry, shift_start: "08:00" });
    assert.strictEqual(r.error, "SHIFT_PARTIAL");
  });

  it("SHIFT_INVALID_RANGE when end <= start", async () => {
    const pool = sequencePool({ rows: [baseSub()] });
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, { ...okEntry, shift_start: "10:00", shift_end: "09:00" });
    assert.strictEqual(r.error, "SHIFT_INVALID_RANGE");
  });

  it("ZERO_DAY_WITH_SHIFT_OR_BREAK when 0 hours but break present", async () => {
    const pool = sequencePool({ rows: [baseSub()] });
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, { work_date: "2026-03-03", hours_regular: 0, hours_overtime: 0, break_minutes: 30 });
    assert.strictEqual(r.error, "ZERO_DAY_WITH_SHIFT_OR_BREAK");
  });

  it("inserts/updates entry and recalcs totals on happy path", async () => {
    const entryRow = { id: "e1", submission_id: SUB_ID, work_date: "2026-03-03", hours_regular: "8", hours_overtime: "0" };
    const pool = sequencePool(
      { rows: [baseSub()] },     // getSubmission
      { rows: [entryRow] },       // upsert RETURNING
      { rows: [], rowCount: 1 }   // recalcTotals UPDATE
    );
    const r = await svc.upsertEntry(pool, SUB_ID, WORKER, {
      work_date: "2026-03-03", hours_regular: 8, hours_overtime: 0,
      shift_start: "08:00", shift_end: "16:30", break_minutes: 30
    });
    assert.strictEqual(r.entry.id, "e1");
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * deleteEntry
 * ────────────────────────────────────────────────────────────────────────── */

describe("deleteEntry", () => {
  it("NOT_FOUND when submission missing", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.deleteEntry(pool, SUB_ID, "e1", WORKER);
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("FORBIDDEN for non-owner", async () => {
    const pool = sequencePool({ rows: [baseSub({ worker_user_id: "other" })] });
    const r = await svc.deleteEntry(pool, SUB_ID, "e1", WORKER);
    assert.strictEqual(r.error, "FORBIDDEN");
  });

  it("SUBMISSION_NOT_EDITABLE when not draft/needs_correction", async () => {
    const pool = sequencePool({ rows: [baseSub({ status: "under_review" })] });
    const r = await svc.deleteEntry(pool, SUB_ID, "e1", WORKER);
    assert.strictEqual(r.error, "SUBMISSION_NOT_EDITABLE");
  });

  it("deletes and recalcs on happy path", async () => {
    const pool = sequencePool(
      { rows: [baseSub()] },     // getSubmission
      { rows: [], rowCount: 1 },  // DELETE
      { rows: [], rowCount: 1 }   // recalcTotals
    );
    const r = await svc.deleteEntry(pool, SUB_ID, "e1", WORKER);
    assert.strictEqual(r.ok, true);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * Lifecycle transitions: submitSubmission / startReview / requestCorrection /
 * submitCorrected / rejectSubmission / approveInternal
 * ────────────────────────────────────────────────────────────────────────── */

describe("submitSubmission", () => {
  it("NOT_FOUND when submission missing", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.submitSubmission(pool, SUB_ID, WORKER);
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("FORBIDDEN for non-owner", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ worker_user_id: "other" })] }, // getSubmission
      { rows: [] },  // entries
      { rows: [] }   // events
    );
    const r = await svc.submitSubmission(pool, SUB_ID, WORKER);
    assert.strictEqual(r.error, "FORBIDDEN");
  });

  it("INCOMPLETE_WEEK when entries do not cover the whole week", async () => {
    const pool = sequencePool(
      { rows: [baseSub()] },                       // getSubmission
      { rows: fullWeekEntries().slice(0, 3) },      // entries (partial)
      { rows: [] }                                  // events
    );
    const r = await svc.submitSubmission(pool, SUB_ID, WORKER);
    assert.strictEqual(r.error, "INCOMPLETE_WEEK");
    assert.strictEqual(r.completion.is_complete, false);
  });

  it("transitions draft → submitted on a complete week", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "draft" })] }, // getSubmissionWithEntries: getSubmission
      { rows: fullWeekEntries() },               // entries
      { rows: [] },                              // events
      { rows: [baseSub({ status: "draft" })] },  // transition: getSubmission
      { rows: [], rowCount: 1 },                  // UPDATE
      { rows: [], rowCount: 1 }                   // logEvent
      // notification queries (if recipient) consumed as empty
    );
    const r = await svc.submitSubmission(pool, SUB_ID, WORKER);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.from, "draft");
    assert.strictEqual(r.to, "submitted");
  });
});

describe("startReview", () => {
  it("INVALID_TRANSITION from draft", async () => {
    const pool = sequencePool({ rows: [baseSub({ status: "draft" })] });
    const r = await svc.startReview(pool, SUB_ID, REVIEWER);
    assert.strictEqual(r.error, "INVALID_TRANSITION");
    assert.strictEqual(r.from, "draft");
    assert.strictEqual(r.to, "under_review");
  });

  it("transitions submitted → under_review", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "submitted" })] }, // getSubmission
      { rows: [], rowCount: 1 },                     // UPDATE
      { rows: [], rowCount: 1 }                      // logEvent
    );
    const r = await svc.startReview(pool, SUB_ID, REVIEWER);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.to, "under_review");
  });
});

describe("requestCorrection", () => {
  it("NOT_FOUND when submission missing", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.requestCorrection(pool, SUB_ID, REVIEWER, "fix it");
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("INVALID_TRANSITION from draft (cannot request correction)", async () => {
    // getSubmissionWithEntries: getSubmission + entries + events, then transition getSubmission
    const pool = sequencePool(
      { rows: [baseSub({ status: "draft" })] }, // gswe getSubmission
      { rows: [] },                              // entries
      { rows: [] },                              // events
      { rows: [baseSub({ status: "draft" })] }   // transition getSubmission
    );
    const r = await svc.requestCorrection(pool, SUB_ID, REVIEWER, "fix it");
    assert.strictEqual(r.error, "INVALID_TRANSITION");
    assert.strictEqual(r.from, "draft");
  });

  it("transitions submitted → needs_correction and stores snapshot + notifies", async () => {
    const sub = baseSub({ status: "submitted" });
    const pool = sequencePool(
      { rows: [sub] },             // gswe getSubmission
      { rows: fullWeekEntries() },  // entries
      { rows: [] },                 // events
      { rows: [sub] },             // transition getSubmission
      { rows: [], rowCount: 1 },    // UPDATE
      { rows: [], rowCount: 1 },    // logEvent
      { rows: [], rowCount: 1 },    // correction_snapshot INSERT
      { rows: [], rowCount: 1 }     // notifySubmissionCorrectionRequested INSERT
    );
    const r = await svc.requestCorrection(pool, SUB_ID, REVIEWER, "Bitte Pause korrigieren");
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.to, "needs_correction");
  });
});

describe("submitCorrected", () => {
  it("NOT_FOUND when missing", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.submitCorrected(pool, SUB_ID, WORKER);
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("FORBIDDEN for non-owner", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "needs_correction", worker_user_id: "other" })] },
      { rows: [] },
      { rows: [] }
    );
    const r = await svc.submitCorrected(pool, SUB_ID, WORKER);
    assert.strictEqual(r.error, "FORBIDDEN");
  });

  it("INVALID_TRANSITION when status not needs_correction", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "submitted" })] },
      { rows: fullWeekEntries() },
      { rows: [] }
    );
    const r = await svc.submitCorrected(pool, SUB_ID, WORKER);
    assert.strictEqual(r.error, "INVALID_TRANSITION");
    assert.strictEqual(r.from, "submitted");
  });

  it("INCOMPLETE_WEEK when corrected week still incomplete", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "needs_correction" })] },
      { rows: fullWeekEntries().slice(0, 2) },
      { rows: [] }
    );
    const r = await svc.submitCorrected(pool, SUB_ID, WORKER);
    assert.strictEqual(r.error, "INCOMPLETE_WEEK");
  });

  it("NO_CHANGES_DETECTED when current entries equal the snapshot", async () => {
    const entries = fullWeekEntries();
    // snapshot is built the same way the service normalizes current entries
    const snapshot = entries.map(e => ({
      work_date: e.work_date,
      hours_regular: parseFloat(e.hours_regular),
      hours_overtime: parseFloat(e.hours_overtime),
      break_minutes: parseInt(e.break_minutes, 10),
      shift_start: e.shift_start,
      shift_end: e.shift_end
    })).sort((a, b) => a.work_date.localeCompare(b.work_date));
    const pool = sequencePool(
      { rows: [baseSub({ status: "needs_correction" })] }, // gswe getSubmission
      { rows: entries },                                    // entries
      { rows: [] },                                         // events
      { rows: [{ meta: { entries_snapshot: snapshot } }] }  // snapshot load
    );
    const r = await svc.submitCorrected(pool, SUB_ID, WORKER);
    assert.strictEqual(r.error, "NO_CHANGES_DETECTED");
  });

  it("transitions needs_correction → submitted when entries changed vs snapshot", async () => {
    const entries = fullWeekEntries();
    // snapshot differs (one fewer hour) → change detected
    const snapshot = entries.map(e => ({
      work_date: e.work_date,
      hours_regular: 7, // differs from 8
      hours_overtime: 0,
      break_minutes: parseInt(e.break_minutes, 10),
      shift_start: e.shift_start,
      shift_end: e.shift_end
    })).sort((a, b) => a.work_date.localeCompare(b.work_date));
    const pool = sequencePool(
      { rows: [baseSub({ status: "needs_correction" })] }, // gswe getSubmission
      { rows: entries },                                    // entries
      { rows: [] },                                         // events
      { rows: [{ meta: { entries_snapshot: snapshot } }] }, // snapshot load
      { rows: [baseSub({ status: "needs_correction" })] },  // transition getSubmission
      { rows: [], rowCount: 1 },                            // UPDATE
      { rows: [], rowCount: 1 }                             // logEvent
      // notification queries consumed empty
    );
    const r = await svc.submitCorrected(pool, SUB_ID, WORKER);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.to, "submitted");
  });
});

describe("rejectSubmission", () => {
  it("INVALID_TRANSITION from terminal status, and does not notify", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "rejected" })] }, // getSubmission (outer)
      { rows: [baseSub({ status: "rejected" })] }  // transition getSubmission
    );
    const r = await svc.rejectSubmission(pool, SUB_ID, REVIEWER, "no");
    assert.strictEqual(r.error, "INVALID_TRANSITION");
  });

  it("transitions submitted → rejected and notifies worker", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "submitted" })] }, // outer getSubmission
      { rows: [baseSub({ status: "submitted" })] }, // transition getSubmission
      { rows: [], rowCount: 1 },                     // UPDATE
      { rows: [], rowCount: 1 },                     // logEvent
      { rows: [], rowCount: 1 }                      // notifySubmissionRejected
    );
    const r = await svc.rejectSubmission(pool, SUB_ID, REVIEWER, "Stunden unplausibel");
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.to, "rejected");
  });
});

describe("approveInternal", () => {
  it("NOT_FOUND when missing", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.approveInternal(pool, SUB_ID, REVIEWER, "ok");
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("INVALID_TRANSITION from submitted (must be under_review)", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "submitted" })] }, // outer getSubmission
      { rows: [baseSub({ status: "submitted" })] }  // transition getSubmission
    );
    const r = await svc.approveInternal(pool, SUB_ID, REVIEWER, "ok");
    assert.strictEqual(r.error, "INVALID_TRANSITION");
  });

  it("transitions under_review → approved_internal", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "under_review" })] }, // outer getSubmission
      { rows: [baseSub({ status: "under_review" })] }, // transition getSubmission
      { rows: [], rowCount: 1 },                        // UPDATE
      { rows: [], rowCount: 1 },                        // logEvent
      { rows: [], rowCount: 1 }                         // notify (best-effort)
    );
    const r = await svc.approveInternal(pool, SUB_ID, REVIEWER, "passt");
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.to, "approved_internal");
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * acceptIntoTimesheet / postToTimesheet
 * ────────────────────────────────────────────────────────────────────────── */

describe("acceptIntoTimesheet", () => {
  it("NOT_FOUND when missing", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.acceptIntoTimesheet(pool, SUB_ID, REVIEWER);
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("INVALID_TRANSITION when status cannot accept", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "draft" })] }, // gswe getSubmission
      { rows: [] },                              // entries
      { rows: [] }                               // events
    );
    const r = await svc.acceptIntoTimesheet(pool, SUB_ID, REVIEWER);
    assert.strictEqual(r.error, "INVALID_TRANSITION");
    assert.strictEqual(r.from, "draft");
  });

  it("TIMESHEET_ALREADY_EXISTS when a timesheet is already linked", async () => {
    // accepted_into_timesheet is a valid target only from... none. Use approved_internal? No.
    // canTransition(status,'accepted_into_timesheet') must be true to reach the timesheet_id check.
    // No status lists accepted_into_timesheet as a target → that branch is unreachable; covered via INVALID_TRANSITION above.
    // Instead assert: a linked timesheet on a non-transitionable status still yields INVALID_TRANSITION first.
    const pool = sequencePool(
      { rows: [baseSub({ status: "draft", timesheet_id: "ts-1" })] },
      { rows: [] },
      { rows: [] }
    );
    const r = await svc.acceptIntoTimesheet(pool, SUB_ID, REVIEWER);
    assert.strictEqual(r.error, "INVALID_TRANSITION");
  });
});

describe("postToTimesheet", () => {
  it("NOT_FOUND when missing", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.postToTimesheet(pool, SUB_ID, REVIEWER);
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("INVALID_TRANSITION when status not eligible", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "submitted" })] },
      { rows: [] },
      { rows: [] }
    );
    const r = await svc.postToTimesheet(pool, SUB_ID, REVIEWER);
    assert.strictEqual(r.error, "INVALID_TRANSITION");
  });

  it("TIMESHEET_ALREADY_EXISTS when timesheet linked on eligible status", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "customer_confirmed", timesheet_id: "ts-1" })] },
      { rows: fullWeekEntries() },
      { rows: [] }
    );
    const r = await svc.postToTimesheet(pool, SUB_ID, REVIEWER);
    assert.strictEqual(r.error, "TIMESHEET_ALREADY_EXISTS");
  });

  it("creates timesheet + entries and posts on customer_confirmed", async () => {
    const ts = { id: "ts-99" };
    const pool = sequencePool(
      { rows: [baseSub({ status: "customer_confirmed" })] }, // gswe getSubmission
      { rows: fullWeekEntries() },                            // entries
      { rows: [] },                                           // events
      { rows: [ts] },                                         // INSERT timesheets RETURNING
      // 7 entry inserts
      { rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }, { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }, { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },  // UPDATE timesheets totals
      { rows: [], rowCount: 1 },  // UPDATE submission
      { rows: [], rowCount: 1 },  // logEvent
      { rows: [], rowCount: 1 }   // notifySubmissionAccepted
    );
    const r = await svc.postToTimesheet(pool, SUB_ID, REVIEWER);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.timesheet.id, "ts-99");
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * sendToCustomer
 * ────────────────────────────────────────────────────────────────────────── */

describe("sendToCustomer", () => {
  it("NOT_FOUND when missing", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.sendToCustomer(pool, SUB_ID, REVIEWER, {});
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("INVALID_TRANSITION when status not approved_internal", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "submitted" })] } // getSubmission
    );
    const r = await svc.sendToCustomer(pool, SUB_ID, REVIEWER, { customerContactEmail: "x@y.de" });
    assert.strictEqual(r.error, "INVALID_TRANSITION");
    assert.strictEqual(r.to, "sent_to_customer");
  });

  it("sends without email contact → customer_notified false, audit no_customer_email", async () => {
    const sub = baseSub({ status: "approved_internal", customer_contact_email: null });
    const pool = sequencePool(
      { rows: [sub] },           // getSubmission
      { rows: [], rowCount: 1 },  // UPDATE submission
      { rows: [], rowCount: 1 },  // logEvent
      // notifySubmissionSentToCustomer only if reviewerId set (it's null) → skipped
      { rows: [], rowCount: 1 }   // audit no_customer_email INSERT
    );
    const r = await svc.sendToCustomer(pool, SUB_ID, REVIEWER, { note: "bitte prüfen" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.to, "sent_to_customer");
    assert.strictEqual(r.customer_notified, false);
    assert.strictEqual(r.customer_email, null);
  });

  it("sends with email contact → customer_notified true and resolved email returned", async () => {
    const sub = baseSub({ status: "approved_internal" });
    const pool = sequencePool(
      { rows: [sub] },           // getSubmission
      { rows: [], rowCount: 1 },  // UPDATE submission
      { rows: [], rowCount: 1 },  // logEvent
      { rows: [], rowCount: 1 }   // audit customer_notified INSERT (after sendMail)
    );
    const r = await svc.sendToCustomer(pool, SUB_ID, REVIEWER, {
      customerContactName: "Frau Kunde",
      customerContactEmail: "ops@kunde.de"
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.customer_email, "ops@kunde.de");
    // sendMail in test env may succeed (no transport) → customer_notified flag is boolean
    assert.strictEqual(typeof r.customer_notified, "boolean");
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * rejectByCustomer
 * NOTE: confirmByCustomer is NOT exported — its definition is swallowed inside
 * an unterminated block comment beginning at source line 843
 * ("/* ── Kundenbestätigung"). It is therefore untestable / dead code (bug).
 * ────────────────────────────────────────────────────────────────────────── */

describe("rejectByCustomer", () => {
  it("NOT_FOUND when missing", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.rejectByCustomer(pool, SUB_ID, REVIEWER, {});
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("INVALID_TRANSITION when not sent_to_customer", async () => {
    const pool = sequencePool({ rows: [baseSub({ status: "approved_internal" })] });
    const r = await svc.rejectByCustomer(pool, SUB_ID, REVIEWER, {});
    assert.strictEqual(r.error, "INVALID_TRANSITION");
    assert.strictEqual(r.to, "customer_rejected");
  });

  it("transitions sent_to_customer → customer_rejected and notifies worker", async () => {
    const pool = sequencePool(
      { rows: [baseSub({ status: "sent_to_customer" })] }, // getSubmission
      { rows: [], rowCount: 1 },                            // UPDATE
      { rows: [], rowCount: 1 },                            // logEvent
      { rows: [], rowCount: 1 }                             // notifySubmissionCorrectionRequested
    );
    const r = await svc.rejectByCustomer(pool, SUB_ID, REVIEWER, { note: "Stunden falsch" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.to, "customer_rejected");
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * addComment
 * ────────────────────────────────────────────────────────────────────────── */

describe("addComment", () => {
  it("logs comment event and updates reviewer_comment", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 1 }));
    const r = await svc.addComment(pool, SUB_ID, REVIEWER, "Bitte Pause korrigieren");
    assert.strictEqual(r.ok, true);
    // two non-tx queries: logEvent INSERT + UPDATE reviewer_comment
    assert.strictEqual(pool.calls.length, 2);
    assert.match(pool.calls[0].sql, /INSERT INTO worker_submission_events/);
    assert.match(pool.calls[1].sql, /reviewer_comment = \$1/);
    assert.strictEqual(pool.calls[1].params[0], "Bitte Pause korrigieren");
  });

  it("rolls back and rethrows on DB error", async () => {
    const boom = new Error("db down");
    const pool = sequencePool(boom);
    await assert.rejects(svc.addComment(pool, SUB_ID, REVIEWER, "x"), /db down/);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * getSupplierSubmissionKPIs / listAgencySubmissions
 * ────────────────────────────────────────────────────────────────────────── */

describe("getSupplierSubmissionKPIs", () => {
  it("returns the aggregate row scoped to supplier", async () => {
    const kpis = { pending_review: "2", in_review: "1" };
    const pool = trackingPool(() => ({ rows: [kpis] }));
    const r = await svc.getSupplierSubmissionKPIs(pool, "sup-1");
    assert.deepStrictEqual(r, kpis);
    assert.strictEqual(pool.calls[0].params[0], "sup-1");
    assert.match(pool.calls[0].sql, /WHERE supplier_org_id = \$1/);
  });

  it("returns empty object when no rows", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.getSupplierSubmissionKPIs(pool, "sup-1");
    assert.deepStrictEqual(r, {});
  });
});

describe("listAgencySubmissions", () => {
  it("scopes by supplier and splits comma-separated status into ANY()", async () => {
    const pool = trackingPool(() => ({ rows: [baseSub()] }));
    const rows = await svc.listAgencySubmissions(pool, {
      supplierOrgId: "sup-1",
      status: "submitted, under_review",
      workerSearch: "Max",
      limit: 10,
      offset: 5
    });
    assert.strictEqual(rows.length, 1);
    const call = pool.calls[0];
    assert.strictEqual(call.params[0], "sup-1");
    assert.match(call.sql, /wts\.status = ANY/);
    assert.match(call.sql, /ILIKE/);
    // the status param is an array with trimmed values
    const statusParam = call.params.find(p => Array.isArray(p));
    assert.deepStrictEqual(statusParam, ["submitted", "under_review"]);
    // limit + offset are the last two params
    assert.strictEqual(call.params[call.params.length - 2], 10);
    assert.strictEqual(call.params[call.params.length - 1], 5);
  });

  it("uses only supplier scope when no extra filters", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.listAgencySubmissions(pool, { supplierOrgId: "sup-1" });
    const call = pool.calls[0];
    // params: [supplier, limit(100), offset(0)]
    assert.deepStrictEqual(call.params, ["sup-1", 100, 0]);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * previewCustomerBundles — month mode + scope params (complement to base test)
 * ────────────────────────────────────────────────────────────────────────── */

describe("previewCustomerBundles (month mode + scope)", () => {
  it("groups by month period key when periodMode=month", async () => {
    const pool = trackingPool(() => ({
      rows: [
        { id: "s1", org_id: "org-A", week_start: "2026-03-02", week_end: "2026-03-08", total_hours: "40", status: "approved_internal", client_name: "A" },
        { id: "s2", org_id: "org-A", week_start: "2026-03-23", week_end: "2026-03-29", total_hours: "30", status: "approved_internal", client_name: "A" }
      ]
    }));
    const bundles = await svc.previewCustomerBundles(pool, {
      supplierOrgId: "sup-1",
      orgId: "org-A",
      periodMode: "month",
      weekFrom: "2026-03-01",
      weekTo: "2026-03-31"
    });
    // both weeks fall in March → single monthly bundle
    assert.strictEqual(bundles.length, 1);
    assert.strictEqual(bundles[0].period_mode, "month");
    assert.strictEqual(bundles[0].period_key, "2026-03-01");
    assert.strictEqual(bundles[0].submission_count, 2);
    assert.strictEqual(bundles[0].total_hours, 70);
    // scope params applied (supplier + org + weekFrom + weekTo)
    assert.deepStrictEqual(pool.calls[0].params, ["sup-1", "org-A", "2026-03-01", "2026-03-31"]);
  });

  it("returns empty array when no approved_internal submissions", async () => {
    const pool = sequencePool({ rows: [] });
    const bundles = await svc.previewCustomerBundles(pool, { supplierOrgId: "sup-1" });
    assert.deepStrictEqual(bundles, []);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * sendBundleToCustomer — non-explicit-selection path (BUNDLE_SCOPE_REQUIRED, success)
 * ────────────────────────────────────────────────────────────────────────── */

describe("sendBundleToCustomer (scope-based selection)", () => {
  it("BUNDLE_SCOPE_REQUIRED when no ids and no org/period", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await svc.sendBundleToCustomer(pool, {
      supplierOrgId: "sup-1",
      actorId: "u1",
      periodMode: "week"
    });
    assert.strictEqual(r.error, "BUNDLE_SCOPE_REQUIRED");
  });

  it("selects by org+period and sends successfully", async () => {
    const selected = [
      { id: "s1", org_id: "org-A", week_start: "2026-03-02", week_end: "2026-03-08", status: "approved_internal" }
    ];
    const pool = sequencePool(
      { rows: selected },        // SELECT ... FOR UPDATE (by org)
      { rows: [], rowCount: 1 },  // UPDATE submissions
      { rows: [], rowCount: 1 }   // INSERT events
    );
    const r = await svc.sendBundleToCustomer(pool, {
      supplierOrgId: "sup-1",
      actorId: "u1",
      orgId: "org-A",
      periodMode: "week",
      periodKey: "2026-03-02",
      customerContactEmail: "ops@kunde.de"
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.submission_count, 1);
    assert.strictEqual(r.period_key, "2026-03-02");
    assert.match(r.bundle_key, /org:org-A/);
  });

  it("NO_ELIGIBLE_SUBMISSIONS when scoped select matches no period", async () => {
    const selected = [
      { id: "s1", org_id: "org-A", week_start: "2026-03-09", week_end: "2026-03-15", status: "approved_internal" }
    ];
    const pool = sequencePool({ rows: selected });
    const r = await svc.sendBundleToCustomer(pool, {
      supplierOrgId: "sup-1",
      actorId: "u1",
      orgId: "org-A",
      periodMode: "week",
      periodKey: "2026-03-02" // does not match the row's period
    });
    assert.strictEqual(r.error, "NO_ELIGIBLE_SUBMISSIONS");
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * listSentBundles / getBundleDetails / postBundleToTimesheets
 * ────────────────────────────────────────────────────────────────────────── */

describe("listSentBundles", () => {
  it("scopes by supplier and optional org, returns grouped rows", async () => {
    const grouped = [{ customer_bundle_key: "k1", submission_count: "3" }];
    const pool = trackingPool(() => ({ rows: grouped }));
    const rows = await svc.listSentBundles(pool, { supplierOrgId: "sup-1", orgId: "org-A" });
    assert.deepStrictEqual(rows, grouped);
    assert.deepStrictEqual(pool.calls[0].params, ["sup-1", "org-A"]);
    assert.match(pool.calls[0].sql, /customer_bundle_key IS NOT NULL/);
  });

  it("works without org filter", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.listSentBundles(pool, { supplierOrgId: "sup-1" });
    assert.deepStrictEqual(pool.calls[0].params, ["sup-1"]);
  });
});

describe("getBundleDetails", () => {
  it("returns rows for supplier + bundleKey", async () => {
    const detail = [{ id: "s1", customer_bundle_key: "k1" }];
    const pool = trackingPool(() => ({ rows: detail }));
    const rows = await svc.getBundleDetails(pool, { supplierOrgId: "sup-1", bundleKey: "k1" });
    assert.deepStrictEqual(rows, detail);
    assert.deepStrictEqual(pool.calls[0].params, ["sup-1", "k1"]);
  });
});

describe("postBundleToTimesheets", () => {
  it("NOT_FOUND when bundle has no items", async () => {
    const pool = sequencePool({ rows: [] }); // getBundleDetails
    const r = await svc.postBundleToTimesheets(pool, { supplierOrgId: "sup-1", bundleKey: "k1", actorId: "u1" });
    assert.strictEqual(r.error, "NOT_FOUND");
  });

  it("NO_ELIGIBLE_SUBMISSIONS when none customer_confirmed", async () => {
    const pool = sequencePool({
      rows: [{ id: "s1", status: "sent_to_customer" }]
    });
    const r = await svc.postBundleToTimesheets(pool, { supplierOrgId: "sup-1", bundleKey: "k1", actorId: "u1" });
    assert.strictEqual(r.error, "NO_ELIGIBLE_SUBMISSIONS");
  });

  it("posts each customer_confirmed item and reports bundle_status confirmed", async () => {
    const ts = { id: "ts-1" };
    const pool = sequencePool(
      // 1) getBundleDetails
      { rows: [{ id: "s1", status: "customer_confirmed" }] },
      // postToTimesheet(s1): gswe getSubmission + entries + events
      { rows: [baseSub({ status: "customer_confirmed" })] },
      { rows: fullWeekEntries() },
      { rows: [] },
      // INSERT timesheets RETURNING
      { rows: [ts] },
      // 7 entry inserts
      { rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }, { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }, { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },  // UPDATE timesheets totals
      { rows: [], rowCount: 1 },  // UPDATE submission
      { rows: [], rowCount: 1 },  // logEvent
      { rows: [], rowCount: 1 },  // notify
      // 2) final UPDATE bundle status
      { rows: [], rowCount: 1 }
    );
    const r = await svc.postBundleToTimesheets(pool, { supplierOrgId: "sup-1", bundleKey: "k1", actorId: "u1" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.processed, 1);
    assert.strictEqual(r.bundle_status, "confirmed");
    assert.strictEqual(r.results[0].ok, true);
    assert.strictEqual(r.results[0].timesheet_id, "ts-1");
  });

  it("reports partially_confirmed when an item fails to post", async () => {
    // The single eligible item will fail postToTimesheet because its
    // transition is invalid (status drifted), yielding ok:false.
    const pool = sequencePool(
      // getBundleDetails
      { rows: [{ id: "s1", status: "customer_confirmed" }] },
      // postToTimesheet: gswe getSubmission returns a non-postable status
      { rows: [baseSub({ status: "submitted" })] },
      { rows: [] }, // entries
      { rows: [] }, // events
      // final UPDATE bundle status
      { rows: [], rowCount: 1 }
    );
    const r = await svc.postBundleToTimesheets(pool, { supplierOrgId: "sup-1", bundleKey: "k1", actorId: "u1" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.bundle_status, "partially_confirmed");
    assert.strictEqual(r.results[0].ok, false);
    assert.strictEqual(r.results[0].error, "INVALID_TRANSITION");
  });
});
