/**
 * Comprehensive coverage suite for services/reputationService.js
 *
 * Covers all exported functions:
 *   pure logic: computeGrade, computeResponseTimeScore, computeReputationScore,
 *     computeDealSuccessRate, computeActivityScore, computeScoreGrade,
 *     computeRankingScore, computePremiumBoost, computeEffectiveRankScore,
 *     computeTimesheetReliabilityScore
 *   DB-backed: getPublicReputationCard, getBadgesForSuppliers, recomputeReputation,
 *     getReputation, batchRecompute, topSuppliers
 *
 * DB functions are exercised with a local trackingPool that records {sql,params}
 * and dispatches by SQL substring, which is robust to multi-helper call graphs.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as svc from "../services/reputationService.js";

/* ── tracking pool: routes queries by SQL substring ──────── */
function trackingPool(routes = []) {
  const calls = [];
  const queryFn = async (sql, params) => {
    calls.push({ sql, params });
    for (const [needle, resp] of routes) {
      if (sql.includes(needle)) {
        if (resp instanceof Error) throw resp;
        const r = typeof resp === "function" ? resp(sql, params) : resp;
        return r;
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} })
  };
}

/* ════════════════════════════════════════════════════════════
 * computeGrade
 * ════════════════════════════════════════════════════════════ */
describe("computeGrade", () => {
  it("UNRATED when no ratings", () => {
    assert.equal(svc.computeGrade(0, 5, 50), "UNRATED");
  });
  it("PLATINUM at top thresholds", () => {
    assert.equal(svc.computeGrade(10, 4.5, 15), "PLATINUM");
  });
  it("GOLD at gold thresholds", () => {
    assert.equal(svc.computeGrade(5, 4.0, 8), "GOLD");
  });
  it("SILVER at silver thresholds", () => {
    assert.equal(svc.computeGrade(3, 3.5, 3), "SILVER");
  });
  it("BRONZE as fallback when rated but below silver", () => {
    assert.equal(svc.computeGrade(2, 3.0, 1), "BRONZE");
  });
  it("falls back to GOLD when deals short of platinum", () => {
    // high stars + ratings but only 8 deals → not PLATINUM, qualifies GOLD
    assert.equal(svc.computeGrade(10, 4.5, 8), "GOLD");
  });
});

/* ════════════════════════════════════════════════════════════
 * computeResponseTimeScore
 * ════════════════════════════════════════════════════════════ */
describe("computeResponseTimeScore", () => {
  it("null for null/undefined input", () => {
    assert.equal(svc.computeResponseTimeScore(null), null);
    assert.equal(svc.computeResponseTimeScore(undefined), null);
  });
  it("100 for under 1h", () => {
    assert.equal(svc.computeResponseTimeScore(0.5), 100);
  });
  it("75 for under 4h", () => {
    assert.equal(svc.computeResponseTimeScore(3), 75);
  });
  it("50 for under 12h", () => {
    assert.equal(svc.computeResponseTimeScore(11), 50);
  });
  it("25 for under 24h", () => {
    assert.equal(svc.computeResponseTimeScore(23), 25);
  });
  it("10 for >= 24h", () => {
    assert.equal(svc.computeResponseTimeScore(48), 10);
  });
  it("coerces numeric strings", () => {
    assert.equal(svc.computeResponseTimeScore("0.2"), 100);
  });
});

/* ════════════════════════════════════════════════════════════
 * computeReputationScore
 * ════════════════════════════════════════════════════════════ */
describe("computeReputationScore", () => {
  it("all nulls → 0", () => {
    assert.equal(svc.computeReputationScore(null, null, null), 0);
  });
  it("perfect inputs → 100", () => {
    // stars 5 → 100% ; dsr 100 ; rts 100 → 100*.5+100*.3+100*.2 = 100
    assert.equal(svc.computeReputationScore(5, 100, 100), 100);
  });
  it("weighted composite computed correctly", () => {
    // stars 3 → ((3-1)/4)*100 = 50 ; dsr 80 ; rts 50
    // 50*.5 + 80*.3 + 50*.2 = 25 + 24 + 10 = 59
    assert.equal(svc.computeReputationScore(3, 80, 50), 59);
  });
  it("stars of 0 treated as 0 contribution", () => {
    // starsPct=0 ; dsr=50 → 50*.3=15
    assert.equal(svc.computeReputationScore(0, 50, null), 15);
  });
  it("clamps overflow inputs to 100", () => {
    assert.equal(svc.computeReputationScore(99, 999, 999), 100);
  });
  it("rounds to 2 decimals", () => {
    // stars 4 → 75 ; dsr 33.333 ; rts 0
    // 75*.5 + 33.333*.3 = 37.5 + 9.9999 = 47.4999 → 47.5
    assert.equal(svc.computeReputationScore(4, 33.333, 0), 47.5);
  });
});

/* ════════════════════════════════════════════════════════════
 * computeDealSuccessRate
 * ════════════════════════════════════════════════════════════ */
describe("computeDealSuccessRate", () => {
  it("null when total < 3", () => {
    assert.equal(svc.computeDealSuccessRate(2, 2), null);
  });
  it("computes percentage when enough data", () => {
    assert.equal(svc.computeDealSuccessRate(3, 4), 75);
  });
  it("100% when all completed", () => {
    assert.equal(svc.computeDealSuccessRate(5, 5), 100);
  });
  it("rounds to 2 decimals", () => {
    // 1/3 = 33.3333 → 33.33
    assert.equal(svc.computeDealSuccessRate(1, 3), 33.33);
  });
  it("non-numeric coerced to 0", () => {
    assert.equal(svc.computeDealSuccessRate("x", 4), 0);
  });
});

/* ════════════════════════════════════════════════════════════
 * computeActivityScore
 * ════════════════════════════════════════════════════════════ */
describe("computeActivityScore", () => {
  it("zero inputs → 0", () => {
    assert.equal(svc.computeActivityScore(0, 0), 0);
  });
  it("listings capped at 50", () => {
    // 10 listings * 10 = 100 → capped 50 ; rate 0 → total 50
    assert.equal(svc.computeActivityScore(10, 0), 50);
  });
  it("rate component scaled to 50", () => {
    // 0 listings ; rate 100 → 50
    assert.equal(svc.computeActivityScore(0, 100), 50);
  });
  it("combined within bounds", () => {
    // 2 listings → 20 ; rate 50 → 25 → 45
    assert.equal(svc.computeActivityScore(2, 50), 45);
  });
  it("max 100 with high inputs", () => {
    assert.equal(svc.computeActivityScore(99, 200), 100);
  });
  it("non-numeric coerced to 0", () => {
    assert.equal(svc.computeActivityScore(null, undefined), 0);
  });
});

/* ════════════════════════════════════════════════════════════
 * computeScoreGrade
 * ════════════════════════════════════════════════════════════ */
describe("computeScoreGrade", () => {
  it("PLATINUM at 90+", () => assert.equal(svc.computeScoreGrade(90), "PLATINUM"));
  it("GOLD at 80-89", () => assert.equal(svc.computeScoreGrade(85), "GOLD"));
  it("SILVER at 70-79", () => assert.equal(svc.computeScoreGrade(70), "SILVER"));
  it("BRONZE at 60-69", () => assert.equal(svc.computeScoreGrade(60), "BRONZE"));
  it("UNRATED below 60", () => assert.equal(svc.computeScoreGrade(59.9), "UNRATED"));
  it("null/non-numeric → UNRATED", () => assert.equal(svc.computeScoreGrade(null), "UNRATED"));
});

/* ════════════════════════════════════════════════════════════
 * computeRankingScore
 * ════════════════════════════════════════════════════════════ */
describe("computeRankingScore", () => {
  it("all zero factors → 0", () => {
    assert.equal(svc.computeRankingScore({}), 0);
  });
  it("max factors → 70 (static cap)", () => {
    // 100*.3 + 100*.15 + 100*.15 + 100*.10 = 30+15+15+10 = 70
    assert.equal(svc.computeRankingScore({
      reputationScore: 100, responseTimeScore: 100, dealSuccessRate: 100, activityScore: 100
    }), 70);
  });
  it("weighted composite", () => {
    // 50*.3 + 40*.15 + 60*.15 + 20*.10 = 15 + 6 + 9 + 2 = 32
    assert.equal(svc.computeRankingScore({
      reputationScore: 50, responseTimeScore: 40, dealSuccessRate: 60, activityScore: 20
    }), 32);
  });
  it("missing fields treated as 0", () => {
    // only reputation 80 → 24
    assert.equal(svc.computeRankingScore({ reputationScore: 80 }), 24);
  });
});

/* ════════════════════════════════════════════════════════════
 * computePremiumBoost
 * ════════════════════════════════════════════════════════════ */
describe("computePremiumBoost", () => {
  it("zero for unknown/free plan", () => {
    assert.equal(svc.computePremiumBoost("BASIS", 100), 0);
    assert.equal(svc.computePremiumBoost("FREE", 100), 0);
    assert.equal(svc.computePremiumBoost(null, 100), 0);
  });
  it("full boost for good reputation", () => {
    assert.equal(svc.computePremiumBoost("ENTERPRISE", 80), 20);
    assert.equal(svc.computePremiumBoost("PRO", 80), 10);
    assert.equal(svc.computePremiumBoost("PLUS", 80), 5);
  });
  it("case-insensitive plan name", () => {
    assert.equal(svc.computePremiumBoost("enterprise", 80), 20);
  });
  it("halved for reputation < 40", () => {
    assert.equal(svc.computePremiumBoost("ENTERPRISE", 30), 10);
    assert.equal(svc.computePremiumBoost("PRO", 30), 5);
  });
  it("quartered for reputation < 20", () => {
    assert.equal(svc.computePremiumBoost("ENTERPRISE", 10), 5);
    assert.equal(svc.computePremiumBoost("PRO", 10), 3); // round(10/4)=3
  });
  it("null reputation treated as 0 → quartered", () => {
    assert.equal(svc.computePremiumBoost("ENTERPRISE", null), 5);
  });
});

/* ════════════════════════════════════════════════════════════
 * computeEffectiveRankScore
 * ════════════════════════════════════════════════════════════ */
describe("computeEffectiveRankScore", () => {
  it("sums all components", () => {
    assert.equal(svc.computeEffectiveRankScore(50, 10, 15, 3), 78);
  });
  it("capped at 100", () => {
    assert.equal(svc.computeEffectiveRankScore(70, 15, 20, 5), 100);
  });
  it("non-numeric treated as 0", () => {
    assert.equal(svc.computeEffectiveRankScore(40, null, undefined, "x"), 40);
  });
  it("rounds to 2 decimals", () => {
    assert.equal(svc.computeEffectiveRankScore(10.111, 0, 0, 0), 10.11);
  });
});

/* ════════════════════════════════════════════════════════════
 * computeTimesheetReliabilityScore
 * ════════════════════════════════════════════════════════════ */
describe("computeTimesheetReliabilityScore", () => {
  it("null when total < 3", () => {
    assert.equal(svc.computeTimesheetReliabilityScore(1, 1), null);
  });
  it("computes percentage when enough", () => {
    assert.equal(svc.computeTimesheetReliabilityScore(3, 1), 75);
  });
  it("100% when none rejected", () => {
    assert.equal(svc.computeTimesheetReliabilityScore(5, 0), 100);
  });
  it("rounds to 2 decimals", () => {
    assert.equal(svc.computeTimesheetReliabilityScore(1, 2), 33.33);
  });
  it("non-numeric coerced to 0", () => {
    assert.equal(svc.computeTimesheetReliabilityScore(null, null), null);
  });
});

/* ════════════════════════════════════════════════════════════
 * getReputation
 * ════════════════════════════════════════════════════════════ */
describe("getReputation", () => {
  it("returns the joined row when found", async () => {
    const pool = trackingPool([
      ["FROM supplier_reputation sr", { rows: [{ supplier_id: "s1", grade: "GOLD", supplier_name: "Acme" }] }]
    ]);
    const res = await svc.getReputation(pool, "s1");
    assert.equal(res.supplier_id, "s1");
    assert.equal(res.supplier_name, "Acme");
    // verify param passed through
    assert.deepEqual(pool.calls[0].params, ["s1"]);
  });
  it("returns null when no row", async () => {
    const pool = trackingPool([["FROM supplier_reputation sr", { rows: [] }]]);
    const res = await svc.getReputation(pool, "missing");
    assert.equal(res, null);
  });
});

/* ════════════════════════════════════════════════════════════
 * getBadgesForSuppliers
 * ════════════════════════════════════════════════════════════ */
describe("getBadgesForSuppliers", () => {
  it("empty Map for empty/null input (no query)", async () => {
    const pool = trackingPool([]);
    const m1 = await svc.getBadgesForSuppliers(pool, []);
    const m2 = await svc.getBadgesForSuppliers(pool, null);
    assert.equal(m1.size, 0);
    assert.equal(m2.size, 0);
    assert.equal(pool.calls.length, 0);
  });
  it("maps rows with labels, colors and numeric coercion", async () => {
    const pool = trackingPool([
      ["FROM supplier_reputation", { rows: [
        { supplier_id: "s1", grade: "PLATINUM", reputation_score: "88.5", avg_stars: "4.7", total_ratings: 12 },
        { supplier_id: "s2", grade: null, reputation_score: null, avg_stars: null, total_ratings: null }
      ] }]
    ]);
    const m = await svc.getBadgesForSuppliers(pool, ["s1", "s2"]);
    assert.equal(m.size, 2);
    const a = m.get("s1");
    assert.equal(a.grade, "PLATINUM");
    assert.equal(a.grade_label, "Platin");
    assert.equal(a.badge_color, "#A78BFA");
    assert.equal(a.reputation_score, 88.5);
    assert.equal(a.avg_stars, 4.7);
    assert.equal(a.total_ratings, 12);
    const b = m.get("s2");
    assert.equal(b.grade, "UNRATED");
    assert.equal(b.grade_label, "Nicht bewertet");
    assert.equal(b.reputation_score, null);
    assert.equal(b.total_ratings, 0);
    // ANY($1) param is the id array
    assert.deepEqual(pool.calls[0].params, [["s1", "s2"]]);
  });
  it("returns empty Map on query error (soft-fail)", async () => {
    const pool = trackingPool([["FROM supplier_reputation", new Error("boom")]]);
    const m = await svc.getBadgesForSuppliers(pool, ["s1"]);
    assert.equal(m.size, 0);
  });
});

/* ════════════════════════════════════════════════════════════
 * getPublicReputationCard
 * ════════════════════════════════════════════════════════════ */
describe("getPublicReputationCard", () => {
  it("returns null when no reputation row", async () => {
    const pool = trackingPool([["FROM supplier_reputation sr", { rows: [] }]]);
    const res = await svc.getPublicReputationCard(pool, "s1");
    assert.equal(res, null);
  });

  it("builds a full card with signals, labels and member data", async () => {
    const rep = {
      supplier_id: "s1",
      supplier_name: "Acme GmbH",
      grade: "GOLD",
      avg_stars: "4.3",
      total_ratings: 9,
      deal_success_rate: "82",
      completed_deals: 8,
      total_deals: 10,
      response_time_score: "100",
      activity_score: "75",
      timesheet_reliability_score: "90",
      reputation_score: "81.2",
      ranking_score: "55.5",
      updated_at: "2026-06-01T00:00:00Z"
    };
    const pool = trackingPool([
      ["FROM supplier_reputation sr", { rows: [rep] }],
      ["FROM users WHERE id", { rows: [{ created_at: "2024-01-01T00:00:00Z", is_verified: true }] }]
    ]);
    const card = await svc.getPublicReputationCard(pool, "s1");
    assert.equal(card.supplier_id, "s1");
    assert.equal(card.supplier_name, "Acme GmbH");
    assert.equal(card.grade, "GOLD");
    assert.equal(card.grade_label, "Gold");
    assert.equal(card.badge_color, "#F59E0B");
    assert.equal(card.reputation_score, 81.2);
    assert.equal(card.ranking_score, 55.5);
    assert.equal(card.member_since, "2024-01-01T00:00:00Z");
    assert.equal(card.verified, true);
    assert.equal(card.updated_at, "2026-06-01T00:00:00Z");

    // signals: 5 in order
    assert.equal(card.signals.length, 5);
    const byKey = Object.fromEntries(card.signals.map(s => [s.key, s]));
    assert.equal(byKey.stars.value, 4.3);
    assert.equal(byKey.stars.display, "4.3 ★");
    assert.equal(byKey.stars.detail, "9 Bewertungen");
    assert.equal(byKey.deal_success.value, 82);
    assert.equal(byKey.deal_success.display, "82%");
    assert.equal(byKey.deal_success.detail, "8/10 Deals");
    assert.equal(byKey.response_time.value, 100);
    assert.equal(byKey.response_time.display, "Blitzschnell (< 1h)");
    assert.equal(byKey.activity.value, 75);
    assert.equal(byKey.activity.display, "Sehr aktiv");
    assert.equal(byKey.timesheet_reliability.value, 90);
    assert.equal(byKey.timesheet_reliability.display, "90%");
  });

  it("handles missing/zero signals with placeholder displays", async () => {
    const rep = {
      supplier_id: "s2",
      supplier_name: null,
      grade: "UNRATED",
      avg_stars: null,
      total_ratings: 0,
      deal_success_rate: null,
      completed_deals: 0,
      total_deals: 0,
      response_time_score: null,
      activity_score: null,
      timesheet_reliability_score: null,
      reputation_score: null,
      ranking_score: null,
      updated_at: "2026-06-01T00:00:00Z"
    };
    const pool = trackingPool([
      ["FROM supplier_reputation sr", { rows: [rep] }],
      ["FROM users WHERE id", { rows: [] }]
    ]);
    const card = await svc.getPublicReputationCard(pool, "s2");
    assert.equal(card.grade, "UNRATED");
    assert.equal(card.grade_label, "Nicht bewertet");
    assert.equal(card.badge_color, "#6B7280");
    assert.equal(card.reputation_score, null);
    assert.equal(card.member_since, null);
    assert.equal(card.verified, false);
    const byKey = Object.fromEntries(card.signals.map(s => [s.key, s]));
    assert.equal(byKey.stars.value, null);
    assert.equal(byKey.stars.display, "Noch keine");
    assert.equal(byKey.stars.detail, null);
    assert.equal(byKey.deal_success.display, "Zu wenig Daten");
    assert.equal(byKey.response_time.display, "Keine Daten");
    assert.equal(byKey.activity.display, "Keine Daten");
    assert.equal(byKey.timesheet_reliability.display, "Keine Daten");
  });

  it("activity tiers map to correct labels", async () => {
    async function cardWithActivity(act) {
      const rep = {
        supplier_id: "x", grade: "BRONZE", avg_stars: null, total_ratings: 0,
        deal_success_rate: null, completed_deals: 0, total_deals: 0,
        response_time_score: 30, activity_score: act, timesheet_reliability_score: null,
        reputation_score: 60, ranking_score: 10, updated_at: "t"
      };
      const pool = trackingPool([
        ["FROM supplier_reputation sr", { rows: [rep] }],
        ["FROM users WHERE id", { rows: [] }]
      ]);
      const card = await svc.getPublicReputationCard(pool, "x");
      return card.signals.find(s => s.key === "activity").display;
    }
    assert.equal(await cardWithActivity(80), "Sehr aktiv");
    assert.equal(await cardWithActivity(50), "Aktiv");
    assert.equal(await cardWithActivity(20), "Gelegentlich");
    assert.equal(await cardWithActivity(5), "Wenig aktiv");
    // response_time_score=30 → "Normal (< 24h)"
    const rep = {
      supplier_id: "y", grade: "BRONZE", avg_stars: null, total_ratings: 0,
      deal_success_rate: null, completed_deals: 0, total_deals: 0,
      response_time_score: 30, activity_score: 50, timesheet_reliability_score: null,
      reputation_score: 60, ranking_score: 10, updated_at: "t"
    };
    const pool = trackingPool([
      ["FROM supplier_reputation sr", { rows: [rep] }],
      ["FROM users WHERE id", { rows: [] }]
    ]);
    const card = await svc.getPublicReputationCard(pool, "y");
    assert.equal(card.signals.find(s => s.key === "response_time").display, "Normal (< 24h)");
  });

  it("survives users-table query error (member data stays null)", async () => {
    const rep = {
      supplier_id: "s3", grade: "SILVER", avg_stars: 4, total_ratings: 3,
      deal_success_rate: 70, completed_deals: 3, total_deals: 4,
      response_time_score: 50, activity_score: 40, timesheet_reliability_score: 80,
      reputation_score: 72, ranking_score: 30, updated_at: "t"
    };
    const pool = trackingPool([
      ["FROM supplier_reputation sr", { rows: [rep] }],
      ["FROM users WHERE id", new Error("users shape differs")]
    ]);
    const card = await svc.getPublicReputationCard(pool, "s3");
    assert.equal(card.grade, "SILVER");
    assert.equal(card.member_since, null);
    assert.equal(card.verified, false);
  });
});

/* ════════════════════════════════════════════════════════════
 * recomputeReputation
 * ════════════════════════════════════════════════════════════ */
describe("recomputeReputation", () => {
  function recomputeRoutes(overrides = {}) {
    const {
      ratings = { rows: [{ total_ratings: 12, avg_stars: "4.6", avg_reliability: "4.5", avg_communication: "4.4", avg_quality: "4.7" }] },
      deals = { rows: [{ completed_deals: 16, total_deals: 18 }] },
      speed = { rows: [{ avg_response_hours: "0.5" }] },
      capacity = { rows: [{ active_listings: 3 }] },
      response = { rows: [{ total_received: 10, responded: 9 }] },
      timesheets = { rows: [{ approved: 8, rejected: 1 }] },
      upsert
    } = overrides;
    return [
      ["FROM ratings\n", ratings],
      ["FROM requests\n     WHERE receiver_id", deals],
      ["avg_response_hours", speed],
      ["FROM capacity_posts", capacity],
      ["total_received", response],
      ["FROM timesheets", timesheets],
      ["INSERT INTO supplier_reputation", upsert || ((sql, params) => ({ rows: [{ supplier_id: params[0], grade: params[7] }] }))]
    ];
  }

  it("aggregates, computes derived scores and upserts (happy path)", async () => {
    const pool = trackingPool(recomputeRoutes());
    const res = await svc.recomputeReputation(pool, "sup1");

    const upsertCall = pool.calls.find(c => c.sql.includes("INSERT INTO supplier_reputation"));
    assert.ok(upsertCall, "upsert query ran");
    const p = upsertCall.params;
    // [supplierId, totalRatings, avgStars, avg_rel, avg_comm, avg_qual,
    //  completedDeals, grade, responseTimeScore, reputationScore,
    //  dealSuccessRate, totalDeals, activityScore, rankingScore, tsReliabilityScore]
    assert.equal(p[0], "sup1");
    assert.equal(p[1], 12);                 // total_ratings
    assert.equal(p[2], 4.6);                // avg_stars (number)
    assert.equal(p[6], 16);                 // completed_deals
    // dealSuccessRate = 16/18 → 88.89
    assert.equal(p[10], 88.89);
    assert.equal(p[11], 18);                // total_deals
    // responseTimeScore: 0.5h → 100
    assert.equal(p[8], 100);
    // activityScore: 3 listings → 30 ; rate 9/10=90 → 45 → 75
    assert.equal(p[12], 75);
    // tsReliability: 8/9 → 88.89
    assert.equal(p[14], 88.89);
    // grade derived from score → score-based since ratings>0
    // reputationScore = stars 4.6 →90; dsr 88.89; rts 100 → 90*.5+88.89*.3+100*.2 = 45+26.667+20 = 91.667 → PLATINUM
    assert.equal(p[7], "PLATINUM");
    assert.equal(p[9], 91.67);              // reputationScore rounded
    assert.equal(res.supplier_id, "sup1");
  });

  it("uses legacy grade when no ratings and few deals", async () => {
    const pool = trackingPool(recomputeRoutes({
      ratings: { rows: [{ total_ratings: 0, avg_stars: null, avg_reliability: null, avg_communication: null, avg_quality: null }] },
      deals: { rows: [{ completed_deals: 0, total_deals: 0 }] },
      speed: { rows: [{ avg_response_hours: null }] },
      capacity: { rows: [{ active_listings: 0 }] },
      response: { rows: [{ total_received: 0, responded: 0 }] },
      timesheets: { rows: [{ approved: 0, rejected: 0 }] }
    }));
    await svc.recomputeReputation(pool, "sup2");
    const p = pool.calls.find(c => c.sql.includes("INSERT INTO supplier_reputation")).params;
    // totalRatings 0 & totalDeals 0 → legacy grade computeGrade(0,...) = UNRATED
    assert.equal(p[7], "UNRATED");
    assert.equal(p[1], 0);
    // dealSuccessRate null (total<3)
    assert.equal(p[10], null);
    // responseTimeScore null
    assert.equal(p[8], null);
    // tsReliability null (total<3)
    assert.equal(p[14], null);
  });

  it("survives missing capacity_posts/timesheets tables (soft-fail) and still upserts", async () => {
    const pool = trackingPool(recomputeRoutes({
      ratings: { rows: [{ total_ratings: 5, avg_stars: "4.0", avg_reliability: null, avg_communication: null, avg_quality: null }] },
      deals: { rows: [{ completed_deals: 4, total_deals: 5 }] },
      speed: { rows: [{ avg_response_hours: "3" }] },
      capacity: new Error("relation capacity_posts does not exist"),
      timesheets: new Error("relation timesheets does not exist")
    }));
    await svc.recomputeReputation(pool, "sup3");
    const p = pool.calls.find(c => c.sql.includes("INSERT INTO supplier_reputation")).params;
    // activityScore falls back to listings=0, rate=0 → 0
    assert.equal(p[12], 0);
    // tsReliability null because timesheet query threw
    assert.equal(p[14], null);
    // grade score-based (ratings>0)
    assert.equal(p[1], 5);
    // avg_reliability defaulted to 0 when null
    assert.equal(p[3], 0);
  });

  it("uses score-grade path when totalDeals>=3 even with no ratings", async () => {
    const pool = trackingPool(recomputeRoutes({
      ratings: { rows: [{ total_ratings: 0, avg_stars: null, avg_reliability: null, avg_communication: null, avg_quality: null }] },
      deals: { rows: [{ completed_deals: 3, total_deals: 3 }] },
      speed: { rows: [{ avg_response_hours: "0.5" }] },
      capacity: { rows: [{ active_listings: 0 }] },
      response: { rows: [{ total_received: 0, responded: 0 }] },
      timesheets: { rows: [{ approved: 0, rejected: 0 }] }
    }));
    await svc.recomputeReputation(pool, "sup4");
    const p = pool.calls.find(c => c.sql.includes("INSERT INTO supplier_reputation")).params;
    // reputationScore: stars 0 → 0; dsr 100 → 30; rts 100 → 20 → 50 → score grade UNRATED
    // but grade path is score-based since totalDeals>=3
    assert.equal(p[10], 100);   // dealSuccessRate 3/3
    assert.equal(p[9], 50);     // reputationScore
    assert.equal(p[7], "UNRATED"); // score < 60
  });
});

/* ════════════════════════════════════════════════════════════
 * batchRecompute
 * ════════════════════════════════════════════════════════════ */
describe("batchRecompute", () => {
  it("returns {updated:0} when no suppliers found", async () => {
    const pool = trackingPool([["SELECT DISTINCT rated_id", { rows: [] }]]);
    const res = await svc.batchRecompute(pool, 50);
    assert.deepEqual(res, { updated: 0 });
    // limit param passed
    const finder = pool.calls.find(c => c.sql.includes("SELECT DISTINCT rated_id"));
    assert.deepEqual(finder.params, [50]);
  });

  it("recomputes each found supplier and counts updates", async () => {
    // first call: supplier finder; subsequent calls: per-supplier recompute queries.
    // Route finder by its unique substring; everything else falls into recompute routes.
    const pool = trackingPool([
      ["SELECT DISTINCT rated_id", { rows: [{ supplier_id: "a" }, { supplier_id: "b" }] }],
      ["FROM ratings\n", { rows: [{ total_ratings: 0, avg_stars: null }] }],
      ["FROM requests\n     WHERE receiver_id", { rows: [{ completed_deals: 0, total_deals: 0 }] }],
      ["avg_response_hours", { rows: [{ avg_response_hours: null }] }],
      ["FROM capacity_posts", { rows: [{ active_listings: 0 }] }],
      ["total_received", { rows: [{ total_received: 0, responded: 0 }] }],
      ["FROM timesheets", { rows: [{ approved: 0, rejected: 0 }] }],
      ["INSERT INTO supplier_reputation", (sql, params) => ({ rows: [{ supplier_id: params[0] }] })]
    ]);
    const res = await svc.batchRecompute(pool);
    assert.equal(res.updated, 2);
    // default limit 100
    const finder = pool.calls.find(c => c.sql.includes("SELECT DISTINCT rated_id"));
    assert.deepEqual(finder.params, [100]);
    // two upserts ran (one per supplier)
    const upserts = pool.calls.filter(c => c.sql.includes("INSERT INTO supplier_reputation"));
    assert.equal(upserts.length, 2);
    assert.deepEqual(upserts.map(u => u.params[0]).sort(), ["a", "b"]);
  });
});

/* ════════════════════════════════════════════════════════════
 * topSuppliers
 * ════════════════════════════════════════════════════════════ */
describe("topSuppliers", () => {
  it("returns ordered rows and passes limit", async () => {
    const pool = trackingPool([
      ["WHERE sr.grade != 'UNRATED'", { rows: [{ supplier_id: "a", grade: "PLATINUM" }, { supplier_id: "b", grade: "GOLD" }] }]
    ]);
    const rows = await svc.topSuppliers(pool, 5);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].grade, "PLATINUM");
    assert.deepEqual(pool.calls[0].params, [5]);
  });
  it("defaults limit to 20 and returns empty list", async () => {
    const pool = trackingPool([["WHERE sr.grade != 'UNRATED'", { rows: [] }]]);
    const rows = await svc.topSuppliers(pool);
    assert.deepEqual(rows, []);
    assert.deepEqual(pool.calls[0].params, [20]);
  });
});
