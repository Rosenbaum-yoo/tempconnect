/**
 * Reputation Service unit tests — pure logic functions, no DB required.
 * Tests: computeGrade thresholds, computeResponseTimeScore tiers.
 *
 * Run: node --test --test-force-exit test/reputationService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  computeGrade, computeResponseTimeScore,
  computeReputationScore, computeDealSuccessRate,
  computeActivityScore, computeScoreGrade, computeRankingScore,
  computePremiumBoost, computeEffectiveRankScore
} from "../services/reputationService.js";

// ─────────────────────────────────────────────────────────────
// computeGrade
// ─────────────────────────────────────────────────────────────

describe("computeGrade — grade thresholds", () => {
  it("returns UNRATED when no ratings", () => {
    assert.strictEqual(computeGrade(0, 0, 0), "UNRATED");
  });

  it("returns BRONZE for minimal ratings", () => {
    assert.strictEqual(computeGrade(1, 3.0, 1), "BRONZE");
  });

  it("returns SILVER for moderate ratings", () => {
    assert.strictEqual(computeGrade(3, 3.5, 3), "SILVER");
  });

  it("returns GOLD for good ratings", () => {
    assert.strictEqual(computeGrade(5, 4.0, 8), "GOLD");
  });

  it("returns PLATINUM for excellent ratings", () => {
    assert.strictEqual(computeGrade(10, 4.5, 15), "PLATINUM");
  });

  it("GOLD not reached with too few deals", () => {
    // 5 ratings, 4.0★, 2 deals → misses GOLD (needs 8 deals) AND SILVER (needs 3 deals)
    assert.strictEqual(computeGrade(5, 4.0, 2), "BRONZE");
  });

  it("PLATINUM not reached with too few ratings", () => {
    assert.strictEqual(computeGrade(5, 4.5, 15), "GOLD");
  });

  it("SILVER not reached with low stars", () => {
    assert.strictEqual(computeGrade(3, 3.0, 3), "BRONZE");
  });
});

// ─────────────────────────────────────────────────────────────
// computeResponseTimeScore
// ─────────────────────────────────────────────────────────────

describe("computeResponseTimeScore — tier mapping", () => {
  it("null input returns null", () => {
    assert.strictEqual(computeResponseTimeScore(null), null);
  });

  it("undefined input returns null", () => {
    assert.strictEqual(computeResponseTimeScore(undefined), null);
  });

  it("<1h returns 100", () => {
    assert.strictEqual(computeResponseTimeScore(0.5), 100);
  });

  it("exactly 0h returns 100", () => {
    assert.strictEqual(computeResponseTimeScore(0), 100);
  });

  it("1h-4h returns 75", () => {
    assert.strictEqual(computeResponseTimeScore(2.5), 75);
    assert.strictEqual(computeResponseTimeScore(1), 75);
    assert.strictEqual(computeResponseTimeScore(3.9), 75);
  });

  it("4h-12h returns 50", () => {
    assert.strictEqual(computeResponseTimeScore(4), 50);
    assert.strictEqual(computeResponseTimeScore(8), 50);
    assert.strictEqual(computeResponseTimeScore(11.9), 50);
  });

  it("12h-24h returns 25", () => {
    assert.strictEqual(computeResponseTimeScore(12), 25);
    assert.strictEqual(computeResponseTimeScore(18), 25);
    assert.strictEqual(computeResponseTimeScore(23.9), 25);
  });

  it(">24h returns 10", () => {
    assert.strictEqual(computeResponseTimeScore(24), 10);
    assert.strictEqual(computeResponseTimeScore(48), 10);
    assert.strictEqual(computeResponseTimeScore(168), 10);
  });

  it("handles string numbers (from DB)", () => {
    assert.strictEqual(computeResponseTimeScore("0.5"), 100);
    assert.strictEqual(computeResponseTimeScore("3.0"), 75);
    assert.strictEqual(computeResponseTimeScore("25"), 10);
  });
});

// ─────────────────────────────────────────────────────────────────
// computeReputationScore
// ─────────────────────────────────────────────────────────────────

describe("computeReputationScore — composite score", () => {
  it("all nulls return 0", () => {
    assert.strictEqual(computeReputationScore(null, null, null), 0);
  });

  it("perfect scores: 5★, 100% deal success, 100 response", () => {
    // stars_pct = ((5-1)/4)*100 = 100, so: 100*0.5 + 100*0.3 + 100*0.2 = 100
    assert.strictEqual(computeReputationScore(5.0, 100, 100), 100);
  });

  it("mid-range: 3★, 50% success, 50 response", () => {
    // stars_pct = ((3-1)/4)*100 = 50, so: 50*0.5 + 50*0.3 + 50*0.2 = 50
    assert.strictEqual(computeReputationScore(3.0, 50, 50), 50);
  });

  it("only stars contribute when others are null", () => {
    // stars_pct = ((4-1)/4)*100 = 75, so: 75*0.5 = 37.5
    assert.strictEqual(computeReputationScore(4.0, null, null), 37.5);
  });

  it("only deal_success contributes when stars=0", () => {
    // stars_pct = 0, dsr = 80*0.3 = 24
    assert.strictEqual(computeReputationScore(0, 80, 0), 24);
  });

  it("stars below 1 are clamped to 0", () => {
    assert.strictEqual(computeReputationScore(0.5, 0, 0), 0);
  });
});

// ─────────────────────────────────────────────────────────────────
// computeDealSuccessRate
// ─────────────────────────────────────────────────────────────────

describe("computeDealSuccessRate — deal completion percentage", () => {
  it("returns null when total < 3 (insufficient data)", () => {
    assert.strictEqual(computeDealSuccessRate(2, 2), null);
    assert.strictEqual(computeDealSuccessRate(0, 0), null);
    assert.strictEqual(computeDealSuccessRate(1, 1), null);
  });

  it("100% when all deals completed", () => {
    assert.strictEqual(computeDealSuccessRate(5, 5), 100);
  });

  it("0% when no deals completed", () => {
    assert.strictEqual(computeDealSuccessRate(0, 5), 0);
  });

  it("50% when half completed", () => {
    assert.strictEqual(computeDealSuccessRate(3, 6), 50);
  });

  it("handles fractional results with 2 decimal precision", () => {
    // 2/3 = 66.666... → 66.67
    assert.strictEqual(computeDealSuccessRate(2, 3), 66.67);
  });

  it("threshold: exactly 3 total yields a result", () => {
    assert.strictEqual(computeDealSuccessRate(3, 3), 100);
  });
});

// ─────────────────────────────────────────────────────────────────
// computeActivityScore
// ─────────────────────────────────────────────────────────────────

describe("computeActivityScore — activity index", () => {
  it("no listings and no responses returns 0", () => {
    assert.strictEqual(computeActivityScore(0, 0), 0);
  });

  it("1 listing = 10 pts", () => {
    assert.strictEqual(computeActivityScore(1, 0), 10);
  });

  it("5 listings = 50 pts (cap)", () => {
    assert.strictEqual(computeActivityScore(5, 0), 50);
  });

  it("10 listings still capped at 50 pts", () => {
    assert.strictEqual(computeActivityScore(10, 0), 50);
  });

  it("100% response rate = 50 pts", () => {
    assert.strictEqual(computeActivityScore(0, 100), 50);
  });

  it("50% response rate = 25 pts", () => {
    assert.strictEqual(computeActivityScore(0, 50), 25);
  });

  it("max score: 5 listings + 100% response = 100", () => {
    assert.strictEqual(computeActivityScore(5, 100), 100);
  });
});

// ─────────────────────────────────────────────────────────────────
// computeScoreGrade
// ─────────────────────────────────────────────────────────────────

describe("computeScoreGrade — score-based grade mapping", () => {
  it("90 → PLATINUM", () => {
    assert.strictEqual(computeScoreGrade(90), "PLATINUM");
  });

  it("95 → PLATINUM", () => {
    assert.strictEqual(computeScoreGrade(95), "PLATINUM");
  });

  it("80 → GOLD", () => {
    assert.strictEqual(computeScoreGrade(80), "GOLD");
  });

  it("89.99 → GOLD (boundary)", () => {
    assert.strictEqual(computeScoreGrade(89.99), "GOLD");
  });

  it("70 → SILVER", () => {
    assert.strictEqual(computeScoreGrade(70), "SILVER");
  });

  it("60 → BRONZE", () => {
    assert.strictEqual(computeScoreGrade(60), "BRONZE");
  });

  it("59.99 → UNRATED (boundary)", () => {
    assert.strictEqual(computeScoreGrade(59.99), "UNRATED");
  });

  it("0 → UNRATED", () => {
    assert.strictEqual(computeScoreGrade(0), "UNRATED");
  });

  it("null → UNRATED", () => {
    assert.strictEqual(computeScoreGrade(null), "UNRATED");
  });
});

// ─────────────────────────────────────────────────────────────────
// computeRankingScore
// ─────────────────────────────────────────────────────────────────

describe("computeRankingScore — weighted composite for feed", () => {
  it("all zeros → 0", () => {
    assert.strictEqual(computeRankingScore({
      reputationScore: 0, responseTimeScore: 0, dealSuccessRate: 0, activityScore: 0
    }), 0);
  });

  it("all 100 → 70 (static portion max)", () => {
    // 100*0.30 + 100*0.15 + 100*0.15 + 100*0.10 = 30 + 15 + 15 + 10 = 70
    assert.strictEqual(computeRankingScore({
      reputationScore: 100, responseTimeScore: 100, dealSuccessRate: 100, activityScore: 100
    }), 70);
  });

  it("reputation=80 only → 24", () => {
    assert.strictEqual(computeRankingScore({
      reputationScore: 80, responseTimeScore: 0, dealSuccessRate: 0, activityScore: 0
    }), 24);
  });

  it("verifies weight distribution", () => {
    // rep=50*0.30=15, rts=100*0.15=15, dsr=60*0.15=9, act=80*0.10=8 = 47
    assert.strictEqual(computeRankingScore({
      reputationScore: 50, responseTimeScore: 100, dealSuccessRate: 60, activityScore: 80
    }), 47);
  });

  it("handles undefined factors as 0", () => {
    assert.strictEqual(computeRankingScore({}), 0);
  });
});

// ─────────────────────────────────────────────────────────────────
// computePremiumBoost
// ─────────────────────────────────────────────────────────────────

describe("computePremiumBoost — plan-based boost with anti-spam", () => {
  // Base boost values per spec
  it("ENTERPRISE = 20 with good reputation", () => {
    assert.strictEqual(computePremiumBoost("ENTERPRISE", 80), 20);
  });

  it("PRO = 10 with good reputation", () => {
    assert.strictEqual(computePremiumBoost("PRO", 70), 10);
  });

  it("PLUS = 5 with good reputation", () => {
    assert.strictEqual(computePremiumBoost("PLUS", 60), 5);
  });

  it("BASIS = 0 (no boost)", () => {
    assert.strictEqual(computePremiumBoost("BASIS", 90), 0);
  });

  it("FREE = 0 (no boost)", () => {
    assert.strictEqual(computePremiumBoost("FREE", 100), 0);
  });

  it("null plan = 0", () => {
    assert.strictEqual(computePremiumBoost(null, 80), 0);
  });

  // Anti-spam: halved when reputationScore < 40
  it("ENTERPRISE halved at rep=35 → 10", () => {
    assert.strictEqual(computePremiumBoost("ENTERPRISE", 35), 10);
  });

  it("PRO halved at rep=30 → 5", () => {
    assert.strictEqual(computePremiumBoost("PRO", 30), 5);
  });

  it("PLUS halved at rep=25 → 3 (rounded)", () => {
    assert.strictEqual(computePremiumBoost("PLUS", 25), 3);
  });

  // Anti-spam: quartered when reputationScore < 20
  it("ENTERPRISE quartered at rep=15 → 5", () => {
    assert.strictEqual(computePremiumBoost("ENTERPRISE", 15), 5);
  });

  it("PRO quartered at rep=10 → 3 (rounded)", () => {
    assert.strictEqual(computePremiumBoost("PRO", 10), 3);
  });

  it("PLUS quartered at rep=5 → 1 (rounded)", () => {
    assert.strictEqual(computePremiumBoost("PLUS", 5), 1);
  });

  // Boundary: exactly 40 → full boost (not halved)
  it("ENTERPRISE at rep=40 → full 20", () => {
    assert.strictEqual(computePremiumBoost("ENTERPRISE", 40), 20);
  });

  // Boundary: exactly 20 → halved (not quartered)
  it("ENTERPRISE at rep=20 → halved 10", () => {
    assert.strictEqual(computePremiumBoost("ENTERPRISE", 20), 10);
  });

  // Null reputation → treated as 0 → quartered
  it("ENTERPRISE with null reputation → quartered", () => {
    assert.strictEqual(computePremiumBoost("ENTERPRISE", null), 5);
  });

  // Case-insensitive plan names
  it("lowercase plan 'enterprise' → 20", () => {
    assert.strictEqual(computePremiumBoost("enterprise", 80), 20);
  });

  it("mixed case 'Plus' → 5", () => {
    assert.strictEqual(computePremiumBoost("Plus", 50), 5);
  });
});

// ─────────────────────────────────────────────────────────────────
// computeEffectiveRankScore
// ─────────────────────────────────────────────────────────────────

describe("computeEffectiveRankScore — capped composite", () => {
  it("all zeros → 0", () => {
    assert.strictEqual(computeEffectiveRankScore(0, 0, 0, 0), 0);
  });

  it("normal combination: 50+10+15+5 = 80", () => {
    assert.strictEqual(computeEffectiveRankScore(50, 10, 15, 5), 80);
  });

  it("capped at 100: 70+15+20+5 = 110 → 100", () => {
    assert.strictEqual(computeEffectiveRankScore(70, 15, 20, 5), 100);
  });

  it("handles null/undefined inputs as 0", () => {
    assert.strictEqual(computeEffectiveRankScore(null, undefined, 10, 0), 10);
  });

  it("preserves decimal precision", () => {
    assert.strictEqual(computeEffectiveRankScore(33.33, 7.5, 0, 0), 40.83);
  });

  it("exactly 100 → 100 (not over-capped)", () => {
    assert.strictEqual(computeEffectiveRankScore(70, 15, 10, 5), 100);
  });
});
