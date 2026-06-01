/**
 * Platform metrics service — aggregated KPIs for the admin dashboard.
 * All queries are read-only and use COUNT/SUM aggregations.
 */

/**
 * Returns a snapshot of key platform metrics.
 * @param {import('pg').Pool} pool
 * @returns {Promise<Object>}
 */
export async function getMetrics(pool) {
  const ts = new Date().toISOString();
  const [users, listings, requests, subscriptions, ratings, capacities, audit] = await Promise.all([
    userMetrics(pool),
    listingMetrics(pool),
    requestMetrics(pool),
    subscriptionMetrics(pool),
    ratingMetrics(pool),
    capacityMetrics(pool),
    auditMetrics(pool)
  ]);

  return { ts, users, listings, requests, subscriptions, ratings, capacities, audit };
}

/* ── Individual metric collectors ─────────────────────── */

async function userMetrics(pool) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE role = 'company') AS companies,
      COUNT(*) FILTER (WHERE role = 'agency') AS agencies,
      COUNT(*) FILTER (WHERE is_verified = TRUE) AS verified,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_7d
    FROM users
  `);
  return asNumbers(rows[0]);
}

async function listingMetrics(pool) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_active = TRUE) AS active,
      COUNT(*) FILTER (WHERE type = 'supply') AS supply,
      COUNT(*) FILTER (WHERE type = 'demand') AS demand
    FROM listings
  `);
  return asNumbers(rows[0]);
}

async function requestMetrics(pool) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'SENT') AS sent,
      COUNT(*) FILTER (WHERE status = 'ACCEPTED') AS accepted,
      COUNT(*) FILTER (WHERE status = 'DECLINED') AS declined,
      COUNT(*) FILTER (WHERE status = 'FILLED') AS filled,
      COUNT(*) FILTER (WHERE status = 'CANCELED') AS canceled,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_7d
    FROM requests
  `);
  return asNumbers(rows[0]);
}

async function subscriptionMetrics(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE plan = 'FREE') AS free,
        COUNT(*) FILTER (WHERE plan = 'BASIS') AS basis,
        COUNT(*) FILTER (WHERE plan = 'PLUS') AS plus,
        COUNT(*) FILTER (WHERE plan = 'PRO') AS pro,
        COUNT(*) FILTER (WHERE status IN ('active', 'past_due', 'canceling')) AS active
      FROM subscriptions
    `);
    return asNumbers(rows[0]);
  } catch { return {}; }
}

async function ratingMetrics(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*) AS total, ROUND(AVG(overall_score)::numeric, 2) AS avg_score
      FROM ratings
    `);
    return { total: Number(rows[0].total), avg_score: Number(rows[0].avg_score ?? 0) };
  } catch { return { total: 0, avg_score: 0 }; }
}

async function capacityMetrics(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_active = TRUE) AS active
      FROM capacity_posts
    `);
    return asNumbers(rows[0]);
  } catch { return {}; }
}

async function auditMetrics(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h
      FROM audit_log
    `);
    return asNumbers(rows[0]);
  } catch { return {}; }
}

/* ── Helpers ──────────────────────────────────────────── */

function asNumbers(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[k] = v == null ? 0 : Number(v);
  }
  return out;
}
