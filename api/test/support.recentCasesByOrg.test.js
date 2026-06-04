/**
 * Unit-Test: loadRecentOpenCasesByOrg — N+1→1-Query-Batching (Support-Org-Lookup).
 *
 * Sichert den Fix der frueheren N+1-Read-Schleife in GET /support/lookup/orgs ab:
 * statt EINER recent-cases-SELECT pro Org (bei per_page=100 → bis zu 100 sequentielle
 * Round-Trips pro Request) jetzt EINE windowed Query (ROW_NUMBER PARTITION BY org,
 * rn<=10) fuer alle Orgs der Seite. Der wertvollste Test ist die Query-ZAEHLUNG:
 * genau 1 Query unabhaengig von der Org-Zahl — das ist die Anti-N+1-Garantie, die ein
 * Refactor nicht still zuruecknehmen darf (gleiche Methode wie der N+1-Write-Sweep).
 *
 * recordingPool ohne DB → laeuft im DB-freien unit-Job.
 *
 * Run: node --test --test-force-exit test/support.recentCasesByOrg.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadRecentOpenCasesByOrg } from "../routes/support.js";

// Recording-Pool: erfasst jede query (sql+params), liefert die vorgegebenen rows.
function recordingPool(rows = []) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows, rowCount: rows.length };
    }
  };
}

// Agent ohne Scope-Einschraenkung (buildScope fuegt nichts hinzu → params bleibt [ids]).
const noScopeAgent = {
  id: "agent-1",
  role: "internal_support_agent",
  allowed_queues: [],
  allowed_case_types: [],
  data_scope: "all"
};

describe("loadRecentOpenCasesByOrg — N+1→1-Query-Batching", () => {
  it("leere Org-Liste → KEINE Query, leere Map (Guard, kein sinnloser Round-Trip)", async () => {
    const pool = recordingPool();
    const map = await loadRecentOpenCasesByOrg(pool, [], noScopeAgent);
    assert.strictEqual(pool.calls.length, 0);
    assert.strictEqual(map.size, 0);
  });

  it("nicht-Array / null als orgIds → KEINE Query, leere Map (Input-Haertung)", async () => {
    const pool = recordingPool();
    assert.strictEqual((await loadRecentOpenCasesByOrg(pool, null, noScopeAgent)).size, 0);
    assert.strictEqual((await loadRecentOpenCasesByOrg(pool, undefined, noScopeAgent)).size, 0);
    assert.strictEqual(pool.calls.length, 0);
  });

  it("GENAU EINE Query unabhaengig von der Org-Zahl (kein N+1)", async () => {
    const pool = recordingPool();
    await loadRecentOpenCasesByOrg(pool, ["o1", "o2", "o3", "o4", "o5"], noScopeAgent);
    assert.strictEqual(pool.calls.length, 1); // genau 1, nicht 5
  });

  it("SQL ist windowed Batch: ANY($1::uuid[]) + ROW_NUMBER PARTITION BY org + rn<=10 + open-only", async () => {
    const pool = recordingPool();
    await loadRecentOpenCasesByOrg(pool, ["o1", "o2"], noScopeAgent);
    const { sql, params } = pool.calls[0];
    assert.match(sql, /reporter_org_id = ANY\(\$1::uuid\[\]\)/);
    assert.match(sql, /ROW_NUMBER\(\)\s+OVER/i);
    assert.match(sql, /PARTITION BY base\.reporter_org_id/);
    assert.match(sql, /rn <= 10/);
    assert.match(sql, /status NOT IN \('resolved', 'closed'\)/);
    assert.deepStrictEqual(params[0], ["o1", "o2"]);
  });

  it("Agent-Scope (allowed_queues) wird als zusaetzlicher Param in die EINE Query gepusht", async () => {
    const pool = recordingPool();
    const scopedAgent = { ...noScopeAgent, allowed_queues: ["q1", "q2"] };
    await loadRecentOpenCasesByOrg(pool, ["o1"], scopedAgent);
    assert.strictEqual(pool.calls.length, 1);
    const { sql, params } = pool.calls[0];
    assert.match(sql, /queue_id::text = ANY\(\$2::text\[\]\)/);
    assert.deepStrictEqual(params[1], ["q1", "q2"]);
  });

  it("gruppiert Rohzeilen nach reporter_org_id, Reihenfolge bleibt erhalten (juengste zuerst)", async () => {
    const rows = [
      { id: "c1", reporter_org_id: "o1", rn: 1 },
      { id: "c2", reporter_org_id: "o1", rn: 2 },
      { id: "c3", reporter_org_id: "o2", rn: 1 }
    ];
    const pool = recordingPool(rows);
    const map = await loadRecentOpenCasesByOrg(pool, ["o1", "o2"], noScopeAgent);
    assert.deepStrictEqual(map.get("o1").map((r) => r.id), ["c1", "c2"]);
    assert.deepStrictEqual(map.get("o2").map((r) => r.id), ["c3"]);
    assert.strictEqual(map.size, 2);
  });
});
