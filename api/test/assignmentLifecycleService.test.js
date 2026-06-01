import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decorateAssignmentLifecycle,
  getAssignmentEffectiveEndDate,
  getAssignmentLifecycleBucket,
  getAssignmentLifecycleState,
  normalizeAssignmentLifecycleBucket
} from "../services/assignmentLifecycleService.js";

describe("assignmentLifecycleService", () => {
  it("keeps assignments ending today in the active bucket", () => {
    const record = {
      status: "active",
      planned_end_date: "2026-04-15",
      is_active: true
    };

    assert.equal(getAssignmentLifecycleState(record, "2026-04-15"), "ends_today");
    assert.equal(getAssignmentLifecycleBucket(record, "2026-04-15"), "active");

    const decorated = decorateAssignmentLifecycle(record, "2026-04-15");
    assert.equal(decorated.assignment_is_current, true);
    assert.equal(decorated.assignment_ends_today, true);
    assert.equal(decorated.assignment_is_history, false);
  });

  it("moves assignments ending yesterday to history from the next day onward", () => {
    const record = {
      status: "active",
      planned_end_date: "2026-04-14",
      is_active: true
    };

    assert.equal(getAssignmentLifecycleState(record, "2026-04-15"), "expired");
    assert.equal(getAssignmentLifecycleBucket(record, "2026-04-15"), "history");

    const decorated = decorateAssignmentLifecycle(record, "2026-04-15");
    assert.equal(decorated.assignment_is_current, false);
    assert.equal(decorated.assignment_is_expired, true);
    assert.equal(decorated.assignment_is_history, true);
  });

  it("prefers link end dates over assignment-level planned end dates", () => {
    const record = {
      assignment_status: "active",
      end_date: "2026-04-20",
      planned_end_date: "2026-04-10"
    };

    assert.equal(getAssignmentEffectiveEndDate(record), "2026-04-20");
  });

  it("maps completed, cancelled, and inactive links to history states", () => {
    assert.equal(getAssignmentLifecycleState({ status: "completed" }, "2026-04-15"), "completed");
    assert.equal(getAssignmentLifecycleState({ status: "cancelled" }, "2026-04-15"), "cancelled");
    assert.equal(
      getAssignmentLifecycleState({ status: "active", is_active: false }, "2026-04-15"),
      "archived"
    );
  });

  it("normalizes only supported lifecycle bucket filters", () => {
    assert.equal(normalizeAssignmentLifecycleBucket("ACTIVE"), "active");
    assert.equal(normalizeAssignmentLifecycleBucket("history"), "history");
    assert.equal(normalizeAssignmentLifecycleBucket("all"), "all");
    assert.equal(normalizeAssignmentLifecycleBucket("invalid", "active"), "active");
  });
});
