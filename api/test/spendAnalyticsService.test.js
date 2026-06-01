/**
 * Spend Analytics Service unit tests.
 * Covers getSpendSummary, getSpendByVendor, getSpendByCategory,
 * getSpendByRegion, getSpendOverTime, getRateComparison,
 * getTopCostDrivers, getSpendTrends.
 *
 * Run: node --test --test-force-exit test/spendAnalyticsService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/spendAnalyticsService.js";

// ── Mock helpers ──────────────────────────────────────────────

function returnPool(rows = []) {
  return { query: async () => ({ rows }) };
}

function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) return { rows: [] };
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function tracingPool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (idx >= responses.length) return { rows: [] };
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// getSpendSummary
// ═══════════════════════════════════════════════════════════════

describe("spendAnalyticsService — getSpendSummary", () => {
  it("returns KPI aggregates with defaults", async () => {
    const mainRow = {
      total_spend_cents: 500000, overtime_spend_cents: 50000,
      assignment_count: 10, vendor_count: 3, avg_rate_cents: 3500,
      timesheet_count: 40, total_hours: "320.00"
    };
    const projRow = { projected_spend_cents: 1200000, active_assignments: 5 };
    const pool = sequencePool(
      { rows: [mainRow] },
      { rows: [projRow] },
      new Error("rate_cards does not exist")  // graceful degradation
    );
    const result = await svc.getSpendSummary(pool, "org-1");
    assert.strictEqual(result.total_spend_cents, 500000);
    assert.strictEqual(result.overtime_spend_cents, 50000);
    assert.strictEqual(result.projected_spend_cents, 1200000);
    assert.strictEqual(result.over_rate_spend_cents, 0);
    assert.strictEqual(result.assignment_count, 10);
    assert.strictEqual(result.vendor_count, 3);
    assert.strictEqual(result.total_hours, 320);
  });

  it("returns zeros when no data", async () => {
    const pool = sequencePool(
      { rows: [{ total_spend_cents: 0, overtime_spend_cents: 0, assignment_count: 0, vendor_count: 0, avg_rate_cents: null, timesheet_count: 0, total_hours: "0.00" }] },
      { rows: [{ projected_spend_cents: 0, active_assignments: 0 }] },
      new Error("no table")
    );
    const result = await svc.getSpendSummary(pool, "org-empty");
    assert.strictEqual(result.total_spend_cents, 0);
    assert.strictEqual(result.active_assignments, 0);
  });

  it("includes over-rate spend when rate cards available", async () => {
    const mainRow = { total_spend_cents: 100000, overtime_spend_cents: 0, assignment_count: 2, vendor_count: 1, avg_rate_cents: 4000, timesheet_count: 8, total_hours: "40.00" };
    const projRow = { projected_spend_cents: 0, active_assignments: 0 };
    const overRow = { over_rate_spend_cents: 15000, over_rate_count: 1 };
    const pool = sequencePool(
      { rows: [mainRow] },
      { rows: [projRow] },
      { rows: [overRow] }
    );
    const result = await svc.getSpendSummary(pool, "org-1");
    assert.strictEqual(result.over_rate_spend_cents, 15000);
    assert.strictEqual(result.over_rate_count, 1);
  });

  it("applies date filters", async () => {
    const pool = sequencePool(
      { rows: [{ total_spend_cents: 0, overtime_spend_cents: 0, assignment_count: 0, vendor_count: 0, avg_rate_cents: null, timesheet_count: 0, total_hours: "0.00" }] },
      { rows: [{ projected_spend_cents: 0, active_assignments: 0 }] },
      new Error("no table")
    );
    const result = await svc.getSpendSummary(pool, "org-1", { dateFrom: "2026-01-01", dateTo: "2026-03-31" });
    assert.strictEqual(result.total_spend_cents, 0);
  });

  it("applies vendor filter consistently across summary queries", async () => {
    const pool = tracingPool(
      { rows: [{ total_spend_cents: 0, overtime_spend_cents: 0, assignment_count: 0, vendor_count: 0, avg_rate_cents: null, timesheet_count: 0, total_hours: "0.00" }] },
      { rows: [{ projected_spend_cents: 0, active_assignments: 0 }] },
      new Error("no table")
    );
    await svc.getSpendSummary(pool, "org-1", { vendorId: "sup-1" });
    assert.ok(pool.calls[0].params.includes("sup-1"));
    assert.ok(pool.calls[1].params.includes("sup-1"));
    assert.ok(pool.calls[2].params.includes("sup-1"));
  });

  it("uses numeric day-difference projection instead of invalid epoch extraction", async () => {
    const pool = tracingPool(
      { rows: [{ total_spend_cents: 0, overtime_spend_cents: 0, assignment_count: 0, vendor_count: 0, avg_rate_cents: null, timesheet_count: 0, total_hours: "0.00" }] },
      { rows: [{ projected_spend_cents: 0, active_assignments: 0 }] },
      new Error("no table")
    );
    await svc.getSpendSummary(pool, "org-1");
    assert.match(String(pool.calls[1]?.sql || ""), /CURRENT_DATE \+ 90\) - CURRENT_DATE/);
    assert.doesNotMatch(String(pool.calls[1]?.sql || ""), /EXTRACT\(EPOCH/i);
  });

  it("leitet locationId als SQL-Parameter an alle Spend-Queries weiter", async () => {
    const pool = tracingPool(
      { rows: [{ total_spend_cents: 0, overtime_spend_cents: 0, assignment_count: 0, vendor_count: 0, avg_rate_cents: null, timesheet_count: 0, total_hours: "0.00" }] },
      { rows: [{ projected_spend_cents: 0, active_assignments: 0 }] },
      new Error("no rate_cards table")
    );
    await svc.getSpendSummary(pool, "org-1", { locationId: "loc-scope-test" });
    assert.ok(pool.calls[0].params.includes("loc-scope-test"),
      "Hauptquery muss locationId als Parameter enthalten");
    assert.ok(pool.calls[1].params.includes("loc-scope-test"),
      "Projected-Spend-Query muss locationId als Parameter enthalten");
  });

  it("restricts projected spend to lifecycle-current assignments", async () => {
    const pool = tracingPool(
      { rows: [{ total_spend_cents: 0, overtime_spend_cents: 0, assignment_count: 0, vendor_count: 0, avg_rate_cents: null, timesheet_count: 0, total_hours: "0.00" }] },
      { rows: [{ projected_spend_cents: 0, active_assignments: 0 }] },
      new Error("no table")
    );
    await svc.getSpendSummary(pool, "org-1");
    assert.match(String(pool.calls[1]?.sql || ""), /active','ends_today/);
  });
});

// ═══════════════════════════════════════════════════════════════
// getSpendByVendor
// ═══════════════════════════════════════════════════════════════

describe("spendAnalyticsService — getSpendByVendor", () => {
  it("returns vendor spend breakdown", async () => {
    const rows = [
      { supplier_org_id: "v-1", supplier_name: "Agency A", spend_cents: 300000, hours: "160.00", avg_rate_cents: 3500, assignment_count: 5 },
      { supplier_org_id: "v-2", supplier_name: "Agency B", spend_cents: 150000, hours: "80.00", avg_rate_cents: 3000, assignment_count: 3 }
    ];
    const pool = returnPool(rows);
    const result = await svc.getSpendByVendor(pool, "org-1");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].supplier_name, "Agency A");
    assert.strictEqual(result[0].spend_cents, 300000);
  });

  it("returns empty for no data", async () => {
    const result = await svc.getSpendByVendor(returnPool([]), "org-empty");
    assert.strictEqual(result.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getSpendByCategory
// ═══════════════════════════════════════════════════════════════

describe("spendAnalyticsService — getSpendByCategory", () => {
  it("returns category breakdown", async () => {
    const rows = [
      { category: "Pflege", spend_cents: 200000, hours: "100.00", avg_rate_cents: 2800, assignment_count: 4 },
      { category: "Schweißer", spend_cents: 180000, hours: "60.00", avg_rate_cents: 4000, assignment_count: 2 }
    ];
    const pool = returnPool(rows);
    const result = await svc.getSpendByCategory(pool, "org-1");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].category, "Pflege");
  });

  it("returns empty for no data", async () => {
    const result = await svc.getSpendByCategory(returnPool([]), "org-empty");
    assert.strictEqual(result.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getSpendByRegion
// ═══════════════════════════════════════════════════════════════

describe("spendAnalyticsService — getSpendByRegion", () => {
  it("returns region breakdown", async () => {
    const rows = [
      { region: "München", spend_cents: 250000, hours: "120.00", avg_rate_cents: 3200, assignment_count: 6 }
    ];
    const pool = returnPool(rows);
    const result = await svc.getSpendByRegion(pool, "org-1");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].region, "München");
  });
});

// ═══════════════════════════════════════════════════════════════
// getSpendOverTime
// ═══════════════════════════════════════════════════════════════

describe("spendAnalyticsService — getSpendOverTime", () => {
  it("returns monthly time series", async () => {
    const rows = [
      { period: "2026-01-01", spend_cents: 100000, hours: "40.00", avg_rate_cents: 3500, assignment_count: 3 },
      { period: "2026-02-01", spend_cents: 120000, hours: "48.00", avg_rate_cents: 3500, assignment_count: 3 }
    ];
    const pool = returnPool(rows);
    const result = await svc.getSpendOverTime(pool, "org-1");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[1].spend_cents, 120000);
  });

  it("returns empty for no data", async () => {
    const result = await svc.getSpendOverTime(returnPool([]), "org-empty");
    assert.strictEqual(result.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getRateComparison
// ═══════════════════════════════════════════════════════════════

describe("spendAnalyticsService — getRateComparison", () => {
  it("returns rate comparison data", async () => {
    const rows = [
      { category: "Pflege", supplier_name: "Agency A", actual_avg_cents: 3200, target_avg_cents: 2800, max_avg_cents: 3500, deviation_cents: 400, deviation_pct: 14.3, assignment_count: 3 }
    ];
    const pool = returnPool(rows);
    const result = await svc.getRateComparison(pool, "org-1");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].deviation_cents, 400);
  });

  it("returns empty array on error (graceful degradation)", async () => {
    const pool = { query: async () => { throw new Error("rate_cards does not exist"); } };
    const result = await svc.getRateComparison(pool, "org-1");
    assert.deepStrictEqual(result, []);
  });

  it("applies vendor filter to rate comparison query", async () => {
    const pool = tracingPool({ rows: [] });
    const result = await svc.getRateComparison(pool, "org-1", { vendorId: "sup-1" });
    assert.deepStrictEqual(result, []);
    assert.ok(pool.calls[0].params.includes("sup-1"));
  });
});

// ═══════════════════════════════════════════════════════════════
// getTopCostDrivers
// ═══════════════════════════════════════════════════════════════

describe("spendAnalyticsService — getTopCostDrivers", () => {
  it("returns top cost drivers", async () => {
    const rows = [
      { category: "IT-Support", supplier_name: "TechCorp", spend_cents: 500000, hours: "200.00", avg_rate_cents: 5000, assignment_count: 4 },
      { category: "Pflege", supplier_name: "CareGmbH", spend_cents: 300000, hours: "150.00", avg_rate_cents: 2800, assignment_count: 6 }
    ];
    const pool = returnPool(rows);
    const result = await svc.getTopCostDrivers(pool, "org-1");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].category, "IT-Support");
    assert.strictEqual(result[0].spend_cents, 500000);
  });

  it("returns empty for no data", async () => {
    const result = await svc.getTopCostDrivers(returnPool([]), "org-empty");
    assert.strictEqual(result.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getSpendTrends
// ═══════════════════════════════════════════════════════════════

describe("spendAnalyticsService — getSpendTrends", () => {
  it("returns MoM trends with change percentage", async () => {
    const rows = [
      { period: "2026-01-01", spend_cents: 100000, hours: "40.00", prev_spend_cents: null, mom_change_pct: null },
      { period: "2026-02-01", spend_cents: 120000, hours: "48.00", prev_spend_cents: 100000, mom_change_pct: 20.0 },
      { period: "2026-03-01", spend_cents: 90000, hours: "36.00", prev_spend_cents: 120000, mom_change_pct: -25.0 }
    ];
    const pool = returnPool(rows);
    const result = await svc.getSpendTrends(pool, "org-1");
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].mom_change_pct, null);
    assert.strictEqual(result[1].mom_change_pct, 20.0);
    assert.strictEqual(result[2].mom_change_pct, -25.0);
  });

  it("returns empty for no data", async () => {
    const result = await svc.getSpendTrends(returnPool([]), "org-empty");
    assert.strictEqual(result.length, 0);
  });

  it("applies custom dateFrom filter", async () => {
    const pool = returnPool([]);
    const result = await svc.getSpendTrends(pool, "org-1", { dateFrom: "2025-06-01" });
    assert.strictEqual(result.length, 0);
  });

  it("applies vendor, category, and region filters to trends", async () => {
    const pool = tracingPool({ rows: [] });
    const result = await svc.getSpendTrends(pool, "org-1", { vendorId: "sup-9", category: "Pflege", region: "Berlin" });
    assert.strictEqual(result.length, 0);
    assert.ok(pool.calls[0].params.includes("sup-9"));
    assert.ok(pool.calls[0].params.includes("%Pflege%"));
    assert.ok(pool.calls[0].params.includes("%Berlin%"));
  });
});
