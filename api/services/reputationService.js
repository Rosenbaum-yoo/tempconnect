/**
 * Supplier Reputation Service.
 * Aggregates rating data into the supplier_reputation table for fast lookups.
 * Grades: UNRATED → BRONZE → SILVER → GOLD → PLATINUM.
 */

function computeGrade(totalRatings, avgStars, completedDeals) {
  if (totalRatings === 0) return 'UNRATED';
  if (avgStars >= 4.5 && totalRatings >= 10 && completedDeals >= 15) return 'PLATINUM';
  if (avgStars >= 4.0 && totalRatings >= 5 && completedDeals >= 8) return 'GOLD';
  if (avgStars >= 3.5 && totalRatings >= 3 && completedDeals >= 3) return 'SILVER';
  return 'BRONZE';
}

/* ── Recompute for a single supplier ──────────────────── */

/**
 * @param {import('pg').Pool} pool
 * @param {string} supplierId - user id
 */
export async function recomputeReputation(pool, supplierId) {
  // Aggregate from ratings
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

  // Completed deals
  const { rows: dealRows } = await pool.query(
    `SELECT COUNT(*)::int AS completed_deals
     FROM requests
     WHERE receiver_id = $1 AND status IN ('FINALIZED', 'COMPLETED')`,
    [supplierId]
  );

  const totalRatings = r.total_ratings || 0;
  const avgStars = r.avg_stars != null ? Number(r.avg_stars) : 0;
  const completedDeals = dealRows[0]?.completed_deals || 0;
  const grade = computeGrade(totalRatings, avgStars, completedDeals);

  const { rows: upserted } = await pool.query(
    `INSERT INTO supplier_reputation
     (supplier_id, total_ratings, avg_stars, avg_reliability, avg_communication, avg_quality,
      completed_deals, grade, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (supplier_id) DO UPDATE SET
       total_ratings = EXCLUDED.total_ratings,
       avg_stars = EXCLUDED.avg_stars,
       avg_reliability = EXCLUDED.avg_reliability,
       avg_communication = EXCLUDED.avg_communication,
       avg_quality = EXCLUDED.avg_quality,
       completed_deals = EXCLUDED.completed_deals,
       grade = EXCLUDED.grade,
       updated_at = NOW()
     RETURNING *`,
    [
      supplierId, totalRatings,
      avgStars,
      r.avg_reliability != null ? Number(r.avg_reliability) : 0,
      r.avg_communication != null ? Number(r.avg_communication) : 0,
      r.avg_quality != null ? Number(r.avg_quality) : 0,
      completedDeals, grade
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
