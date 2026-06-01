/**
 * Auth-Service: SQL-Queries fuer Registrierung, Login, Verifizierung, Passwort-Reset.
 */

/** Prueft ob E-Mail bereits existiert. */
export async function emailExists(pool, email) {
  const r = await pool.query("SELECT 1 FROM users WHERE email=$1", [email]);
  return r.rowCount > 0;
}

/** Neuen User anlegen. Gibt die ID zurueck. */
export async function createUser(pool, { role, email, passwordHash, companyName, phone, postalCode, city, verificationToken, employeeCount }) {
  const r = await pool.query(
    `INSERT INTO users (role, email, password_hash, company_name, phone, postal_code, city, is_verified, verification_token, employee_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9) RETURNING id`,
    [role, email, passwordHash, companyName || null, phone || null, postalCode || null, city || null, verificationToken, employeeCount || null]
  );
  return r.rows[0].id;
}

/** Geo-Koordinaten fuer User setzen. */
export async function setUserGeo(pool, userId, lat, lng) {
  await pool.query("UPDATE users SET latitude=$1, longitude=$2, updated_at=NOW() WHERE id=$3", [lat, lng, userId]);
}

/** Abo anlegen. */
export async function createSubscription(pool, userId, plan) {
  let normalizedPlan = String(plan || "FREE").toUpperCase();
  if (normalizedPlan === "DEMO") normalizedPlan = "FREE";
  if (normalizedPlan === "ENTERPRISE" || normalizedPlan === "INDIVIDUAL") normalizedPlan = "INDIVIDUELL";
  const interval = ["FREE", "DEMO"].includes(normalizedPlan) ? "14 days" : "1 month";
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end)
     VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '${interval}')`,
    [userId, normalizedPlan]
  );
}

/** E-Mail verifizieren. Gibt {id, email} oder null zurueck. */
export async function verifyEmail(pool, token) {
  const r = await pool.query(
    "UPDATE users SET is_verified=TRUE, verification_token=NULL, updated_at=NOW() WHERE verification_token=$1 RETURNING id, email",
    [token]
  );
  return r.rows[0] || null;
}

/** Verifizierungs-Info laden (fuer Resend). */
export async function getVerificationInfo(pool, userId) {
  const r = await pool.query(
    "SELECT email, is_verified, verification_token FROM users WHERE id=$1",
    [userId]
  );
  return r.rows[0] || null;
}

/** Verifizierungs-Token setzen. */
export async function setVerificationToken(pool, userId, token) {
  await pool.query("UPDATE users SET verification_token=$1 WHERE id=$2", [token, userId]);
}

/** Login-Daten laden (id, role + password_hash). */
export async function getUserCredentials(pool, email) {
  const r = await pool.query("SELECT id, role, password_hash FROM users WHERE email=$1", [email]);
  return r.rows[0] || null;
}

/** User-ID und E-Mail fuer Passwort-Reset laden. */
export async function getUserByEmail(pool, email) {
  const r = await pool.query("SELECT id, email FROM users WHERE email=$1", [email]);
  return r.rows[0] || null;
}

/** Reset-Token setzen. */
export async function setResetToken(pool, userId, token, expires) {
  await pool.query("UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3", [token, expires, userId]);
}

/** Reset-Token validieren (nicht abgelaufen). */
export async function validateResetToken(pool, token) {
  const r = await pool.query(
    "SELECT id, email FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()",
    [token]
  );
  return r.rows[0] || null;
}

/** Passwort zuruecksetzen und Token loeschen. */
export async function resetPassword(pool, userId, passwordHash) {
  await pool.query(
    "UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL, updated_at=NOW() WHERE id=$2",
    [passwordHash, userId]
  );
}

/**
 * Erstellt automatisch eine Organisation + Membership bei der Registrierung.
 * @param {object} pool - DB pool
 * @param {string} userId - Neue User-ID
 * @param {object} opts
 * @param {string} opts.orgName - Org-Name (company_name oder email)
 * @param {string} opts.orgType - 'company' | 'agency'
 * @param {string} opts.roleKey - 'owner' | 'admin' | 'dispatcher' | 'member'
 * @param {string} [opts.plan] - Abo-Plan der Org (default: 'DEMO')
 */
export async function createOrgWithMembership(pool, userId, { orgName, orgType, roleKey, plan }) {
  // Slug generieren: lowercase, Sonderzeichen zu Hyphens, zufaelliger Suffix
  let slug = (orgName || 'org').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  slug = slug + '-' + Math.random().toString(36).substring(2, 8);

  // Sichergestellt: plan muss in der CHECK-Constraint von organizations liegen.
  // Constraint erlaubt: DEMO, BASIS, PLUS, PRO, INDIVIDUELL
  const ALLOWED_ORG_PLANS = ['DEMO', 'BASIS', 'PLUS', 'PRO', 'INDIVIDUELL'];
  const orgPlan = (plan && ALLOWED_ORG_PLANS.includes(String(plan).toUpperCase()))
    ? String(plan).toUpperCase()
    : 'DEMO';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: orgRows } = await client.query(
      `INSERT INTO organizations (id, name, slug, type, plan, created_at, updated_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, NOW(), NOW()) RETURNING id`,
      [orgName, slug, orgType, orgPlan]
    );
    const orgId = orgRows[0].id;
    await client.query(
      `INSERT INTO org_memberships (user_id, org_id, role_key, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW(), NOW())`,
      [userId, orgId, roleKey]
    );
    await client.query(
      'UPDATE users SET org_id = $1, updated_at = NOW() WHERE id = $2',
      [orgId, userId]
    );
    await client.query('COMMIT');
    return orgId;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
