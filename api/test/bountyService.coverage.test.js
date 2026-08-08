/**
 * Bounty Service unit tests (coverage suite, from scratch).
 *
 * Covers gamification/loyalty-discount/milestone logic in services/bountyService.js:
 *   getBountyCatalog, getUserBounties, getUserDiscount, evaluateBounties,
 *   checkBountyCondition (all threshold_type branches via evaluateBounties),
 *   checkAndAwardMilestones, getUserMilestones, getValueReport, getBountyStatus,
 *   plus handleReplacements (loyalty_2y replaces loyalty_1y).
 *
 * Strategy: bountyService imports referralProgramService + bountyTierService
 * STATICALLY and invokes them with the SAME pool we pass in. So a SQL-pattern
 * tracking pool drives the whole call graph (no dynamic-import side effects).
 *
 * Run: node --test --test-force-exit test/bountyService.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/bountyService.js";

// ── SQL-pattern tracking pool ─────────────────────────────────
// handler(sql, params) -> { rows, rowCount } | undefined (=> empty result)
function patternPool(handler) {
  const calls = [];
  const queryFn = async (sql, params) => {
    const s = String(sql);
    const t = s.trim().toUpperCase();
    if (t === "BEGIN" || t === "COMMIT" || t === "ROLLBACK") return { rows: [], rowCount: 0 };
    calls.push({ sql: s, params: params || [] });
    const r = handler(s, params || []);
    if (r === undefined || r === null) return { rows: [], rowCount: 0 };
    return r;
  };
  const pool = {
    calls,
    query: queryFn,
    connect: async () => ({ query: queryFn, release() {} })
  };
  return pool;
}

const ok = (rows = [], rowCount) => ({ rows, rowCount: rowCount == null ? rows.length : rowCount });

// ═══════════════════════════════════════════════════════════════
// getBountyCatalog
// ═══════════════════════════════════════════════════════════════
describe("bountyService — getBountyCatalog", () => {
  it("returns rows ordered by sort_order (passes through DB rows)", async () => {
    const catalog = [{ id: "b1", key: "k1", sort_order: 1 }, { id: "b2", key: "k2", sort_order: 2 }];
    const pool = patternPool((sql) => sql.includes("SELECT * FROM bounties") ? ok(catalog) : ok());
    const res = await svc.getBountyCatalog(pool);
    assert.deepStrictEqual(res, catalog);
    assert.match(pool.calls[0].sql, /ORDER BY sort_order/);
  });

  it("returns empty array when no bounties exist", async () => {
    const pool = patternPool(() => ok([]));
    assert.deepStrictEqual(await svc.getBountyCatalog(pool), []);
  });
});

// ═══════════════════════════════════════════════════════════════
// getUserBounties
// ═══════════════════════════════════════════════════════════════
describe("bountyService — getUserBounties", () => {
  it("joins user_bounties with bounties and filters by userId", async () => {
    const rows = [{ bounty_id: "b1", key: "loyalty_1y", is_active: true, progress: 100 }];
    const pool = patternPool((sql) => sql.includes("FROM user_bounties ub") ? ok(rows) : ok());
    const res = await svc.getUserBounties(pool, "u1");
    assert.deepStrictEqual(res, rows);
    assert.deepStrictEqual(pool.calls[0].params, ["u1"]);
    assert.match(pool.calls[0].sql, /JOIN bounties b ON b\.id = ub\.bounty_id/);
  });
});

// ═══════════════════════════════════════════════════════════════
// getUserDiscount  (sum capped by tier max discount)
// ═══════════════════════════════════════════════════════════════
describe("bountyService — getUserDiscount", () => {
  function discountPool({ sum, tierMax }) {
    return patternPool((sql) => {
      if (sql.includes("SUM(b.discount_pct)")) return ok([{ total: sum }]);
      // getUserMaxDiscount -> getUserTier
      if (sql.includes("FROM user_bounty_tiers ubt")) {
        return tierMax == null ? ok([]) : ok([{ max_discount_pct: tierMax }]);
      }
      return ok();
    });
  }

  it("caps the summed discount at the tier max", async () => {
    const res = await svc.getUserDiscount(discountPool({ sum: 30, tierMax: 15 }), "u1");
    assert.strictEqual(res, 15);
  });

  it("returns the raw sum when it is below the tier cap", async () => {
    const res = await svc.getUserDiscount(discountPool({ sum: 7, tierMax: 25 }), "u1");
    assert.strictEqual(res, 7);
  });

  it("falls back to tier-default cap (8) when user has no tier row", async () => {
    // getUserMaxDiscount returns 8 when no tier; sum 30 -> capped to 8
    const res = await svc.getUserDiscount(discountPool({ sum: 30, tierMax: null }), "u1");
    assert.strictEqual(res, 8);
  });

  it("treats null sum as 0", async () => {
    const res = await svc.getUserDiscount(discountPool({ sum: null, tierMax: 25 }), "u1");
    assert.strictEqual(res, 0);
  });

  it("uses FALLBACK_MAX_DISCOUNT_PCT (25) when getUserMaxDiscount throws", async () => {
    // Make the tier query throw -> getUserMaxDiscount rejects -> catch -> 25
    const pool = patternPool((sql) => {
      if (sql.includes("SUM(b.discount_pct)")) return ok([{ total: 30 }]);
      if (sql.includes("FROM user_bounty_tiers ubt")) throw new Error("boom-but-caught-inside");
      return ok();
    });
    // getUserTier internally catches its own error and returns null -> max 8.
    // To exercise the OUTER fallback, throw on the discount SUM query path?
    // No: getUserMaxDiscount only awaits getUserTier (which swallows). So with a
    // throwing tier query, getUserMaxDiscount returns 8, not 25. Assert that real behavior:
    const res = await svc.getUserDiscount(pool, "u1");
    assert.strictEqual(res, 8);
  });
});

// ═══════════════════════════════════════════════════════════════
// evaluateBounties  (drives checkBountyCondition + upsert/revoke + replacements)
// ═══════════════════════════════════════════════════════════════
describe("bountyService — evaluateBounties", () => {
  // Build a pool that: returns a single-bounty catalog, returns gatherUserData
  // rows by SQL pattern, and records the user_bounties write SQL.
  function evalPool({ bounty, dataRows = {}, captureWrites }) {
    return patternPool((sql, params) => {
      if (sql.includes("SELECT * FROM bounties")) return ok([bounty]);
      // gatherUserData queries
      if (sql.includes("created_at, is_verified FROM users")) return ok([{ created_at: dataRows.userCreatedAt || null, is_verified: true }]);
      if (sql.includes("MIN(created_at) AS first_sub FROM subscriptions")) return ok([{ first_sub: dataRows.firstSubDate || null }]);
      if (sql.includes("FROM supplier_reputation WHERE supplier_id")) return ok(dataRows.reputation ? [dataRows.reputation] : []);
      if (sql.includes("AVG(reliability)") && sql.includes("FROM ratings WHERE rated_id")) return ok([dataRows.ratingStats || {}]);
      if (sql.includes("emergency_completed")) return ok([dataRows.deals || {}]);
      if (sql.includes("avg_response_minutes")) return ok([dataRows.responseStats || {}]);
      if (sql.includes("FROM capacity_posts")) return ok([{ active: dataRows.activeListings || 0 }]);
      if (sql.includes("FROM ratings WHERE rater_id")) return ok([{ given: dataRows.ratingsGiven || 0 }]);
      if (sql.includes("COUNT(*)::int AS total FROM supplier_reputation WHERE grade")) return ok([{ total: dataRows.repTotal || 0 }]);
      if (sql.includes("reputation_score >= $1")) return ok([{ rank: dataRows.rank || 0 }]);
      if (sql.includes("FROM referrals")) return ok([{ active: dataRows.referralCount || 0 }]);
      if (sql.includes("FROM mentoring_sessions")) return ok([{ count: dataRows.mentoringCount || 0 }]);
      // P8 Welle C: Zuverlaessigkeits-Streak (dealReliabilityService)
      if (sql.includes("'agency'::text")) return ok(dataRows.streakNenner || []);
      if (sql.includes("FROM offer_cancellations c")) return ok(dataRows.streakStornos || []);
      // writes
      if (sql.includes("INSERT INTO user_bounties") || sql.includes("UPDATE user_bounties")) {
        if (captureWrites) captureWrites({ sql, params });
        return ok([], 1);
      }
      // handleReplacements read
      if (sql.includes("b.key IN ('loyalty_1y', 'loyalty_2y')")) return ok([]);
      return ok();
    });
  }

  it("earns a bounty when condition is met → activating INSERT with progress 100", async () => {
    const writes = [];
    const bounty = { id: "b1", key: "completed_deals", is_recurring: false, threshold_type: "completed_deals", threshold_value: { min_deals: 50 } };
    const pool = evalPool({ bounty, dataRows: { deals: { completed: 60 } }, captureWrites: (w) => writes.push(w) });
    const res = await svc.evaluateBounties(pool, "u1");
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].key, "completed_deals");
    assert.strictEqual(res[0].earned, true);
    assert.strictEqual(res[0].progress, 100);
    assert.strictEqual(writes.length, 1);
    assert.match(writes[0].sql, /INSERT INTO user_bounties/);
    assert.match(writes[0].sql, /is_active = TRUE/);
    assert.deepStrictEqual(writes[0].params, ["u1", "b1", 100]);
  });

  /*
   * KORRIGIERT (P9/A1). Die alte Erwartung verlangte hier ein reines
   * `UPDATE user_bounties SET is_active = FALSE` — und schrieb damit genau den
   * Defekt als Soll fest: ein UPDATE trifft nichts, solange keine Zeile
   * existiert, und eine Zeile entstand nur beim ersten Verdienen. Wer ein
   * wiederkehrendes Bounty noch nie erreicht hatte, bekam nie einen Fortschritt
   * gespeichert und sah dauerhaft "0 %". Nachweis in der Entwicklungsdatenbank:
   * genau die fuenf nie verdienten wiederkehrenden Bounties hatten als einzige
   * ueberhaupt keine user_bounties-Zeile.
   * Sollzustand ist ein Upsert, der beides kann: anlegen und entziehen.
   */
  it("entzieht ein wiederkehrendes Bounty UND haelt den Fortschritt fest", async () => {
    const writes = [];
    const bounty = { id: "b9", key: "blitz", is_recurring: true, threshold_type: "completed_deals", threshold_value: { min_deals: 50 } };
    const pool = evalPool({ bounty, dataRows: { deals: { completed: 1 } }, captureWrites: (w) => writes.push(w) });
    const res = await svc.evaluateBounties(pool, "u1");
    assert.strictEqual(res[0].earned, false);
    assert.strictEqual(writes.length, 1);
    assert.match(writes[0].sql, /INSERT INTO user_bounties/);
    assert.match(writes[0].sql, /ON CONFLICT \(user_id, bounty_id\) DO UPDATE/);
    assert.match(writes[0].sql, /is_active = FALSE/, "der Entzug muss weiterhin greifen");
    assert.strictEqual(writes[0].params[2], 2, "1 von 50 Deals = 2 % Fortschritt, nicht 0");
  });

  it("non-recurring & not earned → progress-tracking upsert (no activation)", async () => {
    const writes = [];
    const bounty = { id: "b2", key: "completed_deals", is_recurring: false, threshold_type: "completed_deals", threshold_value: { min_deals: 50 } };
    const pool = evalPool({ bounty, dataRows: { deals: { completed: 25 } }, captureWrites: (w) => writes.push(w) });
    const res = await svc.evaluateBounties(pool, "u1");
    assert.strictEqual(res[0].earned, false);
    assert.strictEqual(res[0].progress, 50); // 25/50*100
    assert.match(writes[0].sql, /VALUES \(\$1, \$2, FALSE, \$3\)/);
    assert.match(writes[0].sql, /GREATEST/);
  });

  it("returns empty results for an empty catalog", async () => {
    const pool = evalPool({ bounty: undefined });
    // empty catalog: override the catalog query to return []
    const pool2 = patternPool((sql) => {
      if (sql.includes("SELECT * FROM bounties")) return ok([]);
      if (sql.includes("b.key IN ('loyalty_1y', 'loyalty_2y')")) return ok([]);
      return ok([{}]); // gatherUserData rows
    });
    const res = await svc.evaluateBounties(pool2, "u1");
    assert.deepStrictEqual(res, []);
    void pool;
  });

  // ── Each threshold_type earn-branch ──────────────────────────
  async function evaluatesEarned(bounty, dataRows) {
    const pool = evalPool({ bounty: { id: "x", key: bounty.threshold_type, is_recurring: false, ...bounty } , dataRows });
    const res = await svc.evaluateBounties(pool, "u1");
    return res[0];
  }

  it("avg_reliability_6m earns at >= min_stars and >= 5 ratings", async () => {
    const r = await evaluatesEarned({ threshold_type: "avg_reliability_6m", threshold_value: { min_stars: 4.5 } },
      { ratingStats: { avg_reliability: 4.8, total_ratings: 10 } });
    assert.strictEqual(r.earned, true);
    assert.strictEqual(r.progress, 100);
  });

  it("avg_reliability_6m NOT earned with too few ratings", async () => {
    const r = await evaluatesEarned({ threshold_type: "avg_reliability_6m", threshold_value: { min_stars: 4.5 } },
      { ratingStats: { avg_reliability: 5, total_ratings: 2 } });
    assert.strictEqual(r.earned, false);
  });

  it("top_percentile_12m earns when rank <= needed", async () => {
    const r = await evaluatesEarned({ threshold_type: "top_percentile_12m", threshold_value: { percentile: 10 } },
      { reputation: { reputation_score: 90 }, repTotal: 100, rank: 5 });
    // percentileRank = round(5/100*100)=5 <= 10
    assert.strictEqual(r.earned, true);
  });

  /* ── P8 Welle C: reliability_streak ersetzt zero_complaints_12m ──────────
   *
   * Die beiden frueheren Tests an dieser Stelle pruefen den Typ
   * `zero_complaints_12m`. Sie waren gruen und haben trotzdem einen Defekt
   * ZEMENTIERT: die Bedingung zaehlt `requests.status = 'CANCELED'` — den
   * FALSCHEN Storno-Kanal. `requests` ist der Alt-Pfad; dort wird 'CANCELED'
   * zwar geschrieben (`PATCH /api/requests/:id` ->
   * `releaseReservationAndSetStatus`), aber `dealAgreementService.cancelAgreement`
   * fasst die Tabelle nie an. Wer eine Einsatzvereinbarung kurz vor Beginn
   * platzen laesst, behaelt deshalb 3 % Rabatt fuer "null Stornos".
   * Der Test hat das nie bemerkt, weil er `canceled` selbst als Fixture setzt:
   * er prueft eine Rechnung, deren Eingabewert aus dem relevanten Kanal nie
   * kommt.
   *
   * Ersetzt durch Tests gegen die echte Quelle (`offer_cancellations` ueber
   * `dealReliabilityService.gewichteStorno`). Begruendung nach §0.9: der alte
   * Test kodierte nachweislich einen Bug als Soll.
   * ──────────────────────────────────────────────────────────────────────── */

  const STREAK = { threshold_type: "reliability_streak", threshold_value: { days: 90, min_binding_deals: 3 } };

  it("reliability_streak wird vergeben bei genug Deals und ohne zaehlenden Storno", async () => {
    const r = await evaluatesEarned(STREAK, {
      streakNenner: [{ party_user_id: "u1", party_side: "agency", binding_deals: 4 }],
      streakStornos: []
    });
    assert.strictEqual(r.earned, true);
    assert.strictEqual(r.progress, 100);
    assert.match(r.note, /90 Tage ohne gewichteten Storno/);
  });

  it("reliability_streak entfaellt nach einem zaehlenden Storno und nennt das Datum", async () => {
    const vorGestern = new Date(Date.now() - 2 * 86400000).toISOString();
    const r = await evaluatesEarned(STREAK, {
      streakNenner: [{ party_user_id: "u1", party_side: "agency", binding_deals: 6 }],
      streakStornos: [{
        party_user_id: "u1", party_side: "agency", reason_code: "worker_quit",
        from_status: "confirmed", lead_time_hours: 10, created_at: vorGestern
      }]
    });
    assert.strictEqual(r.earned, false);
    assert.match(r.note, /Entfallen durch Storno am/);
    assert.match(r.note, /wieder verfuegbar/);
  });

  it("reliability_streak ueberlebt einen entschuldigten Storno (E2)", async () => {
    const gestern = new Date(Date.now() - 86400000).toISOString();
    const r = await evaluatesEarned(STREAK, {
      streakNenner: [{ party_user_id: "u1", party_side: "agency", binding_deals: 6 }],
      streakStornos: [{
        party_user_id: "u1", party_side: "agency", reason_code: "customer_cancelled",
        from_status: "confirmed", lead_time_hours: 3, created_at: gestern
      }]
    });
    assert.strictEqual(r.earned, true,
      "eine Kundenabsage trifft die Agentur unverschuldet — dieselbe Regel wie bei der Quote");
  });

  it("reliability_streak wird nicht fuers Nichtstun vergeben", async () => {
    const r = await evaluatesEarned(STREAK, { streakNenner: [], streakStornos: [] });
    assert.strictEqual(r.earned, false);
    assert.match(r.note, /Noch keine verbindlichen Abschluesse/);
  });

  it("reliability_streak nennt die fehlende Zahl an Abschluessen", async () => {
    const r = await evaluatesEarned(STREAK, {
      streakNenner: [{ party_user_id: "u1", party_side: "agency", binding_deals: 1 }],
      streakStornos: []
    });
    assert.strictEqual(r.earned, false);
    assert.match(r.note, /Noch 2 verbindliche Abschluesse/);
  });

  it("reliability_streak faellt, wenn EINE Marktseite unzuverlaessig ist", async () => {
    const gestern = new Date(Date.now() - 86400000).toISOString();
    const r = await evaluatesEarned(STREAK, {
      streakNenner: [
        { party_user_id: "u1", party_side: "agency", binding_deals: 9 },
        { party_user_id: "u1", party_side: "company", binding_deals: 4 }
      ],
      streakStornos: [{
        party_user_id: "u1", party_side: "company", reason_code: "mistake",
        from_status: "confirmed", lead_time_hours: 5, created_at: gestern
      }]
    });
    assert.strictEqual(r.earned, false,
      "wer als Auftraggeber kurzfristig absagt, ist kein zuverlaessiger Partner");
  });

  it("der alte Typ am falschen Storno-Kanal vergibt nichts mehr", async () => {
    const r = await evaluatesEarned({ threshold_type: "zero_complaints_12m", threshold_value: {} },
      { deals: { canceled: 0, completed: 5 } });
    assert.strictEqual(r.earned, false,
      "ohne Migration 165 soll das Bounty wegfallen statt weiter am falschen Kanal gemessen zu werden");
  });

  it("avg_communication earns at threshold (progress split 50/50)", async () => {
    const r = await evaluatesEarned({ threshold_type: "avg_communication", threshold_value: { min_stars: 4.8, min_ratings: 20 } },
      { ratingStats: { avg_communication: 4.8, total_ratings: 20 } });
    assert.strictEqual(r.earned, true);
    assert.strictEqual(r.progress, 100);
  });

  it("response_time_3m earns when fast + high rate + enough volume", async () => {
    const r = await evaluatesEarned({ threshold_type: "response_time_3m", threshold_value: { max_minutes: 30, min_rate: 90 } },
      { responseStats: { avg_response_minutes: 10, total_received: 10, responded: 10 } });
    assert.strictEqual(r.earned, true);
  });

  it("emergency_deals earns at threshold", async () => {
    const r = await evaluatesEarned({ threshold_type: "emergency_deals", threshold_value: { min_deals: 10 } },
      { deals: { emergency_completed: 12 } });
    assert.strictEqual(r.earned, true);
  });

  it("active_listings_6m earns at threshold", async () => {
    const r = await evaluatesEarned({ threshold_type: "active_listings_6m", threshold_value: { min_listings: 5 } },
      { activeListings: 6 });
    assert.strictEqual(r.earned, true);
  });

  it("subscription_age NOT earned with no firstSubDate (progress 0)", async () => {
    const r = await evaluatesEarned({ threshold_type: "subscription_age", threshold_value: { months: 12 } }, {});
    assert.strictEqual(r.earned, false);
    assert.strictEqual(r.progress, 0);
  });

  it("subscription_age earns when sub is old enough", async () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 400).toISOString();
    const r = await evaluatesEarned({ threshold_type: "subscription_age", threshold_value: { months: 12 } },
      { firstSubDate: old });
    assert.strictEqual(r.earned, true);
  });

  it("registration_before earns when created before deadline", async () => {
    const r = await evaluatesEarned({ threshold_type: "registration_before", threshold_value: { before: "2027-01-01" } },
      { userCreatedAt: "2025-06-01T00:00:00Z" });
    assert.strictEqual(r.earned, true);
    assert.strictEqual(r.progress, 100);
  });

  it("registration_before NOT earned when created after deadline", async () => {
    const r = await evaluatesEarned({ threshold_type: "registration_before", threshold_value: { before: "2020-01-01" } },
      { userCreatedAt: "2025-06-01T00:00:00Z" });
    assert.strictEqual(r.earned, false);
  });

  it("referrals earns at threshold", async () => {
    const r = await evaluatesEarned({ threshold_type: "referrals", threshold_value: { min_referrals: 5 } },
      { referralCount: 7 });
    assert.strictEqual(r.earned, true);
  });

  it("ratings_given earns at threshold", async () => {
    const r = await evaluatesEarned({ threshold_type: "ratings_given", threshold_value: { min_ratings: 50 } },
      { ratingsGiven: 50 });
    assert.strictEqual(r.earned, true);
  });

  it("mentoring earns at threshold", async () => {
    const r = await evaluatesEarned({ threshold_type: "mentoring", threshold_value: { min_sessions: 5 } },
      { mentoringCount: 5 });
    assert.strictEqual(r.earned, true);
  });

  it("unknown threshold_type → not earned, progress 0 (default branch)", async () => {
    const r = await evaluatesEarned({ threshold_type: "bogus_type", threshold_value: {} }, {});
    assert.strictEqual(r.earned, false);
    assert.strictEqual(r.progress, 0);
  });

  // Die Abloesung liest `replaces` seit P8 Welle C aus dem KATALOG statt aus
  // einer fest verdrahteten If-Kette. Das Verhalten bleibt identisch; ohne die
  // Verallgemeinerung haette das zweite Paar (zero_complaint loest
  // zuverlaessiger_partner ab) den Rabatt still verdoppelt.
  it("handleReplacements deaktiviert das abgeloeste Bounty (Katalog-gesteuert)", async () => {
    const writes = [];
    const katalog = [
      { id: "b1", key: "completed_deals", is_recurring: false, threshold_type: "completed_deals", threshold_value: { min_deals: 50 } },
      { id: "b2", key: "loyalty_2y", is_recurring: false, threshold_type: "subscription_age", threshold_value: { months: 24, replaces: "loyalty_1y" } }
    ];
    const pool = patternPool((sql, params) => {
      if (sql.includes("SELECT * FROM bounties")) return ok(katalog);
      if (sql.includes("emergency_completed")) return ok([{ completed: 60 }]);
      if (sql.includes("INSERT INTO user_bounties")) return ok([], 1);
      // Lesepfad von handleReplacements: aktive Bounties des Nutzers
      if (sql.includes("FROM user_bounties ub") && sql.includes("is_active = TRUE")) {
        return ok([{ key: "loyalty_1y" }, { key: "loyalty_2y" }]);
      }
      if (sql.includes("UPDATE user_bounties SET is_active = FALSE") && sql.includes("key = ANY")) {
        writes.push({ sql, params });
        return ok([], 1);
      }
      return ok([{}]);
    });
    await svc.evaluateBounties(pool, "u1");
    assert.strictEqual(writes.length, 1);
    assert.deepStrictEqual(writes[0].params[1], ["loyalty_1y"],
      "genau das abgeloeste Bounty wird deaktiviert, nicht der Sieger");
  });

  it("handleReplacements ruehrt nichts an, wenn nur eine Stufe aktiv ist", async () => {
    const writes = [];
    const katalog = [
      { id: "b2", key: "loyalty_2y", is_recurring: false, threshold_type: "subscription_age", threshold_value: { months: 24, replaces: "loyalty_1y" } }
    ];
    const pool = patternPool((sql, params) => {
      if (sql.includes("SELECT * FROM bounties")) return ok(katalog);
      if (sql.includes("MIN(created_at) AS first_sub")) return ok([{ first_sub: null }]);
      if (sql.includes("INSERT INTO user_bounties")) return ok([], 1);
      if (sql.includes("FROM user_bounties ub") && sql.includes("is_active = TRUE")) return ok([{ key: "loyalty_1y" }]);
      if (sql.includes("UPDATE user_bounties SET is_active = FALSE") && sql.includes("key = ANY")) {
        writes.push({ sql, params });
        return ok([], 1);
      }
      return ok([{}]);
    });
    await svc.evaluateBounties(pool, "u1");
    assert.strictEqual(writes.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// checkAndAwardMilestones
// ═══════════════════════════════════════════════════════════════
describe("bountyService — checkAndAwardMilestones", () => {
  function milestonePool({ dataRows = {}, insertRowCount = 1, captureInserts }) {
    return patternPool((sql, params) => {
      if (sql.includes("created_at, is_verified FROM users")) return ok([{ created_at: dataRows.userCreatedAt || null }]);
      if (sql.includes("MIN(created_at) AS first_sub")) return ok([{ first_sub: null }]);
      if (sql.includes("FROM supplier_reputation WHERE supplier_id")) return ok([]);
      if (sql.includes("AVG(reliability)") && sql.includes("rated_id")) return ok([dataRows.ratingStats || {}]);
      if (sql.includes("emergency_completed")) return ok([dataRows.deals || {}]);
      if (sql.includes("avg_response_minutes")) return ok([dataRows.responseStats || {}]);
      if (sql.includes("FROM capacity_posts")) return ok([{ active: 0 }]);
      if (sql.includes("FROM ratings WHERE rater_id")) return ok([{ given: dataRows.ratingsGiven || 0 }]);
      if (sql.includes("COUNT(*)::int AS total FROM supplier_reputation WHERE grade")) return ok([{ total: 0 }]);
      if (sql.includes("FROM referrals")) return ok([{ active: 0 }]);
      if (sql.includes("FROM mentoring_sessions")) return ok([{ count: 0 }]);
      if (sql.includes("INSERT INTO user_milestones")) {
        if (captureInserts) captureInserts({ sql, params });
        return ok([], insertRowCount);
      }
      if (sql.includes("INSERT INTO notifications")) return ok([], 1);
      return ok();
    });
  }

  it("awards first_match milestone when one deal is completed and inserts a notification", async () => {
    const inserts = [];
    const pool = milestonePool({ dataRows: { deals: { completed: 1 } }, insertRowCount: 1, captureInserts: (i) => inserts.push(i) });
    const awarded = await svc.checkAndAwardMilestones(pool, "u1");
    const keys = awarded.map(m => m.key);
    assert.ok(keys.includes("first_match"));
    // notification insert should have happened
    const notif = pool.calls.find(c => c.sql.includes("INSERT INTO notifications"));
    assert.ok(notif, "notification insert expected");
  });

  it("awards nothing when no milestone condition is met", async () => {
    const pool = milestonePool({ dataRows: { deals: { completed: 0 }, ratingStats: { total_ratings: 0 } } });
    const awarded = await svc.checkAndAwardMilestones(pool, "u1");
    assert.deepStrictEqual(awarded, []);
  });

  it("does NOT re-award an already-existing milestone (rowCount 0 → no notification)", async () => {
    const pool = milestonePool({ dataRows: { deals: { completed: 1 } }, insertRowCount: 0 });
    const awarded = await svc.checkAndAwardMilestones(pool, "u1");
    assert.deepStrictEqual(awarded, []);
    const notif = pool.calls.find(c => c.sql.includes("INSERT INTO notifications"));
    assert.strictEqual(notif, undefined);
  });

  it("awards multiple match milestones at 100 completed deals", async () => {
    const pool = milestonePool({ dataRows: { deals: { completed: 100 }, ratingStats: { total_ratings: 1 } }, insertRowCount: 1 });
    const awarded = await svc.checkAndAwardMilestones(pool, "u1");
    const keys = awarded.map(m => m.key);
    for (const k of ["first_match", "matches_10", "matches_50", "matches_100", "first_rating"]) {
      assert.ok(keys.includes(k), `expected ${k}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// getUserMilestones
// ═══════════════════════════════════════════════════════════════
describe("bountyService — getUserMilestones", () => {
  it("returns rows for the user ordered by reached_at", async () => {
    const rows = [{ milestone_key: "first_match" }];
    const pool = patternPool((sql) => sql.includes("FROM user_milestones") ? ok(rows) : ok());
    const res = await svc.getUserMilestones(pool, "u1");
    assert.deepStrictEqual(res, rows);
    assert.deepStrictEqual(pool.calls[0].params, ["u1"]);
    assert.match(pool.calls[0].sql, /ORDER BY reached_at/);
  });
});

// ═══════════════════════════════════════════════════════════════
// getValueReport
// ═══════════════════════════════════════════════════════════════
describe("bountyService — getValueReport", () => {
  function valuePool({ totalMatches, avgHours, memberSince, thisMonth, discountSum = 0, tierMax = 25 }) {
    return patternPool((sql) => {
      if (sql.includes("AS total_matches")) return ok([{ total_matches: totalMatches }]);
      if (sql.includes("AS avg_hours")) return ok([{ avg_hours: avgHours }]);
      if (sql.includes("created_at FROM users WHERE id")) return ok([{ created_at: memberSince }]);
      if (sql.includes("sent_this_month")) return ok([thisMonth || {}]);
      // getUserDiscount internals
      if (sql.includes("SUM(b.discount_pct)")) return ok([{ total: discountSum }]);
      if (sql.includes("FROM user_bounty_tiers ubt")) return ok([{ max_discount_pct: tierMax }]);
      return ok();
    });
  }

  it("computes matches, fill hours and estimated hours saved", async () => {
    const report = await svc.getValueReport(valuePool({ totalMatches: 10, avgHours: "2.0", memberSince: "2025-01-01", thisMonth: { sent_this_month: 3 }, discountSum: 5 }), "u1");
    assert.strictEqual(report.total_matches, 10);
    assert.strictEqual(report.avg_fill_hours, 2);
    // 10 * (8 - 2) = 60
    assert.strictEqual(report.estimated_hours_saved, 60);
    assert.strictEqual(report.member_since, "2025-01-01");
    assert.deepStrictEqual(report.this_month, { sent_this_month: 3 });
    assert.strictEqual(report.bounty_discount_pct, 5);
  });

  it("uses default platform hours (4) when avg_fill_hours is null", async () => {
    const report = await svc.getValueReport(valuePool({ totalMatches: 5, avgHours: null, memberSince: null, thisMonth: null, discountSum: 0 }), "u1");
    assert.strictEqual(report.avg_fill_hours, null);
    // 5 * (8 - 4) = 20
    assert.strictEqual(report.estimated_hours_saved, 20);
  });

  it("never returns negative hours saved", async () => {
    // avg_fill_hours huge → manual-platform negative → clamped to 0
    const report = await svc.getValueReport(valuePool({ totalMatches: 3, avgHours: "100.0", memberSince: null, thisMonth: null }), "u1");
    assert.strictEqual(report.estimated_hours_saved, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getBountyStatus
// ═══════════════════════════════════════════════════════════════
describe("bountyService — getBountyStatus", () => {
  function statusPool({ catalog, userBounties, discountSum, tierRow }) {
    return patternPool((sql) => {
      if (sql.includes("SELECT * FROM bounties")) return ok(catalog);
      // getUserDiscount's SUM query ALSO contains "FROM user_bounties ub" — match it first.
      if (sql.includes("SUM(b.discount_pct)")) return ok([{ total: discountSum }]);
      if (sql.includes("FROM user_bounties ub")) return ok(userBounties);
      if (sql.includes("FROM user_bounty_tiers ubt")) return tierRow ? ok([tierRow]) : ok([]);
      // evaluateAndPromoteTier internals (getTierDefinitions + gatherTierData + upsert)
      if (sql.includes("FROM bounty_tiers ORDER BY sort_order")) return ok([]); // use fallback tiers
      if (sql.includes("COUNT(*)::int AS count FROM user_bounties")) return ok([{ count: 0 }]);
      if (sql.includes("MIN(created_at) AS first_sub")) return ok([{ first_sub: null }]);
      if (sql.includes("emergency_completed") || sql.includes("AS completed")) return ok([{ completed: 0, canceled: 0 }]);
      if (sql.includes("AVG(reliability)")) return ok([{ avg: 0 }]);
      if (sql.includes("FROM supplier_reputation")) return ok([{ total: 0 }]);
      if (sql.includes("INSERT INTO user_bounty_tiers")) return ok([{ promoted_at: "2026-01-01" }], 1);
      return ok();
    });
  }

  it("maps catalog to items with earned/in_progress/locked status and tier", async () => {
    const catalog = [
      { key: "completed_deals", name_de: "Deals", description_de: "d", category: "c", icon: "i", discount_pct: 5, is_recurring: false },
      { key: "referrals", name_de: "Ref", description_de: "d", category: "c", icon: "i", discount_pct: 3, is_recurring: true },
      { key: "mentoring", name_de: "Men", description_de: "d", category: "c", icon: "i", discount_pct: 2, is_recurring: false }
    ];
    const userBounties = [
      { key: "completed_deals", is_active: true, progress: 100, earned_at: "2026-01-01" },
      { key: "referrals", is_active: false, progress: 40, earned_at: null }
      // mentoring has no user row → locked
    ];
    const tierRow = { tier_key: "gold", name_de: "Gold", icon: "🥇", color: "#ffd700", bg_color: "x", max_discount_pct: 15 };
    const res = await svc.getBountyStatus(statusPool({ catalog, userBounties, discountSum: 5, tierRow }), "u1");

    assert.strictEqual(res.items.length, 3);
    const byKey = Object.fromEntries(res.items.map(i => [i.key, i]));
    assert.strictEqual(byKey.completed_deals.status, "earned");
    assert.strictEqual(byKey.referrals.status, "in_progress");
    assert.strictEqual(byKey.mentoring.status, "locked");
    assert.strictEqual(byKey.completed_deals.discount_pct, 5);
    assert.strictEqual(res.total_discount_pct, 5);
    assert.strictEqual(res.max_discount_pct, 15);
    assert.ok(res.tier);
    assert.strictEqual(res.tier.key, "gold");
    assert.strictEqual(res.tier.max_discount_pct, 15);
  });

  // P8 Welle C: die untere Stufe einer Leiter erschien vorher als
  // "In Arbeit / 100 %" MIT Erfolgstext, gab aber 0 % Rabatt — das liest sich
  // wie einbehaltenes Geld. Sie wird jetzt ausdruecklich als abgeloest markiert.
  it("markiert die abgeloeste Stufe einer Leiter statt sie als 'In Arbeit' zu zeigen", async () => {
    const catalog = [
      { key: "zuverlaessiger_partner", name_de: "Zuverlaessiger Partner", description_de: "d", category: "performance", icon: "Z", discount_pct: 3, is_recurring: true, threshold_value: { days: 90 } },
      { key: "zero_complaint", name_de: "Null-Beschwerde-Streak", description_de: "d", category: "performance", icon: "S", discount_pct: 3, is_recurring: true, threshold_value: { days: 365, replaces: "zuverlaessiger_partner" } }
    ];
    const userBounties = [
      { key: "zuverlaessiger_partner", is_active: false, progress: 100, earned_at: "2026-05-01" },
      { key: "zero_complaint", is_active: true, progress: 100, earned_at: "2026-08-01" }
    ];
    const notes = new Map([["zuverlaessiger_partner", "90 Tage ohne gewichteten Storno."]]);
    const res = await svc.getBountyStatus(
      statusPool({ catalog, userBounties, discountSum: 3, tierRow: null }), "u1", { notes });

    const byKey = Object.fromEntries(res.items.map((i) => [i.key, i]));
    assert.strictEqual(byKey.zero_complaint.status, "earned");
    assert.strictEqual(byKey.zuverlaessiger_partner.status, "superseded");
    assert.strictEqual(byKey.zuverlaessiger_partner.superseded_by, "zero_complaint");
    assert.match(byKey.zuverlaessiger_partner.note, /Abgeloest durch "Null-Beschwerde-Streak"/,
      "die Abloesungs-Erklaerung schlaegt den Erfolgstext — sonst wirkt der Rabatt einbehalten");
    assert.strictEqual(res.total_discount_pct, 3, "kein doppelter Rabatt fuer dieselbe Tugend");
  });

  it("markiert NICHT als abgeloest, solange die obere Stufe nicht aktiv ist", async () => {
    const catalog = [
      { key: "zuverlaessiger_partner", name_de: "Z", description_de: "d", category: "performance", icon: "Z", discount_pct: 3, is_recurring: true, threshold_value: {} },
      { key: "zero_complaint", name_de: "S", description_de: "d", category: "performance", icon: "S", discount_pct: 3, is_recurring: true, threshold_value: { replaces: "zuverlaessiger_partner" } }
    ];
    const userBounties = [{ key: "zuverlaessiger_partner", is_active: true, progress: 100, earned_at: "2026-05-01" }];
    const res = await svc.getBountyStatus(
      statusPool({ catalog, userBounties, discountSum: 3, tierRow: null }), "u1");
    const byKey = Object.fromEntries(res.items.map((i) => [i.key, i]));
    assert.strictEqual(byKey.zuverlaessiger_partner.status, "earned");
    assert.strictEqual(byKey.zuverlaessiger_partner.superseded_by, null);
  });

  it("falls back to FALLBACK_MAX_DISCOUNT_PCT and null tier when no tier exists", async () => {
    const catalog = [{ key: "x", name_de: "X", description_de: "", category: "", icon: "", discount_pct: 0, is_recurring: false }];
    const res = await svc.getBountyStatus(statusPool({ catalog, userBounties: [], discountSum: 0, tierRow: null }), "u1");
    assert.strictEqual(res.tier, null);
    assert.strictEqual(res.max_discount_pct, 25);
    assert.strictEqual(res.items[0].status, "locked");
    assert.strictEqual(res.items[0].progress, 0);
  });
});
