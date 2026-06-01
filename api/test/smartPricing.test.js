/**
 * Smart Pricing Tests
 *
 * Covers:
 *  1. computeWeightedRange — gewichtete Preisspanne aus 4 Stufen
 *  2. applyUrgencySurcharge — Dringlichkeitszuschlag
 *  3. buildExplanation — menschenlesbare DE-Erklaerungen
 *  4. getSuggestion — Hauptfunktion mit Mock-Pool
 *  5. Edge Cases — leere Daten, Einzelstufe, alle Stufen null
 *  6. Confidence — high/medium/low Klassifizierung
 *  7. Route Validation — Zod-Schema fuer Query-Parameter
 *
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeWeightedRange,
  applyUrgencySurcharge,
  buildExplanation,
  getMarketRateStats,
  getOfferRateStats,
  getSupplyRateStats,
  getDemandBudgetStats,
  getSuggestion
} from "../services/smartPricingService.js";

// ── Mock pool helper ─────────────────────────────────────
function mockPool(queryMap = {}) {
  return {
    query(sql, params) {
      for (const [key, rows] of Object.entries(queryMap)) {
        if (sql.includes(key)) return Promise.resolve({ rows, rowCount: rows.length });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
  };
}

/** Build a stage result for testing pure functions */
function stage(name, sampleCount, p25, median, p75) {
  return { stage: name, sample_count: sampleCount, p25, median, p75, min_rate: p25, max_rate: p75 };
}

// ═════════════════════════════════════════════════════════════
// 1. computeWeightedRange
// ═════════════════════════════════════════════════════════════

describe("computeWeightedRange", () => {
  it("returns nulls when all stages empty", () => {
    const result = computeWeightedRange([
      stage("deals", 0, null, null, null),
      stage("offers", 0, null, null, null),
      stage("supply", 0, null, null, null),
      stage("demand", 0, null, null, null)
    ]);
    assert.equal(result.suggested_min, null);
    assert.equal(result.suggested_max, null);
    assert.equal(result.suggested_mid, null);
    assert.equal(result.total_samples, 0);
    assert.deepEqual(result.stages_used, []);
  });

  it("uses single stage with full weight when only one has data", () => {
    const result = computeWeightedRange([
      stage("deals", 10, 2000, 2500, 3000),
      stage("offers", 0, null, null, null),
      stage("supply", 0, null, null, null),
      stage("demand", 0, null, null, null)
    ]);
    // Single stage => weight renormalized to 100%
    assert.equal(result.suggested_min, 2000);
    assert.equal(result.suggested_max, 3000);
    assert.equal(result.suggested_mid, 2500);
    assert.equal(result.total_samples, 10);
    assert.deepEqual(result.stages_used, ["deals"]);
  });

  it("weights two stages correctly (deals 50% + offers 25%)", () => {
    const result = computeWeightedRange([
      stage("deals", 20, 2000, 2500, 3000),
      stage("offers", 10, 2200, 2700, 3200),
      stage("supply", 0, null, null, null),
      stage("demand", 0, null, null, null)
    ]);
    // Renormalized: deals = 50/75 ≈ 0.667, offers = 25/75 ≈ 0.333
    // min = 2000*0.667 + 2200*0.333 ≈ 2067
    // max = 3000*0.667 + 3200*0.333 ≈ 3067
    assert.equal(result.total_samples, 30);
    assert.deepEqual(result.stages_used, ["deals", "offers"]);
    assert.ok(result.suggested_min >= 2050 && result.suggested_min <= 2080, `min=${result.suggested_min}`);
    assert.ok(result.suggested_max >= 3050 && result.suggested_max <= 3080, `max=${result.suggested_max}`);
  });

  it("weights all 4 stages correctly", () => {
    const result = computeWeightedRange([
      stage("deals", 20, 2000, 2500, 3000),
      stage("offers", 10, 2200, 2700, 3200),
      stage("supply", 5, 1800, 2300, 2800),
      stage("demand", 3, 2400, 2900, 3400)
    ]);
    // All 4 stages active => weights: 0.50, 0.25, 0.15, 0.10 (sum=1.0)
    assert.equal(result.total_samples, 38);
    assert.deepEqual(result.stages_used, ["deals", "offers", "supply", "demand"]);
    // mid = 2500*0.5 + 2700*0.25 + 2300*0.15 + 2900*0.10 = 1250+675+345+290 = 2560
    assert.equal(result.suggested_mid, 2560);
  });

  it("uses median as fallback when p25/p75 missing", () => {
    const result = computeWeightedRange([
      { stage: "deals", sample_count: 5, p25: null, median: 2500, p75: null },
      stage("offers", 0, null, null, null),
      stage("supply", 0, null, null, null),
      stage("demand", 0, null, null, null)
    ]);
    assert.equal(result.suggested_min, 2500); // p25 fallback to median
    assert.equal(result.suggested_max, 2500); // p75 fallback to median
    assert.equal(result.suggested_mid, 2500);
  });

  it("excludes stages with zero samples even if median is set", () => {
    const result = computeWeightedRange([
      stage("deals", 0, 999, 999, 999), // sample_count = 0 → excluded
      stage("offers", 5, 2000, 2500, 3000),
      stage("supply", 0, null, null, null),
      stage("demand", 0, null, null, null)
    ]);
    assert.deepEqual(result.stages_used, ["offers"]);
    assert.equal(result.suggested_mid, 2500);
  });
});

// ═════════════════════════════════════════════════════════════
// 2. applyUrgencySurcharge
// ═════════════════════════════════════════════════════════════

describe("applyUrgencySurcharge", () => {
  const base = { suggested_min: 2000, suggested_max: 3000, suggested_mid: 2500 };

  it("normal => no surcharge", () => {
    const r = applyUrgencySurcharge(base, "normal");
    assert.equal(r.suggested_min, 2000);
    assert.equal(r.suggested_max, 3000);
    assert.equal(r.surcharge_pct, 0);
  });

  it("null/undefined => no surcharge", () => {
    const r = applyUrgencySurcharge(base, null);
    assert.equal(r.surcharge_pct, 0);
    assert.equal(r.suggested_min, 2000);
  });

  it("high => +5%", () => {
    const r = applyUrgencySurcharge(base, "high");
    assert.equal(r.suggested_min, 2100);
    assert.equal(r.suggested_max, 3150);
    assert.equal(r.suggested_mid, 2625);
    assert.equal(r.surcharge_pct, 5);
  });

  it("urgent => +10%", () => {
    const r = applyUrgencySurcharge(base, "urgent");
    assert.equal(r.suggested_min, 2200);
    assert.equal(r.suggested_max, 3300);
    assert.equal(r.surcharge_pct, 10);
  });

  it("critical => +15%", () => {
    const r = applyUrgencySurcharge(base, "critical");
    assert.equal(r.suggested_min, 2300);
    assert.equal(r.suggested_max, 3450);
    assert.equal(r.surcharge_pct, 15);
  });

  it("notdienst => +20%", () => {
    const r = applyUrgencySurcharge(base, "notdienst");
    assert.equal(r.suggested_min, 2400);
    assert.equal(r.suggested_max, 3600);
    assert.equal(r.suggested_mid, 3000);
    assert.equal(r.surcharge_pct, 20);
  });

  it("case insensitive", () => {
    const r = applyUrgencySurcharge(base, "URGENT");
    assert.equal(r.surcharge_pct, 10);
  });

  it("returns 0 surcharge when range is null", () => {
    const r = applyUrgencySurcharge({ suggested_min: null, suggested_max: null, suggested_mid: null }, "notdienst");
    assert.equal(r.surcharge_pct, 0);
  });

  it("handles partial null values (only min set)", () => {
    const r = applyUrgencySurcharge({ suggested_min: 2000, suggested_max: null, suggested_mid: null }, "urgent");
    assert.equal(r.suggested_min, 2200);
    assert.equal(r.suggested_max, null);
  });
});

// ═════════════════════════════════════════════════════════════
// 3. buildExplanation
// ═════════════════════════════════════════════════════════════

describe("buildExplanation", () => {
  it("includes stage descriptions with Datenpunkte + Median", () => {
    const stages = [
      stage("deals", 15, 2000, 2500, 3000),
      stage("offers", 8, 2200, 2700, 3200),
      stage("supply", 0, null, null, null),
      stage("demand", 0, null, null, null)
    ];
    const lines = buildExplanation(stages, "normal", "high");
    assert.ok(lines.some(l => l.includes("Einsätze") && l.includes("15")));
    assert.ok(lines.some(l => l.includes("Angebote") && l.includes("8")));
    assert.ok(lines.some(l => l.includes("Konfidenz: high")));
  });

  it("skips stages with 0 samples", () => {
    const stages = [
      stage("deals", 0, null, null, null),
      stage("offers", 5, 2000, 2500, 3000),
      stage("supply", 0, null, null, null),
      stage("demand", 0, null, null, null)
    ];
    const lines = buildExplanation(stages, "normal", "medium");
    assert.ok(!lines.some(l => l.includes("Einsätze")));
    assert.ok(lines.some(l => l.includes("Angebote")));
  });

  it("includes urgency surcharge line for non-normal urgency", () => {
    const stages = [stage("deals", 10, 2000, 2500, 3000)];
    const lines = buildExplanation(stages, "critical", "high");
    assert.ok(lines.some(l => l.includes("Dringlichkeitszuschlag") && l.includes("+15%")));
  });

  it("omits urgency line for normal urgency", () => {
    const stages = [stage("deals", 10, 2000, 2500, 3000)];
    const lines = buildExplanation(stages, "normal", "medium");
    assert.ok(!lines.some(l => l.includes("Dringlichkeitszuschlag")));
  });

  it("shows Median in EUR format", () => {
    const stages = [stage("deals", 5, 1500, 2550, 3500)];
    const lines = buildExplanation(stages, null, "low");
    // 2550 cents = 25.50 EUR/h
    assert.ok(lines.some(l => l.includes("25.50")));
  });
});

// ═════════════════════════════════════════════════════════════
// 4. getSuggestion — Main function with mock pool
// ═════════════════════════════════════════════════════════════

describe("getSuggestion", () => {
  it("returns FILTER_REQUIRED when no role and no region", async () => {
    const pool = mockPool();
    const result = await getSuggestion(pool, {});
    assert.equal(result.error, "FILTER_REQUIRED");
  });

  it("returns full suggestion with assignment data only", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 25, p25: 2000, median: 2500, p75: 3000, min_rate: 1800, max_rate: 3500 }],
      offers: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      capacity_posts: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      demand_requests: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }]
    });
    const result = await getSuggestion(pool, { role: "Schweisser" });

    assert.ok(!result.error);
    assert.equal(result.confidence, "high"); // 25 samples >= 20
    assert.deepEqual(result.stages_used, ["deals"]);
    assert.equal(result.suggestion.min_cents, 2000);
    assert.equal(result.suggestion.max_cents, 3000);
    assert.equal(result.suggestion.mid_cents, 2500);
    assert.equal(result.suggestion.currency, "EUR");
    assert.equal(result.suggestion.min_eur, 20);
    assert.equal(result.suggestion.max_eur, 30);
    assert.ok(result.disclaimer.length > 0);
    assert.ok(Array.isArray(result.explanation));
    assert.equal(result.query.role, "Schweisser");
  });

  it("applies urgency surcharge to suggestion", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 10, p25: 2000, median: 2500, p75: 3000, min_rate: 1800, max_rate: 3500 }],
      offers: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      capacity_posts: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      demand_requests: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }]
    });
    const result = await getSuggestion(pool, { role: "Schweisser", urgency: "notdienst" });
    assert.equal(result.suggestion.surcharge_pct, 20);
    assert.equal(result.suggestion.min_cents, 2400); // 2000 * 1.20
    assert.equal(result.suggestion.max_cents, 3600); // 3000 * 1.20
  });

  it("returns medium confidence for 5-19 samples", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 8, p25: 2000, median: 2500, p75: 3000, min_rate: 1800, max_rate: 3500 }],
      offers: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      capacity_posts: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      demand_requests: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }]
    });
    const result = await getSuggestion(pool, { role: "Helfer" });
    assert.equal(result.confidence, "medium");
  });

  it("returns low confidence for <5 samples", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 3, p25: 2000, median: 2500, p75: 3000, min_rate: 1800, max_rate: 3500 }],
      offers: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      capacity_posts: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      demand_requests: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }]
    });
    const result = await getSuggestion(pool, { region: "Berlin" });
    assert.equal(result.confidence, "low");
  });

  it("merges multiple stages", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 20, p25: 2000, median: 2500, p75: 3000, min_rate: 1800, max_rate: 3500 }],
      offers: [{ sample_count: 10, p25: 2200, median: 2700, p75: 3200, min_rate: 2000, max_rate: 3400 }],
      capacity_posts: [{ sample_count: 5, p25: 1800, median: 2300, p75: 2800, min_rate: 1600, max_rate: 3000 }],
      demand_requests: [{ sample_count: 3, p25: 2400, median: 2900, p75: 3400, min_rate: 2200, max_rate: 3600 }]
    });
    const result = await getSuggestion(pool, { role: "Schweisser", region: "Berlin" });
    assert.equal(result.total_data_points, 38);
    assert.deepEqual(result.stages_used, ["deals", "offers", "supply", "demand"]);
    assert.equal(result.confidence, "high");
    // Weighted mid = 2500*0.5 + 2700*0.25 + 2300*0.15 + 2900*0.10 = 2560
    assert.equal(result.suggestion.mid_cents, 2560);
  });

  it("includes all 4 data_points sections", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 10, p25: 2000, median: 2500, p75: 3000, min_rate: 1800, max_rate: 3500 }],
      offers: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      capacity_posts: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      demand_requests: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }]
    });
    const result = await getSuggestion(pool, { role: "Helfer" });
    assert.ok("deals" in result.data_points);
    assert.ok("offers" in result.data_points);
    assert.ok("supply" in result.data_points);
    assert.ok("demand" in result.data_points);
    assert.equal(result.data_points.deals.sample_count, 10);
    assert.equal(result.data_points.offers.sample_count, 0);
  });

  it("passes context and urgency through to query field", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 5, p25: 2000, median: 2500, p75: 3000, min_rate: 1800, max_rate: 3500 }],
      offers: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      capacity_posts: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      demand_requests: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }]
    });
    const result = await getSuggestion(pool, { role: "Helfer", urgency: "urgent", context: "supply" });
    assert.equal(result.query.role, "Helfer");
    assert.equal(result.query.urgency, "urgent");
    assert.equal(result.query.context, "supply");
  });
});

// ═════════════════════════════════════════════════════════════
// 5. Edge Cases
// ═════════════════════════════════════════════════════════════

describe("Smart Pricing Edge Cases", () => {
  it("handles all stages returning zero samples gracefully", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      offers: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      capacity_posts: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      demand_requests: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }]
    });
    const result = await getSuggestion(pool, { role: "Unknown" });
    assert.equal(result.suggestion.min_cents, null);
    assert.equal(result.suggestion.max_cents, null);
    assert.equal(result.confidence, "low");
    assert.equal(result.total_data_points, 0);
  });

  it("region-only query works", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 12, p25: 1500, median: 2000, p75: 2500, min_rate: 1200, max_rate: 2800 }],
      offers: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      capacity_posts: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      demand_requests: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }]
    });
    const result = await getSuggestion(pool, { region: "München" });
    assert.ok(!result.error);
    assert.equal(result.query.region, "München");
    assert.equal(result.query.role, null);
  });

  it("disclaimer is always present", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 5, p25: 2000, median: 2500, p75: 3000, min_rate: 1800, max_rate: 3500 }],
      offers: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      capacity_posts: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }],
      demand_requests: [{ sample_count: 0, p25: null, median: null, p75: null, min_rate: null, max_rate: null }]
    });
    const result = await getSuggestion(pool, { role: "Helfer" });
    assert.ok(result.disclaimer.includes("Unverbindliche"));
  });
});

// ═════════════════════════════════════════════════════════════
// 6. DB Stage Functions — basic mock verification
// ═════════════════════════════════════════════════════════════

describe("DB Stage Functions", () => {
  it("getMarketRateStats returns stage='deals'", async () => {
    const pool = mockPool({
      assignments: [{ sample_count: 5, p25: 1000, median: 1500, p75: 2000, min_rate: 800, max_rate: 2200 }]
    });
    const r = await getMarketRateStats(pool, "Schweisser", "Berlin");
    assert.equal(r.stage, "deals");
    assert.equal(r.sample_count, 5);
    assert.equal(r.median, 1500);
  });

  it("getOfferRateStats returns stage='offers'", async () => {
    const pool = mockPool({
      offers: [{ sample_count: 3, p25: 1200, median: 1700, p75: 2200, min_rate: 1000, max_rate: 2500 }]
    });
    const r = await getOfferRateStats(pool, "Helfer", null);
    assert.equal(r.stage, "offers");
    assert.equal(r.sample_count, 3);
  });

  it("getSupplyRateStats returns stage='supply'", async () => {
    const pool = mockPool({
      capacity_posts: [{ sample_count: 7, p25: 1100, median: 1600, p75: 2100, min_rate: 900, max_rate: 2400 }]
    });
    const r = await getSupplyRateStats(pool, null, "Hamburg");
    assert.equal(r.stage, "supply");
    assert.equal(r.sample_count, 7);
  });

  it("getDemandBudgetStats returns stage='demand'", async () => {
    const pool = mockPool({
      demand_requests: [{ sample_count: 4, p25: 1300, median: 1800, p75: 2300, min_rate: 1100, max_rate: 2600 }]
    });
    const r = await getDemandBudgetStats(pool, "Fachkraft", "München");
    assert.equal(r.stage, "demand");
    assert.equal(r.sample_count, 4);
  });

  it("stage functions return 0 samples for empty result", async () => {
    const pool = mockPool({});
    const r = await getMarketRateStats(pool, "nope", "nowhere");
    assert.equal(r.sample_count, 0);
    assert.equal(r.median, null);
  });
});
