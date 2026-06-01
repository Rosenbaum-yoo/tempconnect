import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getSaaSRetentionTruth } from "../services/retentionMetricsService.js";

function mockPool(handler) {
  return {
    query: (sql, params = []) => Promise.resolve(handler(String(sql), params))
  };
}

function tableColumnsRows(columns) {
  return { rows: columns.map((columnName) => ({ column_name: columnName })) };
}

describe("retentionMetricsService", () => {
  it("computes retention/churn/usage-intensity truth from commercial and product usage cohorts", async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000)).toISOString();
    const oneDayAgo = new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000)).toISOString();

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
            "employee_count_approx",
            "pilot_status",
            "customer_stage",
            "converted_at"
          ]);
        }
        if (table === "product_analytics_events") {
          return tableColumnsRows([
            "org_id",
            "event_name",
            "occurred_at",
            "user_id"
          ]);
        }
        return tableColumnsRows([]);
      }

      if (sql.includes("FROM organizations o") && sql.includes("current_sub.plan AS current_plan")) {
        return {
          rows: [
            {
              org_id: "org-a",
              org_name: "Alpha GmbH",
              org_type: "company",
              org_plan: "PLUS",
              billing_mode: "standard_catalog",
              individual_contract_price_cents: null,
              pilot_price_cents: null,
              custom_quote_pending: false,
              company_size_class: "I",
              employee_count_approx: 40,
              pilot_status: null,
              customer_stage: "paid",
              converted_at: null,
              current_plan: "PLUS",
              current_status: "active",
              previous_plan: "PLUS",
              previous_status: "active"
            },
            {
              org_id: "org-b",
              org_name: "Beta Klinik",
              org_type: "company",
              org_plan: "DEMO",
              billing_mode: "standard_catalog",
              individual_contract_price_cents: null,
              pilot_price_cents: null,
              custom_quote_pending: false,
              company_size_class: "II",
              employee_count_approx: 120,
              pilot_status: null,
              customer_stage: "inactive",
              converted_at: null,
              current_plan: "DEMO",
              current_status: "canceled",
              previous_plan: "PLUS",
              previous_status: "active"
            },
            {
              org_id: "org-c",
              org_name: "Gamma Pflege",
              org_type: "company",
              org_plan: "INDIVIDUELL",
              billing_mode: "individual_contract",
              individual_contract_price_cents: 250000,
              pilot_price_cents: null,
              custom_quote_pending: false,
              company_size_class: "III",
              employee_count_approx: 400,
              pilot_status: "active",
              customer_stage: "pilot",
              converted_at: twoDaysAgo,
              current_plan: "INDIVIDUELL",
              current_status: "active",
              previous_plan: "PLUS",
              previous_status: "active"
            }
          ]
        };
      }

      if (sql.includes("current_value_events") && sql.includes("FROM product_analytics_events pae")) {
        return {
          rows: [
            {
              org_id: "org-a",
              current_value_events: 10,
              previous_value_events: 8,
              current_active_users: 3,
              previous_active_users: 2,
              current_last_value_event_at: oneDayAgo,
              last_value_event_at: oneDayAgo
            },
            {
              org_id: "org-b",
              current_value_events: 0,
              previous_value_events: 7,
              current_active_users: 0,
              previous_active_users: 2,
              current_last_value_event_at: null,
              last_value_event_at: oneDayAgo
            },
            {
              org_id: "org-c",
              current_value_events: 25,
              previous_value_events: 9,
              current_active_users: 5,
              previous_active_users: 3,
              current_last_value_event_at: oneDayAgo,
              last_value_event_at: oneDayAgo
            }
          ]
        };
      }

      if (sql.includes("GROUP BY pae.org_id, pae.event_name")) {
        return {
          rows: [
            { org_id: "org-a", event_name: "requisition_created", event_count: 6 },
            { org_id: "org-a", event_name: "deal_started", event_count: 4 },
            { org_id: "org-c", event_name: "requisition_created", event_count: 12 },
            { org_id: "org-c", event_name: "timesheet_submitted", event_count: 13 }
          ]
        };
      }

      return { rows: [] };
    });

    const result = await getSaaSRetentionTruth(pool, { windowDays: 30 });

    assert.strictEqual(result.available, true);
    assert.strictEqual(result.quality_flags.usage_source_available, true);
    assert.strictEqual(result.headline.active_paid_orgs, 2);
    assert.strictEqual(result.headline.active_customer_orgs, 2);
    assert.strictEqual(result.headline.previous_active_customer_orgs, 3);
    assert.strictEqual(result.headline.retained_logos, 2);
    assert.strictEqual(result.headline.logo_churned_orgs, 1);
    assert.ok(Math.abs(result.headline.logo_churn_rate_pct - 33.3) < 0.2);
    assert.ok(result.headline.gross_revenue_churn_rate_pct >= 0);
    assert.ok(result.headline.gross_revenue_churn_rate_pct <= 100);
    assert.ok(result.headline.net_revenue_retention_pct > 0);
    assert.strictEqual(result.headline.pqa_orgs, 2);
    assert.strictEqual(result.headline.pilot_retained_orgs, 1);
    assert.strictEqual(result.headline.pilot_converted_orgs_30d, 1);
    assert.strictEqual(result.usage_intensity.high, 1);
    assert.strictEqual(result.usage_intensity.medium, 1);
    assert.strictEqual(result.usage_intensity.low, 0);
    assert.strictEqual(result.usage_intensity.dormant, 0);
    assert.ok(Array.isArray(result.segment_drilldown.by_plan));
    assert.ok(result.segment_drilldown.by_plan.length >= 1);
    assert.ok(Array.isArray(result.org_drilldown.pqa));
    assert.strictEqual(result.org_drilldown.pqa.length, 2);
    assert.ok(result.definitions.retained_logos);
  });

  it("degrades usage-based metrics when product analytics source columns are unavailable", async () => {
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
        if (table === "product_analytics_events") {
          return tableColumnsRows([]);
        }
        return tableColumnsRows([]);
      }

      if (sql.includes("FROM organizations o") && sql.includes("current_sub.plan AS current_plan")) {
        return {
          rows: [
            {
              org_id: "org-z",
              org_name: "Zeta",
              org_type: "company",
              org_plan: "PLUS",
              billing_mode: "standard_catalog",
              individual_contract_price_cents: null,
              pilot_price_cents: null,
              custom_quote_pending: false,
              company_size_class: "I",
              employee_count_approx: 20,
              pilot_status: null,
              customer_stage: "paid",
              converted_at: null,
              current_plan: "PLUS",
              current_status: "active",
              previous_plan: "PLUS",
              previous_status: "active"
            }
          ]
        };
      }

      return { rows: [] };
    });

    const result = await getSaaSRetentionTruth(pool, { windowDays: 30 });

    assert.strictEqual(result.available, true);
    assert.strictEqual(result.quality_flags.usage_source_available, false);
    assert.strictEqual(result.headline.active_paid_orgs, 1);
    assert.strictEqual(result.headline.previous_active_customer_orgs, 0);
    assert.strictEqual(result.headline.retained_logo_rate_pct, null);
    assert.strictEqual(result.headline.logo_churn_rate_pct, null);
    assert.strictEqual(result.headline.net_revenue_retention_pct, null);
    assert.strictEqual(result.usage_intensity.dormant, 1);
  });
});
