/**
 * companyComplaintService — Beschwerde-Meldung (P3.2).
 * Ein einsetzendes Unternehmen (Käufer-Org) meldet ein Problem mit einer Kraft.
 * Der Service löst Agentur + Disponent aus dem aktuellen Einsatz der Kraft beim
 * Unternehmen auf, damit die Route den richtigen Disponenten benachrichtigen kann
 * (der dann via P1.1 Ersatz stellen kann).
 */

export const COMPLAINT_SEVERITIES = Object.freeze(["low", "medium", "high"]);

/**
 * Beschwerde anlegen. Kontext (supplier_org_id, Disponent, Worker-Name) wird aus dem
 * aktuellen/jüngsten Einsatz der Kraft BEIM meldenden Unternehmen aufgelöst (org-gescoped).
 * @returns {{complaint, dispatcherUserId, supplierOrgId, workerName}|{error}}
 */
export async function fileComplaint(pool, {
  companyOrgId, workerUserId, assignmentLinkId = null, severity = "medium", reason, createdBy = null
}) {
  if (!companyOrgId || !workerUserId || !reason) return { error: "MISSING_PARAMS" };
  if (!COMPLAINT_SEVERITIES.includes(severity)) severity = "medium";

  // Einsatz-Kontext: NUR Links dieser Kraft BEIM meldenden Unternehmen (org_id = companyOrgId).
  const params = [workerUserId, companyOrgId];
  let linkClause = "AND wal.is_active = TRUE";
  if (assignmentLinkId) { params.push(assignmentLinkId); linkClause = `AND wal.id = $3`; }
  const { rows: ctx } = await pool.query(
    `SELECT wal.id AS link_id, wal.supplier_org_id, wal.created_by AS dispatcher_user_id,
            wp.first_name, wp.last_name
       FROM worker_assignment_links wal
       LEFT JOIN worker_profiles wp ON wp.user_id = wal.worker_user_id
      WHERE wal.worker_user_id = $1 AND wal.org_id = $2 ${linkClause}
      ORDER BY wal.is_active DESC, wal.start_date DESC
      LIMIT 1`,
    params
  );
  const c = ctx[0] || {};

  const { rows } = await pool.query(
    `INSERT INTO worker_complaints
       (company_org_id, worker_user_id, supplier_org_id, assignment_link_id, severity, reason, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [companyOrgId, workerUserId, c.supplier_org_id || null, c.link_id || null, severity, reason, createdBy]
  );

  const workerName = ((c.first_name || "") + " " + (c.last_name || "")).trim() || null;
  return {
    complaint: rows[0],
    dispatcherUserId: c.dispatcher_user_id || null,
    supplierOrgId: c.supplier_org_id || null,
    workerName
  };
}

/**
 * Beschwerden eines Unternehmens (Käufer-Sicht).
 */
export async function listCompanyComplaints(pool, companyOrgId, { status = null } = {}) {
  const params = [companyOrgId];
  let statusClause = "";
  if (status) { params.push(status); statusClause = `AND c.status = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT c.id, c.worker_user_id, c.supplier_org_id, c.severity, c.reason, c.status, c.created_at,
            wp.first_name, wp.last_name, wp.personnel_number,
            so.name AS agency_name
       FROM worker_complaints c
       LEFT JOIN worker_profiles wp ON wp.user_id = c.worker_user_id
       LEFT JOIN organizations so ON so.id = c.supplier_org_id
      WHERE c.company_org_id = $1 ${statusClause}
      ORDER BY c.created_at DESC`,
    params
  );
  return rows;
}
