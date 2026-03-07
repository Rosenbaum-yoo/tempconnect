/**
 * Append-only audit log. Do not update or delete rows.
 * Events: capacity create/update/deactivate, reservation active/expired/converted,
 * request status changes, accept/finalize actions.
 */

/**
 * @param {import('pg').Pool} pool
 * @param {Object} params
 * @param {string} params.action - e.g. capacity.create, capacity.update, capacity.deactivate, reservation.active, reservation.expired, reservation.converted, request.status_change, request.accept, request.finalize
 * @param {string} params.entity_type - capacity | capacity_reservation | request
 * @param {string} [params.entity_id]
 * @param {Object} [params.details]
 * @param {string} [params.request_id]
 * @param {string} [params.capacity_id]
 * @param {string} [params.reservation_id]
 * @param {string} [params.actor_id]
 */
export async function writeAudit(pool, params) {
  const a = params.action;
  const et = params.entity_type;
  const eid = params.entity_id ?? null;
  const details = params.details ?? null;
  const rid = params.request_id ?? null;
  const cid = params.capacity_id ?? null;
  const resid = params.reservation_id ?? null;
  const actor = params.actor_id ?? null;
  const orgId = params.org_id ?? null;
  await pool.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, request_id, capacity_id, reservation_id, org_id,
       old_values, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [actor, a, et, eid, details ? JSON.stringify(details) : null, rid, cid, resid, orgId,
     params.old_values ? JSON.stringify(params.old_values) : null,
     params.new_values ? JSON.stringify(params.new_values) : null,
     params.ip_address ?? null,
     params.user_agent ?? null]
  );
}

/**
 * Enhanced audit write — auto-extracts IP, user-agent, org from Express request.
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req
 * @param {Object} params — same as writeAudit plus optional old_values/new_values
 */
export async function writeAuditEnhanced(pool, req, params) {
  return writeAudit(pool, {
    ...params,
    actor_id: params.actor_id ?? req.session?.userId ?? null,
    org_id: params.org_id ?? req.orgId ?? null,
    ip_address: params.ip_address ?? req.ip ?? null,
    user_agent: params.user_agent ?? (req.headers?.['user-agent'] || '').slice(0, 500) ?? null
  });
}

/**
 * Compute diff between old and new objects (shallow, top-level keys only).
 * Returns { old_values, new_values } containing only changed fields.
 */
export function diffValues(oldObj, newObj) {
  if (!oldObj || !newObj) return { old_values: oldObj || null, new_values: newObj || null };
  const old_values = {};
  const new_values = {};
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const k of allKeys) {
    if (k === 'updated_at' || k === 'created_at') continue;
    const ov = oldObj[k], nv = newObj[k];
    if (JSON.stringify(ov) !== JSON.stringify(nv)) {
      old_values[k] = ov ?? null;
      new_values[k] = nv ?? null;
    }
  }
  return { old_values: Object.keys(old_values).length ? old_values : null,
           new_values: Object.keys(new_values).length ? new_values : null };
}

/**
 * Query audit log with filters — for admin panel.
 */
export async function queryAuditLog(pool, filters = {}) {
  const where = []; const params = []; let idx = 1;
  if (filters.actor_id) { where.push(`al.actor_id = $${idx}`); params.push(filters.actor_id); idx++; }
  if (filters.org_id) { where.push(`al.org_id = $${idx}`); params.push(filters.org_id); idx++; }
  if (filters.entity_type) { where.push(`al.entity_type = $${idx}`); params.push(filters.entity_type); idx++; }
  if (filters.action) { where.push(`al.action ILIKE $${idx}`); params.push(`%${filters.action}%`); idx++; }
  if (filters.from) { where.push(`al.created_at >= $${idx}`); params.push(filters.from); idx++; }
  if (filters.to) { where.push(`al.created_at <= $${idx}`); params.push(filters.to); idx++; }
  const limit = Math.min(500, parseInt(filters.limit) || 100);
  params.push(limit);
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT al.*, u.email AS actor_email, u.company_name AS actor_company
     FROM audit_log al LEFT JOIN users u ON u.id = al.actor_id
     ${whereClause} ORDER BY al.created_at DESC LIMIT $${idx}`, params
  );
  return rows;
}
