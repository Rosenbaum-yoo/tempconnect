/**
 * Idempotency-Service: Cleanup abgelaufener Keys (für Cron POST /api/internal/cleanup-idempotency).
 * Keine Route-Logik; nur SQL hier.
 */

/**
 * Löscht abgelaufene Idempotency-Keys (expires_at < NOW()), maximal batchSize Zeilen.
 * @param {import('pg').Pool} pool
 * @param {number} batchSize
 * @returns {Promise<{ deleted: number }>}
 */
export async function cleanupExpired(pool, batchSize) {
  const r = await pool.query(
    `WITH expired AS (
      SELECT scope, key FROM idempotency_keys WHERE expires_at < NOW() LIMIT $1
    )
    DELETE FROM idempotency_keys
    WHERE (scope, key) IN (SELECT scope, key FROM expired)`,
    [batchSize]
  );
  return { deleted: r.rowCount ?? 0 };
}
