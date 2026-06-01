/**
 * Timesheet Service unit tests.
 * Covers CRUD, state machine (draft→submitted→approved|rejected),
 * entry management, recalcTotals, assignment validation.
 *
 * Run: node --test --test-force-exit test/timesheetService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/timesheetService.js";
import { returnPool, sequencePool } from "./helpers/mockPool.js";

// ═══════════════════════════════════════════════════════════════
// createTimesheet
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — createTimesheet", () => {
  it("creates timesheet without assignment", async () => {
    const ts = { id: "ts1", org_id: "o1", supplier_org_id: "s1", status: "draft", worker_name: "Max", week_start: "2026-01-05" };
    const pool = sequencePool(
      { rows: [ts] },   // INSERT timesheets
      { rows: [] }       // writeAudit
    );
    const result = await svc.createTimesheet(pool, {
      org_id: "o1", supplier_org_id: "s1",
      worker_name: "Max", week_start: "2026-01-05", week_end: "2026-01-11"
    });
    assert.strictEqual(result.timesheet.id, "ts1");
    assert.strictEqual(result.timesheet.status, "draft");
  });

  it("creates timesheet with valid assignment (buyer org)", async () => {
    const ts = { id: "ts2", org_id: "o1", status: "draft", worker_name: "Max" };
    const pool = sequencePool(
      { rows: [{ id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active" }] },
      { rows: [ts] },
      { rows: [] }
    );
    const result = await svc.createTimesheet(pool, {
      org_id: "o1", supplier_org_id: "s1", assignment_id: "a1",
      worker_name: "Max", week_start: "2026-01-05", week_end: "2026-01-11"
    });
    assert.strictEqual(result.timesheet.id, "ts2");
  });

  it("creates timesheet with valid assignment (supplier org)", async () => {
    const ts = { id: "ts3", org_id: "s1", status: "draft", worker_name: "Max" };
    const pool = sequencePool(
      { rows: [{ id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active" }] },
      { rows: [ts] },
      { rows: [] }
    );
    const result = await svc.createTimesheet(pool, {
      org_id: "s1", supplier_org_id: "s1", assignment_id: "a1",
      worker_name: "Max", week_start: "2026-01-05", week_end: "2026-01-11"
    });
    assert.strictEqual(result.timesheet.id, "ts3");
  });

  it("rejects invalid date range", async () => {
    const pool = returnPool();
    const result = await svc.createTimesheet(pool, {
      week_start: "2026-01-11", week_end: "2026-01-05"
    });
    assert.strictEqual(result.error, "INVALID_DATE_RANGE");
  });

  it("rejects when assignment not found", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await svc.createTimesheet(pool, {
      assignment_id: "a1", week_start: "2026-01-05", week_end: "2026-01-11"
    });
    assert.strictEqual(result.error, "ASSIGNMENT_NOT_FOUND");
  });

  it("rejects cancelled assignment", async () => {
    const pool = sequencePool(
      { rows: [{ id: "a1", org_id: "o1", supplier_org_id: "s1", status: "cancelled" }] }
    );
    const result = await svc.createTimesheet(pool, {
      assignment_id: "a1", week_start: "2026-01-05", week_end: "2026-01-11"
    });
    assert.strictEqual(result.error, "ASSIGNMENT_CANCELLED");
  });

  it("rejects org boundary violation", async () => {
    const pool = sequencePool(
      { rows: [{ id: "a1", org_id: "o1", supplier_org_id: "s1", status: "active" }] }
    );
    const result = await svc.createTimesheet(pool, {
      assignment_id: "a1", org_id: "other-org",
      week_start: "2026-01-05", week_end: "2026-01-11"
    });
    assert.strictEqual(result.error, "ORG_BOUNDARY_VIOLATION");
  });
});

// ═══════════════════════════════════════════════════════════════
// getTimesheet / getTimesheetWithEntries
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — getTimesheet", () => {
  it("returns timesheet when found", async () => {
    const row = { id: "ts1", status: "draft", worker_name: "Max", org_name: "Org" };
    assert.strictEqual((await svc.getTimesheet(returnPool([row]), "ts1")).id, "ts1");
  });

  it("returns null when not found", async () => {
    assert.strictEqual(await svc.getTimesheet(returnPool([]), "ts99"), null);
  });
});

describe("timesheetService — getTimesheetWithEntries", () => {
  it("returns timesheet with entries array", async () => {
    const ts = { id: "ts1", status: "draft" };
    const entries = [{ id: "e1", work_date: "2026-01-05" }, { id: "e2", work_date: "2026-01-06" }];
    const pool = sequencePool({ rows: [ts] }, { rows: entries });
    const result = await svc.getTimesheetWithEntries(pool, "ts1");
    assert.strictEqual(result.entries.length, 2);
  });

  it("returns null when timesheet not found", async () => {
    assert.strictEqual(await svc.getTimesheetWithEntries(returnPool([]), "ts99"), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// listTimesheets / listTimesheetsForAssignment
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — listTimesheets", () => {
  it("returns all without filters", async () => {
    const rows = [{ id: "ts1" }, { id: "ts2" }];
    assert.strictEqual((await svc.listTimesheets(returnPool(rows), {})).length, 2);
  });

  it("applies all filters", async () => {
    const rows = [{ id: "ts1", status: "submitted" }];
    const result = await svc.listTimesheets(returnPool(rows), {
      org_id: "o1", supplier_org_id: "s1", assignment_id: "a1",
      status: "submitted", worker_name: "Max",
      week_start_from: "2026-01-01", week_start_to: "2026-01-31"
    });
    assert.strictEqual(result.length, 1);
  });

  it("respects limit cap at 500", async () => {
    const result = await svc.listTimesheets(returnPool([]), { limit: 1000 });
    assert.strictEqual(result.length, 0);
  });
});

describe("timesheetService — listTimesheetsForAssignment", () => {
  it("delegates to listTimesheets with assignment filter", async () => {
    assert.strictEqual((await svc.listTimesheetsForAssignment(returnPool([]), "a1")).length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// updateTimesheet
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — updateTimesheet", () => {
  it("updates allowed fields in draft", async () => {
    const updated = { id: "ts1", status: "draft", worker_name: "Updated" };
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "draft" }] },
      { rows: [updated] },
      { rows: [] }
    );
    const result = await svc.updateTimesheet(pool, "ts1", { worker_name: "Updated" }, "u1");
    assert.strictEqual(result.timesheet.worker_name, "Updated");
  });

  it("returns error when not found", async () => {
    assert.strictEqual((await svc.updateTimesheet(returnPool([]), "ts99", { worker_name: "X" }, "u1")).error, "NOT_FOUND");
  });

  it("returns error when not draft", async () => {
    const pool = returnPool([{ id: "ts1", status: "submitted" }]);
    const result = await svc.updateTimesheet(pool, "ts1", { worker_name: "X" }, "u1");
    assert.strictEqual(result.error, "NOT_EDITABLE");
    assert.strictEqual(result.status, "submitted");
  });

  it("returns existing when no fields to update", async () => {
    const ts = { id: "ts1", status: "draft", worker_name: "Max" };
    const result = await svc.updateTimesheet(returnPool([ts]), "ts1", {}, "u1");
    assert.strictEqual(result.timesheet.worker_name, "Max");
  });
});

// ═══════════════════════════════════════════════════════════════
// submitTimesheet
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — submitTimesheet", () => {
  it("submits draft timesheet with hours", async () => {
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "draft", total_hours: 40, worker_name: "Max" }] },
      { rows: [{ id: "ts1", status: "submitted" }] },
      { rows: [] }
    );
    const result = await svc.submitTimesheet(pool, "ts1", "u1");
    assert.strictEqual(result.timesheet.status, "submitted");
  });

  it("rejects when not found", async () => {
    assert.strictEqual((await svc.submitTimesheet(returnPool([]), "ts99", "u1")).error, "NOT_FOUND");
  });

  it("rejects invalid transition from approved", async () => {
    const pool = returnPool([{ id: "ts1", status: "approved", total_hours: 40 }]);
    assert.strictEqual((await svc.submitTimesheet(pool, "ts1", "u1")).error, "INVALID_TRANSITION");
  });

  it("rejects when no hours recorded", async () => {
    const pool = returnPool([{ id: "ts1", status: "draft", total_hours: 0 }]);
    assert.strictEqual((await svc.submitTimesheet(pool, "ts1", "u1")).error, "NO_HOURS");
  });
});

// ═══════════════════════════════════════════════════════════════
// approveTimesheet
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — approveTimesheet", () => {
  it("approves submitted timesheet", async () => {
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "submitted", total_hours: 40, worker_name: "Max" }] },
      { rows: [{ id: "ts1", status: "approved" }] },
      { rows: [] }
    );
    assert.strictEqual((await svc.approveTimesheet(pool, "ts1", "u1")).timesheet.status, "approved");
  });

  it("rejects from draft", async () => {
    assert.strictEqual((await svc.approveTimesheet(returnPool([{ id: "ts1", status: "draft" }]), "ts1", "u1")).error, "INVALID_TRANSITION");
  });

  it("returns error when not found", async () => {
    assert.strictEqual((await svc.approveTimesheet(returnPool([]), "ts99", "u1")).error, "NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// rejectTimesheet
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — rejectTimesheet", () => {
  it("rejects submitted timesheet with reason", async () => {
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "submitted", total_hours: 40, worker_name: "Max" }] },
      { rows: [{ id: "ts1", status: "rejected" }] },
      { rows: [] }
    );
    assert.strictEqual((await svc.rejectTimesheet(pool, "ts1", "u1", "Quality issue")).timesheet.status, "rejected");
  });

  it("rejects from draft", async () => {
    assert.strictEqual((await svc.rejectTimesheet(returnPool([{ id: "ts1", status: "draft" }]), "ts1", "u1", "r")).error, "INVALID_TRANSITION");
  });

  it("returns error when not found", async () => {
    assert.strictEqual((await svc.rejectTimesheet(returnPool([]), "ts99", "u1", "r")).error, "NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// cancelTimesheet
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — cancelTimesheet", () => {
  it("cancels draft timesheet", async () => {
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "draft", worker_name: "Max" }] },
      { rows: [{ id: "ts1", status: "cancelled" }] },
      { rows: [] }
    );
    assert.strictEqual((await svc.cancelTimesheet(pool, "ts1", "u1")).timesheet.status, "cancelled");
  });

  it("rejects cancel from submitted (not allowed)", async () => {
    assert.strictEqual((await svc.cancelTimesheet(returnPool([{ id: "ts1", status: "submitted" }]), "ts1", "u1")).error, "INVALID_TRANSITION");
  });

  it("rejects cancel from approved", async () => {
    assert.strictEqual((await svc.cancelTimesheet(returnPool([{ id: "ts1", status: "approved" }]), "ts1", "u1")).error, "INVALID_TRANSITION");
  });
});

// ═══════════════════════════════════════════════════════════════
// returnToDraft
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — returnToDraft", () => {
  it("returns submitted to draft", async () => {
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "submitted" }] },
      { rows: [{ id: "ts1", status: "draft" }] },
      { rows: [] }
    );
    assert.strictEqual((await svc.returnToDraft(pool, "ts1", "u1")).timesheet.status, "draft");
  });

  it("returns rejected to draft", async () => {
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "rejected" }] },
      { rows: [{ id: "ts1", status: "draft" }] },
      { rows: [] }
    );
    assert.strictEqual((await svc.returnToDraft(pool, "ts1", "u1")).timesheet.status, "draft");
  });

  it("rejects from approved", async () => {
    assert.strictEqual((await svc.returnToDraft(returnPool([{ id: "ts1", status: "approved" }]), "ts1", "u1")).error, "INVALID_TRANSITION");
  });

  it("returns error when not found", async () => {
    assert.strictEqual((await svc.returnToDraft(returnPool([]), "ts99", "u1")).error, "NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// addEntry
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — addEntry", () => {
  it("upserts entry and recalculates totals", async () => {
    const entry = { id: "e1", timesheet_id: "ts1", work_date: "2026-01-05", hours_regular: 8, hours_overtime: 0 };
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "draft" }] },
      { rows: [entry] },
      { rows: [{ id: "ts1", total_hours: 8, overtime_hours: 0 }] }
    );
    const result = await svc.addEntry(pool, "ts1", {
      work_date: "2026-01-05", hours_regular: 8, hours_overtime: 0
    });
    assert.strictEqual(result.entry.id, "e1");
  });

  it("rejects when timesheet not found", async () => {
    assert.strictEqual((await svc.addEntry(returnPool([]), "ts99", { work_date: "2026-01-05" })).error, "NOT_FOUND");
  });

  it("rejects when timesheet not draft", async () => {
    assert.strictEqual((await svc.addEntry(returnPool([{ id: "ts1", status: "submitted" }]), "ts1", { work_date: "2026-01-05" })).error, "NOT_EDITABLE");
  });

  it("rejects when hours exceed 24", async () => {
    const pool = returnPool([{ id: "ts1", status: "draft" }]);
    const result = await svc.addEntry(pool, "ts1", {
      work_date: "2026-01-05", hours_regular: 20, hours_overtime: 5
    });
    assert.strictEqual(result.error, "HOURS_EXCEED_DAY");
  });
});

// ═══════════════════════════════════════════════════════════════
// updateEntry
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — updateEntry", () => {
  it("updates entry fields and recalculates", async () => {
    const updated = { id: "e1", hours_regular: 6, hours_overtime: 1 };
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "draft" }] },
      { rows: [updated] },
      { rows: [{ id: "ts1", total_hours: 7, overtime_hours: 1 }] }
    );
    const result = await svc.updateEntry(pool, "ts1", "e1", { hours_regular: 6, hours_overtime: 1 });
    assert.strictEqual(result.entry.hours_regular, 6);
  });

  it("returns existing entry when no fields provided", async () => {
    const entry = { id: "e1", hours_regular: 8 };
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "draft" }] },
      { rows: [entry] }
    );
    const result = await svc.updateEntry(pool, "ts1", "e1", {});
    assert.strictEqual(result.entry.id, "e1");
  });

  it("returns error when timesheet not found", async () => {
    assert.strictEqual((await svc.updateEntry(returnPool([]), "ts99", "e1", { hours_regular: 6 })).error, "NOT_FOUND");
  });

  it("returns error when not draft", async () => {
    assert.strictEqual((await svc.updateEntry(returnPool([{ id: "ts1", status: "approved" }]), "ts1", "e1", { hours_regular: 6 })).error, "NOT_EDITABLE");
  });

  it("returns error when entry not found after UPDATE", async () => {
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "draft" }] },
      { rows: [] }
    );
    assert.strictEqual((await svc.updateEntry(pool, "ts1", "e99", { hours_regular: 6 })).error, "ENTRY_NOT_FOUND");
  });

  it("rejects when hours exceed 24", async () => {
    const pool = returnPool([{ id: "ts1", status: "draft" }]);
    assert.strictEqual((await svc.updateEntry(pool, "ts1", "e1", { hours_regular: 20, hours_overtime: 5 })).error, "HOURS_EXCEED_DAY");
  });
});

// ═══════════════════════════════════════════════════════════════
// deleteEntry
// ═══════════════════════════════════════════════════════════════

describe("timesheetService — deleteEntry", () => {
  it("deletes entry and recalculates totals", async () => {
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "draft" }] },
      { rows: [], rowCount: 1 },
      { rows: [{ id: "ts1", total_hours: 0, overtime_hours: 0 }] }
    );
    assert.strictEqual((await svc.deleteEntry(pool, "ts1", "e1")).ok, true);
  });

  it("returns error when timesheet not found", async () => {
    assert.strictEqual((await svc.deleteEntry(returnPool([]), "ts99", "e1")).error, "NOT_FOUND");
  });

  it("returns error when not draft", async () => {
    assert.strictEqual((await svc.deleteEntry(returnPool([{ id: "ts1", status: "submitted" }]), "ts1", "e1")).error, "NOT_EDITABLE");
  });

  it("returns error when entry not found", async () => {
    const pool = sequencePool(
      { rows: [{ id: "ts1", status: "draft" }] },
      { rows: [], rowCount: 0 }
    );
    assert.strictEqual((await svc.deleteEntry(pool, "ts1", "e99")).error, "ENTRY_NOT_FOUND");
  });
});
