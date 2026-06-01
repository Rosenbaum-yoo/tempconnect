/**
 * entitlementService.js — Zentrale Entitlement-Engine fuer TempConnect.
 *
 * Eine Organisation hat:
 *   - aktiven Plan (DEMO/BASIS/PLUS/PRO/INDIVIDUELL) aus `organizations.plan`
 *     mit Pilot-Override und feature_bundle aus Migration 080.
 *   - feste Plan-Features aus `planFeatures.js`-Matrix.
 *   - Plan-Limits aus `userService.PLAN_LIMITS` (requests_send, listings, ...).
 *   - aktive Add-ons aus `org_active_addons`; Legacy-Requests sind nur noch
 *     ein temporaerer Backfill-/Compatibility-Fallback.
 *   - aktive offene Requests aus `subscription_requests` (open-Statuswerte).
 *   - Subscription-Live-State pro Owner-User aus `subscriptions`.
 *
 * Diese Datei ist die EINZIGE Stelle, die diese Quellen zu einem konsistenten
 * Entitlement-Snapshot zusammenfuehrt. Frontend liest ueber `/api/me/entitlements`,
 * Backend ueber `entitlementGuard`-Middleware.
 *
 * Verhaeltnis zu bestehenden Modulen:
 *   - `featureGate.requireFeature` bleibt als USER-zentrierte Convenience erhalten,
 *     ist aber jetzt ein duenner Wrapper um `canUseFeatureForUser`.
 *   - `usageMeteringService.checkUsageLimit` bleibt der Owner der Limit-DB-Queries;
 *     wir delegieren `getUsageAgainstLimits` direkt dorthin.
 *   - `enterpriseSurfaceAccessService` bleibt die Surface-Wahrheit (Hub-Cards/Nav)
 *     und ist ORTHOGONAL zu Entitlements; eine Surface kann sichtbar sein,
 *     ohne dass jedes Feature in ihr aktiv ist.
 */

import { hasFeature, isPilotCustomer as _isPilotCustomer, MATURITY_GATES } from "../config/planFeatures.js";
import { PLAN_CATALOG as _PLAN_CATALOG, FEATURE_CATALOG, ADDON_CATALOG, INDIVIDUELL_BASELINE } from "../config/planCatalog.js";
import { PLAN_LIMITS } from "./userService.js";
import * as usageMetering from "./usageMeteringService.js";

const OPEN_REQUEST_STATUSES = ["draft", "submitted", "under_review", "needs_clarification", "offered", "accepted"];

/**
 * Kulanzfrist nach faelligem Zahlungsausfall (WAVE_09 Billing).
 * Innerhalb dieser Frist nach `current_period_end` bleibt der Zugang
 * aktiv (Soft-Lock mit Warnbanner). Danach Hard-Lock (active=false).
 *
 * Exported fuer Unit-Tests und Config-Ueberblick.
 */
export const BILLING_GRACE_PERIOD_DAYS = 14;

const ADDON_FEATURE_MAP = Object.freeze({
  api: ["integrations"],
  spend: ["spend_analytics"],
  ratecards: ["rate_card_management"],
  governance: ["data_governance"],
  multitenant: ["org_settings", "departments", "multi_location"]
});

const PLAN_QUOTA_LIMITS = Object.freeze({
  DEMO:        { users: 1,  sites: 1,  suppliers: 0,  multi_org_slots: 1 },
  BASIS:       { users: 3,  sites: 1,  suppliers: 0,  multi_org_slots: 1 },
  PLUS:        { users: 10, sites: 3,  suppliers: 0,  multi_org_slots: 1 },
  PRO:         { users: 25, sites: 5,  suppliers: 0,  multi_org_slots: 1 },
  INDIVIDUELL: { users: INDIVIDUELL_BASELINE.seats_included, sites: -1, suppliers: 50, multi_org_slots: 1 }
});

/* ── Public API ─────────────────────────────────────────────── */

/**
 * Vollstaendiger Entitlement-Snapshot fuer eine Organisation.
 *
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @returns {Promise<EntitlementSnapshot>}
 */
export async function getOrganizationEntitlements(pool, orgId) {
  if (!orgId) {
    return demoSnapshot({ reason: "NO_ORG_CONTEXT" });
  }

  const orgRow = await loadOrgRow(pool, orgId);
  if (!orgRow) return demoSnapshot({ reason: "ORG_NOT_FOUND" });

  const plan = normalizePlan(orgRow.plan);
  const pilotActive = orgRow.pilot_status === "active";
  const isFeatureBundleEnterpriseFull = orgRow.feature_bundle === "enterprise_full";

  // Effektiver Plan (Pilot-Override hebt jeden DEMO/BASIS/PLUS/PRO auf INDIVIDUELL).
  const effectivePlan = pilotActive ? "INDIVIDUELL" : plan;
  const limits = PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.DEMO;

  // Feature-Liste auf Basis planFeatures-Matrix + maturity gates.
  const featureContext = {
    pilot_status: orgRow.pilot_status,
    customer_stage: orgRow.customer_stage
  };
  const features = computeFeatureMap(effectivePlan, featureContext);

  // Aktive Add-ons aus dedizierter Live-Tabelle, Fallback nur fuer Backfill.
  const activeAddons = await loadActiveAddons(pool, orgId);
  applyActiveAddonsToFeatures(features, activeAddons);
  const quotaLimits = computeQuotaLimits(effectivePlan, orgRow, activeAddons);

  // Pending Requests fuer UI-Hinweise + Self-Service-Sperren.
  const pendingRequests = await loadPendingRequests(pool, orgId);

  // Owner-Subscription (= "wer zahlt" pro Org).
  const subscription = await loadOwnerSubscription(pool, orgId);

  const subscriptionStatus = computeSubscriptionStatus({ orgRow, subscription, plan, pilotActive });

  return {
    org_id: orgId,
    org_name: orgRow.name || null,
    org_type: orgRow.type || null,
    account_type: orgRow.account_type || "live",
    plan_source: pilotActive ? "pilot_override" : "organization",
    plan,
    effective_plan: effectivePlan,
    feature_bundle: isFeatureBundleEnterpriseFull ? "enterprise_full" : "standard",
    pilot: {
      active: pilotActive,
      status: orgRow.pilot_status || null,
      started_at: orgRow.pilot_started_at || null,
      ended_at: orgRow.pilot_ended_at || null,
      converted_at: orgRow.converted_at || null
    },
    individual_tier: orgRow.individual_tier_auto || null,
    employee_count: orgRow.employee_count_approx || null,
    subscription: subscriptionStatus,
    limits: {
      plan_max_requests_send: limits.requests_send,
      plan_max_requests_receive: limits.requests_receive,
      plan_max_listings: limits.listings,
      notdienst: limits.notdienst === true,
      notdienst_monthly: limits.notdienst_monthly,
      sla_level: limits.sla_level,
      max_workers_per_request: limits.max_workers_per_request,
      enterprise_access: limits.enterprise_access === true,
      multi_org: effectivePlan === "INDIVIDUELL",
      plan_max_users: quotaLimits.users,
      plan_max_sites: quotaLimits.sites,
      plan_max_suppliers: quotaLimits.suppliers,
      plan_max_multi_org_slots: quotaLimits.multi_org_slots,
      seats_included:
        effectivePlan === "INDIVIDUELL" ? INDIVIDUELL_BASELINE.seats_included : null,
      extra_seat_cents:
        effectivePlan === "INDIVIDUELL" ? INDIVIDUELL_BASELINE.extra_seat_cents_per_month : null
    },
    features,
    active_addons: activeAddons,
    pending_requests: pendingRequests,
    maturity_gates: { ...MATURITY_GATES }
  };
}

/**
 * Ueberprueft ein einzelnes Feature gegen den Org-Snapshot. Dies ist die
 * Standard-Frage fuer jeden Backend-Guard und Frontend-CTA.
 *
 * @returns {Promise<EntitlementCheck>}
 */
export async function canUseFeature(pool, orgId, featureKey) {
  if (!featureKey) return denied(featureKey, "FEATURE_KEY_REQUIRED");

  const ent = await getOrganizationEntitlements(pool, orgId);
  return evaluateFeature(ent, featureKey);
}

/**
 * Wirft einen strukturierten Fehler, wenn das Feature nicht aktiv ist.
 * Aufrufer (Service oder Route) faengt `error.code` ab und mappt auf 403/etc.
 */
export async function assertFeatureAccess(pool, orgId, featureKey) {
  const check = await canUseFeature(pool, orgId, featureKey);
  if (!check.allowed) {
    const err = new Error(check.code);
    err.code = check.code;
    err.details = check;
    throw err;
  }
  return check;
}

export async function getPlanLimits(pool, orgId) {
  const ent = await getOrganizationEntitlements(pool, orgId);
  return ent.limits;
}

/**
 * Liefert pro Limit-Metric einen { current, limit, allowed } Eintrag.
 * Nutzt den existierenden `usageMeteringService` fuer die DB-Counts und ist
 * org-bezogen statt user-bezogen, indem wir die Owner-User-Id aufloesen.
 */
export async function getUsageAgainstLimits(pool, orgId, opts = {}) {
  const orgRow = await loadOrgRow(pool, orgId);
  if (!orgRow) return { error: "ORG_NOT_FOUND" };

  const plan = normalizePlan(orgRow.plan);
  const effectivePlan = opts.effectivePlan
    ? normalizePlan(opts.effectivePlan)
    : (orgRow.pilot_status === "active" ? "INDIVIDUELL" : plan);
  const activeAddons = await loadActiveAddons(pool, orgId);
  const quotaLimits = computeQuotaLimits(effectivePlan, orgRow, activeAddons);
  const quotaUsage = await loadQuotaUsage(pool, orgId);

  const ownerUser = await loadOwnerUser(pool, orgId);
  const ownerUserId = ownerUser?.id || null;

  const baseLimits = PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.DEMO;
  if (!ownerUserId) {
    return {
      requests_send: { current: 0, limit: baseLimits.requests_send, allowed: baseLimits.requests_send !== 0 },
      requests_receive: { current: 0, limit: baseLimits.requests_receive, allowed: baseLimits.requests_receive !== 0 },
      listings: buildLimitMetric(quotaUsage.listings, quotaLimits.listings),
      users: buildLimitMetric(quotaUsage.users, quotaLimits.users),
      sites: buildLimitMetric(quotaUsage.sites, quotaLimits.sites),
      suppliers: buildLimitMetric(quotaUsage.suppliers, quotaLimits.suppliers),
      multi_org_slots: buildLimitMetric(quotaUsage.multi_org_slots, quotaLimits.multi_org_slots)
    };
  }

  const [send, receive] = await Promise.all([
    usageMetering.checkUsageLimit(pool, ownerUserId, effectivePlan, "requests_send"),
    usageMetering.checkUsageLimit(pool, ownerUserId, effectivePlan, "requests_receive")
  ]);

  return {
    requests_send: send,
    requests_receive: receive,
    listings: buildLimitMetric(quotaUsage.listings, quotaLimits.listings),
    users: buildLimitMetric(quotaUsage.users, quotaLimits.users),
    sites: buildLimitMetric(quotaUsage.sites, quotaLimits.sites),
    suppliers: buildLimitMetric(quotaUsage.suppliers, quotaLimits.suppliers),
    multi_org_slots: buildLimitMetric(quotaUsage.multi_org_slots, quotaLimits.multi_org_slots)
  };
}

/**
 * Ist die Subscription der Org grundsaetzlich nutzbar? Antwort wird im UI
 * fuer "Konto-gesperrt"-Banner und im Backend fuer harte Mutationen genutzt.
 */
export async function isSubscriptionActive(pool, orgId) {
  const ent = await getOrganizationEntitlements(pool, orgId);
  return ent.subscription.active === true;
}

/**
 * Ist gerade eine Subscription-Anfrage fuer dieses Feature offen?
 * Wir matchen auf `desired_features` JSONB der offenen Anfragen.
 */
export async function isFeaturePendingApproval(pool, orgId, featureKey) {
  if (!orgId || !featureKey) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM subscription_requests
      WHERE org_id = $1
        AND status = ANY($2::text[])
        AND desired_features ? $3
      LIMIT 1`,
    [orgId, OPEN_REQUEST_STATUSES, featureKey]
  );
  return rows.length > 0;
}

/* ── Helpers ──────────────────────────────────────────────────── */

function normalizePlan(plan) {
  let p = String(plan || "DEMO").toUpperCase();
  if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
  if (p === "FREE") p = "DEMO";
  return p;
}

function demoSnapshot(extra = {}) {
  return {
    org_id: null,
    plan: "DEMO",
    effective_plan: "DEMO",
    feature_bundle: "standard",
    pilot: { active: false },
    subscription: { active: false, status: "no_org_context", reason: extra.reason || null },
    limits: {
      plan_max_requests_send: 0,
      plan_max_requests_receive: 0,
      plan_max_listings: 0,
      notdienst: false,
      notdienst_monthly: 0,
      sla_level: "none",
      max_workers_per_request: 0,
      enterprise_access: false,
      multi_org: false,
      plan_max_users: 1,
      plan_max_sites: 1,
      plan_max_suppliers: 0,
      plan_max_multi_org_slots: 1,
      seats_included: null,
      extra_seat_cents: null
    },
    features: computeFeatureMap("DEMO", {}),
    active_addons: [],
    pending_requests: [],
    maturity_gates: { ...MATURITY_GATES },
    ...extra
  };
}

async function loadOrgRow(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT id, name, type, plan, pilot_status, has_used_pilot, pilot_started_at,
            pilot_ended_at, converted_at, feature_bundle, account_type,
            individual_tier_auto, employee_count_approx, billing_mode, customer_stage,
            parent_org_id, is_active,
            custom_limit_users, custom_limit_sites, custom_limit_listings,
            custom_limit_suppliers, custom_limit_multi_org_slots
       FROM organizations WHERE id = $1`,
    [orgId]
  );
  return rows[0] || null;
}

async function loadOwnerUser(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email
       FROM org_memberships om
       JOIN users u ON u.id = om.user_id
      WHERE om.org_id = $1 AND om.is_active = TRUE AND om.role_key = 'owner'
      ORDER BY om.created_at ASC LIMIT 1`,
    [orgId]
  );
  return rows[0] || null;
}

async function loadOwnerSubscription(pool, orgId) {
  const owner = await loadOwnerUser(pool, orgId);
  if (!owner) return null;
  const { rows } = await pool.query(
    `SELECT id, plan, status, current_period_start, current_period_end,
            cancel_requested_at, cancel_at, canceled_at,
            cancel_reason, created_at, updated_at
       FROM subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [owner.id]
  );
  return rows[0] || null;
}

function computeSubscriptionStatus({ orgRow, subscription, plan, pilotActive }) {
  if (pilotActive) {
    return {
      active: true,
      status: "pilot",
      pilot: true,
      cancel_at: null,
      reason: null
    };
  }
  // INDIVIDUELL ohne Pilot = Vertragskunde, Status haengt am Account-Team.
  if (plan === "INDIVIDUELL" && orgRow.billing_mode === "individual_contract") {
    return { active: true, status: "individual_contract", pilot: false, cancel_at: null, reason: null };
  }
  // Standardpfad: DEMO bedeutet "Trial ohne Bezahlung" und ist als active=true zu sehen,
  // damit Self-Service-Pfade funktionieren. Erst canceled blockiert harte Mutationen.
  if (!subscription) {
    return { active: plan === "DEMO", status: plan === "DEMO" ? "demo" : "no_subscription", pilot: false, cancel_at: null, reason: null };
  }
  switch (subscription.status) {
    case "active":
      return { active: true, status: "active", pilot: false, cancel_at: null, reason: null };
    case "canceling":
      return { active: true, status: "canceling", pilot: false, cancel_at: subscription.cancel_at || null, reason: subscription.cancel_reason || null };
    case "canceled":
      return { active: false, status: "canceled", pilot: false, cancel_at: subscription.cancel_at || null, reason: subscription.cancel_reason || null };
    case "past_due": {
      // Grace Period: innerhalb von BILLING_GRACE_PERIOD_DAYS nach current_period_end
      // bleibt der Zugang aktiv (Soft-Lock). Danach Hard-Lock.
      if (subscription.current_period_end) {
        const graceMs = BILLING_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
        const graceCutoff = new Date(subscription.current_period_end).getTime() + graceMs;
        if (graceCutoff > Date.now()) {
          const cutoffDate = new Date(graceCutoff).toISOString().slice(0, 10);
          return {
            active: true,
            status: "past_due_grace",
            pilot: false,
            cancel_at: null,
            reason: "Zahlung ueberfaellig — Zugang aktiv bis " + cutoffDate + ". Bitte Zahlungsmethode aktualisieren."
          };
        }
      }
      return { active: false, status: "past_due", pilot: false, cancel_at: null, reason: "Zahlung ueberfaellig — Zugang gesperrt. Bitte Tarif-Team kontaktieren." };
    }
    default:
      return { active: false, status: subscription.status || "unknown", pilot: false, cancel_at: null, reason: null };
  }
}

function computeFeatureMap(effectivePlan, featureContext) {
  const out = {};
  for (const f of FEATURE_CATALOG) {
    const allowed = hasFeature(effectivePlan, f.feature_key, featureContext);
    out[f.feature_key] = {
      key: f.feature_key,
      name: f.name,
      category: f.category,
      allowed,
      requires_staff_approval: f.requires_staff_approval === true,
      maturity_locked: MATURITY_GATES[f.feature_key] === false
    };
  }
  return out;
}

async function loadActiveAddons(pool, orgId) {
  try {
    const { rows } = await pool.query(
      `WITH active_live AS (
         SELECT addon_key AS key, addon_name AS name, price_cents, interval,
                source, source_request_id, activated_at, metadata
           FROM org_active_addons
          WHERE org_id = $1
            AND status = 'active'
            AND (expires_at IS NULL OR expires_at > NOW())
       ),
       latest_request AS (
         SELECT id, desired_addons
           FROM subscription_requests
          WHERE org_id = $1 AND status = 'active'
          ORDER BY status_updated_at DESC
          LIMIT 1
       ),
       fallback_addons AS (
         SELECT addon->>'key' AS key,
                addon->>'name' AS name,
                NULLIF(addon->>'price_cents', '')::int AS price_cents,
                addon->>'interval' AS interval,
                'subscription_request_fallback'::text AS source,
                latest_request.id AS source_request_id,
                NULL::timestamptz AS activated_at,
                '{}'::jsonb AS metadata
           FROM latest_request
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE
               WHEN jsonb_typeof(latest_request.desired_addons) = 'array'
                 THEN latest_request.desired_addons
               ELSE '[]'::jsonb
             END
           ) addon
       )
       SELECT * FROM active_live
       UNION ALL
       SELECT * FROM fallback_addons
        WHERE NOT EXISTS (SELECT 1 FROM active_live)`,
      [orgId]
    );
    if (rows.length && Object.prototype.hasOwnProperty.call(rows[0], "desired_addons")) {
      return mapAddonList(rows[0].desired_addons || [], "subscription_request_fallback");
    }
    return mapAddonRows(rows);
  } catch {
    return loadActiveAddonsFromRequests(pool, orgId);
  }
}

async function loadActiveAddonsFromRequests(pool, orgId) {
  // TEMPORAERER FALLBACK: nur fuer Umgebungen vor Migration/Backfill 105.
  const { rows } = await pool.query(
    `SELECT desired_addons
       FROM subscription_requests
      WHERE org_id = $1 AND status = 'active'
      ORDER BY status_updated_at DESC LIMIT 1`,
    [orgId]
  );
  return mapAddonList(rows[0]?.desired_addons || [], "subscription_request_fallback");
}

function mapAddonRows(rows) {
  return (rows || []).filter((a) => a && a.key).map((a) => {
    const meta = ADDON_CATALOG.find((x) => x.key === a.key) || null;
    return {
      key: a.key,
      name: a.name || meta?.name || a.key,
      price_cents: meta?.price_cents ?? a.price_cents ?? null,
      interval: meta?.interval ?? a.interval ?? null,
      requires_staff_approval: meta?.requires_staff_approval === true,
      source: a.source || null,
      source_request_id: a.source_request_id || null,
      activated_at: a.activated_at || null
    };
  });
}

function mapAddonList(addons, source = null) {
  return (Array.isArray(addons) ? addons : []).map((a) => {
    const meta = ADDON_CATALOG.find((x) => x.key === a.key) || null;
    return {
      key: a.key,
      name: a.name || meta?.name || a.key,
      price_cents: meta?.price_cents ?? a.price_cents ?? null,
      interval: meta?.interval ?? a.interval ?? null,
      requires_staff_approval: meta?.requires_staff_approval === true,
      source,
      source_request_id: null,
      activated_at: null
    };
  }).filter((a) => a.key);
}

function applyActiveAddonsToFeatures(features, activeAddons) {
  for (const addon of activeAddons || []) {
    const mappedFeatures = ADDON_FEATURE_MAP[addon.key] || [];
    for (const featureKey of mappedFeatures) {
      if (!features[featureKey]) continue;
      if (features[featureKey].maturity_locked) continue;
      features[featureKey] = {
        ...features[featureKey],
        allowed: true,
        via_addon: addon.key
      };
    }
  }
}

function computeQuotaLimits(effectivePlan, orgRow = {}, activeAddons = []) {
  const baseQuota = PLAN_QUOTA_LIMITS[effectivePlan] || PLAN_QUOTA_LIMITS.DEMO;
  const planLimits = PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.DEMO;
  const addonKeys = new Set((activeAddons || []).map((a) => a.key));

  return {
    users: coalesceLimit(orgRow.custom_limit_users, baseQuota.users),
    sites: coalesceLimit(orgRow.custom_limit_sites, baseQuota.sites),
    listings: coalesceLimit(orgRow.custom_limit_listings, planLimits.listings),
    suppliers: coalesceLimit(orgRow.custom_limit_suppliers, baseQuota.suppliers),
    multi_org_slots: coalesceLimit(
      orgRow.custom_limit_multi_org_slots,
      addonKeys.has("multitenant") ? Math.max(baseQuota.multi_org_slots || 1, 5) : baseQuota.multi_org_slots
    )
  };
}

function coalesceLimit(customValue, fallback) {
  if (customValue === null || customValue === undefined || customValue === "") {
    return fallback == null ? null : Number(fallback);
  }
  const n = Number(customValue);
  if (Number.isFinite(n)) return n;
  return fallback == null ? null : Number(fallback);
}

function buildLimitMetric(current, limit) {
  const normalizedCurrent = Number.isFinite(Number(current)) ? Number(current) : 0;
  if (limit === -1) return { current: normalizedCurrent, limit: -1, allowed: true };
  if (limit == null) return { current: normalizedCurrent, limit: null, allowed: true };
  const normalizedLimit = Number(limit);
  return {
    current: normalizedCurrent,
    limit: normalizedLimit,
    allowed: normalizedCurrent < normalizedLimit
  };
}

async function loadQuotaUsage(pool, orgId) {
  const [users, sites, listings, suppliers, multiOrgSlots] = await Promise.all([
    countActiveUsers(pool, orgId),
    countSites(pool, orgId),
    countListings(pool, orgId),
    countSuppliers(pool, orgId),
    countMultiOrgSlots(pool, orgId)
  ]);
  return {
    users,
    sites,
    listings,
    suppliers,
    multi_org_slots: multiOrgSlots
  };
}

async function countActiveUsers(pool, orgId) {
  return await safeCount(
    pool,
    "SELECT COUNT(*)::int AS cnt FROM org_memberships WHERE org_id = $1 AND is_active = TRUE",
    [orgId]
  );
}

async function countSites(pool, orgId) {
  const locations = await safeCount(
    pool,
    "SELECT COUNT(*)::int AS cnt FROM org_locations WHERE org_id = $1 AND is_active = TRUE",
    [orgId]
  );
  if (locations > 0) return locations;
  return safeCount(
    pool,
    "SELECT COUNT(*)::int AS cnt FROM org_departments WHERE org_id = $1 AND is_active = TRUE",
    [orgId]
  );
}

async function countListings(pool, orgId) {
  return await safeCount(
    pool,
    `SELECT COUNT(*)::int AS cnt
       FROM capacity_posts cp
      WHERE cp.status = 'active'
        AND (
          cp.org_id = $1
          OR cp.supplier_company_id IN (
            SELECT user_id FROM org_memberships
             WHERE org_id = $1 AND is_active = TRUE
          )
        )`,
    [orgId]
  );
}

async function countSuppliers(pool, orgId) {
  return await safeCount(
    pool,
    "SELECT COUNT(*)::int AS cnt FROM vendor_pool WHERE client_org_id = $1 AND status = 'active'",
    [orgId]
  );
}

async function countMultiOrgSlots(pool, orgId) {
  return await safeCount(
    pool,
    `WITH root AS (
       SELECT COALESCE(parent_org_id, id) AS root_id
         FROM organizations
        WHERE id = $1
     )
     SELECT COUNT(*)::int AS cnt
       FROM organizations o
       JOIN root r ON TRUE
      WHERE o.is_active = TRUE
        AND (o.id = r.root_id OR o.parent_org_id = r.root_id)`,
    [orgId]
  );
}

async function safeCount(pool, sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return Number(rows[0]?.cnt || 0);
  } catch {
    return 0;
  }
}

async function loadPendingRequests(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT id, request_type, status, desired_plan, desired_individual_tier,
            desired_features, expected_start_date, status_updated_at, created_at
       FROM subscription_requests
      WHERE org_id = $1 AND status = ANY($2::text[])
      ORDER BY created_at DESC`,
    [orgId, OPEN_REQUEST_STATUSES]
  );
  return rows;
}

function evaluateFeature(ent, featureKey) {
  const feat = ent.features ? ent.features[featureKey] : null;

  // Subscription-Inactive-Gate hat absolute Prioritaet (keine Mutationen wenn canceled).
  if (!ent.subscription?.active) {
    return {
      allowed: false,
      code: "SUBSCRIPTION_INACTIVE",
      message: "Das Abo ist nicht aktiv. Bitte Abo reaktivieren, um diese Funktion zu nutzen.",
      feature: featureKey,
      plan: ent.effective_plan,
      subscription_status: ent.subscription?.status || null
    };
  }

  if (!feat) {
    return {
      allowed: false,
      code: "FEATURE_UNKNOWN",
      message: "Unbekanntes Feature.",
      feature: featureKey,
      plan: ent.effective_plan
    };
  }

  if (feat.maturity_locked) {
    return {
      allowed: false,
      code: "FEATURE_NOT_MATURE",
      message: "Funktion noch nicht produktionsreif freigegeben.",
      feature: featureKey,
      plan: ent.effective_plan
    };
  }

  if (!feat.allowed) {
    // Pruefe, ob eine Approval-Anfrage gerade laeuft.
    const pendingForFeature = (ent.pending_requests || []).some((r) => {
      const arr = Array.isArray(r.desired_features) ? r.desired_features : [];
      return arr.includes(featureKey);
    });
    return {
      allowed: false,
      code: pendingForFeature ? "FEATURE_PENDING_APPROVAL" : "FEATURE_NOT_ENABLED",
      message: pendingForFeature
        ? "Anfrage zur Freischaltung dieses Features liegt beim Account-Team."
        : "Funktion ist im aktuellen Tarif nicht enthalten. Upgrade erforderlich.",
      feature: featureKey,
      plan: ent.effective_plan,
      requires_staff_approval: feat.requires_staff_approval === true
    };
  }

  return {
    allowed: true,
    code: "OK",
    feature: featureKey,
    plan: ent.effective_plan,
    requires_staff_approval: feat.requires_staff_approval === true
  };
}

function denied(featureKey, code) {
  return { allowed: false, code, feature: featureKey || null };
}

/**
 * @typedef {Object} EntitlementCheck
 * @property {boolean} allowed
 * @property {string}  code
 * @property {string}  [message]
 * @property {string}  [feature]
 * @property {string}  [plan]
 * @property {string}  [subscription_status]
 * @property {boolean} [requires_staff_approval]
 */

/**
 * @typedef {Object} EntitlementSnapshot
 * @property {string|null} org_id
 * @property {string} plan
 * @property {string} effective_plan
 * @property {string} feature_bundle
 * @property {object} pilot
 * @property {object} subscription
 * @property {object} limits
 * @property {Record<string, object>} features
 * @property {object[]} active_addons
 * @property {object[]} pending_requests
 * @property {object} maturity_gates
 */
