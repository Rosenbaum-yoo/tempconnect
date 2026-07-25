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
 * Chef-Hinweis (P3.3): alle AKTIVEN Sperren, die die eigene Belegschaft betreffen —
 * „wer ist bei welchem Kunden gesperrt". Damit zeigt die Dispositions-UI die Sperre
 * schon bei der Auswahl an, statt den Disponenten erst am 409 auflaufen zu lassen.
 *
 * Scoping über die eigene Belegschaft (`worker_profiles.supplier_org_id = $1`), nicht über
 * `blocklist.supplier_org_id` — letzteres ist nur ein abgeleiteter Kontext und kann NULL sein.
 * Nutzt den in Mig 149 genau dafür angelegten Index `(worker_user_id)`.
 */
export async function listBlocksForSupplier(pool, supplierOrgId) {
  if (!supplierOrgId) return [];
  const { rows } = await pool.query(
    `SELECT b.worker_user_id, b.company_org_id, b.reason, b.blocked_until,
            co.name AS company_name
       FROM company_worker_blocklist b
       JOIN worker_profiles wp ON wp.user_id = b.worker_user_id
       LEFT JOIN organizations co ON co.id = b.company_org_id
      WHERE wp.supplier_org_id = $1
        AND (b.blocked_until IS NULL OR b.blocked_until >= CURRENT_DATE)
      ORDER BY b.created_at DESC`,
    [supplierOrgId]
  );
  return rows;
}

/**
 * Kraft sperren / Sperre aktualisieren (Upsert je company+worker).
 *
 * Beziehungs-Nachweis (Pflicht): gesperrt werden kann NUR eine Kraft, die bei diesem
 * Unternehmen tatsächlich im Einsatz ist oder war (`worker_assignment_links.org_id`).
 * Sonst könnte eine Käufer-Org beliebige Worker-UUIDs auf ihre Sperrliste schreiben und
 * damit fremde Kräfte für sich blockieren, die sie nie gesehen hat.
 *
 * Die Herkunfts-Agentur (`supplier_org_id`) wird dabei SERVER-SEITIG aus dem echten
 * Einsatz abgeleitet — nie aus dem Request übernommen (sonst falsche Zuordnung).
 * Alles in EINER Anweisung: race-frei und ohne zusätzlichen Roundtrip.
 *
 * @param {object} opts blockedUntil: null = unbefristet ("nie wieder").
 * @returns {{block}|{error:"MISSING_PARAMS"|"NO_ASSIGNMENT_RELATION"}}
 */
export async function blockWorkerForCompany(pool, {
  companyOrgId, workerUserId, reason = null, blockedUntil = null, createdBy = null
}) {
  if (!companyOrgId || !workerUserId) return { error: "MISSING_PARAMS" };
  const { rows } = await pool.query(
    `INSERT INTO company_worker_blocklist
       (company_org_id, worker_user_id, supplier_org_id, reason, blocked_until, created_by)
     SELECT $1, $2, rel.supplier_org_id, $3, $4, $5
       FROM (SELECT wal.supplier_org_id
               FROM worker_assignment_links wal
              WHERE wal.worker_user_id = $2 AND wal.org_id = $1
              ORDER BY wal.is_active DESC, wal.start_date DESC
              LIMIT 1) rel
     ON CONFLICT (company_org_id, worker_user_id) DO UPDATE
       SET reason = EXCLUDED.reason,
           blocked_until = EXCLUDED.blocked_until,
           supplier_org_id = COALESCE(EXCLUDED.supplier_org_id, company_worker_blocklist.supplier_org_id),
           updated_at = NOW()
     RETURNING *`,
    [companyOrgId, workerUserId, reason, blockedUntil, createdBy]
  );
  if (!rows[0]) return { error: "NO_ASSIGNMENT_RELATION" };
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
