/**
 * Coverage suite for services/referralProgramService.js
 *
 * Behavior tests for the referral program: code creation, pilot registration,
 * invites, registration tracking, surveys, reward qualification, status, counts.
 *
 * Uses a local SQL-substring routing pool because several exported functions
 * call other exported functions (e.g. createReferralInvite -> getOrCreateReferralCode),
 * making an ordered sequencePool brittle.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as svc from "../services/referralProgramService.js";

/**
 * Build a pool that records every query and routes by SQL substring.
 * routes: array of { match: string|RegExp, rows?: [], rowCount?, fn? }
 * First matching route wins. Default response: { rows: [] }.
 */
function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    for (const r of routes) {
      const hit =
        r.match instanceof RegExp ? r.match.test(sql) : sql.includes(r.match);
      if (hit) {
        if (typeof r.fn === "function") return r.fn({ sql, params, calls });
        const rows = r.rows || [];
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  const pool = {
    calls,
    query,
    connect: async () => ({ query, release: () => {} }),
  };
  return pool;
}

function findCall(calls, needle) {
  return calls.find((c) => c.sql.includes(needle));
}
function countCalls(calls, needle) {
  return calls.filter((c) => c.sql.includes(needle)).length;
}

const monthRe = /^\d{4}-\d{2}$/;

/* ───────────────────────── getOrCreateReferralCode ───────────────────────── */

describe("getOrCreateReferralCode", () => {
  it("returns existing code without inserting", async () => {
    const existing = { id: "c1", user_id: "u1", code: "ABCD1234", is_pilot: false };
    const pool = trackingPool([
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [existing] },
    ]);
    const result = await svc.getOrCreateReferralCode(pool, "u1");
    assert.deepEqual(result, existing);
    // No INSERT issued when code already exists.
    assert.equal(countCalls(pool.calls, "INSERT INTO referral_codes"), 0);
    // SELECT was parameterized with userId.
    const sel = findCall(pool.calls, "SELECT * FROM referral_codes WHERE user_id");
    assert.deepEqual(sel.params, ["u1"]);
  });

  it("generates and inserts a new 8-char hex code when none exists", async () => {
    let insertedParams = null;
    const pool = trackingPool([
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [] },
      {
        match: "INSERT INTO referral_codes",
        fn: ({ params }) => {
          insertedParams = params;
          return { rows: [{ id: "new", user_id: "u9", code: params[1], is_pilot: false }] };
        },
      },
    ]);
    const result = await svc.getOrCreateReferralCode(pool, "u9");
    assert.equal(result.user_id, "u9");
    // 4 random bytes -> 8 hex chars, uppercased.
    assert.match(insertedParams[1], /^[0-9A-F]{8}$/);
    assert.equal(insertedParams[0], "u9");
  });
});

/* ───────────────────────── registerAsPilot ───────────────────────── */

describe("registerAsPilot", () => {
  it("rejects when user is already a pilot", async () => {
    const existing = { id: "c1", user_id: "u1", code: "CODE0001", is_pilot: true };
    const pool = trackingPool([
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [existing] },
    ]);
    const result = await svc.registerAsPilot(pool, "u1");
    assert.equal(result.ok, false);
    assert.equal(result.error, "ALREADY_PILOT");
    assert.deepEqual(result.referralCode, existing);
    // Must not have inserted/upserted the pilot row.
    assert.equal(countCalls(pool.calls, "VALUES ($1, $2, TRUE, 1)"), 0);
  });

  it("registers a new pilot, reuses existing non-pilot code, and tracks base reward", async () => {
    const existing = { id: "c1", user_id: "u2", code: "REUSED01", is_pilot: false };
    const upserted = { ...existing, is_pilot: true, pilot_free_months_base: 1 };
    const pool = trackingPool([
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [existing] },
      { match: "VALUES ($1, $2, TRUE, 1)", rows: [upserted] },
      { match: "INSERT INTO referral_rewards", rows: [] },
    ]);
    const result = await svc.registerAsPilot(pool, "u2");
    assert.equal(result.ok, true);
    assert.deepEqual(result.referralCode, upserted);
    // Reused existing code, not a freshly generated one.
    const upsert = findCall(pool.calls, "VALUES ($1, $2, TRUE, 1)");
    assert.equal(upsert.params[1], "REUSED01");
    // pilot_base reward inserted with current month label.
    const reward = findCall(pool.calls, "INSERT INTO referral_rewards");
    assert.equal(reward.params[0], "u2");
    assert.match(reward.params[1], monthRe);
    assert.match(reward.sql, /pilot_base/);
  });

  it("generates a fresh code when no referral_codes row exists", async () => {
    const pool = trackingPool([
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [] },
      {
        match: "VALUES ($1, $2, TRUE, 1)",
        fn: ({ params }) => ({ rows: [{ user_id: "u3", code: params[1], is_pilot: true }] }),
      },
      { match: "INSERT INTO referral_rewards", rows: [] },
    ]);
    const result = await svc.registerAsPilot(pool, "u3");
    assert.equal(result.ok, true);
    const upsert = findCall(pool.calls, "VALUES ($1, $2, TRUE, 1)");
    assert.match(upsert.params[1], /^[0-9A-F]{8}$/);
  });
});

/* ───────────────────────── createReferralInvite ───────────────────────── */

describe("createReferralInvite", () => {
  function baseRoutes(codeRow, extra = []) {
    return [
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [codeRow] },
      ...extra,
    ];
  }

  it("rejects when MAX_REFERRALS_REACHED", async () => {
    const codeRow = { user_id: "r1", code: "RCODE001", is_pilot: false };
    const pool = trackingPool(
      baseRoutes(codeRow, [
        { match: "SELECT COUNT(*)::int AS total FROM referrals", rows: [{ total: 6 }] },
      ])
    );
    const result = await svc.createReferralInvite(pool, "r1", "New@Example.com");
    assert.equal(result.ok, false);
    assert.equal(result.error, "MAX_REFERRALS_REACHED");
    assert.equal(result.limit, 6);
    // Should not have attempted the duplicate check or insert.
    assert.equal(countCalls(pool.calls, "INSERT INTO referrals"), 0);
  });

  it("rejects ALREADY_INVITED when a duplicate non-expired referral exists", async () => {
    const codeRow = { user_id: "r1", code: "RCODE001", is_pilot: false };
    const pool = trackingPool(
      baseRoutes(codeRow, [
        { match: "SELECT COUNT(*)::int AS total FROM referrals", rows: [{ total: 1 }] },
        { match: "SELECT id FROM referrals WHERE referrer_id", rows: [{ id: "dup1" }] },
      ])
    );
    const result = await svc.createReferralInvite(pool, "r1", "Dup@Example.com");
    assert.equal(result.ok, false);
    assert.equal(result.error, "ALREADY_INVITED");
    assert.equal(countCalls(pool.calls, "INSERT INTO referrals"), 0);
  });

  it("creates a cashback invite for non-pilot referrer and lowercases the email", async () => {
    const codeRow = { user_id: "r1", code: "RCODE001", is_pilot: false };
    const pool = trackingPool(
      baseRoutes(codeRow, [
        { match: "SELECT COUNT(*)::int AS total FROM referrals", rows: [{ total: 0 }] },
        { match: "SELECT id FROM referrals WHERE referrer_id", rows: [] },
        {
          match: "INSERT INTO referrals",
          fn: ({ params }) => ({ rows: [{ id: "ref1", referrer_id: params[0], referred_email: params[1], reward_type: params[3], status: "pending" }] }),
        },
      ])
    );
    const result = await svc.createReferralInvite(pool, "r1", "MixedCase@Example.COM");
    assert.equal(result.ok, true);
    assert.equal(result.referral.status, "pending");
    const ins = findCall(pool.calls, "INSERT INTO referrals");
    assert.equal(ins.params[1], "mixedcase@example.com"); // lowercased
    assert.equal(ins.params[2], "RCODE001");
    assert.equal(ins.params[3], "cashback"); // non-pilot -> cashback
  });

  it("creates a free_month invite for pilot referrer", async () => {
    const codeRow = { user_id: "r2", code: "PILOT001", is_pilot: true };
    const pool = trackingPool(
      baseRoutes(codeRow, [
        { match: "SELECT COUNT(*)::int AS total FROM referrals", rows: [{ total: 0 }] },
        { match: "SELECT id FROM referrals WHERE referrer_id", rows: [] },
        {
          match: "INSERT INTO referrals",
          fn: ({ params }) => ({ rows: [{ id: "ref2", reward_type: params[3], status: "pending" }] }),
        },
      ])
    );
    const result = await svc.createReferralInvite(pool, "r2", "x@y.de");
    assert.equal(result.ok, true);
    const ins = findCall(pool.calls, "INSERT INTO referrals");
    assert.equal(ins.params[3], "free_month"); // pilot -> free_month
  });
});

/* ───────────────────────── trackReferralRegistration ───────────────────────── */

describe("trackReferralRegistration", () => {
  it("updates referral by code+email and creates a code for the new user", async () => {
    const updated = { id: "ref1", referral_code: "C1", referred_user_id: "nu1", status: "registered" };
    const pool = trackingPool([
      { match: "LOWER(referred_email) = LOWER($3)", rows: [updated] },
      // getOrCreateReferralCode for the new user:
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [{ id: "code-nu1", user_id: "nu1", code: "NEWCODE1" }] },
    ]);
    const result = await svc.trackReferralRegistration(pool, "C1", "nu1", "buyer@x.de");
    assert.deepEqual(result, updated);
    // New user's referral code was ensured.
    assert.ok(findCall(pool.calls, "SELECT * FROM referral_codes WHERE user_id"));
    const upd = findCall(pool.calls, "LOWER(referred_email) = LOWER($3)");
    assert.deepEqual(upd.params, ["nu1", "C1", "buyer@x.de"]);
  });

  it("falls back to code-only match when email match misses", async () => {
    const byCode = { id: "ref9", referral_code: "C2", referred_user_id: "nu2", status: "registered" };
    const pool = trackingPool([
      { match: "LOWER(referred_email) = LOWER($3)", rows: [] },
      { match: "referred_user_id IS NULL", rows: [byCode] },
    ]);
    const result = await svc.trackReferralRegistration(pool, "C2", "nu2", "noemailmatch@x.de");
    assert.deepEqual(result, byCode);
    // Fallback path does NOT create a referral code for the new user.
    assert.equal(countCalls(pool.calls, "SELECT * FROM referral_codes WHERE user_id"), 0);
  });

  it("returns null when neither email nor code-only match anything", async () => {
    const pool = trackingPool([
      { match: "LOWER(referred_email) = LOWER($3)", rows: [] },
      { match: "referred_user_id IS NULL", rows: [] },
    ]);
    const result = await svc.trackReferralRegistration(pool, "NOPE", "nu3", "x@x.de");
    assert.equal(result, null);
  });
});

/* ───────────────────────── submitSurvey ───────────────────────── */

describe("submitSurvey", () => {
  it("returns NO_REFERRAL_FOUND when user has no eligible referral", async () => {
    const pool = trackingPool([
      { match: "FROM referrals r\n     WHERE r.referred_user_id = $1", rows: [] },
    ]);
    const result = await svc.submitSurvey(pool, "u1", {});
    assert.deepEqual(result, { ok: false, error: "NO_REFERRAL_FOUND" });
  });

  it("returns SURVEY_ALREADY_SUBMITTED when a survey row exists", async () => {
    const pool = trackingPool([
      { match: "r.status IN ('registered','survey_done','active')", rows: [{ id: "ref1" }] },
      { match: "SELECT id FROM referral_surveys WHERE referral_id", rows: [{ id: "s1" }] },
    ]);
    const result = await svc.submitSurvey(pool, "u1", {});
    assert.deepEqual(result, { ok: false, error: "SURVEY_ALREADY_SUBMITTED" });
    assert.equal(countCalls(pool.calls, "INSERT INTO referral_surveys"), 0);
  });

  it("saves survey with provided values and marks referral survey_completed", async () => {
    const pool = trackingPool([
      { match: "r.status IN ('registered','survey_done','active')", rows: [{ id: "ref1" }] },
      { match: "SELECT id FROM referral_surveys WHERE referral_id", rows: [] },
      { match: "INSERT INTO referral_surveys", rows: [] },
      { match: "UPDATE referrals SET survey_completed = TRUE", rows: [] },
    ]);
    const surveyData = { rating: 5, feedback: "great", how_found: "google", would_recommend: true };
    const result = await svc.submitSurvey(pool, "u1", surveyData);
    assert.deepEqual(result, { ok: true, referral_id: "ref1", survey_saved: true });
    const ins = findCall(pool.calls, "INSERT INTO referral_surveys");
    assert.deepEqual(ins.params, ["ref1", "u1", 5, "great", "google", true]);
    const upd = findCall(pool.calls, "UPDATE referrals SET survey_completed = TRUE");
    assert.deepEqual(upd.params, ["ref1"]);
  });

  it("applies defaults: rating 4, nulls, would_recommend true when not explicitly false", async () => {
    const pool = trackingPool([
      { match: "r.status IN ('registered','survey_done','active')", rows: [{ id: "ref2" }] },
      { match: "SELECT id FROM referral_surveys WHERE referral_id", rows: [] },
      { match: "INSERT INTO referral_surveys", rows: [] },
      { match: "UPDATE referrals SET survey_completed = TRUE", rows: [] },
    ]);
    const result = await svc.submitSurvey(pool, "u2", {});
    assert.equal(result.ok, true);
    const ins = findCall(pool.calls, "INSERT INTO referral_surveys");
    assert.deepEqual(ins.params, ["ref2", "u2", 4, null, null, true]);
  });

  it("treats would_recommend === false as false", async () => {
    const pool = trackingPool([
      { match: "r.status IN ('registered','survey_done','active')", rows: [{ id: "ref3" }] },
      { match: "SELECT id FROM referral_surveys WHERE referral_id", rows: [] },
      { match: "INSERT INTO referral_surveys", rows: [] },
      { match: "UPDATE referrals SET survey_completed = TRUE", rows: [] },
    ]);
    await svc.submitSurvey(pool, "u3", { would_recommend: false });
    const ins = findCall(pool.calls, "INSERT INTO referral_surveys");
    assert.equal(ins.params[5], false);
  });
});

/* ───────────────────────── qualifyReferralReward ───────────────────────── */

describe("qualifyReferralReward", () => {
  const pendingReferral = {
    id: "ref1",
    referrer_id: "r1",
    referred_email: "buyer@x.de",
    reward_type: "free_month",
    status: "registered",
    reward_applied: false,
  };

  it("returns NO_PENDING_REFERRAL when none found", async () => {
    const pool = trackingPool([
      { match: "r.reward_applied = FALSE", rows: [] },
    ]);
    const result = await svc.qualifyReferralReward(pool, "buyer1");
    assert.deepEqual(result, { ok: false, reason: "NO_PENDING_REFERRAL" });
  });

  it("returns REFERRED_PLAN_NOT_QUALIFYING for FREE plan (no subscription row)", async () => {
    const pool = trackingPool([
      { match: "r.reward_applied = FALSE", rows: [pendingReferral] },
      { match: "SELECT plan FROM subscriptions", rows: [] },
    ]);
    const result = await svc.qualifyReferralReward(pool, "buyer1");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "REFERRED_PLAN_NOT_QUALIFYING");
    assert.equal(result.plan, "FREE");
  });

  it("returns TOTAL_LIMIT_REACHED when referrer already has 6 rewards", async () => {
    const pool = trackingPool([
      { match: "r.reward_applied = FALSE", rows: [pendingReferral] },
      { match: "SELECT plan FROM subscriptions", rows: [{ plan: "PRO" }] },
      { match: "SELECT COUNT(*)::int AS total FROM referral_rewards", rows: [{ total: 6 }] },
    ]);
    const result = await svc.qualifyReferralReward(pool, "buyer1");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "TOTAL_LIMIT_REACHED");
    assert.equal(result.limit, 6);
  });

  it("returns MONTHLY_LIMIT_REACHED when one reward already booked this month", async () => {
    const pool = trackingPool([
      { match: "r.reward_applied = FALSE", rows: [pendingReferral] },
      { match: "SELECT plan FROM subscriptions", rows: [{ plan: "basis" }] }, // lowercase -> upper qualifies
      { match: "SELECT COUNT(*)::int AS total FROM referral_rewards", rows: [{ total: 2 }] },
      { match: "SELECT COUNT(*)::int AS cnt FROM referral_rewards", rows: [{ cnt: 1 }] },
    ]);
    const result = await svc.qualifyReferralReward(pool, "buyer1");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "MONTHLY_LIMIT_REACHED");
    assert.match(result.month, monthRe);
  });

  /*
   * KORRIGIERT (P9/A1). Diese Erwartung war nachweislich falsch: sie hat
   * `UPDATE referrals SET status = 'qualified'` als Soll festgeschrieben.
   * Die CHECK-Bedingung `referrals_status_check` erlaubt aber nur
   * pending, registered, survey_done, active, expired — an der echten Datenbank
   * nachgestellt und mit Fehler 23514 bestaetigt. Der Mock-Pool kennt keine
   * Constraints, darum blieb der Test gruen, waehrend der Schritt in Produktion
   * jedes Mal abbrach: Gutschrift gebucht, `reward_applied` nie gesetzt, und
   * damit die Wiederholungssperre offen (bis zu 6 Gutschriften statt einer).
   * Sollzustand ist 'active' — der Endzustand, den auch getActiveReferralCount zaehlt.
   */
  it("bucht die Gutschrift und setzt das Referral auf 'active' (Wert, den die DB erlaubt)", async () => {
    const pool = trackingPool([
      { match: "r.reward_applied = FALSE", rows: [pendingReferral] },
      { match: "SELECT plan FROM subscriptions", rows: [{ plan: "INDIVIDUELL" }] },
      { match: "SELECT COUNT(*)::int AS total FROM referral_rewards", rows: [{ total: 0 }] },
      { match: "SELECT COUNT(*)::int AS cnt FROM referral_rewards", rows: [{ cnt: 0 }] },
      { match: "INSERT INTO referral_rewards", rows: [] },
      { match: "UPDATE referrals SET status = 'active'", rows: [] },
    ]);
    const result = await svc.qualifyReferralReward(pool, "buyer1");
    assert.equal(result.ok, true);
    assert.equal(result.referral_id, "ref1");
    assert.equal(result.reward_type, "free_month");
    assert.match(result.month, monthRe);
    // Reward booked against the REFERRER, linked to the referral.
    const ins = findCall(pool.calls, "INSERT INTO referral_rewards");
    assert.equal(ins.params[0], "r1");
    assert.equal(ins.params[1], "ref1");
    assert.equal(ins.params[2], "free_month");
    assert.match(ins.params[3], /Gratis-Monat/);
    assert.match(ins.params[3], /INDIVIDUELL/);
    // Referral state transition.
    const upd = findCall(pool.calls, "UPDATE referrals SET status = 'active'");
    assert.deepEqual(upd.params, ["ref1"]);
    // Gutschrift und Sperrvermerk muessen gemeinsam gelten, sonst bleibt bei
    // einem Fehler die Gutschrift ohne Sperre stehen.
    assert.ok(findCall(pool.calls, "BEGIN"), "Reward-Buchung laeuft in einer Transaktion");
  });

  it("uses cashback description when reward_type is cashback", async () => {
    const cashbackRef = { ...pendingReferral, id: "ref2", reward_type: "cashback" };
    const pool = trackingPool([
      { match: "r.reward_applied = FALSE", rows: [cashbackRef] },
      { match: "SELECT plan FROM subscriptions", rows: [{ plan: "PLUS" }] },
      { match: "SELECT COUNT(*)::int AS total FROM referral_rewards", rows: [{ total: 0 }] },
      { match: "SELECT COUNT(*)::int AS cnt FROM referral_rewards", rows: [{ cnt: 0 }] },
      { match: "INSERT INTO referral_rewards", rows: [] },
      { match: "UPDATE referrals SET status = 'active'", rows: [] },
    ]);
    const result = await svc.qualifyReferralReward(pool, "buyer2");
    assert.equal(result.ok, true);
    assert.equal(result.reward_type, "cashback");
    const ins = findCall(pool.calls, "INSERT INTO referral_rewards");
    assert.match(ins.params[3], /Monatsgutschrift/);
  });
});

/* ───────────────────────── getReferralStatus ───────────────────────── */

describe("getReferralStatus", () => {
  it("aggregates code, referrals, rewards, and survey status", async () => {
    const codeRow = {
      id: "c1",
      user_id: "u1",
      code: "MYCODE01",
      is_pilot: true,
      created_at: new Date().toISOString(), // same month -> usedMonthsSincePilot 0
    };
    const myReferrals = [
      { id: "a", referred_email: "a@x.de", status: "active", reward_type: "free_month", reward_applied: true },
      { id: "b", referred_email: "b@x.de", status: "registered", reward_type: "free_month", reward_applied: false },
      { id: "c", referred_email: "c@x.de", status: "expired", reward_type: "free_month", reward_applied: false },
    ];
    const rewards = [
      { reward_type: "pilot_base" },
      { reward_type: "free_month" },
      { reward_type: "cashback" },
    ];
    const referredBy = { id: "rb1", referrer_id: "spons1", status: "qualified", survey_completed: true, referrer_is_pilot: true };

    const pool = trackingPool([
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [codeRow] },
      { match: "FROM referrals r\n     WHERE r.referrer_id = $1", rows: myReferrals },
      { match: "SELECT * FROM referral_rewards WHERE user_id", rows: rewards },
      { match: "LEFT JOIN referral_codes rc", rows: [referredBy] },
      { match: "SELECT id FROM referral_surveys WHERE referral_id", rows: [{ id: "s1" }] },
    ]);

    const result = await svc.getReferralStatus(pool, "u1");
    assert.equal(result.referral_code, "MYCODE01");
    assert.equal(result.is_pilot, true);
    // free_months counts pilot_base + free_month = 2
    assert.equal(result.free_months_total, 2);
    assert.equal(result.free_months_remaining, 2); // usedMonthsSincePilot 0
    assert.equal(result.free_months_max, 6);
    assert.equal(result.cashback_months_earned, 1);
    assert.equal(result.referrals_total, 3);
    assert.equal(result.referrals_active, 1);
    assert.equal(result.referrals_pending, 1); // not active, not expired -> the 'registered' one
    assert.equal(result.referrals_remaining, 6 - 2); // 2 non-expired
    assert.equal(result.referrals.length, 3);
    assert.deepEqual(result.referred_by, {
      referrer_id: "spons1",
      status: "qualified",
      survey_completed: true,
    });
    assert.equal(result.survey_status, "completed");
  });

  it("survey_status not_applicable when user was not referred", async () => {
    const codeRow = { id: "c2", user_id: "u2", code: "NOCODE01", is_pilot: false, created_at: null };
    const pool = trackingPool([
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [codeRow] },
      { match: "FROM referrals r\n     WHERE r.referrer_id = $1", rows: [] },
      { match: "SELECT * FROM referral_rewards WHERE user_id", rows: [] },
      { match: "LEFT JOIN referral_codes rc", rows: [] },
    ]);
    const result = await svc.getReferralStatus(pool, "u2");
    assert.equal(result.referred_by, null);
    assert.equal(result.survey_status, "not_applicable");
    assert.equal(result.free_months_total, 0);
    assert.equal(result.cashback_months_earned, 0);
    assert.equal(result.referrals_total, 0);
    assert.equal(result.referrals_remaining, 6);
    // No survey lookup issued when not referred.
    assert.equal(countCalls(pool.calls, "SELECT id FROM referral_surveys WHERE referral_id"), 0);
  });

  it("survey_status pending when referred but no survey completed", async () => {
    const codeRow = { id: "c3", user_id: "u3", code: "PCODE001", is_pilot: false, created_at: null };
    const referredBy = { id: "rb3", referrer_id: "s3", status: "registered", survey_completed: false };
    const pool = trackingPool([
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [codeRow] },
      { match: "FROM referrals r\n     WHERE r.referrer_id = $1", rows: [] },
      { match: "SELECT * FROM referral_rewards WHERE user_id", rows: [] },
      { match: "LEFT JOIN referral_codes rc", rows: [referredBy] },
      { match: "SELECT id FROM referral_surveys WHERE referral_id", rows: [] },
    ]);
    const result = await svc.getReferralStatus(pool, "u3");
    assert.equal(result.survey_status, "pending");
  });

  it("usedMonthsSincePilot reduces free_months_remaining for an older pilot", async () => {
    // Bewusst NICHT `setMonth(getMonth() - 3)`: faellt der heutige Tag auf den 31. und hat
    // der Zielmonat nur 30 Tage, rollt JavaScript in den Folgemonat (31. April -> 1. Mai).
    // Der Abstand betraegt dann nur 2 Kalendermonate und der Test scheitert — an wenigen
    // Tagen im Jahr, sonst nie. Genau so ist er am 2026-07-31 rot geworden.
    // Der 15. existiert in jedem Monat, damit ist der Abstand immer exakt 3.
    // (Der Dienst selbst rechnet korrekt mit der Kalendermonats-Differenz; nur das
    // Fixture war sproede.)
    const jetzt = new Date();
    const old = new Date(jetzt.getFullYear(), jetzt.getMonth() - 3, 15);
    const codeRow = { id: "c4", user_id: "u4", code: "OLD00001", is_pilot: true, created_at: old.toISOString() };
    const rewards = [
      { reward_type: "pilot_base" },
      { reward_type: "free_month" },
      { reward_type: "free_month" },
      { reward_type: "free_month" },
    ]; // freeMonths = 4
    const pool = trackingPool([
      { match: "SELECT * FROM referral_codes WHERE user_id", rows: [codeRow] },
      { match: "FROM referrals r\n     WHERE r.referrer_id = $1", rows: [] },
      { match: "SELECT * FROM referral_rewards WHERE user_id", rows: rewards },
      { match: "LEFT JOIN referral_codes rc", rows: [] },
    ]);
    const result = await svc.getReferralStatus(pool, "u4");
    assert.equal(result.free_months_total, 4);
    // 4 earned - 3 months used = 1 remaining
    assert.equal(result.free_months_remaining, 1);
  });
});

/* ───────────────────────── getActiveReferralCount ───────────────────────── */

describe("getActiveReferralCount", () => {
  it("returns the active count from the query", async () => {
    const pool = trackingPool([
      { match: "SELECT COUNT(*)::int AS active FROM referrals", rows: [{ active: 4 }] },
    ]);
    const count = await svc.getActiveReferralCount(pool, "u1");
    assert.equal(count, 4);
    const c = findCall(pool.calls, "SELECT COUNT(*)::int AS active FROM referrals");
    assert.deepEqual(c.params, ["u1"]);
  });

  it("returns 0 when no rows are returned", async () => {
    const pool = trackingPool([
      { match: "SELECT COUNT(*)::int AS active FROM referrals", rows: [] },
    ]);
    const count = await svc.getActiveReferralCount(pool, "u2");
    assert.equal(count, 0);
  });
});
