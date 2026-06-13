/**
 * Plan Features — unit tests for hasFeature() and getAllowedPlans().
 * Pure functions, no DB.  Critical security boundary for feature gating.
 *
 * Run: node --test --test-force-exit test/planFeatures.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { hasFeature, getAllowedPlans, PLAN, planFeatures, getIndividualTierByEmployeeCount, INDIVIDUAL_TIERS, isPilotCustomer, hasMatureFeatureAccess, MATURITY_GATES } from "../config/planFeatures.js";

// Disable dev-env feature gate bypass: these tests must verify real plan-gating logic.
// (Docker dev env sets FEATURE_GATE_BYPASS=true; tests need the real behavior.)
process.env.FEATURE_GATE_BYPASS = "false";

// ─────────────────────────────────────────────────────────────
// hasFeature — basic plan/feature matrix
// ─────────────────────────────────────────────────────────────

describe("hasFeature — plan access matrix", () => {
  it("DEMO can access legacy_access", () => {
    assert.strictEqual(hasFeature("DEMO", "legacy_access"), true);
  });

  it("DEMO can browse sla_access (view only)", () => {
    assert.strictEqual(hasFeature("DEMO", "sla_access"), true);
  });

  it("DEMO cannot create offers (sla_offers_create)", () => {
    assert.strictEqual(hasFeature("DEMO", "sla_offers_create"), false);
  });

  it("BASIS can access legacy_access", () => {
    assert.strictEqual(hasFeature("BASIS", "legacy_access"), true);
  });

  it("BASIS can access capacity_exchange_basic", () => {
    assert.strictEqual(hasFeature("BASIS", "capacity_exchange_basic"), true);
  });

  it("BASIS cannot access advanced_matching (PRO+)", () => {
    assert.strictEqual(hasFeature("BASIS", "advanced_matching"), false);
  });

  it("PLUS can access sla_access", () => {
    assert.strictEqual(hasFeature("PLUS", "sla_access"), true);
  });

  it("PLUS can access timesheets", () => {
    assert.strictEqual(hasFeature("PLUS", "timesheets"), true);
  });

  it("PLUS cannot access approval_workflows (ENTERPRISE only)", () => {
    assert.strictEqual(hasFeature("PLUS", "approval_workflows"), false);
  });

  it("PRO can access advanced_matching", () => {
    assert.strictEqual(hasFeature("PRO", "advanced_matching"), true);
  });

  it("PRO can access deal_workflow", () => {
    assert.strictEqual(hasFeature("PRO", "deal_workflow"), true);
  });

  it("PRO cannot access departments (ENTERPRISE only)", () => {
    assert.strictEqual(hasFeature("PRO", "departments"), false);
  });

  it("INDIVIDUELL can access all enterprise-level features", () => {
    const entFeatures = [
      "approval_workflows", "departments", "multi_location",
      "supplier_management", "compliance", "contracts",
      "enterprise_analytics", "audit_traceability", "org_settings", "assignments"
    ];
    for (const feat of entFeatures) {
      assert.strictEqual(hasFeature("INDIVIDUELL", feat), true, `INDIVIDUELL should have ${feat}`);
    }
  });

  it("ENTERPRISE backward-compat maps to INDIVIDUELL", () => {
    assert.strictEqual(hasFeature("ENTERPRISE", "departments"), true);
    assert.strictEqual(hasFeature("ENTERPRISE", "timesheets"), true);
    assert.strictEqual(hasFeature("ENTERPRISE", "sla_access"), true);
  });

  it("INDIVIDUELL can access all PLUS/PRO features", () => {
    const higherTier = [
      "sla_access", "advanced_matching",
      "timesheets", "capacity_exchange_basic", "worker_module"
    ];
    for (const feat of higherTier) {
      assert.strictEqual(hasFeature("INDIVIDUELL", feat), true, `INDIVIDUELL should have ${feat}`);
    }
  });

  it("INDIVIDUELL does NOT have legacy_access (correct: legacy is DEMO/BASIS only)", () => {
    assert.strictEqual(hasFeature("INDIVIDUELL", "legacy_access"), false);
  });
});

// ─────────────────────────────────────────────────────────────
// hasFeature — case handling and defaults
// ─────────────────────────────────────────────────────────────

describe("hasFeature — case handling", () => {
  it("uppercases plan string (lowercase 'demo')", () => {
    assert.strictEqual(hasFeature("demo", "legacy_access"), true);
  });

  it("uppercases plan string (mixed case 'Plus')", () => {
    assert.strictEqual(hasFeature("Plus", "sla_access"), true);
  });

  it("uppercases plan string (lowercase 'enterprise')", () => {
    assert.strictEqual(hasFeature("enterprise", "departments"), true);
  });
});

describe("hasFeature — unknown/missing inputs", () => {
  it("returns false for unknown feature key", () => {
    assert.strictEqual(hasFeature("PRO", "nonexistent_feature"), false);
  });

  it("returns false for empty feature key", () => {
    assert.strictEqual(hasFeature("PRO", ""), false);
  });

  it("defaults to DEMO plan when plan is null", () => {
    // null plan -> DEFAULT_PLAN = DEMO
    assert.strictEqual(hasFeature(null, "legacy_access"), true);
    assert.strictEqual(hasFeature(null, "sla_access"), true); // DEMO can browse
    assert.strictEqual(hasFeature(null, "sla_offers_create"), false); // but not create
  });

  it("defaults to DEMO plan when plan is undefined", () => {
    assert.strictEqual(hasFeature(undefined, "legacy_access"), true);
    assert.strictEqual(hasFeature(undefined, "sla_offers_create"), false);
  });

  it("defaults to DEMO when plan is unknown string", () => {
    assert.strictEqual(hasFeature("UNKNOWN_PLAN", "sla_offers_create"), false);
  });
});

// ─────────────────────────────────────────────────────────────
// getAllowedPlans
// ─────────────────────────────────────────────────────────────

describe("getAllowedPlans", () => {
  it("returns correct plans for legacy_access", () => {
    const plans = getAllowedPlans("legacy_access");
    assert.deepStrictEqual(plans, ["DEMO", "BASIS"]);
  });

  it("returns correct plans for approval_workflows (INDIVIDUELL only)", () => {
    const plans = getAllowedPlans("approval_workflows");
    assert.deepStrictEqual(plans, ["INDIVIDUELL"]);
  });

  it("returns correct plans for sla_access (DEMO+)", () => {
    const plans = getAllowedPlans("sla_access");
    assert.deepStrictEqual(plans, ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"]);
  });

  it("returns empty array for unknown feature", () => {
    assert.deepStrictEqual(getAllowedPlans("nonexistent"), []);
  });

  it("returns a copy (not a reference to the original)", () => {
    const plans = getAllowedPlans("legacy_access");
    plans.push("HACKED");
    // Original should not be affected
    assert.deepStrictEqual(getAllowedPlans("legacy_access"), ["DEMO", "BASIS"]);
  });
});

// ─────────────────────────────────────────────────────────────
// PLAN constants integrity
// ─────────────────────────────────────────────────────────────

describe("PLAN constants", () => {
  it("contains 5 main plans + backward-compat aliases", () => {
    assert.ok(PLAN.DEMO === "DEMO");
    assert.ok(PLAN.BASIS === "BASIS");
    assert.ok(PLAN.PLUS === "PLUS");
    assert.ok(PLAN.PRO === "PRO");
    assert.ok(PLAN.INDIVIDUELL === "INDIVIDUELL");
    // Backward-compat aliases
    assert.ok(PLAN.ENTERPRISE === "INDIVIDUELL");
    assert.ok(PLAN.FREE === "DEMO");
  });
});

// ─────────────────────────────────────────────────────────────
// planFeatures map integrity
// ─────────────────────────────────────────────────────────────

describe("planFeatures map integrity", () => {
  it("every feature maps to a non-empty array", () => {
    for (const [feat, plans] of Object.entries(planFeatures)) {
      assert.ok(Array.isArray(plans), `${feat} should be an array`);
      assert.ok(plans.length > 0, `${feat} should have at least one plan`);
    }
  });

  it("all plan values in features are valid PLAN constants", () => {
    const validPlans = new Set(Object.values(PLAN));
    for (const [feat, plans] of Object.entries(planFeatures)) {
      for (const p of plans) {
        assert.ok(validPlans.has(p), `Feature "${feat}" references unknown plan "${p}"`);
      }
    }
  });

  it("has at least 20 feature keys", () => {
    assert.ok(Object.keys(planFeatures).length >= 20, "Expected at least 20 features");
  });

  it("INDIVIDUELL has access to every non-legacy, non-maturity-gated feature", () => {
    // Features excluded from this check:
    //   legacy_access        — intentionally restricted to DEMO/BASIS
    //   marketplace_featured_profile — MATURITY_GATE false (coming soon)
    //   profile_bounties             — MATURITY_GATE false (coming soon)
    const excluded = new Set(["legacy_access", "marketplace_featured_profile", "profile_bounties"]);
    for (const feat of Object.keys(planFeatures)) {
      if (excluded.has(feat)) continue;
      assert.strictEqual(
        hasFeature("INDIVIDUELL", feat), true,
        `INDIVIDUELL should have access to ${feat}`
      );
    }
  });

  it("legacy_access is restricted to DEMO and BASIS only", () => {
    assert.strictEqual(hasFeature("DEMO", "legacy_access"), true);
    assert.strictEqual(hasFeature("BASIS", "legacy_access"), true);
    assert.strictEqual(hasFeature("PLUS", "legacy_access"), false);
    assert.strictEqual(hasFeature("PRO", "legacy_access"), false);
    assert.strictEqual(hasFeature("INDIVIDUELL", "legacy_access"), false);
  });

  it("DEMO has access to very few features (security: least privilege)", () => {
    let demoCount = 0;
    for (const feat of Object.keys(planFeatures)) {
      if (hasFeature("DEMO", feat)) demoCount++;
    }
    assert.ok(demoCount <= 4, `DEMO should have very limited access (got ${demoCount})`);
  });
});

// ─────────────────────────────────────────────────────────────
// Individual Tier Detection
// ─────────────────────────────────────────────────────────────

// P2.0 (2026-06-13): kanonische Schwellen 50/150/350 (= INDIVIDUAL_TIER_CATALOG/Pricing-Seite).
// Vorher stale 30/250/999 = Commercial-Doppelwahrheit; korrigiert (par. 0.9 Test-Integritaet).
describe("getIndividualTierByEmployeeCount (kanonisch 50/150/350)", () => {
  it("1-50 => individuell_s", () => {
    assert.strictEqual(getIndividualTierByEmployeeCount(1), INDIVIDUAL_TIERS.S);
    assert.strictEqual(getIndividualTierByEmployeeCount(15), INDIVIDUAL_TIERS.S);
    assert.strictEqual(getIndividualTierByEmployeeCount(50), INDIVIDUAL_TIERS.S);
  });
  it("51-150 => individuell_m", () => {
    assert.strictEqual(getIndividualTierByEmployeeCount(51), INDIVIDUAL_TIERS.M);
    assert.strictEqual(getIndividualTierByEmployeeCount(120), INDIVIDUAL_TIERS.M);
    assert.strictEqual(getIndividualTierByEmployeeCount(150), INDIVIDUAL_TIERS.M);
  });
  it("151-350 => individuell_l", () => {
    assert.strictEqual(getIndividualTierByEmployeeCount(151), INDIVIDUAL_TIERS.L);
    assert.strictEqual(getIndividualTierByEmployeeCount(300), INDIVIDUAL_TIERS.L);
    assert.strictEqual(getIndividualTierByEmployeeCount(350), INDIVIDUAL_TIERS.L);
  });
  it(">=351 => individuell_enterprise", () => {
    assert.strictEqual(getIndividualTierByEmployeeCount(351), INDIVIDUAL_TIERS.ENTERPRISE);
    assert.strictEqual(getIndividualTierByEmployeeCount(50000), INDIVIDUAL_TIERS.ENTERPRISE);
  });
  it("invalid/zero/negative => individuell_s (clamped to 1)", () => {
    assert.strictEqual(getIndividualTierByEmployeeCount(0), INDIVIDUAL_TIERS.S);
    assert.strictEqual(getIndividualTierByEmployeeCount(-5), INDIVIDUAL_TIERS.S);
    assert.strictEqual(getIndividualTierByEmployeeCount(null), INDIVIDUAL_TIERS.S);
  });
});

// ─────────────────────────────────────────────────────────────
// Pilot Customer Detection
// ─────────────────────────────────────────────────────────────

describe("isPilotCustomer", () => {
  it("returns true for active pilot", () => {
    assert.strictEqual(isPilotCustomer({ pilot_status: "active" }), true);
    assert.strictEqual(isPilotCustomer({ customer_stage: "pilot" }), true);
  });
  it("returns false for non-pilot", () => {
    assert.strictEqual(isPilotCustomer({ pilot_status: "ended" }), false);
    assert.strictEqual(isPilotCustomer({ customer_stage: "regular" }), false);
    assert.strictEqual(isPilotCustomer(null), false);
    assert.strictEqual(isPilotCustomer(undefined), false);
  });
});

// ─────────────────────────────────────────────────────────────
// Pilot gets INDIVIDUELL features via hasFeature
// ─────────────────────────────────────────────────────────────

describe("hasFeature — pilot override", () => {
  it("active pilot with DEMO plan gets enterprise features", () => {
    const opts = { pilot_status: "active", customer_stage: "pilot" };
    assert.strictEqual(hasFeature("DEMO", "departments", opts), true);
    assert.strictEqual(hasFeature("DEMO", "compliance", opts), true);
    assert.strictEqual(hasFeature("DEMO", "timesheets", opts), true);
  });
  it("non-pilot DEMO does not get enterprise features", () => {
    assert.strictEqual(hasFeature("DEMO", "departments"), false);
    assert.strictEqual(hasFeature("DEMO", "compliance"), false);
  });
});

// ─────────────────────────────────────────────────────────────
// Maturity Gates
// ─────────────────────────────────────────────────────────────

describe("hasMatureFeatureAccess", () => {
  it("admin_panel_access is gated (false)", () => {
    assert.strictEqual(hasMatureFeatureAccess("admin_panel_access"), false);
  });
  it("executive_control_access is gated (false)", () => {
    assert.strictEqual(hasMatureFeatureAccess("executive_control_access"), false);
  });
  it("unknown feature key returns true (no gate = allowed)", () => {
    assert.strictEqual(hasMatureFeatureAccess("timesheets"), true);
    assert.strictEqual(hasMatureFeatureAccess("some_new_feature"), true);
  });
});

// ─────────────────────────────────────────────────────────────
// Marketplace Visibility Center — Feature Gates (M-01)
// ─────────────────────────────────────────────────────────────

describe("Marketplace Visibility Center — public_profile_basic", () => {
  it("PLUS has public_profile_basic", () => {
    assert.strictEqual(hasFeature("PLUS", "public_profile_basic"), true);
  });
  it("PRO has public_profile_basic", () => {
    assert.strictEqual(hasFeature("PRO", "public_profile_basic"), true);
  });
  it("INDIVIDUELL has public_profile_basic", () => {
    assert.strictEqual(hasFeature("INDIVIDUELL", "public_profile_basic"), true);
  });
  it("DEMO does NOT have public_profile_basic", () => {
    assert.strictEqual(hasFeature("DEMO", "public_profile_basic"), false);
  });
  it("BASIS does NOT have public_profile_basic", () => {
    assert.strictEqual(hasFeature("BASIS", "public_profile_basic"), false);
  });
});

describe("Marketplace Visibility Center — public_profile_visibility", () => {
  it("PRO has public_profile_visibility", () => {
    assert.strictEqual(hasFeature("PRO", "public_profile_visibility"), true);
  });
  it("INDIVIDUELL has public_profile_visibility", () => {
    assert.strictEqual(hasFeature("INDIVIDUELL", "public_profile_visibility"), true);
  });
  it("PLUS does NOT have public_profile_visibility", () => {
    assert.strictEqual(hasFeature("PLUS", "public_profile_visibility"), false);
  });
  it("DEMO does NOT have public_profile_visibility", () => {
    assert.strictEqual(hasFeature("DEMO", "public_profile_visibility"), false);
  });
});

describe("Marketplace Visibility Center — profile_analytics", () => {
  it("PRO has profile_analytics_basic", () => {
    assert.strictEqual(hasFeature("PRO", "profile_analytics_basic"), true);
  });
  it("INDIVIDUELL has profile_analytics_basic", () => {
    assert.strictEqual(hasFeature("INDIVIDUELL", "profile_analytics_basic"), true);
  });
  it("PLUS does NOT have profile_analytics_basic", () => {
    assert.strictEqual(hasFeature("PLUS", "profile_analytics_basic"), false);
  });
  it("INDIVIDUELL has profile_analytics_advanced", () => {
    assert.strictEqual(hasFeature("INDIVIDUELL", "profile_analytics_advanced"), true);
  });
  it("PRO does NOT have profile_analytics_advanced (INDIVIDUELL only)", () => {
    assert.strictEqual(hasFeature("PRO", "profile_analytics_advanced"), false);
  });
  it("PLUS does NOT have profile_analytics_advanced", () => {
    assert.strictEqual(hasFeature("PLUS", "profile_analytics_advanced"), false);
  });
});

describe("Marketplace Visibility Center — marketplace_ranking_participation", () => {
  it("PRO has marketplace_ranking_participation", () => {
    assert.strictEqual(hasFeature("PRO", "marketplace_ranking_participation"), true);
  });
  it("INDIVIDUELL has marketplace_ranking_participation", () => {
    assert.strictEqual(hasFeature("INDIVIDUELL", "marketplace_ranking_participation"), true);
  });
  it("PLUS does NOT have marketplace_ranking_participation", () => {
    assert.strictEqual(hasFeature("PLUS", "marketplace_ranking_participation"), false);
  });
  it("BASIS does NOT have marketplace_ranking_participation", () => {
    assert.strictEqual(hasFeature("BASIS", "marketplace_ranking_participation"), false);
  });
});

describe("Marketplace Visibility Center — marketplace_featured_profile (coming soon)", () => {
  it("is in planFeatures (defined for INDIVIDUELL)", () => {
    const plans = getAllowedPlans("marketplace_featured_profile");
    assert.ok(plans.includes("INDIVIDUELL"), "marketplace_featured_profile should be defined for INDIVIDUELL");
  });
  it("is maturity-gated — hasFeature returns false even for INDIVIDUELL", () => {
    assert.strictEqual(hasFeature("INDIVIDUELL", "marketplace_featured_profile"), false);
  });
  it("is maturity-gated — hasFeature returns false for PRO", () => {
    assert.strictEqual(hasFeature("PRO", "marketplace_featured_profile"), false);
  });
  it("hasMatureFeatureAccess returns false", () => {
    assert.strictEqual(hasMatureFeatureAccess("marketplace_featured_profile"), false);
  });
});

describe("Marketplace Visibility Center — verified_deal_reviews", () => {
  it("PRO has verified_deal_reviews", () => {
    assert.strictEqual(hasFeature("PRO", "verified_deal_reviews"), true);
  });
  it("INDIVIDUELL has verified_deal_reviews", () => {
    assert.strictEqual(hasFeature("INDIVIDUELL", "verified_deal_reviews"), true);
  });
  it("PLUS does NOT have verified_deal_reviews", () => {
    assert.strictEqual(hasFeature("PLUS", "verified_deal_reviews"), false);
  });
  it("DEMO does NOT have verified_deal_reviews", () => {
    assert.strictEqual(hasFeature("DEMO", "verified_deal_reviews"), false);
  });
});

describe("Marketplace Visibility Center — profile_bounties (coming soon)", () => {
  it("is in planFeatures (defined for INDIVIDUELL)", () => {
    const plans = getAllowedPlans("profile_bounties");
    assert.ok(plans.includes("INDIVIDUELL"), "profile_bounties should be defined for INDIVIDUELL");
  });
  it("is maturity-gated — hasFeature returns false even for INDIVIDUELL", () => {
    assert.strictEqual(hasFeature("INDIVIDUELL", "profile_bounties"), false);
  });
  it("hasMatureFeatureAccess returns false", () => {
    assert.strictEqual(hasMatureFeatureAccess("profile_bounties"), false);
  });
});

describe("Marketplace Visibility Center — plan coverage summary", () => {
  const MKT_FEATURES = [
    "public_profile_basic",
    "public_profile_visibility",
    "profile_analytics_basic",
    "profile_analytics_advanced",
    "marketplace_ranking_participation",
    "verified_deal_reviews",
  ];

  it("DEMO has NO marketplace features", () => {
    for (const feat of MKT_FEATURES) {
      assert.strictEqual(hasFeature("DEMO", feat), false, `DEMO should not have ${feat}`);
    }
  });

  it("BASIS has NO marketplace features", () => {
    for (const feat of MKT_FEATURES) {
      assert.strictEqual(hasFeature("BASIS", feat), false, `BASIS should not have ${feat}`);
    }
  });

  it("PLUS has exactly 1 marketplace feature (public_profile_basic)", () => {
    const accessible = MKT_FEATURES.filter(f => hasFeature("PLUS", f));
    assert.deepStrictEqual(accessible, ["public_profile_basic"]);
  });

  it("PRO has 5 of 6 active marketplace features (all except profile_analytics_advanced)", () => {
    const accessible = MKT_FEATURES.filter(f => hasFeature("PRO", f));
    assert.strictEqual(accessible.length, 5);
    assert.ok(!accessible.includes("profile_analytics_advanced"), "PRO should not have profile_analytics_advanced");
  });

  it("INDIVIDUELL has all 6 active marketplace features", () => {
    for (const feat of MKT_FEATURES) {
      assert.strictEqual(hasFeature("INDIVIDUELL", feat), true, `INDIVIDUELL should have ${feat}`);
    }
  });
});
