/**
 * Capacity Discovery Service.
 * Aggregated views of active capacity for real-time workforce visibility.
 * "5 electricians available in Stuttgart" style summaries.
 */

/* ── Aggregate by Role ────────────────────────────────── */

/**
 * Groups active capacity entries by role.
 * Returns: [{ role, entry_count, total_headcount, cities, avg_headcount }]
 */
export async function aggregateByRole(pool, filters = {}) {
  const params = [];
  const where = ["cp.status = 'active'"];
  let idx = 1;

  if (filters.city) {
    where.push(`LOWER(cp.location_city) = LOWER($${idx})`); params.push(filters.city); idx++;
  }
  if (filters.worker_category) {
    where.push(`cp.worker_category = $${idx}`); params.push(filters.worker_category); idx++;
  }

  const limit = Math.min(100, filters.limit || 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       cp.role,
       COUNT(*)::int AS entry_count,
       SUM(cp.headcount)::int AS total_headcount,
       ROUND(AVG(cp.headcount), 1) AS avg_headcount,
       ARRAY_AGG(DISTINCT cp.location_city) FILTER (WHERE cp.location_city IS NOT NULL) AS cities
     FROM capacity_posts cp
     WHERE ${where.join(' AND ')}
     GROUP BY cp.role
     ORDER BY total_headcount DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/* ── Aggregate by Region ──────────────────────────────── */

/**
 * Groups active capacity entries by location_city.
 * Returns: [{ city, entry_count, total_headcount, roles }]
 */
export async function aggregateByRegion(pool, filters = {}) {
  const params = [];
  const where = ["cp.status = 'active'", "cp.location_city IS NOT NULL"];
  let idx = 1;

  if (filters.role) {
    where.push(`LOWER(cp.role) LIKE LOWER($${idx})`); params.push('%' + filters.role + '%'); idx++;
  }
  if (filters.worker_category) {
    where.push(`cp.worker_category = $${idx}`); params.push(filters.worker_category); idx++;
  }

  const limit = Math.min(100, filters.limit || 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       cp.location_city AS city,
       LEFT(cp.location_postal, 2) AS postal_prefix,
       COUNT(*)::int AS entry_count,
       SUM(cp.headcount)::int AS total_headcount,
       ARRAY_AGG(DISTINCT cp.role) AS roles
     FROM capacity_posts cp
     WHERE ${where.join(' AND ')}
     GROUP BY cp.location_city, LEFT(cp.location_postal, 2)
     ORDER BY total_headcount DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/* ── Aggregate by Category ────────────────────────────── */

/**
 * Groups active capacity entries by worker_category.
 * Returns: [{ category, entry_count, total_headcount, cities }]
 */
export async function aggregateByCategory(pool, filters = {}) {
  const params = [];
  const where = ["cp.status = 'active'", "cp.worker_category IS NOT NULL"];
  let idx = 1;

  if (filters.city) {
    where.push(`LOWER(cp.location_city) = LOWER($${idx})`); params.push(filters.city); idx++;
  }

  const limit = Math.min(100, filters.limit || 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       cp.worker_category AS category,
       COUNT(*)::int AS entry_count,
       SUM(cp.headcount)::int AS total_headcount,
       ARRAY_AGG(DISTINCT cp.location_city) FILTER (WHERE cp.location_city IS NOT NULL) AS cities,
       ARRAY_AGG(DISTINCT cp.role) AS roles
     FROM capacity_posts cp
     WHERE ${where.join(' AND ')}
     GROUP BY cp.worker_category
     ORDER BY total_headcount DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/* ── Availability Summary ─────────────────────────────── */

/**
 * Human-readable summaries: "12 Lagerhelfer in Stuttgart verfuegbar ab 2026-03-10".
 * Returns top N summaries.
 */
export async function getAvailabilitySummary(pool, filters = {}) {
  const params = [];
  const where = ["cp.status = 'active'"];
  let idx = 1;

  if (filters.city) {
    where.push(`LOWER(cp.location_city) = LOWER($${idx})`); params.push(filters.city); idx++;
  }
  if (filters.role) {
    where.push(`LOWER(cp.role) LIKE LOWER($${idx})`); params.push('%' + filters.role + '%'); idx++;
  }

  const limit = Math.min(50, filters.limit || 20);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       cp.role,
       cp.location_city AS city,
       SUM(cp.headcount)::int AS total_headcount,
       MIN(cp.availability_from) AS earliest_available,
       COUNT(*)::int AS entry_count,
       COUNT(DISTINCT cp.supplier_company_id)::int AS supplier_count
     FROM capacity_posts cp
     WHERE ${where.join(' AND ')}
     GROUP BY cp.role, cp.location_city
     HAVING SUM(cp.headcount) > 0
     ORDER BY total_headcount DESC
     LIMIT $${idx}`,
    params
  );

  return rows.map(r => ({
    role: r.role,
    city: r.city,
    total_headcount: r.total_headcount,
    earliest_available: r.earliest_available,
    entry_count: r.entry_count,
    supplier_count: r.supplier_count,
    summary: `${r.total_headcount} ${r.role} in ${r.city || 'verschiedenen Regionen'} verfuegbar`
      + (r.earliest_available ? ` ab ${String(r.earliest_available).substring(0, 10)}` : '')
  }));
}
