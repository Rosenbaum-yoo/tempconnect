/**
 * Document-Center-Service: zentraler Dokumenten-Tresor (PDF-Center) fuer org-eigene
 * Geschaeftsdokumente (Rechnungen, Vertraege, Policies, Reports). Org-scoped CRUD.
 * Bewusst GETRENNT von complianceDocService (eigener Ampel-/Verifizierungs-Workflow dort).
 */

const UPDATABLE = ["title", "document_type", "content_category", "valid_from", "valid_until", "retention_delete_at", "notes"];

export async function uploadDocument(pool, data) {
  const { rows } = await pool.query(
    `INSERT INTO document_center
       (org_id, uploaded_by, document_type, content_category, title, file_ref,
        original_name, mime_type, file_size_bytes, source, source_ref,
        valid_from, valid_until, retention_delete_at, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      data.org_id, data.uploaded_by || null,
      data.document_type || "other", data.content_category || "operational",
      data.title, data.file_ref || null,
      data.original_name || null, data.mime_type || null, data.file_size_bytes || null,
      data.source || "upload", data.source_ref || null,
      data.valid_from || null, data.valid_until || null,
      data.retention_delete_at || null, data.notes || null
    ]
  );
  return rows[0];
}

export async function getDocumentById(pool, id) {
  const { rows } = await pool.query(
    `SELECT dc.*, o.name AS org_name,
            u.email AS uploaded_by_email, u.company_name AS uploaded_by_name
     FROM document_center dc
     LEFT JOIN organizations o ON o.id = dc.org_id
     LEFT JOIN users u ON u.id = dc.uploaded_by
     WHERE dc.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function listDocuments(pool, filters = {}) {
  const params = [];
  const where = [];
  let idx = 1;
  if (filters.org_id) { where.push(`dc.org_id = $${idx}`); params.push(filters.org_id); idx++; }
  if (filters.document_type) { where.push(`dc.document_type = $${idx}`); params.push(filters.document_type); idx++; }
  if (filters.content_category) { where.push(`dc.content_category = $${idx}`); params.push(filters.content_category); idx++; }
  if (filters.status) { where.push(`dc.status = $${idx}`); params.push(filters.status); idx++; }
  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
  const limit = Math.min(200, filters.limit || 100);
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT dc.*, o.name AS org_name
     FROM document_center dc
     LEFT JOIN organizations o ON o.id = dc.org_id
     ${whereClause}
     ORDER BY dc.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

export async function updateDocument(pool, id, data) {
  const fields = [];
  const values = [id];
  let idx = 2;
  for (const key of UPDATABLE) {
    if (data[key] !== undefined) { fields.push(`${key} = $${idx}`); values.push(data[key]); idx++; }
  }
  if (fields.length === 0) return null;
  fields.push("updated_at = NOW()");
  const { rows } = await pool.query(
    `UPDATE document_center SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function setStatus(pool, id, status) {
  const { rows } = await pool.query(
    `UPDATE document_center SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return rows[0] || null;
}

export async function deleteDocument(pool, id) {
  const { rowCount } = await pool.query(`DELETE FROM document_center WHERE id = $1`, [id]);
  return rowCount > 0;
}

export async function centerStats(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT document_type, content_category, status, COALESCE(file_size_bytes,0) AS sz
     FROM document_center WHERE org_id = $1`,
    [orgId]
  );
  const stats = { total: rows.length, active: 0, archived: 0, total_size_bytes: 0, by_type: {}, by_category: {} };
  for (const r of rows) {
    if (r.status === "archived") stats.archived++; else stats.active++;
    stats.total_size_bytes += Number(r.sz) || 0;
    stats.by_type[r.document_type] = (stats.by_type[r.document_type] || 0) + 1;
    stats.by_category[r.content_category] = (stats.by_category[r.content_category] || 0) + 1;
  }
  return stats;
}

/** Retention-Sweep (Cron, DSGVO/GoBD): Dokumente mit abgelaufenem retention_delete_at. */
export async function findRetentionDue(pool, limit = 200) {
  const { rows } = await pool.query(
    `SELECT id, org_id, file_ref FROM document_center
     WHERE retention_delete_at IS NOT NULL AND retention_delete_at < NOW()
     ORDER BY retention_delete_at ASC LIMIT $1`,
    [limit]
  );
  return rows;
}

/** Retention-Purge (Cron, DSGVO/GoBD): loescht atomar die faelligen Zeilen und gibt deren
 *  file_refs zurueck, damit der Aufrufer die Dateien physisch entfernt (echte Loeschung). */
export async function purgeRetentionDue(pool, { limit = 200 } = {}) {
  const { rows } = await pool.query(
    `DELETE FROM document_center
     WHERE id IN (
       SELECT id FROM document_center
       WHERE retention_delete_at IS NOT NULL AND retention_delete_at < NOW()
       ORDER BY retention_delete_at ASC LIMIT $1
     )
     RETURNING id, file_ref`,
    [limit]
  );
  return { deleted: rows.length, file_refs: rows.filter((r) => r.file_ref).map((r) => r.file_ref) };
}
