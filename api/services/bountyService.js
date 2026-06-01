/**
 * Bounty-Service: Gamification, Loyalitaets-Rabatte, Meilensteine.
 *
 * Evaluates bounty conditions against live data, awards/revokes bounties,
 * computes discount totals and provides value-report data.
 */

import { getActiveReferralCount } from "./referralProgramService.js";
import { getUserMaxDiscount, evaluateAndPromoteTier, getUserTier } from "./bountyTierService.js";

const FALLBACK_MAX_DISCOUNT_PCT = 25;

/* ── Bounty Catalog ────────────────────────────────────────── */

export async function getBountyCatalog(pool) {
  const { rows } = await pool.query(
    `SELECT * FROM bounties ORDER BY sort_order`
  );
  return rows;
}

/* ── User Bounties ─────────────────────────────────────────── */

export async function getUserBounties(pool, userId) {
  const { rows } = await pool.query(
    `SELECT ub.*, b.key, b.name_de, b.description_de, b.category, b.icon,
            b.discount_pct, b.threshold_type, b.threshold_value, b.is_recurring
     FROM user_bounties ub
     JOIN bounties b ON b.id = ub.bounty_id
     WHERE ub.user_id = $1
     ORDER BY b.sort_order`,
    [userId]
  );
  return rows;
}

/* ── Discount Calculation ──────────────────────────────────── */

export async function getUserDiscount(pool, userId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(b.discount_pct), 0) AS total
     FROM user_bounties ub
     JOIN bounties b ON b.id = ub.bounty_id
     WHERE ub.user_id = $1 AND ub.is_active = TRUE`,
    [userId]
  );
  const raw = Number(rows[0]?.total || 0);
  // Discount-Cap kommt vom aktuellen Tier (Bronze=8%, ..., Diamant=25%)
  let maxPct;
  try { maxPct = await getUserMaxDiscount(pool, userId); } catch { maxPct = FALLBACK_MAX_DISCOUNT_PCT; }
  return Math.min(maxPct, raw);
}

/* ── Evaluate All Bounties for a User ──────────────────────── */

export async function evaluateBounties(pool, userId) {
  const catalog = await getBountyCatalog(pool);
  const data = await gatherUserData(pool, userId);
  const results = [];

  for (const bounty of catalog) {
    const { earned, progress } = checkBountyCondition(bounty, data);

    // Upsert user_bounties
    if (earned) {
      await pool.query(
        `INSERT INTO user_bounties (user_id, bounty_id, is_active, progress, earned_at)
         VALUES ($1, $2, TRUE, $3, NOW())
         ON CONFLICT (user_id, bounty_id) DO UPDATE SET
           is_active = TRUE,
           progress = $3,
           updated_at = NOW()`,
        [userId, bounty.id, progress]
      );
    } else if (bounty.is_recurring) {
      // Revoke recurring bounties when condition no longer met
      await pool.query(
        `UPDATE user_bounties SET is_active = FALSE, progress = $3, updated_at = NOW()
         WHERE user_id = $1 AND bounty_id = $2`,
        [userId, bounty.id, progress]
      );
    } else {
      // Non-recurring: just track progress
      await pool.query(
        `INSERT INTO user_bounties (user_id, bounty_id, is_active, progress)
         VALUES ($1, $2, FALSE, $3)
         ON CONFLICT (user_id, bounty_id) DO UPDATE SET
           progress = GREATEST(user_bounties.progress, $3),
           updated_at = NOW()
         WHERE user_bounties.is_active = FALSE`,
        [userId, bounty.id, progress]
      );
    }

    results.push({ key: bounty.key, earned, progress });
  }

  // Handle loyalty_2y replacing loyalty_1y
  await handleReplacements(pool, userId);

  return results;
}

/* ── Gather all user data needed for evaluation ────────────── */

async function gatherUserData(pool, userId) {
  const data = {};

  // Basic user info
  try {
    const { rows } = await pool.query(
      `SELECT created_at, is_verified FROM users WHERE id = $1`, [userId]
    );
    data.userCreatedAt = rows[0]?.created_at || null;
  } catch { data.userCreatedAt = null; }

  // Subscription age (first active subscription)
  try {
    const { rows } = await pool.query(
      `SELECT MIN(created_at) AS first_sub FROM subscriptions
       WHERE user_id = $1 AND plan != 'DEMO'`, [userId]
    );
    data.firstSubDate = rows[0]?.first_sub || null;
  } catch { data.firstSubDate = null; }

  // Reputation data
  try {
    const { rows } = await pool.query(
      `SELECT * FROM supplier_reputation WHERE supplier_id = $1`, [userId]
    );
    data.reputation = rows[0] || null;
  } catch { data.reputation = null; }

  // Rating stats
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total_ratings,
              ROUND(AVG(reliability)::numeric, 2) AS avg_reliability,
              ROUND(AVG(communication)::numeric, 2) AS avg_communication
       FROM ratings WHERE rated_id = $1`, [userId]
    );
    data.ratingStats = rows[0] || {};
  } catch { data.ratingStats = {}; }

  // Deal counts
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('FINALIZED','COMPLETED'))::int AS completed,
         COUNT(*) FILTER (WHERE status = 'CANCELED')::int AS canceled,
         COUNT(*) FILTER (WHERE priority = 'NOTDIENST' AND status IN ('FINALIZED','COMPLETED'))::int AS emergency_completed
       FROM requests WHERE receiver_id = $1`, [userId]
    );
    data.deals = rows[0] || {};
  } catch { data.deals = {}; }

  // Response time (90 days)
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_received,
         COUNT(*) FILTER (WHERE status NOT IN ('SENT','CREATED'))::int AS responded,
         ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60)::numeric, 1) AS avg_response_minutes
       FROM requests
       WHERE receiver_id = $1 AND created_at >= NOW() - INTERVAL '90 days'`, [userId]
    );
    data.responseStats = rows[0] || {};
  } catch { data.responseStats = {}; }

  // Active listings (capacity_posts)
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS active FROM capacity_posts
       WHERE supplier_company_id = $1 AND status = 'active'`, [userId]
    );
    data.activeListings = rows[0]?.active || 0;
  } catch { data.activeListings = 0; }

  // Ratings given
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS given FROM ratings WHERE rater_id = $1`, [userId]
    );
    data.ratingsGiven = rows[0]?.given || 0;
  } catch { data.ratingsGiven = 0; }

  // Leaderboard percentile
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM supplier_reputation WHERE grade != 'UNRATED'`
    );
    const total = rows[0]?.total || 0;
    if (total > 0 && data.reputation) {
      const { rows: rankRows } = await pool.query(
        `SELECT COUNT(*)::int AS rank FROM supplier_reputation
         WHERE reputation_score >= $1 AND grade != 'UNRATED'`,
        [data.reputation.reputation_score || 0]
      );
      data.percentileRank = Math.round(((rankRows[0]?.rank || total) / total) * 100);
    } else {
      data.percentileRank = 100;
    }
  } catch { data.percentileRank = 100; }

  // Referral count (fuer Community-Bounty)
  try {
    data.referralCount = await getActiveReferralCount(pool, userId);
  } catch { data.referralCount = 0; }

  // Mentoring sessions completed (as mentor)
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM mentoring_sessions WHERE mentor_id = $1 AND status = 'completed'`,
      [userId]
    );
    data.mentoringCount = rows[0]?.count || 0;
  } catch { data.mentoringCount = 0; }

  return data;
}

/* ── Check individual bounty condition ─────────────────────── */

function checkBountyCondition(bounty, data) {
  const tv = bounty.threshold_value || {};

  switch (bounty.threshold_type) {
    case 'avg_reliability_6m': {
      const avg = Number(data.ratingStats?.avg_reliability || 0);
      const total = Number(data.ratingStats?.total_ratings || 0);
      const needed = tv.min_stars || 4.5;
      return { earned: avg >= needed && total >= 5, progress: Math.min(100, (avg / needed) * 100) };
    }
    case 'top_percentile_12m': {
      const pct = data.percentileRank || 100;
      const needed = tv.percentile || 10;
      return { earned: pct <= needed, progress: Math.min(100, ((100 - pct) / (100 - needed)) * 100) };
    }
    case 'zero_complaints_12m': {
      const canceled = Number(data.deals?.canceled || 0);
      return { earned: canceled === 0 && (data.deals?.completed || 0) >= 3, progress: canceled === 0 ? 100 : 0 };
    }
    case 'avg_communication': {
      const avg = Number(data.ratingStats?.avg_communication || 0);
      const total = Number(data.ratingStats?.total_ratings || 0);
      const needed = tv.min_stars || 4.8;
      const minRatings = tv.min_ratings || 20;
      const starProg = Math.min(50, (avg / needed) * 50);
      const ratingProg = Math.min(50, (total / minRatings) * 50);
      return { earned: avg >= needed && total >= minRatings, progress: starProg + ratingProg };
    }
    case 'completed_deals': {
      const completed = Number(data.deals?.completed || 0);
      const needed = tv.min_deals || 50;
      return { earned: completed >= needed, progress: Math.min(100, (completed / needed) * 100) };
    }
    case 'response_time_3m': {
      const avgMin = Number(data.responseStats?.avg_response_minutes || 999);
      const total = Number(data.responseStats?.total_received || 0);
      const responded = Number(data.responseStats?.responded || 0);
      const rate = total > 0 ? (responded / total) * 100 : 0;
      const maxMin = tv.max_minutes || 30;
      const minRate = tv.min_rate || 90;
      return { earned: avgMin <= maxMin && rate >= minRate && total >= 5, progress: Math.min(100, ((maxMin / Math.max(1, avgMin)) * 50) + ((rate / minRate) * 50)) };
    }
    case 'emergency_deals': {
      const completed = Number(data.deals?.emergency_completed || 0);
      const needed = tv.min_deals || 10;
      return { earned: completed >= needed, progress: Math.min(100, (completed / needed) * 100) };
    }
    case 'active_listings_6m': {
      const active = data.activeListings || 0;
      const needed = tv.min_listings || 5;
      return { earned: active >= needed, progress: Math.min(100, (active / needed) * 100) };
    }
    case 'subscription_age': {
      const firstSub = data.firstSubDate ? new Date(data.firstSubDate) : null;
      if (!firstSub) return { earned: false, progress: 0 };
      const monthsActive = (Date.now() - firstSub.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      const needed = tv.months || 12;
      return { earned: monthsActive >= needed, progress: Math.min(100, (monthsActive / needed) * 100) };
    }
    case 'registration_before': {
      const created = data.userCreatedAt ? new Date(data.userCreatedAt) : null;
      const deadline = new Date(tv.before || '2027-01-01');
      return { earned: created && created < deadline, progress: created && created < deadline ? 100 : 0 };
    }
    case 'referrals': {
      const refCount = data.referralCount || 0;
      const needed = tv.min_referrals || 5;
      return { earned: refCount >= needed, progress: Math.min(100, (refCount / needed) * 100) };
    }
    case 'ratings_given': {
      const given = data.ratingsGiven || 0;
      const needed = tv.min_ratings || 50;
      return { earned: given >= needed, progress: Math.min(100, (given / needed) * 100) };
    }
    case 'mentoring': {
      const mentoringCount = data.mentoringCount || 0;
      const needed = tv.min_sessions || 5;
      return { earned: mentoringCount >= needed, progress: Math.min(100, (mentoringCount / needed) * 100) };
    }
    default:
      return { earned: false, progress: 0 };
  }
}

/* ── Handle bounty replacements (e.g. 2y replaces 1y) ──────── */

async function handleReplacements(pool, userId) {
  // If loyalty_2y is active, deactivate loyalty_1y
  try {
    const { rows } = await pool.query(
      `SELECT ub.is_active, b.key FROM user_bounties ub
       JOIN bounties b ON b.id = ub.bounty_id
       WHERE ub.user_id = $1 AND b.key IN ('loyalty_1y', 'loyalty_2y') AND ub.is_active = TRUE`,
      [userId]
    );
    const keys = rows.map(r => r.key);
    if (keys.includes('loyalty_2y') && keys.includes('loyalty_1y')) {
      await pool.query(
        `UPDATE user_bounties SET is_active = FALSE, updated_at = NOW()
         WHERE user_id = $1 AND bounty_id = (SELECT id FROM bounties WHERE key = 'loyalty_1y')`,
        [userId]
      );
    }
  } catch { /* non-critical */ }
}

/* ── Milestones ────────────────────────────────────────────── */

const MILESTONES = [
  { key: 'first_match',      label: 'Erster erfolgreicher Match',       icon: '🎯', check: d => (d.deals?.completed || 0) >= 1 },
  { key: 'matches_10',       label: '10 erfolgreiche Matches',          icon: '🔟', check: d => (d.deals?.completed || 0) >= 10 },
  { key: 'matches_50',       label: '50 erfolgreiche Matches',          icon: '🏆', check: d => (d.deals?.completed || 0) >= 50 },
  { key: 'matches_100',      label: '100 erfolgreiche Matches',         icon: '💎', check: d => (d.deals?.completed || 0) >= 100 },
  { key: 'first_rating',     label: 'Erste Bewertung erhalten',         icon: '⭐', check: d => (d.ratingStats?.total_ratings || 0) >= 1 },
  { key: 'ratings_given_50', label: '50 Bewertungen abgegeben',         icon: '📝', check: d => (d.ratingsGiven || 0) >= 50 },
  { key: 'member_1y',        label: '1 Jahr auf TempConnect',           icon: '🎂', check: d => { if (!d.userCreatedAt) return false; return (Date.now() - new Date(d.userCreatedAt).getTime()) > 365.25*24*60*60*1000; } },
  { key: 'member_2y',        label: '2 Jahre auf TempConnect',          icon: '🏅', check: d => { if (!d.userCreatedAt) return false; return (Date.now() - new Date(d.userCreatedAt).getTime()) > 2*365.25*24*60*60*1000; } },
  { key: 'top_10_pct',       label: 'Top 10% der Plattform',            icon: '👑', check: d => (d.percentileRank || 100) <= 10 },
  { key: 'blitz_response',   label: 'Blitz-Responder (Ø < 30 Min)',     icon: '🚀', check: d => (d.responseStats?.avg_response_minutes || 999) <= 30 && (d.responseStats?.total_received || 0) >= 5 },
];

export async function checkAndAwardMilestones(pool, userId) {
  const data = await gatherUserData(pool, userId);
  const awarded = [];

  for (const m of MILESTONES) {
    if (!m.check(data)) continue;
    try {
      const { rowCount } = await pool.query(
        `INSERT INTO user_milestones (user_id, milestone_key, milestone_label, icon)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, milestone_key) DO NOTHING`,
        [userId, m.key, m.label, m.icon]
      );
      if (rowCount > 0) {
        awarded.push(m);
        // Insert notification
        try {
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, body, link_path, created_at)
             VALUES ($1, 'milestone', $2, $3, '/public/bounties.html', NOW())`,
            [userId, `${m.icon} Meilenstein erreicht!`, m.label]
          );
        } catch { /* notifications table may not exist */ }
      }
    } catch { /* milestone already exists */ }
  }

  return awarded;
}

export async function getUserMilestones(pool, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM user_milestones WHERE user_id = $1 ORDER BY reached_at`, [userId]
  );
  return rows;
}

/* ── Value Report (ROI Dashboard) ──────────────────────────── */

export async function getValueReport(pool, userId) {
  const report = {};

  // Successful matches
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total_matches
       FROM requests WHERE (requester_id = $1 OR receiver_id = $1)
         AND status IN ('FINALIZED','COMPLETED')`, [userId]
    );
    report.total_matches = rows[0]?.total_matches || 0;
  } catch { report.total_matches = 0; }

  // Average fill time (hours from created to finalized)
  try {
    const { rows } = await pool.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::numeric, 1) AS avg_hours
       FROM requests WHERE (requester_id = $1 OR receiver_id = $1)
         AND status IN ('FINALIZED','COMPLETED')`, [userId]
    );
    report.avg_fill_hours = rows[0]?.avg_hours ? Number(rows[0].avg_hours) : null;
  } catch { report.avg_fill_hours = null; }

  // Estimated time saved (assuming manual process = 8h per match)
  const MANUAL_HOURS_PER_MATCH = 8;
  const platformHours = report.avg_fill_hours || 4;
  report.estimated_hours_saved = Math.max(0, Math.round(report.total_matches * (MANUAL_HOURS_PER_MATCH - platformHours)));

  // Member since
  try {
    const { rows } = await pool.query(
      `SELECT created_at FROM users WHERE id = $1`, [userId]
    );
    report.member_since = rows[0]?.created_at || null;
  } catch { report.member_since = null; }

  // This month stats
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE requester_id = $1)::int AS sent_this_month,
         COUNT(*) FILTER (WHERE receiver_id = $1)::int AS received_this_month,
         COUNT(*) FILTER (WHERE status IN ('FINALIZED','COMPLETED'))::int AS matched_this_month
       FROM requests
       WHERE (requester_id = $1 OR receiver_id = $1)
         AND created_at >= date_trunc('month', NOW())`, [userId]
    );
    report.this_month = rows[0] || {};
  } catch { report.this_month = {}; }

  // Bounty discount
  report.bounty_discount_pct = await getUserDiscount(pool, userId);

  return report;
}

/* ── Full Bounty Status (catalog + user progress) ──────────── */

export async function getBountyStatus(pool, userId) {
  const catalog = await getBountyCatalog(pool);
  const userBounties = await getUserBounties(pool, userId);
  const discount = await getUserDiscount(pool, userId);

  // Tier evaluation + promotion
  let tier = null;
  try {
    await evaluateAndPromoteTier(pool, userId);
    tier = await getUserTier(pool, userId);
  } catch { /* tier tables may not exist */ }

  const maxPct = tier ? Number(tier.max_discount_pct) : FALLBACK_MAX_DISCOUNT_PCT;

  const userMap = new Map();
  for (const ub of userBounties) {
    userMap.set(ub.key, ub);
  }

  const items = catalog.map(b => {
    const ub = userMap.get(b.key);
    let status = 'locked';
    if (ub?.is_active) status = 'earned';
    else if (ub && Number(ub.progress) > 0) status = 'in_progress';

    return {
      key: b.key,
      name_de: b.name_de,
      description_de: b.description_de,
      category: b.category,
      icon: b.icon,
      discount_pct: Number(b.discount_pct),
      is_recurring: b.is_recurring,
      status,
      progress: ub ? Number(ub.progress) : 0,
      earned_at: ub?.earned_at || null
    };
  });

  return {
    items,
    total_discount_pct: discount,
    max_discount_pct: maxPct,
    tier: tier ? {
      key: tier.tier_key,
      name_de: tier.name_de,
      icon: tier.icon,
      color: tier.color,
      bg_color: tier.bg_color,
      max_discount_pct: Number(tier.max_discount_pct)
    } : null
  };
}
