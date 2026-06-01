/**
 * Rating-Service: SQL-Queries fuer Bewertungen.
 *
 * M-05 (2026-05-30): Moderations-Erweiterung fuer Marketplace Visibility Center.
 * Neue Exports (bestehende unveraendert):
 *   submitRatingModerated()    — atomisch: Rating + Moderations-Eintrag
 *   getPublicRatings()         — nur approved Ratings (fuer oeffentliche Profile)
 *   approveRating()            — pending → approved (Staff)
 *   rejectRating()             — pending → rejected (Staff)
 *   flagRating()               — irgendein Status → flagged (Staff)
 *   getPendingModerationQueue() — Staff-Queue aller unbearbeiteten Ratings
 */
import { withTransaction } from "../utils/transaction.js";

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

/* ─────────────────────────────────────────────────────────
 * M-05: Moderations-Erweiterung (Marketplace Visibility Center)
 * ───────────────────────────────────────────────────────── */

/**
 * Speichert eine Bewertung UND legt atomisch einen Moderations-Eintrag an.
 * Die Bewertung ist erst nach Staff-Approval oeffentlich sichtbar.
 *
 * @param {import('pg').Pool} pool
 * @param {{ requestId, raterId, ratedId, stars, reliability, communication, quality, comment }} ratingData
 * @returns {Promise<Object>} Die gespeicherte Bewertung
 */
export async function submitRatingModerated(pool, ratingData) {
  const { requestId, raterId, ratedId, stars, reliability, communication, quality, comment } = ratingData;
  return withTransaction(pool, async (client) => {
    // 1. Rating einfuegen
    const { rows } = await client.query(
      `INSERT INTO ratings
         (request_id, rater_id, rated_id, stars, reliability, communication, quality, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [requestId, raterId, ratedId, stars, reliability, communication, quality, comment || null]
    );
    const rating = rows[0];

    // 2. Moderations-Eintrag anlegen (status='pending' — default)
    await client.query(
      `INSERT INTO profile_review_moderation (rating_id) VALUES ($1)
       ON CONFLICT (rating_id) DO NOTHING`,
      [rating.id]
    );

    return rating;
  });
}

/**
 * Oeffentliche Bewertungen fuer ein Profil — NUR mit Moderations-Status 'approved'.
 * Bewertungen ohne Moderations-Eintrag (legacy, vor M-05) sind standardmaessig sichtbar.
 *
 * @param {import('pg').Pool} pool
 * @param {string} userId - rated user
 * @returns {Promise<Object[]>}
 */
export async function getPublicRatings(pool, userId) {
  try {
    const { rows } = await pool.query(
      `SELECT r.stars, r.reliability, r.communication, r.quality,
              r.comment, r.created_at, u.company_name AS rater_company
       FROM ratings r
       JOIN users u ON u.id = r.rater_id
       LEFT JOIN profile_review_moderation prm ON prm.rating_id = r.id
       WHERE r.rated_id = $1
         AND (prm.id IS NULL OR prm.status = 'approved')
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [userId]
    );
    return rows;
  } catch { return []; }
}

/**
 * Staff: Genehmigt eine ausstehende Bewertung (pending → approved).
 * @param {import('pg').Pool} pool
 * @param {string} ratingId
 * @param {string} staffUserId
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function approveRating(pool, ratingId, staffUserId) {
  try {
    const { rowCount } = await pool.query(
      `UPDATE profile_review_moderation
       SET status = 'approved', moderated_by = $2, moderated_at = NOW(), updated_at = NOW()
       WHERE rating_id = $1 AND status IN ('pending', 'flagged')`,
      [ratingId, staffUserId]
    );
    if (!rowCount) return { ok: false, reason: 'NOT_FOUND_OR_ALREADY_PROCESSED' };
    return { ok: true };
  } catch { return { ok: false, reason: 'DB_ERROR' }; }
}

/**
 * Staff: Lehnt eine Bewertung ab (pending → rejected).
 * @param {import('pg').Pool} pool
 * @param {string} ratingId
 * @param {string} staffUserId
 * @param {string} reason
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function rejectRating(pool, ratingId, staffUserId, reason) {
  try {
    const { rowCount } = await pool.query(
      `UPDATE profile_review_moderation
       SET status = 'rejected', moderated_by = $2, moderated_at = NOW(),
           rejection_reason = $3, updated_at = NOW()
       WHERE rating_id = $1 AND status IN ('pending', 'flagged')`,
      [ratingId, staffUserId, reason || null]
    );
    if (!rowCount) return { ok: false, reason: 'NOT_FOUND_OR_ALREADY_PROCESSED' };
    return { ok: true };
  } catch { return { ok: false, reason: 'DB_ERROR' }; }
}

/**
 * Staff: Markiert eine Bewertung als flagged fuer weitere Pruefung.
 * @param {import('pg').Pool} pool
 * @param {string} ratingId
 * @param {string} staffUserId
 * @param {string} flagReason
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function flagRating(pool, ratingId, staffUserId, flagReason) {
  try {
    const { rowCount } = await pool.query(
      `UPDATE profile_review_moderation
       SET status = 'flagged', moderated_by = $2, moderated_at = NOW(),
           flag_reason = $3, updated_at = NOW()
       WHERE rating_id = $1 AND status IN ('pending', 'approved')`,
      [ratingId, staffUserId, flagReason || null]
    );
    if (!rowCount) return { ok: false, reason: 'NOT_FOUND_OR_ALREADY_PROCESSED' };
    return { ok: true };
  } catch { return { ok: false, reason: 'DB_ERROR' }; }
}

/**
 * Staff: Listet alle Bewertungen, die auf Moderation warten.
 * @param {import('pg').Pool} pool
 * @param {{ limit?: number }} opts
 * @returns {Promise<Object[]>}
 */
export async function getPendingModerationQueue(pool, { limit = 50 } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT prm.id AS moderation_id, prm.rating_id, prm.status,
              prm.flag_reason, prm.created_at AS queued_at,
              r.stars, r.comment, r.created_at AS rated_at,
              rater.company_name AS rater_name,
              rated.company_name AS rated_name
       FROM profile_review_moderation prm
       JOIN ratings r ON r.id = prm.rating_id
       JOIN users rater ON rater.id = r.rater_id
       JOIN users rated ON rated.id = r.rated_id
       WHERE prm.status IN ('pending', 'flagged')
       ORDER BY prm.created_at ASC
       LIMIT $1`,
      [limit]
    );
    return rows;
  } catch { return []; }
}
