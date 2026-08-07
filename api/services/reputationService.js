/**
 * Supplier Reputation Service.
 * Aggregates rating data into the supplier_reputation table for fast lookups.
 * Grades: UNRATED → BRONZE → SILVER → GOLD → PLATINUM.
 *
 * Pure-logic functions (no DB, fully unit-testable):
 *   computeGrade, computeResponseTimeScore,
 *   computeReputationScore, computeDealSuccessRate,
 *   computeActivityScore, computeScoreGrade, computeRankingScore,
 *   computePremiumBoost, computeEffectiveRankScore
 */

/* ── Legacy Grade (ratings + deals count based) ──────── */

export function computeGrade(totalRatings, avgStars, completedDeals) {
  if (totalRatings === 0) return 'UNRATED';
  if (avgStars >= 4.5 && totalRatings >= 10 && completedDeals >= 15) return 'PLATINUM';
  if (avgStars >= 4.0 && totalRatings >= 5 && completedDeals >= 8) return 'GOLD';
  if (avgStars >= 3.5 && totalRatings >= 3 && completedDeals >= 3) return 'SILVER';
  return 'BRONZE';
}

/**
 * Compute response_time_score from average response hours.
 * Scale: <1h → 100, <4h → 75, <12h → 50, <24h → 25, >24h → 10, null → null.
 */
export function computeResponseTimeScore(avgHours) {
  if (avgHours == null) return null;
  const h = Number(avgHours);
  if (h < 1) return 100;
  if (h < 4) return 75;
  if (h < 12) return 50;
  if (h < 24) return 25;
  return 10;
}

/* ── Reputation Score (composite 0-100) ──────────────── */

/**
 * Composite reputation score.
 * Formula: avg_stars_pct * 0.5 + deal_success_rate * 0.3 + response_time_score * 0.2
 *
 * avg_stars is on 1-5 scale → normalized to 0-100: ((stars - 1) / 4) * 100
 * deal_success_rate and response_time_score are already 0-100.
 * Null inputs are treated as 0.
 *
 * @param {number|null} avgStars - 1.0 to 5.0
 * @param {number|null} dealSuccessRate - 0 to 100
 * @param {number|null} responseTimeScore - 0 to 100
 * @returns {number} 0 to 100, rounded to 2 decimals
 */
export function computeReputationScore(avgStars, dealSuccessRate, responseTimeScore) {
  const starsPct = avgStars != null && Number(avgStars) > 0
    ? Math.min(100, Math.max(0, ((Number(avgStars) - 1) / 4) * 100))
    : 0;
  const dsr = dealSuccessRate != null ? Math.min(100, Math.max(0, Number(dealSuccessRate))) : 0;
  const rts = responseTimeScore != null ? Math.min(100, Math.max(0, Number(responseTimeScore))) : 0;

  const raw = starsPct * 0.5 + dsr * 0.3 + rts * 0.2;
  return Math.round(raw * 100) / 100;
}

/* ── Deal Success Rate ───────────────────────────────── */

/**
 * Percentage of successfully completed deals.
 * Returns null when total < 3 (insufficient data for meaningful rate).
 *
 * @param {number} completedDeals - FINALIZED + COMPLETED
 * @param {number} totalDeals - completed + cancelled + declined
 * @returns {number|null} 0 to 100 or null
 */
export function computeDealSuccessRate(completedDeals, totalDeals) {
  const c = Number(completedDeals) || 0;
  const t = Number(totalDeals) || 0;
  if (t < 3) return null;
  return Math.round((c / t) * 10000) / 100;
}

/* ── Activity Score ──────────────────────────────────── */

/**
 * Activity index 0-100.
 * activeListings: 0-50 pts (1 listing = 10pts, capped at 50)
 * responseRate90d: 0-50 pts (percentage of responded requests, scaled to 50)
 *
 * @param {number} activeListings - count of active capacity_posts
 * @param {number} responseRate90d - 0 to 100 (percentage of requests responded to)
 * @returns {number} 0 to 100
 */
export function computeActivityScore(activeListings, responseRate90d) {
  const listings = Number(activeListings) || 0;
  const listingPts = Math.min(50, listings * 10);

  const rate = Number(responseRate90d) || 0;
  const ratePts = Math.min(50, Math.round((Math.min(100, rate) / 100) * 50));

  return listingPts + ratePts;
}

/* ── Score-Based Grade ───────────────────────────────── */

/**
 * Grade derived from reputation_score (0-100).
 * 90+ = PLATINUM, 80+ = GOLD, 70+ = SILVER, 60+ = BRONZE, <60 = UNRATED
 *
 * @param {number|null} reputationScore
 * @returns {string}
 */
export function computeScoreGrade(reputationScore) {
  const s = Number(reputationScore) || 0;
  if (s >= 90) return 'PLATINUM';
  if (s >= 80) return 'GOLD';
  if (s >= 70) return 'SILVER';
  if (s >= 60) return 'BRONZE';
  return 'UNRATED';
}

/* ── Composite Ranking Score ─────────────────────────── */

/**
 * Pre-aggregated ranking score for feed sorting.
 * Weights: reputation 30%, response_time 15%, deal_success 15%, activity 10%,
 *          match_quality placeholder 20% (applied at query-time), premium 10%.
 *
 * Since match_quality and premium_boost are context-dependent, the stored
 * ranking_score covers the static 70% (reputation + response + deal_success + activity).
 * browseFeed() adds dynamic boosts on top.
 *
 * @param {{ reputationScore, responseTimeScore, dealSuccessRate, activityScore }} factors
 * @returns {number} 0 to 70 (static portion)
 */
export function computeRankingScore(factors) {
  const rep = Number(factors.reputationScore) || 0;
  const rts = Number(factors.responseTimeScore) || 0;
  const dsr = Number(factors.dealSuccessRate) || 0;
  const act = Number(factors.activityScore) || 0;

  const raw = rep * 0.30 + rts * 0.15 + dsr * 0.15 + act * 0.10;
  return Math.round(raw * 100) / 100;
}

/* ── Premium Boost (with anti-spam) ──────────────────── */

/**
 * Compute premium boost points based on subscription plan.
 * Anti-spam: boost is reduced for suppliers with poor reputation.
 *   reputationScore < 20 → boost quartered (÷4)
 *   reputationScore < 40 → boost halved (÷2)
 *
 * Spec values: ENTERPRISE=20, PRO=10, PLUS=5, BASIS/FREE=0
 *
 * @param {string} plan - Subscription plan name
 * @param {number|null} reputationScore - 0 to 100 (from computeReputationScore)
 * @returns {number} 0 to 20
 */
export function computePremiumBoost(plan, reputationScore) {
  const BASE_BOOST = { ENTERPRISE: 20, PRO: 10, PLUS: 5 };
  const base = BASE_BOOST[String(plan).toUpperCase()] || 0;
  if (base === 0) return 0;

  const rep = Number(reputationScore) || 0;
  if (rep < 20) return Math.round(base / 4);
  if (rep < 40) return Math.round(base / 2);
  return base;
}

/* ── Effective Rank Score (capped composite) ─────────── */

/**
 * Combine all ranking factors into a single score, capped at 100.
 *
 * @param {number} staticScore - Pre-aggregated ranking_score (0-70)
 * @param {number} recencyBoost - 0-15
 * @param {number} premiumBoost - 0-20
 * @param {number} priorityBoost - 0-5
 * @returns {number} 0 to 100
 */
export function computeEffectiveRankScore(staticScore, recencyBoost, premiumBoost, priorityBoost) {
  const raw = (Number(staticScore) || 0)
            + (Number(recencyBoost) || 0)
            + (Number(premiumBoost) || 0)
            + (Number(priorityBoost) || 0);
  return Math.min(100, Math.round(raw * 100) / 100);
}

/* ── Timesheet Reliability Score ──────────────────────── */

/**
 * Berechnet Zuverlässigkeit anhand Timesheet-Einreichungen.
 * approved / (approved + rejected) * 100, gewichtet mit Volumen-Faktor.
 * Mindestens 3 Timesheets nötig, sonst null.
 *
 * @param {number} approvedCount
 * @param {number} rejectedCount
 * @returns {number|null} 0 to 100 or null
 */
export function computeTimesheetReliabilityScore(approvedCount, rejectedCount) {
  const a = Number(approvedCount) || 0;
  const r = Number(rejectedCount) || 0;
  const total = a + r;
  if (total < 3) return null;
  return Math.round((a / total) * 10000) / 100;
}

/* ── Grade Labels (DE) ───────────────────────────────── */

const GRADE_LABELS = {
  PLATINUM: 'Platin',
  GOLD:     'Gold',
  SILVER:   'Silber',
  BRONZE:   'Bronze',
  UNRATED:  'Nicht bewertet'
};

const GRADE_COLORS = {
  PLATINUM: '#A78BFA',
  GOLD:     '#F59E0B',
  SILVER:   '#94A3B8',
  BRONZE:   '#CD7F32',
  UNRATED:  '#6B7280'
};

/**
 * Menschenlesbare Bezeichnung für Response-Time-Score.
 * @param {number|null} score 0-100
 * @returns {string}
 */
function responseTimeLabel(score) {
  if (score == null) return 'Keine Daten';
  if (score >= 100) return 'Blitzschnell (< 1h)';
  if (score >= 75) return 'Sehr schnell (< 4h)';
  if (score >= 50) return 'Schnell (< 12h)';
  if (score >= 25) return 'Normal (< 24h)';
  return 'Langsam (> 24h)';
}

/* ── Public Reputation Card ──────────────────────────── */

/**
 * Erstellt eine display-ready Reputation Card für ein Supplier-Profil.
 * Enthält Grade-Badge, Score, Signale mit Labels und Farben.
 *
 * @param {import('pg').Pool} pool
 * @param {string} supplierId
 * @returns {Promise<Object|null>}
 */
export async function getPublicReputationCard(pool, supplierId) {
  const rep = await getReputation(pool, supplierId);
  if (!rep) return null;

  // Member since
  let memberSince = null;
  let verified = false;
  try {
    const { rows } = await pool.query(
      `SELECT created_at, is_verified FROM users WHERE id = $1`,
      [supplierId]
    );
    memberSince = rows[0]?.created_at || null;
    verified = !!rows[0]?.is_verified;
  } catch { /* users table shape may vary */ }

  const grade = rep.grade || 'UNRATED';

  const signals = [];

  // Signal 1: Sternebewertung
  signals.push({
    key: 'stars',
    label: 'Bewertung',
    value: rep.avg_stars != null ? Number(rep.avg_stars) : null,
    display: rep.avg_stars != null ? `${Number(rep.avg_stars).toFixed(1)} ★` : 'Noch keine',
    detail: rep.total_ratings > 0 ? `${rep.total_ratings} Bewertungen` : null,
    max: 5
  });

  // Signal 2: Deal-Erfolgsquote
  signals.push({
    key: 'deal_success',
    label: 'Zuverlässigkeit',
    value: rep.deal_success_rate != null ? Number(rep.deal_success_rate) : null,
    display: rep.deal_success_rate != null ? `${Number(rep.deal_success_rate).toFixed(0)}%` : 'Zu wenig Daten',
    detail: rep.total_deals > 0 ? `${rep.completed_deals}/${rep.total_deals} Deals` : null,
    max: 100
  });

  // Signal 3: Reaktionszeit
  const rts = rep.response_time_score != null ? Number(rep.response_time_score) : null;
  signals.push({
    key: 'response_time',
    label: 'Reaktionszeit',
    value: rts,
    display: responseTimeLabel(rts),
    detail: null,
    max: 100
  });

  // Signal 4: Aktivität
  const act = rep.activity_score != null ? Number(rep.activity_score) : null;
  signals.push({
    key: 'activity',
    label: 'Aktivität',
    value: act,
    display: act != null ? (act >= 70 ? 'Sehr aktiv' : act >= 40 ? 'Aktiv' : act >= 10 ? 'Gelegentlich' : 'Wenig aktiv') : 'Keine Daten',
    detail: null,
    max: 100
  });

  // Signal 5: Timesheet-Zuverlässigkeit
  const tsRel = rep.timesheet_reliability_score != null ? Number(rep.timesheet_reliability_score) : null;
  signals.push({
    key: 'timesheet_reliability',
    label: 'Stundenzettel-Zuverlässigkeit',
    value: tsRel,
    display: tsRel != null ? `${tsRel.toFixed(0)}%` : 'Keine Daten',
    detail: null,
    max: 100
  });

  return {
    supplier_id: supplierId,
    supplier_name: rep.supplier_name || null,
    grade,
    grade_label: GRADE_LABELS[grade] || grade,
    badge_color: GRADE_COLORS[grade] || GRADE_COLORS.UNRATED,
    reputation_score: rep.reputation_score != null ? Number(rep.reputation_score) : null,
    ranking_score: rep.ranking_score != null ? Number(rep.ranking_score) : null,
    signals,
    member_since: memberSince,
    verified,
    updated_at: rep.updated_at
  };
}

/* ── Reputation Badges for Batch Enrichment ───────────── */

/**
 * Lädt Reputation-Badges für eine Liste von Supplier-IDs.
 * Für Marketplace-Enrichment (capacity_posts, offers, matching).
 *
 * @param {import('pg').Pool} pool
 * @param {string[]} supplierIds
 * @returns {Promise<Map<string, {grade, grade_label, badge_color, reputation_score, avg_stars, total_ratings}>>}
 */
export async function getBadgesForSuppliers(pool, supplierIds) {
  if (!supplierIds?.length) return new Map();
  try {
    const { rows } = await pool.query(
      `SELECT supplier_id, grade, reputation_score, avg_stars, total_ratings
       FROM supplier_reputation
       WHERE supplier_id = ANY($1)`,
      [supplierIds]
    );
    const map = new Map();
    for (const r of rows) {
      const g = r.grade || 'UNRATED';
      map.set(r.supplier_id, {
        grade: g,
        grade_label: GRADE_LABELS[g] || g,
        badge_color: GRADE_COLORS[g] || GRADE_COLORS.UNRATED,
        reputation_score: r.reputation_score != null ? Number(r.reputation_score) : null,
        avg_stars: r.avg_stars != null ? Number(r.avg_stars) : null,
        total_ratings: r.total_ratings || 0
      });
    }
    return map;
  } catch { return new Map(); }
}

/* ── Recompute for a single supplier ──────────────────── */

/**
 * @param {import('pg').Pool} pool
 * @param {string} supplierId - user id
 */
export async function recomputeReputation(pool, supplierId) {
  // ── 1. Aggregate from ratings ──
  const { rows: ratingRows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_ratings,
       ROUND(AVG(stars)::numeric, 2) AS avg_stars,
       ROUND(AVG(reliability)::numeric, 2) AS avg_reliability,
       ROUND(AVG(communication)::numeric, 2) AS avg_communication,
       ROUND(AVG(quality)::numeric, 2) AS avg_quality
     FROM ratings
     WHERE rated_id = $1`,
    [supplierId]
  );
  const r = ratingRows[0];

  // ── 2. Deal counts (success + total for deal_success_rate) ──
  const { rows: dealRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('FINALIZED','COMPLETED'))::int AS completed_deals,
       COUNT(*) FILTER (WHERE status IN ('FINALIZED','COMPLETED','CANCELED','DECLINED'))::int AS total_deals
     FROM requests
     WHERE receiver_id = $1`,
    [supplierId]
  );

  const totalRatings = r.total_ratings || 0;
  const avgStars = r.avg_stars != null ? Number(r.avg_stars) : 0;
  const completedDeals = dealRows[0]?.completed_deals || 0;
  const totalDeals = dealRows[0]?.total_deals || 0;
  const legacyGrade = computeGrade(totalRatings, avgStars, completedDeals);

  // ── 3. Response time score (last 90 days) ──
  const { rows: speedRows } = await pool.query(
    `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (r.updated_at - r.created_at)) / 3600), 1) AS avg_response_hours
     FROM requests r
     WHERE r.receiver_id = $1
       AND r.status NOT IN ('SENT','CREATED')
       AND r.created_at >= NOW() - INTERVAL '90 days'`,
    [supplierId]
  );
  const avgResponseHours = speedRows[0]?.avg_response_hours ?? null;
  const responseTimeScore = computeResponseTimeScore(avgResponseHours);

  // ── 4. Activity score: active listings + response rate (90d) ──
  let activeListings = 0;
  let responseRate90d = 0;
  try {
    const { rows: actRows } = await pool.query(
      `SELECT COUNT(*)::int AS active_listings
       FROM capacity_posts
       WHERE supplier_company_id = $1 AND status = 'active'`,
      [supplierId]
    );
    activeListings = actRows[0]?.active_listings || 0;

    const { rows: respRows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_received,
         COUNT(*) FILTER (WHERE status NOT IN ('SENT','CREATED'))::int AS responded
       FROM requests
       WHERE receiver_id = $1
         AND created_at >= NOW() - INTERVAL '90 days'`,
      [supplierId]
    );
    const totalReceived = respRows[0]?.total_received || 0;
    const responded = respRows[0]?.responded || 0;
    responseRate90d = totalReceived > 0 ? (responded / totalReceived) * 100 : 0;
  } catch { /* capacity_posts table may not exist in test environments */ }

  // ── 4b. Timesheet reliability (last 12 months) ──
  let tsReliabilityScore = null;
  try {
    const { rows: tsRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
         COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
       FROM timesheets
       WHERE supplier_org_id = $1
         AND created_at >= NOW() - INTERVAL '12 months'`,
      [supplierId]
    );
    const tsApproved = tsRows[0]?.approved || 0;
    const tsRejected = tsRows[0]?.rejected || 0;
    tsReliabilityScore = computeTimesheetReliabilityScore(tsApproved, tsRejected);
  } catch { /* timesheets table may not exist in test environments */ }

  // ── 5. Compute derived scores ──
  // P8 Welle B: `deal_reliability` ist die Quelle der Wahrheit fuer
  // `deal_success_rate`; diese Tabelle spiegelt sie nur (siehe Migration 164).
  // Der Legacy-Wert unten rechnet aus `requests` — einem Pfad, der neben dem
  // heutigen Angebots-/Agreement-Flow laeuft. Ohne diesen Vorrang wuerde ein
  // spaeterer Aufrufer von `recomputeReputation` die frisch gerechnete Quote
  // still mit einer aelteren Wahrheit ueberschreiben.
  let dealSuccessRate = computeDealSuccessRate(completedDeals, totalDeals);
  try {
    const { rows: relRows } = await pool.query(
      `SELECT reliability_rate FROM deal_reliability
        WHERE party_user_id = $1 AND party_side = 'agency'`,
      [supplierId]
    );
    if (relRows.length > 0) {
      dealSuccessRate = relRows[0].reliability_rate != null
        ? Number(relRows[0].reliability_rate)
        : null;
    }
  } catch { /* Migration 164 noch nicht eingespielt — Legacy-Wert bleibt */ }
  const activityScore = computeActivityScore(activeListings, responseRate90d);
  const reputationScore = computeReputationScore(avgStars, dealSuccessRate, responseTimeScore);
  const scoreGrade = computeScoreGrade(reputationScore);
  // Use score-based grade when reputation data is sufficient, otherwise fall back to legacy
  const grade = totalRatings > 0 || totalDeals >= 3 ? scoreGrade : legacyGrade;
  const rankingScore = computeRankingScore({
    reputationScore,
    responseTimeScore: responseTimeScore ?? 0,
    dealSuccessRate: dealSuccessRate ?? 0,
    activityScore
  });

  // ── 6. Upsert ──
  const { rows: upserted } = await pool.query(
    `INSERT INTO supplier_reputation
     (supplier_id, total_ratings, avg_stars, avg_reliability, avg_communication, avg_quality,
      completed_deals, grade, response_time_score,
      reputation_score, deal_success_rate, total_deals, activity_score, ranking_score,
      timesheet_reliability_score,
      updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
     ON CONFLICT (supplier_id) DO UPDATE SET
       total_ratings = EXCLUDED.total_ratings,
       avg_stars = EXCLUDED.avg_stars,
       avg_reliability = EXCLUDED.avg_reliability,
       avg_communication = EXCLUDED.avg_communication,
       avg_quality = EXCLUDED.avg_quality,
       completed_deals = EXCLUDED.completed_deals,
       grade = EXCLUDED.grade,
       response_time_score = EXCLUDED.response_time_score,
       reputation_score = EXCLUDED.reputation_score,
       deal_success_rate = EXCLUDED.deal_success_rate,
       total_deals = EXCLUDED.total_deals,
       activity_score = EXCLUDED.activity_score,
       ranking_score = EXCLUDED.ranking_score,
       timesheet_reliability_score = EXCLUDED.timesheet_reliability_score,
       updated_at = NOW()
     RETURNING *`,
    [
      supplierId, totalRatings,
      avgStars,
      r.avg_reliability != null ? Number(r.avg_reliability) : 0,
      r.avg_communication != null ? Number(r.avg_communication) : 0,
      r.avg_quality != null ? Number(r.avg_quality) : 0,
      completedDeals, grade, responseTimeScore,
      reputationScore, dealSuccessRate, totalDeals, activityScore, rankingScore,
      tsReliabilityScore
    ]
  );
  return upserted[0];
}

/* ── Get Reputation ───────────────────────────────────── */

export async function getReputation(pool, supplierId) {
  const { rows } = await pool.query(
    `SELECT sr.*, u.company_name AS supplier_name
     FROM supplier_reputation sr
     JOIN users u ON u.id = sr.supplier_id
     WHERE sr.supplier_id = $1`,
    [supplierId]
  );
  return rows[0] || null;
}

/* ── Batch Recompute ──────────────────────────────────── */

/**
 * Recompute reputation for all suppliers with recent ratings or deals.
 * Intended for periodic background processing.
 */
export async function batchRecompute(pool, limit = 100) {
  // Find suppliers with ratings updated recently or not yet computed
  const { rows: suppliers } = await pool.query(
    `SELECT DISTINCT rated_id AS supplier_id
     FROM ratings
     WHERE created_at > (
       SELECT COALESCE(MAX(updated_at), '2000-01-01') FROM supplier_reputation
     )
     UNION
     SELECT DISTINCT receiver_id AS supplier_id
     FROM requests
     WHERE status IN ('FINALIZED','COMPLETED')
       AND updated_at > (
         SELECT COALESCE(MAX(updated_at), '2000-01-01') FROM supplier_reputation
       )
     LIMIT $1`,
    [limit]
  );

  let updated = 0;
  for (const { supplier_id } of suppliers) {
    await recomputeReputation(pool, supplier_id);
    updated++;
  }
  return { updated };
}

/* ── Top Suppliers by Reputation ──────────────────────── */

export async function topSuppliers(pool, limit = 20) {
  const { rows } = await pool.query(
    `SELECT sr.*, u.company_name AS supplier_name
     FROM supplier_reputation sr
     JOIN users u ON u.id = sr.supplier_id
     WHERE sr.grade != 'UNRATED'
     ORDER BY
       CASE sr.grade WHEN 'PLATINUM' THEN 1 WHEN 'GOLD' THEN 2 WHEN 'SILVER' THEN 3 ELSE 4 END,
       sr.avg_stars DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}
