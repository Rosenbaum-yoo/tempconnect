/**
 * Org-Boundary Helpers — verhindert Cross-Org-Zugriff auf Datenschicht.
 *
 * Nutzung:
 *   await assertOrgOwnership(pool, 'requisitions', reqId, req.orgId);
 *   // wirft OrgBoundaryError(403) wenn Resource nicht zur Org gehoert
 *
 *   await assertUserOwnership(pool, 'listings', listingId, userId);
 *   // wirft OrgBoundaryError(403) wenn Resource nicht dem User gehoert
 */

/**
 * Custom Error fuer Org-Boundary-Verletzungen.
 * Hat status = 403 fuer den Error-Handler.
 */
export class OrgBoundaryError extends Error {
  constructor(message = "Zugriff verweigert: Resource gehoert nicht zu Ihrer Organisation.") {
    super(message);
    this.name = "OrgBoundaryError";
    this.status = 403;
    this.code = "ORG_BOUNDARY_VIOLATION";
  }
}

/**
 * Pruefe ob eine Resource (via org_id Spalte) zur angegebenen Org gehoert.
 * @param {import('pg').Pool} pool
 * @param {string} tableName — MUSS ein bekannter Tabellenname sein (kein User-Input!)
 * @param {string} resourceId — UUID der Resource
 * @param {string} orgId — UUID der Org des aktuellen Users
 * @param {{ orgColumn?: string }} opts — optional: Name der org_id Spalte (default: 'org_id')
 * @throws {OrgBoundaryError} wenn Resource nicht zur Org gehoert oder nicht existiert
 */
const ALLOWED_TABLES = new Set([
  "requisitions", "assignments", "contracts", "approval_requests",
  "compliance_documents", "notifications", "org_settings",
  "capacity_posts", "listings", "requests", "ratings",
  "payment_sessions", "vendor_pool", "platform_events",
  "sla_search_jobs", "offers", "submissions"
]);

export async function assertOrgOwnership(pool, tableName, resourceId, orgId, opts = {}) {
  if (!orgId) throw new OrgBoundaryError("Keine Organisation zugewiesen.");
  if (!resourceId) throw new OrgBoundaryError("Keine Resource-ID angegeben.");
  if (!ALLOWED_TABLES.has(tableName)) throw new Error(`assertOrgOwnership: unbekannte Tabelle '${tableName}'`);

  const col = opts.orgColumn || "org_id";
  const { rows } = await pool.query(
    `SELECT ${col} FROM ${tableName} WHERE id = $1 LIMIT 1`,
    [resourceId]
  );
  if (!rows.length) {
    const err = new Error("Resource nicht gefunden.");
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  if (String(rows[0][col]) !== String(orgId)) {
    throw new OrgBoundaryError();
  }
}

/**
 * Pruefe ob eine Resource dem angegebenen User gehoert (fuer Legacy-Tabellen ohne org_id).
 * @param {import('pg').Pool} pool
 * @param {string} tableName
 * @param {string} resourceId
 * @param {string} userId
 * @param {{ userColumn?: string }} opts — Name der User-Spalte (default: 'owner_id')
 */
export async function assertUserOwnership(pool, tableName, resourceId, userId, opts = {}) {
  if (!userId) throw new OrgBoundaryError("Kein User authentifiziert.");
  if (!resourceId) throw new OrgBoundaryError("Keine Resource-ID angegeben.");
  if (!ALLOWED_TABLES.has(tableName)) throw new Error(`assertUserOwnership: unbekannte Tabelle '${tableName}'`);

  const col = opts.userColumn || "owner_id";
  const { rows } = await pool.query(
    `SELECT ${col} FROM ${tableName} WHERE id = $1 LIMIT 1`,
    [resourceId]
  );
  if (!rows.length) {
    const err = new Error("Resource nicht gefunden.");
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  if (String(rows[0][col]) !== String(userId)) {
    throw new OrgBoundaryError("Zugriff verweigert: Resource gehoert nicht Ihnen.");
  }
}

/**
 * Bequemer 403-Response-Helper fuer Routes die keinen throw nutzen wollen.
 */
export function sendOrgBoundaryError(res, message) {
  return res.status(403).json({
    success: false,
    error: { code: "ORG_BOUNDARY_VIOLATION", message: message || "Zugriff verweigert." }
  });
}
