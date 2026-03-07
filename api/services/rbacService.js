/**
 * RBAC-Service: Rollen, Permissions, Org-Membership-Abfragen.
 * Rueckwaertskompatibel – bestehende company/agency Rollen funktionieren weiterhin.
 * Neue Rollen werden ueber org_memberships zugewiesen.
 */

/** Rollen-Hierarchie: hoehere Rollen erben Rechte niedrigerer */
export const ROLE_HIERARCHY = {
  platform_admin:   ['owner', 'admin', 'program_manager', 'hiring_manager', 'supplier_manager', 'finance', 'recruiter', 'dispatcher', 'member'],
  owner:            ['admin', 'program_manager', 'hiring_manager', 'supplier_manager', 'finance', 'recruiter', 'dispatcher', 'member'],
  admin:            ['program_manager', 'hiring_manager', 'supplier_manager', 'finance', 'recruiter', 'dispatcher', 'member'],
  program_manager:  ['hiring_manager', 'recruiter', 'member'],
  hiring_manager:   ['member'],
  supplier_manager: ['member'],
  finance:          ['member'],
  recruiter:        ['member'],
  dispatcher:       ['member'],
  member:           [],
  supplier_user:    [],
  viewer:           []
};

/** Deklarative Permission-Matrix: permission -> erlaubte Rollen */
export const PERMISSIONS = {
  // Requisitions
  'requisition.create':       ['owner','admin','program_manager','hiring_manager','recruiter'],
  'requisition.edit':         ['owner','admin','program_manager','hiring_manager','recruiter'],
  'requisition.approve':      ['owner','admin','program_manager'],
  'requisition.cancel':       ['owner','admin','program_manager','hiring_manager'],
  'requisition.view':         ['owner','admin','program_manager','hiring_manager','supplier_manager','finance','recruiter','dispatcher','member','viewer'],
  'requisition.assign':       ['owner','admin','program_manager'],

  // Candidates / Shortlist
  'candidate.review':         ['owner','admin','program_manager','hiring_manager'],
  'candidate.shortlist':      ['owner','admin','program_manager','hiring_manager'],
  'candidate.reject':         ['owner','admin','program_manager','hiring_manager'],
  'candidate.comment':        ['owner','admin','program_manager','hiring_manager','supplier_manager'],

  // Offers
  'offer.create':             ['owner','admin','supplier_user','recruiter'],
  'offer.accept':             ['owner','admin','program_manager','hiring_manager'],
  'offer.reject':             ['owner','admin','program_manager','hiring_manager'],
  'offer.view':               ['owner','admin','program_manager','hiring_manager','supplier_manager','finance','recruiter','dispatcher','member','supplier_user','viewer'],

  // Vendor Pool
  'vendor_pool.manage':       ['owner','admin','supplier_manager','program_manager'],
  'vendor_pool.view':         ['owner','admin','supplier_manager','program_manager','hiring_manager','finance'],

  // Compliance
  'compliance.manage':        ['owner','admin','supplier_manager'],
  'compliance.verify':        ['owner','admin','supplier_manager'],
  'compliance.view':          ['owner','admin','supplier_manager','program_manager','hiring_manager','finance','member'],
  'compliance.upload':        ['owner','admin','supplier_user'],

  // Reports
  'report.executive':         ['owner','admin','program_manager','finance'],
  'report.operational':       ['owner','admin','program_manager','hiring_manager','supplier_manager'],
  'report.supplier':          ['owner','admin','supplier_manager','program_manager'],

  // Org / Admin
  'org.settings':             ['owner','admin'],
  'org.members':              ['owner','admin'],
  'org.locations':            ['owner','admin'],
  'org.departments':          ['owner','admin'],
  'org.billing':              ['owner','admin','finance'],

  // Approvals
  'approval.decide':          ['owner','admin','program_manager'],
  'approval.view':            ['owner','admin','program_manager','hiring_manager','finance'],

  // Notifications
  'notification.view':        ['owner','admin','program_manager','hiring_manager','supplier_manager','finance','recruiter','dispatcher','member','supplier_user','viewer'],

  // Contracts
  'contract.create':          ['owner','admin','program_manager'],
  'contract.edit':            ['owner','admin','program_manager'],
  'contract.view':            ['owner','admin','program_manager','hiring_manager','supplier_manager','finance','viewer'],
  'contract.terminate':       ['owner','admin'],

  // Assignments
  'assignment.create':        ['owner','admin','program_manager','hiring_manager','dispatcher'],
  'assignment.edit':          ['owner','admin','program_manager','hiring_manager','dispatcher'],
  'assignment.view':          ['owner','admin','program_manager','hiring_manager','supplier_manager','finance','dispatcher','recruiter','member','viewer'],
  'assignment.complete':      ['owner','admin','program_manager','hiring_manager','dispatcher'],

  // Supplier Management
  'supplier.manage':          ['owner','admin','supplier_manager','program_manager'],
  'supplier.view':            ['owner','admin','supplier_manager','program_manager','hiring_manager','finance','viewer'],

  // Settings
  'settings.view':            ['owner','admin','program_manager','finance'],
  'settings.edit':            ['owner','admin']
};

/**
 * Pruefe ob eine Rolle eine bestimmte Permission hat.
 * @param {string} roleKey – z.B. 'hiring_manager'
 * @param {string} permission – z.B. 'requisition.create'
 * @returns {boolean}
 */
export function hasPermission(roleKey, permission) {
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) return false;
  if (allowedRoles.includes(roleKey)) return true;
  // Pruefe geerbte Rollen
  const inherited = ROLE_HIERARCHY[roleKey];
  if (Array.isArray(inherited)) {
    return inherited.some((r) => allowedRoles.includes(r));
  }
  return false;
}

/**
 * Hole Org-Membership eines Users. Null wenn keine Mitgliedschaft.
 */
export async function getMembership(pool, userId, orgId) {
  const { rows } = await pool.query(
    `SELECT om.*, o.name AS org_name, o.type AS org_type, o.plan AS org_plan
     FROM org_memberships om
     JOIN organizations o ON o.id = om.org_id
     WHERE om.user_id = $1 AND om.org_id = $2 AND om.is_active = TRUE`,
    [userId, orgId]
  );
  return rows[0] || null;
}

/**
 * Hole alle Memberships eines Users (fuer Multi-Org-Support).
 */
export async function getUserMemberships(pool, userId) {
  const { rows } = await pool.query(
    `SELECT om.*, o.name AS org_name, o.type AS org_type, o.plan AS org_plan,
            ol.name AS location_name, od.name AS department_name
     FROM org_memberships om
     JOIN organizations o ON o.id = om.org_id
     LEFT JOIN org_locations ol ON ol.id = om.location_id
     LEFT JOIN org_departments od ON od.id = om.department_id
     WHERE om.user_id = $1 AND om.is_active = TRUE
     ORDER BY o.name ASC`,
    [userId]
  );
  return rows;
}

/**
 * Hole die primaere Org eines Users (ueber users.org_id oder erste Membership).
 */
export async function getPrimaryOrg(pool, userId) {
  // Schnellpfad: users.org_id
  const { rows: userRows } = await pool.query(
    "SELECT org_id FROM users WHERE id = $1", [userId]
  );
  const orgId = userRows[0]?.org_id;
  if (orgId) {
    return getMembership(pool, userId, orgId);
  }
  // Fallback: erste aktive Membership
  const { rows } = await pool.query(
    `SELECT om.*, o.name AS org_name, o.type AS org_type, o.plan AS org_plan
     FROM org_memberships om
     JOIN organizations o ON o.id = om.org_id
     WHERE om.user_id = $1 AND om.is_active = TRUE
     ORDER BY om.created_at ASC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Pruefe ob User die Permission in einer bestimmten Org hat.
 * Rueckgabe: { allowed: boolean, membership, reason }
 */
export async function checkPermission(pool, userId, orgId, permission) {
  const membership = await getMembership(pool, userId, orgId);
  if (!membership) {
    return { allowed: false, membership: null, reason: 'NOT_ORG_MEMBER' };
  }
  if (!membership.is_active) {
    return { allowed: false, membership, reason: 'MEMBERSHIP_INACTIVE' };
  }
  if (hasPermission(membership.role_key, permission)) {
    return { allowed: true, membership, reason: null };
  }
  return { allowed: false, membership, reason: 'PERMISSION_DENIED' };
}

/**
 * Erstelle eine Organisation und mache den User zum Owner.
 */
export async function createOrganization(pool, userId, data) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: orgRows } = await client.query(
      `INSERT INTO organizations (name, slug, type, billing_email, tax_id, website)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.name, data.slug, data.type, data.billing_email || null, data.tax_id || null, data.website || null]
    );
    const org = orgRows[0];
    await client.query(
      `INSERT INTO org_memberships (user_id, org_id, role_key)
       VALUES ($1, $2, 'owner')`,
      [userId, org.id]
    );
    await client.query(
      "UPDATE users SET org_id = $1, updated_at = NOW() WHERE id = $2",
      [org.id, userId]
    );
    await client.query("COMMIT");
    return org;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Mitglied zu Organisation hinzufuegen.
 */
export async function addMember(pool, orgId, userId, roleKey, opts = {}) {
  const { rows } = await pool.query(
    `INSERT INTO org_memberships (user_id, org_id, role_key, department_id, location_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, org_id) DO UPDATE SET
       role_key = EXCLUDED.role_key,
       department_id = EXCLUDED.department_id,
       location_id = EXCLUDED.location_id,
       is_active = TRUE,
       updated_at = NOW()
     RETURNING *`,
    [userId, orgId, roleKey, opts.department_id || null, opts.location_id || null]
  );
  return rows[0];
}

/**
 * Mitglied-Rolle aendern.
 */
export async function updateMemberRole(pool, orgId, userId, newRoleKey) {
  const { rows } = await pool.query(
    `UPDATE org_memberships SET role_key = $3, updated_at = NOW()
     WHERE org_id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING *`,
    [orgId, userId, newRoleKey]
  );
  return rows[0] || null;
}

/**
 * Mitglied deaktivieren.
 */
export async function deactivateMember(pool, orgId, userId) {
  const { rowCount } = await pool.query(
    `UPDATE org_memberships SET is_active = FALSE, updated_at = NOW()
     WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
  return rowCount > 0;
}

/**
 * Alle Mitglieder einer Org auflisten.
 */
export async function listOrgMembers(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT om.*, u.email, u.company_name, u.phone,
            ol.name AS location_name, od.name AS department_name
     FROM org_memberships om
     JOIN users u ON u.id = om.user_id
     LEFT JOIN org_locations ol ON ol.id = om.location_id
     LEFT JOIN org_departments od ON od.id = om.department_id
     WHERE om.org_id = $1 AND om.is_active = TRUE
     ORDER BY om.role_key ASC, u.email ASC`,
    [orgId]
  );
  return rows;
}
