/**
 * Settings Service: org_settings CRUD with sensible defaults.
 * Returns defaults when no row exists yet (lazy creation).
 */

const DEFAULTS = {
  approval_required: false,
  preferred_supplier_only: false,
  auto_match_enabled: true,
  default_radius_km: 25,
  compliance_strictness: 'standard',
  notification_preferences: {},
  branding: {}
};

export async function getSettings(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT * FROM org_settings WHERE org_id = $1`,
    [orgId]
  );
  if (rows[0]) return rows[0];
  // Return defaults without persisting
  return { org_id: orgId, ...DEFAULTS, _defaults: true };
}

export async function updateSettings(pool, orgId, data) {
  const allowed = [
    'approval_required', 'preferred_supplier_only', 'auto_match_enabled',
    'default_radius_km', 'compliance_strictness',
    'notification_preferences', 'branding'
  ];
  const updates = {};
  for (const key of allowed) {
    if (data[key] !== undefined) updates[key] = data[key];
  }
  if (Object.keys(updates).length === 0) return getSettings(pool, orgId);

  // Upsert
  const cols = Object.keys(updates);
  const vals = Object.values(updates).map(v =>
    typeof v === 'object' && v !== null ? JSON.stringify(v) : v
  );
  const placeholders = cols.map((_, i) => `$${i + 2}`);
  const onConflict = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO org_settings (org_id, ${cols.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (org_id) DO UPDATE SET ${onConflict}, updated_at = NOW()
     RETURNING *`,
    [orgId, ...vals]
  );
  return rows[0];
}

/** Check if org requires approval for requisitions. */
export async function requiresApproval(pool, orgId) {
  const settings = await getSettings(pool, orgId);
  return settings.approval_required === true;
}

/** Check if org restricts to preferred suppliers only. */
export async function preferredSuppliersOnly(pool, orgId) {
  const settings = await getSettings(pool, orgId);
  return settings.preferred_supplier_only === true;
}
