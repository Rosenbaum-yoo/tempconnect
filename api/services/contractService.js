/**
 * Contract Service: CRUD for enterprise contracts / framework agreements.
 */

import * as auditLog from "./auditLog.js";
import { withTransaction } from "../utils/transaction.js";

/* ── CRUD ─────────────────────────────────────────────── */

export async function createContract(pool, data) {
  return await withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO contracts
       (buyer_org_id, supplier_org_id, contract_type, title, description,
        status, terms_summary, file_ref, valid_from, valid_until,
        internal_notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        data.buyer_org_id, data.supplier_org_id, data.contract_type,
        data.title, data.description || null,
        data.status || 'draft', data.terms_summary || null,
        data.file_ref || null, data.valid_from || null, data.valid_until || null,
        data.internal_notes || null, data.created_by || null
      ]
    );
    const c = rows[0];
    await auditLog.writeAudit(client, {
      action: 'contract.created', entity_type: 'contract', entity_id: c.id,
      actor_id: data.created_by, details: { title: c.title, type: c.contract_type }
    });
    return c;
  });
}

export async function getContract(pool, id) {
  const { rows } = await pool.query(
    `SELECT c.*, bo.name AS buyer_org_name, so.name AS supplier_org_name,
            u.email AS created_by_email
     FROM contracts c
     LEFT JOIN organizations bo ON bo.id = c.buyer_org_id
     LEFT JOIN organizations so ON so.id = c.supplier_org_id
     LEFT JOIN users u ON u.id = c.created_by
     WHERE c.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function listContracts(pool, filters = {}) {
  const params = [];
  const where = [];
  let idx = 1;

  if (filters.buyer_org_id) { where.push(`c.buyer_org_id = $${idx}`); params.push(filters.buyer_org_id); idx++; }
  if (filters.supplier_org_id) { where.push(`c.supplier_org_id = $${idx}`); params.push(filters.supplier_org_id); idx++; }
  if (filters.status) { where.push(`c.status = $${idx}`); params.push(filters.status); idx++; }
  if (filters.contract_type) { where.push(`c.contract_type = $${idx}`); params.push(filters.contract_type); idx++; }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT c.*, bo.name AS buyer_org_name, so.name AS supplier_org_name
     FROM contracts c
     LEFT JOIN organizations bo ON bo.id = c.buyer_org_id
     LEFT JOIN organizations so ON so.id = c.supplier_org_id
     ${whereClause}
     ORDER BY c.valid_until ASC NULLS LAST, c.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function updateContract(pool, id, data, actorId) {
  const allowed = [
    'title', 'description', 'terms_summary', 'file_ref',
    'valid_from', 'valid_until', 'internal_notes', 'status'
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
    `UPDATE contracts SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  if (rows[0] && actorId) {
    await auditLog.writeAudit(pool, {
      action: 'contract.updated', entity_type: 'contract', entity_id: id,
      actor_id: actorId, details: { changed_fields: Object.keys(data) }
    });
  }
  return rows[0] || null;
}

/* ── Lifecycle ─────────────────────────────────────────── */

export function activateContract(pool, id, actorId) {
  return updateContract(pool, id, { status: 'active' }, actorId);
}

export async function terminateContract(pool, id, actorId, reason) {
  return await withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE contracts
       SET status = 'terminated', terminated_by = $2, terminated_at = NOW(),
           termination_reason = $3, updated_at = NOW()
       WHERE id = $1 AND status IN ('draft','active')
       RETURNING *`,
      [id, actorId, reason || null]
    );
    if (rows[0]) {
      await auditLog.writeAudit(client, {
        action: 'contract.terminated', entity_type: 'contract', entity_id: id,
        actor_id: actorId, details: { reason }
      });
    }
    return rows[0] || null;
  });
}

/** Batch: expire contracts past valid_until (for cron). */
export async function expireBatch(pool, limit = 100) {
  const { rowCount } = await pool.query(
    `UPDATE contracts SET status = 'expired', updated_at = NOW()
     WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE
     LIMIT $1`,
    [limit]
  );
  return { expired: rowCount };
}

/** Contracts expiring within N days (for alerts). */
export async function findExpiring(pool, daysAhead = 30, limit = 100) {
  const threshold = new Date(Date.now() + daysAhead * 86400000);
  const { rows } = await pool.query(
    `SELECT c.*, bo.name AS buyer_org_name, so.name AS supplier_org_name
     FROM contracts c
     LEFT JOIN organizations bo ON bo.id = c.buyer_org_id
     LEFT JOIN organizations so ON so.id = c.supplier_org_id
     WHERE c.status = 'active' AND c.valid_until IS NOT NULL AND c.valid_until <= $1
     ORDER BY c.valid_until ASC LIMIT $2`,
    [threshold, limit]
  );
  return rows;
}
