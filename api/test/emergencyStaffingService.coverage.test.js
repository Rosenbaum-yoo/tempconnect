/**
 * Emergency Staffing Service — comprehensive unit coverage.
 *
 * Exercises the thin orchestration layer end-to-end against a tracking pool
 * that routes queries by SQL substring. The service dynamically imports
 * marketplaceService / instantMatchService / notificationMatrix; those run for
 * real against the same mock pool (one pattern-routing pool drives the whole
 * call graph). instantMatch with no capacity_posts deterministically yields
 * zero matches, which drives the dominant orchestration path.
 *
 * Run (cwd = api/):
 *   node --test --test-force-exit test/emergencyStaffingService.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/emergencyStaffingService.js";

/* ── tracking pool ──────────────────────────────────────────────
 * routes[] = [substring, responseOrFn]. First match wins. Records every
 * non-tx query as { sql, params }. Default response { rows: [] }.
 */
function trackingPool(routes = []) {
  const calls = [];
  const TX = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);
  const query = async (sql, params) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    if (TX.has(text.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    calls.push({ sql: text, params: params || [] });
    for (const [needle, resp] of routes) {
      if (text.includes(needle)) {
        const r = typeof resp === "function" ? resp(text, params) : resp;
        return r ?? { rows: [], rowCount: 0 };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    query,
    connect: async () => ({ query, release: () => {} }),
    calls,
    find: (needle) => calls.filter((c) => c.sql.includes(needle)),
    last: (needle) => [...calls].reverse().find((c) => c.sql.includes(needle))
  };
}

/* ═══════════════════════════════════════════════════════════════
   classifyUrgency
   ═══════════════════════════════════════════════════════════════ */

describe("emergencyStaffingService — classifyUrgency", () => {
  it("returns NORMAL for falsy / unknown input", () => {
    assert.strictEqual(svc.classifyUrgency(null), "NORMAL");
    assert.strictEqual(svc.classifyUrgency(undefined), "NORMAL");
    assert.strictEqual(svc.classifyUrgency(""), "NORMAL");
    assert.strictEqual(svc.classifyUrgency("whatever"), "NORMAL");
  });

  it("maps each canonical level case-insensitively with trimming", () => {
    assert.strictEqual(svc.classifyUrgency("notdienst"), "NOTDIENST");
    assert.strictEqual(svc.classifyUrgency("  NotDienst  "), "NOTDIENST");
    assert.strictEqual(svc.classifyUrgency("critical"), "CRITICAL");
    assert.strictEqual(svc.classifyUrgency("URGENT"), "URGENT");
    assert.strictEqual(svc.classifyUrgency("high"), "HIGH");
    assert.strictEqual(svc.classifyUrgency("PLUS"), "HIGH");
  });

  it("coerces non-string input via String()", () => {
    assert.strictEqual(svc.classifyUrgency(123), "NORMAL");
  });
});

/* ═══════════════════════════════════════════════════════════════
   isEmergency
   ═══════════════════════════════════════════════════════════════ */

describe("emergencyStaffingService — isEmergency", () => {
  it("is true for URGENT / CRITICAL / NOTDIENST (incl. aliases)", () => {
    assert.strictEqual(svc.isEmergency("urgent"), true);
    assert.strictEqual(svc.isEmergency("CRITICAL"), true);
    assert.strictEqual(svc.isEmergency("notdienst"), true);
  });

  it("is false for HIGH/PLUS/NORMAL and unknown", () => {
    assert.strictEqual(svc.isEmergency("high"), false);
    assert.strictEqual(svc.isEmergency("plus"), false);
    assert.strictEqual(svc.isEmergency("normal"), false);
    assert.strictEqual(svc.isEmergency(null), false);
  });
});

/* ═══════════════════════════════════════════════════════════════
   getUrgencyConfig
   ═══════════════════════════════════════════════════════════════ */

describe("emergencyStaffingService — getUrgencyConfig", () => {
  it("returns level + full config for NOTDIENST", () => {
    const c = svc.getUrgencyConfig("notdienst");
    assert.strictEqual(c.level, "NOTDIENST");
    assert.strictEqual(c.slaMinutes, 30);
    assert.strictEqual(c.responseWindow, 15);
    assert.strictEqual(c.escalation, true);
    assert.strictEqual(c.forceEmail, true);
    assert.strictEqual(c.label, "Notdienst");
  });

  it("returns NORMAL config (no escalation/forceEmail) for unknown", () => {
    const c = svc.getUrgencyConfig("something-else");
    assert.strictEqual(c.level, "NORMAL");
    assert.strictEqual(c.slaMinutes, 120);
    assert.strictEqual(c.responseWindow, null);
    assert.strictEqual(c.escalation, false);
    assert.strictEqual(c.forceEmail, false);
    assert.strictEqual(c.label, "Normal");
  });

  it("returns HIGH config for PLUS alias", () => {
    const c = svc.getUrgencyConfig("plus");
    assert.strictEqual(c.level, "HIGH");
    assert.strictEqual(c.slaMinutes, 90);
    assert.strictEqual(c.responseWindow, 60);
  });
});

/* ═══════════════════════════════════════════════════════════════
   URGENCY_CONFIG (exported constant integrity)
   ═══════════════════════════════════════════════════════════════ */

describe("emergencyStaffingService — URGENCY_CONFIG", () => {
  it("exposes all five levels with monotonically tighter SLA", () => {
    const cfg = svc.URGENCY_CONFIG;
    assert.ok(cfg.NORMAL && cfg.HIGH && cfg.URGENT && cfg.CRITICAL && cfg.NOTDIENST);
    assert.ok(cfg.NORMAL.slaMinutes > cfg.HIGH.slaMinutes);
    assert.ok(cfg.HIGH.slaMinutes > cfg.URGENT.slaMinutes);
    assert.ok(cfg.URGENT.slaMinutes > cfg.CRITICAL.slaMinutes);
    assert.ok(cfg.CRITICAL.slaMinutes > cfg.NOTDIENST.slaMinutes);
  });

  it("flags escalation+forceEmail exactly for emergency levels", () => {
    const cfg = svc.URGENCY_CONFIG;
    assert.strictEqual(cfg.NORMAL.escalation, false);
    assert.strictEqual(cfg.HIGH.escalation, false);
    for (const lvl of ["URGENT", "CRITICAL", "NOTDIENST"]) {
      assert.strictEqual(cfg[lvl].escalation, true);
      assert.strictEqual(cfg[lvl].forceEmail, true);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════
   createEmergencyRequest
   ═══════════════════════════════════════════════════════════════ */

describe("emergencyStaffingService — createEmergencyRequest", () => {
  // A demand the marketplaceService INSERT returns. sla_status RUNNING +
  // a sla_due_at in the future drives the SLA-started + SLA-met branches.
  function demandRow(overrides = {}) {
    return {
      id: "dem-1",
      title: "Notdienst Pflege",
      role: "Pflegekraft",
      location_city: "Hamburg",
      skill_tags: ["intensiv"],
      location_lat: 53.5,
      location_lng: 10.0,
      radius_km: 25,
      start_date: "2026-07-01",
      end_date: null,
      budget_max: 80,
      headcount: 2,
      sla_status: "RUNNING",
      sla_due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ...overrides
    };
  }

  it("creates demand, sets response window, starts SLA, records attempt (no matches path)", async () => {
    // PLUS plan → marketplaceService enables SLA. No capacity_posts → 0 matches.
    const pool = trackingPool([
      ["INSERT INTO demand_requests", { rows: [demandRow()] }]
    ]);

    const result = await svc.createEmergencyRequest(pool, "user-1", "PLUS", {
      title: "Notdienst Pflege",
      role: "Pflegekraft",
      location_city: "Hamburg",
      urgency: "notdienst"
    });

    // Return envelope shape
    assert.strictEqual(result.urgency_level, "NOTDIENST");
    assert.strictEqual(result.urgency_config.slaMinutes, 30);
    assert.deepStrictEqual(result.demand.id, "dem-1");
    assert.strictEqual(result.match_results.total, 0);
    assert.deepStrictEqual(result.match_results.top_matches, []);
    assert.strictEqual(result.alerted, 0);

    // Demand INSERT actually happened
    assert.strictEqual(pool.find("INSERT INTO demand_requests").length, 1);

    // Response window (NOTDIENST = 15) was set on the new demand id
    const rw = pool.last("response_window_minutes");
    assert.ok(rw, "expected response_window_minutes UPDATE");
    assert.deepStrictEqual(rw.params, [15, "dem-1"]);
  });

  it("normalizes urgency=critical and feeds it into the demand payload", async () => {
    let insertedUrgency = null;
    const pool = trackingPool([
      ["INSERT INTO demand_requests", (sql, params) => {
        // urgency is param index 15 (1-based $15) → array index 14
        insertedUrgency = params[14];
        return { rows: [demandRow({ urgency: "critical" })] };
      }]
    ]);

    const result = await svc.createEmergencyRequest(pool, "user-1", "PLUS", {
      role: "Elektriker",
      location_city: "Kiel",
      urgency: "critical"
    });

    assert.strictEqual(result.urgency_level, "CRITICAL");
    assert.strictEqual(result.urgency_config.responseWindow, 20);
    // marketplaceService lowercases the urgency we passed (CRITICAL → critical)
    assert.strictEqual(insertedUrgency, "critical");
  });

  it("defaults missing urgency to notdienst", async () => {
    const pool = trackingPool([
      ["INSERT INTO demand_requests", { rows: [demandRow()] }]
    ]);
    const result = await svc.createEmergencyRequest(pool, "u", "PRO", {
      role: "Maler",
      location_city: "Lübeck"
    });
    assert.strictEqual(result.urgency_level, "NOTDIENST");
  });

  it("does NOT start SLA when demand sla_status is not RUNNING", async () => {
    const pool = trackingPool([
      ["INSERT INTO demand_requests", { rows: [demandRow({ sla_status: null, sla_due_at: null })] }]
    ]);
    await svc.createEmergencyRequest(pool, "u", "BASIS", {
      role: "Koch",
      location_city: "Itzehoe",
      urgency: "urgent"
    });
    // SLA-started writes a sla_events row of type SLA_STARTED — none expected.
    assert.strictEqual(pool.find("SLA_STARTED").length, 0);
  });

  it("propagates if the underlying demand creation throws", async () => {
    const pool = trackingPool([
      ["INSERT INTO demand_requests", () => { throw new Error("db down"); }]
    ]);
    await assert.rejects(
      () => svc.createEmergencyRequest(pool, "u", "PLUS", { role: "x", location_city: "y", urgency: "notdienst" }),
      /db down/
    );
  });

  it("swallows a failing instant-match (non-blocking) and still returns envelope", async () => {
    // Make the capacity_posts SELECT throw → instantMatch rejects → caught.
    const pool = trackingPool([
      ["INSERT INTO demand_requests", { rows: [demandRow()] }],
      ["FROM capacity_posts", () => { throw new Error("match boom"); }]
    ]);
    const result = await svc.createEmergencyRequest(pool, "u", "PLUS", {
      role: "Pfleger",
      location_city: "Hamburg",
      urgency: "notdienst"
    });
    // Non-blocking: function resolves with empty match results, no throw.
    assert.strictEqual(result.match_results.total, 0);
    assert.strictEqual(result.alerted, 0);
  });
});

/* ═══════════════════════════════════════════════════════════════
   getActiveEmergencies
   ═══════════════════════════════════════════════════════════════ */

describe("emergencyStaffingService — getActiveEmergencies", () => {
  it("maps rows with derived urgency level/label, rounded age, sla_overdue", async () => {
    const pool = trackingPool([
      ["FROM demand_requests dr", {
        rows: [
          { id: "1", urgency: "notdienst", age_minutes: "12.7", sla_overdue: true },
          { id: "2", urgency: "urgent", age_minutes: null, sla_overdue: null }
        ]
      }]
    ]);
    const rows = await svc.getActiveEmergencies(pool, "org-1");
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].urgency_level, "NOTDIENST");
    assert.strictEqual(rows[0].urgency_label, "Notdienst");
    assert.strictEqual(rows[0].age_minutes, 13); // rounded
    assert.strictEqual(rows[0].sla_overdue, true);
    // null age → 0; null sla_overdue → false fallback
    assert.strictEqual(rows[1].age_minutes, 0);
    assert.strictEqual(rows[1].sla_overdue, false);
    assert.strictEqual(rows[1].urgency_label, "Dringend");
  });

  it("passes orgId through to the query params", async () => {
    const pool = trackingPool();
    await svc.getActiveEmergencies(pool, "org-xyz");
    assert.deepStrictEqual(pool.calls[0].params, ["org-xyz"]);
  });

  it("passes null when no orgId given (platform-wide)", async () => {
    const pool = trackingPool();
    await svc.getActiveEmergencies(pool);
    assert.deepStrictEqual(pool.calls[0].params, [null]);
  });

  it("returns empty array for no active emergencies", async () => {
    const pool = trackingPool([["FROM demand_requests dr", { rows: [] }]]);
    assert.deepStrictEqual(await svc.getActiveEmergencies(pool, "o"), []);
  });
});

/* ═══════════════════════════════════════════════════════════════
   getEmergencyDashboard
   ═══════════════════════════════════════════════════════════════ */

describe("emergencyStaffingService — getEmergencyDashboard", () => {
  it("computes rates from active + 30d metrics (org-scoped)", async () => {
    const pool = trackingPool([
      ["total_active", {
        rows: [{
          total_active: 4, escalated: 2, sla_breached: 1,
          notdienst_count: 3, urgent_count: 1
        }]
      }],
      ["total_emergencies_30d", {
        rows: [{
          total_emergencies_30d: 10, responded_count: 8,
          avg_response_minutes: "24.6", sla_met_count: 7,
          sla_breached_count: 2, filled_count: 5
        }]
      }]
    ]);
    const d = await svc.getEmergencyDashboard(pool, "org-1");

    assert.strictEqual(d.active.total, 4);
    assert.strictEqual(d.active.notdienst, 3);
    assert.strictEqual(d.active.urgent, 1);
    assert.strictEqual(d.active.escalated, 2);
    assert.strictEqual(d.active.sla_breached, 1);

    assert.strictEqual(d.metrics_30d.total, 10);
    assert.strictEqual(d.metrics_30d.response_rate, 80);   // 8/10
    assert.strictEqual(d.metrics_30d.avg_response_minutes, 25); // round(24.6)
    assert.strictEqual(d.metrics_30d.sla_met_rate, 70);    // 7/10
    assert.strictEqual(d.metrics_30d.fill_rate, 50);       // 5/10
    assert.strictEqual(d.metrics_30d.sla_breach_rate, 20); // 2/10

    // org filter ⇒ params include orgId on BOTH queries
    assert.deepStrictEqual(pool.calls[0].params, ["org-1"]);
    assert.deepStrictEqual(pool.calls[1].params, ["org-1"]);
  });

  it("handles zero-30d (no division by zero) and null avg", async () => {
    const pool = trackingPool([
      ["total_active", { rows: [{ total_active: 0 }] }],
      ["total_emergencies_30d", { rows: [{ total_emergencies_30d: 0, avg_response_minutes: null }] }]
    ]);
    const d = await svc.getEmergencyDashboard(pool);
    assert.strictEqual(d.metrics_30d.total, 0);
    assert.strictEqual(d.metrics_30d.response_rate, 0);
    assert.strictEqual(d.metrics_30d.sla_met_rate, 0);
    assert.strictEqual(d.metrics_30d.fill_rate, 0);
    assert.strictEqual(d.metrics_30d.sla_breach_rate, 0);
    assert.strictEqual(d.metrics_30d.avg_response_minutes, null);
    // no org filter ⇒ empty params
    assert.deepStrictEqual(pool.calls[0].params, []);
  });

  it("falls back to {} when query returns empty rows", async () => {
    const pool = trackingPool([
      ["total_active", { rows: [] }],
      ["total_emergencies_30d", { rows: [] }]
    ]);
    const d = await svc.getEmergencyDashboard(pool, "o");
    assert.strictEqual(d.active.total, 0);
    assert.strictEqual(d.metrics_30d.total, 0);
  });
});

/* ═══════════════════════════════════════════════════════════════
   recordSupplierResponse
   ═══════════════════════════════════════════════════════════════ */

describe("emergencyStaffingService — recordSupplierResponse", () => {
  it("returns NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([["FROM demand_requests WHERE id = $1", { rows: [] }]]);
    const r = await svc.recordSupplierResponse(pool, "missing", "sup-1");
    assert.deepStrictEqual(r, { error: "NOT_FOUND" });
  });

  it("returns NOT_EMERGENCY for a non-emergency urgency", async () => {
    const pool = trackingPool([
      ["FROM demand_requests WHERE id = $1", { rows: [{ id: "d", urgency: "normal", status: "open" }] }]
    ]);
    const r = await svc.recordSupplierResponse(pool, "d", "sup-1");
    assert.deepStrictEqual(r, { error: "NOT_EMERGENCY" });
  });

  it("returns NOT_OPEN when status not open/partially_covered", async () => {
    const pool = trackingPool([
      ["FROM demand_requests WHERE id = $1", { rows: [{ id: "d", urgency: "notdienst", status: "filled" }] }]
    ]);
    const r = await svc.recordSupplierResponse(pool, "d", "sup-1");
    assert.deepStrictEqual(r, { error: "NOT_OPEN" });
  });

  it("records response idempotently and returns count + first_response_at", async () => {
    const firstAt = "2026-06-23T10:00:00.000Z";
    const pool = trackingPool([
      ["FROM demand_requests WHERE id = $1", { rows: [{ id: "d", urgency: "urgent", status: "open" }] }],
      ["UPDATE demand_requests", {
        rows: [{ supplier_response_count: 3, first_supplier_response_at: firstAt }]
      }]
    ]);
    const r = await svc.recordSupplierResponse(pool, "d", "sup-1");
    assert.strictEqual(r.recorded, true);
    assert.strictEqual(r.response_count, 3);
    assert.strictEqual(r.first_response_at, firstAt);

    // The UPDATE uses COALESCE to preserve the first response time (idempotency)
    const upd = pool.last("UPDATE demand_requests");
    assert.match(upd.sql, /COALESCE\(first_supplier_response_at/);
    assert.match(upd.sql, /supplier_response_count = supplier_response_count \+ 1/);
    assert.deepStrictEqual(upd.params, ["d"]);
  });

  it("accepts partially_covered as an open-enough state", async () => {
    const pool = trackingPool([
      ["FROM demand_requests WHERE id = $1", { rows: [{ id: "d", urgency: "critical", status: "partially_covered" }] }],
      ["UPDATE demand_requests", { rows: [{ supplier_response_count: 1, first_supplier_response_at: "x" }] }]
    ]);
    const r = await svc.recordSupplierResponse(pool, "d", "sup-9");
    assert.strictEqual(r.recorded, true);
    assert.strictEqual(r.response_count, 1);
  });
});

/* ═══════════════════════════════════════════════════════════════
   escalateEmergency
   ═══════════════════════════════════════════════════════════════ */

describe("emergencyStaffingService — escalateEmergency", () => {
  function demandSel(rows) {
    return ["FROM demand_requests WHERE id = $1", { rows }];
  }

  it("returns NOT_FOUND when demand missing", async () => {
    const pool = trackingPool([demandSel([])]);
    assert.deepStrictEqual(await svc.escalateEmergency(pool, "x", "actor"), { error: "NOT_FOUND" });
  });

  it("returns NOT_OPEN when status != open", async () => {
    const pool = trackingPool([demandSel([{ id: "d", urgency: "notdienst", status: "closed", escalation_level: 0 }])]);
    assert.deepStrictEqual(await svc.escalateEmergency(pool, "d", "a"), { error: "NOT_OPEN" });
  });

  it("returns NOT_EMERGENCY for non-emergency urgency", async () => {
    const pool = trackingPool([demandSel([{ id: "d", urgency: "high", status: "open", escalation_level: 0 }])]);
    assert.deepStrictEqual(await svc.escalateEmergency(pool, "d", "a"), { error: "NOT_EMERGENCY" });
  });

  it("returns MAX_ESCALATION_REACHED at level >= 3", async () => {
    const pool = trackingPool([demandSel([{ id: "d", urgency: "notdienst", status: "open", escalation_level: 3 }])]);
    assert.deepStrictEqual(await svc.escalateEmergency(pool, "d", "a"), { error: "MAX_ESCALATION_REACHED" });
  });

  it("increments escalation level and persists the new level (no matches → no dispatch)", async () => {
    const pool = trackingPool([
      demandSel([{
        id: "d", urgency: "critical", status: "open", escalation_level: 1,
        title: "Outage", role: "Sysadmin", location_city: "Hamburg"
      }])
    ]);
    const r = await svc.escalateEmergency(pool, "d", "actor-1");
    assert.deepStrictEqual(r, { escalated: true, new_level: 2 });

    const upd = pool.last("SET escalation_level = $1");
    assert.ok(upd, "expected escalation_level UPDATE");
    assert.deepStrictEqual(upd.params, [2, "d"]);
  });

  it("treats null escalation_level as 0 → first escalation becomes 1", async () => {
    const pool = trackingPool([
      demandSel([{ id: "d", urgency: "urgent", status: "open", escalation_level: null, title: "t", role: "r", location_city: "c" }])
    ]);
    const r = await svc.escalateEmergency(pool, "d", "a");
    assert.deepStrictEqual(r, { escalated: true, new_level: 1 });
  });

  it("still escalates when the re-alert match query throws (non-blocking)", async () => {
    const pool = trackingPool([
      demandSel([{ id: "d", urgency: "notdienst", status: "open", escalation_level: 0, title: "t", role: "r", location_city: "c" }]),
      ["FROM capacity_posts", () => { throw new Error("alert boom"); }]
    ]);
    const r = await svc.escalateEmergency(pool, "d", "a");
    assert.deepStrictEqual(r, { escalated: true, new_level: 1 });
  });
});

/* ═══════════════════════════════════════════════════════════════
   getEmergencyHistory
   ═══════════════════════════════════════════════════════════════ */

describe("emergencyStaffingService — getEmergencyHistory", () => {
  it("maps rows to the slim history shape with derived fields", async () => {
    const pool = trackingPool([
      ["FROM demand_requests dr", {
        rows: [{
          id: "h1", title: "Notfall", role: "Pflege", location_city: "Kiel",
          urgency: "notdienst", status: "filled", sla_status: "MET",
          escalation_level: 2, supplier_response_count: 4,
          first_supplier_response_at: "2026-06-20T08:00:00Z",
          response_minutes: "17.4", created_at: "2026-06-20T07:40:00Z",
          requester_company_name: "Klinik A"
        }]
      }]
    ]);
    const rows = await svc.getEmergencyHistory(pool, "org-1");
    assert.strictEqual(rows.length, 1);
    const h = rows[0];
    assert.strictEqual(h.id, "h1");
    assert.strictEqual(h.urgency_level, "NOTDIENST");
    assert.strictEqual(h.escalation_level, 2);
    assert.strictEqual(h.supplier_response_count, 4);
    assert.strictEqual(h.response_minutes, 17); // rounded
    assert.strictEqual(h.requester_company_name, "Klinik A");
  });

  it("null first_supplier_response_at → response_minutes null; missing counts default to 0", async () => {
    const pool = trackingPool([
      ["FROM demand_requests dr", {
        rows: [{
          id: "h2", title: "t", role: "r", location_city: "c",
          urgency: "urgent", status: "open", sla_status: "RUNNING",
          escalation_level: null, supplier_response_count: null,
          first_supplier_response_at: null, response_minutes: "99",
          created_at: "2026-06-22T00:00:00Z", requester_company_name: null
        }]
      }]
    ]);
    const [h] = await svc.getEmergencyHistory(pool, "org-1");
    assert.strictEqual(h.response_minutes, null);
    assert.strictEqual(h.escalation_level, 0);
    assert.strictEqual(h.supplier_response_count, 0);
  });

  it("clamps limit to 100 and floors offset at 0; threads params [org,limit,offset]", async () => {
    const pool = trackingPool();
    await svc.getEmergencyHistory(pool, "org-9", { limit: 500, offset: -10 });
    assert.deepStrictEqual(pool.calls[0].params, ["org-9", 100, 0]);
  });

  it("applies provided limit/offset and null org for platform-wide", async () => {
    const pool = trackingPool();
    await svc.getEmergencyHistory(pool, null, { limit: 20, offset: 40 });
    assert.deepStrictEqual(pool.calls[0].params, [null, 20, 40]);
  });

  it("uses defaults (limit 50, offset 0) when opts omitted", async () => {
    const pool = trackingPool();
    await svc.getEmergencyHistory(pool, "o");
    assert.deepStrictEqual(pool.calls[0].params, ["o", 50, 0]);
  });
});
