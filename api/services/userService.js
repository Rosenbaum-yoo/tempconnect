/**
 * User-Service: Profil, Plan, Account, DSGVO-Export.
 */

export const PLAN_LIMITS = {
  FREE:      { price: 0,   requests_send: 0,  requests_receive: 0,  listings: 0,  notdienst: false, sla_level: 'none',      enterprise_access: false },
  BASIS:     { price: 150, requests_send: 5,  requests_receive: 5,  listings: 5,  notdienst: false, sla_level: 'none',      enterprise_access: false },
  PLUS:      { price: 499, requests_send: 20, requests_receive: 20, listings: 20, notdienst: false, sla_level: 'PRO',       enterprise_access: true  },
  NOTDIENST: { price: 999, requests_send: -1, requests_receive: -1, listings: -1, notdienst: true,  sla_level: 'EMERGENCY', enterprise_access: true  }
};

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
export async function getUserAndPlan(pool, userId) {
  const u = await pool.query(
    "SELECT id, role, email, company_name, phone, contact_person, street, postal_code, city, vat_id, handelsregister_number, is_verified, latitude, longitude FROM users WHERE id=$1",
    [userId]
  );
  if (!u.rows[0]) return null;

  const s = await pool.query(
    "SELECT plan, status FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  const r = await pool.query(
    "SELECT ROUND(AVG(stars)::numeric, 1) AS avg_rating, COUNT(*) AS rating_count FROM ratings WHERE rated_id=$1",
    [userId]
  );
  const usage = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM requests WHERE requester_id=$1) AS sent_count,
      (SELECT COUNT(*) FROM requests WHERE receiver_id=$1) AS received_count,
      (SELECT COUNT(*) FROM listings WHERE owner_id=$1 AND is_active=TRUE) AS listings_count
  `, [userId]);

  const plan = s.rows[0]?.plan || "FREE";
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;

  return {
    ...u.rows[0],
    plan,
    sub_status: s.rows[0]?.status || "active",
    avg_rating: r.rows[0]?.avg_rating ? parseFloat(r.rows[0].avg_rating) : 0,
    rating_count: parseInt(r.rows[0]?.rating_count || 0, 10),
    limits,
    usage: {
      sent_count: parseInt(usage.rows[0]?.sent_count || 0, 10),
      received_count: parseInt(usage.rows[0]?.received_count || 0, 10),
      listings_count: parseInt(usage.rows[0]?.listings_count || 0, 10)
    }
  };
}

/* ── Passwort ───────────────────────────────────────── */

export async function getUserPasswordHash(pool, userId) {
  const { rows } = await pool.query(
    "SELECT id, password_hash FROM users WHERE id=$1", [userId]
  );
  return rows[0] || null;
}

export async function changePassword(pool, userId, newHash) {
  await pool.query(
    "UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2",
    [newHash, userId]
  );
}

/* ── DSGVO-Export ───────────────────────────────────── */

export async function exportUserData(pool, userId) {
  const user = await pool.query(
    "SELECT id, role, email, company_name, phone, contact_person, street, postal_code, city, vat_id, handelsregister_number, is_verified, created_at, updated_at FROM users WHERE id=$1",
    [userId]
  );
  if (!user.rows[0]) return null;

  const [listings, subs, sent, received, ratingsGiven, ratingsReceived] = await Promise.all([
    pool.query("SELECT id, type, category, region, qty, start_date, note, notdienst, is_active, created_at, updated_at FROM listings WHERE owner_id=$1 ORDER BY created_at DESC", [userId]),
    pool.query("SELECT plan, status, created_at, updated_at FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC", [userId]),
    pool.query("SELECT id, listing_id, message, priority, status, contact_email, contact_phone, created_at, updated_at FROM requests WHERE requester_id=$1 ORDER BY created_at DESC", [userId]),
    pool.query("SELECT id, listing_id, requester_id, message, priority, status, contact_email, contact_phone, created_at, updated_at FROM requests WHERE receiver_id=$1 ORDER BY created_at DESC", [userId]),
    pool.query("SELECT id, request_id, rated_id, stars, reliability, communication, quality, comment, created_at FROM ratings WHERE rater_id=$1 ORDER BY created_at DESC", [userId]),
    pool.query("SELECT id, request_id, rater_id, stars, reliability, communication, quality, comment, created_at FROM ratings WHERE rated_id=$1 ORDER BY created_at DESC", [userId])
  ]);

  return {
    export_date: new Date().toISOString(),
    purpose: "DSGVO Art. 20 – Datenübertragbarkeit",
    user: user.rows[0],
    subscriptions: subs.rows,
    listings: listings.rows,
    requests_sent: sent.rows,
    requests_received: received.rows,
    ratings_given: ratingsGiven.rows,
    ratings_received: ratingsReceived.rows
  };
}

/* ── Plan-Verwaltung ────────────────────────────────── */

export async function changePlan(pool, userId, plan) {
  await pool.query(
    "INSERT INTO subscriptions (user_id, plan, status) VALUES ($1,$2,'active')",
    [userId, plan]
  );
}

export async function cancelPlan(pool, userId) {
  await pool.query(
    "INSERT INTO subscriptions (user_id, plan, status) VALUES ($1,'FREE','active')",
    [userId]
  );
}

/* ── Account löschen (kaskadierend) ─────────────────── */

export async function deleteUser(pool, userId) {
  const user = await pool.query("SELECT email FROM users WHERE id=$1", [userId]);
  if (!user.rows[0]) return null;
  const email = user.rows[0].email;

  await pool.query("DELETE FROM ratings WHERE rater_id=$1 OR rated_id=$1", [userId]);
  await pool.query("DELETE FROM requests WHERE requester_id=$1", [userId]);
  await pool.query("DELETE FROM requests WHERE listing_id IN (SELECT id FROM listings WHERE owner_id=$1)", [userId]);
  await pool.query("DELETE FROM listings WHERE owner_id=$1", [userId]);
  await pool.query("DELETE FROM subscriptions WHERE user_id=$1", [userId]);
  await pool.query("DELETE FROM users WHERE id=$1", [userId]);

  return email;
}

/* ── Profil aktualisieren ───────────────────────────── */

export async function updateProfile(pool, userId, data) {
  await pool.query(
    "UPDATE users SET company_name=$1, phone=$2, contact_person=$3, street=$4, postal_code=$5, city=$6, vat_id=$7, handelsregister_number=$8, updated_at=NOW() WHERE id=$9",
    [
      data.company_name || null, data.phone || null, data.contact_person || null,
      data.street || null, data.postal_code || null, data.city || null,
      data.vat_id || null, data.handelsregister_number || null, userId
    ]
  );
}

export async function updateUserGeo(pool, userId, lat, lng) {
  await pool.query(
    "UPDATE users SET latitude=$1, longitude=$2, updated_at=NOW() WHERE id=$3",
    [lat, lng, userId]
  );
}

export async function clearUserGeo(pool, userId) {
  await pool.query(
    "UPDATE users SET latitude=NULL, longitude=NULL, updated_at=NOW() WHERE id=$1",
    [userId]
  );
}
