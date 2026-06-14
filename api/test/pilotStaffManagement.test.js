/**
 * Plattformweite Pilot-Verwaltung (Staff Center) — Mock-Pool-Tests fuer listAllPilots + extend.
 * Owner-Wunsch: Piloten zentral verwaltbar, ohne versehentliche Zahlung; Pilot jetzt 3 Monate.
 * Run: node --test --test-force-exit test/pilotStaffManagement.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listAllPilots, extendPilotForOrganization } from "../services/pilotPolicyService.js";

function capturePool(responder) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return responder ? responder(sql, params) : { rows: [] }; } };
}

describe("Pilot-Verwaltung (Staff Center)", () => {
  it("listAllPilots: plattformweit, filtert 'eligible' raus, 3-Monats-Fenster fuer Restlaufzeit", async () => {
    const pool = capturePool(() => ({ rows: [{ org_id: "o1", pilot_status: "active", remaining_days: 42 }] }));
    const rows = await listAllPilots(pool);
    const sql = pool.calls[0].sql;
    assert.match(sql, /FROM organizations/);
    assert.match(sql, /pilot_status <> 'eligible'/);
    assert.match(sql, /remaining_days/);
    assert.doesNotMatch(sql, /o\.id\s*=\s*\$/, "kein org-Filter -> plattformweit");
    assert.equal(pool.calls[0].params[0], 3, "PILOT_MAX_MONTHS = 3 fliesst in die Query (3 Monate frei)");
    assert.equal(rows.length, 1);
  });

  it("extendPilotForOrganization: verlaengert aktiven Piloten (pilot_started_at +N Monate), begrenzt 1..12", async () => {
    const pool = capturePool((sql) => sql.includes("UPDATE organizations") ? { rows: [{ id: "o1", pilot_status: "active", pilot_started_at: "2026-06-01" }] } : { rows: [] });
    const res = await extendPilotForOrganization(pool, { orgId: "o1", months: 99, actorUserId: "staff1" });
    assert.equal(res.extended_months, 12, "auf 12 begrenzt");
    const upd = pool.calls.find(c => c.sql.includes("UPDATE organizations"));
    assert.match(upd.sql, /pilot_started_at = COALESCE\(pilot_started_at, NOW\(\)\) \+ \(\$2 \|\| ' months'\)::interval/);
    assert.match(upd.sql, /WHERE id = \$1 AND pilot_status = 'active'/);
  });

  it("extendPilotForOrganization: nicht-aktiver Pilot -> PILOT_NOT_ACTIVE, fehlende Org -> ORG_NOT_FOUND", async () => {
    const inactivePool = capturePool((sql) => sql.includes("UPDATE organizations") ? { rows: [] } : { rows: [{ id: "o1", pilot_status: "ended" }] });
    await assert.rejects(() => extendPilotForOrganization(inactivePool, { orgId: "o1" }), (e) => e.code === "PILOT_NOT_ACTIVE");

    const missingPool = capturePool(() => ({ rows: [] }));
    await assert.rejects(() => extendPilotForOrganization(missingPool, { orgId: "ghost" }), (e) => e.code === "ORG_NOT_FOUND");
  });

  it("extendPilotForOrganization: months=0 -> Untergrenze 1", async () => {
    const pool = capturePool((sql) => sql.includes("UPDATE organizations") ? { rows: [{ id: "o1", pilot_status: "active" }] } : { rows: [] });
    const res = await extendPilotForOrganization(pool, { orgId: "o1", months: 0 });
    assert.equal(res.extended_months, 1);
  });
});
