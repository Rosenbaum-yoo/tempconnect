/**
 * Profile Bounty Service — Marketplace Visibility Center (M-03)
 *
 * Staff-gesteuerte Profil-Promotions (Featured-Badge, Boost, Category-Top).
 *
 * SICHERHEITSPFLICHT (unveraenderlich):
 *   Bounties werden NIEMALS automatisch aktiviert.
 *   Status 'active' erfordert IMMER:
 *     1. Staff-Approve (approved_by Pflicht)
 *     2. Explizites Activate durch Staff (getrennte Aktion)
 *     3. Staff-Step-up in der Route (nicht in diesem Service)
 *
 * Lifecycle:
 *   draft → pending (Org)
 *   pending → approved (Staff)
 *   approved → active (Staff, Step-up Pflicht)
 *   active → expired (Cron wenn expires_at <= NOW())
 *   pending | approved → rejected (Staff)
 *   pending | approved → cancelled (Org)
 */

/* ── Erlaubte Transitions ─────────────────────────────── */

const TRANSITIONS = {
  draft:    ['pending'],
  pending:  ['approved', 'rejected', 'cancelled'],
  approved: ['active', 'rejected', 'cancelled'],
  active:   ['expired', 'cancelled'],
  expired:  [],
  rejected: [],
  cancelled: []
};

/**
 * Prüft ob ein Status-Übergang erlaubt ist.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isBountyTransitionAllowed(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/* ── Erstellen / Einreichen ───────────────────────────── */

/**
 * Erstellt einen neuen Bounty-Antrag im Status 'draft'.
 * @param {import('pg').Pool} pool
 * @param {{
 *   orgId: string,
 *   requestedBy: string,
 *   bountyType: 'featured_badge'|'search_boost'|'category_top'
 * }} params
 * @returns {Promise<Object|null>}
 */
export async function createBountyRequest(pool, { orgId, requestedBy, bountyType }) {
  const validTypes = ['featured_badge', 'search_boost', 'category_top'];
  if (!validTypes.includes(bountyType)) return null;
  if (!orgId || !requestedBy) return null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO profile_bounties (org_id, requested_by, bounty_type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [orgId, requestedBy, bountyType]
    );
    return rows[0] || null;
  } catch { return null; }
}

/**
 * Reicht einen Draft-Bounty zur Staff-Pruefung ein (draft → pending).
 * Org-Scope-Prüfung: bounty muss dieser Org gehören.
 * @param {import('pg').Pool} pool
 * @param {string} bountyId
 * @param {string} orgId
 * @returns {Promise<{ok: boolean, reason?: string, bounty?: Object}>}
 */
export async function submitBountyRequest(pool, bountyId, orgId) {
  const bounty = await getBountyById(pool, bountyId);
  if (!bounty) return { ok: false, reason: 'NOT_FOUND' };
  if (bounty.org_id !== orgId) return { ok: false, reason: 'FORBIDDEN' };
  if (!isBountyTransitionAllowed(bounty.status, 'pending')) {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${bounty.status.toUpperCase()}` };
  }
  const { rows } = await pool.query(
    `UPDATE profile_bounties SET status = 'pending', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [bountyId]
  );
  return { ok: true, bounty: rows[0] };
}

/* ── Staff-Aktionen ───────────────────────────────────── */

/**
 * Genehmigt einen Bounty-Antrag (pending → approved). Nur Staff.
 * @param {import('pg').Pool} pool
 * @param {string} bountyId
 * @param {string} staffUserId
 * @param {{ expiresAt?: string|null, staffNote?: string|null }} opts
 * @returns {Promise<{ok: boolean, reason?: string, bounty?: Object}>}
 */
export async function approveBounty(pool, bountyId, staffUserId, { expiresAt = null, staffNote = null } = {}) {
  const bounty = await getBountyById(pool, bountyId);
  if (!bounty) return { ok: false, reason: 'NOT_FOUND' };
  if (!isBountyTransitionAllowed(bounty.status, 'approved')) {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${bounty.status.toUpperCase()}` };
  }
  const { rows } = await pool.query(
    `UPDATE profile_bounties
     SET status = 'approved',
         approved_by  = $2,
         approved_at  = NOW(),
         expires_at   = $3,
         staff_note   = $4,
         updated_at   = NOW()
     WHERE id = $1
     RETURNING *`,
    [bountyId, staffUserId, expiresAt || null, staffNote || null]
  );
  return { ok: true, bounty: rows[0] };
}

/**
 * Aktiviert einen genehmigten Bounty (approved → active). Nur Staff.
 * ACHTUNG: Diese Funktion erfordert Staff-Step-up in der aufrufenden Route.
 * @param {import('pg').Pool} pool
 * @param {string} bountyId
 * @param {string} staffUserId
 * @returns {Promise<{ok: boolean, reason?: string, bounty?: Object}>}
 */
export async function activateBounty(pool, bountyId, _staffUserId) {
  const bounty = await getBountyById(pool, bountyId);
  if (!bounty) return { ok: false, reason: 'NOT_FOUND' };
  if (!isBountyTransitionAllowed(bounty.status, 'active')) {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${bounty.status.toUpperCase()}` };
  }
  // Sicherheitscheck: approved_by muss gesetzt sein (Staff muss vorher approved haben)
  if (!bounty.approved_by) return { ok: false, reason: 'NOT_APPROVED_FIRST' };

  const { rows } = await pool.query(
    `UPDATE profile_bounties
     SET status = 'active',
         activated_at = NOW(),
         updated_at   = NOW()
     WHERE id = $1
     RETURNING *`,
    [bountyId]
  );
  return { ok: true, bounty: rows[0] };
}

/**
 * Lehnt einen Bounty-Antrag ab (pending|approved → rejected). Nur Staff.
 * @param {import('pg').Pool} pool
 * @param {string} bountyId
 * @param {string} staffUserId
 * @param {string} reason
 * @returns {Promise<{ok: boolean, reason?: string, bounty?: Object}>}
 */
export async function rejectBounty(pool, bountyId, staffUserId, reason) {
  const bounty = await getBountyById(pool, bountyId);
  if (!bounty) return { ok: false, reason: 'NOT_FOUND' };
  if (!isBountyTransitionAllowed(bounty.status, 'rejected')) {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${bounty.status.toUpperCase()}` };
  }
  const { rows } = await pool.query(
    `UPDATE profile_bounties
     SET status = 'rejected',
         rejected_by      = $2,
         rejected_at      = NOW(),
         rejection_reason = $3,
         updated_at       = NOW()
     WHERE id = $1
     RETURNING *`,
    [bountyId, staffUserId, reason || null]
  );
  return { ok: true, bounty: rows[0] };
}

/* ── Org-Aktionen ─────────────────────────────────────── */

/**
 * Org storniert einen eigenen Bounty-Antrag (pending|approved → cancelled).
 * @param {import('pg').Pool} pool
 * @param {string} bountyId
 * @param {string} orgId
 * @returns {Promise<{ok: boolean, reason?: string, bounty?: Object}>}
 */
export async function cancelBounty(pool, bountyId, orgId) {
  const bounty = await getBountyById(pool, bountyId);
  if (!bounty) return { ok: false, reason: 'NOT_FOUND' };
  if (bounty.org_id !== orgId) return { ok: false, reason: 'FORBIDDEN' };
  if (!isBountyTransitionAllowed(bounty.status, 'cancelled')) {
    return { ok: false, reason: `INVALID_TRANSITION_FROM_${bounty.status.toUpperCase()}` };
  }
  const { rows } = await pool.query(
    `UPDATE profile_bounties SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [bountyId]
  );
  return { ok: true, bounty: rows[0] };
}

/* ── Lese-Funktionen ──────────────────────────────────── */

/**
 * @param {import('pg').Pool} pool
 * @param {string} bountyId
 * @returns {Promise<Object|null>}
 */
export async function getBountyById(pool, bountyId) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM profile_bounties WHERE id = $1`,
      [bountyId]
    );
    return rows[0] || null;
  } catch { return null; }
}

/**
 * Aktive Bounties für eine Organisation.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<Object[]>}
 */
export async function getActiveBountiesForOrg(pool, orgId) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM profile_bounties
       WHERE org_id = $1 AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY activated_at DESC`,
      [orgId]
    );
    return rows;
  } catch { return []; }
}

/**
 * Alle offenen Bounty-Anträge (pending) für Staff-Review.
 * @param {import('pg').Pool} pool
 * @param {{ limit?: number }} opts
 * @returns {Promise<Object[]>}
 */
export async function getPendingBounties(pool, { limit = 50 } = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT pb.*, o.name AS org_name
       FROM profile_bounties pb
       JOIN organizations o ON o.id = pb.org_id
       WHERE pb.status = 'pending'
       ORDER BY pb.created_at ASC
       LIMIT $1`,
      [limit]
    );
    return rows;
  } catch { return []; }
}

/* ── Cron: Abgelaufene Bounties schliessen ────────────── */

/**
 * Setzt alle aktiven Bounties auf 'expired' wenn expires_at <= NOW().
 * Intended für täglichen Cron-Job.
 * @param {import('pg').Pool} pool
 * @returns {Promise<number>} Anzahl ablaufener Bounties
 */
export async function expireOverdueBounties(pool) {
  try {
    const { rowCount } = await pool.query(
      `UPDATE profile_bounties
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'active'
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()`
    );
    return rowCount || 0;
  } catch { return 0; }
}

/* ── Org-Bounty-Übersicht ─────────────────────────────── */

/**
 * Alle Bounty-Anträge einer Org (alle Status, fuer Kundenansicht).
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<Object[]>}
 */
export async function getOrgBountyHistory(pool, orgId) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM profile_bounties
       WHERE org_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    return rows;
  } catch { return []; }
}
