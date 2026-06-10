/**
 * staffDataGovernanceService — org-uebergreifende DSGVO-Lesesicht fuer das Staff-Center.
 * Staff laeuft in eigenem Auth-Kontext und darf (read-only) ueber alle Orgs sehen.
 * Bewusst getrennt vom org-scoped dataGovernanceService (der org_id-gebunden ist).
 */

/** Liste aller DSGVO-Anfragen (optional Status-Filter), neueste zuerst. Limit hart geklemmt. */
export async function listGovernanceRequests(pool, { limit = 100, status = null } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 100));
  const params = [];
  let where = "";
  if (status) { params.push(status); where = `WHERE dgr.status = $${params.length}`; }
  params.push(lim);
  const { rows } = await pool.query(
    `SELECT dgr.id, dgr.org_id, dgr.request_type, dgr.subject_type, dgr.subject_id,
            dgr.status, dgr.created_at, dgr.completed_at, dgr.notes,
            o.name AS org_name, u.email AS requester_email
     FROM data_governance_requests dgr
     LEFT JOIN organizations o ON o.id = dgr.org_id
     LEFT JOIN users u ON u.id = dgr.requested_by
     ${where}
     ORDER BY dgr.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

/** Status-Zaehlungen (pending/in_progress/completed/rejected/cancelled) ueber alle Orgs. */
export async function getGovernanceStatusCounts(pool) {
  const { rows } = await pool.query(
    "SELECT status, COUNT(*)::int AS n FROM data_governance_requests GROUP BY status"
  );
  const counts = {};
  rows.forEach((r) => { counts[r.status] = r.n; });
  return counts;
}

/** Flache Zeilen fuer den CSV-Export ("alle DSGVO-Sachen runterziehen"). Limit hart geklemmt. */
export async function listGovernanceRequestsForCsv(pool, { limit = 5000 } = {}) {
  const lim = Math.min(10000, Math.max(1, Number(limit) || 5000));
  const { rows } = await pool.query(
    `SELECT dgr.id, o.name AS org_name, dgr.request_type, dgr.subject_type, dgr.status,
            u.email AS requester_email, dgr.created_at, dgr.completed_at
     FROM data_governance_requests dgr
     LEFT JOIN organizations o ON o.id = dgr.org_id
     LEFT JOIN users u ON u.id = dgr.requested_by
     ORDER BY dgr.created_at DESC
     LIMIT $1`,
    [lim]
  );
  return rows;
}
