/**
 * Reputation Visibility Tests
 *
 * Covers:
 *  1. computeTimesheetReliabilityScore — pure function edge cases
 *  2. getPublicReputationCard — display-ready card structure
 *  3. getBadgesForSuppliers — batch badge enrichment
 *  4. matchingEngine reputation factor (factor 11)
 *  5. Grade labels and colors
 *
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeTimesheetReliabilityScore,
  computeGrade,
  computeScoreGrade,
  computeReputationScore,
  computeResponseTimeScore,
  getPublicReputationCard,
  getBadgesForSuppliers
} from "../services/reputationService.js";
import { scoreMatch } from "../services/matchingEngine.js";

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

// ═════════════════════════════════════════════════════════════
// 1. computeTimesheetReliabilityScore
// ═════════════════════════════════════════════════════════════

describe("computeTimesheetReliabilityScore", () => {
  it("returns null when total < 3 (insufficient data)", () => {
    assert.equal(computeTimesheetReliabilityScore(2, 0), null);
    assert.equal(computeTimesheetReliabilityScore(1, 1), null);
    assert.equal(computeTimesheetReliabilityScore(0, 0), null);
  });

  it("100% when all approved", () => {
    assert.equal(computeTimesheetReliabilityScore(10, 0), 100);
  });

  it("0% when all rejected", () => {
    assert.equal(computeTimesheetReliabilityScore(0, 5), 0);
  });

  it("66.67% when 2/3 approved", () => {
    assert.equal(computeTimesheetReliabilityScore(2, 1), 66.67);
  });

  it("80% when 8/10 approved", () => {
    assert.equal(computeTimesheetReliabilityScore(8, 2), 80);
  });

  it("exactly 3 total yields a result", () => {
    assert.equal(computeTimesheetReliabilityScore(3, 0), 100);
  });

  it("handles string numbers (from DB)", () => {
    assert.equal(computeTimesheetReliabilityScore("5", "0"), 100);
    assert.equal(computeTimesheetReliabilityScore("3", "3"), 50);
  });

  it("handles null inputs", () => {
    assert.equal(computeTimesheetReliabilityScore(null, null), null);
  });
});

// ═════════════════════════════════════════════════════════════
// 2. getPublicReputationCard
// ═════════════════════════════════════════════════════════════

describe("getPublicReputationCard", () => {
  it("returns null for unknown supplier", async () => {
    const pool = mockPool({});
    const card = await getPublicReputationCard(pool, "nonexistent");
    assert.equal(card, null);
  });

  it("returns complete card structure for known supplier", async () => {
    const pool = mockPool({
      "supplier_reputation": [{
        supplier_id: "s1",
        supplier_name: "TestGmbH",
        grade: "GOLD",
        reputation_score: 82.5,
        ranking_score: 55.2,
        avg_stars: 4.2,
        total_ratings: 15,
        deal_success_rate: 85,
        completed_deals: 17,
        total_deals: 20,
        response_time_score: 75,
        activity_score: 60,
        timesheet_reliability_score: 95,
        updated_at: "2026-01-15T10:00:00Z"
      }],
      "users WHERE": [{
        created_at: "2024-06-01T00:00:00Z",
        is_verified: true
      }]
    });

    const card = await getPublicReputationCard(pool, "s1");
    assert.ok(card);
    assert.equal(card.supplier_id, "s1");
    assert.equal(card.grade, "GOLD");
    assert.equal(card.grade_label, "Gold");
    assert.equal(card.badge_color, "#F59E0B");
    assert.equal(card.reputation_score, 82.5);
    assert.equal(card.verified, true);

    // Check signals array
    assert.equal(card.signals.length, 5);
    assert.equal(card.signals[0].key, "stars");
    assert.equal(card.signals[0].label, "Bewertung");
    assert.ok(card.signals[0].display.includes("4.2"));

    assert.equal(card.signals[1].key, "deal_success");
    assert.equal(card.signals[1].display, "85%");

    assert.equal(card.signals[2].key, "response_time");
    assert.equal(card.signals[2].display, "Sehr schnell (< 4h)");

    assert.equal(card.signals[3].key, "activity");

    assert.equal(card.signals[4].key, "timesheet_reliability");
    assert.equal(card.signals[4].display, "95%");
  });

  it("handles supplier with no ratings", async () => {
    const pool = mockPool({
      "supplier_reputation": [{
        supplier_id: "s2",
        supplier_name: "NewCo",
        grade: "UNRATED",
        reputation_score: 0,
        ranking_score: 0,
        avg_stars: null,
        total_ratings: 0,
        deal_success_rate: null,
        completed_deals: 0,
        total_deals: 0,
        response_time_score: null,
        activity_score: 0,
        timesheet_reliability_score: null,
        updated_at: "2026-01-01T00:00:00Z"
      }]
    });

    const card = await getPublicReputationCard(pool, "s2");
    assert.ok(card);
    assert.equal(card.grade, "UNRATED");
    assert.equal(card.grade_label, "Nicht bewertet");
    assert.equal(card.badge_color, "#6B7280");
    assert.equal(card.signals[0].display, "Noch keine");
    assert.equal(card.signals[1].display, "Zu wenig Daten");
    assert.equal(card.signals[4].display, "Keine Daten");
  });

  it("PLATINUM grade shows correct label and color", async () => {
    const pool = mockPool({
      "supplier_reputation": [{
        supplier_id: "s3", supplier_name: "TopAgency",
        grade: "PLATINUM", reputation_score: 95, ranking_score: 70,
        avg_stars: 4.8, total_ratings: 50, deal_success_rate: 98,
        completed_deals: 49, total_deals: 50,
        response_time_score: 100, activity_score: 90,
        timesheet_reliability_score: 99, updated_at: new Date().toISOString()
      }]
    });
    const card = await getPublicReputationCard(pool, "s3");
    assert.equal(card.grade_label, "Platin");
    assert.equal(card.badge_color, "#A78BFA");
  });
});

// ═════════════════════════════════════════════════════════════
// 3. getBadgesForSuppliers
// ═════════════════════════════════════════════════════════════

describe("getBadgesForSuppliers", () => {
  it("returns empty map for empty input", async () => {
    const pool = mockPool({});
    const map = await getBadgesForSuppliers(pool, []);
    assert.equal(map.size, 0);
  });

  it("returns badges for known suppliers", async () => {
    const pool = mockPool({
      "supplier_reputation": [
        { supplier_id: "s1", grade: "GOLD", reputation_score: 82, avg_stars: 4.2, total_ratings: 15 },
        { supplier_id: "s2", grade: "SILVER", reputation_score: 72, avg_stars: 3.8, total_ratings: 8 }
      ]
    });
    const map = await getBadgesForSuppliers(pool, ["s1", "s2", "s3"]);
    assert.equal(map.size, 2);

    const s1 = map.get("s1");
    assert.equal(s1.grade, "GOLD");
    assert.equal(s1.grade_label, "Gold");
    assert.equal(s1.badge_color, "#F59E0B");

    const s2 = map.get("s2");
    assert.equal(s2.grade, "SILVER");
    assert.equal(s2.grade_label, "Silber");
  });

  it("handles pool errors gracefully", async () => {
    const pool = { query() { throw new Error("DB down"); } };
    const map = await getBadgesForSuppliers(pool, ["s1"]);
    assert.equal(map.size, 0);
  });
});

// ═════════════════════════════════════════════════════════════
// 4. matchingEngine — reputation factor (factor 11)
// ═════════════════════════════════════════════════════════════

describe("matchingEngine reputation factor", () => {
  const baseDemand = { role: "Schweisser", skill_tags: [], start_date: "2026-01-01", end_date: "2026-03-31" };
  const baseCap = { role: "Schweisser", skill_tags: [], availability_from: "2026-01-01", availability_to: "2026-12-31" };

  it("adds reputation points when reputationScore provided", () => {
    const { score, reasons } = scoreMatch(baseDemand, baseCap, { reputationScore: 80 });
    const repReason = reasons.find(r => r.factor === "reputation");
    assert.ok(repReason, "reputation factor should be present");
    assert.equal(repReason.max, 8);
    // 80/100 * 8 = 6.4 → round = 6
    assert.equal(repReason.points, 6);
  });

  it("no reputation points when reputationScore is 0", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { reputationScore: 0 });
    const repReason = reasons.find(r => r.factor === "reputation");
    assert.ok(!repReason, "reputation factor should not be present for score 0");
  });

  it("no reputation points when reputationScore not provided", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, {});
    const repReason = reasons.find(r => r.factor === "reputation");
    assert.ok(!repReason, "reputation factor should not be present when not provided");
  });

  it("max 8 points for perfect reputation", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { reputationScore: 100 });
    const repReason = reasons.find(r => r.factor === "reputation");
    assert.equal(repReason.points, 8);
  });

  it("caps at 8 even for score > 100", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { reputationScore: 150 });
    const repReason = reasons.find(r => r.factor === "reputation");
    assert.equal(repReason.points, 8);
  });

  it("reputation detail includes score", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { reputationScore: 75 });
    const repReason = reasons.find(r => r.factor === "reputation");
    assert.ok(repReason.detail.includes("75"));
  });
});

// ═════════════════════════════════════════════════════════════
// 5. Grade labels and response time labels
// ═════════════════════════════════════════════════════════════

describe("Grade system consistency", () => {
  it("computeScoreGrade covers all tiers", () => {
    assert.equal(computeScoreGrade(95), "PLATINUM");
    assert.equal(computeScoreGrade(85), "GOLD");
    assert.equal(computeScoreGrade(75), "SILVER");
    assert.equal(computeScoreGrade(65), "BRONZE");
    assert.equal(computeScoreGrade(50), "UNRATED");
  });

  it("computeGrade legacy covers all tiers", () => {
    assert.equal(computeGrade(0, 0, 0), "UNRATED");
    assert.equal(computeGrade(1, 3.0, 1), "BRONZE");
    assert.equal(computeGrade(3, 3.5, 3), "SILVER");
    assert.equal(computeGrade(5, 4.0, 8), "GOLD");
    assert.equal(computeGrade(10, 4.5, 15), "PLATINUM");
  });

  it("response time score tiers are consistent", () => {
    assert.equal(computeResponseTimeScore(0.5), 100);
    assert.equal(computeResponseTimeScore(2), 75);
    assert.equal(computeResponseTimeScore(8), 50);
    assert.equal(computeResponseTimeScore(18), 25);
    assert.equal(computeResponseTimeScore(30), 10);
  });

  it("reputation score combines correctly", () => {
    // 5★ → starsPct=100, 100% deal success, 100 response = 100*0.5 + 100*0.3 + 100*0.2 = 100
    assert.equal(computeReputationScore(5.0, 100, 100), 100);
    // 3★ → starsPct=50, 50%, 50 = 50*0.5 + 50*0.3 + 50*0.2 = 50
    assert.equal(computeReputationScore(3.0, 50, 50), 50);
  });
});
