/**
 * Assignment Service: post-deal fulfillment lifecycle.
 * Connects requisitions, suppliers, and deals to actual worker assignments.
 */

import * as auditLog from "./auditLog.js";

const VALID_TRANSITIONS = {
  planned:   ['active', 'cancelled'],
  active:    ['completed', 'cancelled', 'extended'],
  extended:  ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

/* ── CRUD ─────────────────────────────────────────────── */

export async function createAssignment(pool, data) {
  const { rows } = await pool.query(
    `INSERT INTO assignments
     (org_id, requisition_id, supplier_org_id, deal_request_id, contract_id,
      worker_description, worker_count, start_date, planned_end_date,
      hourly_rate_cents, notes, created_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      data.org_id || null, data.requisition_id || null,
      data.supplier_org_id || null, data.deal_request_id || null,
      data.contract_id || null, data.worker_description || null,
      data.worker_count ?? 1, data.start_date, data.planned_end_date || null,
      data.hourly_rate_cents ?? null, data.notes || null,
      data.created_by || null, data.status || 'planned'
    ]
  );
  const a = rows[0];
  await auditLog.writeAudit(pool, {
    action: 'assignment.created', entity_type: 'assignment', entity_id: a.id,
    actor_id: data.created_by,
    details: { requisition_id: a.requisition_id, supplier_org_id: a.supplier_org_id }
  });
  return a;
}

export async function getAssignment(pool, id) {
  const { rows } = await pool.query(
    `SELECT a.*, o.name AS org_name, so.name AS supplier_org_name,
            r.title AS requisition_title, u.email AS created_by_email
     FROM assignments a
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function listAssignments(pool, filters = {}) {
  const params = [];
  const where = [];
  let idx = 1;

  if (filters.org_id) { where.push(`a.org_id = $${idx}`); params.push(filters.org_id); idx++; }
  if (filters.supplier_org_id) { where.push(`a.supplier_org_id = $${idx}`); params.push(filters.supplier_org_id); idx++; }
  if (filters.requisition_id) { where.push(`a.requisition_id = $${idx}`); params.push(filters.requisition_id); idx++; }
  if (filters.status) { where.push(`a.status = $${idx}`); params.push(filters.status); idx++; }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT a.*, o.name AS org_name, so.name AS supplier_org_name,
            r.title AS requisition_title
     FROM assignments a
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     ${whereClause}
     ORDER BY a.start_date ASC, a.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function updateAssignment(pool, id, data, actorId) {
  const allowed = [
    'worker_description', 'worker_count', 'start_date', 'planned_end_date',
    'hourly_rate_cents', 'notes', 'contract_id'
  ];
  const fields = [];
  const values = [id];
  let idx = 2;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }
  if (fields.length === 0) return null;
  fields.push('updated_at = NOW()');
  const { rows } = await pool.query(
    `UPDATE assignments SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  return rows[0] || null;
}

/* ── Lifecycle ─────────────────────────────────────────── */

export async function transitionAssignment(pool, id, newStatus, actorId, opts = {}) {
  const a = await getAssignment(pool, id);
  if (!a) return { error: 'NOT_FOUND' };

  const allowed = VALID_TRANSITIONS[a.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return { error: 'INVALID_TRANSITION', from: a.status, to: newStatus };
  }

  const extra = [];
  const values = [id, newStatus];
  let idx = 3;

  if (newStatus === 'completed') {
    extra.push(`completed_by = $${idx}`, 'completed_at = NOW()');
    values.push(actorId); idx++;
    if (opts.actual_end_date) {
      extra.push(`actual_end_date = $${idx}`);
      values.push(opts.actual_end_date); idx++;
    }
  } else if (newStatus === 'cancelled') {
    extra.push('cancelled_at = NOW()');
    if (opts.cancel_reason) {
      extra.push(`cancel_reason = $${idx}`);
      values.push(opts.cancel_reason); idx++;
    }
  } else if (newStatus === 'extended' && opts.planned_end_date) {
    extra.push(`planned_end_date = $${idx}`);
    values.push(opts.planned_end_date); idx++;
  }

  const setClause = ['status = $2', 'updated_at = NOW()', ...extra].join(', ');
  const { rows } = await pool.query(
    `UPDATE assignments SET ${setClause} WHERE id = $1 RETURNING *`,
    values
  );

  if (rows[0]) {
    await auditLog.writeAudit(pool, {
      action: `assignment.${newStatus}`, entity_type: 'assignment', entity_id: id,
      actor_id: actorId, details: { from: a.status, to: newStatus }
    });
  }
  return { assignment: rows[0] };
}

export async function completeAssignment(pool, id, actorId, opts = {}) {
  return transitionAssignment(pool, id, 'completed', actorId, opts);
}

export async function cancelAssignment(pool, id, actorId, reason) {
  return transitionAssignment(pool, id, 'cancelled', actorId, { cancel_reason: reason });
}

export async function activateAssignment(pool, id, actorId) {
  return transitionAssignment(pool, id, 'active', actorId);
}
