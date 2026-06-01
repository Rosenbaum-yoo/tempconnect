/**
 * Billing Metrics Service unit tests.
 * Covers worker counting, daily metrics, monthly snapshots,
 * plan limits, dashboard, history.
 * Uses mock pool — no database required.
 *
 * Run: node --test --test-force-exit test/billingMetricsService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/billingMetricsService.js";

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

// ═══════════════════════════════════════════════════════════════
// countActiveWorkers / countActiveAssignmentLinks
// ═══════════════════════════════════════════════════════════════

describe("billingMetrics — counting", () => {
  it("countActiveWorkers returns parsed integer", async () => {
    const result = await svc.countActiveWorkers(returnPool([{ cnt: "12" }]), "org-1");
    assert.strictEqual(result, 12);
  });

  it("countActiveWorkers returns 0 when no rows", async () => {
    const result = await svc.countActiveWorkers(returnPool([{ cnt: null }]), "org-1");
    assert.strictEqual(result, 0);
  });

  it("countActiveAssignmentLinks returns parsed integer", async () => {
    const result = await svc.countActiveAssignmentLinks(returnPool([{ cnt: "5" }]), "org-1");
    assert.strictEqual(result, 5);
  });

  it("countActiveAssignmentLinks returns 0 on empty", async () => {
    const result = await svc.countActiveAssignmentLinks(returnPool([{}]), "org-1");
    assert.strictEqual(result, 0);
  });

  it("countActiveAssignmentLinks only counts lifecycle-current assignments", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        return { rows: [{ cnt: "0" }] };
      }
    };
    await svc.countActiveAssignmentLinks(pool, "org-1");
    assert.match(calls[0].sql, /active','ends_today/);
  });
});

// ═══════════════════════════════════════════════════════════════
// recordDailyMetrics
// ═══════════════════════════════════════════════════════════════

describe("billingMetrics — recordDailyMetrics", () => {
  it("records 5 metric types for an org", async () => {
    let queryCount = 0;
    const pool = {
      query: async () => {
        queryCount++;
        // First 2: countActiveWorkers, countActiveAssignmentLinks
        if (queryCount <= 2) return { rows: [{ cnt: "3" }] };
        // 3rd: timesheet counts
        if (queryCount === 3) return { rows: [{ submitted: "10", approved: "8" }] };
        // 4th-8th: INSERT for each metric
        return { rows: [{ org_id: "org-1", metric_type: "test", value: 3 }] };
      }
    };
    const result = await svc.recordDailyMetrics(pool, "org-1", "2026-03-01");
    assert.strictEqual(result.date, "2026-03-01");
    assert.strictEqual(result.orgId, "org-1");
    assert.strictEqual(result.metrics.length, 5);
  });

  it("uses current date when dateStr is null", async () => {
    let queryCount = 0;
    const pool = {
      query: async () => {
        queryCount++;
        if (queryCount <= 2) return { rows: [{ cnt: "0" }] };
        if (queryCount === 3) return { rows: [{ submitted: "0", approved: "0" }] };
        return { rows: [{ metric_type: "test" }] };
      }
    };
    const result = await svc.recordDailyMetrics(pool, "org-1");
    assert.ok(result.date.match(/^\d{4}-\d{2}-\d{2}$/));
  });
});

// ═══════════════════════════════════════════════════════════════
// takeMonthlySnapshot
// ═══════════════════════════════════════════════════════════════

describe("billingMetrics — takeMonthlySnapshot", () => {
  it("creates snapshot from peak metrics", async () => {
    const pool = sequencePool(
      { rows: [{ peak_workers: "10", peak_seats: "10" }] },  // peak query
      { rows: [{ submitted: "20", approved: "15" }] },         // timesheet query
      { rows: [{ plan: "PLUS" }] },                            // plan query
      { rows: [{ org_id: "org-1", snapshot_month: "2026-03", active_workers: 10 }] } // upsert
    );
    const result = await svc.takeMonthlySnapshot(pool, "org-1", "2026-03");
    assert.ok(result.snapshot);
    assert.strictEqual(result.snapshot.active_workers, 10);
  });

  it("handles null peaks gracefully", async () => {
    const pool = sequencePool(
      { rows: [{ peak_workers: null, peak_seats: null }] },
      { rows: [{ submitted: null, approved: null }] },
      { rows: [] },  // no plan
      { rows: [{ org_id: "org-1", snapshot_month: "2026-03", active_workers: 0 }] }
    );
    const result = await svc.takeMonthlySnapshot(pool, "org-1", "2026-03");
    assert.strictEqual(result.snapshot.active_workers, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getPlanUsageRules
// ═══════════════════════════════════════════════════════════════

describe("billingMetrics — getPlanUsageRules", () => {
  it("returns rules as map by metric_type", async () => {
    const rows = [
      { metric_type: "active_workers", included_units: 10, max_units: 50 },
      { metric_type: "worker_seats", included_units: 10, max_units: 50 }
    ];
    const result = await svc.getPlanUsageRules(returnPool(rows), "PLUS");
    assert.ok(result.active_workers);
    assert.strictEqual(result.active_workers.included_units, 10);
    assert.ok(result.worker_seats);
  });

  it("returns empty map when no rules", async () => {
    const result = await svc.getPlanUsageRules(returnPool([]), "FREE");
    assert.deepStrictEqual(result, {});
  });
});

// ═══════════════════════════════════════════════════════════════
// checkPlanLimits
// ═══════════════════════════════════════════════════════════════

describe("billingMetrics — checkPlanLimits", () => {
  it("returns null plan when no subscription found", async () => {
    const pool = returnPool([]); // no plan row
    const result = await svc.checkPlanLimits(pool, "org-1");
    assert.strictEqual(result.plan, null);
    assert.strictEqual(result.hard_blocked, false);
  });

  it("detects hard block when at max", async () => {
    let queryCount = 0;
    const pool = {
      query: async () => {
        queryCount++;
        // 1st: plan lookup
        if (queryCount === 1) return { rows: [{ plan: "BASIS" }] };
        // 2nd: getPlanUsageRules
        if (queryCount === 2) return { rows: [{ metric_type: "active_workers", included_units: 5, max_units: 10, is_active: true }] };
        // 3rd: countActiveWorkers
        return { rows: [{ cnt: "10" }] };
      }
    };
    const result = await svc.checkPlanLimits(pool, "org-1");
    assert.strictEqual(result.plan, "BASIS");
    assert.strictEqual(result.hard_blocked, true);
    assert.ok(result.warnings.length > 0);
  });

  it("reports overage when above included but below max", async () => {
    let queryCount = 0;
    const pool = {
      query: async () => {
        queryCount++;
        if (queryCount === 1) return { rows: [{ plan: "PLUS" }] };
        if (queryCount === 2) return { rows: [{ metric_type: "active_workers", included_units: 5, max_units: 20, is_active: true }] };
        return { rows: [{ cnt: "8" }] };
      }
    };
    const result = await svc.checkPlanLimits(pool, "org-1");
    assert.strictEqual(result.hard_blocked, false);
    assert.strictEqual(result.checks[0].overage, 3);
    assert.ok(result.warnings.length > 0);
  });

  it("no warnings when below included", async () => {
    let queryCount = 0;
    const pool = {
      query: async () => {
        queryCount++;
        if (queryCount === 1) return { rows: [{ plan: "PRO" }] };
        if (queryCount === 2) return { rows: [{ metric_type: "active_workers", included_units: 50, max_units: null, is_active: true }] };
        return { rows: [{ cnt: "3" }] };
      }
    };
    const result = await svc.checkPlanLimits(pool, "org-1");
    assert.strictEqual(result.hard_blocked, false);
    assert.strictEqual(result.warnings.length, 0);
  });

  it("handles unlimited included_units (-1)", async () => {
    let queryCount = 0;
    const pool = {
      query: async () => {
        queryCount++;
        if (queryCount === 1) return { rows: [{ plan: "PRO" }] };
        if (queryCount === 2) return { rows: [{ metric_type: "active_workers", included_units: -1, max_units: null, is_active: true }] };
        return { rows: [{ cnt: "100" }] };
      }
    };
    const result = await svc.checkPlanLimits(pool, "org-1");
    assert.strictEqual(result.checks[0].included, null);
    assert.strictEqual(result.checks[0].overage, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getDashboardMetrics
// ═══════════════════════════════════════════════════════════════

describe("billingMetrics — getDashboardMetrics", () => {
  it("aggregates workers, links, limits, week, snapshots", async () => {
    const pool = {
      query: async (sql) => {
        if (sql.includes("worker_assignment_links")) return { rows: [{ cnt: "3" }] };
        if (sql.includes("worker_profiles")) return { rows: [{ cnt: "5" }] };
        if (sql.includes("subscriptions")) return { rows: [] }; // no plan
        if (sql.includes("worker_time_submissions")) return { rows: [{ pending: 2, in_review: 1 }] };
        if (sql.includes("worker_billing_snapshots")) return { rows: [{ snapshot_month: "2026-02" }] };
        return { rows: [] };
      }
    };
    const result = await svc.getDashboardMetrics(pool, "org-1");
    assert.strictEqual(result.active_workers, 5);
    assert.strictEqual(result.active_assignments, 3);
    assert.ok(result.plan_limits);
    assert.ok(result.snapshots);
  });
});

// ═══════════════════════════════════════════════════════════════
// Metrics history
// ═══════════════════════════════════════════════════════════════

describe("billingMetrics — history", () => {
  it("getMetricsHistory returns rows", async () => {
    const rows = [{ metric_date: "2026-03-01", value: 5 }];
    const result = await svc.getMetricsHistory(returnPool(rows), "org-1");
    assert.strictEqual(result.length, 1);
  });

  it("getMetricsHistory with custom params", async () => {
    const result = await svc.getMetricsHistory(returnPool([]), "org-1", { metricType: "worker_seats", days: 30 });
    assert.deepStrictEqual(result, []);
  });

  it("getMonthlySnapshots returns rows", async () => {
    const rows = [{ snapshot_month: "2026-02" }, { snapshot_month: "2026-01" }];
    const result = await svc.getMonthlySnapshots(returnPool(rows), "org-1", 6);
    assert.strictEqual(result.length, 2);
  });
});
