/**
 * Pilot-Voranmeldung (Marktstart One-Pager). Oeffentliche Anmeldung + Double-Opt-in + Kuratierung.
 *  - Token nur als SHA-256-Hash (Klartext nur einmalig fuer den Bestaetigungs-Link).
 *  - Eine Anmeldung pro Email & Welle (cohort); zukunftssicher fuer Folgemaerkte.
 *  - status-Workflow: pending -> confirmed (Opt-in) -> qualified/accepted/waitlist/rejected (Kuratierung).
 *  - "X von 30 Plaetzen" zaehlt akzeptierte Anmeldungen je Seite (kuratiert, nicht roh).
 */
import crypto from "node:crypto";

export const PREREG_COHORT = "hamburg-2026";
export const SIDES = ["company", "agency"];
export const SECTORS = ["logistik", "pflege", "industrie", "andere"];
export const SLOTS_PER_SIDE = 30;
export const PREREG_STATUSES = ["pending", "confirmed", "qualified", "accepted", "waitlist", "rejected"];

function err(code, status) { const e = new Error(code); e.code = code; e.status = status; return e; }
function hashToken(raw) { return crypto.createHash("sha256").update(String(raw)).digest("hex"); }
function normEmail(email) { return String(email || "").trim().toLowerCase(); }

export function generatePreregToken() { return crypto.randomBytes(32).toString("base64url"); }

/**
 * Legt eine Voranmeldung an (status='pending'). Gibt { prereg, rawToken } zurueck —
 * rawToken NUR hier (fuer den Opt-in-Link), nie persistiert.
 */
export async function createPrereg(pool, input = {}, meta = {}) {
  const email = normEmail(input.email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err("INVALID_EMAIL", 400);
  if (!SIDES.includes(input.side)) throw err("INVALID_SIDE", 400);
  const sector = SECTORS.includes(input.sector) ? input.sector : "andere";
  const orgName = String(input.org_name || "").trim();
  const contactName = String(input.contact_name || "").trim();
  if (!orgName || !contactName) throw err("MISSING_FIELDS", 400);

  const rawToken = generatePreregToken();
  try {
    const { rows } = await pool.query(
      `INSERT INTO pilot_preregistrations
        (cohort, region, side, sector, org_name, contact_name, email, phone, company_size,
         einsatzort_confirmed, capacity_or_need, message, referred_by, source, status, confirm_token_hash, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16,$17)
       RETURNING id, side, sector, status, created_at`,
      [
        input.cohort || PREREG_COHORT, input.region || "hamburg", input.side, sector,
        orgName, contactName, email, input.phone || null, input.company_size || null,
        input.einsatzort_confirmed === true, input.capacity_or_need || null, input.message || null,
        input.referred_by || null, input.source || null, hashToken(rawToken),
        meta.ip || null, meta.userAgent || null,
      ]
    );
    return { prereg: rows[0], rawToken };
  } catch (e) {
    if (e.code === "23505") throw err("ALREADY_REGISTERED", 409); // uq_prereg_email_cohort
    throw e;
  }
}

/** Double-Opt-in: bestaetigt eine pending-Anmeldung per Token (Hash-Lookup, gueltig 30 Tage ab Anmeldung). */
export async function confirmPrereg(pool, rawToken) {
  if (!rawToken) return null;
  const { rows } = await pool.query(
    // Token-Gueltigkeit auf 30 Tage ab Anmeldung begrenzt: frischer Consent-Nachweis +
    // ein geleakter Link ist nicht unbegrenzt replaybar.
    `UPDATE pilot_preregistrations
     SET status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
         consent_at = COALESCE(consent_at, NOW()), updated_at = NOW()
     WHERE confirm_token_hash = $1 AND created_at > NOW() - INTERVAL '30 days'
     RETURNING id, side, status`,
    [hashToken(rawToken)]
  );
  return rows[0] || null;
}

/** Oeffentlicher "X von 30 Plaetzen"-Zaehler je Seite (akzeptierte Anmeldungen). Keine personenbezogenen Daten. */
export async function getPublicCounts(pool, cohort = PREREG_COHORT) {
  const { rows } = await pool.query(
    `SELECT side, COUNT(*) FILTER (WHERE status = 'accepted') AS accepted
     FROM pilot_preregistrations WHERE cohort = $1 GROUP BY side`,
    [cohort]
  );
  const map = { company: 0, agency: 0 };
  rows.forEach((r) => { if (map[r.side] !== undefined) map[r.side] = Number(r.accepted) || 0; });
  return {
    cohort, slots_per_side: SLOTS_PER_SIDE,
    company: { accepted: map.company, remaining: Math.max(0, SLOTS_PER_SIDE - map.company) },
    agency:  { accepted: map.agency,  remaining: Math.max(0, SLOTS_PER_SIDE - map.agency) },
  };
}

/** Staff-Kuratierungs-Liste (alle Felder inkl. Telefon fuer Outreach). */
export async function listPreregs(pool, { cohort = PREREG_COHORT, side = null, status = null, limit = 500 } = {}) {
  const where = ["cohort = $1"];
  const params = [cohort];
  if (side) { params.push(side); where.push(`side = $${params.length}`); }
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT id, side, sector, org_name, contact_name, email, phone, company_size,
            einsatzort_confirmed, capacity_or_need, message, referred_by, source, status,
            consent_at, created_at
     FROM pilot_preregistrations WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

/** Staff-Kuratierung: Status setzen (qualified/accepted/waitlist/rejected ...). */
export async function setPreregStatus(pool, { id, status }) {
  if (!PREREG_STATUSES.includes(status)) throw err("INVALID_STATUS", 400);
  const { rows } = await pool.query(
    `UPDATE pilot_preregistrations SET status = $2, updated_at = NOW() WHERE id = $1
     RETURNING id, side, status`,
    [id, status]
  );
  if (!rows[0]) throw err("NOT_FOUND", 404);
  return rows[0];
}
