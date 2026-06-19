// Support-Vendor-/Agenten-Verwaltung fuer das Staff Control Center.
// Daten-/Mutations-Layer ueber support_vendors + support_agents (vgl. CLI
// scripts/support-access-cli.js + Gate api/middleware/supportAccess.js).
// Alle Funktionen geben {ok, row|rows} oder {ok:false, error} zurueck.

const INTERNAL_ROLES = ["internal_support_agent", "internal_support_lead", "support_auditor"];
const EXTERNAL_ROLES = ["external_support_agent", "external_support_supervisor"];
const VALID_DATA_SCOPES = ["full_internal", "assigned_only", "vendor_scoped"];
const DEFAULT_DATA_SCOPE = {
  internal_support_lead: "full_internal", internal_support_agent: "assigned_only", support_auditor: "full_internal",
  external_support_agent: "vendor_scoped", external_support_supervisor: "vendor_scoped",
};
const CIDR_RE = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;

export const SUPPORT_ROLES = [...INTERNAL_ROLES, ...EXTERNAL_ROLES];

export async function listVendors(pool) {
  const { rows } = await pool.query(
    `SELECT v.id, v.name, v.contract_ref, v.status, v.is_active, v.allowed_ip_cidrs,
            v.verified_at, v.created_at,
            (SELECT COUNT(*) FROM support_agents a WHERE a.vendor_id = v.id AND a.is_active = TRUE)::int AS active_agents
       FROM support_vendors v
      ORDER BY v.created_at DESC`
  );
  return { ok: true, rows };
}

export async function getVendorDetail(pool, vendorId) {
  const { rows } = await pool.query(
    `SELECT id, name, contract_ref, status, is_active, allowed_ip_cidrs, verified_at, verified_by, created_at, updated_at
       FROM support_vendors WHERE id = $1::uuid`,
    [vendorId]
  );
  if (!rows[0]) return { ok: false, error: "NOT_FOUND" };
  const { rows: agents } = await pool.query(
    `SELECT a.id, u.email, a.role, a.scope, a.data_scope, a.is_active, a.created_at
       FROM support_agents a JOIN users u ON u.id = a.user_id
      WHERE a.vendor_id = $1::uuid ORDER BY a.is_active DESC, a.created_at DESC`,
    [vendorId]
  );
  return { ok: true, row: { ...rows[0], agents } };
}

export async function createVendor(pool, { name, contractRef }) {
  const clean = String(name || "").trim();
  if (!clean) return { ok: false, error: "NAME_REQUIRED" };
  const { rows } = await pool.query(
    `INSERT INTO support_vendors (name, contract_ref, is_active, status)
     VALUES ($1, $2, FALSE, 'pending')
     RETURNING id, name, contract_ref, status, is_active`,
    [clean, contractRef ? String(contractRef).trim() : null]
  );
  return { ok: true, row: rows[0] };
}

export async function verifyVendor(pool, { vendorId, actorUserId }) {
  const { rows } = await pool.query(
    `UPDATE support_vendors
        SET status = 'active', is_active = TRUE, verified_at = NOW(), verified_by = $2::uuid, updated_at = NOW()
      WHERE id = $1::uuid
    RETURNING id, name, status, is_active, verified_at`,
    [vendorId, actorUserId || null]
  );
  if (!rows[0]) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, row: rows[0] };
}

export async function setVendorStatus(pool, { vendorId, status, actorUserId }) {
  if (status === "active") return verifyVendor(pool, { vendorId, actorUserId });
  if (status !== "suspended") return { ok: false, error: "INVALID_STATUS" };
  const { rows } = await pool.query(
    `UPDATE support_vendors SET status = 'suspended', is_active = FALSE, updated_at = NOW()
      WHERE id = $1::uuid RETURNING id, name, status, is_active`,
    [vendorId]
  );
  if (!rows[0]) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, row: rows[0] };
}

export async function setVendorIps(pool, { vendorId, cidrs }) {
  const list = Array.isArray(cidrs) ? cidrs.map((s) => String(s).trim()).filter(Boolean) : [];
  for (const c of list) {
    if (!CIDR_RE.test(c)) return { ok: false, error: "INVALID_CIDR" };
  }
  const { rows } = await pool.query(
    `UPDATE support_vendors SET allowed_ip_cidrs = $2::text[], updated_at = NOW()
      WHERE id = $1::uuid RETURNING id, name, allowed_ip_cidrs`,
    [vendorId, list]
  );
  if (!rows[0]) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, row: rows[0] };
}

async function resolveUserByEmail(pool, email) {
  const clean = String(email || "").trim();
  if (!clean) return null;
  const { rows } = await pool.query("SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [clean]);
  return rows[0] || null;
}

export async function addAgent(pool, { email, role, vendorId, dataScope }) {
  if (!SUPPORT_ROLES.includes(role)) return { ok: false, error: "INVALID_ROLE" };
  const isExternal = EXTERNAL_ROLES.includes(role);
  const scope = isExternal ? "external" : "internal";
  if (isExternal && !vendorId) return { ok: false, error: "VENDOR_REQUIRED" };
  const finalScopeVendor = isExternal ? vendorId : null;
  const ds = dataScope || DEFAULT_DATA_SCOPE[role];
  if (!VALID_DATA_SCOPES.includes(ds)) return { ok: false, error: "INVALID_DATA_SCOPE" };

  const user = await resolveUserByEmail(pool, email);
  if (!user) return { ok: false, error: "USER_NOT_FOUND" };

  const existing = await pool.query("SELECT id FROM support_agents WHERE user_id = $1::uuid LIMIT 1", [user.id]);
  let rows;
  if (existing.rows[0]) {
    ({ rows } = await pool.query(
      `UPDATE support_agents SET role = $2, scope = $3, vendor_id = $4::uuid, data_scope = $5, is_active = TRUE, updated_at = NOW()
        WHERE user_id = $1::uuid RETURNING id, user_id, role, scope, vendor_id, data_scope, is_active`,
      [user.id, role, scope, finalScopeVendor, ds]
    ));
  } else {
    ({ rows } = await pool.query(
      `INSERT INTO support_agents (user_id, role, scope, vendor_id, data_scope, is_active)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5, TRUE)
       RETURNING id, user_id, role, scope, vendor_id, data_scope, is_active`,
      [user.id, role, scope, finalScopeVendor, ds]
    ));
  }
  return { ok: true, row: { ...rows[0], email: user.email } };
}

export async function suspendAgent(pool, { agentId }) {
  const { rows } = await pool.query(
    `UPDATE support_agents SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1::uuid RETURNING id, user_id, role, is_active`,
    [agentId]
  );
  if (!rows[0]) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, row: rows[0] };
}
