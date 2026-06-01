/**
 * Smart Ranking / AI Matching tests.
 * Covers: pure signal functions, composite score, classification,
 *         matchingEngine Factor 13 integration, edge cases.
 *
 * Run: node --test --test-force-exit test/smartRanking.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SMART_RANK_WEIGHTS,
  SMART_RANK_LABELS,
  computeFillRateSignal,
  computeSlaComplianceSignal,
  computeRoleExpertiseSignal,
  computeRecencySignal,
  computeSmartRankScore,
  classifySmartRank
} from "../services/smartRankingService.js";

import { scoreMatch } from "../services/matchingEngine.js";

// ═══════════════════════════════════════════════════════
// SMART_RANK_WEIGHTS
// ═══════════════════════════════════════════════════════

describe("SMART_RANK_WEIGHTS — configuration", () => {
  it("weights sum to 1.0", () => {
    const sum = Object.values(SMART_RANK_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001, `Expected 1.0, got ${sum}`);
  });

  it("has exactly 6 signals", () => {
    assert.strictEqual(Object.keys(SMART_RANK_WEIGHTS).length, 6);
  });

  it("fill_rate is the heaviest signal (0.25)", () => {
    assert.strictEqual(SMART_RANK_WEIGHTS.fill_rate, 0.25);
  });
});

// ═══════════════════════════════════════════════════════
// computeFillRateSignal
// ═══════════════════════════════════════════════════════

describe("computeFillRateSignal", () => {
  it("returns neutral 50 when fewer than 3 requests", () => {
    assert.strictEqual(computeFillRateSignal(2, 2), 50);
    assert.strictEqual(computeFillRateSignal(0, 0), 50);
    assert.strictEqual(computeFillRateSignal(1, 1), 50);
  });

  it("returns 100 when all accepted (3+)", () => {
    assert.strictEqual(computeFillRateSignal(5, 5), 100);
  });

  it("returns 0 when none accepted (3+ received)", () => {
    assert.strictEqual(computeFillRateSignal(0, 10), 0);
  });

  it("returns proportional value", () => {
    assert.strictEqual(computeFillRateSignal(3, 6), 50);
    assert.strictEqual(computeFillRateSignal(7, 10), 70);
  });

  it("handles string inputs via Number coercion", () => {
    assert.strictEqual(computeFillRateSignal("8", "10"), 80);
  });

  it("handles null/undefined as 0", () => {
    assert.strictEqual(computeFillRateSignal(null, null), 50); // 0 received < 3 → neutral
    assert.strictEqual(computeFillRateSignal(undefined, 5), 0); // 0 accepted / 5 received → 0%
  });
});

// ═══════════════════════════════════════════════════════
// computeSlaComplianceSignal
// ═══════════════════════════════════════════════════════

describe("computeSlaComplianceSignal", () => {
  it("returns neutral 50 with < 3 requests", () => {
    assert.strictEqual(computeSlaComplianceSignal(0, 2), 50);
  });

  it("returns 100 when zero breaches", () => {
    assert.strictEqual(computeSlaComplianceSignal(0, 10), 100);
  });

  it("returns 0 when all requests breached", () => {
    assert.strictEqual(computeSlaComplianceSignal(10, 10), 0);
  });

  it("inverse proportional", () => {
    // 2 breaches out of 10 → 80%
    assert.strictEqual(computeSlaComplianceSignal(2, 10), 80);
  });

  it("never exceeds 100", () => {
    assert.ok(computeSlaComplianceSignal(0, 100) <= 100);
  });
});

// ═══════════════════════════════════════════════════════
// computeRoleExpertiseSignal
// ═══════════════════════════════════════════════════════

describe("computeRoleExpertiseSignal", () => {
  it("returns neutral 30 with < 2 total deals", () => {
    assert.strictEqual(computeRoleExpertiseSignal(1, 1), 30);
    assert.strictEqual(computeRoleExpertiseSignal(0, 0), 30);
  });

  it("high specialization with volume gives high score", () => {
    // 10/10 role deals → ratio=1.0 → 50 + volumeBonus min(50,50) = 100
    assert.strictEqual(computeRoleExpertiseSignal(10, 10), 100);
  });

  it("zero role deals but sufficient volume gives volume-only bonus", () => {
    // 0/5 → ratio=0 → 0 + min(50, 25) = 25
    assert.strictEqual(computeRoleExpertiseSignal(0, 5), 25);
  });

  it("partial specialization", () => {
    // 3/6 → ratio=0.5 → 25 + min(50,30) = 55
    assert.strictEqual(computeRoleExpertiseSignal(3, 6), 55);
  });

  it("capped at 100", () => {
    assert.ok(computeRoleExpertiseSignal(100, 100) <= 100);
  });
});

// ═══════════════════════════════════════════════════════
// computeRecencySignal
// ═══════════════════════════════════════════════════════

describe("computeRecencySignal", () => {
  it("<1 day → 100", () => {
    assert.strictEqual(computeRecencySignal(0), 100);
    assert.strictEqual(computeRecencySignal(0.5), 100);
  });

  it("1-3 days → 90", () => {
    assert.strictEqual(computeRecencySignal(1), 90);
    assert.strictEqual(computeRecencySignal(2.9), 90);
  });

  it("3-7 days → 80", () => {
    assert.strictEqual(computeRecencySignal(3), 80);
    assert.strictEqual(computeRecencySignal(6), 80);
  });

  it("7-14 days → 60", () => {
    assert.strictEqual(computeRecencySignal(7), 60);
    assert.strictEqual(computeRecencySignal(13), 60);
  });

  it("14-30 days → 40", () => {
    assert.strictEqual(computeRecencySignal(14), 40);
    assert.strictEqual(computeRecencySignal(29), 40);
  });

  it(">30 days → 20", () => {
    assert.strictEqual(computeRecencySignal(30), 20);
    assert.strictEqual(computeRecencySignal(365), 20);
  });
});

// ═══════════════════════════════════════════════════════
// computeSmartRankScore
// ═══════════════════════════════════════════════════════

describe("computeSmartRankScore — composite", () => {
  it("all signals at 100 → score 100", () => {
    const { score } = computeSmartRankScore({
      fill_rate: 100, sla_compliance: 100, role_expertise: 100,
      timesheet_quality: 100, recency: 100, platform_activity: 100
    });
    assert.strictEqual(score, 100);
  });

  it("all signals at 0 → fallback defaults apply for falsy values", () => {
    // 0 is falsy → || default kicks in for fill_rate(50), sla(50), expertise(30), recency(50)
    // Only timesheet_quality and platform_activity use explicit null-check → 0 stays 0
    const { score } = computeSmartRankScore({
      fill_rate: 0, sla_compliance: 0, role_expertise: 0,
      timesheet_quality: 0, recency: 0, platform_activity: 0
    });
    assert.strictEqual(score, 33.5);
  });

  it("returns breakdown with 6 entries", () => {
    const { breakdown } = computeSmartRankScore({
      fill_rate: 80, sla_compliance: 90, role_expertise: 60,
      timesheet_quality: 70, recency: 100, platform_activity: 50
    });
    assert.strictEqual(breakdown.length, 6);
    for (const b of breakdown) {
      assert.ok(b.signal, "each breakdown entry has signal name");
      assert.ok(typeof b.weight === "number");
      assert.ok(typeof b.value === "number");
      assert.ok(typeof b.weighted === "number");
      assert.ok(typeof b.detail === "string");
    }
  });

  it("null timesheet_quality defaults to 50", () => {
    const { breakdown } = computeSmartRankScore({
      fill_rate: 80, sla_compliance: 80, role_expertise: 80,
      timesheet_quality: null, recency: 80, platform_activity: 80
    });
    const ts = breakdown.find(b => b.signal === "timesheet_quality");
    assert.strictEqual(ts.value, 50);
  });

  it("null platform_activity defaults to 30", () => {
    const { breakdown } = computeSmartRankScore({
      fill_rate: 80, sla_compliance: 80, role_expertise: 80,
      timesheet_quality: 80, recency: 80, platform_activity: null
    });
    const pa = breakdown.find(b => b.signal === "platform_activity");
    assert.strictEqual(pa.value, 30);
  });

  it("empty signals → neutral defaults", () => {
    const { score } = computeSmartRankScore({});
    assert.ok(score > 0, "neutral defaults should produce a positive score");
    assert.ok(score < 60, "neutral defaults should not be high");
  });

  it("score capped at 100", () => {
    const { score } = computeSmartRankScore({
      fill_rate: 200, sla_compliance: 200, role_expertise: 200,
      timesheet_quality: 200, recency: 200, platform_activity: 200
    });
    assert.strictEqual(score, 100);
  });
});

// ═══════════════════════════════════════════════════════
// classifySmartRank
// ═══════════════════════════════════════════════════════

describe("classifySmartRank — thresholds", () => {
  it("score >= 85 → excellent", () => {
    assert.strictEqual(classifySmartRank(85), "excellent");
    assert.strictEqual(classifySmartRank(100), "excellent");
  });

  it("score 70-84 → strong", () => {
    assert.strictEqual(classifySmartRank(70), "strong");
    assert.strictEqual(classifySmartRank(84), "strong");
  });

  it("score 50-69 → solid", () => {
    assert.strictEqual(classifySmartRank(50), "solid");
    assert.strictEqual(classifySmartRank(69), "solid");
  });

  it("score 30-49 → developing", () => {
    assert.strictEqual(classifySmartRank(30), "developing");
    assert.strictEqual(classifySmartRank(49), "developing");
  });

  it("score < 30 → insufficient", () => {
    assert.strictEqual(classifySmartRank(0), "insufficient");
    assert.strictEqual(classifySmartRank(29), "insufficient");
  });
});

// ═══════════════════════════════════════════════════════
// SMART_RANK_LABELS
// ═══════════════════════════════════════════════════════

describe("SMART_RANK_LABELS — German labels", () => {
  it("has all 5 classifications", () => {
    assert.strictEqual(Object.keys(SMART_RANK_LABELS).length, 5);
    assert.strictEqual(SMART_RANK_LABELS.excellent, "Exzellent");
    assert.strictEqual(SMART_RANK_LABELS.strong, "Stark");
    assert.strictEqual(SMART_RANK_LABELS.solid, "Solide");
    assert.strictEqual(SMART_RANK_LABELS.developing, "Aufbauend");
    assert.strictEqual(SMART_RANK_LABELS.insufficient, "Unzureichend");
  });
});

// ═══════════════════════════════════════════════════════
// scoreMatch — Factor 13: Smart Rank / AI Score
// ═══════════════════════════════════════════════════════

describe("scoreMatch — Factor 13: Smart Rank / AI Score", () => {
  const demand = { role: "Schweisser", skill_tags: ["WIG"] };
  const cap    = { role: "Schweisser", skill_tags: ["WIG"] };

  it("adds smartRank factor when smartRankScore > 0", () => {
    const { reasons } = scoreMatch(demand, cap, { smartRankScore: 80 });
    const sr = reasons.find(r => r.factor === "smartRank");
    assert.ok(sr, "should have smartRank reason");
    assert.strictEqual(sr.max, 10);
    assert.ok(sr.points > 0);
    assert.ok(sr.detail.includes("Smart Rank"));
  });

  it("max 10 pts for score 100", () => {
    const { reasons } = scoreMatch(demand, cap, { smartRankScore: 100 });
    const sr = reasons.find(r => r.factor === "smartRank");
    assert.strictEqual(sr.points, 10);
  });

  it("proportional: score 50 → 5 pts", () => {
    const { reasons } = scoreMatch(demand, cap, { smartRankScore: 50 });
    const sr = reasons.find(r => r.factor === "smartRank");
    assert.strictEqual(sr.points, 5);
  });

  it("opt-in: no factor when smartRankScore is null", () => {
    const { reasons } = scoreMatch(demand, cap, { smartRankScore: null });
    assert.strictEqual(reasons.find(r => r.factor === "smartRank"), undefined);
  });

  it("opt-in: no factor when smartRankScore is 0", () => {
    const { reasons } = scoreMatch(demand, cap, { smartRankScore: 0 });
    assert.strictEqual(reasons.find(r => r.factor === "smartRank"), undefined);
  });

  it("opt-in: no factor when smartRankScore is undefined", () => {
    const { reasons } = scoreMatch(demand, cap, {});
    assert.strictEqual(reasons.find(r => r.factor === "smartRank"), undefined);
  });

  it("uses provided smartRankLabel in detail", () => {
    const { reasons } = scoreMatch(demand, cap, {
      smartRankScore: 90,
      smartRankLabel: "Exzellent"
    });
    const sr = reasons.find(r => r.factor === "smartRank");
    assert.ok(sr.detail.includes("Exzellent"));
  });

  it("fallback label classification when no smartRankLabel", () => {
    const { reasons } = scoreMatch(demand, cap, { smartRankScore: 45 });
    const sr = reasons.find(r => r.factor === "smartRank");
    assert.ok(sr.detail.includes("Aufbauend") || sr.detail.includes("Solide"));
  });

  it("smart rank combines with all other factors", () => {
    const { score, reasons } = scoreMatch(demand, cap, {
      smartRankScore: 100,
      supplierVerified: true,
      complianceScore: 80,
      reputationScore: 90,
      preferredFirst: true,
      vendorPoolTier: "PREFERRED"
    });
    const sr = reasons.find(r => r.factor === "smartRank");
    const pf = reasons.find(r => r.factor === "preferredFirst");
    assert.ok(sr, "smartRank present");
    assert.ok(pf, "preferredFirst present");
    assert.ok(score > 30, "combined score should be significant");
  });

  it("score never exceeds 100 even with all factors maxed", () => {
    const { score } = scoreMatch(demand, cap, {
      smartRankScore: 100,
      supplierVerified: true,
      complianceScore: 100,
      reputationScore: 100,
      preferredFirst: true,
      vendorPoolTier: "PREFERRED",
      rateCompatible: true,
      urgencyBoost: true,
      workerCountMatch: true
    });
    assert.ok(score <= 100, `Score ${score} should be <= 100`);
  });
});
