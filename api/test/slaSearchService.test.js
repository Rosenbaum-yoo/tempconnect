/**
 * slaSearchService unit tests — focus on the set-based cron SLA scan.
 * Uses a recording mock pool — no database required.
 *
 * Run: node --test --test-force-exit test/slaSearchService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { searchSlaScan } from "../services/slaSearchService.js";

const UUID = "00000000-0000-4000-8000-000000000001";
const UUID2 = "00000000-0000-4000-8000-000000000002";

function recordingPool(...responses) {
  const calls = [];
  let idx = 0;
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return responses[idx++] ?? { rows: [], rowCount: 0 };
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// searchSlaScan — cron: RUNNING → BREACHED (set-based, no N+1)
// ═══════════════════════════════════════════════════════════════

describe("searchSlaScan — batch SLA breach detection (set-based)", () => {
  it("flips the batch in ONE guarded UPDATE + ONE bulk event insert (no N+1)", async () => {
    const pool = recordingPool(
      { rows: [{ id: UUID }, { id: UUID2 }], rowCount: 2 }, // UPDATE ... RETURNING
      { rows: [], rowCount: 2 }                              // bulk INSERT ... UNNEST
    );
    const result = await searchSlaScan(pool, 100);
    assert.strictEqual(result.breached, 2);
    // Exactly two round-trips regardless of batch size — proves the per-row loop is gone.
    assert.strictEqual(pool.calls.length, 2);
    // Query #1: guarded set-based UPDATE (concurrency-safe + batch-bounded).
    const upd = pool.calls[0].sql;
    assert.match(upd, /UPDATE sla_search_jobs/);
    assert.match(upd, /SET sla_status = 'BREACHED'/);
    assert.match(upd, /WHERE sla_status = 'RUNNING'/); // guard on OUTER update → no duplicate events under overlapping crons
    assert.match(upd, /LIMIT \$1/);                     // batch bound preserved
    assert.match(upd, /RETURNING id/);
    // Query #2: single bulk insert via UNNEST carrying exactly the flipped ids.
    const ins = pool.calls[1].sql;
    assert.match(ins, /INSERT INTO sla_search_events/);
    assert.match(ins, /UNNEST\(\$1::uuid\[\]\)/);
    assert.match(ins, /'SLA_BREACHED'/);
    assert.deepStrictEqual(pool.calls[1].params[0], [UUID, UUID2]);
  });

  it("returns 0 and skips the event insert when nothing is overdue", async () => {
    const pool = recordingPool({ rows: [], rowCount: 0 }); // UPDATE flips nothing
    const result = await searchSlaScan(pool, 100);
    assert.strictEqual(result.breached, 0);
    assert.strictEqual(pool.calls.length, 1); // no second (event) query
  });

  it("caps batch size at 500", async () => {
    const pool = recordingPool({ rows: [], rowCount: 0 });
    await searchSlaScan(pool, 9999);
    assert.strictEqual(pool.calls[0].params[0], 500);
  });

  it("defaults batch size to 100 when unset", async () => {
    const pool = recordingPool({ rows: [], rowCount: 0 });
    await searchSlaScan(pool);
    assert.strictEqual(pool.calls[0].params[0], 100);
  });
});
