/**
 * Approval Service: generic approval workflow for any entity type.
 * Uses the existing approval_requests table from migration 019.
 */

import * as auditLog from "./auditLog.js";
import { withTransaction } from "../utils/transaction.js";

/* ── Create ────────────────────────────────────────────── */

export async function createApproval(pool, data) {
  const { rows } = await pool.query(
    `INSERT INTO approval_requests (entity_type, entity_id, org_id, requested_by, reason, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      data.entity_type, data.entity_id, data.org_id || null,
      data.requested_by, data.reason || null, data.expires_at || null
    ]
  );
  return rows[0];
}

/* ── Decide ────────────────────────────────────────────── */

export async function approveEntity(pool, approvalId, approverId, reason) {
  return await withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE approval_requests
       SET status = 'approved', approved_by = $2, reason = COALESCE($3, reason), decided_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [approvalId, approverId, reason || null]
    );
    const approval = rows[0];
    if (approval) {
      await auditLog.writeAudit(client, {
        action: 'approval.approved',
        entity_type: approval.entity_type,
        entity_id: approval.entity_id,
        actor_id: approverId,
        details: { approval_id: approval.id, reason }
      });
    }
    return approval || null;
  });
}

export async function rejectEntity(pool, approvalId, rejecterId, reason) {
  return await withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE approval_requests
       SET status = 'rejected', approved_by = $2, reason = $3, decided_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [approvalId, rejecterId, reason || null]
    );
    const approval = rows[0];
    if (approval) {
      await auditLog.writeAudit(client, {
        action: 'approval.rejected',
        entity_type: approval.entity_type,
        entity_id: approval.entity_id,
        actor_id: rejecterId,
        details: { approval_id: approval.id, reason }
      });
    }
    return approval || null;
  });
}

/* ── Queries ───────────────────────────────────────────── */

export async function listPendingApprovals(pool, filters = {}) {
  const params = [];
  const where = ["ar.status = 'pending'"];
  let idx = 1;

  if (filters.org_id) { where.push(`ar.org_id = $${idx}`); params.push(filters.org_id); idx++; }
  if (filters.entity_type) { where.push(`ar.entity_type = $${idx}`); params.push(filters.entity_type); idx++; }

  const limit = Math.min(100, filters.limit || 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT ar.*, u.email AS requested_by_email, u.company_name AS requested_by_name
     FROM approval_requests ar
     LEFT JOIN users u ON u.id = ar.requested_by
     WHERE ${where.join(' AND ')}
     ORDER BY ar.created_at ASC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function getApprovalHistory(pool, entityType, entityId) {
  const { rows } = await pool.query(
    `SELECT ar.*, u_req.email AS requested_by_email, u_app.email AS approved_by_email
     FROM approval_requests ar
     LEFT JOIN users u_req ON u_req.id = ar.requested_by
     LEFT JOIN users u_app ON u_app.id = ar.approved_by
     WHERE ar.entity_type = $1 AND ar.entity_id = $2
     ORDER BY ar.created_at DESC`,
    [entityType, entityId]
  );
  return rows;
}

export async function getApprovalById(pool, id) {
  const { rows } = await pool.query(
    `SELECT ar.*, u_req.email AS requested_by_email, u_app.email AS approved_by_email
     FROM approval_requests ar
     LEFT JOIN users u_req ON u_req.id = ar.requested_by
     LEFT JOIN users u_app ON u_app.id = ar.approved_by
     WHERE ar.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** Expire overdue pending approvals (for cron). */
export async function expireOverdue(pool, limit = 100) {
  const { rowCount } = await pool.query(
    `UPDATE approval_requests SET status = 'expired', decided_at = NOW()
     WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()
     LIMIT $1`,
    [limit]
  );
  return { expired: rowCount };
}
