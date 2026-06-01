/**
 * Profile Analytics Service — Marketplace Visibility Center (M-03)
 *
 * Anonymisiertes View-Tracking und Reichweiten-Aggregation fuer oeffentliche Profile.
 *
 * DATENSCHUTZ-Pflicht (unveraenderlich):
 *   IP-Adressen und User-Agent-Strings werden AUSSCHLIESSLICH als SHA-256-Hash
 *   gespeichert. Kein Klartext in profile_view_events — weder in DB noch in Logs.
 *   Diese Regel gilt unabhaengig von Plan oder Umgebung.
 *
 * Aggregation-Windows:
 *   7d  = Basic Analytics (PRO+)
 *   30d = Basic Analytics (PRO+)
 *   90d = Advanced Analytics (INDIVIDUELL)
 */

import { createHash } from 'crypto';

/* ── Hash-Hilfsfunktion ───────────────────────────────── */

/**
 * SHA-256-Hash eines Werts (hex). Leerer String wenn value falsy.
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function hashForStorage(value) {
  if (!value) return createHash('sha256').update('').digest('hex');
  return createHash('sha256').update(String(value)).digest('hex');
}

/* ── View-Tracking ────────────────────────────────────── */

/**
 * Zeichnet einen Profilaufruf auf.
 * IP und User-Agent werden gehasht — Klartext wird verworfen.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   viewedOrgId: string,
 *   viewerOrgId?: string|null,
 *   viewerUserId?: string|null,
 *   clientIp: string,
 *   userAgent: string,
 *   section?: string|null
 * }} params
 * @returns {Promise<boolean>} true bei Erfolg
 */
export async function recordProfileView(pool, {
  viewedOrgId,
  viewerOrgId = null,
  viewerUserId = null,
  clientIp,
  userAgent,
  section = null
}) {
  if (!viewedOrgId) return false;
  try {
    await pool.query(
      `INSERT INTO profile_view_events
         (viewed_org_id, viewer_org_id, viewer_user_id, ip_hash, ua_hash, referrer_section)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        viewedOrgId,
        viewerOrgId || null,
        viewerUserId || null,
        hashForStorage(clientIp),
        hashForStorage(userAgent),
        section || null
      ]
    );
    return true;
  } catch { return false; }
}

/* ── View-Statistiken ─────────────────────────────────── */

/**
 * Gesamtaufrufe einer Organisation in den letzten N Tagen.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {{ days?: number }} opts
 * @returns {Promise<number>}
 */
export async function getProfileViewCount(pool, orgId, { days = 30 } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM profile_view_events
       WHERE viewed_org_id = $1
         AND viewed_at >= NOW() - ($2 || ' days')::interval`,
      [orgId, days]
    );
    return rows[0]?.total || 0;
  } catch { return 0; }
}

/**
 * Aufrufe gruppiert nach Tag (fuer Chart-Darstellung).
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {{ days?: number }} opts
 * @returns {Promise<Array<{day: string, views: number}>>}
 */
export async function getProfileViewsByDay(pool, orgId, { days = 30 } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT DATE(viewed_at) AS day, COUNT(*)::int AS views
       FROM profile_view_events
       WHERE viewed_org_id = $1
         AND viewed_at >= NOW() - ($2 || ' days')::interval
       GROUP BY DATE(viewed_at)
       ORDER BY day ASC`,
      [orgId, days]
    );
    return rows;
  } catch { return []; }
}

/**
 * Aufrufe gruppiert nach Profilbereich (section-Breakdown).
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {{ days?: number }} opts
 * @returns {Promise<Array<{section: string|null, views: number}>>}
 */
export async function getProfileViewsBySection(pool, orgId, { days = 30 } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(referrer_section, 'main') AS section, COUNT(*)::int AS views
       FROM profile_view_events
       WHERE viewed_org_id = $1
         AND viewed_at >= NOW() - ($2 || ' days')::interval
       GROUP BY referrer_section
       ORDER BY views DESC`,
      [orgId, days]
    );
    return rows;
  } catch { return []; }
}

/**
 * Like-Anzahl fuer eine Organisation.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<number>}
 */
export async function getProfileLikeCount(pool, orgId) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM profile_likes WHERE liked_org_id = $1`,
      [orgId]
    );
    return rows[0]?.total || 0;
  } catch { return 0; }
}

/**
 * Prüft ob ein bestimmter User das Profil bereits geliked hat.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {string} liker_user_id
 * @returns {Promise<boolean>}
 */
export async function hasUserLikedProfile(pool, orgId, likerUserId) {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM profile_likes
       WHERE liked_org_id = $1 AND liker_user_id = $2
       LIMIT 1`,
      [orgId, likerUserId]
    );
    return rows.length > 0;
  } catch { return false; }
}

/* ── Zusammengefasste Analytics (fuer Profil-Besitzer) ── */

/**
 * Vollstaendige Analytics-Zusammenfassung fuer den Profilbesitzer.
 * Enthält Zeitfenster-Daten fuer 7d, 30d und 90d.
 *
 * Basic (PRO): views_7d, views_30d, likes_count
 * Advanced (INDIVIDUELL): zusaetzlich views_90d, sections_30d, views_by_day_30d
 *
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {{ advanced?: boolean }} opts
 * @returns {Promise<Object>}
 */
export async function getProfileAnalyticsSummary(pool, orgId, { advanced = false } = {}) {
  const [views7d, views30d, likesCount, sections30d] = await Promise.all([
    getProfileViewCount(pool, orgId, { days: 7 }),
    getProfileViewCount(pool, orgId, { days: 30 }),
    getProfileLikeCount(pool, orgId),
    advanced ? getProfileViewsBySection(pool, orgId, { days: 30 }) : Promise.resolve([])
  ]);

  const base = {
    org_id: orgId,
    views_7d: views7d,
    views_30d: views30d,
    likes_count: likesCount
  };

  if (!advanced) return base;

  const [views90d, viewsByDay30d] = await Promise.all([
    getProfileViewCount(pool, orgId, { days: 90 }),
    getProfileViewsByDay(pool, orgId, { days: 30 })
  ]);

  return {
    ...base,
    views_90d: views90d,
    sections_30d: sections30d,
    views_by_day_30d: viewsByDay30d
  };
}

/* ── Like / Favorite Aktionen ─────────────────────────── */

/**
 * Liked ein oeffentliches Profil (idempotent).
 * Self-Like wird abgewiesen (DB-Constraint + Backend-Check).
 * @param {import('pg').Pool} pool
 * @param {{ likedOrgId: string, likerUserId: string, likerOrgId: string }} params
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function likeProfile(pool, { likedOrgId, likerUserId, likerOrgId }) {
  if (!likedOrgId || !likerUserId || !likerOrgId) return { ok: false, reason: 'MISSING_PARAMS' };
  if (likedOrgId === likerOrgId) return { ok: false, reason: 'SELF_LIKE_NOT_ALLOWED' };
  try {
    await pool.query(
      `INSERT INTO profile_likes (liked_org_id, liker_user_id, liker_org_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (liked_org_id, liker_user_id) DO NOTHING`,
      [likedOrgId, likerUserId, likerOrgId]
    );
    return { ok: true };
  } catch (err) {
    if (err.code === '23514') return { ok: false, reason: 'SELF_LIKE_NOT_ALLOWED' };
    return { ok: false, reason: 'DB_ERROR' };
  }
}

/**
 * Entfernt ein Like (idempotent).
 * @param {import('pg').Pool} pool
 * @param {string} likedOrgId
 * @param {string} likerUserId
 * @returns {Promise<boolean>}
 */
export async function unlikeProfile(pool, likedOrgId, likerUserId) {
  try {
    await pool.query(
      `DELETE FROM profile_likes WHERE liked_org_id = $1 AND liker_user_id = $2`,
      [likedOrgId, likerUserId]
    );
    return true;
  } catch { return false; }
}

/**
 * Fügt ein Profil zur privaten Merkliste hinzu (idempotent).
 * @param {import('pg').Pool} pool
 * @param {{ ownerUserId: string, favoritedOrgId: string, note?: string }} params
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function addFavorite(pool, { ownerUserId, favoritedOrgId, note = null }) {
  try {
    await pool.query(
      `INSERT INTO profile_favorites (owner_user_id, favorited_org_id, note)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_user_id, favorited_org_id) DO UPDATE SET note = EXCLUDED.note`,
      [ownerUserId, favoritedOrgId, note || null]
    );
    return { ok: true };
  } catch { return { ok: false, reason: 'DB_ERROR' }; }
}

/**
 * Entfernt ein Profil aus der privaten Merkliste (idempotent).
 * @param {import('pg').Pool} pool
 * @param {string} ownerUserId
 * @param {string} favoritedOrgId
 * @returns {Promise<boolean>}
 */
export async function removeFavorite(pool, ownerUserId, favoritedOrgId) {
  try {
    await pool.query(
      `DELETE FROM profile_favorites WHERE owner_user_id = $1 AND favorited_org_id = $2`,
      [ownerUserId, favoritedOrgId]
    );
    return true;
  } catch { return false; }
}

/**
 * Listet die private Merkliste eines Users.
 * @param {import('pg').Pool} pool
 * @param {string} ownerUserId
 * @returns {Promise<Object[]>}
 */
export async function getFavorites(pool, ownerUserId) {
  try {
    const { rows } = await pool.query(
      `SELECT pf.*, o.name AS org_name
       FROM profile_favorites pf
       JOIN organizations o ON o.id = pf.favorited_org_id
       WHERE pf.owner_user_id = $1
       ORDER BY pf.created_at DESC`,
      [ownerUserId]
    );
    return rows;
  } catch { return []; }
}
