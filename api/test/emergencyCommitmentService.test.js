import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCommitment, updateCommitmentStatus } from "../services/emergencyCommitmentService.js";

function createMockPool(sequence = []) {
  let idx = 0;
  const client = {
    async query(sql) {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      const next = sequence[idx++] || { rows: [], rowCount: 0 };
      return next;
    },
    release() {}
  };
  return {
    async query() {
      const next = sequence[idx++] || { rows: [], rowCount: 0 };
      return next;
    },
    async connect() {
      return client;
    }
  };
}

describe("emergencyCommitmentService.createCommitment", () => {
  it("rejects invalid quantity", async () => {
    const pool = createMockPool([]);
    const result = await createCommitment(pool, {
      demandId: "d1",
      supplierCompanyId: "s1",
      quantity: 0,
      actorUserId: "s1"
    });
    assert.equal(result.error, "INVALID_QUANTITY");
  });

  it("rejects supplier without match", async () => {
    const pool = createMockPool([{ rows: [], rowCount: 0 }]);
    const result = await createCommitment(pool, {
      demandId: "d1",
      supplierCompanyId: "s1",
      quantity: 2,
      actorUserId: "s1"
    });
    assert.equal(result.error, "SUPPLIER_NOT_MATCHED");
  });

  it("rejects overfill when disabled", async () => {
    const pool = createMockPool([
      { rows: [{ ok: 1 }], rowCount: 1 },
      { rows: [{ id: "d1", urgency: "notdienst", status: "open", required_total_count: 10, currently_committed_count: 8, remaining_open_count: 2, overfill_allowed: false }], rowCount: 1 }
    ]);
    const result = await createCommitment(pool, {
      demandId: "d1",
      supplierCompanyId: "s1",
      quantity: 3,
      actorUserId: "s1"
    });
    assert.equal(result.error, "OVERFILL_NOT_ALLOWED");
    assert.equal(result.remaining_open_count, 2);
  });
});

describe("emergencyCommitmentService.updateCommitmentStatus", () => {
  it("rejects invalid status", async () => {
    const pool = createMockPool([]);
    const result = await updateCommitmentStatus(pool, {
      commitmentId: "c1",
      actorUserId: "u1",
      actorRole: "agency",
      status: "committed"
    });
    assert.equal(result.error, "INVALID_STATUS");
  });
});
