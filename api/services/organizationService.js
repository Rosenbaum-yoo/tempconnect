/**
 * Organization Service: extended CRUD for organizations, locations, departments.
 * Delegates membership operations to rbacService. Does NOT replace rbacService.
 */

import * as rbacService from "./rbacService.js";

/* ── Organizations ─────────────────────────────────────── */

export async function createOrganization(pool, userId, data) {
  const org = await rbacService.createOrganization(pool, userId, data);
  // Extend with phase-2 fields
  if (data.legal_name || data.commercial_register || data.billing_contact) {
    await pool.query(
      `UPDATE organizations SET legal_name = $2, commercial_register = $3, billing_contact = $4, updated_at = NOW()
       WHERE id = $1`,
      [org.id, data.legal_name || null, data.commercial_register || null, data.billing_contact || null]
    );
  }
  return getOrganization(pool, org.id);
}

export async function getOrganization(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT o.*,
            (SELECT COUNT(*)::int FROM org_memberships WHERE org_id = o.id AND is_active = TRUE) AS member_count,
            (SELECT COUNT(*)::int FROM org_locations WHERE org_id = o.id AND is_active = TRUE) AS location_count,
            (SELECT COUNT(*)::int FROM org_departments WHERE org_id = o.id AND is_active = TRUE) AS department_count
     FROM organizations o WHERE o.id = $1`,
    [orgId]
  );
  return rows[0] || null;
}

export async function updateOrganization(pool, orgId, data) {
  const allowed = [
    'name', 'billing_email', 'tax_id', 'website', 'logo_url',
    'legal_name', 'commercial_register', 'billing_contact'
  ];
  const fields = [];
  const values = [orgId];
  let idx = 2;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }
  if (fields.length === 0) return null;
  fields.push('updated_at = NOW()');
  const { rows } = await pool.query(
    `UPDATE organizations SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function markOnboardingComplete(pool, orgId) {
  await pool.query(
    `UPDATE organizations SET onboarding_completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [orgId]
  );
}

/* ── Locations ─────────────────────────────────────────── */

export async function listLocations(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT * FROM org_locations WHERE org_id = $1 AND is_active = TRUE ORDER BY is_hq DESC, name ASC`,
    [orgId]
  );
  return rows;
}

export async function createLocation(pool, orgId, data) {
  const { rows } = await pool.query(
    `INSERT INTO org_locations (org_id, name, street, city, postal_code, country, latitude, longitude, is_hq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      orgId, data.name, data.street || null, data.city,
      data.postal_code || null, data.country || 'DE',
      data.latitude ?? null, data.longitude ?? null, data.is_hq ?? false
    ]
  );
  return rows[0];
}

export async function updateLocation(pool, locationId, data) {
  const allowed = ['name', 'street', 'city', 'postal_code', 'country', 'latitude', 'longitude', 'is_hq', 'is_active'];
  const fields = [];
  const values = [locationId];
  let idx = 2;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }
  if (fields.length === 0) return null;
  const { rows } = await pool.query(
    `UPDATE org_locations SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  return rows[0] || null;
}

/* ── Departments ───────────────────────────────────────── */

export async function listDepartments(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT d.*, l.name AS location_name
     FROM org_departments d
     LEFT JOIN org_locations l ON l.id = d.location_id
     WHERE d.org_id = $1 AND d.is_active = TRUE
     ORDER BY d.name ASC`,
    [orgId]
  );
  return rows;
}

export async function createDepartment(pool, orgId, data) {
  const { rows } = await pool.query(
    `INSERT INTO org_departments (org_id, name, cost_center, location_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [orgId, data.name, data.cost_center || null, data.location_id || null]
  );
  return rows[0];
}

export async function updateDepartment(pool, deptId, data) {
  const allowed = ['name', 'cost_center', 'location_id', 'is_active'];
  const fields = [];
  const values = [deptId];
  let idx = 2;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }
  if (fields.length === 0) return null;
  const { rows } = await pool.query(
    `UPDATE org_departments SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  return rows[0] || null;
}

/* ── Members (delegates to rbacService) ────────────────── */

export { listOrgMembers, addMember, updateMemberRole, deactivateMember } from "./rbacService.js";
