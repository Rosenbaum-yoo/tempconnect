/**
 * Org-level pilot lifecycle policy.
 * Hardened against user-level bypass by binding decisions to organization scope.
 */

const PILOT_STATUSES = new Set(["eligible", "active", "ended", "converted", "blocked", "exception"]);

function pilotError(code, message, details = null) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function normalizePolicyError(err) {
  if (err?.code === "42703" || err?.code === "42P01") {
    return pilotError(
      "PILOT_POLICY_SCHEMA_MISSING",
      "Pilot-Policy Schema nicht bereit. Bitte Migration 070 ausfuehren.",
      { db_code: err.code }
    );
  }
  return err;
}

export async function getOrganizationPilotState(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT id, parent_org_id, customer_stage, pilot_status, has_used_pilot, pilot_started_at, pilot_ended_at,
            converted_at, pilot_exception_allowed, pilot_exception_reason, pilot_exception_granted_by, pilot_exception_granted_at
     FROM organizations
     WHERE id = $1`,
    [orgId]
  );
  return rows[0] || null;
}

export async function resolveOrgFamily(pool, orgId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE up_tree AS (
       SELECT id, parent_org_id
       FROM organizations
       WHERE id = $1
       UNION
       SELECT o.id, o.parent_org_id
       FROM organizations o
       JOIN up_tree ut ON ut.parent_org_id = o.id
     ),
     root_org AS (
       SELECT id
       FROM up_tree
       WHERE parent_org_id IS NULL
       ORDER BY id
       LIMIT 1
     ),
     down_tree AS (
       SELECT o.id, o.parent_org_id
       FROM organizations o
       JOIN root_org r ON r.id = o.id
       UNION
       SELECT c.id, c.parent_org_id
       FROM organizations c
       JOIN down_tree d ON c.parent_org_id = d.id
     )
     SELECT id FROM down_tree`,
    [orgId]
  );
  return rows.map((r) => r.id);
}

export async function canActivatePilot(pool, orgId) {
  try {
    const familyIds = await resolveOrgFamily(pool, orgId);
    if (!familyIds.length) {
      return { allowed: false, reason: "ORG_NOT_FOUND" };
    }
    const { rows } = await pool.query(
      `SELECT id, pilot_status, has_used_pilot, pilot_exception_allowed
       FROM organizations
       WHERE id = ANY($1::uuid[])`,
      [familyIds]
    );
    const hardBlocked = rows.find((r) => r.pilot_status === "blocked");
    if (hardBlocked) {
      return { allowed: false, reason: "PILOT_BLOCKED_IN_FAMILY", blocked_org_id: hardBlocked.id };
    }
    const reusable = rows.some((r) => r.pilot_exception_allowed === true);
    const alreadyUsed = rows.some((r) => r.has_used_pilot === true);
    if (alreadyUsed && !reusable) {
      return { allowed: false, reason: "PILOT_ALREADY_USED" };
    }
    return { allowed: true, reason: null };
  } catch (err) {
    throw normalizePolicyError(err);
  }
}

export async function activatePilotForOrganization(pool, { orgId, actorUserId = null, source = "internal" }) {
  try {
    const eligibility = await canActivatePilot(pool, orgId);
    if (!eligibility.allowed) {
      throw pilotError("PILOT_NOT_ELIGIBLE", "Pilotphase bereits genutzt oder blockiert.", eligibility);
    }

    const { rows } = await pool.query(
      `UPDATE organizations
       SET pilot_status = 'active',
           has_used_pilot = TRUE,
           customer_stage = 'pilot',
           plan = 'INDIVIDUELL',
           billing_mode = 'pilot_contract',
           pilot_started_at = COALESCE(pilot_started_at, NOW()),
           pilot_ended_at = NULL,
           converted_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, pilot_status, has_used_pilot, pilot_started_at, customer_stage, billing_mode`,
      [orgId]
    );
    if (!rows[0]) throw pilotError("ORG_NOT_FOUND", "Organisation nicht gefunden.");
    return { ...rows[0], source, actor_user_id: actorUserId };
  } catch (err) {
    throw normalizePolicyError(err);
  }
}

export async function endPilotForOrganization(pool, { orgId, actorUserId = null, reason = null }) {
  try {
    const current = await getOrganizationPilotState(pool, orgId);
    if (!current) throw pilotError("ORG_NOT_FOUND", "Organisation nicht gefunden.");
    if (current.pilot_status !== "active") return { skipped: true, reason: "NOT_ACTIVE" };

    // BUG FIX: customer_stage muss 'live' bleiben, nicht 'demo'.
    // Pilotkunden sind echte Live-Kunden, auch nach Pilotende.
    const { rows } = await pool.query(
      `UPDATE organizations
       SET pilot_status = 'ended',
           customer_stage = 'live',
           billing_mode = CASE WHEN billing_mode = 'pilot_contract' THEN 'standard_catalog' ELSE billing_mode END,
           pilot_ended_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, pilot_status, pilot_ended_at, customer_stage, billing_mode`,
      [orgId]
    );
    return { ...rows[0], actor_user_id: actorUserId, reason };
  } catch (err) {
    throw normalizePolicyError(err);
  }
}

export async function convertPilotForOrganization(pool, { orgId, actorUserId = null, plan = null }) {
  try {
    const current = await getOrganizationPilotState(pool, orgId);
    if (!current) throw pilotError("ORG_NOT_FOUND", "Organisation nicht gefunden.");

    // Bestimme Zieltarif: explizit übergeben, oder target_plan_after_pilot aus DB, oder INDIVIDUAL
    const targetPlan = plan || current.target_plan_after_pilot || "INDIVIDUAL";
    const billingMode = ["INDIVIDUAL", "ENTERPRISE"].includes(targetPlan) ? "individual_contract" : "standard_catalog";
    let normalizedPlan = String(targetPlan || "DEMO").toUpperCase();
    if (normalizedPlan === "FREE") normalizedPlan = "DEMO";
    if (normalizedPlan === "ENTERPRISE" || normalizedPlan === "INDIVIDUAL") normalizedPlan = "INDIVIDUELL";

    const { rows } = await pool.query(
      `UPDATE organizations
       SET pilot_status = CASE WHEN pilot_status = 'active' THEN 'converted' ELSE pilot_status END,
           customer_stage = CASE WHEN pilot_status = 'active' THEN 'live' ELSE customer_stage END,
           billing_mode = CASE WHEN pilot_status = 'active' THEN $2 ELSE billing_mode END,
           plan = CASE WHEN pilot_status = 'active' THEN $3 ELSE plan END,
           converted_at = CASE WHEN pilot_status = 'active' THEN NOW() ELSE converted_at END,
           pilot_ended_at = CASE WHEN pilot_status = 'active' THEN NOW() ELSE pilot_ended_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, pilot_status, converted_at, pilot_ended_at, customer_stage, billing_mode`,
      [orgId, billingMode, normalizedPlan]
    );

    // Subscription anlegen für den Zieltarif (falls pilot war aktiv)
    if (rows[0]?.pilot_status === "converted" && targetPlan) {
      try {
        // Finde den Owner-User der Org für die Subscription
        const { rows: members } = await pool.query(
          `SELECT user_id FROM org_memberships
           WHERE org_id = $1 AND is_active = TRUE AND role_key = 'owner'
           ORDER BY created_at ASC LIMIT 1`,
          [orgId]
        );
        if (members[0]) {
          let normalizedPlan = String(targetPlan || "FREE").toUpperCase();
          if (normalizedPlan === "DEMO") normalizedPlan = "FREE";
          if (normalizedPlan === "ENTERPRISE" || normalizedPlan === "INDIVIDUAL") normalizedPlan = "INDIVIDUELL";
          const interval = ["FREE", "DEMO"].includes(normalizedPlan) ? "14 days" : "1 month";
          await pool.query(
            `INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end)
             VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '${interval}')`,
            [members[0].user_id, normalizedPlan]
          );
        }
      } catch { /* non-critical: subscription creation is best-effort */ }
    }

    return { ...rows[0], actor_user_id: actorUserId, plan: targetPlan, billing_mode: billingMode };
  } catch (err) {
    throw normalizePolicyError(err);
  }
}

export async function setPilotException(pool, { orgId, actorUserId, allowed, reason }) {
  if (!reason || String(reason).trim().length < 10) {
    throw pilotError("PILOT_EXCEPTION_REASON_REQUIRED", "Ausnahmegrund muss dokumentiert werden.");
  }
  const nextStatus = allowed ? "exception" : "blocked";
  let rows;
  try {
    ({ rows } = await pool.query(
      `UPDATE organizations
       SET pilot_exception_allowed = $2,
           pilot_exception_reason = $3,
           pilot_exception_granted_by = $4,
           pilot_exception_granted_at = NOW(),
           pilot_status = CASE
             WHEN $2 = TRUE THEN 'exception'
             WHEN has_used_pilot = TRUE THEN 'blocked'
             ELSE pilot_status
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, pilot_status, has_used_pilot, pilot_exception_allowed, pilot_exception_reason, pilot_exception_granted_by, pilot_exception_granted_at`,
      [orgId, !!allowed, String(reason).trim(), actorUserId || null]
    ));
  } catch (err) {
    throw normalizePolicyError(err);
  }
  if (!rows[0]) throw pilotError("ORG_NOT_FOUND", "Organisation nicht gefunden.");
  return { ...rows[0], next_status: nextStatus };
}

export function assertValidPilotStatus(status) {
  if (!PILOT_STATUSES.has(status)) {
    throw pilotError("INVALID_PILOT_STATUS", "Ungueltiger Pilot-Status.");
  }
}

/* ── Pilot Auto-Expiry (Cron) ─────────────────────────── */

const PILOT_MAX_MONTHS = 6;

/**
 * Beendet alle aktiven Piloten deren pilot_started_at > PILOT_MAX_MONTHS her ist.
 * Aufgerufen via /internal/pilot-expiry Cron.
 * @param {import('pg').Pool} pool
 * @param {number} [batchSize=100]
 * @returns {Promise<{ expired: number, ids: string[] }>}
 */
export async function expireStalePilots(pool, _batchSize = 100) {
  try {
    const { rows } = await pool.query(
      `UPDATE organizations
       SET pilot_status = 'ended',
           customer_stage = 'live',
           billing_mode = CASE WHEN billing_mode = 'pilot_contract' THEN 'standard_catalog' ELSE billing_mode END,
           pilot_ended_at = NOW(),
           updated_at = NOW()
       WHERE pilot_status = 'active'
         AND pilot_started_at IS NOT NULL
         AND pilot_started_at < NOW() - ($1 || ' months')::INTERVAL
       RETURNING id`,
      [PILOT_MAX_MONTHS]
    );
    return { expired: rows.length, ids: rows.map(r => r.id) };
  } catch (err) {
    throw normalizePolicyError(err);
  }
}
