/**
 * Assignment Service: post-deal fulfillment lifecycle.
 * Connects requisitions, suppliers, and deals to actual worker assignments.
 */

import * as auditLog from "./auditLog.js";
import { notifyAssignmentNew } from "./workerNotificationService.js";
import { withTransaction } from "../utils/transaction.js";
import { assertLocationBelongsToOrg, assertDepartmentBelongsToOrg } from "../utils/orgBoundary.js";
import {
  buildAssignmentActivePredicateSql,
  buildAssignmentHistoryPredicateSql,
  buildAssignmentLifecycleBucketSql,
  buildAssignmentLifecycleStateSql,
  buildAssignmentEffectiveEndDateSql,
  normalizeAssignmentLifecycleBucket
} from "./assignmentLifecycleService.js";

const VALID_TRANSITIONS = {
  planned:   ['active', 'cancelled'],
  active:    ['completed', 'cancelled', 'extended'],
  extended:  ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

/* ── CRUD ─────────────────────────────────────────────── */

export async function createAssignment(pool, data) {
  // Org-Boundary: Standort und Abteilung muessen zur eigenen Org gehoeren.
  await assertLocationBelongsToOrg(pool, data.location_id, data.org_id);
  await assertDepartmentBelongsToOrg(pool, data.department_id, data.org_id);

  const a = await withTransaction(pool, async (client) => {
    const requestedQuantity = Math.max(1, Number.parseInt(data.requested_quantity ?? data.worker_count ?? 1, 10) || 1);
    const staffingStatus = data.status === "cancelled"
      ? "cancelled"
      : (data.status === "completed" ? "closed" : "open");
    const { rows } = await client.query(
      `INSERT INTO assignments
       (org_id, requisition_id, supplier_org_id, deal_request_id, demand_request_id, offer_id, contract_id,
        location_id, department_id,
        worker_description, worker_count, requested_quantity, filled_quantity, reserved_quantity, open_quantity, staffing_status,
        start_date, planned_end_date, hourly_rate_cents, notes, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,0,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [
        data.org_id || null, data.requisition_id || null,
        data.supplier_org_id || null, data.deal_request_id || null,
        data.demand_request_id || null, data.offer_id || null,
        data.contract_id || null,
        data.location_id || null, data.department_id || null,
        data.worker_description || null,
        requestedQuantity, requestedQuantity, requestedQuantity, staffingStatus,
        data.start_date, data.planned_end_date || null,
        data.hourly_rate_cents ?? null, data.notes || null,
        data.created_by || null, data.status || 'planned'
      ]
    );
    const row = rows[0];
    await auditLog.writeAudit(client, {
      action: 'assignment.created', entity_type: 'assignment', entity_id: row.id,
      actor_id: data.created_by,
      details: { requisition_id: row.requisition_id, supplier_org_id: row.supplier_org_id }
    });
    return row;
  });

  // P12-4: Notify linked workers about new assignment (non-transactional, fire-and-forget)
  if (data.worker_user_ids && Array.isArray(data.worker_user_ids)) {
    for (const wId of data.worker_user_ids) {
      notifyAssignmentNew(pool, wId, a.id, data.client_name || null).catch(() => {});
    }
  }

  return a;
}

export async function getAssignment(pool, id) {
  const assignmentEffectiveEndDateSql = buildAssignmentEffectiveEndDateSql({ assignmentAlias: "a" });
  const assignmentLifecycleStateSql = buildAssignmentLifecycleStateSql({ assignmentAlias: "a" });
  const assignmentLifecycleBucketSql = buildAssignmentLifecycleBucketSql({ assignmentAlias: "a" });
  const assignmentIsCurrentSql = buildAssignmentActivePredicateSql({ assignmentAlias: "a" });
  const assignmentIsHistorySql = buildAssignmentHistoryPredicateSql({ assignmentAlias: "a" });
  const { rows } = await pool.query(
    `SELECT a.*, o.name AS org_name, so.name AS supplier_org_name,
            r.title AS requisition_title, dr.title AS demand_title,
            dr.role AS demand_role, u.email AS created_by_email,
            ${assignmentEffectiveEndDateSql} AS assignment_effective_end_date,
            ${assignmentLifecycleStateSql} AS assignment_lifecycle_state,
            ${assignmentLifecycleBucketSql} AS assignment_lifecycle_bucket,
            ${assignmentIsCurrentSql} AS assignment_is_current,
            ${assignmentIsHistorySql} AS assignment_is_history,
            (${assignmentLifecycleStateSql} = 'ends_today') AS assignment_ends_today,
            (${assignmentLifecycleStateSql} = 'expired') AS assignment_is_expired
     FROM assignments a
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN demand_requests dr ON dr.id = a.demand_request_id
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
  const lifecycleBucket = normalizeAssignmentLifecycleBucket(filters.lifecycle_bucket, null);

  if (filters.org_id) { where.push(`a.org_id = $${idx}`); params.push(filters.org_id); idx++; }
  if (filters.supplier_org_id) { where.push(`a.supplier_org_id = $${idx}`); params.push(filters.supplier_org_id); idx++; }
  if (filters.requisition_id) { where.push(`a.requisition_id = $${idx}`); params.push(filters.requisition_id); idx++; }
  if (filters.location_id) { where.push(`a.location_id = $${idx}`); params.push(filters.location_id); idx++; }
  if (filters.department_id) { where.push(`a.department_id = $${idx}`); params.push(filters.department_id); idx++; }
  if (filters.status) { where.push(`a.status = $${idx}`); params.push(filters.status); idx++; }
  if (lifecycleBucket === "active") {
    where.push(buildAssignmentActivePredicateSql({ assignmentAlias: "a" }));
  } else if (lifecycleBucket === "history") {
    where.push(buildAssignmentHistoryPredicateSql({ assignmentAlias: "a" }));
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);
  const assignmentEffectiveEndDateSql = buildAssignmentEffectiveEndDateSql({ assignmentAlias: "a" });
  const assignmentLifecycleStateSql = buildAssignmentLifecycleStateSql({ assignmentAlias: "a" });
  const assignmentLifecycleBucketSql = buildAssignmentLifecycleBucketSql({ assignmentAlias: "a" });
  const assignmentIsCurrentSql = buildAssignmentActivePredicateSql({ assignmentAlias: "a" });
  const assignmentIsHistorySql = buildAssignmentHistoryPredicateSql({ assignmentAlias: "a" });

  const { rows } = await pool.query(
    `SELECT a.*, o.name AS org_name, so.name AS supplier_org_name,
            r.title AS requisition_title, dr.title AS demand_title,
            dr.role AS demand_role,
            ${assignmentEffectiveEndDateSql} AS assignment_effective_end_date,
            ${assignmentLifecycleStateSql} AS assignment_lifecycle_state,
            ${assignmentLifecycleBucketSql} AS assignment_lifecycle_bucket,
            ${assignmentIsCurrentSql} AS assignment_is_current,
            ${assignmentIsHistorySql} AS assignment_is_history,
            (${assignmentLifecycleStateSql} = 'ends_today') AS assignment_ends_today,
            (${assignmentLifecycleStateSql} = 'expired') AS assignment_is_expired
     FROM assignments a
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     LEFT JOIN requisitions r ON r.id = a.requisition_id
     LEFT JOIN demand_requests dr ON dr.id = a.demand_request_id
     ${whereClause}
     ORDER BY a.start_date ASC, a.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function updateAssignment(pool, id, data, _actorId) {
  const allowed = [
    'worker_description', 'start_date', 'planned_end_date',
    'hourly_rate_cents', 'notes', 'contract_id',
    'location_id', 'department_id'
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
  const normalizedRequestedQuantity = data.requested_quantity !== undefined
    ? data.requested_quantity
    : data.worker_count;
  if (normalizedRequestedQuantity !== undefined) {
    fields.push(`requested_quantity = $${idx}`);
    values.push(normalizedRequestedQuantity);
    idx++;
    fields.push(`worker_count = $${idx}`);
    values.push(normalizedRequestedQuantity);
    idx++;
    fields.push(`open_quantity = GREATEST($${idx - 2} - COALESCE(filled_quantity, 0) - COALESCE(reserved_quantity, 0), 0)`);
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

  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE assignments SET ${setClause} WHERE id = $1 RETURNING *`,
      values
    );
    if (rows[0]) {
      await auditLog.writeAudit(client, {
        action: `assignment.${newStatus}`, entity_type: 'assignment', entity_id: id,
        actor_id: actorId, details: { from: a.status, to: newStatus }
      });
    }
    return { assignment: rows[0] };
  });
}

export async function completeAssignment(pool, id, actorId, opts = {}) {
  const result = await transitionAssignment(pool, id, 'completed', actorId, opts);
  // Auto-update supplier reputation on successful completion
  if (result.assignment && result.assignment.supplier_org_id) {
    try {
      await updateSupplierReputation(pool, result.assignment.supplier_org_id, 'completed');
    } catch (_e) {
      // Non-critical — reputation update should not block completion
    }
  }
  return result;
}

export async function updateSupplierReputation(pool, supplierOrgId, _eventType) {
  // Upsert reputation stats for the supplier org
  const { rows: stats } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
       COUNT(*)::int AS total_count,
       AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at)) / 86400)::numeric(6,1) AS avg_duration_days
     FROM assignments WHERE supplier_org_id = $1`,
    [supplierOrgId]
  );
  const s = stats[0] || {};
  const completionRate = s.total_count > 0 ? (s.completed_count / s.total_count) : 0;
  const score = Math.min(5.0, Math.max(1.0,
    2.5 + (completionRate * 2.0) - (s.cancelled_count * 0.3)
  ));

  await pool.query(
    `INSERT INTO supplier_reputation (supplier_org_id, score, completed_assignments, cancelled_assignments, total_assignments, avg_duration_days, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (supplier_org_id) DO UPDATE SET
       score = $2, completed_assignments = $3, cancelled_assignments = $4,
       total_assignments = $5, avg_duration_days = $6, updated_at = NOW()`,
    [supplierOrgId, Math.round(score * 10) / 10, s.completed_count || 0, s.cancelled_count || 0, s.total_count || 0, s.avg_duration_days || 0]
  );
}

export function cancelAssignment(pool, id, actorId, reason) {
  return transitionAssignment(pool, id, 'cancelled', actorId, { cancel_reason: reason });
}

export function activateAssignment(pool, id, actorId) {
  return transitionAssignment(pool, id, 'active', actorId);
}
