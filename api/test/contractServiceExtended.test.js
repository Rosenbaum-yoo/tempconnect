/**
 * ContractService extended tests — covers getContract, listContracts, expireBatch, findExpiring.
 * (createContract, activateContract, terminateContract, updateContract covered in contractLifecycle.test.js)
 *
 * Run: node --test --test-force-exit test/contractServiceExtended.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getContract,
  listContracts,
  expireBatch,
  findExpiring
} from "../services/contractService.js";

/* ── helpers ──────────────────────────────────────────────── */

function mockPool(response) {
  const queries = [];
  return {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (typeof response === "function") return response(sql, params);
      return response;
    },
    queries
  };
}

const CONTRACT_ROW = {
  id: "c-1",
  buyer_org_id: "org-b",
  supplier_org_id: "org-s",
  contract_type: "framework",
  title: "Rahmenvertrag",
  status: "active",
  valid_from: "2026-01-01",
  valid_until: "2026-12-31",
  buyer_org_name: "Buyer GmbH",
  supplier_org_name: "Supplier AG",
  created_by_email: "admin@buyer.de"
};

/* ═══════════════════════════════════════════════════════════
   getContract
   ═══════════════════════════════════════════════════════════ */

describe("getContract", () => {
  it("returns contract with joined org/user names", async () => {
    const pool = mockPool({ rows: [CONTRACT_ROW] });
    const result = await getContract(pool, "c-1");
    assert.strictEqual(result.id, "c-1");
    assert.strictEqual(result.buyer_org_name, "Buyer GmbH");
    assert.strictEqual(result.supplier_org_name, "Supplier AG");
    assert.strictEqual(result.created_by_email, "admin@buyer.de");
    assert.ok(pool.queries[0].sql.includes("LEFT JOIN organizations bo"));
    assert.ok(pool.queries[0].sql.includes("LEFT JOIN users u"));
  });

  it("returns null when not found", async () => {
    const pool = mockPool({ rows: [] });
    assert.strictEqual(await getContract(pool, "missing"), null);
  });

  it("passes id as parameter", async () => {
    const pool = mockPool({ rows: [] });
    await getContract(pool, "c-42");
    assert.deepStrictEqual(pool.queries[0].params, ["c-42"]);
  });

  it("propagates pool error", async () => {
    const pool = { query: async () => { throw new Error("timeout"); } };
    await assert.rejects(() => getContract(pool, "c-1"), { message: "timeout" });
  });
});

/* ═══════════════════════════════════════════════════════════
   listContracts
   ═══════════════════════════════════════════════════════════ */

describe("listContracts", () => {
  it("returns all contracts without filters", async () => {
    const pool = mockPool({ rows: [CONTRACT_ROW] });
    const result = await listContracts(pool);
    assert.strictEqual(result.length, 1);
    assert.ok(pool.queries[0].sql.includes("ORDER BY c.valid_until ASC NULLS LAST"));
    // default limit is 100
    assert.deepStrictEqual(pool.queries[0].params, [100]);
  });

  it("filters by buyer_org_id", async () => {
    const pool = mockPool({ rows: [] });
    await listContracts(pool, { buyer_org_id: "org-b" });
    assert.ok(pool.queries[0].sql.includes("buyer_org_id = $1"));
    assert.strictEqual(pool.queries[0].params[0], "org-b");
  });

  it("filters by supplier_org_id", async () => {
    const pool = mockPool({ rows: [] });
    await listContracts(pool, { supplier_org_id: "org-s" });
    assert.ok(pool.queries[0].sql.includes("supplier_org_id = $1"));
    assert.strictEqual(pool.queries[0].params[0], "org-s");
  });

  it("filters by status", async () => {
    const pool = mockPool({ rows: [] });
    await listContracts(pool, { status: "active" });
    assert.ok(pool.queries[0].sql.includes("status = $1"));
    assert.strictEqual(pool.queries[0].params[0], "active");
  });

  it("filters by contract_type", async () => {
    const pool = mockPool({ rows: [] });
    await listContracts(pool, { contract_type: "nda" });
    assert.ok(pool.queries[0].sql.includes("contract_type = $1"));
  });

  it("combines multiple filters with AND", async () => {
    const pool = mockPool({ rows: [] });
    await listContracts(pool, { buyer_org_id: "org-b", status: "draft" });
    assert.ok(pool.queries[0].sql.includes("AND"));
    assert.strictEqual(pool.queries[0].params[0], "org-b");
    assert.strictEqual(pool.queries[0].params[1], "draft");
  });

  it("caps limit at 200", async () => {
    const pool = mockPool({ rows: [] });
    await listContracts(pool, { limit: 500 });
    const params = pool.queries[0].params;
    assert.strictEqual(params[params.length - 1], 200);
  });

  it("respects custom limit below 200", async () => {
    const pool = mockPool({ rows: [] });
    await listContracts(pool, { limit: 25 });
    const params = pool.queries[0].params;
    assert.strictEqual(params[params.length - 1], 25);
  });

  it("propagates pool error", async () => {
    const pool = { query: async () => { throw new Error("read_only"); } };
    await assert.rejects(() => listContracts(pool), { message: "read_only" });
  });
});

/* ═══════════════════════════════════════════════════════════
   expireBatch
   ═══════════════════════════════════════════════════════════ */

describe("expireBatch", () => {
  it("returns count of expired contracts", async () => {
    const pool = mockPool({ rowCount: 5 });
    const result = await expireBatch(pool);
    assert.deepStrictEqual(result, { expired: 5 });
    assert.ok(pool.queries[0].sql.includes("status = 'expired'"));
    assert.ok(pool.queries[0].sql.includes("valid_until < CURRENT_DATE"));
    assert.ok(pool.queries[0].sql.includes("status = 'active'"));
  });

  it("returns 0 when none expired", async () => {
    const pool = mockPool({ rowCount: 0 });
    assert.deepStrictEqual(await expireBatch(pool), { expired: 0 });
  });

  it("uses default limit of 100", async () => {
    const pool = mockPool({ rowCount: 0 });
    await expireBatch(pool);
    assert.deepStrictEqual(pool.queries[0].params, [100]);
  });

  it("respects custom limit", async () => {
    const pool = mockPool({ rowCount: 0 });
    await expireBatch(pool, 50);
    assert.deepStrictEqual(pool.queries[0].params, [50]);
  });

  it("propagates pool error", async () => {
    const pool = { query: async () => { throw new Error("lock_timeout"); } };
    await assert.rejects(() => expireBatch(pool), { message: "lock_timeout" });
  });
});

/* ═══════════════════════════════════════════════════════════
   findExpiring
   ═══════════════════════════════════════════════════════════ */

describe("findExpiring", () => {
  it("returns contracts expiring within daysAhead", async () => {
    const expiringRow = { ...CONTRACT_ROW, valid_until: "2026-04-10" };
    const pool = mockPool({ rows: [expiringRow] });
    const result = await findExpiring(pool, 30);
    assert.strictEqual(result.length, 1);
    assert.ok(pool.queries[0].sql.includes("status = 'active'"));
    assert.ok(pool.queries[0].sql.includes("valid_until IS NOT NULL"));
    assert.ok(pool.queries[0].sql.includes("valid_until <= $1"));
    assert.ok(pool.queries[0].sql.includes("ORDER BY c.valid_until ASC"));
  });

  it("uses default daysAhead=30 and limit=100", async () => {
    const pool = mockPool({ rows: [] });
    await findExpiring(pool);
    const params = pool.queries[0].params;
    assert.ok(params[0] instanceof Date);
    assert.strictEqual(params[1], 100);
    // threshold should be ~30 days from now
    const diffMs = params[0].getTime() - Date.now();
    const diffDays = diffMs / 86400000;
    assert.ok(diffDays >= 29 && diffDays <= 31, `Expected ~30 days, got ${diffDays.toFixed(1)}`);
  });

  it("returns empty array when nothing expiring", async () => {
    const pool = mockPool({ rows: [] });
    const result = await findExpiring(pool, 7);
    assert.deepStrictEqual(result, []);
  });

  it("respects custom limit", async () => {
    const pool = mockPool({ rows: [] });
    await findExpiring(pool, 14, 10);
    assert.strictEqual(pool.queries[0].params[1], 10);
  });

  it("includes joined org names", async () => {
    const pool = mockPool({ rows: [CONTRACT_ROW] });
    const result = await findExpiring(pool, 60);
    assert.ok(pool.queries[0].sql.includes("LEFT JOIN organizations bo"));
    assert.strictEqual(result[0].buyer_org_name, "Buyer GmbH");
  });
});
