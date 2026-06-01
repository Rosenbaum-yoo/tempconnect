/**
 * Individual Registration Tests
 *
 * Validates the extended registration flow for individual tariffs:
 *   1. Size-class classification (pricingTierService)
 *   2. Individual-tier mapping (planFeatures)
 *   3. Schema validation for register endpoint
 *   4. Pilot vs. Direct mode detection
 *   5. Size-class → employee_count derivation
 *   6. Plan normalization (no new PLAN enum values)
 *
 * Run: node --test --test-force-exit test/individualRegistration.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { z } from "zod";

import { classifyCompanySize, SIZE_TIERS, getIndividualPricingInfo } from "../services/pricingTierService.js";
import { getIndividualTierByEmployeeCount, PLAN } from "../config/planFeatures.js";

// ═══════════════════════════════════════════════════════════════════
// 1. Size-Class Classification (pricingTierService)
// ═══════════════════════════════════════════════════════════════════

describe("classifyCompanySize", () => {
  it("1 → Klasse I", () => {
    assert.strictEqual(classifyCompanySize(1).class, "I");
  });
  it("30 → Klasse I", () => {
    assert.strictEqual(classifyCompanySize(30).class, "I");
  });
  it("31 → Klasse II", () => {
    assert.strictEqual(classifyCompanySize(31).class, "II");
  });
  it("250 → Klasse II", () => {
    assert.strictEqual(classifyCompanySize(250).class, "II");
  });
  it("251 → Klasse III", () => {
    assert.strictEqual(classifyCompanySize(251).class, "III");
  });
  it("999 → Klasse III", () => {
    assert.strictEqual(classifyCompanySize(999).class, "III");
  });
  it("1000 → Klasse IV", () => {
    assert.strictEqual(classifyCompanySize(1000).class, "IV");
  });
  it("50000 → Klasse IV", () => {
    assert.strictEqual(classifyCompanySize(50000).class, "IV");
  });
  it("0 → null", () => {
    assert.strictEqual(classifyCompanySize(0), null);
  });
  it("null → null", () => {
    assert.strictEqual(classifyCompanySize(null), null);
  });
  it("negative → null", () => {
    assert.strictEqual(classifyCompanySize(-5), null);
  });
});

describe("SIZE_TIERS structure", () => {
  it("has 4 tiers", () => {
    assert.strictEqual(SIZE_TIERS.length, 4);
  });
  it("tiers are non-overlapping", () => {
    for (let i = 0; i < SIZE_TIERS.length - 1; i++) {
      assert.ok(SIZE_TIERS[i].max < SIZE_TIERS[i + 1].min,
        `Tier ${SIZE_TIERS[i].class} max (${SIZE_TIERS[i].max}) must be < Tier ${SIZE_TIERS[i + 1].class} min (${SIZE_TIERS[i + 1].min})`);
    }
  });
  it("Klasse IV is unbounded", () => {
    assert.strictEqual(SIZE_TIERS[3].max, Infinity);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Individual Tier Mapping (planFeatures)
// ═══════════════════════════════════════════════════════════════════

describe("getIndividualTierByEmployeeCount", () => {
  it("15 → individuell_s", () => {
    assert.strictEqual(getIndividualTierByEmployeeCount(15), "individuell_s");
  });
  it("100 → individuell_m", () => {
    assert.strictEqual(getIndividualTierByEmployeeCount(100), "individuell_m");
  });
  it("500 → individuell_l", () => {
    assert.strictEqual(getIndividualTierByEmployeeCount(500), "individuell_l");
  });
  it("2000 → individuell_enterprise", () => {
    assert.strictEqual(getIndividualTierByEmployeeCount(2000), "individuell_enterprise");
  });
  it("0 → individuell_s (min 1)", () => {
    assert.strictEqual(getIndividualTierByEmployeeCount(0), "individuell_s");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Registration Schema Validation
// ═══════════════════════════════════════════════════════════════════

describe("Register schema: individual_signup_mode + company_size_class", () => {
  const VALID_SIZE_CLASSES = ["I", "II", "III", "IV"];

  // Replicate the refined schema from auth.js
  const registerSchema = z.object({
    role: z.enum(["company", "agency"]),
    email: z.string().email().max(254),
    password: z.string().min(8).max(128),
    plan: z.enum(["DEMO", "FREE", "BASIS", "PLUS", "PRO", "ENTERPRISE", "INDIVIDUELL", "INDIVIDUAL"]).optional().default("DEMO"),
    employee_count: z.number().int().min(1).max(999999).optional().nullable(),
    individual_signup_mode: z.enum(["pilot", "direct"]).optional().nullable(),
    company_size_class: z.enum(["I", "II", "III", "IV"]).optional().nullable()
  }).refine(
    (d) => {
      const isIndividual = ["INDIVIDUELL", "INDIVIDUAL", "ENTERPRISE"].includes(d.plan);
      if (!isIndividual) return true;
      if (d.company_size_class && VALID_SIZE_CLASSES.includes(d.company_size_class)) return true;
      if (d.employee_count && d.employee_count >= 1) return true;
      return false;
    },
    { message: "Size info required for individual plan", path: ["company_size_class"] }
  );

  it("DEMO without size class → valid", () => {
    const r = registerSchema.safeParse({ role: "company", email: "a@b.de", password: "12345678", plan: "DEMO" });
    assert.ok(r.success);
  });

  it("INDIVIDUELL with company_size_class → valid", () => {
    const r = registerSchema.safeParse({
      role: "company", email: "a@b.de", password: "12345678",
      plan: "INDIVIDUELL", company_size_class: "II", individual_signup_mode: "pilot"
    });
    assert.ok(r.success);
  });

  it("INDIVIDUELL with employee_count → valid (backward compat)", () => {
    const r = registerSchema.safeParse({
      role: "company", email: "a@b.de", password: "12345678",
      plan: "INDIVIDUELL", employee_count: 100
    });
    assert.ok(r.success);
  });

  it("INDIVIDUELL without size or count → invalid", () => {
    const r = registerSchema.safeParse({
      role: "company", email: "a@b.de", password: "12345678",
      plan: "INDIVIDUELL"
    });
    assert.ok(!r.success);
  });

  it("INDIVIDUELL with direct mode → valid", () => {
    const r = registerSchema.safeParse({
      role: "company", email: "a@b.de", password: "12345678",
      plan: "INDIVIDUELL", company_size_class: "III", individual_signup_mode: "direct"
    });
    assert.ok(r.success);
    assert.strictEqual(r.data.individual_signup_mode, "direct");
  });

  it("invalid signup mode → rejected", () => {
    const r = registerSchema.safeParse({
      role: "company", email: "a@b.de", password: "12345678",
      plan: "INDIVIDUELL", company_size_class: "I", individual_signup_mode: "unknown"
    });
    assert.ok(!r.success);
  });

  it("invalid size class → rejected", () => {
    const r = registerSchema.safeParse({
      role: "company", email: "a@b.de", password: "12345678",
      plan: "INDIVIDUELL", company_size_class: "V"
    });
    assert.ok(!r.success);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Pilot vs. Direct Mode Detection
// ═══════════════════════════════════════════════════════════════════

describe("Pilot vs. Direct mode detection", () => {
  function detectSignupMode(plan, individual_signup_mode) {
    const isIndividual = ["INDIVIDUELL", "INDIVIDUAL", "ENTERPRISE"].includes(plan);
    const mode = isIndividual ? (individual_signup_mode || "pilot") : null;
    return { isIndividual, mode, isDirect: mode === "direct" };
  }

  it("INDIVIDUELL without mode → defaults to pilot", () => {
    const r = detectSignupMode("INDIVIDUELL", null);
    assert.strictEqual(r.mode, "pilot");
    assert.strictEqual(r.isDirect, false);
  });

  it("INDIVIDUELL with pilot → pilot", () => {
    const r = detectSignupMode("INDIVIDUELL", "pilot");
    assert.strictEqual(r.mode, "pilot");
    assert.strictEqual(r.isDirect, false);
  });

  it("INDIVIDUELL with direct → direct", () => {
    const r = detectSignupMode("INDIVIDUELL", "direct");
    assert.strictEqual(r.mode, "direct");
    assert.strictEqual(r.isDirect, true);
  });

  it("DEMO → not individual, no mode", () => {
    const r = detectSignupMode("DEMO", null);
    assert.strictEqual(r.isIndividual, false);
    assert.strictEqual(r.mode, null);
  });

  it("PRO → not individual", () => {
    const r = detectSignupMode("PRO", "direct");
    assert.strictEqual(r.isIndividual, false);
    assert.strictEqual(r.mode, null);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Size-Class → employee_count Derivation
// ═══════════════════════════════════════════════════════════════════

describe("Size-class to employee_count derivation", () => {
  const SIZE_CLASS_EMPLOYEE_DEFAULTS = { I: 15, II: 100, III: 500, IV: 2000 };

  function deriveEmployeeCount(employee_count, company_size_class) {
    return employee_count
      || (company_size_class ? SIZE_CLASS_EMPLOYEE_DEFAULTS[company_size_class] : null)
      || null;
  }

  it("explicit count takes precedence", () => {
    assert.strictEqual(deriveEmployeeCount(42, "II"), 42);
  });

  it("class I → 15", () => {
    assert.strictEqual(deriveEmployeeCount(null, "I"), 15);
  });

  it("class II → 100", () => {
    assert.strictEqual(deriveEmployeeCount(null, "II"), 100);
  });

  it("class III → 500", () => {
    assert.strictEqual(deriveEmployeeCount(null, "III"), 500);
  });

  it("class IV → 2000", () => {
    assert.strictEqual(deriveEmployeeCount(null, "IV"), 2000);
  });

  it("neither → null", () => {
    assert.strictEqual(deriveEmployeeCount(null, null), null);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Plan Normalization (no new PLAN enum values)
// ═══════════════════════════════════════════════════════════════════

describe("Plan normalization", () => {
  it("canonical plans have not changed", () => {
    assert.strictEqual(PLAN.DEMO, "DEMO");
    assert.strictEqual(PLAN.BASIS, "BASIS");
    assert.strictEqual(PLAN.PLUS, "PLUS");
    assert.strictEqual(PLAN.PRO, "PRO");
    assert.strictEqual(PLAN.INDIVIDUELL, "INDIVIDUELL");
  });

  it("ENTERPRISE alias maps to INDIVIDUELL", () => {
    assert.strictEqual(PLAN.ENTERPRISE, PLAN.INDIVIDUELL);
  });

  it("FREE alias maps to DEMO", () => {
    assert.strictEqual(PLAN.FREE, PLAN.DEMO);
  });

  it("no unexpected new plan values", () => {
    const canonical = ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"];
    const planValues = new Set(Object.values(PLAN));
    for (const v of planValues) {
      assert.ok(canonical.includes(v), "unexpected plan value: " + v);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. getIndividualPricingInfo integration
// ═══════════════════════════════════════════════════════════════════

describe("getIndividualPricingInfo", () => {
  it("100 → class II with pricing", () => {
    const info = getIndividualPricingInfo(100);
    assert.strictEqual(info.size_class, "II");
    assert.ok(info.pricing.base_monthly > 0);
  });

  it("2000 → class IV, base null (individual negotiation)", () => {
    const info = getIndividualPricingInfo(2000);
    assert.strictEqual(info.size_class, "IV");
    assert.strictEqual(info.pricing.base_monthly, null);
  });

  it("null → null", () => {
    assert.strictEqual(getIndividualPricingInfo(null), null);
  });
});
