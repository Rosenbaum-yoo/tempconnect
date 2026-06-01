import crypto from "crypto";
import * as authService from "./authService.js";

export const INTERNAL_ROLE_PERMISSIONS = {
  platform_owner: [
    "internal.platform.read", "internal.platform.write", "internal.platform.execute",
    "internal.support.read", "internal.support.write", "internal.support.execute",
    "internal.operations.read", "internal.operations.write", "internal.operations.execute",
    "internal.audit.read"
  ],
  developer_admin: [
    "internal.platform.read", "internal.platform.write", "internal.platform.execute",
    "internal.audit.read"
  ],
  support_agent: [
    "internal.support.read", "internal.support.write", "internal.support.execute",
    "internal.platform.read"
  ],
  support_lead: [
    "internal.support.read", "internal.support.write", "internal.support.execute",
    "internal.platform.read", "internal.audit.read"
  ],
  ops_manager: [
    "internal.operations.read", "internal.operations.write", "internal.operations.execute",
    "internal.platform.read", "internal.audit.read"
  ],
  audit_readonly: [
    "internal.platform.read", "internal.support.read", "internal.operations.read",
    "internal.audit.read"
  ]
};

export async function listInternalRoles(pool, userId) {
  const { rows } = await pool.query(
    `SELECT internal_role_key
     FROM internal_user_roles
     WHERE user_id = $1 AND is_active = TRUE
     ORDER BY internal_role_key ASC`,
    [userId]
  );
  return rows.map((r) => r.internal_role_key);
}

export function resolvePermissions(roles = []) {
  const perms = new Set();
  for (const role of roles) {
    const rolePerms = INTERNAL_ROLE_PERMISSIONS[role] || [];
    for (const permission of rolePerms) perms.add(permission);
  }
  return Array.from(perms.values()).sort();
}

export function hasInternalPermission(roles = [], permission) {
  if (!permission) return false;
  return resolvePermissions(roles).includes(permission);
}

export async function getInternalAccessSnapshot(pool, userId) {
  const roles = await listInternalRoles(pool, userId);
  return {
    roles,
    permissions: resolvePermissions(roles)
  };
}

export async function getPlatformDashboard(pool) {
  const [users, orgs, openRequests, unresolvedEvents] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS total FROM users"),
    pool.query("SELECT COUNT(*)::int AS total FROM organizations WHERE is_active = TRUE"),
    pool.query("SELECT COUNT(*)::int AS total FROM requests WHERE status IN ('SENT','ACCEPTED')"),
    pool.query("SELECT COUNT(*)::int AS total FROM audit_log WHERE status IN ('DENIED','FAILED') AND created_at > NOW() - INTERVAL '7 days'")
  ]);

  return {
    users_total: users.rows[0]?.total || 0,
    organizations_total: orgs.rows[0]?.total || 0,
    open_requests_total: openRequests.rows[0]?.total || 0,
    critical_events_7d: unresolvedEvents.rows[0]?.total || 0
  };
}

export async function listOrganizations(pool, opts = {}) {
  const limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 25));
  const offset = Math.max(0, parseInt(opts.offset, 10) || 0);
  const q = (opts.q || "").trim();
  const params = [];
  const where = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(o.name ILIKE $${params.length} OR o.slug ILIKE $${params.length})`);
  }
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT o.id, o.name, o.slug, o.type, o.plan, o.is_active, o.created_at,
            (SELECT COUNT(*)::int FROM org_memberships om WHERE om.org_id = o.id AND om.is_active = TRUE) AS member_count
     FROM organizations o
     ${whereClause}
     ORDER BY o.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return rows;
}

export async function getOrganizationDetail(pool, orgId) {
  const { rows: orgRows } = await pool.query(
    `SELECT o.id, o.name, o.slug, o.type, o.plan, o.is_active, o.created_at, o.updated_at,
            (SELECT COUNT(*)::int FROM users u WHERE u.org_id = o.id) AS users_total
     FROM organizations o
     WHERE o.id = $1`,
    [orgId]
  );
  const org = orgRows[0];
  if (!org) return null;
  const { rows: members } = await pool.query(
    `SELECT om.user_id, om.role_key, u.email, u.company_name
     FROM org_memberships om
     JOIN users u ON u.id = om.user_id
     WHERE om.org_id = $1 AND om.is_active = TRUE
     ORDER BY om.created_at DESC
     LIMIT 20`,
    [orgId]
  );
  return { organization: org, members };
}

export async function searchSupportCustomers(pool, q, limit = 30) {
  const search = String(q || "").trim();
  if (!search) return [];
  const cappedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.company_name, u.is_verified, u.role, u.org_id,
            o.name AS org_name
     FROM users u
     LEFT JOIN organizations o ON o.id = u.org_id
     WHERE u.email ILIKE $1 OR u.company_name ILIKE $1 OR o.name ILIKE $1
     ORDER BY u.created_at DESC
     LIMIT $2`,
    [`%${search}%`, cappedLimit]
  );
  return rows;
}

export async function resendVerificationForUser(pool, userId, baseUrl, sendMail) {
  const info = await authService.getVerificationInfo(pool, userId);
  if (!info) return { code: "NOT_FOUND" };
  if (info.is_verified) return { code: "ALREADY_VERIFIED" };

  let token = info.verification_token;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    await authService.setVerificationToken(pool, userId, token);
  }
  const verifyUrl = `${baseUrl}?verify=${token}`;
  await sendMail(
    info.email,
    "TempConnect: Bitte bestaetige deine E-Mail-Adresse",
    `<h2>E-Mail-Bestaetigung</h2><p>Bitte klicke auf den folgenden Link, um deine E-Mail-Adresse zu bestaetigen:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`
  );
  return { code: "SENT", email: info.email };
}
