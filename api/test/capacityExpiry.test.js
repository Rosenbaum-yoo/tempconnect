/**
 * Marktplatz-Expiry-Sweep (Item #3): Supply (capacity_posts) + Demand (demand_requests)
 * laufen ab, sobald Einsatz-Enddatum/Gueltigkeit vorbei -> status='expired' (Counts/Limits frei).
 * Mock-Pool-Tests: pruefen SQL-Form (Bedingungen + Zielstatus) + RETURNING-Verarbeitung.
 *
 * Run: node --test --test-force-exit test/capacityExpiry.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expireStaleEntries, expireDemandRequests } from "../services/capacityExchangeService.js";

function capturePool(rows = []) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows }; } };
}

describe("Marktplatz-Expiry-Sweep", () => {
  it("expireStaleEntries: capacity_posts -> expired bei valid_until ODER availability_to vorbei", async () => {
    const pool = capturePool([{ id: "c1", supplier_company_id: "s1" }]);
    const result = await expireStaleEntries(pool, 100);

    assert.equal(pool.calls.length, 1, "genau eine Query (kein N+1)");
    const sql = pool.calls[0].sql;
    assert.match(sql, /UPDATE\s+capacity_posts/);
    assert.match(sql, /status\s*=\s*'expired'/);
    assert.match(sql, /is_active\s*=\s*FALSE/);
    assert.match(sql, /valid_until\s*<\s*NOW\(\)/, "valid_until-Bedingung bleibt erhalten");
    assert.match(sql, /availability_to\s*<\s*CURRENT_DATE/, "neue availability_to-Bedingung");
    assert.match(sql, /WHERE\s+status\s*=\s*'active'/, "nur aktive Eintraege");
    assert.match(sql, /RETURNING/);
    assert.equal(result.expired, 1);
    assert.deepEqual(result.entries, [{ id: "c1", supplier_company_id: "s1" }]);
  });

  it("expireDemandRequests: demand_requests -> expired bei end_date vorbei (open/partially_covered)", async () => {
    const pool = capturePool([{ id: "d1", requester_company_id: "r1" }, { id: "d2", requester_company_id: "r2" }]);
    const result = await expireDemandRequests(pool, 100);

    assert.equal(pool.calls.length, 1);
    const sql = pool.calls[0].sql;
    assert.match(sql, /UPDATE\s+demand_requests/);
    assert.match(sql, /status\s*=\s*'expired'/);
    assert.match(sql, /end_date\s*<\s*CURRENT_DATE/);
    assert.match(sql, /status\s+IN\s*\(\s*'open',\s*'partially_covered'\s*\)/, "nur offene Angebote ablaufen lassen");
    assert.match(sql, /RETURNING/);
    assert.equal(result.expired, 2);
  });

  it("NULL-Enddatum laeuft nicht ab (IS NOT NULL-Guard in beiden Sweeps)", async () => {
    const pool = capturePool([]);
    await expireStaleEntries(pool, 100);
    await expireDemandRequests(pool, 100);
    assert.match(pool.calls[0].sql, /availability_to\s+IS\s+NOT\s+NULL/);
    assert.match(pool.calls[1].sql, /end_date\s+IS\s+NOT\s+NULL/);
  });

  it("batchSize begrenzt nur die Notification-Liste, nicht den Status-Flip", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: "c" + i, supplier_company_id: "s" + i }));
    const pool = capturePool(many);
    const result = await expireStaleEntries(pool, 3);
    assert.equal(result.entries.length, 3, "Notification-Batch auf 3 begrenzt");
    assert.equal(result.expired, 3);
    assert.doesNotMatch(pool.calls[0].sql, /LIMIT/, "UPDATE hat KEIN LIMIT -> alle abgelaufenen werden expired");
  });
});
