/**
 * Rating-Service: SQL-Queries fuer Bewertungen.
 */

/** Anfrage fuer Bewertung laden (Status, Beteiligte, Datum). */
export async function getRequestForRating(pool, requestId) {
  const r = await pool.query(
    "SELECT id, requester_id, receiver_id, status, created_at FROM requests WHERE id=$1",
    [requestId]
  );
  return r.rows[0] || null;
}

/** Prueft ob bereits bewertet wurde. */
export async function checkExistingRating(pool, requestId, raterId) {
  const r = await pool.query(
    "SELECT id FROM ratings WHERE request_id=$1 AND rater_id=$2",
    [requestId, raterId]
  );
  return !!r.rows[0];
}

/** Bewertung speichern. */
export async function submitRating(pool, { requestId, raterId, ratedId, stars, reliability, communication, quality, comment }) {
  const r = await pool.query(
    "INSERT INTO ratings (request_id, rater_id, rated_id, stars, reliability, communication, quality, comment) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
    [requestId, raterId, ratedId, stars, reliability, communication, quality, comment || null]
  );
  return r.rows[0];
}

/** Bewertungen fuer einen User laden (mit Firmennamen). */
export async function getUserRatings(pool, userId) {
  const r = await pool.query(
    "SELECT r.stars, r.reliability, r.communication, r.quality, r.comment, r.created_at, u.company_name AS rater_company FROM ratings r JOIN users u ON u.id = r.rater_id WHERE r.rated_id = $1 ORDER BY r.created_at DESC LIMIT 50",
    [userId]
  );
  return r.rows;
}

/** Durchschnittswerte fuer einen User. */
export async function getRatingStats(pool, userId) {
  const r = await pool.query(
    "SELECT COUNT(*) AS count, ROUND(AVG(stars)::numeric, 1) AS avg_stars, ROUND(AVG(reliability)::numeric, 1) AS avg_reliability, ROUND(AVG(communication)::numeric, 1) AS avg_communication, ROUND(AVG(quality)::numeric, 1) AS avg_quality FROM ratings WHERE rated_id = $1",
    [userId]
  );
  return r.rows[0];
}

/** Ausstehende Bewertungen (finalisierte Deals ohne Rating). */
export async function getPendingRatings(pool, userId) {
  const q = `SELECT r.id AS request_id, r.created_at AS deal_date,
    l.category AS listing_category, l.region AS listing_region,
    CASE WHEN r.requester_id = $1 THEN u_recv.company_name ELSE u_req.company_name END AS partner_name,
    CASE WHEN r.requester_id = $1 THEN u_recv.id ELSE u_req.id END AS partner_id
    FROM requests r
    JOIN listings l ON l.id = r.listing_id
    JOIN users u_req ON u_req.id = r.requester_id
    JOIN users u_recv ON u_recv.id = r.receiver_id
    LEFT JOIN ratings rt ON rt.request_id = r.id AND rt.rater_id = $1
    WHERE r.status = 'FINALIZED'
      AND (r.requester_id = $1 OR r.receiver_id = $1)
      AND rt.id IS NULL
      AND r.created_at > NOW() - INTERVAL '30 days'
    ORDER BY r.created_at DESC LIMIT 20`;
  const r = await pool.query(q, [userId]);
  return r.rows;
}
