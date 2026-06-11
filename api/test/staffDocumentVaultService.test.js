import { test } from "node:test";
import assert from "node:assert/strict";
import { getVaultOverview } from "../services/staffDocumentVaultService.js";

function mockPool() {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/GROUP BY source/.test(sql)) return { rows: [{ source: "upload", n: 3 }, { source: "invoice", n: 2 }, { source: "system", n: 5 }] };
      if (/GROUP BY document_type/.test(sql)) return { rows: [{ document_type: "invoice", n: 2 }, { document_type: "contract", n: 4 }] };
      if (/ORDER BY dc\.created_at DESC/.test(sql)) return { rows: [{ id: "d1", title: "T", source: "system" }] };
      return { rows: [{ total: 10, last_24h: 2, last_7d: 6, auto_ingested: 7, total_bytes: "12345" }] };
    }
  };
}

test("getVaultOverview: 4 Queries (cross-org, kein org-Filter), Limit geklemmt", async () => {
  const p = mockPool();
  await getVaultOverview(p, { limit: 9999 });
  assert.equal(p.calls.length, 4);
  for (const c of p.calls) assert.doesNotMatch(c.sql, /org_id = \$/);
  const recentCall = p.calls.find((c) => /ORDER BY dc\.created_at DESC/.test(c.sql));
  assert.equal(recentCall.params[0], 200, "Limit auf 200 geklemmt");
});

test("getVaultOverview: aggregiert Quellen/Typen/Totals korrekt", async () => {
  const r = await getVaultOverview(mockPool(), {});
  assert.deepEqual(r.counts_by_source, { upload: 3, invoice: 2, system: 5 });
  assert.deepEqual(r.counts_by_type, { invoice: 2, contract: 4 });
  assert.equal(r.totals.total, 10);
  assert.equal(r.totals.auto_ingested, 7);
  assert.equal(r.totals.total_bytes, 12345);
  assert.equal(r.recent.length, 1);
});

test("getVaultOverview: Zero-State liefert leere Strukturen", async () => {
  const p = { query: async () => ({ rows: [] }) };
  const r = await getVaultOverview(p, {});
  assert.deepEqual(r.counts_by_source, {});
  assert.deepEqual(r.counts_by_type, {});
  assert.equal(r.totals.total, 0);
  assert.deepEqual(r.recent, []);
});
