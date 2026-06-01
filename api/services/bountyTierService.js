/**
 * Bounty Tier Service — Status-Abzeichen Bronze bis Diamant.
 *
 * Tiers:
 *   Bronze   (max  8%) — 1+ Bounty, sofort
 *   Silber   (max 10%) — 3+ Bounties, 3+ Monate Abo
 *   Gold     (max 15%) — 5+ Bounties, 6+ Monate, 10+ Deals
 *   Platin   (max 20%) — 8+ Bounties, 18+ Monate, 50+ Deals, Ø 4.2+ Rating
 *   Diamant  (max 25%) — 10+ Bounties, 60+ Monate (5 Jahre!), 100+ Deals,
 *                         Ø 4.5+ Rating, 0 Beschwerden 12M, Top 10%
 */

// ── Tier Definitions (fallback if DB not available) ─────────
const TIER_FALLBACK = [
  { key: "bronze",   name_de: "Bronze",   icon: "🥉", color: "#cd7f32", bg_color: "rgba(205,127,50,.12)",  sort_order: 1, max_discount_pct: 8,  conditions: { min_bounties: 1, min_months: 0 } },
  { key: "silver",   name_de: "Silber",   icon: "🥈", color: "#c0c0c0", bg_color: "rgba(192,192,192,.12)", sort_order: 2, max_discount_pct: 10, conditions: { min_bounties: 3, min_months: 3 } },
  { key: "gold",     name_de: "Gold",     icon: "🥇", color: "#ffd700", bg_color: "rgba(255,215,0,.12)",   sort_order: 3, max_discount_pct: 15, conditions: { min_bounties: 5, min_months: 6, min_deals: 10 } },
  { key: "platinum", name_de: "Platin",   icon: "💠", color: "#e5e4e2", bg_color: "rgba(229,228,226,.15)", sort_order: 4, max_discount_pct: 20, conditions: { min_bounties: 8, min_months: 18, min_deals: 50, min_avg_rating: 4.2 } },
  { key: "diamond",  name_de: "Diamant",  icon: "💎", color: "#b9f2ff", bg_color: "rgba(185,242,255,.15)", sort_order: 5, max_discount_pct: 25, conditions: { min_bounties: 10, min_months: 60, min_deals: 100, min_avg_rating: 4.5, zero_complaints_12m: true, top_10_pct: true } }
];

/** Load tier definitions from DB (with fallback). */
export async function getTierDefinitions(pool) {
  try {
    const { rows } = await pool.query("SELECT * FROM bounty_tiers ORDER BY sort_order");
    if (rows.length > 0) return rows.map(r => ({ ...r, conditions: r.conditions || {} }));
  } catch { /* table may not exist yet */ }
  return TIER_FALLBACK;
}

/** Get user's current tier from DB. */
export async function getUserTier(pool, userId) {
  try {
    const { rows } = await pool.query(
      `SELECT ubt.*, bt.name_de, bt.icon, bt.color, bt.bg_color, bt.max_discount_pct, bt.sort_order, bt.conditions
       FROM user_bounty_tiers ubt
       JOIN bounty_tiers bt ON bt.key = ubt.tier_key
       WHERE ubt.user_id = $1`,
      [userId]
    );
    if (rows.length > 0) return rows[0];
  } catch { /* table may not exist */ }
  return null;
}

/** Get user's current tier max discount (for capping). Returns 8 if no tier. */
export async function getUserMaxDiscount(pool, userId) {
  const tier = await getUserTier(pool, userId);
  return tier ? Number(tier.max_discount_pct) : 8;
}

/**
 * Evaluate and promote user tier based on live data.
 * Called after evaluateBounties().
 */
export async function evaluateAndPromoteTier(pool, userId) {
  const tiers = await getTierDefinitions(pool);
  const userData = await gatherTierData(pool, userId);

  // Find highest qualifying tier (iterate from top to bottom)
  let qualifiedTier = null;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (checkTierConditions(tiers[i], userData)) {
      qualifiedTier = tiers[i];
      break;
    }
  }

  if (!qualifiedTier) return null; // No tier earned yet

  // Upsert user tier
  try {
    const { rows } = await pool.query(
      `INSERT INTO user_bounty_tiers (user_id, tier_key, promoted_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         tier_key = EXCLUDED.tier_key,
         promoted_at = CASE WHEN user_bounty_tiers.tier_key != EXCLUDED.tier_key THEN NOW() ELSE user_bounty_tiers.promoted_at END,
         updated_at = NOW()
       RETURNING *`,
      [userId, qualifiedTier.key]
    );
    return {
      tier_key: qualifiedTier.key,
      name_de: qualifiedTier.name_de,
      icon: qualifiedTier.icon,
      color: qualifiedTier.color,
      bg_color: qualifiedTier.bg_color,
      max_discount_pct: Number(qualifiedTier.max_discount_pct),
      sort_order: qualifiedTier.sort_order,
      promoted_at: rows[0]?.promoted_at
    };
  } catch { return null; }
}

/** Gather data needed for tier evaluation. */
async function gatherTierData(pool, userId) {
  const data = { earnedBounties: 0, subMonths: 0, completedDeals: 0, avgRating: 0, canceledDeals: 0, percentileRank: 100 };

  // Earned bounties count
  try {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM user_bounties WHERE user_id = $1 AND is_active = TRUE",
      [userId]
    );
    data.earnedBounties = rows[0]?.count || 0;
  } catch { /* ignore */ }

  // Subscription age in months
  try {
    const { rows } = await pool.query(
      `SELECT MIN(created_at) AS first_sub FROM subscriptions WHERE user_id = $1 AND plan != 'DEMO'`,
      [userId]
    );
    if (rows[0]?.first_sub) {
      data.subMonths = Math.floor((Date.now() - new Date(rows[0].first_sub).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    }
  } catch { /* ignore */ }

  // Deal counts
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('FINALIZED','COMPLETED'))::int AS completed,
         COUNT(*) FILTER (WHERE status = 'CANCELED')::int AS canceled
       FROM requests WHERE receiver_id = $1`,
      [userId]
    );
    data.completedDeals = rows[0]?.completed || 0;
    data.canceledDeals = rows[0]?.canceled || 0;
  } catch { /* ignore */ }

  // Average rating
  try {
    const { rows } = await pool.query(
      "SELECT ROUND(AVG(reliability)::numeric, 2) AS avg FROM ratings WHERE rated_id = $1",
      [userId]
    );
    data.avgRating = Number(rows[0]?.avg || 0);
  } catch { /* ignore */ }

  // Percentile rank
  try {
    const { rows: totalRows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM supplier_reputation WHERE grade != 'UNRATED'"
    );
    const total = totalRows[0]?.total || 0;
    if (total > 0) {
      const { rows: repRows } = await pool.query(
        "SELECT reputation_score FROM supplier_reputation WHERE supplier_id = $1",
        [userId]
      );
      if (repRows[0]) {
        const { rows: rankRows } = await pool.query(
          "SELECT COUNT(*)::int AS rank FROM supplier_reputation WHERE reputation_score >= $1 AND grade != 'UNRATED'",
          [repRows[0].reputation_score || 0]
        );
        data.percentileRank = Math.round(((rankRows[0]?.rank || total) / total) * 100);
      }
    }
  } catch { /* ignore */ }

  return data;
}

/** Check if user qualifies for a specific tier. */
function checkTierConditions(tier, data) {
  const c = tier.conditions || {};

  if (c.min_bounties && data.earnedBounties < c.min_bounties) return false;
  if (c.min_months && data.subMonths < c.min_months) return false;
  if (c.min_deals && data.completedDeals < c.min_deals) return false;
  if (c.min_avg_rating && data.avgRating < c.min_avg_rating) return false;
  if (c.zero_complaints_12m && data.canceledDeals > 0) return false;
  if (c.top_10_pct && data.percentileRank > 10) return false;

  return true;
}

/**
 * Full tier status for API response.
 * Returns current tier + all tiers with progress indication.
 */
export async function getTierStatus(pool, userId) {
  const tiers = await getTierDefinitions(pool);
  const currentTier = await getUserTier(pool, userId);
  const userData = await gatherTierData(pool, userId);

  const tierList = tiers.map(t => {
    const c = t.conditions || {};
    const qualified = checkTierConditions(t, userData);
    const isCurrent = currentTier && currentTier.tier_key === t.key;

    // Calculate progress towards this tier
    const checks = [];
    if (c.min_bounties) checks.push({ label: c.min_bounties + " Bounties", current: userData.earnedBounties, needed: c.min_bounties, done: userData.earnedBounties >= c.min_bounties });
    if (c.min_months) checks.push({ label: c.min_months + " Monate Abo", current: userData.subMonths, needed: c.min_months, done: userData.subMonths >= c.min_months });
    if (c.min_deals) checks.push({ label: c.min_deals + " Deals", current: userData.completedDeals, needed: c.min_deals, done: userData.completedDeals >= c.min_deals });
    if (c.min_avg_rating) checks.push({ label: "Ø " + c.min_avg_rating + " Rating", current: userData.avgRating, needed: c.min_avg_rating, done: userData.avgRating >= c.min_avg_rating });
    if (c.zero_complaints_12m) checks.push({ label: "0 Beschwerden (12M)", current: userData.canceledDeals, needed: 0, done: userData.canceledDeals === 0 });
    if (c.top_10_pct) checks.push({ label: "Top 10%", current: userData.percentileRank, needed: 10, done: userData.percentileRank <= 10 });

    return {
      key: t.key,
      name_de: t.name_de,
      icon: t.icon,
      color: t.color,
      bg_color: t.bg_color,
      max_discount_pct: Number(t.max_discount_pct),
      sort_order: t.sort_order,
      qualified,
      is_current: isCurrent,
      checks
    };
  });

  return {
    current: currentTier ? {
      tier_key: currentTier.tier_key,
      name_de: currentTier.name_de,
      icon: currentTier.icon,
      color: currentTier.color,
      bg_color: currentTier.bg_color,
      max_discount_pct: Number(currentTier.max_discount_pct),
      promoted_at: currentTier.promoted_at
    } : null,
    tiers: tierList,
    user_stats: {
      earned_bounties: userData.earnedBounties,
      sub_months: userData.subMonths,
      completed_deals: userData.completedDeals,
      avg_rating: userData.avgRating
    }
  };
}
