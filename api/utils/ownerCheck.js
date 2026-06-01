/**
 * ownerCheck.js — Ownership-Pruefung inkl. Org-Mitgliedschaft.
 *
 * Erlaubt Zugriff wenn:
 *   1. entityOwnerId === sessionUserId (direkter Owner)
 *   2. entityOwnerId ist eine org_id, bei der sessionUserId aktive Mitgliedschaft hat
 *
 * Nutzung:
 *   import { canAccessAsOwner } from "../utils/ownerCheck.js";
 *   const allowed = await canAccessAsOwner(pool, row.requester_company_id, req.session.userId);
 *   if (!allowed) return res.status(403).json({ error: "FORBIDDEN" });
 */

/**
 * @param {import('pg').Pool} pool
 * @param {string|null|undefined} entityOwnerId — Owner-ID der Resource (User oder Org)
 * @param {string|null|undefined} sessionUserId — ID des eingeloggten Users
 * @returns {Promise<boolean>}
 */
export async function canAccessAsOwner(pool, entityOwnerId, sessionUserId) {
  if (!entityOwnerId || !sessionUserId) return false;

  // Direkter Match
  if (String(entityOwnerId) === String(sessionUserId)) return true;

  // Org-Mitgliedschaft pruefen
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM org_memberships
       WHERE org_id = $1 AND user_id = $2 AND status = 'active'
       LIMIT 1`,
      [entityOwnerId, sessionUserId]
    );
    return rows.length > 0;
  } catch (_err) {
    // Tabelle existiert ggf. nicht in allen Umgebungen — dann nur direkt-Match
    return false;
  }
}
