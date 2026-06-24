/**
 * scimService — SCIM 2.0 User-Provisioning (Welle B2).
 *
 * Modell: SCIM verwaltet die ORG-MITGLIEDSCHAFT. Ein HR-/IdP-System kann Nutzer in die EIGENE
 * Org provisionieren (find-or-create User + org_membership) und wieder deaktivieren. Spiegelt den
 * bestehenden SSO-Auto-Provisioning-Pfad (users ohne password_hash, org_memberships role_key='member').
 * Deprovisioning = Mitgliedschaft deaktivieren (NICHT den globalen User löschen → multi-org-sicher).
 * Streng org-gebunden über die orgId aus dem API-Key/M2M-Token. Nur aktiv bei SCIM_ENABLED.
 */

export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
export const SCIM_PATCHOP_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

/** SCIM-Error-Body (RFC 7644 §3.12). */
export function scimError(status, detail, scimType) {
  const e = { schemas: [SCIM_ERROR_SCHEMA], status: String(status), detail };
  if (scimType) e.scimType = scimType;
  return e;
}

/** users-Row (+ membership_active) → SCIM-User-Resource. */
export function toScimUser(row, baseUrl = "") {
  const name = (row.company_name || row.email || "").trim();
  const sp = name.indexOf(" ");
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: row.id,
    userName: row.email,
    name: { formatted: name, givenName: sp > 0 ? name.slice(0, sp) : name, familyName: sp > 0 ? name.slice(sp + 1) : "" },
    displayName: name,
    emails: row.email ? [{ value: row.email, primary: true }] : [],
    active: row.membership_active !== false,
    meta: { resourceType: "User", location: base + "/api/scim/v2/Users/" + row.id }
  };
}

/** Parst einen einfachen SCIM-Filter `userName eq "x@y.de"` → email|null. */
export function parseUserNameFilter(filter) {
  if (!filter || typeof filter !== "string") return null;
  const m = filter.match(/userName\s+eq\s+"([^"]+)"/i);
  return m ? m[1] : null;
}

/** Org-Mitglieder auflisten (optional userName-Filter). → { total, resources } */
export async function listUsers(pool, orgId, { filterEmail = null, startIndex = 1, count = 100 } = {}) {
  const params = [orgId];
  let where = "m.org_id = $1";
  if (filterEmail) { params.push(String(filterEmail).toLowerCase()); where += ` AND LOWER(u.email) = $${params.length}`; }
  const lim = Math.min(Math.max(1, Number(count) || 100), 200);
  const off = Math.max(0, (Number(startIndex) || 1) - 1);
  const { rows: cnt } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM org_memberships m JOIN users u ON u.id = m.user_id WHERE ${where}`, params);
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.company_name, m.is_active AS membership_active
       FROM org_memberships m JOIN users u ON u.id = m.user_id
      WHERE ${where} ORDER BY u.created_at DESC LIMIT ${lim} OFFSET ${off}`, params);
  return { total: cnt[0]?.n || 0, resources: rows };
}

/** Einzelnen Org-Member holen (null wenn nicht in dieser Org). */
export async function getUser(pool, orgId, userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.company_name, m.is_active AS membership_active
       FROM org_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1 AND u.id = $2 LIMIT 1`, [orgId, userId]);
  return rows[0] || null;
}

/**
 * Provisioniert einen Nutzer in die Org (find-or-create + Mitgliedschaft), transaktional.
 * @returns {Promise<{ row: object, created: boolean }>}
 */
export async function provisionUser(pool, orgId, { userName, displayName }) {
  const email = String(userName || "").trim().toLowerCase();
  if (!email || email.indexOf("@") < 1) {
    throw Object.assign(new Error("INVALID_USERNAME"), { code: "INVALID_USERNAME" });
  }
  const name = (String(displayName || "").trim()) || email;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: ex } = await client.query("SELECT id FROM users WHERE LOWER(email) = $1", [email]);
    let userId, created = false;
    if (ex[0]) {
      userId = ex[0].id;
    } else {
      const { rows: nu } = await client.query(
        `INSERT INTO users (email, role, company_name, is_verified, org_id)
         VALUES ($1, 'company', $2, TRUE, $3) RETURNING id`, [email, name, orgId]);
      userId = nu[0].id;
      created = true;
      await client.query(
        "INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end) VALUES ($1,'DEMO','active',NOW(),NOW() + INTERVAL '14 days')",
        [userId]);
    }
    // Mitgliedschaft sicherstellen + aktivieren (robust ohne Annahme über Conflict-Target).
    await client.query(
      `INSERT INTO org_memberships (user_id, org_id, role_key, is_active, created_at, updated_at)
       VALUES ($1, $2, 'member', TRUE, NOW(), NOW()) ON CONFLICT DO NOTHING`, [userId, orgId]);
    await client.query(
      "UPDATE org_memberships SET is_active = TRUE, updated_at = NOW() WHERE user_id = $1 AND org_id = $2",
      [userId, orgId]);
    await client.query("COMMIT");
    const row = await getUser(pool, orgId, userId);
    return { row, created };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

/** Mitgliedschaft (de)aktivieren. → aktualisierte Row oder null (nicht in Org). */
export async function setMembershipActive(pool, orgId, userId, active) {
  const { rowCount } = await pool.query(
    "UPDATE org_memberships SET is_active = $3, updated_at = NOW() WHERE org_id = $1 AND user_id = $2",
    [orgId, userId, !!active]);
  if (!rowCount) return null;
  return getUser(pool, orgId, userId);
}

/** Liest aus einem SCIM-PatchOp- ODER simplen Body den gewünschten active-Wert. → boolean|null */
export function extractActiveFromPatch(body) {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body.Operations)) {
    for (const op of body.Operations) {
      const path = (op.path || "").toLowerCase();
      if (path === "active" || (!op.path && op.value && typeof op.value === "object" && "active" in op.value)) {
        const v = op.path ? op.value : op.value.active;
        return v === true || v === "true";
      }
    }
    return null;
  }
  if ("active" in body) return body.active === true || body.active === "true";
  return null;
}
