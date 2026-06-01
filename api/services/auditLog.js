/**
 * Append-only audit log. Do not update or delete rows.
 * Events: capacity create/update/deactivate, reservation active/expired/converted,
 * request status changes, accept/finalize actions, login/security events.
 *
 * action_type: CREATE | UPDATE | DELETE | STATUS_CHANGE | LOGIN | ROLE_CHANGE |
 *              PERMISSION_CHANGE | APPROVAL | SUBMISSION | SECURITY | CONFIG_CHANGE
 * status:      SUCCESS | DENIED | FAILED
 */

/** Sensitive Felder die niemals in Audit-Details landen duerfen (DSGVO) */
const SENSITIVE_KEYS = /password|passwd|token|secret|hash|credit_card|iban|ssn|session/i;

/**
 * Filtert sensible Felder aus Audit-Metadaten.
 * @param {Object|null} obj
 * @returns {Object|null}
 */
export function sanitizeMetadata(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      clean[k] = sanitizeMetadata(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Leitet action_type aus dem action-String ab.
 * @param {string} action - z.B. 'timesheet.approve', 'auth.login'
 * @returns {string}
 */
export function deriveActionType(action) {
  if (!action) return 'UPDATE';
  const a = action.toLowerCase();
  if (a.includes('login') || a.includes('logout'))              return 'LOGIN';
  if (a.includes('register') || a.includes('create') || a.includes('add')) return 'CREATE';
  if (a.includes('delete') || a.includes('remove') || a.includes('deactivate')) return 'DELETE';
  if (a.includes('approve') || a.includes('reject'))            return 'APPROVAL';
  if (a.includes('submit'))                                     return 'SUBMISSION';
  if (a.includes('role'))                                       return 'ROLE_CHANGE';
  if (a.includes('permission'))                                 return 'PERMISSION_CHANGE';
  if (a.includes('password') || a.includes('forgot') || a.includes('reset') ||
      a.includes('verify') || a.includes('lock'))               return 'SECURITY';
  if (a.includes('setting') || a.includes('config'))            return 'CONFIG_CHANGE';
  if (a.includes('accept') || a.includes('cancel') || a.includes('close') ||
      a.includes('complete') || a.includes('finalize') || a.includes('status') ||
      a.includes('return_to'))                                  return 'STATUS_CHANGE';
  if (a.includes('update') || a.includes('edit') || a.includes('patch')) return 'UPDATE';
  return 'UPDATE';
}

/**
 * @param {import('pg').Pool} pool
 * @param {Object} params
 * @param {string} params.action - e.g. capacity.create, auth.login, timesheet.approve
 * @param {string} params.entity_type - capacity | user | timesheet | ...
 * @param {string} [params.entity_id]
 * @param {Object} [params.details]
 * @param {string} [params.action_type] - AUTO-derived if not set
 * @param {string} [params.status] - SUCCESS | DENIED | FAILED (default: SUCCESS)
 * @param {string} [params.request_id]
 * @param {string} [params.capacity_id]
 * @param {string} [params.reservation_id]
 * @param {string} [params.actor_id]
 * @param {string} [params.org_id]
 * @param {Object} [params.old_values]
 * @param {Object} [params.new_values]
 * @param {string} [params.ip_address]
 * @param {string} [params.user_agent]
 */
export async function writeAudit(pool, params) {
  const a = params.action;
  const et = params.entity_type;
  const eid = params.entity_id ?? null;
  const details = sanitizeMetadata(params.details ?? null);
  const rid = params.request_id ?? null;
  const cid = params.capacity_id ?? null;
  const resid = params.reservation_id ?? null;
  const actor = params.actor_id ?? null;
  const orgId = params.org_id ?? null;
  const actionType = params.action_type || deriveActionType(a);
  const status = params.status || 'SUCCESS';
  await pool.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details,
       request_id, capacity_id, reservation_id, org_id,
       old_values, new_values, ip_address, user_agent,
       action_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [actor, a, et, eid, details ? JSON.stringify(details) : null,
     rid, cid, resid, orgId,
     params.old_values ? JSON.stringify(sanitizeMetadata(params.old_values)) : null,
     params.new_values ? JSON.stringify(sanitizeMetadata(params.new_values)) : null,
     params.ip_address ?? null,
     params.user_agent ?? null,
     actionType, status]
  );
}

/**
 * Enhanced audit write — auto-extracts IP, user-agent, org from Express request.
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req
 * @param {Object} params — same as writeAudit plus optional old_values/new_values
 */
export function writeAuditEnhanced(pool, req, params) {
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
 * Supports pagination (offset), action_type, status filters.
 * @returns {{ items: Array, total: number }}
 */
export async function queryAuditLog(pool, filters = {}) {
  const where = []; const params = []; let idx = 1;
  if (filters.actor_id)    { where.push(`al.actor_id = $${idx}`);      params.push(filters.actor_id);    idx++; }
  if (filters.org_id)      { where.push(`al.org_id = $${idx}`);        params.push(filters.org_id);      idx++; }
  if (filters.actor_search) {
    where.push(`(u.email ILIKE $${idx} OR u.contact_person ILIKE $${idx} OR u.company_name ILIKE $${idx})`);
    params.push(`%${filters.actor_search}%`);
    idx++;
  }
  if (filters.org_search) {
    where.push(`(o.name ILIKE $${idx} OR CAST(al.org_id AS text) ILIKE $${idx})`);
    params.push(`%${filters.org_search}%`);
    idx++;
  }
  if (filters.entity_type) { where.push(`al.entity_type = $${idx}`);   params.push(filters.entity_type); idx++; }
  if (filters.action)      { where.push(`al.action ILIKE $${idx}`);    params.push(`%${filters.action}%`); idx++; }
  if (filters.action_type) { where.push(`al.action_type = $${idx}`);   params.push(filters.action_type); idx++; }
  if (filters.status)      { where.push(`al.status = $${idx}`);        params.push(filters.status);      idx++; }
  if (filters.from)        { where.push(`al.created_at >= $${idx}`);   params.push(filters.from);        idx++; }
  if (filters.to)          { where.push(`al.created_at <= $${idx}`);   params.push(filters.to);          idx++; }

  const limit  = Math.min(500, parseInt(filters.limit) || 100);
  const offset = Math.max(0, parseInt(filters.offset) || 0);
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const fromClause = `
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.actor_id
    LEFT JOIN organizations o ON o.id = al.org_id
  `;

  // Total-Count fuer Frontend-Pagination
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total ${fromClause} ${whereClause}`, params
  );
  const total = countResult.rows[0]?.total || 0;

  params.push(limit);  const limitIdx = idx; idx++;
  params.push(offset); const offsetIdx = idx;
  const { rows } = await pool.query(
    `SELECT al.*, u.email AS actor_email, u.company_name AS actor_company,
            o.name AS org_name,
            u.contact_person AS actor_name
     ${fromClause}
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params
  );
  return { items: rows, total };
}

/**
 * Org-scoped Audit Log Query — nur Events dieser Organisation.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {Object} filters
 * @returns {{ items: Array, total: number }}
 */
export function queryOrgAuditLog(pool, orgId, filters = {}) {
  return queryAuditLog(pool, { ...filters, org_id: orgId });
}

/**
 * Letzte Aenderungen an einer bestimmten Ressource — fuer UI-Transparenz.
 * Beispiel: "Timesheet genehmigt von Max Mueller am 14.03.2026"
 * @param {import('pg').Pool} pool
 * @param {string} entityType
 * @param {string} entityId
 * @param {number} [limit=10]
 * @returns {Array}
 */
export async function getRecentChanges(pool, entityType, entityId, limit = 10) {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const { rows } = await pool.query(
    `SELECT al.id, al.action, al.action_type, al.status, al.created_at,
            al.details, al.old_values, al.new_values,
            u.email AS actor_email, u.contact_person AS actor_name,
            u.company_name AS actor_company
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.actor_id
     WHERE al.entity_type = $1 AND al.entity_id = $2
     ORDER BY al.created_at DESC
     LIMIT $3`,
    [entityType, String(entityId), safeLimit]
  );
  return rows;
}
