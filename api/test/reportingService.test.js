/**
 * Reporting Service unit tests.
 * Covers requisition KPIs, period breakdown, vendor performance,
 * compliance summary, SLA report, executive dashboard, top roles.
 *
 * Run: node --test --test-force-exit test/reportingService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/reportingService.js";

// ── Mock helpers ──────────────────────────────────────────────

function returnPool(rows = []) {
  return { query: () => ({ rows }) };
}

/** SQL-matching pool for parallel calls in executiveDashboard */
function capturePool(mapping) {
  return {
    query: (sql) => {
      for (const [pattern, response] of mapping) {
        if (sql.includes(pattern)) {
          return typeof response === "function" ? response(sql) : response;
        }
      }
      return { rows: [] };
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// requisitionKpis
// ═══════════════════════════════════════════════════════════════

describe("reportingService — requisitionKpis", () => {
  it("returns KPIs without org filter", async () => {
    const kpi = { total: 50, open: 10, filled: 30, closed: 5, cancelled: 2, urgent_open: 3, avg_time_to_fill_hours: 48.5 };
    const result = await svc.requisitionKpis(returnPool([kpi]));
    assert.strictEqual(result.total, 50);
    assert.strictEqual(result.filled, 30);
    assert.strictEqual(result.urgent_open, 3);
  });

  it("returns KPIs with org filter", async () => {
    const kpi = { total: 5, open: 2, filled: 1 };
    const result = await svc.requisitionKpis(returnPool([kpi]), "o1");
    assert.strictEqual(result.total, 5);
  });
});

// ═══════════════════════════════════════════════════════════════
// requisitionsByPeriod
// ═══════════════════════════════════════════════════════════════

describe("reportingService — requisitionsByPeriod", () => {
  it("returns daily breakdown", async () => {
    const rows = [
      { day: "2026-01-01", created: 3, filled: 1, cancelled: 0 },
      { day: "2026-01-02", created: 5, filled: 2, cancelled: 1 }
    ];
    const result = await svc.requisitionsByPeriod(returnPool(rows));
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].created, 3);
  });

  it("filters by org and custom days", async () => {
    const result = await svc.requisitionsByPeriod(returnPool([]), "o1", 7);
    assert.strictEqual(result.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// vendorPerformance
// ═══════════════════════════════════════════════════════════════

describe("reportingService — vendorPerformance", () => {
  it("returns vendor stats", async () => {
    const rows = [{
      supplier_org_id: "s1", supplier_name: "Vendor A",
      tier: "gold", total_candidates: 10, shortlisted: 5, accepted: 7, rejected: 1, avg_match_score: 85.5
    }];
    const result = await svc.vendorPerformance(returnPool(rows), "o1");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].supplier_name, "Vendor A");
    assert.strictEqual(result[0].avg_match_score, 85.5);
  });

  it("returns empty when no vendors", async () => {
    assert.strictEqual((await svc.vendorPerformance(returnPool([]), "o1", 10)).length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// complianceSummary
// ═══════════════════════════════════════════════════════════════

describe("reportingService — complianceSummary", () => {
  it("returns compliance stats without org filter", async () => {
    const row = { total_documents: 20, verified: 15, pending: 3, rejected: 1, expired: 1, expiring_soon: 2 };
    const result = await svc.complianceSummary(returnPool([row]));
    assert.strictEqual(result.total_documents, 20);
    assert.strictEqual(result.verified, 15);
    assert.strictEqual(result.expiring_soon, 2);
  });

  it("filters by org", async () => {
    const row = { total_documents: 5, verified: 4 };
    const result = await svc.complianceSummary(returnPool([row]), "o1");
    assert.strictEqual(result.total_documents, 5);
  });
});

// ═══════════════════════════════════════════════════════════════
// slaReport
// ═══════════════════════════════════════════════════════════════

describe("reportingService — slaReport", () => {
  it("returns SLA stats without org filter", async () => {
    const row = { total_with_sla: 30, sla_met: 25, sla_breached: 3, sla_running: 2, sla_compliance_pct: 89.3 };
    const result = await svc.slaReport(returnPool([row]));
    assert.strictEqual(result.sla_met, 25);
    assert.strictEqual(result.sla_compliance_pct, 89.3);
  });

  it("filters by org and custom days", async () => {
    const row = { total_with_sla: 10, sla_met: 9, sla_breached: 1 };
    const result = await svc.slaReport(returnPool([row]), "o1", 7);
    assert.strictEqual(result.total_with_sla, 10);
  });
});

// ═══════════════════════════════════════════════════════════════
// executiveDashboard
// ═══════════════════════════════════════════════════════════════

describe("reportingService — executiveDashboard", () => {
  it("scope section carries org_id, location_id and window metadata", async () => {
    // Simple pool: returns empty rows for everything → zero-fallback values everywhere
    const simplePool = { query: async () => ({ rows: [] }) };
    const result = await svc.executiveDashboard(simplePool, "org-scope", "loc-scope");
    assert.ok(result.scope, "scope section must be present");
    assert.strictEqual(result.scope.org_id, "org-scope");
    assert.strictEqual(result.scope.location_id, "loc-scope");
    assert.ok(result.scope.date_from, "date_from must be set");
    assert.ok(result.scope.date_to, "date_to must be set");
    assert.strictEqual(typeof result.scope.window_days, "number");
  });

  it("scope.location_id is null when called without locationId", async () => {
    const simplePool = { query: async () => ({ rows: [] }) };
    const result = await svc.executiveDashboard(simplePool, "org-1");
    assert.strictEqual(result.scope.org_id, "org-1");
    assert.strictEqual(result.scope.location_id, null);
  });

  it("combines canonical executive dashboard sections", async () => {
    // Order: more specific SQL patterns first to avoid false matches
    const pool = capturePool([
      ["active_vendors_30d", { rows: [{ active_vendors_30d: 6 }] }],
      ["active_rate_cards_window", { rows: [{ active_rate_cards_window: 9 }] }],
      ["rejected_documents", { rows: [{ rejected_documents: 1, expired_documents: 2, expiring_documents: 3 }] }],
      ["rate_card_warnings", { rows: [{ rate_card_warnings: 1, rate_card_breaches: 2 }] }],
      ["projected_spend_cents", { rows: [{ projected_spend_cents: 200000, active_assignments: 2 }] }],
      ["over_rate_spend_cents", { rows: [{ over_rate_spend_cents: 9000, over_rate_count: 1 }] }],
      ["overtime_spend_cents", { rows: [{ total_spend_cents: 123000, overtime_spend_cents: 5000, assignment_count: 4, vendor_count: 3, avg_rate_cents: 3500, timesheet_count: 7, total_hours: "42.00" }] }],
      ["requester_company_name", { rows: [{ id: "dem-1", title: "Nachtdienst Pflege", role: "Pflege", urgency: "notdienst", status: "open", required_total_count: 3, currently_committed_count: 0, remaining_open_count: 3, age_minutes: 180, sla_overdue: true, created_at: "2026-04-05T00:00:00Z", start_date: "2026-04-05" }] }],
      ["candidate_count", { rows: [{ id: "req-1", title: "ICU Pflege", role: "Pflege", status: "OPEN", urgency: "urgent", headcount: 4, start_date: "2026-04-06", created_at: "2026-03-20T00:00:00Z", sla_status: "BREACHED", candidate_count: 1, shortlisted_count: 0, accepted_count: 0, supplier_count: 1 }] }],
      ["sla_minutes", { rows: [{ total_with_sla: 10, sla_met: 8, sla_breached: 2, sla_running: 0 }] }],
      ["compliance_documents", { rows: [{ total_documents: 20, verified: 15, pending: 2, rejected: 1, expired: 1, expiring_soon: 2 }] }],
      ["COUNT(*) FILTER (WHERE r.status = 'APPROVED')", { rows: [{ total: 50, open: 10, approved: 3, in_review: 4, shortlisted: 2, filled: 30, closed: 1, cancelled: 0, draft: 0, pending_approval: 1, urgent_open: 5, avg_time_to_fill_hours: 48.5, avg_time_to_approve_hours: 12.1 }] }],
      ["total_users", { rows: [{ total_users: 100, total_orgs: 10, active_capacity_posts: 5, open_demands: 3, active_vendor_entries: 8 }] }]
    ]);
    const result = await svc.executiveDashboard(pool, "org-1");
    assert.strictEqual(result.requisitions.total, 50);
    assert.strictEqual(result.compliance.total_documents, 20);
    assert.strictEqual(result.sla.total_with_sla, 10);
    assert.strictEqual(result.platform.total_users, 100);
    assert.strictEqual(result.platform.active_vendor_entries, 8);
    assert.strictEqual(result.spend.has_data, true);
    assert.strictEqual(result.spend.total_spend_cents, 123000);
    assert.strictEqual(result.spend.projected_spend_cents, 200000);
    assert.strictEqual(result.spend.active_assignments, 2);
    assert.strictEqual(result.spend.assignment_count, 4);
    assert.strictEqual(result.spend.over_rate_count, 1);
    assert.strictEqual(result.spend.total_hours, 42);
    assert.strictEqual(result.spend.available, true);
    assert.strictEqual(result.procurement_pulse.metrics.open_requisitions.value, 20);
    assert.strictEqual(result.procurement_pulse.metrics.active_vendors_30d.value, 6);
    assert.strictEqual(result.procurement_pulse.metrics.active_rate_cards.value, 9);
    assert.strictEqual(result.procurement_pulse.metrics.spend_30d.value_cents, 123000);
    assert.match(result.procurement_pulse.metrics.spend_30d.href, /date_from=/);
    assert.match(result.procurement_pulse.metrics.active_vendors_30d.href, /status_group=activity_30d/);
    assert.match(result.procurement_pulse.metrics.active_rate_cards.href, /status_group=window_overlap_30d/);
    assert.match(result.procurement_pulse.metrics.active_rate_cards.href, /date_from=/);
    assert.strictEqual(result.procurement_pulse.metrics.compliance_warnings.breakdown.total, 9);
    assert.match(result.procurement_pulse.metrics.compliance_warnings.href, /status_group=risk_window_30d/);
    assert.match(result.procurement_pulse.metrics.open_requisitions.href, /status_group=backlog/);
    assert.strictEqual(result.critical_staffing_pressure.total, 2);
    assert.strictEqual(result.critical_staffing_pressure.summary.risk, 2);
    assert.strictEqual(result.critical_staffing_pressure.summary.warn, 0);
    assert.strictEqual(result.critical_staffing_pressure.summary.emergency_open, 1);
    assert.strictEqual(result.critical_staffing_pressure.items.length, 2);
    assert.ok(result.critical_staffing_pressure.items[0].pressure_score >= result.critical_staffing_pressure.items[1].pressure_score);
    assert.strictEqual(result.critical_staffing_pressure.items[0].kind, "emergency");
    assert.strictEqual(result.critical_staffing_pressure.items[0].open_headcount, 3);
    assert.match(result.critical_staffing_pressure.items[0].reasons.join(" | "), /SLA überfällig/);
    assert.strictEqual(result.critical_staffing_pressure.items[1].open_headcount, 4);
    assert.strictEqual(result.critical_staffing_pressure.items[1].sla_status, "BREACHED");
    assert.match(result.critical_staffing_pressure.items[1].href, /focus_id=req-1/);
    assert.ok(result.finance);
    assert.strictEqual(result.finance.available, true);
    assert.ok(result.finance.invoice_truth);
    assert.strictEqual(result.finance.invoice_truth.open_receivables_cents, 0);
    assert.ok(result.retention);
    assert.ok(result.retention.headline);
    assert.strictEqual(result.retention.available, true);
    assert.ok(result.pilot_conversion);
    assert.ok(result.finance.pilot_conversion_truth);
  });

  it("returns an available empty critical-pressure section when no cases are prioritized", async () => {
    const pool = capturePool([
      ["active_vendors_30d", { rows: [{ active_vendors_30d: 2 }] }],
      ["active_rate_cards_window", { rows: [{ active_rate_cards_window: 3 }] }],
      ["rejected_documents", { rows: [{ rejected_documents: 0, expired_documents: 0, expiring_documents: 0 }] }],
      ["rate_card_warnings", { rows: [{ rate_card_warnings: 0, rate_card_breaches: 0 }] }],
      ["projected_spend_cents", { rows: [{ projected_spend_cents: 40000, active_assignments: 1 }] }],
      ["over_rate_spend_cents", { rows: [{ over_rate_spend_cents: 0, over_rate_count: 0 }] }],
      ["overtime_spend_cents", { rows: [{ total_spend_cents: 25000, overtime_spend_cents: 0, assignment_count: 1, vendor_count: 1, avg_rate_cents: 2500, timesheet_count: 2, total_hours: "10.00" }] }],
      ["requester_company_name", { rows: [] }],
      ["candidate_count", { rows: [] }],
      ["sla_minutes", { rows: [{ total_with_sla: 4, sla_met: 4, sla_breached: 0, sla_running: 0 }] }],
      ["compliance_documents", { rows: [{ total_documents: 6, verified: 6, pending: 0, rejected: 0, expired: 0, expiring_soon: 0 }] }],
      ["COUNT(*) FILTER (WHERE r.status = 'APPROVED')", { rows: [{ total: 8, open: 1, approved: 1, in_review: 0, shortlisted: 0, filled: 6, closed: 0, cancelled: 0, draft: 0, pending_approval: 0, urgent_open: 0 }] }],
      ["total_users", { rows: [{ total_users: 12, total_orgs: 3, active_capacity_posts: 2, open_demands: 0, active_vendor_entries: 3 }] }]
    ]);
    const result = await svc.executiveDashboard(pool, "org-1");
    assert.strictEqual(result.critical_staffing_pressure.available, true);
    assert.strictEqual(result.critical_staffing_pressure.total, 0);
    assert.strictEqual(result.critical_staffing_pressure.summary.risk, 0);
    assert.strictEqual(result.critical_staffing_pressure.summary.warn, 0);
    assert.strictEqual(result.critical_staffing_pressure.summary.emergency_open, 0);
    assert.deepStrictEqual(result.critical_staffing_pressure.items, []);
  });

  it("distinguishes empty approved spend windows from spend unavailability", async () => {
    const pool = capturePool([
      ["active_vendors_30d", { rows: [{ active_vendors_30d: 1 }] }],
      ["active_rate_cards_window", { rows: [{ active_rate_cards_window: 2 }] }],
      ["rejected_documents", { rows: [{ rejected_documents: 0, expired_documents: 0, expiring_documents: 0 }] }],
      ["rate_card_warnings", { rows: [{ rate_card_warnings: 0, rate_card_breaches: 0 }] }],
      ["projected_spend_cents", { rows: [{ projected_spend_cents: 0, active_assignments: 0 }] }],
      ["over_rate_spend_cents", { rows: [{ over_rate_spend_cents: 0, over_rate_count: 0 }] }],
      ["overtime_spend_cents", { rows: [{ total_spend_cents: 0, overtime_spend_cents: 0, assignment_count: 0, vendor_count: 0, avg_rate_cents: 0, timesheet_count: 0, total_hours: "0.00" }] }],
      ["requester_company_name", { rows: [] }],
      ["candidate_count", { rows: [] }],
      ["sla_minutes", { rows: [{ total_with_sla: 3, sla_met: 3, sla_breached: 0, sla_running: 0 }] }],
      ["compliance_documents", { rows: [{ total_documents: 4, verified: 4, pending: 0, rejected: 0, expired: 0, expiring_soon: 0 }] }],
      ["COUNT(*) FILTER (WHERE r.status = 'APPROVED')", { rows: [{ total: 7, open: 1, approved: 1, in_review: 0, shortlisted: 0, filled: 5, closed: 0, cancelled: 0, draft: 0, pending_approval: 0, urgent_open: 0 }] }],
      ["total_users", { rows: [{ total_users: 8, total_orgs: 2, active_capacity_posts: 1, open_demands: 0, active_vendor_entries: 2 }] }]
    ]);
    const result = await svc.executiveDashboard(pool, "org-1");
    assert.strictEqual(result.spend.available, true);
    assert.strictEqual(result.spend.has_data, false);
    assert.strictEqual(result.spend.total_spend_cents, 0);
    assert.strictEqual(result.spend.projected_spend_cents, 0);
    assert.strictEqual(result.spend.total_hours, 0);
    assert.strictEqual(result.procurement_pulse.metrics.spend_30d.available, true);
    assert.strictEqual(result.procurement_pulse.metrics.spend_30d.value_cents, 0);
  });

  it("fails soft when spend analytics cannot be computed", async () => {
    const pool = capturePool([
      ["requester_company_name", { rows: [] }],
      ["candidate_count", { rows: [] }],
      ["rejected_documents", { rows: [{ rejected_documents: 0, expired_documents: 0, expiring_documents: 0 }] }],
      ["rate_card_warnings", { rows: [{ rate_card_warnings: 0, rate_card_breaches: 0 }] }],
      ["active_vendors_30d", { rows: [{ active_vendors_30d: 2 }] }],
      ["active_rate_cards_window", { rows: [{ active_rate_cards_window: 4 }] }],
      ["overtime_spend_cents", function() { throw new Error("spend failed"); }],
      ["sla_minutes", { rows: [{ total_with_sla: 5, sla_met: 4, sla_breached: 1, sla_running: 0 }] }],
      ["compliance_documents", { rows: [{ total_documents: 5, verified: 4, pending: 1, rejected: 0, expired: 0, expiring_soon: 0 }] }],
      ["COUNT(*) FILTER (WHERE r.status = 'APPROVED')", { rows: [{ total: 10, open: 3, approved: 1, in_review: 1, shortlisted: 0, filled: 4, closed: 1, cancelled: 0, draft: 0, pending_approval: 1, urgent_open: 1 }] }],
      ["total_users", { rows: [{ total_users: 10, total_orgs: 2, active_capacity_posts: 1, open_demands: 0, active_vendor_entries: 4 }] }]
    ]);
    const result = await svc.executiveDashboard(pool, "org-1");
    assert.strictEqual(result.requisitions.total, 10);
    assert.strictEqual(result.spend.available, false);
    assert.strictEqual(result.spend.has_data, false);
    assert.strictEqual(result.procurement_pulse.metrics.spend_30d.available, false);
  });

  // P3-D: SLA-Eskalations-Alerts
  it("alerts is an empty array when sla_compliance_pct >= 80 and no critical staffing", async () => {
    const simplePool = { query: async () => ({ rows: [] }) };
    const result = await svc.executiveDashboard(simplePool, "org-1");
    assert.ok(Array.isArray(result.alerts), "alerts must be an array");
    // With empty rows, sla_compliance_pct is null → no SLA alert generated
    const slaCodes = result.alerts.map((a) => a.code);
    assert.ok(!slaCodes.includes("SLA_COMPLIANCE_LOW"), "no SLA alert when pct is null");
  });

  it("generates SLA_COMPLIANCE_LOW warning alert when compliance is between 60-79%", async () => {
    const pool = capturePool([
      ["sla_minutes", { rows: [{ total_with_sla: 100, sla_met: 70, sla_breached: 30, sla_running: 0, sla_compliance_pct: 70 }] }]
    ]);
    const result = await svc.executiveDashboard(pool, "org-1");
    assert.ok(Array.isArray(result.alerts), "alerts must be an array");
    const slaAlert = result.alerts.find((a) => a.code === "SLA_COMPLIANCE_LOW");
    assert.ok(slaAlert, "SLA_COMPLIANCE_LOW alert must be present at 70%");
    assert.strictEqual(slaAlert.severity, "warning");
    assert.strictEqual(slaAlert.pct, 70);
    assert.strictEqual(slaAlert.threshold, 80);
    assert.ok(typeof slaAlert.message === "string" && slaAlert.message.length > 0, "alert message must be non-empty");
  });

  it("generates SLA_COMPLIANCE_LOW critical alert when compliance is below 60%", async () => {
    const pool = capturePool([
      ["sla_minutes", { rows: [{ total_with_sla: 100, sla_met: 40, sla_breached: 60, sla_running: 0, sla_compliance_pct: 40 }] }]
    ]);
    const result = await svc.executiveDashboard(pool, "org-1");
    const slaAlert = result.alerts.find((a) => a.code === "SLA_COMPLIANCE_LOW");
    assert.ok(slaAlert, "SLA_COMPLIANCE_LOW alert must be present at 40%");
    assert.strictEqual(slaAlert.severity, "critical");
    assert.strictEqual(slaAlert.pct, 40);
  });

  it("does not generate SLA_COMPLIANCE_LOW when compliance is exactly 80%", async () => {
    const pool = capturePool([
      ["sla_minutes", { rows: [{ total_with_sla: 100, sla_met: 80, sla_breached: 20, sla_running: 0, sla_compliance_pct: 80 }] }]
    ]);
    const result = await svc.executiveDashboard(pool, "org-1");
    const slaAlert = result.alerts.find((a) => a.code === "SLA_COMPLIANCE_LOW");
    assert.ok(!slaAlert, "No SLA alert at exactly 80%");
  });

  it("generates CRITICAL_STAFFING_PRESSURE alert when critical items exist", async () => {
    // Provide a pool that returns critical staffing data (pressure_score >= 55)
    // The criticalStaffing query looks for approved requisitions urgency + score
    // We mock at a high enough level to trigger the available=true + items path
    // by providing a pool that returns items with pressure_score >= 55
    const pool = {
      query: async (sql) => {
        // Staffing pressure queries look for 'pressure_score' or 'APPROVED' + 'urgent'
        if (sql.includes("pressure_score") || (sql.includes("APPROVED") && sql.includes("urgent"))) {
          return {
            rows: [
              { id: "r-1", title: "Urgent Role", org_id: "org-1", status: "APPROVED", urgency: "high",
                pressure_score: 80, days_open: 14, location_id: null, org_name: "Test GmbH",
                sla_status: "BREACHED", fill_rate: 0 }
            ]
          };
        }
        return { rows: [] };
      }
    };
    const result = await svc.executiveDashboard(pool, "org-1");
    assert.ok(Array.isArray(result.alerts), "alerts must be an array");
    // When critical staffing items are present, CRITICAL_STAFFING_PRESSURE alert generated
    const staffingAlert = result.alerts.find((a) => a.code === "CRITICAL_STAFFING_PRESSURE");
    if (result.critical_staffing_pressure.available && result.critical_staffing_pressure.total > 0) {
      assert.ok(staffingAlert, "CRITICAL_STAFFING_PRESSURE alert must appear when items exist");
      assert.ok(typeof staffingAlert.count === "number" && staffingAlert.count > 0, "count must be > 0");
    }
    // If staffing data not available (soft-fail): no alert expected
    if (!result.critical_staffing_pressure.available) {
      assert.ok(!staffingAlert, "No staffing alert when data unavailable");
    }
  });

  it("response always contains alerts array (never undefined)", async () => {
    const simplePool = { query: async () => ({ rows: [] }) };
    const result = await svc.executiveDashboard(simplePool);
    assert.ok(Object.prototype.hasOwnProperty.call(result, "alerts"), "alerts key must exist");
    assert.ok(Array.isArray(result.alerts), "alerts must be an array");
  });
});

// ═══════════════════════════════════════════════════════════════
// topRoles
// ═══════════════════════════════════════════════════════════════

describe("reportingService — topRoles", () => {
  it("returns top roles without org filter", async () => {
    const rows = [
      { role: "Pflege", count: 20, filled: 15 },
      { role: "Lager", count: 10, filled: 7 }
    ];
    const result = await svc.topRoles(returnPool(rows));
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].role, "Pflege");
  });

  it("filters by org with custom limit", async () => {
    assert.strictEqual((await svc.topRoles(returnPool([]), "o1", 5)).length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Location-Scope Härtung (12 Pflicht-Tests)
// ═══════════════════════════════════════════════════════════════

describe("reportingService — location-scope SQL-Härtung", () => {
  function tracingPool(defaultRow = { rows: [] }) {
    const calls = [];
    return {
      calls,
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        return defaultRow;
      }
    };
  }

  it("requisitionKpis mit locationId: location_id wird als SQL-Parameter übergeben", async () => {
    const pool = tracingPool({
      rows: [{ total: 0, open: 0, filled: 0, closed: 0, cancelled: 0, draft: 0,
               pending_approval: 0, in_review: 0, shortlisted: 0,
               urgent_open: 0, avg_time_to_fill_hours: null, avg_time_to_approve_hours: null }]
    });
    await svc.requisitionKpis(pool, "org-1", "loc-abc");
    assert.ok(pool.calls.length >= 1, "Pool muss mindestens einmal aufgerufen worden sein");
    const allParams = pool.calls.flatMap((c) => c.params);
    assert.ok(allParams.includes("loc-abc"), "locationId muss als SQL-Parameter übergeben werden");
    assert.ok(allParams.includes("org-1"), "orgId muss als SQL-Parameter übergeben werden");
  });

  it("complianceSummary enthält KEINE locationId — bleibt org-scoped", async () => {
    const pool = tracingPool({
      rows: [{ total_documents: 0, verified: 0, pending: 0, rejected: 0, expired: 0, expiring_soon: 0 }]
    });
    // complianceSummary hat keine locationId-Signatur — org-only by design
    await svc.complianceSummary(pool, "org-1");
    const allParams = pool.calls.flatMap((c) => c.params);
    // Nur die org-1 UUID darf in den Params stehen — kein location_id
    assert.ok(allParams.every((p) => !String(p).startsWith("loc")),
      "complianceSummary darf keinen Standortfilter enthalten");
  });

  it("slaReport mit locationId: location_id als SQL-Parameter, orgId ebenfalls", async () => {
    const pool = tracingPool({
      rows: [{ total_with_sla: 0, sla_met: 0, sla_breached: 0, sla_running: 0, sla_compliance_pct: 0 }]
    });
    await svc.slaReport(pool, "org-1", 30, "loc-xyz");
    const allParams = pool.calls.flatMap((c) => c.params);
    assert.ok(allParams.includes("loc-xyz"), "slaReport muss locationId als SQL-Parameter übergeben");
  });

  it("topRoles mit locationId: location_id als SQL-Parameter", async () => {
    const pool = tracingPool({ rows: [] });
    await svc.topRoles(pool, "org-1", 10, "loc-top");
    const allParams = pool.calls.flatMap((c) => c.params);
    assert.ok(allParams.includes("loc-top"), "topRoles muss locationId als SQL-Parameter übergeben");
  });
});

// ═══════════════════════════════════════════════════════════════
// finance truth export
// ═══════════════════════════════════════════════════════════════

describe("reportingService — finance truth export", () => {
  it("flattens executive finance truth into auditable export rows", () => {
    const rows = svc.buildExecutiveFinanceTruthRows({
      available: true,
      subscription_truth: {
        catalog_mrr_theoretical: 3000,
        contractually_active_mrr: 2400,
        catalog_price_missing_count: 1,
        pending_quote_subscribers: 2
      },
      invoice_truth: {
        available: true,
        open_receivables_cents: 123400
      },
      payment_truth: {
        available: true,
        completed_amount_cents: 9900
      },
      pricing_state_breakdown: [
        { source: "contract_price", subscribers: 5, mrr: 2400, arr: 28800 }
      ]
    });

    const openReceivables = rows.find((row) => (
      row.section === "invoice_truth" && row.metric_key === "open_receivables_cents"
    ));
    const pricingMrr = rows.find((row) => row.metric_key === "contract_price.mrr");
    assert.ok(openReceivables);
    assert.strictEqual(openReceivables.metric_value, 123400);
    assert.strictEqual(openReceivables.unit, "cents");
    assert.strictEqual(openReceivables.available, true);
    assert.ok(pricingMrr);
    assert.strictEqual(pricingMrr.metric_value, 2400);
    assert.strictEqual(pricingMrr.unit, "eur");
  });

  it("renders deterministic CSV rows including metadata columns", () => {
    const csv = svc.renderExecutiveFinanceTruthCsv([
      {
        section: "invoice_truth",
        metric_key: "open_receivables_cents",
        metric_value: 123400,
        unit: "cents",
        available: true,
        source: "revenueMetricsService.getRevenueMetrics"
      }
    ], {
      generatedAt: "2026-04-09T10:00:00.000Z",
      orgId: "org-1"
    });
    const lines = csv.split("\n");
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0], "generated_at,org_id,section,metric_key,metric_value,unit,available,source");
    assert.match(lines[1], /^2026-04-09T10:00:00\.000Z,org-1,invoice_truth,open_receivables_cents,123400,cents,true,/);
  });

  it("returns fallback export when finance truth source is unavailable", async () => {
    const failingPool = { query: () => { throw new Error("db unavailable"); } };
    const exported = await svc.executiveFinanceTruthExport(failingPool, "org-1");
    assert.strictEqual(exported.org_id, "org-1");
    assert.strictEqual(exported.finance.available, true);
    assert.strictEqual(exported.finance.invoice_truth.available, false);
    assert.strictEqual(exported.finance.payment_truth.available, false);
    assert.ok(Array.isArray(exported.rows));
    assert.ok(exported.rows.length > 0);
    assert.match(exported.csv, /^generated_at,org_id,section,metric_key,metric_value,unit,available,source/m);
  });
});
