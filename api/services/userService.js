/**
 * User-Service: Profil, Plan, Account, DSGVO-Export.
 */
import { hasFeature } from "../config/planFeatures.js";
import { normalizePlanKey } from "../config/planCatalog.js";
import { hasPermission } from "./rbacService.js";
import { resolveEnterpriseSurfaceAccess } from "./enterpriseSurfaceAccessService.js";
import { withTransaction } from "../utils/transaction.js";

const BILLING_INTERVALS = {
  DEMO: "14 days",
  BASIS: "1 month",
  PLUS: "1 month",
  PRO: "1 month",
  INDIVIDUELL: "1 month"
};

/**
 * Liefert IMMER einen kanonischen Plan-Key fuer DB-Inserts.
 * Verwendet den zentralen Helper aus `planCatalog.js`.
 * Bestehende Aufrufer, die `FREE` uebergeben, bekommen weiter `DEMO` zurueck
 * (kanonisch nach Migration 102).
 */
function normalizePlanInput(plan) {
  return normalizePlanKey(plan, { fallback: "DEMO" });
}

export async function getLatestSubscription(pool, userId) {
  return await loadLatestSubscription(pool, userId);
}

export async function schedulePlanCancellation(pool, { userId, actorUserId = null, source = "self_service", reason = null } = {}) {
  return await withTransaction(pool, async (client) => {
    const subscription = await loadLatestSubscription(client, userId, { forUpdate: true });
    if (!subscription) return null;
    if (subscription.status === "canceling") return subscription;
    if (subscription.status === "canceled") return subscription;

    const { rows } = await client.query(
      `UPDATE subscriptions
       SET status = 'canceling',
           cancel_requested_at = NOW(),
           cancel_requested_by = $2,
           cancel_source = $3,
           cancel_reason = $4,
           current_period_start = COALESCE(current_period_start, created_at, NOW()),
           current_period_end = CASE
             WHEN current_period_end IS NULL OR current_period_end < NOW()
               THEN NOW() + INTERVAL '1 month'
             ELSE current_period_end
           END,
           cancel_at = CASE
             WHEN cancel_at IS NOT NULL THEN cancel_at
             WHEN current_period_end IS NULL OR current_period_end < NOW()
               THEN NOW() + INTERVAL '1 month'
             ELSE current_period_end
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, plan, status, current_period_start, current_period_end,
                 cancel_requested_at, cancel_at, canceled_at, cancel_source, cancel_reason`,
      [subscription.id, actorUserId, source, reason]
    );
    return rows[0] || subscription;
  });
}

export async function cancelPlanImmediately(pool, { userId, actorUserId = null, source = "self_service", reason = null, orgId = null } = {}) {
  return await withTransaction(pool, async (client) => {
    const subscription = await loadLatestSubscription(client, userId, { forUpdate: true });
    if (!subscription) return null;

    await client.query(
      `UPDATE subscriptions
       SET status = 'canceled',
           cancel_requested_at = COALESCE(cancel_requested_at, NOW()),
           cancel_requested_by = COALESCE(cancel_requested_by, $2),
           cancel_source = COALESCE(cancel_source, $3),
           cancel_reason = COALESCE(cancel_reason, $4),
           cancel_at = COALESCE(cancel_at, NOW()),
           canceled_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [subscription.id, actorUserId, source, reason]
    );

    await insertSubscription(client, userId, "DEMO", "active");
    if (orgId) {
      await client.query(
        "UPDATE organizations SET plan = 'DEMO', updated_at = NOW() WHERE id = $1",
        [orgId]
      );
    }
    return subscription;
  });
}

export async function finalizeCancellationIfDue(pool, userId, opts = {}) {
  return await withTransaction(pool, async (client) => {
    const subscription = await loadLatestSubscription(client, userId, { forUpdate: true });
    if (!subscription || subscription.status !== "canceling" || !subscription.cancel_at) return subscription;
    const cancelAt = new Date(subscription.cancel_at);
    if (Number.isNaN(cancelAt.getTime()) || cancelAt > new Date()) return subscription;

    await client.query(
      `UPDATE subscriptions
       SET status = 'canceled',
           cancel_at = COALESCE(cancel_at, NOW()),
           canceled_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [subscription.id]
    );

    await insertSubscription(client, userId, "DEMO", "active");
    if (opts?.orgId) {
      await client.query(
        "UPDATE organizations SET plan = 'DEMO', updated_at = NOW() WHERE id = $1",
        [opts.orgId]
      );
    }
    return loadLatestSubscription(client, userId);
  });
}

function normalizePlanDisplay(plan) {
  return normalizePlanKey(plan, { fallback: "DEMO" });
}

function getBillingIntervalForPlan(plan) {
  const normalizedPlan = normalizePlanInput(plan);
  return BILLING_INTERVALS[normalizedPlan] || "1 month";
}

async function insertSubscription(pool, userId, plan, status = "active") {
  const normalizedPlan = normalizePlanInput(plan);
  const interval = getBillingIntervalForPlan(normalizedPlan);
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '${interval}')
     -- P9/C2: hoechstens ein aktives Abo je Nutzer (Mig 173). Bei einer
     -- Wiederanlage (SSO/SCIM-Reprovisionierung) bleibt das bestehende bestehen,
     -- statt am Index zu scheitern.
     ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING`,
    [userId, normalizedPlan, status]
  );
  return normalizedPlan;
}

async function loadLatestSubscription(pool, userId, { forUpdate = false } = {}) {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const { rows } = await pool.query(
    `SELECT id, plan, status, current_period_start, current_period_end,
            cancel_requested_at, cancel_at, canceled_at, cancel_requested_by,
            cancel_source, cancel_reason, created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1${lock}`,
    [userId]
  );
  return rows[0] || null;
}

export const PLAN_LIMITS = {
  DEMO:        { price: 0,   requests_send: 0,  requests_receive: 0,  listings: 0,  notdienst: false, notdienst_monthly: 0,  sla_level: 'none',       enterprise_access: false, max_workers_per_request: 0  },
  BASIS:       { price: 150, requests_send: 5,  requests_receive: 5,  listings: 5,  notdienst: true,  notdienst_monthly: 1,  sla_level: 'none',       enterprise_access: true,  max_workers_per_request: 3  },
  PLUS:        { price: 499, requests_send: 20, requests_receive: 20, listings: 20, notdienst: true,  notdienst_monthly: 1,  sla_level: 'PRO',        enterprise_access: true,  max_workers_per_request: 10 },
  PRO:         { price: 799, requests_send: -1, requests_receive: -1, listings: -1, notdienst: true,  notdienst_monthly: 1,  sla_level: 'EMERGENCY',  enterprise_access: true,  max_workers_per_request: 20 },
  INDIVIDUELL: { price: 0,   requests_send: -1, requests_receive: -1, listings: -1, notdienst: true,  notdienst_monthly: -1, sla_level: 'ENTERPRISE', enterprise_access: true,  max_workers_per_request: -1 }
};

// Backward-compat aliases
PLAN_LIMITS.ENTERPRISE = PLAN_LIMITS.INDIVIDUELL;
PLAN_LIMITS.INDIVIDUAL = PLAN_LIMITS.INDIVIDUELL;
PLAN_LIMITS.FREE = PLAN_LIMITS.DEMO;

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
export async function getUserAndPlan(pool, userId, opts = {}) {
  const u = await pool.query(
    "SELECT id, role, email, company_name, phone, contact_person, street, postal_code, city, vat_id, handelsregister_number, is_verified, latitude, longitude, onboarding_completed, is_demo, org_id, customer_stage FROM users WHERE id=$1",
    [userId]
  );
  if (!u.rows[0]) return null;
  const requestedOrgId = opts?.orgId || null;
  const activeOrgId = requestedOrgId || u.rows[0].org_id || null;

  let subscription = await loadLatestSubscription(pool, userId);
  if (subscription?.status === "canceling" && subscription.cancel_at) {
    const cancelAt = new Date(subscription.cancel_at);
    if (!Number.isNaN(cancelAt.getTime()) && cancelAt <= new Date()) {
      subscription = await finalizeCancellationIfDue(pool, userId, { orgId: activeOrgId });
    }
  }
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

  const dbPlan = subscription?.plan || "DEMO";

  // Resolve org role + pilot state + enrichment (needed before plan determination)
  let org_role = null;
  let org_name = null;
  let org_type = null;
  let org_plan = null;
  let pilot = null;
  let org_feature_bundle = "standard";
  let org_account_type = "live";
  let org_individual_tier_auto = null;
  let org_employee_count = null;
  try {
    const orgId = requestedOrgId || u.rows[0].org_id || null;
    const params = orgId ? [userId, orgId] : [userId];
    const om = await pool.query(
      `SELECT om.org_id, om.role_key,
              o.name AS org_name, o.type AS org_type, o.plan AS org_plan,
              o.pilot_status, o.has_used_pilot, o.pilot_started_at, o.pilot_ended_at, o.converted_at, o.pilot_exception_allowed,
              o.feature_bundle, o.account_type, o.individual_tier_auto, o.employee_count_approx, o.billing_mode, o.customer_stage AS org_customer_stage
       FROM org_memberships om
       JOIN organizations o ON o.id = om.org_id
       WHERE om.user_id = $1 AND om.is_active = TRUE
       ${orgId ? "AND om.org_id = $2" : ""}
       ORDER BY om.created_at ASC LIMIT 1`,
      params
    );
    if (om.rows[0]) {
      org_role = om.rows[0].role_key;
      org_name = om.rows[0].org_name || om.rows[0].name;
      org_type = om.rows[0].org_type || null;
      org_plan = om.rows[0].org_plan || null;
      org_feature_bundle = om.rows[0].feature_bundle || "standard";
      org_account_type = om.rows[0].account_type || "live";
      org_individual_tier_auto = om.rows[0].individual_tier_auto || null;
      org_employee_count = om.rows[0].employee_count_approx || null;
      pilot = {
        pilot_status: om.rows[0].pilot_status || null,
        has_used_pilot: om.rows[0].has_used_pilot === true,
        pilot_started_at: om.rows[0].pilot_started_at || null,
        pilot_ended_at: om.rows[0].pilot_ended_at || null,
        converted_at: om.rows[0].converted_at || null,
        pilot_exception_allowed: om.rows[0].pilot_exception_allowed === true,
        billing_mode: om.rows[0].billing_mode || null
      };
    }
  } catch { /* non-critical */ }

  // ── Pilot-Override: Aktive Pilotkunden erhalten den vollen Enterprise-Zugang.
  // Die DB-Subscription bleibt unverändert (für Billing), aber der EFFEKTIVE Plan
  // wird auf ENTERPRISE hochgestuft. So sieht der Pilotkunde überall die volle
  // Plattform: keine Paywalls, keine locked Cards, volle Limits.
  // Entscheidend ist der ORG-Level pilot_status (wird bei Registrierung automatisch
  // durch activatePilotForOrganization() gesetzt), nicht der User-Level customer_stage.
  const isActivePilot = !u.rows[0].is_demo
    && pilot?.pilot_status === "active";

  // Pilot-Override: Pilotkunden erhalten INDIVIDUELL (= volles Enterprise-Niveau)
  // Normalize: ENTERPRISE/INDIVIDUAL -> INDIVIDUELL
  const basePlan = org_plan || dbPlan || "DEMO";
  let normalizedPlan = basePlan;
  if (normalizedPlan === "ENTERPRISE" || normalizedPlan === "INDIVIDUAL") normalizedPlan = "INDIVIDUELL";
  if (normalizedPlan === "FREE") normalizedPlan = "DEMO";
  const plan = isActivePilot ? "INDIVIDUELL" : normalizedPlan;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.DEMO;

  // Feature-Bundle: Pilotkunden erhalten enterprise_full auch wenn Org noch nicht aktualisiert
  const effectiveFeatureBundle = isActivePilot ? "enterprise_full" : org_feature_bundle;
  const effectiveAccountType = u.rows[0].is_demo ? "demo" : org_account_type;
  const featureContext = {
    pilot_status: pilot?.pilot_status || null,
    customer_stage: u.rows[0].customer_stage || null
  };
  const capabilities = {
    worker_module: hasFeature(plan, "worker_module", featureContext),
    worker_view: org_role ? hasPermission(org_role, "worker.view") : false,
    worker_review: org_role ? hasPermission(org_role, "worker.review") : false,
    worker_create: org_role ? hasPermission(org_role, "worker.create") : false,
    worker_manage: org_role ? hasPermission(org_role, "worker.manage") : false,
    worker_edit: org_role ? hasPermission(org_role, "worker.edit") : false
  };
  const surface_access = resolveEnterpriseSurfaceAccess({
    plan,
    role: u.rows[0].role,
    orgRole: org_role,
    orgType: org_type,
    pilot,
    customerStage: u.rows[0].customer_stage || null
  });

  return {
    ...u.rows[0],
    plan,
    plan_source: isActivePilot ? "pilot_override" : (org_plan ? "organization" : "subscription"),
    org_role,
    org_name,
    org_type,
    pilot,
    feature_bundle: effectiveFeatureBundle,
    account_type: effectiveAccountType,
    capabilities,
    surface_access,
    individual_tier_auto: org_individual_tier_auto,
    employee_count: u.rows[0].employee_count || org_employee_count || null,
    sub_status: subscription?.status || "active",
    subscription: subscription ? {
      plan: normalizePlanDisplay(subscription.plan),
      status: subscription.status || "active",
      current_period_start: subscription.current_period_start || null,
      current_period_end: subscription.current_period_end || null,
      cancel_requested_at: subscription.cancel_requested_at || null,
      cancel_at: subscription.cancel_at || null,
      canceled_at: subscription.canceled_at || null,
      cancel_source: subscription.cancel_source || null,
      cancel_reason: subscription.cancel_reason || null
    } : null,
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
  await insertSubscription(pool, userId, plan, "active");
}

export async function cancelPlan(pool, userId) {
  await insertSubscription(pool, userId, "FREE", "active");
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

export async function markOnboardingComplete(pool, userId) {
  await pool.query(
    "UPDATE users SET onboarding_completed = TRUE, updated_at = NOW() WHERE id = $1",
    [userId]
  );
}

export async function resetOnboarding(pool, userId) {
  await pool.query(
    "UPDATE users SET onboarding_completed = FALSE, updated_at = NOW() WHERE id = $1",
    [userId]
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
