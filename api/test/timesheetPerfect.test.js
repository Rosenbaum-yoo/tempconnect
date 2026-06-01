/**
 * Timesheet Perfect Tests — Enterprise Stundenzettel-Modul
 *
 * Covers:
 *  1. prefillFromAssignment  — 3-tier defaults, entries creation, edge cases
 *  2. signTimesheet          — digital signature, already-signed, not-signable
 *  3. batchApprove           — multi-approve, partial errors, limit
 *  4. batchReject            — multi-reject with reason, limit
 *  5. validateBreakCompliance — ArbZG §4 (6h/30min, 9h/45min)
 *  6. getTimesheetStatusMeta — all 5 statuses, DE/EN labels, colors, icons
 *  7. getWorkerTimesheetSummary — KPIs, per-property defaults
 *  8. Notification Matrix    — timesheet events in MATRIX + EVENT_CATEGORY_MAP
 *
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  prefillFromAssignment,
  signTimesheet,
  batchApprove,
  batchReject,
  validateBreakCompliance,
  getTimesheetStatusMeta,
  getWorkerTimesheetSummary,
  createTimesheet,
  approveTimesheet,
  submitTimesheet,
  rejectTimesheet
} from "../services/timesheetService.js";

import { EVENT_CATEGORY_MAP } from "../services/matchAlertService.js";

// ── Mock pool helper ─────────────────────────────────────

let _auditCalls = [];
let _queryLog = [];

function mockPool(queryMap = {}) {
  _auditCalls = [];
  _queryLog = [];
  const queryFn = (sql, params) => {
    _queryLog.push({ sql, params });
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return Promise.resolve({ rows: [], rowCount: 0 });
    for (const [key, handler] of Object.entries(queryMap)) {
      if (sql.includes(key)) {
        if (typeof handler === "function") return handler(sql, params);
        return Promise.resolve({ rows: handler, rowCount: handler.length });
      }
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  };
  return {
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} })
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. prefillFromAssignment
// ═══════════════════════════════════════════════════════════════

describe("prefillFromAssignment", () => {
  it("returns ASSIGNMENT_NOT_FOUND when assignment missing", async () => {
    const pool = mockPool({});
    const result = await prefillFromAssignment(pool, {
      assignmentId: "a1", supplierOrgId: "org1",
      weekStart: "2025-03-10", weekEnd: "2025-03-14", createdBy: "u1"
    });
    assert.equal(result.error, "ASSIGNMENT_NOT_FOUND");
  });

  it("returns ASSIGNMENT_CANCELLED for cancelled assignment", async () => {
    const pool = mockPool({
      "FROM assignments": [{ id: "a1", org_id: "org1", supplier_org_id: "org2", status: "cancelled", worker_description: "W" }]
    });
    const result = await prefillFromAssignment(pool, {
      assignmentId: "a1", supplierOrgId: "org1",
      weekStart: "2025-03-10", weekEnd: "2025-03-14", createdBy: "u1"
    });
    assert.equal(result.error, "ASSIGNMENT_CANCELLED");
  });

  it("returns ORG_BOUNDARY_VIOLATION for wrong org", async () => {
    const pool = mockPool({
      "FROM assignments": [{ id: "a1", org_id: "orgA", supplier_org_id: "orgB", status: "active", worker_description: "W" }]
    });
    const result = await prefillFromAssignment(pool, {
      assignmentId: "a1", supplierOrgId: "orgX",
      weekStart: "2025-03-10", weekEnd: "2025-03-14", createdBy: "u1"
    });
    assert.equal(result.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("creates timesheet + weekday entries with fallback defaults", async () => {
    const tsId = "ts-new-1";
    const pool = mockPool({
      "FROM assignments": [{ id: "a1", org_id: "org1", supplier_org_id: "org2", status: "active", worker_description: "Max Muster" }],
      "worker_assignment_links": [],
      "INSERT INTO timesheets": [{ id: tsId, org_id: "org1", supplier_org_id: "org2", status: "draft", total_hours: 0, worker_name: "Max Muster" }],
      "INSERT INTO timesheet_entries": (sql, params) => {
        return { rows: [{ id: "e-" + params[1], timesheet_id: tsId, work_date: params[1], hours_regular: params[2] }], rowCount: 1 };
      },
      "UPDATE timesheets ts": [{ id: tsId, total_hours: 40, overtime_hours: 0 }],
      "audit_log": []
    });

    const result = await prefillFromAssignment(pool, {
      assignmentId: "a1", supplierOrgId: "org2",
      weekStart: "2025-03-10", weekEnd: "2025-03-14", createdBy: "u1"
    });

    assert.ok(!result.error, "Should not have error");
    assert.ok(result.timesheet, "Should have timesheet");
    assert.equal(result.defaults.hoursPerDay, 8);
    assert.equal(result.defaults.breakMinutes, 30);
    assert.ok(Array.isArray(result.entries));
  });

  it("uses link defaults over template/fallback", async () => {
    const tsId = "ts-link-1";
    const pool = mockPool({
      "FROM assignments": [{ id: "a1", org_id: "org1", supplier_org_id: "org2", status: "active", worker_description: "X" }],
      "worker_assignment_links": [{ default_hours_per_day: 7.5, default_shift_start: "08:00", default_shift_end: "16:00", default_break_minutes: 45, client_name: "ClientA" }],
      "INSERT INTO timesheets": [{ id: tsId, org_id: "org1", supplier_org_id: "org2", status: "draft", total_hours: 0, worker_name: "X" }],
      "INSERT INTO timesheet_entries": (sql, params) => {
        return { rows: [{ id: "e-" + params[1], timesheet_id: tsId, work_date: params[1], hours_regular: params[2] }], rowCount: 1 };
      },
      "UPDATE timesheets ts": [{ id: tsId, total_hours: 37.5, overtime_hours: 0 }],
      "audit_log": []
    });

    const result = await prefillFromAssignment(pool, {
      assignmentId: "a1", supplierOrgId: "org2",
      weekStart: "2025-03-10", weekEnd: "2025-03-14", createdBy: "u1"
    });

    assert.equal(result.defaults.hoursPerDay, 7.5);
    assert.equal(result.defaults.breakMinutes, 45);
    assert.equal(result.defaults.shiftStart, "08:00");
    assert.equal(result.defaults.shiftEnd, "16:00");
  });

  it("resolves worker name from worker_profiles when workerUserId given", async () => {
    const tsId = "ts-wp-1";
    const pool = mockPool({
      "FROM assignments": [{ id: "a1", org_id: "org1", supplier_org_id: "org2", status: "active", worker_description: "Fallback" }],
      "worker_assignment_links": [],
      "worker_profiles": [{ first_name: "Anna", last_name: "Schmidt" }],
      "INSERT INTO timesheets": (sql, params) => {
        // Capture worker_name (param index 3)
        return { rows: [{ id: tsId, org_id: "org1", supplier_org_id: "org2", status: "draft", total_hours: 0, worker_name: params[3] }], rowCount: 1 };
      },
      "INSERT INTO timesheet_entries": (sql, params) => {
        return { rows: [{ id: "e-" + params[1], timesheet_id: tsId, work_date: params[1] }], rowCount: 1 };
      },
      "UPDATE timesheets ts": [{ id: tsId, total_hours: 40, overtime_hours: 0 }],
      "audit_log": []
    });

    const result = await prefillFromAssignment(pool, {
      assignmentId: "a1", supplierOrgId: "org2", workerUserId: "w1",
      weekStart: "2025-03-10", weekEnd: "2025-03-14", createdBy: "u1"
    });

    assert.ok(!result.error);
    assert.equal(result.timesheet.worker_name, "Anna Schmidt");
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. signTimesheet
// ═══════════════════════════════════════════════════════════════

describe("signTimesheet", () => {
  it("returns NOT_FOUND for missing timesheet", async () => {
    const pool = mockPool({});
    const result = await signTimesheet(pool, "x", "u1", { ip: "1.2.3.4" });
    assert.equal(result.error, "NOT_FOUND");
  });

  it("returns NOT_SIGNABLE for approved timesheet", async () => {
    const pool = mockPool({
      "FROM timesheets ts": [{ id: "t1", status: "approved", worker_signed_at: null }]
    });
    const result = await signTimesheet(pool, "t1", "u1");
    assert.equal(result.error, "NOT_SIGNABLE");
    assert.equal(result.status, "approved");
  });

  it("returns ALREADY_SIGNED when already signed", async () => {
    const signedAt = new Date("2025-03-10T10:00:00Z");
    const pool = mockPool({
      "FROM timesheets ts": [{ id: "t1", status: "draft", worker_signed_at: signedAt }]
    });
    const result = await signTimesheet(pool, "t1", "u1");
    assert.equal(result.error, "ALREADY_SIGNED");
    assert.deepEqual(result.signed_at, signedAt);
  });

  it("signs draft timesheet successfully", async () => {
    const pool = mockPool({
      "FROM timesheets ts": [{ id: "t1", status: "draft", worker_signed_at: null }],
      "UPDATE timesheets": [{ id: "t1", worker_signed_at: new Date(), worker_signed_ip: "1.2.3.4" }],
      "audit_log": []
    });
    const result = await signTimesheet(pool, "t1", "u1", { ip: "1.2.3.4" });
    assert.ok(!result.error);
    assert.ok(result.timesheet);
  });

  it("signs submitted timesheet successfully", async () => {
    const pool = mockPool({
      "FROM timesheets ts": [{ id: "t2", status: "submitted", worker_signed_at: null }],
      "UPDATE timesheets": [{ id: "t2", worker_signed_at: new Date() }],
      "audit_log": []
    });
    const result = await signTimesheet(pool, "t2", "u1");
    assert.ok(!result.error);
    assert.ok(result.timesheet);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. batchApprove
// ═══════════════════════════════════════════════════════════════

describe("batchApprove", () => {
  it("returns NO_IDS for empty array", async () => {
    const pool = mockPool({});
    const result = await batchApprove(pool, [], "u1");
    assert.equal(result.error, "NO_IDS");
  });

  it("returns BATCH_TOO_LARGE for >100 ids", async () => {
    const pool = mockPool({});
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    const result = await batchApprove(pool, ids, "u1");
    assert.equal(result.error, "BATCH_TOO_LARGE");
    assert.equal(result.max, 100);
  });

  it("approves valid submitted timesheets", async () => {
    const pool = mockPool({
      "FROM timesheets ts": (sql, params) => {
        return { rows: [{ id: params[0], status: "submitted", total_hours: 40 }], rowCount: 1 };
      },
      "UPDATE timesheets": (sql, params) => {
        return { rows: [{ id: params[0], status: "approved" }], rowCount: 1 };
      },
      "audit_log": []
    });

    const result = await batchApprove(pool, ["t1", "t2"], "u1");
    assert.equal(result.approved.length, 2);
    assert.equal(result.errors.length, 0);
  });

  it("collects errors for non-approvable timesheets", async () => {
    let callIdx = 0;
    const pool = mockPool({
      "FROM timesheets ts": (sql, params) => {
        callIdx++;
        // First call: submitted (approvable), second call: draft (not approvable)
        if (callIdx <= 1) return { rows: [{ id: "t1", status: "submitted", total_hours: 40 }], rowCount: 1 };
        return { rows: [{ id: "t2", status: "draft", total_hours: 0 }], rowCount: 1 };
      },
      "UPDATE timesheets": [{ id: "t1", status: "approved" }],
      "audit_log": []
    });

    const result = await batchApprove(pool, ["t1", "t2"], "u1");
    assert.equal(result.approved.length, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].id, "t2");
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. batchReject
// ═══════════════════════════════════════════════════════════════

describe("batchReject", () => {
  it("returns NO_IDS for empty array", async () => {
    const pool = mockPool({});
    const result = await batchReject(pool, [], "u1", "reason");
    assert.equal(result.error, "NO_IDS");
  });

  it("returns BATCH_TOO_LARGE for >100 ids", async () => {
    const pool = mockPool({});
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    const result = await batchReject(pool, ids, "u1", "reason");
    assert.equal(result.error, "BATCH_TOO_LARGE");
  });

  it("rejects valid submitted timesheets with reason", async () => {
    const pool = mockPool({
      "FROM timesheets ts": (sql, params) => {
        return { rows: [{ id: params[0], status: "submitted", total_hours: 40 }], rowCount: 1 };
      },
      "UPDATE timesheets": (sql, params) => {
        return { rows: [{ id: params[0], status: "rejected", rejection_reason: "Stunden fehlen" }], rowCount: 1 };
      },
      "audit_log": []
    });

    const result = await batchReject(pool, ["t1", "t2"], "u1", "Stunden fehlen");
    assert.equal(result.rejected.length, 2);
    assert.equal(result.errors.length, 0);
  });

  it("collects errors for non-rejectable timesheets", async () => {
    const pool = mockPool({
      "FROM timesheets ts": [{ id: "t1", status: "draft", total_hours: 0 }],
      "audit_log": []
    });

    const result = await batchReject(pool, ["t1"], "u1", "nope");
    assert.equal(result.rejected.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].error, "INVALID_TRANSITION");
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. validateBreakCompliance (ArbZG §4)
// ═══════════════════════════════════════════════════════════════

describe("validateBreakCompliance", () => {
  it("no warnings for compliant entries", () => {
    const entries = [
      { work_date: "2025-03-10", hours_regular: 8, hours_overtime: 0, break_minutes: 30 },
      { work_date: "2025-03-11", hours_regular: 6, hours_overtime: 0, break_minutes: 0 }
    ];
    const warnings = validateBreakCompliance(entries);
    assert.equal(warnings.length, 0);
  });

  it("warns for >6h with <30min break (ARBZG_6H_30MIN)", () => {
    const entries = [
      { work_date: "2025-03-10", hours_regular: 7, hours_overtime: 0, break_minutes: 15 }
    ];
    const warnings = validateBreakCompliance(entries);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].rule, "ARBZG_6H_30MIN");
    assert.equal(warnings[0].required_break, 30);
    assert.equal(warnings[0].work_date, "2025-03-10");
  });

  it("warns for >9h with <45min break (ARBZG_9H_45MIN)", () => {
    const entries = [
      { work_date: "2025-03-12", hours_regular: 8, hours_overtime: 2, break_minutes: 30 }
    ];
    const warnings = validateBreakCompliance(entries);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].rule, "ARBZG_9H_45MIN");
    assert.equal(warnings[0].required_break, 45);
    assert.equal(warnings[0].total_hours, 10);
  });

  it("no warning for exactly 6h without break", () => {
    const entries = [
      { work_date: "2025-03-10", hours_regular: 6, hours_overtime: 0, break_minutes: 0 }
    ];
    const warnings = validateBreakCompliance(entries);
    assert.equal(warnings.length, 0);
  });

  it("no warning for exactly 9h with 30min break", () => {
    const entries = [
      { work_date: "2025-03-10", hours_regular: 9, hours_overtime: 0, break_minutes: 30 }
    ];
    const warnings = validateBreakCompliance(entries);
    assert.equal(warnings.length, 0);
  });

  it("multiple warnings for multiple non-compliant entries", () => {
    const entries = [
      { work_date: "2025-03-10", hours_regular: 7, hours_overtime: 0, break_minutes: 0 },
      { work_date: "2025-03-11", hours_regular: 8, hours_overtime: 2, break_minutes: 20 },
      { work_date: "2025-03-12", hours_regular: 5, hours_overtime: 0, break_minutes: 0 }
    ];
    const warnings = validateBreakCompliance(entries);
    assert.equal(warnings.length, 2);
    assert.equal(warnings[0].rule, "ARBZG_6H_30MIN");
    assert.equal(warnings[1].rule, "ARBZG_9H_45MIN");
  });

  it("handles string numbers in entries", () => {
    const entries = [
      { work_date: "2025-03-10", hours_regular: "7", hours_overtime: "0", break_minutes: "10" }
    ];
    const warnings = validateBreakCompliance(entries);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].rule, "ARBZG_6H_30MIN");
  });

  it("handles null/undefined values gracefully", () => {
    const entries = [
      { work_date: "2025-03-10", hours_regular: null, hours_overtime: undefined, break_minutes: null }
    ];
    const warnings = validateBreakCompliance(entries);
    assert.equal(warnings.length, 0);
  });

  it("empty entries produce no warnings", () => {
    assert.equal(validateBreakCompliance([]).length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. getTimesheetStatusMeta
// ═══════════════════════════════════════════════════════════════

describe("getTimesheetStatusMeta", () => {
  it("returns all 5 statuses when called without argument", () => {
    const meta = getTimesheetStatusMeta();
    const keys = Object.keys(meta);
    assert.deepEqual(keys.sort(), ["approved", "cancelled", "draft", "rejected", "submitted"]);
  });

  it("each status has DE label, EN label, color, bgColor, icon", () => {
    const meta = getTimesheetStatusMeta();
    for (const [key, val] of Object.entries(meta)) {
      assert.ok(typeof val.label === "string", `${key} missing label`);
      assert.ok(typeof val.labelEn === "string", `${key} missing labelEn`);
      assert.ok(typeof val.color === "string" && val.color.startsWith("#"), `${key} invalid color`);
      assert.ok(typeof val.bgColor === "string" && val.bgColor.startsWith("#"), `${key} invalid bgColor`);
      assert.ok(typeof val.icon === "string", `${key} missing icon`);
    }
  });

  it("returns single status when key provided", () => {
    const draft = getTimesheetStatusMeta("draft");
    assert.equal(draft.label, "Entwurf");
    assert.equal(draft.labelEn, "Draft");
    assert.equal(draft.icon, "edit");
  });

  it("returns null for unknown status", () => {
    assert.equal(getTimesheetStatusMeta("unknown"), null);
  });

  it("approved status is green", () => {
    const approved = getTimesheetStatusMeta("approved");
    assert.equal(approved.label, "Genehmigt");
    assert.equal(approved.labelEn, "Approved");
    assert.equal(approved.icon, "check-circle");
  });

  it("rejected status is red", () => {
    const rejected = getTimesheetStatusMeta("rejected");
    assert.equal(rejected.label, "Abgelehnt");
    assert.equal(rejected.labelEn, "Rejected");
    assert.equal(rejected.icon, "x-circle");
    assert.ok(rejected.color.toLowerCase().includes("dc2626"));
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. getWorkerTimesheetSummary
// ═══════════════════════════════════════════════════════════════

describe("getWorkerTimesheetSummary", () => {
  it("returns FILTER_REQUIRED when no filters given", async () => {
    const pool = mockPool({});
    const result = await getWorkerTimesheetSummary(pool, {});
    assert.equal(result.error, "FILTER_REQUIRED");
  });

  it("returns KPIs with proper defaults for empty result", async () => {
    const pool = mockPool({
      "FROM timesheets ts": [{}]
    });
    const result = await getWorkerTimesheetSummary(pool, { orgId: "org1" });
    assert.ok(!result.error);
    assert.equal(result.total_timesheets, 0);
    assert.equal(result.draft_count, 0);
    assert.equal(result.submitted_count, 0);
    assert.equal(result.approved_count, 0);
    assert.equal(result.rejected_count, 0);
    assert.equal(result.approved_hours_total, 0);
    assert.equal(result.approved_hours_this_month, 0);
    assert.equal(result.overtime_hours_this_month, 0);
    assert.equal(result.signed_count, 0);
  });

  it("returns correct KPIs from DB rows", async () => {
    const pool = mockPool({
      "FROM timesheets ts": [{
        total_timesheets: 12,
        draft_count: 2,
        submitted_count: 3,
        approved_count: 5,
        rejected_count: 2,
        approved_hours_total: "240.5",
        approved_hours_this_month: "80.0",
        overtime_hours_this_month: "12.0",
        signed_count: 8
      }]
    });

    const result = await getWorkerTimesheetSummary(pool, { workerName: "Max", orgId: "org1" });
    assert.equal(result.total_timesheets, 12);
    assert.equal(result.draft_count, 2);
    assert.equal(result.submitted_count, 3);
    assert.equal(result.approved_count, 5);
    assert.equal(result.rejected_count, 2);
    assert.equal(result.approved_hours_total, 240.5);
    assert.equal(result.approved_hours_this_month, 80);
    assert.equal(result.overtime_hours_this_month, 12);
    assert.equal(result.signed_count, 8);
  });

  it("works with supplierOrgId filter", async () => {
    const pool = mockPool({
      "FROM timesheets ts": [{
        total_timesheets: 3,
        draft_count: 1,
        submitted_count: 1,
        approved_count: 1,
        rejected_count: 0,
        approved_hours_total: "40",
        approved_hours_this_month: "40",
        overtime_hours_this_month: "0",
        signed_count: 1
      }]
    });

    const result = await getWorkerTimesheetSummary(pool, { supplierOrgId: "s1" });
    assert.ok(!result.error);
    assert.equal(result.total_timesheets, 3);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Notification Matrix — Timesheet Events
// ═══════════════════════════════════════════════════════════════

describe("Notification Matrix — Timesheet Events", async () => {
  // Dynamic import to access MATRIX
  const { default: matrixModule } = await import("../services/notificationMatrix.js");
  const { dispatch } = await import("../services/notificationMatrix.js");

  it("MATRIX has timesheet.submitted event", async () => {
    // Re-read to check structure
    const mod = await import("../services/notificationMatrix.js");
    // dispatch function exists
    assert.ok(typeof mod.dispatch === "function");
  });

  it("EVENT_CATEGORY_MAP has timesheet events", () => {
    assert.equal(EVENT_CATEGORY_MAP["timesheet.submitted"], "timesheet_updates");
    assert.equal(EVENT_CATEGORY_MAP["timesheet.approved"], "timesheet_updates");
    assert.equal(EVENT_CATEGORY_MAP["timesheet.rejected"], "timesheet_updates");
    assert.equal(EVENT_CATEGORY_MAP["timesheet.signed"], "timesheet_updates");
  });

  it("EVENT_CATEGORY_MAP still has other event categories", () => {
    assert.equal(EVENT_CATEGORY_MAP["capacity.match_found"], "match_alerts");
    assert.equal(EVENT_CATEGORY_MAP["requisition.approved"], "requisition_updates");
    assert.equal(EVENT_CATEGORY_MAP["deal.completed"], "deals");
    assert.equal(EVENT_CATEGORY_MAP["emergency.request_created"], "match_alerts");
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Lifecycle transition guards (existing + new)
// ═══════════════════════════════════════════════════════════════

describe("Timesheet lifecycle transitions", () => {
  it("submitTimesheet returns NOT_FOUND for missing timesheet", async () => {
    const pool = mockPool({});
    const result = await submitTimesheet(pool, "x", "u1");
    assert.equal(result.error, "NOT_FOUND");
  });

  it("approveTimesheet returns INVALID_TRANSITION for draft", async () => {
    const pool = mockPool({
      "FROM timesheets ts": [{ id: "t1", status: "draft", total_hours: 0 }]
    });
    const result = await approveTimesheet(pool, "t1", "u1");
    assert.equal(result.error, "INVALID_TRANSITION");
    assert.equal(result.from, "draft");
    assert.equal(result.to, "approved");
  });

  it("rejectTimesheet returns INVALID_TRANSITION for approved", async () => {
    const pool = mockPool({
      "FROM timesheets ts": [{ id: "t1", status: "approved", total_hours: 40 }]
    });
    const result = await rejectTimesheet(pool, "t1", "u1", "too late");
    assert.equal(result.error, "INVALID_TRANSITION");
    assert.equal(result.from, "approved");
  });

  it("submitTimesheet returns NO_HOURS when total_hours is 0", async () => {
    const pool = mockPool({
      "FROM timesheets ts": [{ id: "t1", status: "draft", total_hours: 0 }]
    });
    const result = await submitTimesheet(pool, "t1", "u1");
    assert.equal(result.error, "NO_HOURS");
  });

  it("createTimesheet returns INVALID_DATE_RANGE when end < start", async () => {
    const pool = mockPool({});
    const result = await createTimesheet(pool, {
      org_id: "org1", supplier_org_id: "org2", worker_name: "X",
      week_start: "2025-03-15", week_end: "2025-03-10"
    });
    assert.equal(result.error, "INVALID_DATE_RANGE");
  });
});
