import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRevenueMetrics } from "../services/revenueMetricsService.js";

function mockPool(handler) {
  return {
    query: (sql, params = []) => handler(String(sql), params)
  };
}

function tableColumnsRows(columns) {
  return { rows: columns.map((columnName) => ({ column_name: columnName })) };
}

describe("revenueMetricsService — pricing-source and finance truth", () => {
  it("applies pricing precedence and returns finance truth breakdowns", async () => {
    const pool = mockPool((sql, params) => {
      if (sql.includes("FROM information_schema.columns")) {
        const table = params[0];
        if (table === "organizations") {
          return tableColumnsRows([
            "billing_mode",
            "individual_contract_price_cents",
            "pilot_price_cents",
            "custom_quote_pending",
            "company_size_class",
            "employee_count_approx"
          ]);
        }
        if (table === "invoices") {
          return tableColumnsRows([
            "status",
            "total_cents",
            "issued_at",
            "org_id",
            "supplier_org_id",
            "invoice_type"
          ]);
        }
        if (table === "payment_sessions") {
          return tableColumnsRows(["status", "amount", "org_id", "user_id"]);
        }
        if (table === "timesheets") {
          return tableColumnsRows([
            "status",
            "assignment_id",
            "total_hours",
            "overtime_hours",
            "invoice_id",
            "week_start",
            "org_id",
            "supplier_org_id"
          ]);
        }
        if (table === "assignments") {
          return tableColumnsRows(["id", "hourly_rate_cents"]);
        }
        return tableColumnsRows([]);
      }

      if (sql.includes("FROM subscriptions s") && sql.includes("LEFT JOIN LATERAL")) {
        return {
          rows: [
            {
              user_id: "u-plus",
              plan: "PLUS",
              org_id: "org-1",
              billing_mode: "standard_catalog",
              individual_contract_price_cents: null,
              pilot_price_cents: null,
              custom_quote_pending: false,
              company_size_class: null,
              employee_count_approx: null
            },
            {
              user_id: "u-contract",
              plan: "INDIVIDUELL",
              org_id: "org-2",
              billing_mode: "individual_contract",
              individual_contract_price_cents: 250000,
              pilot_price_cents: null,
              custom_quote_pending: false,
              company_size_class: "II",
              employee_count_approx: 120
            },
            {
              user_id: "u-pilot",
              plan: "INDIVIDUELL",
              org_id: "org-3",
              billing_mode: "pilot_contract",
              individual_contract_price_cents: null,
              pilot_price_cents: 99000,
              custom_quote_pending: false,
              company_size_class: "II",
              employee_count_approx: 140
            },
            {
              user_id: "u-contract-missing",
              plan: "INDIVIDUELL",
              org_id: "org-4",
              billing_mode: "individual_contract",
              individual_contract_price_cents: null,
              pilot_price_cents: null,
              custom_quote_pending: false,
              company_size_class: "II",
              employee_count_approx: 60
            },
            {
              user_id: "u-basis-pending",
              plan: "BASIS",
              org_id: "org-5",
              billing_mode: "standard_catalog",
              individual_contract_price_cents: null,
              pilot_price_cents: null,
              custom_quote_pending: true,
              company_size_class: null,
              employee_count_approx: null
            }
          ]
        };
      }

      if (sql.includes("FROM organizations") && sql.includes("pilot_status")) {
        return {
          rows: [{
            total_pilots: 4,
            converted: 2,
            active_pilots: 1,
            ended_without_conversion: 1
          }]
        };
      }

      if (sql.includes("GROUP BY s.plan") && sql.includes("INTERVAL '30 days'")) {
        return {
          rows: [
            { plan: "PLUS", count: 3 },
            { plan: "INDIVIDUELL", count: 1 }
          ]
        };
      }

      if (sql.includes("COUNT(DISTINCT s.user_id)::int AS churned")) {
        return { rows: [{ churned: 2 }] };
      }

      if (sql.includes("AS total_count") && sql.includes("operational_count")) {
        return {
          rows: [{
            total_count: 8,
            draft_count: 1,
            issued_count: 2,
            overdue_count: 1,
            paid_count: 3,
            void_count: 1,
            invoiced_revenue_cents: 880000,
            paid_revenue_cents: 620000,
            open_receivables_cents: 260000,
            overdue_receivables_cents: 110000,
            operational_count: 5,
            subscription_count: 3
          }]
        };
      }

      if (sql.includes("AS total_billed_cents") && sql.includes("invoice_count")) {
        return {
          rows: [{
            total_billed_cents: 150000,
            total_paid_cents: 90000,
            invoice_count: 2
          }]
        };
      }

      if (sql.includes("FROM payment_sessions ps")) {
        return {
          rows: [{
            completed_count: 4,
            completed_amount_eur: "1846.50",
            pending_count: 1,
            failed_count: 1,
            expired_count: 0
          }]
        };
      }

      if (sql.includes("approved_uninvoiced_timesheets")) {
        return {
          rows: [{
            approved_uninvoiced_timesheets: 6,
            approved_uninvoiced_hours: "210.5",
            approved_uninvoiced_amount_cents: 345000,
            missing_rate_count: 1
          }]
        };
      }

      if (sql.includes("approved_spend_30d_cents")) {
        return { rows: [{ approved_spend_30d_cents: 420000 }] };
      }

      if (sql.includes("operational_invoiced_30d_cents")) {
        return { rows: [{ operational_invoiced_30d_cents: 310000 }] };
      }

      return { rows: [] };
    });

    const metrics = await getRevenueMetrics(pool);

    assert.strictEqual(metrics.mrr_total, 3989);
    assert.strictEqual(metrics.custom_quote_pending.count, 2);
    assert.strictEqual(metrics.paying_users, 5);
    assert.strictEqual(metrics.paying_users_with_recognized_price, 3);
    assert.strictEqual(metrics.catalog_mrr_theoretical, 3046);
    assert.strictEqual(metrics.subscription_truth.pending_quote_subscribers, 2);

    const pendingSource = metrics.pricing_state_breakdown.find((row) => row.source === "custom_quote_pending");
    assert.ok(pendingSource);
    assert.strictEqual(pendingSource.subscribers, 2);

    const individuell = metrics.mrr_by_plan.find((row) => row.plan === "INDIVIDUELL");
    assert.ok(individuell);
    assert.strictEqual(individuell.pending_quotes, 1);
    assert.strictEqual(individuell.pricing_sources.contract_price, 1);
    assert.strictEqual(individuell.pricing_sources.pilot_price, 1);
    assert.strictEqual(individuell.pricing_sources.custom_quote_pending, 1);

    assert.strictEqual(metrics.invoice_truth.open_receivables_cents, 260000);
    assert.strictEqual(metrics.invoice_truth.overdue_receivables_cents, 110000);
    assert.strictEqual(metrics.invoice_truth.operational_count, 5);
    assert.strictEqual(metrics.payment_truth.completed_amount_cents, 184650);
    assert.strictEqual(metrics.billable_truth.approved_uninvoiced_amount_cents, 345000);
    assert.strictEqual(metrics.reconciliation_30d.spend_invoice_gap_cents, 110000);
    assert.strictEqual(metrics.reconciliation_30d.coverage_ratio_pct, 74);
    assert.strictEqual(metrics.invoiced_30d.total_cents, 150000);
    assert.strictEqual(metrics.invoiced_30d.paid_cents, 90000);
    assert.ok(metrics.retention_truth);
    assert.ok(metrics.retention_truth.headline);
    assert.ok(metrics.pilot_conversion_truth);
    assert.equal(typeof metrics.pilot_conversion_truth.available, "boolean");
  });
});

describe("revenueMetricsService — legacy fallback behavior", () => {
  it("falls back to legacy subscription query and marks unavailable finance sections safely", async () => {
    const pool = mockPool((sql, params) => {
      if (sql.includes("FROM information_schema.columns")) {
        const table = params[0];
        if (table === "organizations") return tableColumnsRows([]);
        if (table === "invoices") return tableColumnsRows(["status", "total_cents", "issued_at", "org_id"]);
        if (table === "payment_sessions") return tableColumnsRows(["status", "amount", "org_id", "user_id"]);
        if (table === "timesheets") return tableColumnsRows(["status", "assignment_id", "total_hours", "overtime_hours", "week_start", "org_id"]);
        if (table === "assignments") return tableColumnsRows(["id", "hourly_rate_cents"]);
        return tableColumnsRows([]);
      }

      if (sql.includes("FROM subscriptions s") && sql.includes("LEFT JOIN LATERAL")) {
        throw new Error("legacy schema without org_memberships");
      }

      if (sql.includes("FROM subscriptions s") && sql.includes("JOIN users u ON u.id = s.user_id")) {
        return {
          rows: [{
            user_id: "u-legacy",
            plan: "PLUS",
            org_id: "org-1",
            billing_mode: "standard_catalog",
            individual_contract_price_cents: null,
            pilot_price_cents: null,
            custom_quote_pending: false,
            company_size_class: null,
            employee_count_approx: null
          }]
        };
      }

      if (sql.includes("AS total_count") && sql.includes("operational_count")) {
        return {
          rows: [{
            total_count: 1,
            draft_count: 0,
            issued_count: 1,
            overdue_count: 0,
            paid_count: 0,
            void_count: 0,
            invoiced_revenue_cents: 49900,
            paid_revenue_cents: 0,
            open_receivables_cents: 49900,
            overdue_receivables_cents: 0,
            operational_count: 0,
            subscription_count: 1
          }]
        };
      }

      if (sql.includes("AS total_billed_cents") && sql.includes("invoice_count")) {
        return { rows: [{ total_billed_cents: 49900, total_paid_cents: 0, invoice_count: 1 }] };
      }

      if (sql.includes("FROM payment_sessions ps")) {
        return { rows: [{ completed_count: 1, completed_amount_eur: "499.00", pending_count: 0, failed_count: 0, expired_count: 0 }] };
      }

      if (sql.includes("approved_spend_30d_cents")) {
        return { rows: [{ approved_spend_30d_cents: 120000 }] };
      }

      if (sql.includes("COUNT(DISTINCT s.user_id)::int AS churned")) {
        return { rows: [{ churned: 0 }] };
      }

      return { rows: [] };
    });

    const metrics = await getRevenueMetrics(pool, { orgId: "org-1" });

    assert.strictEqual(metrics.mrr_total, 499);
    assert.strictEqual(metrics.custom_quote_pending.count, 0);
    assert.strictEqual(metrics.payment_truth.completed_amount_cents, 49900);
    assert.strictEqual(metrics.invoice_truth.subscription_count, 1);
    assert.ok(metrics.pilot_conversion_truth);
    assert.strictEqual(metrics.billable_truth.available, false);
    assert.strictEqual(metrics.reconciliation_30d.operational_invoiced_available, false);
    assert.ok(metrics.retention_truth);
  });
});
