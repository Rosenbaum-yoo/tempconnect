/**
 * Vendor Pool Service: Verwaltung der zugelassenen Lieferanten pro Client-Org.
 * Tiers: PREFERRED, SECONDARY, TRIAL, RESTRICTED, BLOCKED.
 * Aktionen: hinzufuegen, Tier aendern, sperren, entfernen, auflisten.
 */

const VALID_TIERS = ['PREFERRED', 'SECONDARY', 'TRIAL', 'RESTRICTED', 'BLOCKED'];
const VALID_STATUSES = ['active', 'suspended', 'removed'];

/* ── Kern-Operationen ──────────────────────────────────── */

export async function addToPool(pool, data) {
  const { rows } = await pool.query(
    `INSERT INTO vendor_pool
     (client_org_id, supplier_org_id, tier, status, category,
      location_id, department_id, assigned_by, reason, valid_from, valid_until)
     VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (client_org_id, supplier_org_id, category, location_id, department_id)
     DO UPDATE SET tier = EXCLUDED.tier, status = 'active', reason = EXCLUDED.reason,
                   assigned_by = EXCLUDED.assigned_by, valid_from = EXCLUDED.valid_from,
                   valid_until = EXCLUDED.valid_until, updated_at = NOW()
     RETURNING *`,
    [
      data.client_org_id, data.supplier_org_id,
      data.tier || 'SECONDARY', data.category || null,
      data.location_id || null, data.department_id || null,
      data.assigned_by || null, data.reason || null,
      data.valid_from || null, data.valid_until || null
    ]
  );
  return rows[0];
}

export async function changeTier(pool, entryId, newTier, actorId, reason) {
  if (!VALID_TIERS.includes(newTier)) throw new Error('Ungueltiger Tier: ' + newTier);
  const { rows } = await pool.query(
    `UPDATE vendor_pool SET tier = $2, assigned_by = $3, reason = $4, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [entryId, newTier, actorId, reason || null]
  );
  return rows[0] || null;
}

export async function changeStatus(pool, entryId, newStatus, actorId, reason) {
  if (!VALID_STATUSES.includes(newStatus)) throw new Error('Ungueltiger Status: ' + newStatus);
  const { rows } = await pool.query(
    `UPDATE vendor_pool SET status = $2, assigned_by = $3, reason = $4, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [entryId, newStatus, actorId, reason || null]
  );
  return rows[0] || null;
}

export async function blockVendor(pool, clientOrgId, supplierOrgId, actorId, reason) {
  const { rows } = await pool.query(
    `UPDATE vendor_pool SET tier = 'BLOCKED', status = 'suspended',
            assigned_by = $3, reason = $4, updated_at = NOW()
     WHERE client_org_id = $1 AND supplier_org_id = $2
     RETURNING *`,
    [clientOrgId, supplierOrgId, actorId, reason || null]
  );
  return rows;
}

export async function removeFromPool(pool, entryId) {
  const { rows } = await pool.query(
    `UPDATE vendor_pool SET status = 'removed', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [entryId]
  );
  return rows[0] || null;
}

/* ── Abfragen ─────────────────────────────────────────── */

export async function listForClient(pool, clientOrgId, filters = {}) {
  const params = [clientOrgId];
  const where = ['vp.client_org_id = $1'];
  let idx = 2;

  if (filters.tier) { where.push(`vp.tier = $${idx}`); params.push(filters.tier); idx++; }
  if (filters.status) { where.push(`vp.status = $${idx}`); params.push(filters.status); idx++; }
  else { where.push(`vp.status != 'removed'`); }
  if (filters.category) { where.push(`vp.category = $${idx}`); params.push(filters.category); idx++; }

  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT vp.*, so.name AS supplier_org_name, so.type AS supplier_org_type,
            u.email AS assigned_by_email, u.company_name AS assigned_by_name,
            ol.name AS location_name, od.name AS department_name
     FROM vendor_pool vp
     LEFT JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN users u ON u.id = vp.assigned_by
     LEFT JOIN org_locations ol ON ol.id = vp.location_id
     LEFT JOIN org_departments od ON od.id = vp.department_id
     WHERE ${where.join(' AND ')}
     ORDER BY CASE vp.tier
       WHEN 'PREFERRED' THEN 1 WHEN 'SECONDARY' THEN 2
       WHEN 'TRIAL' THEN 3 WHEN 'RESTRICTED' THEN 4 WHEN 'BLOCKED' THEN 5
     END, vp.updated_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function listForSupplier(pool, supplierOrgId, filters = {}) {
  const params = [supplierOrgId];
  const where = ['vp.supplier_org_id = $1', `vp.status = 'active'`];
  let idx = 2;

  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT vp.*, co.name AS client_org_name, co.type AS client_org_type
     FROM vendor_pool vp
     LEFT JOIN organizations co ON co.id = vp.client_org_id
     WHERE ${where.join(' AND ')}
     ORDER BY vp.tier ASC, vp.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function getEntry(pool, entryId) {
  const { rows } = await pool.query(
    `SELECT vp.*, so.name AS supplier_org_name, co.name AS client_org_name
     FROM vendor_pool vp
     LEFT JOIN organizations so ON so.id = vp.supplier_org_id
     LEFT JOIN organizations co ON co.id = vp.client_org_id
     WHERE vp.id = $1`,
    [entryId]
  );
  return rows[0] || null;
}

/** Ist der Supplier im Pool des Clients (aktiv, nicht blocked)? */
export async function isInPool(pool, clientOrgId, supplierOrgId) {
  const { rows } = await pool.query(
    `SELECT id, tier, status FROM vendor_pool
     WHERE client_org_id = $1 AND supplier_org_id = $2 AND status = 'active' AND tier != 'BLOCKED'
     LIMIT 1`,
    [clientOrgId, supplierOrgId]
  );
  return rows[0] || null;
}

/** Statistik fuer Client-Org: Anzahl nach Tier */
export async function poolStats(pool, clientOrgId) {
  const { rows } = await pool.query(
    `SELECT tier, COUNT(*)::int AS count
     FROM vendor_pool
     WHERE client_org_id = $1 AND status = 'active'
     GROUP BY tier
     ORDER BY tier`,
    [clientOrgId]
  );
  const stats = { PREFERRED: 0, SECONDARY: 0, TRIAL: 0, RESTRICTED: 0, BLOCKED: 0, total: 0 };
  for (const r of rows) {
    stats[r.tier] = r.count;
    stats.total += r.count;
  }
  return stats;
}
