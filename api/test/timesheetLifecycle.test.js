/**
 * Timesheet lifecycle unit tests — state machine transitions + edge cases.
 * Uses mock pool — no DB required.
 *
 * Status model: draft → submitted → approved | rejected
 *               submitted → draft (withdrawal)
 *               rejected → draft (correction)
 *               approved → (terminal)
 *               cancelled → (terminal)
 *
 * Run: node --test --test-force-exit test/timesheetLifecycle.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  createTimesheet,
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
  cancelTimesheet,
  returnToDraft,
  addEntry,
  updateEntry,
  deleteEntry
} from "../services/timesheetService.js";

/* ── Mock pool builder ─────────────────────────────────── */

function makeTimesheetRow(overrides = {}) {
  return {
    id: "ts-1",
    org_id: "org-1",
    supplier_org_id: "sorg-1",
    assignment_id: null,
    worker_name: "Max Mustermann",
    worker_identifier: "W-001",
    week_start: "2026-03-09",
    week_end: "2026-03-15",
    status: "draft",
    total_hours: 40,
    overtime_hours: 0,
    notes: null,
    created_by: "u-1",
    submitted_by: null,
    approved_by: null,
    rejected_by: null,
    ...overrides
  };
}

const TX_COMMANDS = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);

function isTxCommand(sql) {
  return typeof sql === "string" && TX_COMMANDS.has(sql.trim().toUpperCase());
}

/**
 * Mock pool that simulates timesheet queries.
 * getRow is called for getTimesheet (SELECT).
 * Records all queries.
 */
function mockPool(tsRow) {
  const queries = [];
  const query = async (sql, params) => {
    if (isTxCommand(sql)) return { rows: [], rowCount: 0 };
    queries.push({ sql, params });
    // getTimesheet — SELECT with JOINs
    if (sql.includes("SELECT") && sql.includes("FROM timesheets")) {
      return { rows: tsRow ? [tsRow] : [] };
    }
    // recalcTotals
    if (sql.includes("UPDATE timesheets ts")) {
      return { rows: [{ id: "ts-1", total_hours: 40, overtime_hours: 0 }] };
    }
    // UPDATE returning *
    if (sql.includes("UPDATE timesheets")) {
      return { rows: tsRow ? [{ ...tsRow, status: "updated" }] : [] };
    }
    // INSERT (create / audit)
    if (sql.includes("INSERT INTO timesheets")) {
      return { rows: [{ ...tsRow, id: "ts-new" }] };
    }
    // Audit log
    if (sql.includes("INSERT INTO audit")) {
      return { rows: [{}] };
    }
    // Assignment check
    if (sql.includes("FROM assignments")) {
      return { rows: [{ id: "a-1", org_id: "org-1", supplier_org_id: "sorg-1", status: "active" }] };
    }
    // Timesheet entries
    if (sql.includes("INSERT INTO timesheet_entries")) {
      return { rows: [{ id: "entry-1" }] };
    }
    if (sql.includes("UPDATE timesheet_entries")) {
      return { rows: [{ id: params?.[0] }] };
    }
    if (sql.includes("DELETE FROM timesheet_entries")) {
      return { rowCount: 1 };
    }
    return { rows: [{}], rowCount: 0 };
  };

  return {
    queries,
    query,
    connect: async () => ({
      query,
      release() {}
    })
  };
}

// ─────────────────────────────────────────────────────────────
// createTimesheet
// ─────────────────────────────────────────────────────────────

describe("createTimesheet", () => {
  it("creates a timesheet successfully", async () => {
    const pool = mockPool(makeTimesheetRow());
    const result = await createTimesheet(pool, {
      org_id: "org-1", supplier_org_id: "sorg-1",
      worker_name: "Max", week_start: "2026-03-09", week_end: "2026-03-15",
      created_by: "u-1"
    });
    assert.ok(result.timesheet, "Should return timesheet object");
  });

  it("rejects if week_end < week_start", async () => {
    const pool = mockPool(makeTimesheetRow());
    const result = await createTimesheet(pool, {
      org_id: "org-1", supplier_org_id: "sorg-1",
      worker_name: "Max", week_start: "2026-03-15", week_end: "2026-03-09",
      created_by: "u-1"
    });
    assert.strictEqual(result.error, "INVALID_DATE_RANGE");
  });
});

// ─────────────────────────────────────────────────────────────
// submitTimesheet
// ─────────────────────────────────────────────────────────────

describe("submitTimesheet — valid transitions", () => {
  it("submits from draft status", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "draft", total_hours: 40 }));
    const result = await submitTimesheet(pool, "ts-1", "u-1");
    assert.ok(result.timesheet, "Should return timesheet");
  });

  it("rejects submit when total_hours is 0", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "draft", total_hours: 0 }));
    const result = await submitTimesheet(pool, "ts-1", "u-1");
    assert.strictEqual(result.error, "NO_HOURS");
  });

  it("returns NOT_FOUND for missing timesheet", async () => {
    const pool = mockPool(null);
    const result = await submitTimesheet(pool, "nonexistent", "u-1");
    assert.strictEqual(result.error, "NOT_FOUND");
  });
});

describe("submitTimesheet — invalid transitions", () => {
  it("rejects submit from approved (terminal)", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "approved" }));
    const result = await submitTimesheet(pool, "ts-1", "u-1");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
    assert.strictEqual(result.from, "approved");
    assert.strictEqual(result.to, "submitted");
  });

  it("rejects submit from cancelled (terminal)", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "cancelled" }));
    const result = await submitTimesheet(pool, "ts-1", "u-1");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });
});

// ─────────────────────────────────────────────────────────────
// approveTimesheet
// ─────────────────────────────────────────────────────────────

describe("approveTimesheet", () => {
  it("approves from submitted status", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "submitted", total_hours: 40 }));
    const result = await approveTimesheet(pool, "ts-1", "u-2");
    assert.ok(result.timesheet);
  });

  it("rejects approve from draft", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "draft" }));
    const result = await approveTimesheet(pool, "ts-1", "u-2");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });

  it("rejects approve from rejected", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "rejected" }));
    const result = await approveTimesheet(pool, "ts-1", "u-2");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });
});

// ─────────────────────────────────────────────────────────────
// rejectTimesheet
// ─────────────────────────────────────────────────────────────

describe("rejectTimesheet", () => {
  it("rejects from submitted status", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "submitted", total_hours: 40 }));
    const result = await rejectTimesheet(pool, "ts-1", "u-2", "Hours don't match");
    assert.ok(result.timesheet);
  });

  it("rejects reject from draft", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "draft" }));
    const result = await rejectTimesheet(pool, "ts-1", "u-2", "reason");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });
});

// ─────────────────────────────────────────────────────────────
// cancelTimesheet
// ─────────────────────────────────────────────────────────────

describe("cancelTimesheet", () => {
  it("cancels from draft", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "draft" }));
    const result = await cancelTimesheet(pool, "ts-1", "u-1");
    assert.ok(result.timesheet);
  });

  it("rejects cancel from approved (terminal)", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "approved" }));
    const result = await cancelTimesheet(pool, "ts-1", "u-1");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });

  it("rejects cancel from cancelled (already terminal)", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "cancelled" }));
    const result = await cancelTimesheet(pool, "ts-1", "u-1");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });
});

// ─────────────────────────────────────────────────────────────
// returnToDraft
// ─────────────────────────────────────────────────────────────

describe("returnToDraft", () => {
  it("returns submitted → draft (withdrawal)", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "submitted" }));
    const result = await returnToDraft(pool, "ts-1", "u-1");
    assert.ok(result.timesheet);
  });

  it("returns rejected → draft (correction)", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "rejected" }));
    const result = await returnToDraft(pool, "ts-1", "u-1");
    assert.ok(result.timesheet);
  });

  it("rejects return from approved (terminal — cannot undo)", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "approved" }));
    const result = await returnToDraft(pool, "ts-1", "u-1");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });

  it("rejects return from draft (already draft)", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "draft" }));
    const result = await returnToDraft(pool, "ts-1", "u-1");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });
});

// ─────────────────────────────────────────────────────────────
// Entry management — addEntry
// ─────────────────────────────────────────────────────────────

describe("addEntry", () => {
  it("adds entry in draft status", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "draft" }));
    const result = await addEntry(pool, "ts-1", {
      work_date: "2026-03-10", hours_regular: 8, hours_overtime: 0
    }, "u-1");
    assert.ok(result.entry);
  });

  it("rejects entry when status is not draft", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "submitted" }));
    const result = await addEntry(pool, "ts-1", {
      work_date: "2026-03-10", hours_regular: 8
    }, "u-1");
    assert.strictEqual(result.error, "NOT_EDITABLE");
  });

  it("rejects entry with > 24h per day", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "draft" }));
    const result = await addEntry(pool, "ts-1", {
      work_date: "2026-03-10", hours_regular: 20, hours_overtime: 10
    }, "u-1");
    assert.strictEqual(result.error, "HOURS_EXCEED_DAY");
  });

  it("accepts exactly 24h per day", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "draft" }));
    const result = await addEntry(pool, "ts-1", {
      work_date: "2026-03-10", hours_regular: 16, hours_overtime: 8
    }, "u-1");
    assert.ok(result.entry);
  });

  it("returns NOT_FOUND for missing timesheet", async () => {
    const pool = mockPool(null);
    const result = await addEntry(pool, "nonexistent", {
      work_date: "2026-03-10", hours_regular: 8
    }, "u-1");
    assert.strictEqual(result.error, "NOT_FOUND");
  });
});

// ─────────────────────────────────────────────────────────────
// Entry management — updateEntry
// ─────────────────────────────────────────────────────────────

describe("updateEntry", () => {
  it("rejects update when not in draft", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "approved" }));
    const result = await updateEntry(pool, "ts-1", "entry-1", { hours_regular: 6 }, "u-1");
    assert.strictEqual(result.error, "NOT_EDITABLE");
  });

  it("rejects update with > 24h per day", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "draft" }));
    const result = await updateEntry(pool, "ts-1", "entry-1", {
      hours_regular: 20, hours_overtime: 10
    }, "u-1");
    assert.strictEqual(result.error, "HOURS_EXCEED_DAY");
  });
});

// ─────────────────────────────────────────────────────────────
// Entry management — deleteEntry
// ─────────────────────────────────────────────────────────────

describe("deleteEntry", () => {
  it("rejects delete when not in draft", async () => {
    const pool = mockPool(makeTimesheetRow({ status: "submitted" }));
    const result = await deleteEntry(pool, "ts-1", "entry-1", "u-1");
    assert.strictEqual(result.error, "NOT_EDITABLE");
  });
});
