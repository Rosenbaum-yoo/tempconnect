/**
 * workerOfferReservationService — Hard-Reserve-Sweep (Welle 4b).
 * DB-frei: Mock-Pool prüft, dass Reserve + Release als set-basierte UPDATEs laufen
 * und die Zähler korrekt zurückkommen.
 * Run: node --test test/workerOfferReservation.service.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/workerOfferReservationService.js";

describe("workerOfferReservationService.sweepReservations", () => {
  it("führt Reserve + Release aus und liefert die Zähler", async () => {
    const calls = [];
    const pool = {
      query: async (sql) => {
        calls.push(sql);
        if (sql.includes("worker_reserved = TRUE, worker_reserved_at = NOW()")) return { rowCount: 3, rows: [] };
        if (sql.includes("worker_reserved = FALSE, worker_reserved_at = NULL")) return { rowCount: 2, rows: [] };
        return { rowCount: 0, rows: [] };
      }
    };
    const res = await svc.sweepReservations(pool);
    assert.equal(res.reserved, 3);
    assert.equal(res.released, 2);
    // Reserve: aktive Einzel-/Bündelangebote im-Einsatz-Arbeiter -> paused
    assert.ok(calls.some((s) =>
      s.includes("SET status = 'paused'")
      && s.includes("offer_kind IN ('single_skill', 'bundle')")
      && s.includes("EXISTS")));
    // Release: reservierte -> active, sobald Arbeiter frei (NOT EXISTS)
    assert.ok(calls.some((s) =>
      s.includes("SET status = 'active'")
      && s.includes("cp.worker_reserved = TRUE")
      && s.includes("NOT")));
  });

  it("Sammelangebote (pool_*) werden NICHT reserviert (nur single_skill/bundle)", async () => {
    const calls = [];
    const pool = { query: async (sql) => { calls.push(sql); return { rowCount: 0, rows: [] }; } };
    await svc.sweepReservations(pool);
    const reserveSql = calls.find((s) => s.includes("SET status = 'paused'"));
    assert.ok(reserveSql);
    assert.ok(!reserveSql.includes("pool_single_skill"));
    assert.ok(!reserveSql.includes("pool_multi_skill"));
  });

  it("syncWorkerReservation grenzt auf einen Arbeiter ein", async () => {
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 1, rows: [] }; } };
    const res = await svc.syncWorkerReservation(pool, "w1");
    assert.equal(res.reserved, 1);
    assert.equal(res.released, 1);
    assert.ok(calls.every((c) => c.sql.includes("cp.worker_profile_id = $1") && c.params[0] === "w1"));
  });
});
