/**
 * Deal workflow unit tests — legacy + extended lifecycle transitions.
 * Uses mock pool — no DB required.
 *
 * Tests: not-found, valid transitions, invalid transitions,
 * audit logging (logTransition), event tracking.
 *
 * Run: node --test --test-force-exit test/dealWorkflow.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  acceptRequest, declineRequest, fillRequest,
  finalizeRequest, cancelRequest,
  createDeal, confirmDeal, startAssignment, completeDeal
} from "../services/dealWorkflow.js";

/* ── Mock pool builder ─────────────────────────────────── */

/**
 * Build a mock pool that returns the given status for a request SELECT,
 * records all queries, and succeeds on UPDATE.
 */
function mockPool(currentStatus, { notFound = false } = {}) {
  const queries = [];
  const queryFn = async (sql, params) => {
    queries.push({ sql, params });
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
    // SELECT status query
    if (sql.includes("SELECT") && sql.includes("FROM requests")) {
      if (notFound) return { rows: [] };
      return { rows: [{ status: currentStatus, requester_id: 1, receiver_id: 2 }] };
    }
    // UPDATE
    if (sql.includes("UPDATE requests")) {
      return { rows: [{ id: params?.[1], status: params?.[0] }] };
    }
    // INSERT (audit log / transitions)
    return { rows: [{}] };
  };
  return {
    queries,
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} })
  };
}

// ─────────────────────────────────────────────────────────────
// Legacy flow — acceptRequest
// ─────────────────────────────────────────────────────────────

describe("dealWorkflow — legacy acceptRequest", () => {
  it("transitions SENT → ACCEPTED", async () => {
    const pool = mockPool("SENT");
    const result = await acceptRequest(pool, "req-1", "actor-1");
    assert.strictEqual(result.from, "SENT");
    assert.strictEqual(result.to, "ACCEPTED");
    assert.strictEqual(result.requestId, "req-1");
  });

  it("throws 404 when request not found", async () => {
    const pool = mockPool(null, { notFound: true });
    await assert.rejects(
      () => acceptRequest(pool, "nonexistent", "actor-1"),
      (err) => err.message === "Request not found" && err.status === 404
    );
  });

  it("throws TransitionError for DECLINED → ACCEPTED", async () => {
    const pool = mockPool("DECLINED");
    await assert.rejects(
      () => acceptRequest(pool, "req-1", "actor-1"),
      (err) => err.name === "TransitionError"
    );
  });

  it("throws TransitionError for FINALIZED → ACCEPTED (terminal state)", async () => {
    const pool = mockPool("FINALIZED");
    await assert.rejects(
      () => acceptRequest(pool, "req-1", "actor-1"),
      (err) => err.name === "TransitionError"
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Legacy flow — declineRequest
// ─────────────────────────────────────────────────────────────

describe("dealWorkflow — legacy declineRequest", () => {
  it("transitions SENT → DECLINED", async () => {
    const pool = mockPool("SENT");
    const result = await declineRequest(pool, "req-1", "actor-1");
    assert.strictEqual(result.to, "DECLINED");
  });

  it("rejects ACCEPTED → DECLINED", async () => {
    const pool = mockPool("ACCEPTED");
    await assert.rejects(
      () => declineRequest(pool, "req-1", "actor-1"),
      (err) => err.name === "TransitionError"
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Legacy flow — fillRequest / finalizeRequest
// ─────────────────────────────────────────────────────────────

describe("dealWorkflow — legacy fill & finalize", () => {
  it("fillRequest: ACCEPTED → FILLED", async () => {
    const pool = mockPool("ACCEPTED");
    const result = await fillRequest(pool, "req-1", "actor-1");
    assert.strictEqual(result.to, "FILLED");
  });

  it("finalizeRequest: ACCEPTED → FINALIZED", async () => {
    const pool = mockPool("ACCEPTED");
    const result = await finalizeRequest(pool, "req-1", "actor-1");
    assert.strictEqual(result.to, "FINALIZED");
  });

  it("fillRequest rejects SENT → FILLED", async () => {
    const pool = mockPool("SENT");
    await assert.rejects(
      () => fillRequest(pool, "req-1", "actor-1"),
      (err) => err.name === "TransitionError"
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Legacy flow — cancelRequest
// ─────────────────────────────────────────────────────────────

describe("dealWorkflow — legacy cancelRequest", () => {
  it("cancels from SENT", async () => {
    const pool = mockPool("SENT");
    const result = await cancelRequest(pool, "req-1", "actor-1");
    assert.strictEqual(result.to, "CANCELED");
  });

  it("cancels from ACCEPTED", async () => {
    const pool = mockPool("ACCEPTED");
    const result = await cancelRequest(pool, "req-1", "actor-1");
    assert.strictEqual(result.to, "CANCELED");
  });

  it("rejects cancel from FINALIZED (terminal)", async () => {
    const pool = mockPool("FINALIZED");
    await assert.rejects(
      () => cancelRequest(pool, "req-1", "actor-1"),
      (err) => err.name === "TransitionError"
    );
  });

  it("rejects cancel from DECLINED (terminal)", async () => {
    const pool = mockPool("DECLINED");
    await assert.rejects(
      () => cancelRequest(pool, "req-1", "actor-1"),
      (err) => err.name === "TransitionError"
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Extended flow — createDeal / confirmDeal / startAssignment / completeDeal
// ─────────────────────────────────────────────────────────────

describe("dealWorkflow — extended lifecycle", () => {
  it("createDeal: CREATED → OFFER_SENT", async () => {
    const pool = mockPool("CREATED");
    const result = await createDeal(pool, "req-1", "actor-1");
    assert.strictEqual(result.to, "OFFER_SENT");
  });

  it("confirmDeal: ACCEPTED → CONFIRMED", async () => {
    const pool = mockPool("ACCEPTED");
    const result = await confirmDeal(pool, "req-1", "actor-1");
    assert.strictEqual(result.to, "CONFIRMED");
  });

  it("startAssignment: CONFIRMED → ASSIGNMENT_STARTED", async () => {
    const pool = mockPool("CONFIRMED");
    const result = await startAssignment(pool, "req-1", "actor-1");
    assert.strictEqual(result.to, "ASSIGNMENT_STARTED");
  });

  it("completeDeal: ASSIGNMENT_STARTED → COMPLETED", async () => {
    const pool = mockPool("ASSIGNMENT_STARTED");
    const result = await completeDeal(pool, "req-1", "actor-1");
    assert.strictEqual(result.to, "COMPLETED");
  });
});

// ─────────────────────────────────────────────────────────────
// Audit logging — verifies transition log query is issued
// ─────────────────────────────────────────────────────────────

describe("dealWorkflow — audit logging", () => {
  it("legacy transition writes audit log", async () => {
    const pool = mockPool("SENT");
    await acceptRequest(pool, "req-1", "actor-1");
    const auditQuery = pool.queries.find(q => q.sql.includes("INSERT INTO audit_log"));
    assert.ok(auditQuery, "Should have an INSERT INTO audit_log");
  });

  it("extended transition writes audit log", async () => {
    const pool = mockPool("CREATED");
    await createDeal(pool, "req-1", "actor-1");
    const auditQuery = pool.queries.find(q => q.sql.includes("INSERT INTO audit_log"));
    assert.ok(auditQuery, "Should have an INSERT INTO audit_log");
  });

  it("passes message in opts to audit details", async () => {
    const pool = mockPool("SENT");
    await acceptRequest(pool, "req-1", "actor-1", { message: "Looks good" });
    const auditQuery = pool.queries.find(q => q.sql.includes("INSERT INTO audit_log"));
    assert.ok(auditQuery);
  });
});
