/**
 * Referral-Programm Service
 *
 * Pilotkunden:  bis zu 6 Gratismonate (1 pro qualifiziertem Neukunden-Abo). Max 6 Rewards gesamt, max 1 pro Monat.
 * Zahlende:     Monatsgutschrift (1 pro qualifiziertem Neukunden-Abo). Max 6 Rewards gesamt, max 1 pro Monat.
 * Qualification: geworbener Kunde muss ein bezahltes Abo abgeschlossen haben (BASIS+).
 */

import crypto from "crypto";
import { withTransaction } from "../utils/transaction.js";

const MAX_REFERRAL_REWARDS = 6;
const MAX_REWARDS_PER_MONTH = 1;
const QUALIFYING_PLANS = ["BASIS", "PLUS", "PRO", "INDIVIDUELL", "INDIVIDUAL", "ENTERPRISE"];

/* ── Referral-Code generieren / abrufen ─────────────────────── */

export async function getOrCreateReferralCode(pool, userId) {
  // Existierenden Code abrufen
  const { rows } = await pool.query(
    `SELECT * FROM referral_codes WHERE user_id = $1`, [userId]
  );
  if (rows[0]) return rows[0];

  // Neuen 8-stelligen Code generieren
  const code = generateCode();
  const { rows: inserted } = await pool.query(
    `INSERT INTO referral_codes (user_id, code, is_pilot, pilot_free_months_base)
     VALUES ($1, $2, FALSE, 0)
     ON CONFLICT (user_id) DO UPDATE SET user_id = referral_codes.user_id
     RETURNING *`,
    [userId, code]
  );
  return inserted[0];
}

function generateCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

/* ── Pilotkunden-Registrierung ──────────────────────────────── */

export async function registerAsPilot(pool, userId) {
  // Pruefen ob bereits Pilot
  const { rows: existing } = await pool.query(
    `SELECT * FROM referral_codes WHERE user_id = $1`, [userId]
  );

  if (existing[0]?.is_pilot) {
    return { ok: false, error: "ALREADY_PILOT", referralCode: existing[0] };
  }

  const code = existing[0]?.code || generateCode();

  const { rows } = await pool.query(
    `INSERT INTO referral_codes (user_id, code, is_pilot, pilot_free_months_base)
     VALUES ($1, $2, TRUE, 1)
     ON CONFLICT (user_id) DO UPDATE SET
       is_pilot = TRUE,
       pilot_free_months_base = 1
     RETURNING *`,
    [userId, code]
  );

  // Basis-Gratis-Monat als Reward tracken
  await pool.query(
    `INSERT INTO referral_rewards (user_id, reward_type, description, month_label)
     VALUES ($1, 'pilot_base', 'Pilotkunden-Programm: 1 Monat gratis', $2)
     ON CONFLICT DO NOTHING`,
    [userId, currentMonthLabel()]
  );

  return { ok: true, referralCode: rows[0] };
}

/* ── Einladung senden (Referral erstellen) ──────────────────── */

export async function createReferralInvite(pool, referrerId, referredEmail) {
  const codeRow = await getOrCreateReferralCode(pool, referrerId);

  // Pruefen ob max 6 aktive Referrals erreicht
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM referrals
     WHERE referrer_id = $1 AND status != 'expired'`,
    [referrerId]
  );
  if (countRows[0]?.total >= MAX_REFERRAL_REWARDS) {
    return { ok: false, error: "MAX_REFERRALS_REACHED", limit: MAX_REFERRAL_REWARDS };
  }

  // Doppelt pruefen
  const { rows: dup } = await pool.query(
    `SELECT id FROM referrals WHERE referrer_id = $1 AND referred_email = $2 AND status != 'expired'`,
    [referrerId, referredEmail.toLowerCase()]
  );
  if (dup.length > 0) {
    return { ok: false, error: "ALREADY_INVITED" };
  }

  // Reward-Typ: Pilotkunden bekommen free_month, Geworbene bekommen cashback
  const rewardType = codeRow.is_pilot ? "free_month" : "cashback";

  const { rows } = await pool.query(
    `INSERT INTO referrals (referrer_id, referred_email, referral_code, reward_type, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [referrerId, referredEmail.toLowerCase(), codeRow.code, rewardType]
  );

  return { ok: true, referral: rows[0] };
}

/* ── Referral tracken (wenn geworbener Kunde sich registriert) ── */

export async function trackReferralRegistration(pool, referralCode, newUserId, newUserEmail) {
  const { rows } = await pool.query(
    `UPDATE referrals SET
       referred_user_id = $1,
       status = 'registered',
       updated_at = NOW()
     WHERE referral_code = $2
       AND LOWER(referred_email) = LOWER($3)
       AND status = 'pending'
     RETURNING *`,
    [newUserId, referralCode, newUserEmail]
  );

  if (rows.length === 0) {
    // Auch ohne exakte E-Mail Match versuchen (Code reicht)
    const { rows: byCode } = await pool.query(
      `UPDATE referrals SET
         referred_user_id = $1,
         status = 'registered',
         updated_at = NOW()
       WHERE referral_code = $2
         AND referred_user_id IS NULL
         AND status = 'pending'
       RETURNING *`,
      [newUserId, referralCode]
    );
    return byCode[0] || null;
  }

  // Geworbener Kunde bekommt auch einen eigenen Referral-Code
  await getOrCreateReferralCode(pool, newUserId);

  return rows[0];
}

/* ── Umfrage einreichen (optional, nicht mehr allein reward-qualifizierend) ── */

export async function submitSurvey(pool, userId, surveyData) {
  const { rows: refRows } = await pool.query(
    `SELECT r.* FROM referrals r
     WHERE r.referred_user_id = $1
       -- 'active' ist der Endzustand nach gebuchter Gutschrift. Hier stand
       -- 'qualified' — ein Wert, den die CHECK-Bedingung nie zugelassen hat.
       AND r.status IN ('registered','survey_done','active')
     ORDER BY r.created_at ASC LIMIT 1`,
    [userId]
  );
  if (refRows.length === 0) return { ok: false, error: "NO_REFERRAL_FOUND" };
  const referral = refRows[0];

  const { rows: existingSurvey } = await pool.query(
    `SELECT id FROM referral_surveys WHERE referral_id = $1`, [referral.id]
  );
  if (existingSurvey.length > 0) return { ok: false, error: "SURVEY_ALREADY_SUBMITTED" };

  await pool.query(
    `INSERT INTO referral_surveys (referral_id, user_id, rating, feedback, how_found, would_recommend)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      referral.id, userId,
      surveyData.rating || 4,
      surveyData.feedback || null,
      surveyData.how_found || null,
      surveyData.would_recommend !== false
    ]
  );

  await pool.query(
    `UPDATE referrals SET survey_completed = TRUE, survey_completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [referral.id]
  );

  return { ok: true, referral_id: referral.id, survey_saved: true };
}

/* ── Referral-Reward qualifizieren (nach Abo-Abschluss des Geworbenen) ────── */

/**
 * Wird aufgerufen wenn ein geworbener Kunde ein qualifiziertes Abo (BASIS+) abschliesst.
 * Prueft Monats- und Gesamtlimit, bucht ggf. Reward fuer den Werber.
 */
export async function qualifyReferralReward(pool, referredUserId) {
  // 1. Referral finden
  const { rows: refRows } = await pool.query(
    `SELECT r.* FROM referrals r
     WHERE r.referred_user_id = $1
       AND r.status IN ('registered','survey_done')
       AND r.reward_applied = FALSE
     ORDER BY r.created_at ASC LIMIT 1`,
    [referredUserId]
  );
  if (refRows.length === 0) return { ok: false, reason: "NO_PENDING_REFERRAL" };
  const referral = refRows[0];

  // 2. Pruefen ob der geworbene Kunde ein qualifiziertes Abo hat
  const { rows: subRows } = await pool.query(
    `SELECT plan FROM subscriptions WHERE user_id = $1 AND status IN ('active', 'past_due', 'canceling') ORDER BY created_at DESC LIMIT 1`,
    [referredUserId]
  );
  const referredPlan = subRows[0]?.plan || "FREE";
  if (!QUALIFYING_PLANS.includes(referredPlan.toUpperCase())) {
    return { ok: false, reason: "REFERRED_PLAN_NOT_QUALIFYING", plan: referredPlan };
  }

  // 3. Gesamtlimit pruefen (max 6 Rewards fuer den Werber)
  const { rows: totalRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM referral_rewards WHERE user_id = $1 AND reward_type IN ('free_month','cashback')`,
    [referral.referrer_id]
  );
  if ((totalRows[0]?.total || 0) >= MAX_REFERRAL_REWARDS) {
    return { ok: false, reason: "TOTAL_LIMIT_REACHED", limit: MAX_REFERRAL_REWARDS };
  }

  // 4. Monatslimit pruefen (max 1 pro Kalendermonat)
  const monthLabel = currentMonthLabel();
  const { rows: monthRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM referral_rewards WHERE user_id = $1 AND month_label = $2 AND reward_type IN ('free_month','cashback')`,
    [referral.referrer_id, monthLabel]
  );
  if ((monthRows[0]?.cnt || 0) >= MAX_REWARDS_PER_MONTH) {
    return { ok: false, reason: "MONTHLY_LIMIT_REACHED", month: monthLabel };
  }

  // 5. Reward buchen
  const rewardType = referral.reward_type;
  const description = rewardType === "free_month"
    ? `Gratis-Monat: ${referral.referred_email} hat qualifiziertes Abo (${referredPlan}) abgeschlossen`
    : `Monatsgutschrift: ${referral.referred_email} hat qualifiziertes Abo (${referredPlan}) abgeschlossen`;

  // Gutschrift und Sperrvermerk gehoeren zusammen.
  //
  // Vorher waren das zwei getrennte Aufrufe, und der zweite schrieb den Status
  // 'qualified'. Diesen Wert kennt die CHECK-Bedingung `referrals_status_check`
  // nicht (erlaubt sind pending, registered, survey_done, active, expired) —
  // das UPDATE brach also immer ab. Die Gutschrift war da zwar schon gebucht,
  // aber `reward_applied` blieb FALSE. Genau dieses Feld ist oben in Schritt 1
  // die Wiederholungssperre: der naechste Lauf fand dasselbe Referral erneut und
  // buchte noch eine Gutschrift — bis zu 6 statt einer pro geworbenem Kunden.
  //
  // 'active' ist der von der Datenbank vorgesehene Endzustand und zugleich der
  // Wert, den `getActiveReferralCount` zaehlt. Damit zaehlt ein erfolgreich
  // geworbenes Unternehmen endlich fuer das Netzwerk-Builder-Bounty.
  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO referral_rewards (user_id, referral_id, reward_type, description, month_label)
       VALUES ($1, $2, $3, $4, $5)`,
      [referral.referrer_id, referral.id, rewardType, description, monthLabel]
    );

    await client.query(
      `UPDATE referrals SET status = 'active', reward_applied = TRUE, reward_applied_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [referral.id]
    );
  });

  return { ok: true, referral_id: referral.id, reward_type: rewardType, month: monthLabel };
}

/* ── Referral-Status fuer einen User ────────────────────────── */

export async function getReferralStatus(pool, userId) {
  // Referral-Code
  const codeRow = await getOrCreateReferralCode(pool, userId);

  // Meine Referrals (wen habe ich geworben?)
  const { rows: myReferrals } = await pool.query(
    `SELECT r.id, r.referred_email, r.status, r.survey_completed,
            r.reward_type, r.reward_applied, r.created_at
     FROM referrals r
     WHERE r.referrer_id = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );

  // Rewards
  const { rows: rewards } = await pool.query(
    `SELECT * FROM referral_rewards WHERE user_id = $1 ORDER BY applied_at DESC`,
    [userId]
  );

  // Berechne Gratis-Monate / Cashback
  const freeMonths = rewards.filter(r => r.reward_type === "free_month" || r.reward_type === "pilot_base").length;
  const cashbackMonths = rewards.filter(r => r.reward_type === "cashback").length;
  const activeReferrals = myReferrals.filter(r => r.status === "active").length;
  const pendingReferrals = myReferrals.filter(r => r.status !== "active" && r.status !== "expired").length;

  // Wurde ich selbst geworben?
  const { rows: myRefRow } = await pool.query(
    `SELECT r.*, rc.is_pilot AS referrer_is_pilot
     FROM referrals r
     LEFT JOIN referral_codes rc ON rc.user_id = r.referrer_id
     WHERE r.referred_user_id = $1
     ORDER BY r.created_at ASC LIMIT 1`,
    [userId]
  );
  const referredBy = myRefRow[0] || null;

  // Umfrage-Status (habe ich als Geworbener die Umfrage schon gemacht?)
  let surveyStatus = "not_applicable";
  if (referredBy) {
    const { rows: survey } = await pool.query(
      `SELECT id FROM referral_surveys WHERE referral_id = $1`, [referredBy.id]
    );
    surveyStatus = survey.length > 0 ? "completed" : "pending";
  }

  return {
    referral_code: codeRow.code,
    is_pilot: codeRow.is_pilot,
    // Pilotkunde: Gratis-Monate
    free_months_total: freeMonths,
    free_months_remaining: Math.max(0, freeMonths - usedMonthsSincePilot(codeRow)),
    free_months_max: MAX_REFERRAL_REWARDS, // max 6 Referral-Rewards
    // Geworbener Kunde: Cashback
    cashback_months_earned: cashbackMonths,
    cashback_months_max: MAX_REFERRAL_REWARDS,
    // Referral-Stats
    referrals_total: myReferrals.length,
    referrals_active: activeReferrals,
    referrals_pending: pendingReferrals,
    referrals_remaining: MAX_REFERRAL_REWARDS - myReferrals.filter(r => r.status !== "expired").length,
    referrals: myReferrals,
    rewards,
    // Mein Referral-Status (als Geworbener)
    referred_by: referredBy ? {
      referrer_id: referredBy.referrer_id,
      status: referredBy.status,
      survey_completed: referredBy.survey_completed
    } : null,
    survey_status: surveyStatus
  };
}

/* ── Referral-Count fuer Bounty-System ──────────────────────── */

export async function getActiveReferralCount(pool, userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS active FROM referrals
     WHERE referrer_id = $1 AND status = 'active'`,
    [userId]
  );
  return rows[0]?.active || 0;
}

/* ── Helpers ────────────────────────────────────────────────── */

function currentMonthLabel() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function usedMonthsSincePilot(codeRow) {
  if (!codeRow?.is_pilot || !codeRow?.created_at) return 0;
  const start = new Date(codeRow.created_at);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return Math.max(0, months);
}
