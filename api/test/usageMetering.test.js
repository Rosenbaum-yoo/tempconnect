import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scanAndEnforceUsageLimits,
  USAGE_SCAN_DEFAULT_LIMIT,
  USAGE_SCAN_MAX_LIMIT
} from "../services/usageMeteringService.js";

// Minimaler Pool-Mock: zeichnet jeden Aufruf (sql/params) auf und liefert eine
// vorkonfigurierte Antwort. Reicht, weil der Scan genau eine Query absetzt.
function mockPool(rows) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows };
    }
  };
}

function throwingPool() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      throw new Error("relation does not exist");
    }
  };
}

describe("scanAndEnforceUsageLimits — Batch-Grenzen (Skalierung)", () => {
  it("setzt Default-LIMIT/OFFSET und liefert vollstaendiges Envelope (Zero-State)", async () => {
    const pool = mockPool([]);
    const out = await scanAndEnforceUsageLimits(pool);
    // Query ist paginiert
    assert.match(pool.calls[0].sql, /LIMIT \$1 OFFSET \$2/);
    assert.match(pool.calls[0].sql, /ORDER BY u\.id/);
    assert.deepEqual(pool.calls[0].params, [USAGE_SCAN_DEFAULT_LIMIT, 0]);
    // Envelope vollstaendig
    assert.equal(out.scanned, 0);
    assert.equal(out.over_limit, 0);
    assert.equal(out.has_more, false);
    assert.equal(out.next_offset, 0);
  });

  it("clamped limit auf MAX und negativen offset auf 0", async () => {
    const pool = mockPool([]);
    await scanAndEnforceUsageLimits(pool, { limit: 9999, offset: -50 });
    assert.deepEqual(pool.calls[0].params, [USAGE_SCAN_MAX_LIMIT, 0]);
  });

  it("faellt bei unsinnigem limit auf Default zurueck, respektiert gueltigen offset", async () => {
    const pool = mockPool([]);
    await scanAndEnforceUsageLimits(pool, { limit: "abc", offset: 200 });
    assert.deepEqual(pool.calls[0].params, [USAGE_SCAN_DEFAULT_LIMIT, 200]);
  });

  it("clamped limit auf >=1 (0 -> Default)", async () => {
    const pool = mockPool([]);
    await scanAndEnforceUsageLimits(pool, { limit: 0 });
    assert.deepEqual(pool.calls[0].params, [USAGE_SCAN_DEFAULT_LIMIT, 0]);
  });

  it("zaehlt Nutzer ueber Listing-Limit (DEMO=0, BASIS=5) und ignoriert Unlimited (PRO=-1)", async () => {
    const pool = mockPool([
      { id: "u1", plan: "DEMO", active_posts: 1 },   // 1 > 0  -> over
      { id: "u2", plan: "BASIS", active_posts: 5 },  // 5 > 5? nein -> ok
      { id: "u3", plan: "BASIS", active_posts: 6 },  // 6 > 5  -> over
      { id: "u4", plan: "PRO", active_posts: 999 }   // -1 = unlimited -> ok
    ]);
    const out = await scanAndEnforceUsageLimits(pool, { limit: 100 });
    assert.equal(out.scanned, 4);
    assert.equal(out.over_limit, 2);
  });

  it("has_more=true wenn die Seite voll ist, next_offset weitergeschaltet", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: `u${i}`, plan: "PRO", active_posts: 0 }));
    const pool = mockPool(rows);
    const out = await scanAndEnforceUsageLimits(pool, { limit: 3, offset: 9 });
    assert.equal(out.has_more, true);
    assert.equal(out.next_offset, 12); // 9 + 3
  });

  it("has_more=false wenn die Seite nicht voll ist", async () => {
    const rows = [{ id: "u0", plan: "PRO", active_posts: 0 }];
    const pool = mockPool(rows);
    const out = await scanAndEnforceUsageLimits(pool, { limit: 50 });
    assert.equal(out.has_more, false);
  });

  it("faellt bei DB-Fehler graceful auf Zero-Envelope zurueck (Tabelle fehlt im Test)", async () => {
    const pool = throwingPool();
    const out = await scanAndEnforceUsageLimits(pool, { limit: 100, offset: 30 });
    assert.deepEqual(out, { scanned: 0, over_limit: 0, has_more: false, next_offset: 30 });
  });

  it("unbekannter Plan-Key faellt auf FREE/DEMO (listings=0) zurueck -> jeder Post ist over", async () => {
    const pool = mockPool([
      { id: "u1", plan: null, active_posts: 1 },        // null -> FREE(DEMO=0) -> over
      { id: "u2", plan: "WUNDERPLAN", active_posts: 1 } // unbekannt -> DEMO=0 -> over
    ]);
    const out = await scanAndEnforceUsageLimits(pool);
    assert.equal(out.scanned, 2);
    assert.equal(out.over_limit, 2);
  });
});
