import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  confirmAssignment,
  getWorkerAssignments,
  getWorkerSchedule,
  reportUnavailable
} from "../services/workerService.js";

function sequencePool(...responses) {
  let index = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      return responses[index++] || { rows: [], rowCount: 0 };
    }
  };
}

describe("workerService assignment lifecycle guards", () => {
  it("keeps inactive links out of default worker assignment queries but allows explicit history loading", async () => {
    const activeOnlyPool = sequencePool({ rows: [] });
    await getWorkerAssignments(activeOnlyPool, "worker-1");
    assert.match(activeOnlyPool.calls[0].sql, /wal\.is_active = TRUE/);

    const includeInactivePool = sequencePool({ rows: [] });
    await getWorkerAssignments(includeInactivePool, "worker-1", { includeInactive: true });
    assert.doesNotMatch(includeInactivePool.calls[0].sql, /wal\.is_active = TRUE/);
  });

  it("filters worker schedules through the canonical current lifecycle predicate", async () => {
    const pool = sequencePool({ rows: [] });
    await getWorkerSchedule(pool, "worker-1");
    assert.match(pool.calls[0].sql, /active','ends_today/);
  });

  it("blocks confirming assignments that are already in history", async () => {
    const pool = sequencePool({
      rows: [{
        id: "link-1",
        assignment_id: "asg-1",
        worker_confirmation_status: "pending_confirmation",
        assignment_is_current: false,
        assignment_lifecycle_state: "expired"
      }]
    });

    const result = await confirmAssignment(pool, "link-1", "worker-1");
    assert.deepStrictEqual(result, {
      error: "ASSIGNMENT_NOT_CURRENT",
      lifecycle_state: "expired"
    });
    assert.equal(pool.calls.length, 1);
  });

  it("blocks unavailable reports for assignments that are already archived/history", async () => {
    const pool = sequencePool({
      rows: [{
        id: "link-2",
        assignment_id: "asg-2",
        worker_confirmation_status: "worker_confirmed",
        assignment_is_current: false,
        assignment_lifecycle_state: "completed"
      }]
    });

    const result = await reportUnavailable(pool, "link-2", "worker-1", {
      unavailableFrom: "2026-04-15",
      reason: "krank"
    });
    assert.deepStrictEqual(result, {
      error: "ASSIGNMENT_NOT_CURRENT",
      lifecycle_state: "completed"
    });
    assert.equal(pool.calls.length, 1);
  });
});
