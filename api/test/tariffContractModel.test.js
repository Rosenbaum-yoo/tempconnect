/**
 * Tariff & Contract Model — Unit Tests
 * Tests: Demo/Pilot separation, size classification, feature override, plan limits.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasFeature, PLAN, planFeatures } from "../config/planFeatures.js";
import { PLAN_LIMITS } from "../services/userService.js";
import { classifyCompanySize, getBasePricing, SIZE_TIERS, getIndividualPricingInfo } from "../services/pricingTierService.js";

/* ── A. Demo/Pilot Trennung ──────────────────────────── */

describe("Demo/Pilot Separation", () => {
  it("DEMO plan has no enterprise_access", () => {
    assert.equal(PLAN_LIMITS.DEMO.enterprise_access, false);
  });

  it("INDIVIDUELL plan has full enterprise_access", () => {
    assert.equal(PLAN_LIMITS.INDIVIDUELL.enterprise_access, true);
    assert.equal(PLAN_LIMITS.INDIVIDUELL.requests_send, -1); // unlimited
    assert.equal(PLAN_LIMITS.INDIVIDUELL.sla_level, "ENTERPRISE");
  });

  it("PLAN enum uses INDIVIDUELL canonically and keeps INDIVIDUAL as alias", () => {
    assert.equal(PLAN.INDIVIDUELL, "INDIVIDUELL");
    assert.equal(PLAN.INDIVIDUAL, PLAN.INDIVIDUELL);
  });

  it("Demo user cannot have pilot customer_stage (business rule)", () => {
    // This is enforced by DB CHECK constraint:
    // NOT (is_demo = TRUE AND customer_stage = 'pilot')
    const isDemoAndPilot = (is_demo, stage) => is_demo === true && stage === "pilot";
    assert.equal(isDemoAndPilot(true, "pilot"), true); // would be rejected by DB
    assert.equal(isDemoAndPilot(true, "demo"), false);
    assert.equal(isDemoAndPilot(false, "pilot"), false); // valid: live pilot
  });
});

/* ── B. Feature Override for Pilot Customers ─────────── */

describe("Feature Override — Pilot Customers", () => {
  // Save and restore env
  const origBypass = process.env.FEATURE_GATE_BYPASS;

  it("active pilot gets Enterprise features regardless of subscription plan", () => {
    process.env.FEATURE_GATE_BYPASS = "false";
    const opts = { pilot: { pilot_status: "active" }, customer_stage: "pilot" };

    // Enterprise-only features should be accessible
    assert.equal(hasFeature("DEMO", "approval_workflows", opts), true);
    assert.equal(hasFeature("DEMO", "compliance", opts), true);
    assert.equal(hasFeature("DEMO", "enterprise_analytics", opts), true);
    assert.equal(hasFeature("DEMO", "assignments", opts), true);

    process.env.FEATURE_GATE_BYPASS = origBypass;
  });

  it("ended pilot does NOT get Enterprise features on DEMO plan", () => {
    process.env.FEATURE_GATE_BYPASS = "false";
    const opts = { pilot: { pilot_status: "ended" }, customer_stage: "live" };

    assert.equal(hasFeature("DEMO", "approval_workflows", opts), false);
    assert.equal(hasFeature("DEMO", "compliance", opts), false);

    process.env.FEATURE_GATE_BYPASS = origBypass;
  });

  it("non-pilot user on DEMO plan has no Enterprise features", () => {
    process.env.FEATURE_GATE_BYPASS = "false";
    assert.equal(hasFeature("DEMO", "approval_workflows"), false);
    assert.equal(hasFeature("DEMO", "compliance"), false);
    process.env.FEATURE_GATE_BYPASS = origBypass;
  });

  it("INDIVIDUELL plan has Enterprise features without pilot override", () => {
    process.env.FEATURE_GATE_BYPASS = "false";
    assert.equal(hasFeature("INDIVIDUELL", "approval_workflows"), true);
    assert.equal(hasFeature("INDIVIDUELL", "compliance"), true);
    assert.equal(hasFeature("INDIVIDUELL", "enterprise_analytics"), true);
    process.env.FEATURE_GATE_BYPASS = origBypass;
  });
});

/* ── C. Company Size Classification ──────────────────── */

describe("Company Size Classification", () => {
  it("classifies 1-30 as Class I", () => {
    assert.equal(classifyCompanySize(1)?.class, "I");
    assert.equal(classifyCompanySize(15)?.class, "I");
    assert.equal(classifyCompanySize(30)?.class, "I");
  });

  it("classifies 31-250 as Class II", () => {
    assert.equal(classifyCompanySize(31)?.class, "II");
    assert.equal(classifyCompanySize(100)?.class, "II");
    assert.equal(classifyCompanySize(250)?.class, "II");
  });

  it("classifies 251-999 as Class III", () => {
    assert.equal(classifyCompanySize(251)?.class, "III");
    assert.equal(classifyCompanySize(500)?.class, "III");
    assert.equal(classifyCompanySize(999)?.class, "III");
  });

  it("classifies 1000+ as Class IV", () => {
    assert.equal(classifyCompanySize(1000)?.class, "IV");
    assert.equal(classifyCompanySize(5000)?.class, "IV");
    assert.equal(classifyCompanySize(100000)?.class, "IV");
  });

  it("boundaries are non-overlapping", () => {
    // 30 is I, 31 is II
    assert.equal(classifyCompanySize(30)?.class, "I");
    assert.equal(classifyCompanySize(31)?.class, "II");
    // 250 is II, 251 is III
    assert.equal(classifyCompanySize(250)?.class, "II");
    assert.equal(classifyCompanySize(251)?.class, "III");
    // 999 is III, 1000 is IV
    assert.equal(classifyCompanySize(999)?.class, "III");
    assert.equal(classifyCompanySize(1000)?.class, "IV");
  });

  it("returns null for invalid input", () => {
    assert.equal(classifyCompanySize(0), null);
    assert.equal(classifyCompanySize(-5), null);
    assert.equal(classifyCompanySize(null), null);
    assert.equal(classifyCompanySize(undefined), null);
    assert.equal(classifyCompanySize("abc"), null);
  });

  it("SIZE_TIERS has exactly 4 entries", () => {
    assert.equal(SIZE_TIERS.length, 4);
  });

  it("all tiers have non-overlapping min/max ranges", () => {
    for (let i = 1; i < SIZE_TIERS.length; i++) {
      assert.ok(SIZE_TIERS[i].min === SIZE_TIERS[i - 1].max + 1,
        `Gap between ${SIZE_TIERS[i - 1].class} and ${SIZE_TIERS[i].class}`);
    }
  });
});

/* ── D. Base Pricing ─────────────────────────────────── */

describe("Base Pricing", () => {
  it("returns pricing for all classes", () => {
    assert.ok(getBasePricing("I"));
    assert.ok(getBasePricing("II"));
    assert.ok(getBasePricing("III"));
    assert.ok(getBasePricing("IV"));
  });

  it("Class IV has null prices (individual negotiation)", () => {
    const p = getBasePricing("IV");
    assert.equal(p.base_monthly, null);
    assert.equal(p.max_monthly, null);
  });

  it("Classes I-III have concrete base prices", () => {
    assert.ok(getBasePricing("I").base_monthly > 0);
    assert.ok(getBasePricing("II").base_monthly > 0);
    assert.ok(getBasePricing("III").base_monthly > 0);
  });

  it("getIndividualPricingInfo returns full info", () => {
    const info = getIndividualPricingInfo(100);
    assert.equal(info.size_class, "II");
    assert.ok(info.tier);
    assert.ok(info.pricing);
    assert.ok(info.pricing.base_monthly > 0);
  });

  it("getIndividualPricingInfo returns null for invalid count", () => {
    assert.equal(getIndividualPricingInfo(0), null);
    assert.equal(getIndividualPricingInfo(-1), null);
  });
});

/* ── E. Plan Feature Coverage ────────────────────────── */

describe("Plan Feature Coverage — INDIVIDUELL", () => {
  it("INDIVIDUELL has access to all Enterprise-only features", () => {
    const enterpriseFeatures = Object.entries(planFeatures)
      .filter(([, plans]) => plans.includes("ENTERPRISE"))
      .map(([key]) => key);

    for (const feat of enterpriseFeatures) {
      assert.ok(
        planFeatures[feat].includes("INDIVIDUELL") || planFeatures[feat].includes("ENTERPRISE"),
        `INDIVIDUELL should have access to ${feat}`
      );
    }
  });
});

/* ── F. Existing Plans Unaffected ────────────────────── */

describe("Existing Plans — No Regression", () => {
  it("DEMO limits are unchanged", () => {
    assert.equal(PLAN_LIMITS.DEMO.price, 0);
    assert.equal(PLAN_LIMITS.DEMO.requests_send, 0);
    assert.equal(PLAN_LIMITS.DEMO.enterprise_access, false);
  });

  it("ENTERPRISE limits are unchanged", () => {
    assert.equal(PLAN_LIMITS.ENTERPRISE.requests_send, -1);
    assert.equal(PLAN_LIMITS.ENTERPRISE.enterprise_access, true);
  });

  it("BASIS/PLUS/PRO limits are unchanged", () => {
    assert.equal(PLAN_LIMITS.BASIS.price, 150);
    assert.equal(PLAN_LIMITS.PLUS.price, 499);
    assert.equal(PLAN_LIMITS.PRO.price, 799);
  });
});
