/**
 * Compliance-Document-Service: CRUD fuer Lieferantendokumente,
 * Ampellogik (gruen/gelb/rot), Ablauf-Reminder, Statistik pro Org.
 */

/** Ampelfarbe: Wie viele Tage bis Ablauf? */
export function trafficLight(validUntil) {
  if (!validUntil) return 'grey';  // kein Ablaufdatum
  const daysLeft = Math.ceil((new Date(validUntil) - Date.now()) / 86400000);
  if (daysLeft < 0) return 'red';
  if (daysLeft <= 30) return 'yellow';
  return 'green';
}

/* ── CRUD ─────────────────────────────────────────────── */

export async function uploadDocument(pool, data) {
  const { rows } = await pool.query(
    `INSERT INTO compliance_documents
     (org_id, uploaded_by, doc_type, doc_name, file_ref, status,
      valid_from, valid_until, notes)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
     RETURNING *`,
    [
      data.org_id, data.uploaded_by, data.doc_type,
      data.doc_name, data.file_ref || null,
      data.valid_from || null, data.valid_until || null,
      data.notes || null
    ]
  );
  return rows[0];
}

export async function getDocumentById(pool, id) {
  const { rows } = await pool.query(
    `SELECT cd.*, o.name AS org_name,
            u_up.email AS uploaded_by_email, u_up.company_name AS uploaded_by_name,
            u_ver.email AS verified_by_email
     FROM compliance_documents cd
     LEFT JOIN organizations o ON o.id = cd.org_id
     LEFT JOIN users u_up ON u_up.id = cd.uploaded_by
     LEFT JOIN users u_ver ON u_ver.id = cd.verified_by
     WHERE cd.id = $1`,
    [id]
  );
  const doc = rows[0] || null;
  if (doc) doc.traffic_light = trafficLight(doc.valid_until);
  return doc;
}

export async function listDocuments(pool, filters = {}) {
  const params = [];
  const where = [];
  let idx = 1;

  if (filters.org_id) { where.push(`cd.org_id = $${idx}`); params.push(filters.org_id); idx++; }
  if (filters.doc_type) { where.push(`cd.doc_type = $${idx}`); params.push(filters.doc_type); idx++; }
  if (filters.status) { where.push(`cd.status = $${idx}`); params.push(filters.status); idx++; }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT cd.*, o.name AS org_name
     FROM compliance_documents cd
     LEFT JOIN organizations o ON o.id = cd.org_id
     ${whereClause}
     ORDER BY cd.valid_until ASC NULLS LAST, cd.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows.map(d => ({ ...d, traffic_light: trafficLight(d.valid_until) }));
}

export async function updateDocument(pool, id, data) {
  const allowed = ['doc_name', 'file_ref', 'valid_from', 'valid_until', 'notes', 'doc_type'];
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
    `UPDATE compliance_documents SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function verifyDocument(pool, id, verifierId) {
  const { rows } = await pool.query(
    `UPDATE compliance_documents
     SET status = 'verified', verified_by = $2, verified_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, verifierId]
  );
  return rows[0] || null;
}

export async function rejectDocument(pool, id, verifierId, reason) {
  const { rows } = await pool.query(
    `UPDATE compliance_documents
     SET status = 'rejected', verified_by = $2, verified_at = NOW(),
         rejection_reason = $3, updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, verifierId, reason || null]
  );
  return rows[0] || null;
}

export async function deleteDocument(pool, id) {
  const { rowCount } = await pool.query(
    `DELETE FROM compliance_documents WHERE id = $1`, [id]
  );
  return rowCount > 0;
}

/* ── Ampel-Statistik pro Org ──────────────────────────── */

export async function complianceStats(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT cd.doc_type, cd.status, cd.valid_until
     FROM compliance_documents cd
     WHERE cd.org_id = $1`,
    [orgId]
  );
  const stats = { total: rows.length, verified: 0, pending: 0, rejected: 0, expired: 0, expiring_soon: 0 };
  const byType = {};
  for (const r of rows) {
    if (r.status === 'verified') stats.verified++;
    else if (r.status === 'pending') stats.pending++;
    else if (r.status === 'rejected') stats.rejected++;
    else if (r.status === 'expired') stats.expired++;

    const tl = trafficLight(r.valid_until);
    if (tl === 'red') stats.expired++;
    if (tl === 'yellow') stats.expiring_soon++;

    if (!byType[r.doc_type]) byType[r.doc_type] = { count: 0, traffic_light: 'grey' };
    byType[r.doc_type].count++;
    // Worst-case Ampel pro Typ
    const priority = { red: 3, yellow: 2, green: 1, grey: 0 };
    if (priority[tl] > priority[byType[r.doc_type].traffic_light]) {
      byType[r.doc_type].traffic_light = tl;
    }
  }
  return { ...stats, by_type: byType };
}

/* ── Ablauf-Reminder Batch (fuer Cron-Job) ────────────── */

/**
 * Findet Dokumente, die bald ablaufen (innerhalb daysAhead Tage)
 * und noch keinen Reminder erhalten haben (reminder_sent_at IS NULL).
 */
export async function findExpiringDocuments(pool, daysAhead = 30, limit = 100) {
  const threshold = new Date(Date.now() + daysAhead * 86400000);
  const { rows } = await pool.query(
    `SELECT cd.*, o.name AS org_name, u.email AS uploaded_by_email
     FROM compliance_documents cd
     LEFT JOIN organizations o ON o.id = cd.org_id
     LEFT JOIN users u ON u.id = cd.uploaded_by
     WHERE cd.status = 'verified'
       AND cd.valid_until IS NOT NULL
       AND cd.valid_until <= $1
       AND cd.reminder_sent_at IS NULL
     ORDER BY cd.valid_until ASC
     LIMIT $2`,
    [threshold, limit]
  );
  return rows;
}

export async function markReminderSent(pool, docId) {
  await pool.query(
    `UPDATE compliance_documents SET reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [docId]
  );
}

/** Batch: Alle abgelaufenen Dokumente auf 'expired' setzen */
export async function expireBatch(pool, limit = 200) {
  const { rowCount } = await pool.query(
    `UPDATE compliance_documents
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'verified' AND valid_until < NOW()
     LIMIT $1`,
    [limit]
  );
  return { expired: rowCount };
}
