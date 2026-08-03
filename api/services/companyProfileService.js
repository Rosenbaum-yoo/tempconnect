/**
 * Company Profile Service — enterprise-grade profile management.
 * CRUD for profiles, capabilities, locations, certifications, contacts.
 * Completeness scoring and public profile view.
 */

import * as complianceDocService from "./complianceDocService.js";
import * as supplierMetrics from "./supplierMetricsService.js";

/* ══════════════════════════════════════════════════════════════════
   PROFILE (1:1)
   ══════════════════════════════════════════════════════════════════ */

export async function getProfile(pool, userId) {
  const { rows } = await pool.query(
    "SELECT * FROM company_profiles WHERE user_id = $1", [userId]
  );
  return rows[0] || null;
}

const VALID_COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'];
const VALID_CERT_TYPES = ['aueg_lizenz', 'iso_9001', 'iso_27001', 'iso_45001', 'tuev', 'dekra', 'branchenzertifikat', 'qualitaetssiegel', 'sonstige'];

export async function upsertProfile(pool, userId, data) {
  // Sanitize year_founded: empty string → null, otherwise parse to int
  if (data.year_founded !== undefined) {
    const yf = String(data.year_founded || '').trim();
    data.year_founded = yf && !isNaN(Number(yf)) ? parseInt(yf, 10) : null;
  }
  // Sanitize company_size: must match DB constraint
  if (data.company_size !== undefined) {
    if (!VALID_COMPANY_SIZES.includes(data.company_size)) data.company_size = null;
  }
  const fields = [
    "legal_name", "website", "company_description", "year_founded",
    "company_size", "industry_focus", "headquarters_city",
    "headquarters_country", "linkedin_url", "contact_email",
    "contact_phone", "logo_url"
  ];
  const vals = fields.map(f => data[f] !== undefined ? data[f] : null);
  const { rows } = await pool.query(
    `INSERT INTO company_profiles (user_id, ${fields.join(", ")})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (user_id) DO UPDATE SET
       ${fields.map((f, i) => `${f} = $${i + 2}`).join(", ")},
       updated_at = NOW()
     RETURNING *`,
    [userId, ...vals]
  );
  return rows[0];
}

/* ── Firmenfoto (P7b) ────────────────────────────────────────────────
   BEWUSST NICHT in der upsertProfile-Whitelist: dort gilt Voll-Ersetzen-
   Semantik (fehlendes Feld -> NULL) — das Overview-Formular wuerde das
   Foto bei jedem Speichern loeschen. Eigener, additiver Pfad. */

export async function setProfilePhoto(pool, userId, photoUrl) {
  const { rows } = await pool.query(
    `WITH old AS (SELECT photo_url FROM company_profiles WHERE user_id = $1)
     INSERT INTO company_profiles (user_id, photo_url)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET photo_url = EXCLUDED.photo_url, updated_at = NOW()
     RETURNING photo_url, (SELECT photo_url FROM old) AS previous_photo_url`,
    [userId, photoUrl]
  );
  return rows[0] || null;
}

export async function clearProfilePhoto(pool, userId) {
  // CTE noetig: RETURNING sieht die NEUE Zeile — nach SET NULL waere der
  // Rueckgabewert immer NULL und die alte Datei bliebe verwaist liegen.
  const { rows } = await pool.query(
    `WITH old AS (
       SELECT photo_url FROM company_profiles
        WHERE user_id = $1 AND photo_url IS NOT NULL
     )
     UPDATE company_profiles
        SET photo_url = NULL, updated_at = NOW()
      WHERE user_id = $1 AND photo_url IS NOT NULL
      RETURNING (SELECT photo_url FROM old) AS previous_photo_url`,
    [userId]
  );
  return rows[0] || null;
}

/* ══════════════════════════════════════════════════════════════════
   CAPABILITIES (1:1)
   ══════════════════════════════════════════════════════════════════ */

export async function getCapabilities(pool, userId) {
  const { rows } = await pool.query(
    "SELECT * FROM company_capabilities WHERE user_id = $1", [userId]
  );
  return rows[0] || null;
}

export async function upsertCapabilities(pool, userId, data) {
  const arrFields = [
    "staff_categories", "industries_served", "typical_roles",
    "availability_regions", "languages", "specializations"
  ];
  const vals = arrFields.map(f => Array.isArray(data[f]) ? data[f] : []);
  const { rows } = await pool.query(
    `INSERT INTO company_capabilities (user_id, ${arrFields.join(", ")})
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       ${arrFields.map((f, i) => `${f} = $${i + 2}`).join(", ")},
       updated_at = NOW()
     RETURNING *`,
    [userId, ...vals]
  );
  return rows[0];
}

/* ══════════════════════════════════════════════════════════════════
   LOCATIONS (1:many)
   ══════════════════════════════════════════════════════════════════ */

export async function listLocations(pool, userId) {
  const { rows } = await pool.query(
    "SELECT * FROM company_locations WHERE user_id = $1 ORDER BY is_headquarters DESC, city", [userId]
  );
  return rows;
}

export async function addLocation(pool, userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO company_locations (user_id, label, city, postal_code, country, latitude, longitude, radius_km, is_headquarters)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [userId, data.label || null, data.city, data.postal_code || null,
     data.country || "Deutschland", data.latitude || null, data.longitude || null,
     data.radius_km ?? 50, data.is_headquarters ?? false]
  );
  return rows[0];
}

export async function updateLocation(pool, id, userId, data) {
  const allowed = ["label", "city", "postal_code", "country", "latitude", "longitude", "radius_km", "is_headquarters"];
  const sets = []; const vals = [id, userId]; let idx = 3;
  for (const k of allowed) {
    if (data[k] !== undefined) { sets.push(`${k} = $${idx}`); vals.push(data[k]); idx++; }
  }
  if (!sets.length) return null;
  sets.push("updated_at = NOW()");
  const { rows } = await pool.query(
    `UPDATE company_locations SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 RETURNING *`, vals
  );
  return rows[0] || null;
}

export async function removeLocation(pool, id, userId) {
  const { rowCount } = await pool.query(
    "DELETE FROM company_locations WHERE id = $1 AND user_id = $2", [id, userId]
  );
  return rowCount > 0;
}

/* ══════════════════════════════════════════════════════════════════
   CERTIFICATIONS (1:many)
   ══════════════════════════════════════════════════════════════════ */

export async function listCertifications(pool, userId) {
  const { rows } = await pool.query(
    "SELECT * FROM company_certifications WHERE user_id = $1 ORDER BY expires_at ASC NULLS LAST", [userId]
  );
  return rows.map(c => ({ ...c, is_expired: c.expires_at && new Date(c.expires_at) < new Date() }));
}

export async function addCertification(pool, userId, data) {
  // Sanitize cert_type: must match DB constraint
  const certType = VALID_CERT_TYPES.includes(data.cert_type) ? data.cert_type : 'sonstige';
  const { rows } = await pool.query(
    `INSERT INTO company_certifications (user_id, cert_type, cert_name, issuer, issued_at, expires_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, certType, data.cert_name, data.issuer || null,
     data.issued_at || null, data.expires_at || null, data.status || "active"]
  );
  return rows[0];
}

export async function updateCertification(pool, id, userId, data) {
  const allowed = ["cert_type", "cert_name", "issuer", "issued_at", "expires_at", "status"];
  const sets = []; const vals = [id, userId]; let idx = 3;
  for (const k of allowed) {
    if (data[k] !== undefined) { sets.push(`${k} = $${idx}`); vals.push(data[k]); idx++; }
  }
  if (!sets.length) return null;
  sets.push("updated_at = NOW()");
  const { rows } = await pool.query(
    `UPDATE company_certifications SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 RETURNING *`, vals
  );
  return rows[0] || null;
}

export async function removeCertification(pool, id, userId) {
  const { rowCount } = await pool.query(
    "DELETE FROM company_certifications WHERE id = $1 AND user_id = $2", [id, userId]
  );
  return rowCount > 0;
}

/* ══════════════════════════════════════════════════════════════════
   CONTACTS (1:many)
   ══════════════════════════════════════════════════════════════════ */

export async function listContacts(pool, userId) {
  const { rows } = await pool.query(
    "SELECT * FROM company_contacts WHERE user_id = $1 ORDER BY is_primary DESC, name", [userId]
  );
  return rows;
}

export async function addContact(pool, userId, data) {
  const { rows } = await pool.query(
    `INSERT INTO company_contacts (user_id, name, role_title, email, phone, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, data.name, data.role_title || null, data.email || null,
     data.phone || null, data.is_primary ?? false]
  );
  return rows[0];
}

export async function updateContact(pool, id, userId, data) {
  const allowed = ["name", "role_title", "email", "phone", "is_primary"];
  const sets = []; const vals = [id, userId]; let idx = 3;
  for (const k of allowed) {
    if (data[k] !== undefined) { sets.push(`${k} = $${idx}`); vals.push(data[k]); idx++; }
  }
  if (!sets.length) return null;
  sets.push("updated_at = NOW()");
  const { rows } = await pool.query(
    `UPDATE company_contacts SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 RETURNING *`, vals
  );
  return rows[0] || null;
}

export async function removeContact(pool, id, userId) {
  const { rowCount } = await pool.query(
    "DELETE FROM company_contacts WHERE id = $1 AND user_id = $2", [id, userId]
  );
  return rowCount > 0;
}

/* ══════════════════════════════════════════════════════════════════
   FULL PROFILE (aggregated)
   ══════════════════════════════════════════════════════════════════ */

export async function getFullProfile(pool, userId) {
  const [profile, capabilities, locations, certifications, contacts, user] = await Promise.all([
    getProfile(pool, userId),
    getCapabilities(pool, userId),
    listLocations(pool, userId),
    listCertifications(pool, userId),
    listContacts(pool, userId),
    pool.query("SELECT id, email, company_name, role, phone, contact_person, city, postal_code, street, vat_id, handelsregister_number FROM users WHERE id = $1", [userId])
  ]);

  let complianceStats = null;
  try {
    // org_id may not exist for all users; gracefully skip
    const orgRow = await pool.query("SELECT org_id FROM users WHERE id = $1", [userId]);
    const orgId = orgRow.rows[0]?.org_id;
    if (orgId) complianceStats = await complianceDocService.complianceStats(pool, orgId);
  } catch { /* ignore */ }

  let scorecard = null;
  try { scorecard = await supplierMetrics.getScorecard(pool, userId, 30); } catch { /* ignore */ }

  return {
    user: user.rows[0] || null,
    profile: profile || {},
    capabilities: capabilities || {},
    locations,
    certifications,
    contacts,
    compliance: complianceStats,
    scorecard,
    completeness: computeCompletenessSync({ profile, capabilities, locations, certifications, contacts, user: user.rows[0] })
  };
}

/* ══════════════════════════════════════════════════════════════════
   PUBLIC PROFILE (read-only view for other companies)
   ══════════════════════════════════════════════════════════════════ */

export async function getPublicProfile(pool, userId) {
  const full = await getFullProfile(pool, userId);
  if (!full.user) return null;
  // Strip sensitive fields
  const { email: _email, ...safeUser } = full.user;
  return {
    user: safeUser,
    profile: full.profile,
    capabilities: full.capabilities,
    locations: full.locations.map(l => ({ city: l.city, country: l.country, radius_km: l.radius_km, is_headquarters: l.is_headquarters })),
    certifications: full.certifications.map(c => ({ cert_type: c.cert_type, cert_name: c.cert_name, issuer: c.issuer, status: c.status, is_expired: c.is_expired })),
    contacts: full.contacts.filter(c => c.is_primary).map(c => ({ name: c.name, role_title: c.role_title })),
    compliance: full.compliance,
    scorecard: full.scorecard,
    completeness: full.completeness
  };
}

/* ══════════════════════════════════════════════════════════════════
   COMPLETENESS
   ══════════════════════════════════════════════════════════════════ */

function computeCompletenessSync({ profile, capabilities, locations, certifications, contacts, user }) {
  const sections = [];

  // 1. Company Overview
  const overviewFields = ["company_name", "legal_name", "website", "company_description", "company_size", "industry_focus"];
  const overviewFilled = overviewFields.filter(f => {
    const v = (profile && profile[f]) || (user && user[f]);
    return v && String(v).trim().length > 0;
  }).length;
  sections.push({ key: "overview", label: "Unternehmensuebersicht", filled: overviewFilled, total: overviewFields.length, complete: overviewFilled >= 4 });

  // 2. Capabilities
  const capFields = ["staff_categories", "industries_served", "typical_roles", "availability_regions"];
  const capFilled = capFields.filter(f => capabilities && Array.isArray(capabilities[f]) && capabilities[f].length > 0).length;
  sections.push({ key: "capabilities", label: "Kompetenzen", filled: capFilled, total: capFields.length, complete: capFilled >= 2 });

  // 3. Locations
  const locCount = locations ? locations.length : 0;
  sections.push({ key: "locations", label: "Standorte", filled: locCount, total: 1, complete: locCount >= 1 });

  // 4. Certifications
  const certCount = certifications ? certifications.length : 0;
  sections.push({ key: "certifications", label: "Zertifizierungen", filled: certCount, total: 1, complete: certCount >= 1 });

  // 5. Contacts
  const contactCount = contacts ? contacts.length : 0;
  sections.push({ key: "contacts", label: "Kontakte", filled: contactCount, total: 1, complete: contactCount >= 1 });

  const completed = sections.filter(s => s.complete).length;
  const percentage = Math.round((completed / sections.length) * 100);

  return { percentage, sections, completed_sections: completed, total_sections: sections.length };
}

export async function computeCompleteness(pool, userId) {
  const full = await getFullProfile(pool, userId);
  return full.completeness;
}
