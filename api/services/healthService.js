/**
 * Health-Service: DB-Ping und Migrations-Liste für /api/health und /api/admin/status.
 * Keine Route-Logik; nur SQL hier.
 */

/**
 * @param {import('pg').Pool} pool
 */
export async function pingDb(pool) {
  await pool.query("SELECT 1");
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<Array<{ name: string, applied_at: Date }>>}
 */
export async function getMigrations(pool) {
  const r = await pool.query("SELECT name, applied_at FROM _migrations ORDER BY applied_at ASC").catch(() => ({ rows: [] }));
  return r.rows;
}
