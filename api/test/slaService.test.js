/**
 * SLA Service unit tests.
 * Covers setSla, recordMatchingAttempt, recordNotificationSent,
 * markSlaMet, recordSlaStarted, slaScan, markSlaResolved,
 * notdienstEscalationScan.
 *
 * Run: node --test --test-force-exit test/slaService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/slaService.js";

// ── Mock helpers ──────────────────────────────────────────────

function returnPool(rows = []) {
  return { query: async () => ({ rows }) };
}

function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) return { rows: [], rowCount: 0 };
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

/** Mock pool with connect() for scan functions that use client transactions */
function transactionPool(clientResponses) {
  let idx = 0;
  const client = {
    query: async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (idx >= clientResponses.length) return { rows: [], rowCount: 0 };
      const resp = clientResponses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    },
    release: () => {}
  };
  return {
    connect: async () => client,
    query: async () => ({ rows: [], rowCount: 0 })
  };
}

// ═══════════════════════════════════════════════════════════════
// setSla
// ═══════════════════════════════════════════════════════════════

describe("slaService — setSla", () => {
  it("sets SLA on own request", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1", created_at: "2026-01-01T00:00:00Z", requester_id: "u1" }] },
      { rows: [] },  // UPDATE
      { rows: [] }   // INSERT sla_events
    );
    const result = await svc.setSla(pool, "r1", 60, "u1");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sla_minutes, 60);
    assert.ok(result.sla_respond_by instanceof Date);
  });

  it("returns NOT_FOUND when request missing", async () => {
    const result = await svc.setSla(returnPool([]), "r99", 60, "u1");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "NOT_FOUND");
  });

  it("returns FORBIDDEN when actor is not requester", async () => {
    const pool = returnPool([{ id: "r1", created_at: "2026-01-01T00:00:00Z", requester_id: "u1" }]);
    const result = await svc.setSla(pool, "r1", 60, "u2");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "FORBIDDEN");
  });
});

// ═══════════════════════════════════════════════════════════════
// recordMatchingAttempt / recordNotificationSent
// ═══════════════════════════════════════════════════════════════

describe("slaService — recordMatchingAttempt", () => {
  it("records first matching attempt", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1" }], rowCount: 1 },  // UPDATE
      { rows: [] }                              // INSERT sla_events
    );
    const result = await svc.recordMatchingAttempt(pool, "r1", { source: "auto" });
    assert.strictEqual(result.recorded, true);
  });

  it("returns false when already recorded", async () => {
    const pool = sequencePool({ rows: [], rowCount: 0 });
    const result = await svc.recordMatchingAttempt(pool, "r1");
    assert.strictEqual(result.recorded, false);
  });
});

describe("slaService — recordNotificationSent", () => {
  it("records first notification", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1" }], rowCount: 1 },
      { rows: [] }
    );
    assert.strictEqual((await svc.recordNotificationSent(pool, "r1")).recorded, true);
  });

  it("returns false when already sent", async () => {
    assert.strictEqual((await svc.recordNotificationSent(sequencePool({ rows: [], rowCount: 0 }), "r1")).recorded, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// markSlaMet / recordSlaStarted
// ═══════════════════════════════════════════════════════════════

describe("slaService — markSlaMet", () => {
  it("marks RUNNING SLA as MET", async () => {
    const pool = sequencePool(
      { rows: [{ id: "r1" }], rowCount: 1 },
      { rows: [] }
    );
    assert.strictEqual((await svc.markSlaMet(pool, "r1")).updated, true);
  });

  it("returns false when not RUNNING", async () => {
    assert.strictEqual((await svc.markSlaMet(sequencePool({ rows: [], rowCount: 0 }), "r1")).updated, false);
  });
});

describe("slaService — recordSlaStarted", () => {
  it("inserts SLA_STARTED event", async () => {
    const pool = sequencePool({ rows: [] });
    await svc.recordSlaStarted(pool, "r1");  // no return value, just verify no throw
  });
});

// ═══════════════════════════════════════════════════════════════
// slaScan
// ═══════════════════════════════════════════════════════════════

describe("slaService — slaScan", () => {
  it("breaches overdue SLA requests", async () => {
    const pool = transactionPool([
      { rows: [{ id: "r1" }] },              // SELECT breachable
      { rows: [{ sla_status: "OK" }] },      // FOR UPDATE
      { rows: [] },                            // UPDATE breached
      { rows: [] },                            // INSERT SLA_BREACHED
      { rows: [] }                             // INSERT escalated
    ]);
    const result = await svc.slaScan(pool, 10);
    assert.strictEqual(result.breached, 1);
  });

  it("skips already-breached rows", async () => {
    const pool = transactionPool([
      { rows: [{ id: "r1" }] },
      { rows: [{ sla_status: "BREACHED" }] }  // already breached → ROLLBACK
    ]);
    const result = await svc.slaScan(pool);
    assert.strictEqual(result.breached, 0);
  });

  it("returns 0 when no overdue requests", async () => {
    const pool = transactionPool([{ rows: [] }]);
    assert.strictEqual((await svc.slaScan(pool)).breached, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// markSlaResolved
// ═══════════════════════════════════════════════════════════════

describe("slaService — markSlaResolved", () => {
  it("resolves BREACHED SLA", async () => {
    const pool = sequencePool(
      { rows: [{ sla_status: "BREACHED" }] },
      { rows: [] },  // UPDATE
      { rows: [] }   // INSERT sla_events
    );
    await svc.markSlaResolved(pool, "r1");  // void return, verify no throw
  });

  it("does nothing when not BREACHED", async () => {
    const pool = returnPool([{ sla_status: "MET" }]);
    await svc.markSlaResolved(pool, "r1");  // early return
  });

  it("does nothing when request not found", async () => {
    await svc.markSlaResolved(returnPool([]), "r99");
  });
});

// ═══════════════════════════════════════════════════════════════
// notdienstEscalationScan
// ═══════════════════════════════════════════════════════════════

describe("slaService — notdienstEscalationScan", () => {
  it("escalates stage 0 → 1 after 10 min", async () => {
    const oldDate = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const pool = transactionPool([
      { rows: [{ id: "r1", created_at: oldDate, escalation_level: 0 }] },
      { rows: [{ id: "r1" }], rowCount: 1 },  // UPDATE
      { rows: [] }                              // INSERT sla_events
    ]);
    const result = await svc.notdienstEscalationScan(pool, 10);
    assert.strictEqual(result.escalated, 1);
  });

  it("escalates stage 1 → 2 after 20 min", async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const pool = transactionPool([
      { rows: [{ id: "r1", created_at: oldDate, escalation_level: 1 }] },
      { rows: [{ id: "r1" }], rowCount: 1 },
      { rows: [] }
    ]);
    const result = await svc.notdienstEscalationScan(pool, 10);
    assert.strictEqual(result.escalated, 1);
  });

  it("skips already at stage 2", async () => {
    const oldDate = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const pool = transactionPool([
      { rows: [{ id: "r1", created_at: oldDate, escalation_level: 2 }] }
    ]);
    assert.strictEqual((await svc.notdienstEscalationScan(pool)).escalated, 0);
  });

  it("returns 0 when no candidates", async () => {
    const pool = transactionPool([{ rows: [] }]);
    assert.strictEqual((await svc.notdienstEscalationScan(pool)).escalated, 0);
  });
});
