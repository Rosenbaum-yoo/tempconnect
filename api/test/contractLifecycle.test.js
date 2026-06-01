/**
 * Contract Lifecycle Tests
 *
 * Tests createContract, activateContract, terminateContract from contractService.js.
 * Mock pool controls all DB responses — tests the full service logic including audit logging.
 *
 * Status model:
 *   draft → active → terminated
 *   draft → terminated (shortcut)
 *   active → expired (via cron batch only, not tested here — separate job)
 *
 * Guard behavior:
 *   - createContract:    no status guard, defaults to 'draft'
 *   - activateContract:  NO guard — delegates to updateContract, can set active from ANY status
 *   - terminateContract: SQL guard — WHERE status IN ('draft','active')
 *
 * Query patterns per operation:
 *   createContract:    INSERT (1) + audit INSERT (2) = 2 queries
 *   activateContract:  UPDATE (1) + audit INSERT (2) = 2 queries (via updateContract)
 *   terminateContract: UPDATE (1) + [if success] audit INSERT (2) = 1–2 queries
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createContract,
  activateContract,
  terminateContract,
  updateContract
} from "../services/contractService.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_ID = "user-actor-001";
const CONTRACT_ID = "contract-abc-123";
const BUYER_ORG = "org-buyer-001";
const SUPPLIER_ORG = "org-supplier-002";

const DRAFT_CONTRACT = {
  id: CONTRACT_ID,
  buyer_org_id: BUYER_ORG,
  supplier_org_id: SUPPLIER_ORG,
  contract_type: "framework",
  title: "Rahmenvertrag Lagerhelfer Bayern",
  description: "Jährlicher Rahmenvertrag",
  status: "draft",
  terms_summary: null,
  file_ref: null,
  valid_from: "2026-04-01",
  valid_until: "2027-03-31",
  internal_notes: null,
  created_by: ACTOR_ID,
  created_at: "2026-03-13T10:00:00Z",
  updated_at: "2026-03-13T10:00:00Z"
};

const ACTIVE_CONTRACT = { ...DRAFT_CONTRACT, status: "active", updated_at: "2026-03-14T08:00:00Z" };
const TERMINATED_CONTRACT = {
  ...ACTIVE_CONTRACT,
  status: "terminated",
  terminated_by: ACTOR_ID,
  terminated_at: "2026-03-15T12:00:00Z",
  termination_reason: "Vertragsende auf Kundenwunsch",
  updated_at: "2026-03-15T12:00:00Z"
};
const EXPIRED_CONTRACT = { ...ACTIVE_CONTRACT, status: "expired" };

// ── Mock factory ──────────────────────────────────────────────────────────────

const TX_COMMANDS = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);

function isTxCommand(sql) {
  return typeof sql === "string" && TX_COMMANDS.has(sql.trim().toUpperCase());
}

function makeTxAwarePool(queryImpl) {
  const queries = [];
  const wrappedQuery = async (sql, params) => {
    if (isTxCommand(sql)) return { rows: [], rowCount: 0 };
    queries.push({ sql, params });
    return queryImpl(sql, params, queries.length);
  };
  return {
    query: wrappedQuery,
    connect: async () => ({
      query: wrappedQuery,
      release() {}
    }),
    queries
  };
}

function sequencePool(...responses) {
  let idx = 0;
  return makeTxAwarePool(async () => {
    if (idx >= responses.length) {
      throw new Error(`Unexpected pool.query call #${idx + 1} (only ${responses.length} configured)`);
    }
    const response = responses[idx++];
    if (response instanceof Error) throw response;
    return response;
  });
}

/** Audit INSERT acknowledgment. */
const AUDIT_OK = { rows: [], rowCount: 1 };

const CREATE_INPUT = {
  buyer_org_id: BUYER_ORG,
  supplier_org_id: SUPPLIER_ORG,
  contract_type: "framework",
  title: "Rahmenvertrag Lagerhelfer Bayern",
  description: "Jährlicher Rahmenvertrag",
  valid_from: "2026-04-01",
  valid_until: "2027-03-31",
  created_by: ACTOR_ID
};

// ═══════════════════════════════════════════════════════════════════════════════
// createContract
// ═══════════════════════════════════════════════════════════════════════════════

describe("createContract", () => {
  it("creates a contract in 'draft' status by default", async () => {
    const pool = sequencePool(
      { rows: [DRAFT_CONTRACT] },  // INSERT RETURNING *
      AUDIT_OK                     // audit log
    );
    const result = await createContract(pool, CREATE_INPUT);
    assert.strictEqual(result.id, CONTRACT_ID);
    assert.strictEqual(result.status, "draft");
    assert.strictEqual(result.buyer_org_id, BUYER_ORG);
    assert.strictEqual(result.supplier_org_id, SUPPLIER_ORG);
  });

  it("creates a contract with explicit 'active' status", async () => {
    const activeOnCreate = { ...DRAFT_CONTRACT, status: "active" };
    const pool = sequencePool(
      { rows: [activeOnCreate] },
      AUDIT_OK
    );
    const result = await createContract(pool, { ...CREATE_INPUT, status: "active" });
    assert.strictEqual(result.status, "active");
  });

  it("passes all fields to the INSERT query", async () => {
    const pool = sequencePool(
      { rows: [DRAFT_CONTRACT] },
      AUDIT_OK
    );
    await createContract(pool, CREATE_INPUT);
    const insertQuery = pool.queries[0];
    assert.ok(insertQuery.sql.includes("INSERT INTO contracts"));
    assert.strictEqual(insertQuery.params[0], BUYER_ORG);
    assert.strictEqual(insertQuery.params[1], SUPPLIER_ORG);
    assert.strictEqual(insertQuery.params[2], "framework");
    assert.strictEqual(insertQuery.params[3], "Rahmenvertrag Lagerhelfer Bayern");
  });

  it("writes audit log with contract.created action", async () => {
    const pool = sequencePool(
      { rows: [DRAFT_CONTRACT] },
      AUDIT_OK
    );
    await createContract(pool, CREATE_INPUT);
    assert.strictEqual(pool.queries.length, 2);
    const auditQuery = pool.queries[1];
    assert.ok(auditQuery.sql.includes("audit_log"));
    // action = 'contract.created', actor_id = ACTOR_ID
    assert.strictEqual(auditQuery.params[1], "contract.created");
    assert.strictEqual(auditQuery.params[0], ACTOR_ID);
  });

  it("defaults optional fields to null", async () => {
    const pool = sequencePool(
      { rows: [{ ...DRAFT_CONTRACT, description: null, terms_summary: null, file_ref: null }] },
      AUDIT_OK
    );
    const result = await createContract(pool, {
      buyer_org_id: BUYER_ORG,
      supplier_org_id: SUPPLIER_ORG,
      contract_type: "nda",
      title: "NDA",
      created_by: ACTOR_ID
    });
    assert.strictEqual(result.status, "draft");
    // Query params: description, terms_summary, file_ref should be null
    const params = pool.queries[0].params;
    assert.strictEqual(params[4], null); // description
    assert.strictEqual(params[5], "draft"); // default status
    assert.strictEqual(params[6], null); // terms_summary
    assert.strictEqual(params[7], null); // file_ref
  });

  it("propagates pool error on INSERT", async () => {
    const pool = makeTxAwarePool(async () => { throw new Error("unique_violation"); });
    await assert.rejects(
      () => createContract(pool, CREATE_INPUT),
      (err) => { assert.strictEqual(err.message, "unique_violation"); return true; }
    );
  });

  it("propagates pool error on audit write", async () => {
    let callCount = 0;
    const pool = makeTxAwarePool(async () => {
        callCount++;
        if (callCount === 1) return { rows: [DRAFT_CONTRACT] };
        throw new Error("audit_table_full");
    });
    await assert.rejects(
      () => createContract(pool, CREATE_INPUT),
      (err) => { assert.strictEqual(err.message, "audit_table_full"); return true; }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// activateContract
// ═══════════════════════════════════════════════════════════════════════════════

describe("activateContract", () => {
  it("activates a draft contract → status becomes 'active'", async () => {
    const pool = sequencePool(
      { rows: [ACTIVE_CONTRACT] },  // UPDATE RETURNING *
      AUDIT_OK                      // audit log
    );
    const result = await activateContract(pool, CONTRACT_ID, ACTOR_ID);
    assert.strictEqual(result.status, "active");
    assert.strictEqual(result.id, CONTRACT_ID);
  });

  it("sets status='active' via UPDATE query", async () => {
    const pool = sequencePool(
      { rows: [ACTIVE_CONTRACT] },
      AUDIT_OK
    );
    await activateContract(pool, CONTRACT_ID, ACTOR_ID);
    const updateQuery = pool.queries[0];
    assert.ok(updateQuery.sql.includes("UPDATE contracts SET"));
    assert.ok(updateQuery.sql.includes("status"));
  });

  it("writes audit log with contract.updated action", async () => {
    const pool = sequencePool(
      { rows: [ACTIVE_CONTRACT] },
      AUDIT_OK
    );
    await activateContract(pool, CONTRACT_ID, ACTOR_ID);
    assert.strictEqual(pool.queries.length, 2);
    const auditQuery = pool.queries[1];
    assert.ok(auditQuery.sql.includes("audit_log"));
    assert.strictEqual(auditQuery.params[1], "contract.updated");
  });

  it("returns null when contract not found", async () => {
    const pool = sequencePool({ rows: [] }); // no matching row
    const result = await activateContract(pool, "nonexistent", ACTOR_ID);
    assert.strictEqual(result, null);
    // No audit log written for missing contract
    assert.strictEqual(pool.queries.length, 1);
  });

  it("has NO status guard — can activate from 'terminated' (current behavior)", async () => {
    // IMPORTANT: activateContract delegates to updateContract which has no WHERE status check
    // This means a terminated contract CAN be re-activated via this service method.
    // The route layer has org-boundary checks but no status validation either.
    const reactivated = { ...TERMINATED_CONTRACT, status: "active" };
    const pool = sequencePool(
      { rows: [reactivated] },
      AUDIT_OK
    );
    const result = await activateContract(pool, CONTRACT_ID, ACTOR_ID);
    assert.strictEqual(result.status, "active");
  });

  it("has NO status guard — can activate from 'expired' (current behavior)", async () => {
    const reactivated = { ...EXPIRED_CONTRACT, status: "active" };
    const pool = sequencePool(
      { rows: [reactivated] },
      AUDIT_OK
    );
    const result = await activateContract(pool, CONTRACT_ID, ACTOR_ID);
    assert.strictEqual(result.status, "active");
  });

  it("idempotent: activating already-active contract succeeds", async () => {
    const pool = sequencePool(
      { rows: [ACTIVE_CONTRACT] },
      AUDIT_OK
    );
    const result = await activateContract(pool, CONTRACT_ID, ACTOR_ID);
    assert.strictEqual(result.status, "active");
  });

  it("propagates pool error", async () => {
    const pool = makeTxAwarePool(async () => { throw new Error("connection reset"); });
    await assert.rejects(
      () => activateContract(pool, CONTRACT_ID, ACTOR_ID),
      (err) => { assert.strictEqual(err.message, "connection reset"); return true; }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// terminateContract
// ═══════════════════════════════════════════════════════════════════════════════

describe("terminateContract — valid transitions", () => {
  it("terminates from 'draft' → returns terminated contract", async () => {
    const terminated = { ...DRAFT_CONTRACT, status: "terminated", terminated_by: ACTOR_ID, termination_reason: "Stornierung" };
    const pool = sequencePool(
      { rows: [terminated] },   // UPDATE WHERE status IN ('draft','active')
      AUDIT_OK                  // audit log
    );
    const result = await terminateContract(pool, CONTRACT_ID, ACTOR_ID, "Stornierung");
    assert.strictEqual(result.status, "terminated");
    assert.strictEqual(result.terminated_by, ACTOR_ID);
    assert.strictEqual(result.termination_reason, "Stornierung");
  });

  it("terminates from 'active' → returns terminated contract", async () => {
    const pool = sequencePool(
      { rows: [TERMINATED_CONTRACT] },
      AUDIT_OK
    );
    const result = await terminateContract(pool, CONTRACT_ID, ACTOR_ID, "Vertragsende auf Kundenwunsch");
    assert.strictEqual(result.status, "terminated");
  });

  it("passes correct parameters to SQL query", async () => {
    const pool = sequencePool(
      { rows: [TERMINATED_CONTRACT] },
      AUDIT_OK
    );
    await terminateContract(pool, CONTRACT_ID, ACTOR_ID, "Grund");
    const updateQuery = pool.queries[0];
    assert.ok(updateQuery.sql.includes("status IN ('draft','active')"));
    assert.strictEqual(updateQuery.params[0], CONTRACT_ID);
    assert.strictEqual(updateQuery.params[1], ACTOR_ID);
    assert.strictEqual(updateQuery.params[2], "Grund");
  });

  it("handles null reason (optional)", async () => {
    const noReason = { ...TERMINATED_CONTRACT, termination_reason: null };
    const pool = sequencePool(
      { rows: [noReason] },
      AUDIT_OK
    );
    const result = await terminateContract(pool, CONTRACT_ID, ACTOR_ID, null);
    assert.strictEqual(result.termination_reason, null);
    assert.strictEqual(pool.queries[0].params[2], null);
  });

  it("handles undefined reason (defaults to null)", async () => {
    const noReason = { ...TERMINATED_CONTRACT, termination_reason: null };
    const pool = sequencePool(
      { rows: [noReason] },
      AUDIT_OK
    );
    const result = await terminateContract(pool, CONTRACT_ID, ACTOR_ID, undefined);
    assert.strictEqual(result.termination_reason, null);
    assert.strictEqual(pool.queries[0].params[2], null);
  });

  it("writes audit log with contract.terminated action on success", async () => {
    const pool = sequencePool(
      { rows: [TERMINATED_CONTRACT] },
      AUDIT_OK
    );
    await terminateContract(pool, CONTRACT_ID, ACTOR_ID, "Reason");
    assert.strictEqual(pool.queries.length, 2);
    const auditQuery = pool.queries[1];
    assert.strictEqual(auditQuery.params[1], "contract.terminated");
    assert.strictEqual(auditQuery.params[0], ACTOR_ID);
  });
});

describe("terminateContract — SQL guard prevents invalid transitions", () => {
  it("returns null when contract is already 'terminated' (SQL guard)", async () => {
    // SQL WHERE status IN ('draft','active') excludes 'terminated'
    const pool = sequencePool({ rows: [] }); // no matching row
    const result = await terminateContract(pool, CONTRACT_ID, ACTOR_ID, "duplicate attempt");
    assert.strictEqual(result, null);
    // No audit log written for failed termination
    assert.strictEqual(pool.queries.length, 1);
  });

  it("returns null when contract is 'expired' (SQL guard)", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await terminateContract(pool, CONTRACT_ID, ACTOR_ID, "too late");
    assert.strictEqual(result, null);
    assert.strictEqual(pool.queries.length, 1);
  });

  it("returns null when contract does not exist", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await terminateContract(pool, "nonexistent", ACTOR_ID, "n/a");
    assert.strictEqual(result, null);
  });

  it("does NOT write audit log on failed termination", async () => {
    const pool = sequencePool({ rows: [] }); // guard blocked it
    await terminateContract(pool, CONTRACT_ID, ACTOR_ID, "blocked");
    assert.strictEqual(pool.queries.length, 1, "Only 1 query — no audit write");
  });
});

describe("terminateContract — error handling", () => {
  it("propagates pool error on UPDATE", async () => {
    const pool = makeTxAwarePool(async () => { throw new Error("deadlock"); });
    await assert.rejects(
      () => terminateContract(pool, CONTRACT_ID, ACTOR_ID, "r"),
      (err) => { assert.strictEqual(err.message, "deadlock"); return true; }
    );
  });

  it("propagates pool error on audit write", async () => {
    let callCount = 0;
    const pool = makeTxAwarePool(async () => {
        callCount++;
        if (callCount === 1) return { rows: [TERMINATED_CONTRACT] };
        throw new Error("audit_write_failed");
    });
    await assert.rejects(
      () => terminateContract(pool, CONTRACT_ID, ACTOR_ID, "r"),
      (err) => { assert.strictEqual(err.message, "audit_write_failed"); return true; }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// updateContract (general — used by activateContract)
// ═══════════════════════════════════════════════════════════════════════════════

describe("updateContract — general", () => {
  it("returns null when no allowed fields are provided", async () => {
    const pool = sequencePool(); // no queries expected
    const result = await updateContract(pool, CONTRACT_ID, {}, ACTOR_ID);
    assert.strictEqual(result, null);
    assert.strictEqual(pool.queries.length, 0);
  });

  it("returns null when contract not found", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await updateContract(pool, "nonexistent", { title: "X" }, ACTOR_ID);
    assert.strictEqual(result, null);
    // No audit log for missing contract
    assert.strictEqual(pool.queries.length, 1);
  });

  it("only includes allowed fields in UPDATE", async () => {
    const pool = sequencePool(
      { rows: [{ ...DRAFT_CONTRACT, title: "Updated" }] },
      AUDIT_OK
    );
    await updateContract(pool, CONTRACT_ID, {
      title: "Updated",
      malicious_field: "DROP TABLE",
      buyer_org_id: "hacker-org"
    }, ACTOR_ID);
    const sql = pool.queries[0].sql;
    assert.ok(sql.includes("title ="));
    assert.ok(!sql.includes("malicious_field"));
    assert.ok(!sql.includes("buyer_org_id"));
  });

  it("writes audit log with changed_fields on success", async () => {
    const pool = sequencePool(
      { rows: [{ ...DRAFT_CONTRACT, title: "New Title" }] },
      AUDIT_OK
    );
    await updateContract(pool, CONTRACT_ID, { title: "New Title", description: "New" }, ACTOR_ID);
    const auditQuery = pool.queries[1];
    assert.strictEqual(auditQuery.params[1], "contract.updated");
    const details = JSON.parse(auditQuery.params[4]);
    assert.deepStrictEqual(details.changed_fields, ["title", "description"]);
  });

  it("skips audit log when actorId is not provided", async () => {
    const pool = sequencePool(
      { rows: [{ ...DRAFT_CONTRACT, title: "X" }] }
    );
    await updateContract(pool, CONTRACT_ID, { title: "X" }, null);
    assert.strictEqual(pool.queries.length, 1, "No audit when actorId is null");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Full lifecycle integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("Contract lifecycle — full flow", () => {
  it("draft → activate → terminate (standard lifecycle)", async () => {
    // Step 1: create
    const createPool = sequencePool({ rows: [DRAFT_CONTRACT] }, AUDIT_OK);
    const created = await createContract(createPool, CREATE_INPUT);
    assert.strictEqual(created.status, "draft");

    // Step 2: activate
    const activatePool = sequencePool({ rows: [ACTIVE_CONTRACT] }, AUDIT_OK);
    const activated = await activateContract(activatePool, created.id, ACTOR_ID);
    assert.strictEqual(activated.status, "active");

    // Step 3: terminate
    const terminatePool = sequencePool({ rows: [TERMINATED_CONTRACT] }, AUDIT_OK);
    const terminated = await terminateContract(terminatePool, activated.id, ACTOR_ID, "Vertrag ausgelaufen");
    assert.strictEqual(terminated.status, "terminated");
  });

  it("draft → terminate (skip activation)", async () => {
    const createPool = sequencePool({ rows: [DRAFT_CONTRACT] }, AUDIT_OK);
    const created = await createContract(createPool, CREATE_INPUT);
    assert.strictEqual(created.status, "draft");

    const terminatePool = sequencePool(
      { rows: [{ ...DRAFT_CONTRACT, status: "terminated", terminated_by: ACTOR_ID }] },
      AUDIT_OK
    );
    const terminated = await terminateContract(terminatePool, created.id, ACTOR_ID, "Abgebrochen");
    assert.strictEqual(terminated.status, "terminated");
  });

  it("double terminate returns null on second attempt", async () => {
    // First terminate succeeds
    const pool1 = sequencePool({ rows: [TERMINATED_CONTRACT] }, AUDIT_OK);
    const first = await terminateContract(pool1, CONTRACT_ID, ACTOR_ID, "Erstversuch");
    assert.strictEqual(first.status, "terminated");

    // Second terminate fails (SQL guard: status already 'terminated')
    const pool2 = sequencePool({ rows: [] });
    const second = await terminateContract(pool2, CONTRACT_ID, ACTOR_ID, "Doppelt");
    assert.strictEqual(second, null);
  });
});
