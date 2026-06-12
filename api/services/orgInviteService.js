/**
 * Org-Invitation-Service (Fixplan 3.3 / §0 Enterprise-Luecke): Org-Mitglieder per E-Mail-Token
 * einladen + annehmen. Sicherheit:
 *  - Token nur als SHA-256-Hash in der DB (Klartext nur einmalig fuer den Mail-Link).
 *  - Einladbare Rollen: alle org-internen Rollen AUSSER owner/worker/platform_admin (siehe INVITABLE_ROLES)
 *    -> kein Privilege-Escalation (Eigentuemerschaft/Worker/Plattform werden nie per Invite vergeben).
 *  - Single-Use + Ablauf (7 Tage); pro (org, email) max. 1 offene Einladung.
 *  - Accept verlangt Email-Match (annehmender Nutzer == eingeladene Adresse) + laeuft transaktional.
 */
import crypto from "node:crypto";
import { withTransaction } from "../utils/transaction.js";

export const INVITE_TTL_DAYS = 7;
// Deckungsgleich mit updateMemberSchema (orgControlCenter) minus 'owner' (kein Escalation).
// owner/worker/platform_admin sind bewusst NICHT einladbar.
export const INVITABLE_ROLES = [
  "admin", "program_manager", "hiring_manager", "supplier_manager",
  "finance", "recruiter", "dispatcher", "member", "supplier_user", "viewer"
];

function err(message, status) { const e = new Error(message); e.status = status; return e; }
function hashToken(raw) { return crypto.createHash("sha256").update(String(raw)).digest("hex"); }
function normEmail(email) { return String(email || "").trim().toLowerCase(); }

/** Kryptographisch sicheres Roh-Token fuer den Einladungs-Link (URL-safe). */
export function generateInviteToken() { return crypto.randomBytes(32).toString("base64url"); }

/**
 * Legt eine Einladung an. Gibt { invite, rawToken } zurueck — rawToken NUR hier (fuer den Mail-Link),
 * nie persistiert. Wirft 400/409 bei ungueltiger Rolle/Email, bestehendem Mitglied, offener Einladung.
 */
export async function createInvite(pool, { orgId, email, roleKey = "member", invitedBy = null }) {
  if (!orgId) throw err("ORG_REQUIRED", 400);
  const mail = normEmail(email);
  if (!mail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw err("INVALID_EMAIL", 400);
  if (!INVITABLE_ROLES.includes(roleKey)) throw err("INVALID_ROLE", 400);

  const { rows: member } = await pool.query(
    `SELECT 1 FROM org_memberships m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 AND lower(u.email) = $2 AND m.is_active = TRUE LIMIT 1`,
    [orgId, mail]
  );
  if (member.length) throw err("ALREADY_MEMBER", 409);

  const rawToken = generateInviteToken();
  try {
    const { rows } = await pool.query(
      `INSERT INTO org_invitations (org_id, email, role_key, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' days')::interval)
       RETURNING id, org_id, email, role_key, status, expires_at, created_at`,
      [orgId, mail, roleKey, hashToken(rawToken), invitedBy, INVITE_TTL_DAYS]
    );
    return { invite: rows[0], rawToken };
  } catch (e) {
    if (e.code === "23505") throw err("INVITE_PENDING", 409); // uq_org_invitations_pending
    throw e;
  }
}

/** Offene Einladungen einer Org. */
export async function listInvites(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT id, email, role_key, status, invited_by, expires_at, created_at
     FROM org_invitations WHERE org_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
    [orgId]
  );
  return rows;
}

/** Einladung zuruecknehmen (nur offene, nur eigene Org). */
export async function revokeInvite(pool, { orgId, inviteId }) {
  const { rows } = await pool.query(
    `UPDATE org_invitations SET status = 'revoked'
     WHERE id = $1 AND org_id = $2 AND status = 'pending' RETURNING id`,
    [inviteId, orgId]
  );
  return rows.length > 0;
}

/** Einladungs-Details fuer eine Accept-Seite (nur offen + nicht abgelaufen). Kein Token-Leak. */
export async function getInviteByToken(pool, rawToken) {
  if (!rawToken) return null;
  const { rows } = await pool.query(
    `SELECT i.id, i.org_id, i.email, i.role_key, i.expires_at, o.name AS org_name
     FROM org_invitations i JOIN organizations o ON o.id = i.org_id
     WHERE i.token_hash = $1 AND i.status = 'pending' AND i.expires_at > NOW() LIMIT 1`,
    [hashToken(rawToken)]
  );
  return rows[0] || null;
}

/**
 * Nimmt eine Einladung an: prueft Token (offen, nicht abgelaufen) + Email-Match,
 * legt org_membership an (idempotent), markiert Einladung als accepted. Transaktional.
 */
export function acceptInvite(pool, { rawToken, userId, userEmail }) {
  if (!rawToken || !userId) throw err("INVITE_INVALID", 400);
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `SELECT id, org_id, email, role_key FROM org_invitations
       WHERE token_hash = $1 AND status = 'pending' AND expires_at > NOW() FOR UPDATE`,
      [hashToken(rawToken)]
    );
    const inv = rows[0];
    if (!inv) throw err("INVITE_INVALID", 400);
    if (normEmail(userEmail) !== normEmail(inv.email)) throw err("EMAIL_MISMATCH", 403);

    await client.query(
      `INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (user_id, org_id) DO UPDATE SET role_key = EXCLUDED.role_key, is_active = TRUE, updated_at = NOW()`,
      [userId, inv.org_id, inv.role_key]
    );
    await client.query(
      `UPDATE org_invitations SET status = 'accepted', accepted_by = $1, accepted_at = NOW() WHERE id = $2`,
      [userId, inv.id]
    );
    return { org_id: inv.org_id, role_key: inv.role_key };
  });
}
