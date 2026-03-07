/**
 * Auth-Service: SQL-Queries fuer Registrierung, Login, Verifizierung, Passwort-Reset.
 */

/** Prueft ob E-Mail bereits existiert. */
export async function emailExists(pool, email) {
  const r = await pool.query("SELECT 1 FROM users WHERE email=$1", [email]);
  return r.rowCount > 0;
}

/** Neuen User anlegen. Gibt die ID zurueck. */
export async function createUser(pool, { role, email, passwordHash, companyName, phone, postalCode, city, verificationToken }) {
  const r = await pool.query(
    `INSERT INTO users (role, email, password_hash, company_name, phone, postal_code, city, is_verified, verification_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8) RETURNING id`,
    [role, email, passwordHash, companyName || null, phone || null, postalCode || null, city || null, verificationToken]
  );
  return r.rows[0].id;
}

/** Geo-Koordinaten fuer User setzen. */
export async function setUserGeo(pool, userId, lat, lng) {
  await pool.query("UPDATE users SET latitude=$1, longitude=$2, updated_at=NOW() WHERE id=$3", [lat, lng, userId]);
}

/** Abo anlegen. */
export async function createSubscription(pool, userId, plan) {
  await pool.query("INSERT INTO subscriptions (user_id, plan, status) VALUES ($1,$2,'active')", [userId, plan]);
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

/** Login-Daten laden (id + password_hash). */
export async function getUserCredentials(pool, email) {
  const r = await pool.query("SELECT id, password_hash FROM users WHERE email=$1", [email]);
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
