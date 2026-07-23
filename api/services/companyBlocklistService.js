/**
 * companyBlocklistService — Sperrliste (P3.3).
 * Ein einsetzendes Unternehmen (Käufer-Org) sperrt eine konkrete Kraft — unbefristet
 * oder befristet. Der Zuweisungs-Guard (workerService.createAssignmentLink /
 * replaceAssignmentWorker) lehnt gesperrte Kräfte ab (BLOCKED_BY_COMPANY).
 *
 * Aktive Sperre = blocked_until IS NULL OR blocked_until >= CURRENT_DATE.
 * `db` kann pool ODER ein Transaktions-Client sein.
 */

/**
 * Guard-Check: ist Worker bei diesem Unternehmen AKTIV gesperrt?
 * @returns {Promise<{id,reason,blocked_until}|null>} null = nicht gesperrt.
 */
export async function isWorkerBlockedForCompany(db, companyOrgId, workerUserId) {
  if (!companyOrgId || !workerUserId) return null;
  const { rows } = await db.query(
    `SELECT id, reason, blocked_until
       FROM company_worker_blocklist
      WHERE company_org_id = $1 AND worker_user_id = $2
        AND (blocked_until IS NULL OR blocked_until >= CURRENT_DATE)
      LIMIT 1`,
    [companyOrgId, workerUserId]
  );
  return rows[0] || null;
}

/**
 * Sperrliste eines Unternehmens (Käufer-Sicht). Standard: nur aktive Sperren.
 */
export async function listCompanyBlocklist(pool, companyOrgId, { includeExpired = false } = {}) {
  const activeClause = includeExpired ? "" : "AND (b.blocked_until IS NULL OR b.blocked_until >= CURRENT_DATE)";
  const { rows } = await pool.query(
    `SELECT b.id, b.worker_user_id, b.supplier_org_id, b.reason, b.blocked_until, b.created_at,
            wp.first_name, wp.last_name, wp.personnel_number,
            u.email AS worker_email,
            so.name AS agency_name
       FROM company_worker_blocklist b
       LEFT JOIN users u ON u.id = b.worker_user_id
       LEFT JOIN worker_profiles wp ON wp.user_id = b.worker_user_id
       LEFT JOIN organizations so ON so.id = b.supplier_org_id
      WHERE b.company_org_id = $1 ${activeClause}
      ORDER BY (b.blocked_until IS NULL) DESC, b.created_at DESC`,
    [companyOrgId]
  );
  return rows;
}

/**
 * Kraft sperren / Sperre aktualisieren (Upsert je company+worker).
 * @param {object} opts blockedUntil: null = unbefristet ("nie wieder").
 */
export async function blockWorkerForCompany(pool, {
  companyOrgId, workerUserId, supplierOrgId = null, reason = null, blockedUntil = null, createdBy = null
}) {
  if (!companyOrgId || !workerUserId) return { error: "MISSING_PARAMS" };
  const { rows } = await pool.query(
    `INSERT INTO company_worker_blocklist
       (company_org_id, worker_user_id, supplier_org_id, reason, blocked_until, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (company_org_id, worker_user_id) DO UPDATE
       SET reason = EXCLUDED.reason,
           blocked_until = EXCLUDED.blocked_until,
           supplier_org_id = COALESCE(EXCLUDED.supplier_org_id, company_worker_blocklist.supplier_org_id),
           updated_at = NOW()
     RETURNING *`,
    [companyOrgId, workerUserId, supplierOrgId, reason, blockedUntil, createdBy]
  );
  return { block: rows[0] };
}

/**
 * Sperre aufheben ("wieder frei").
 */
export async function unblockWorkerForCompany(pool, companyOrgId, workerUserId) {
  const { rowCount } = await pool.query(
    `DELETE FROM company_worker_blocklist WHERE company_org_id = $1 AND worker_user_id = $2`,
    [companyOrgId, workerUserId]
  );
  return rowCount > 0;
}
