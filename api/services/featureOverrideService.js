/**
 * Feature Override Service — admin-managed feature flag overrides.
 * Overrides are stored in the feature_overrides table and checked
 * before the plan-based feature gate logic.
 */

/**
 * Check if there is an active override for a feature.
 * Priority: org-specific override > global override (org_id IS NULL).
 * Returns: { overridden: true, enabled: bool } or { overridden: false }
 */
export async function checkOverride(pool, featureKey, orgId) {
  const { rows } = await pool.query(
    `SELECT enabled FROM feature_overrides
     WHERE feature_key = $1
       AND (org_id = $2 OR org_id IS NULL)
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY org_id IS NULL ASC
     LIMIT 1`,
    [featureKey, orgId || null]
  );
  if (rows.length > 0) {
    return { overridden: true, enabled: rows[0].enabled };
  }
  return { overridden: false };
}

/** List all overrides (admin dashboard). */
export async function listOverrides(pool, { orgId, limit = 100, offset = 0 } = {}) {
  const where = orgId ? "WHERE fo.org_id = $3" : "";
  const params = orgId ? [limit, offset, orgId] : [limit, offset];
  const { rows } = await pool.query(
    `SELECT fo.*, o.name AS org_name, u.email AS created_by_email
     FROM feature_overrides fo
     LEFT JOIN organizations o ON o.id = fo.org_id
     LEFT JOIN users u ON u.id = fo.created_by
     ${where}
     ORDER BY fo.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM feature_overrides fo ${where}`,
    orgId ? [orgId] : []
  );
  return { items: rows, total: countRows[0]?.total || 0 };
}

/** Create or update an override. */
export async function upsertOverride(pool, { featureKey, orgId, enabled, reason, createdBy, expiresAt }) {
  const { rows } = await pool.query(
    `INSERT INTO feature_overrides (feature_key, org_id, enabled, reason, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (org_id, feature_key)
     DO UPDATE SET enabled = $3, reason = $4, created_by = $5, expires_at = $6, created_at = NOW()
     RETURNING *`,
    [featureKey, orgId || null, enabled, reason || null, createdBy, expiresAt || null]
  );
  return rows[0];
}

/** Delete an override. */
export async function deleteOverride(pool, overrideId) {
  const { rowCount } = await pool.query(
    "DELETE FROM feature_overrides WHERE id = $1",
    [overrideId]
  );
  return rowCount > 0;
}
