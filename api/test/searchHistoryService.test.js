/**
 * Phase 5 Slice 2 — Such-Historie (pro Nutzer). Mock-Pool-Tests: Upsert-Form (bounded),
 * Normalisierung, Clamping, Recent-Ordering, user-gescoptes Loeschen.
 * Run: node --test --test-force-exit test/searchHistoryService.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/searchHistoryService.js";

function capturePool(responder) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => { calls.push({ sql, params }); return responder ? responder(sql, params) : { rows: [], rowCount: 0 }; }
  };
}

describe("searchHistoryService — record/recent/clear", () => {
  it("recordSearch ohne userId -> kein DB-Write", async () => {
    const pool = capturePool();
    const r = await svc.recordSearch(pool, { query: "pflege" });
    assert.equal(r, false);
    assert.equal(pool.calls.length, 0);
  });

  it("recordSearch bei <2 Zeichen -> kein DB-Write", async () => {
    const pool = capturePool();
    assert.equal(await svc.recordSearch(pool, { userId: "u1", query: "a" }), false);
    assert.equal(await svc.recordSearch(pool, { userId: "u1", query: "  " }), false);
    assert.equal(pool.calls.length, 0);
  });

  it("recordSearch: Upsert (ON CONFLICT) + normalisierte query_norm + geclamptes result_count", async () => {
    const pool = capturePool(() => ({ rows: [{}] }));
    const ok = await svc.recordSearch(pool, { userId: "u1", orgId: "o1", query: "  Pflege   Hamburg ", type: "all", resultCount: 7.9 });
    assert.equal(ok, true);
    const c = pool.calls[0];
    assert.match(c.sql, /INSERT INTO search_history/);
    assert.match(c.sql, /ON CONFLICT \(user_id, query_norm\) DO UPDATE/, "Upsert -> bounded, kein Append");
    assert.match(c.sql, /search_count = search_history\.search_count \+ 1/);
    assert.equal(c.params[0], "u1");
    assert.equal(c.params[1], "o1");
    assert.equal(c.params[2], "Pflege   Hamburg", "Originaltext (getrimmt) bleibt erhalten");
    assert.equal(c.params[3], "pflege hamburg", "query_norm = lower + Whitespace kollabiert");
    assert.equal(c.params[5], 7, "result_count auf Integer getrunkt");
  });

  it("recordSearch: ungueltiger type faellt auf 'all' zurueck", async () => {
    const pool = capturePool(() => ({ rows: [{}] }));
    await svc.recordSearch(pool, { userId: "u1", query: "stapler", type: "evil_table" });
    assert.equal(pool.calls[0].params[4], "all");
  });

  it("getRecentSearches: jüngste zuerst, Limit geclampt, user-gescoped", async () => {
    const pool = capturePool(() => ({ rows: [{ query: "pflege" }] }));
    const rows = await svc.getRecentSearches(pool, "u1", 999);
    assert.equal(rows.length, 1);
    const c = pool.calls[0];
    assert.match(c.sql, /ORDER BY last_used_at DESC/);
    assert.match(c.sql, /WHERE user_id = \$1/);
    assert.equal(c.params[0], "u1");
    assert.equal(c.params[1], 20, "Limit auf max 20 geclampt");
  });

  it("getRecentSearches ohne userId -> [] ohne Query", async () => {
    const pool = capturePool();
    assert.deepEqual(await svc.getRecentSearches(pool, null), []);
    assert.equal(pool.calls.length, 0);
  });

  it("clearHistory(query) loescht nur diesen Begriff (normalisiert), user-gescoped", async () => {
    const pool = capturePool(() => ({ rowCount: 1 }));
    const n = await svc.clearHistory(pool, "u1", { query: "  Pflege " });
    assert.equal(n, 1);
    const c = pool.calls[0];
    assert.match(c.sql, /DELETE FROM search_history WHERE user_id = \$1 AND query_norm = \$2/);
    assert.equal(c.params[0], "u1");
    assert.equal(c.params[1], "pflege");
  });

  it("clearHistory() ohne query loescht die gesamte Historie des Nutzers", async () => {
    const pool = capturePool(() => ({ rowCount: 5 }));
    const n = await svc.clearHistory(pool, "u1");
    assert.equal(n, 5);
    assert.match(pool.calls[0].sql, /DELETE FROM search_history WHERE user_id = \$1/);
    assert.equal(pool.calls[0].params.length, 1, "nur user_id als Param (kein query-Filter)");
  });
});
