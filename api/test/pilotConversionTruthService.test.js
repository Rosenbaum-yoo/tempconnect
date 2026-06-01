import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPilotConversionTruth } from "../services/pilotConversionTruthService.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function mockPool(handler) {
  return {
    query: (sql, params = []) => handler(String(sql), params)
  };
}

function tableColumnsRows(columns) {
  return { rows: columns.map((column_name) => ({ column_name })) };
}

function daysAgo(days) {
  return new Date(Date.now() - (days * MS_PER_DAY)).toISOString();
}

describe("pilotConversionTruthService", () => {
  it("derives canonical funnel stages, transitions and at-risk pilots without double counting event noise", async () => {
    const pool = mockPool((sql, params) => {
      if (sql.includes("FROM information_schema.columns")) {
        if (params[0] === "organizations") {
          return tableColumnsRows([
            "billing_mode",
            "pilot_status",
            "has_used_pilot",
            "pilot_started_at",
            "pilot_ended_at",
            "converted_at",
            "target_plan_after_pilot",
            "individual_contract_price_cents",
            "pilot_price_cents",
            "custom_quote_pending",
            "customer_stage",
            "company_size_class",
            "employee_count_approx",
            "feature_bundle",
            "individual_tier_auto",
            "account_type"
          ]);
        }
        return tableColumnsRows([]);
      }

      if (sql.includes("FROM organizations o") && sql.includes("current_sub.plan")) {
        return {
          rows: [
            {
              org_id: "org-1",
              org_name: "Pilot Convert GmbH",
              org_type: "company",
              organization_plan: "INDIVIDUELL",
              org_created_at: daysAgo(75),
              account_type: "live",
              billing_mode: "individual_contract",
              pilot_status: "converted",
              has_used_pilot: true,
              pilot_started_at: daysAgo(70),
              pilot_ended_at: null,
              converted_at: daysAgo(50),
              target_plan_after_pilot: "INDIVIDUELL",
              individual_contract_price_cents: 250000,
              pilot_price_cents: 89000,
              custom_quote_pending: false,
              customer_stage: "live",
              company_size_class: "III",
              employee_count_approx: 420,
              feature_bundle: "enterprise_full",
              individual_tier_auto: "managed",
              owner_user_id: "owner-1",
              owner_role_key: "owner",
              owner_membership_created_at: daysAgo(75),
              current_subscription_plan: "INDIVIDUELL",
              current_subscription_status: "active",
              current_subscription_created_at: daysAgo(50)
            },
            {
              org_id: "org-2",
              org_name: "Pilot At Risk AG",
              org_type: "company",
              organization_plan: "DEMO",
              org_created_at: daysAgo(40),
              account_type: "live",
              billing_mode: "pilot_contract",
              pilot_status: "active",
              has_used_pilot: true,
              pilot_started_at: daysAgo(35),
              pilot_ended_at: null,
              converted_at: null,
              target_plan_after_pilot: "INDIVIDUELL",
              individual_contract_price_cents: null,
              pilot_price_cents: 99000,
              custom_quote_pending: false,
              customer_stage: "pilot",
              company_size_class: "II",
              employee_count_approx: 140,
              feature_bundle: "enterprise_full",
              individual_tier_auto: "managed",
              owner_user_id: "owner-2",
              owner_role_key: "owner",
              owner_membership_created_at: daysAgo(40),
              current_subscription_plan: "DEMO",
              current_subscription_status: "active",
              current_subscription_created_at: daysAgo(40)
            },
            {
              org_id: "org-3",
              org_name: "Pilot Lost KG",
              org_type: "company",
              organization_plan: "DEMO",
              org_created_at: daysAgo(60),
              account_type: "live",
              billing_mode: "standard_catalog",
              pilot_status: "ended",
              has_used_pilot: true,
              pilot_started_at: daysAgo(45),
              pilot_ended_at: daysAgo(20),
              converted_at: null,
              target_plan_after_pilot: "INDIVIDUELL",
              individual_contract_price_cents: null,
              pilot_price_cents: null,
              custom_quote_pending: false,
              customer_stage: "live",
              company_size_class: "II",
              employee_count_approx: 85,
              feature_bundle: "enterprise_full",
              individual_tier_auto: "managed",
              owner_user_id: "owner-3",
              owner_role_key: "owner",
              owner_membership_created_at: daysAgo(60),
              current_subscription_plan: "DEMO",
              current_subscription_status: "inactive",
              current_subscription_created_at: null
            },
            {
              org_id: "org-4",
              org_name: "Direct Contract GmbH",
              org_type: "company",
              organization_plan: "INDIVIDUELL",
              org_created_at: daysAgo(15),
              account_type: "live",
              billing_mode: "individual_contract",
              pilot_status: null,
              has_used_pilot: false,
              pilot_started_at: null,
              pilot_ended_at: null,
              converted_at: null,
              target_plan_after_pilot: null,
              individual_contract_price_cents: null,
              pilot_price_cents: null,
              custom_quote_pending: true,
              customer_stage: "contract_requested",
              company_size_class: "II",
              employee_count_approx: 90,
              feature_bundle: null,
              individual_tier_auto: "auto",
              owner_user_id: "owner-4",
              owner_role_key: "owner",
              owner_membership_created_at: daysAgo(15),
              current_subscription_plan: "INDIVIDUELL",
              current_subscription_status: "active",
              current_subscription_created_at: daysAgo(15)
            },
            {
              org_id: "org-5",
              org_name: "Lead Only GmbH",
              org_type: "company",
              organization_plan: "DEMO",
              org_created_at: daysAgo(22),
              account_type: "live",
              billing_mode: "standard_catalog",
              pilot_status: null,
              has_used_pilot: false,
              pilot_started_at: null,
              pilot_ended_at: null,
              converted_at: null,
              target_plan_after_pilot: null,
              individual_contract_price_cents: null,
              pilot_price_cents: null,
              custom_quote_pending: false,
              customer_stage: "demo",
              company_size_class: null,
              employee_count_approx: null,
              feature_bundle: null,
              individual_tier_auto: null,
              owner_user_id: "owner-5",
              owner_role_key: "owner",
              owner_membership_created_at: daysAgo(22),
              current_subscription_plan: "DEMO",
              current_subscription_status: "active",
              current_subscription_created_at: daysAgo(22)
            }
          ]
        };
      }

      if (sql.includes("FROM strategic_collaboration_requests scr")) {
        return {
          rows: [
            {
              org_id: "org-1",
              lead_at: daysAgo(80),
              qualified_at: daysAgo(78),
              lost_at: null,
              lead_count: 1,
              qualified_count: 1,
              lost_count: 0
            },
            {
              org_id: "org-2",
              lead_at: daysAgo(50),
              qualified_at: daysAgo(48),
              lost_at: null,
              lead_count: 1,
              qualified_count: 1,
              lost_count: 0
            },
            {
              org_id: "org-5",
              lead_at: daysAgo(25),
              qualified_at: daysAgo(23),
              lost_at: null,
              lead_count: 1,
              qualified_count: 1,
              lost_count: 0
            }
          ]
        };
      }

      if (sql.includes("FROM product_analytics_events pae")) {
        return {
          rows: [
            { org_id: "org-1", user_id: "u-1", event_name: "request_created", occurred_at: daysAgo(68) },
            { org_id: "org-1", user_id: "u-1", event_name: "request_sent", occurred_at: daysAgo(67) },
            { org_id: "org-1", user_id: "u-2", event_name: "deal_started", occurred_at: daysAgo(66) },
            { org_id: "org-1", user_id: "u-2", event_name: "deal_completed", occurred_at: daysAgo(65) },
            { org_id: "org-1", user_id: "u-1", event_name: "assignment_created", occurred_at: daysAgo(64) },
            { org_id: "org-1", user_id: "u-1", event_name: "request_sent", occurred_at: daysAgo(63) },
            { org_id: "org-2", user_id: "u-3", event_name: "request_created", occurred_at: daysAgo(33) },
            { org_id: "org-2", user_id: "u-3", event_name: "timesheet_started", occurred_at: daysAgo(32) }
          ]
        };
      }

      if (sql.includes("FROM user_onboarding_progress")) {
        return {
          rows: [
            { user_id: "owner-2", step_key: "profile_complete", completed: true, completed_at: daysAgo(39) },
            { user_id: "owner-2", step_key: "org_configured", completed: true, completed_at: daysAgo(39) }
          ]
        };
      }

      return { rows: [] };
    });

    const truth = await getPilotConversionTruth(pool);

    assert.equal(truth.available, true);
    assert.equal(truth.headline.tracked_orgs, 5);
    assert.equal(truth.headline.active_pilots, 1);
    assert.equal(truth.headline.activated_pilots, 1);
    assert.equal(truth.headline.converted_pilots, 1);
    assert.equal(truth.headline.lost_pilots, 1);
    assert.equal(truth.headline.at_risk_pilots, 1);
    assert.equal(truth.headline.avg_days_to_activation, 2);
    assert.equal(truth.headline.avg_days_to_conversion, 20);

    assert.equal(truth.stage_counts.pilot_started, 3);
    assert.equal(truth.stage_counts.pilot_activated, 2);
    assert.equal(truth.stage_counts.pilot_successful_usage, 1);
    assert.equal(truth.stage_counts.commercial_pricing_clarified, 2);
    assert.equal(truth.stage_counts.paid_live, 1);
    assert.equal(truth.stage_counts.lost_aborted, 1);

    assert.equal(truth.transitions.lead_to_registered.cohort_count, 5);
    assert.equal(truth.transitions.lead_to_registered.converted_count, 5);
    assert.equal(truth.transitions.registration_to_pilot_started.cohort_count, 5);
    assert.equal(truth.transitions.registration_to_pilot_started.converted_count, 3);
    assert.equal(truth.transitions.pilot_started_to_activated.converted_count, 2);
    assert.equal(truth.transitions.pilot_started_to_activated.rate_pct, 66.7);
    assert.equal(truth.transitions.activated_to_paid_live.converted_count, 1);
    assert.equal(truth.transitions.activated_to_paid_live.rate_pct, 50);
    assert.equal(truth.transitions.pilot_to_lost.converted_count, 1);
    assert.equal(truth.transitions.pilot_to_lost.rate_pct, 33.3);

    assert.equal(truth.current_stage_distribution.find((row) => row.stage === "registered")?.orgs, 2);
    assert.equal(truth.current_stage_distribution.find((row) => row.stage === "pilot_activated")?.orgs, 1);
    assert.equal(truth.current_stage_distribution.find((row) => row.stage === "paid_live")?.orgs, 1);
    assert.equal(truth.current_stage_distribution.find((row) => row.stage === "lost_aborted")?.orgs, 1);

    assert.equal(truth.activation.by_event.find((row) => row.event_name === "request_created")?.activated_orgs, 2);
    assert.equal(truth.gtm_learning.product_area_usage.find((row) => row.module === "demand")?.pilot_orgs, 2);
    assert.equal(truth.gtm_learning.by_tariff_path.find((row) => row.key === "pilot")?.tracked_orgs, 3);
    assert.ok(truth.gtm_learning.onboarding_bottlenecks.some((row) => row.step_key === "team_invited" && row.blocked_pilots === 1));
    assert.equal(truth.org_drilldown.at_risk[0].org_id, "org-2");
    assert.equal(truth.org_drilldown.converted[0].org_id, "org-1");
    assert.equal(truth.quality_flags.lead_stage_fallbacks_used, 2);
    assert.equal(truth.quality_flags.pre_registration_lead_capture_available, false);
    assert.equal(truth.quality_flags.pricing_clarity_timestamps_partially_inferred, true);
  });

  it("returns an available zero state when no tracked enterprise orgs exist", async () => {
    const pool = mockPool((sql, params) => {
      if (sql.includes("FROM information_schema.columns")) {
        if (params[0] === "organizations") {
          return tableColumnsRows([
            "billing_mode",
            "pilot_status",
            "has_used_pilot",
            "pilot_started_at",
            "pilot_ended_at",
            "converted_at",
            "target_plan_after_pilot",
            "individual_contract_price_cents",
            "pilot_price_cents",
            "custom_quote_pending",
            "customer_stage",
            "company_size_class",
            "employee_count_approx"
          ]);
        }
        return tableColumnsRows([]);
      }
      if (sql.includes("FROM organizations o") && sql.includes("current_sub.plan")) {
        return { rows: [] };
      }
      if (sql.includes("FROM strategic_collaboration_requests scr")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const truth = await getPilotConversionTruth(pool, { orgId: "org-empty" });

    assert.equal(truth.available, true);
    assert.equal(truth.scope_org_id, "org-empty");
    assert.equal(truth.headline.tracked_orgs, 0);
    assert.equal(truth.transitions.pilot_started_to_activated.cohort_count, 0);
    assert.deepEqual(truth.current_stage_distribution, []);
    assert.deepEqual(truth.org_drilldown.at_risk, []);
  });
});
