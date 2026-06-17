/**
 * subscriptionRequestService.js
 *
 * Zentraler Service fuer ALLE Subscription-State-Aenderungs-Anfragen.
 * Spiegelt das Datenmodell aus Migration 099 wider und kapselt die
 * Statusmaschine + Audit-Trail.
 *
 * Request-Types:
 *   - new_individual: Neue Individuell-Anfrage (Public-Lead OK)
 *   - pilot:          Pilot-Conversion-Wunsch
 *   - upgrade:        Upgrade auf hoeheren Plan
 *   - downgrade:      Downgrade auf niedrigeren Plan
 *   - cancellation:   Kuendigungswunsch
 *
 * Status (10 Werte):
 *   draft, submitted, under_review, needs_clarification, offered,
 *   accepted, active, rejected, cancelled, expired
 *
 * Aktivierung der eigentlichen `subscriptions`/`organizations.plan` passiert
 * NICHT automatisch hier — der Aufrufer (Route oder Staff-Action) muss
 * `activate(...)` explizit nach Approval triggern. So bleibt die
 * Wirklichkeit (subscriptions/orgs) sauber von der Anfrage getrennt.
 */

import { PLAN, planFeatures } from "../config/planFeatures.js";
import { ADDON_CATALOG, normalizePlanKey } from "../config/planCatalog.js";
import { withTransaction } from "../utils/transaction.js";
import * as auditLog from "./auditLog.js";
import { getUsageAgainstLimits } from "./entitlementService.js";
import { ensureDocumentForRequest } from "./subscriptionDocumentService.js";
import { freezeQuoteSnapshot } from "./subscriptionQuoteSnapshotService.js";
import { PLAN_LIMITS } from "./userService.js";

/* ── State-Machine ────────────────────────────────────────────── */

export const REQUEST_TYPES = Object.freeze({
  NEW_INDIVIDUAL: "new_individual",
  PILOT: "pilot",
  UPGRADE: "upgrade",
  DOWNGRADE: "downgrade",
  CANCELLATION: "cancellation"
});

export const STATUS = Object.freeze({
  DRAFT: "draft",
  SUBMITTED: "submitted",
  UNDER_REVIEW: "under_review",
  NEEDS_CLARIFICATION: "needs_clarification",
  OFFERED: "offered",
  ACCEPTED: "accepted",
  ACTIVE: "active",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  EXPIRED: "expired"
});

const TERMINAL = new Set([STATUS.REJECTED, STATUS.CANCELLED, STATUS.EXPIRED, STATUS.ACTIVE]);
const OPEN = new Set([
  STATUS.DRAFT, STATUS.SUBMITTED, STATUS.UNDER_REVIEW,
  STATUS.NEEDS_CLARIFICATION, STATUS.OFFERED, STATUS.ACCEPTED
]);

/**
 * Erlaubte Statusuebergaenge. Gilt fuer alle request_types gleich; einzige
 * Ausnahme ist `cancellation`, das den `offered`->`accepted`-Pfad ueberspringt
 * (Cancellation wird normalerweise direkt under_review -> accepted -> active).
 */
const TRANSITIONS = Object.freeze({
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "needs_clarification", "offered", "accepted", "rejected", "cancelled"],
  under_review: ["needs_clarification", "offered", "accepted", "rejected", "cancelled"],
  needs_clarification: ["submitted", "under_review", "offered", "rejected", "cancelled"],
  offered: ["accepted", "needs_clarification", "rejected", "cancelled", "expired"],
  accepted: ["active", "expired"],
  active: ["expired"],
  rejected: [],
  cancelled: [],
  expired: []
});

/**
 * @param {string} status
 * @returns {boolean}
 */
export function isTerminalStatus(status) {
  return TERMINAL.has(String(status || ""));
}

/**
 * @param {string} status
 * @returns {boolean}
 */
export function isOpenStatus(status) {
  return OPEN.has(String(status || ""));
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} [requestType]
 * @returns {boolean}
 */
export function isValidTransition(from, to, requestType) {
  if (!from || !to) return false;
  const allowed = TRANSITIONS[from];
  if (!Array.isArray(allowed)) return false;
  if (!allowed.includes(to)) return false;
  // cancellation kann nicht in 'offered' gehen — bei Cancel gibt es keinen Preis-Counter-Vorschlag
  if (requestType === REQUEST_TYPES.CANCELLATION && to === "offered") return false;
  return true;
}

/**
 * @param {string} from
 * @param {string} [requestType]
 * @returns {string[]}
 */
export function listAllowedNextStatuses(from, requestType) {
  const base = TRANSITIONS[from] || [];
  if (requestType === REQUEST_TYPES.CANCELLATION) {
    return base.filter((s) => s !== "offered");
  }
  return [...base];
}

/**
 * Standard-Self-Service-Plaene koennen ohne Staff durchgehen.
 * Individuelle Tarife brauchen IMMER Staff.
 *
 * @param {{ request_type:string, desired_plan?:string, current_plan?:string }} req
 * @returns {boolean}
 */
export function canBypassStaffApproval(req) {
  if (!req) return false;
  if (req.request_type === REQUEST_TYPES.NEW_INDIVIDUAL) return false;
  if (req.request_type === REQUEST_TYPES.PILOT) return false;
  // Cancellation: nur Standard-Plaene self-service; Individuell braucht Staff.
  if (req.request_type === REQUEST_TYPES.CANCELLATION) {
    return req.current_plan && req.current_plan !== PLAN.INDIVIDUELL;
  }
  // Upgrade/Downgrade: nur wenn weder current noch desired INDIVIDUELL ist.
  const involvesIndividuell =
    req.current_plan === PLAN.INDIVIDUELL ||
    req.desired_plan === PLAN.INDIVIDUELL;
  return !involvesIndividuell;
}

/* ── Persistenz ───────────────────────────────────────────────── */

/**
 * Erzeugt eine neue Anfrage. Wird intern auch von Schritt 1
 * (enterprise-request) wiederverwendet, wenn ein Lead direkt in eine
 * Subscription-Anfrage konvertiert werden soll.
 *
 * Pflichtfelder: request_type + contact_email + (request_type-spezifisch).
 *
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {Object} input
 * @returns {Promise<Object>} eingefuegte Zeile
 */
export async function createRequest(pool, input) {
  if (!input || !input.request_type) {
    const err = new Error("REQUEST_TYPE_REQUIRED");
    err.code = "REQUEST_TYPE_REQUIRED";
    throw err;
  }
  if (!Object.values(REQUEST_TYPES).includes(input.request_type)) {
    const err = new Error("INVALID_REQUEST_TYPE");
    err.code = "INVALID_REQUEST_TYPE";
    throw err;
  }
  const contactEmail = String(input.contact_email || "").trim().toLowerCase();
  if (!contactEmail) {
    const err = new Error("CONTACT_EMAIL_REQUIRED");
    err.code = "CONTACT_EMAIL_REQUIRED";
    throw err;
  }

  // Cancellation/Upgrade/Downgrade ohne org/user → 400
  if (
    [REQUEST_TYPES.UPGRADE, REQUEST_TYPES.DOWNGRADE, REQUEST_TYPES.CANCELLATION].includes(input.request_type) &&
    !input.org_id && !input.user_id
  ) {
    const err = new Error("ORG_OR_USER_REQUIRED");
    err.code = "ORG_OR_USER_REQUIRED";
    throw err;
  }

  // Coming-Soon-Guard: Add-ons mit coming_soon=true duerfen nicht angefragt werden
  if (Array.isArray(input.desired_addons) && input.desired_addons.length > 0) {
    const addonKeys = input.desired_addons.map(a => (typeof a === "string" ? a : a.key)).filter(Boolean);
    const comingSoonKeys = addonKeys.filter(k => {
      const cat = ADDON_CATALOG.find(a => a.key === k);
      return cat && cat.coming_soon === true;
    });
    if (comingSoonKeys.length > 0) {
      const err = new Error("ADDON_NOT_AVAILABLE");
      err.code = "ADDON_NOT_AVAILABLE";
      err.status = 400;
      err.details = { coming_soon: comingSoonKeys };
      throw err;
    }
  }

  const initialStatus = String(input.status || STATUS.SUBMITTED);
  if (!Object.values(STATUS).includes(initialStatus)) {
    const err = new Error("INVALID_INITIAL_STATUS");
    err.code = "INVALID_INITIAL_STATUS";
    throw err;
  }

  const isSelfService = canBypassStaffApproval({
    request_type: input.request_type,
    current_plan: input.current_plan,
    desired_plan: input.desired_plan
  });

  const { rows } = await pool.query(
    `INSERT INTO subscription_requests (
       request_type, status,
       org_id, user_id, contact_email, contact_name, contact_phone, requester_company_name,
       source_strategic_request_id,
       current_plan, current_individual_tier,
       desired_plan, desired_individual_tier, desired_features, desired_addons,
       employee_count, user_count, site_count, supplier_count,
       monthly_volume, region_scope, industry,
       expected_start_date, expected_end_date,
       proposed_price_cents, proposed_term_months,
       is_self_service, requires_staff_approval,
       context, submitted_ip, submitted_user_agent,
       status_updated_at, status_updated_by
     ) VALUES (
       $1,$2,
       $3,$4,$5,$6,$7,$8,
       $9,
       $10,$11,
       $12,$13,$14::jsonb,$15::jsonb,
       $16,$17,$18,$19,
       $20,$21,$22,
       $23,$24,
       $25,$26,
       $27,$28,
       $29::jsonb,$30,$31,
       NOW(), $32
     )
     RETURNING *`,
    [
      input.request_type,
      initialStatus,
      input.org_id || null,
      input.user_id || null,
      contactEmail,
      input.contact_name || null,
      input.contact_phone || null,
      input.requester_company_name || null,
      input.source_strategic_request_id || null,
      input.current_plan || null,
      input.current_individual_tier || null,
      input.desired_plan || null,
      input.desired_individual_tier || null,
      JSON.stringify(input.desired_features || []),
      JSON.stringify(input.desired_addons || []),
      Number.isFinite(input.employee_count) ? input.employee_count : null,
      Number.isFinite(input.user_count) ? input.user_count : null,
      Number.isFinite(input.site_count) ? input.site_count : null,
      Number.isFinite(input.supplier_count) ? input.supplier_count : null,
      input.monthly_volume || null,
      input.region_scope || null,
      input.industry || null,
      input.expected_start_date || null,
      input.expected_end_date || null,
      Number.isFinite(input.proposed_price_cents) ? input.proposed_price_cents : null,
      Number.isFinite(input.proposed_term_months) ? input.proposed_term_months : null,
      isSelfService,
      isSelfService ? false : true,
      JSON.stringify(input.context || {}),
      input.submitted_ip || null,
      input.submitted_user_agent || null,
      input.user_id || null
    ]
  );
  const row = rows[0];

  // Audit: Initial-Status
  await insertHistory(pool, {
    request_id: row.id,
    from_status: null,
    to_status: row.status,
    changed_by: input.user_id || null,
    reason: input.reason || "create",
    details: { request_type: row.request_type, is_self_service: row.is_self_service }
  });

  return row;
}

/**
 * Statusuebergang mit Validierung + Audit.
 *
 * @param {import('pg').Pool} pool
 * @param {{ requestId:string, toStatus:string, actorUserId?:string|null, reason?:string|null, details?:Object }} input
 * @returns {Promise<{ ok:boolean, row?:Object, error?:string, allowed?:string[] }>}
 */
export async function transitionStatus(pool, { requestId, toStatus, actorUserId = null, reason = null, details = {} }) {
  return await withTransaction(pool, async (client) => {
    const cur = await client.query(
      "SELECT id, status, request_type FROM subscription_requests WHERE id = $1",
      [requestId]
    );
    const current = cur.rows[0];
    if (!current) return { ok: false, error: "REQUEST_NOT_FOUND" };

    if (current.status === toStatus) {
      return { ok: false, error: "NO_CHANGE", allowed: listAllowedNextStatuses(current.status, current.request_type) };
    }

    if (!isValidTransition(current.status, toStatus, current.request_type)) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: current.status,
        to: toStatus,
        allowed: listAllowedNextStatuses(current.status, current.request_type)
      };
    }

    const update = await client.query(
      `UPDATE subscription_requests
          SET status = $2,
              status_updated_at = NOW(),
              status_updated_by = $3,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [requestId, toStatus, actorUserId]
    );

    await insertHistory(client, {
      request_id: requestId,
      from_status: current.status,
      to_status: toStatus,
      changed_by: actorUserId,
      reason,
      details
    });

    let quote = null;
    let document = null;
    if (toStatus === STATUS.OFFERED) {
      quote = await freezeQuoteSnapshot(client, { requestId, actorUserId });
      if (!quote.ok) throwServiceError(quote.error || "QUOTE_SNAPSHOT_FAILED");
      document = await ensureDocumentForRequest(client, {
        documentType: "offer",
        subscriptionRequestId: requestId,
        actorUserId
      });
      if (!document.ok) throwServiceError(document.error || "DOCUMENT_GENERATION_FAILED");
    }

    return {
      ok: true,
      row: update.rows[0],
      quote_snapshot: quote?.snapshot || null,
      quote_already_frozen: quote?.already_frozen === true,
      document: document ? formatDocumentResult(document) : null
    };
  });
}

/**
 * Bequemlichkeits-Helfer fuer Approval. Setzt approved_*-Felder + transitions
 * in 'accepted' (sofern aktueller Status das erlaubt).
 */
export async function approve(pool, { requestId, actorUserId, reason = null, details = {} }) {
  return await withTransaction(pool, async (client) => {
    const cur = await client.query(
      "SELECT id, status, request_type FROM subscription_requests WHERE id = $1",
      [requestId]
    );
    const current = cur.rows[0];
    if (!current) return { ok: false, error: "REQUEST_NOT_FOUND" };
    if (!isValidTransition(current.status, STATUS.ACCEPTED, current.request_type)) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: current.status,
        to: STATUS.ACCEPTED,
        allowed: listAllowedNextStatuses(current.status, current.request_type)
      };
    }

    const update = await client.query(
      `UPDATE subscription_requests
          SET status = $2,
              approved_by = $3,
              approved_at = NOW(),
              status_updated_at = NOW(),
              status_updated_by = $3,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [requestId, STATUS.ACCEPTED, actorUserId]
    );

    const quote = await freezeQuoteSnapshot(client, { requestId, actorUserId });
    if (!quote.ok) throwServiceError(quote.error || "QUOTE_SNAPSHOT_FAILED");

    await insertHistory(client, {
      request_id: requestId,
      from_status: current.status,
      to_status: STATUS.ACCEPTED,
      changed_by: actorUserId,
      reason: reason || "approve",
      details: {
        ...(details || {}),
        approved: true,
        quote_snapshot_already_frozen: quote.already_frozen === true,
        quote_catalog_version: quote.snapshot?.catalog_version || null
      }
    });

    return {
      ok: true,
      row: update.rows[0],
      quote_snapshot: quote.snapshot,
      quote_already_frozen: quote.already_frozen === true
    };
  });
}

/**
 * Reject mit Pflicht-Begruendung. Validiert Transition und schreibt rejected_*-Felder.
 */
export async function reject(pool, { requestId, actorUserId, reason }) {
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) return { ok: false, error: "REASON_REQUIRED" };

  const cur = await pool.query(
    "SELECT id, status, request_type FROM subscription_requests WHERE id = $1",
    [requestId]
  );
  const current = cur.rows[0];
  if (!current) return { ok: false, error: "REQUEST_NOT_FOUND" };
  if (!isValidTransition(current.status, STATUS.REJECTED, current.request_type)) {
    return {
      ok: false,
      error: "INVALID_TRANSITION",
      from: current.status,
      to: STATUS.REJECTED,
      allowed: listAllowedNextStatuses(current.status, current.request_type)
    };
  }

  const update = await pool.query(
    `UPDATE subscription_requests
        SET status = $2,
            rejected_by = $3,
            rejected_at = NOW(),
            rejection_reason = $4,
            status_updated_at = NOW(),
            status_updated_by = $3,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [requestId, STATUS.REJECTED, actorUserId, trimmedReason]
  );

  await insertHistory(pool, {
    request_id: requestId,
    from_status: current.status,
    to_status: STATUS.REJECTED,
    changed_by: actorUserId,
    reason: trimmedReason,
    details: { rejected: true }
  });

  return { ok: true, row: update.rows[0] };
}

/**
 * Setzt eine Anfrage final auf 'active' (= die Aenderung wurde im Live-System
 * angewendet — z.B. subscriptions.plan wurde umgestellt). Aufrufer muss
 * sicherstellen, dass die Live-Aenderung vorher persistiert wurde.
 */
export async function activate(pool, { requestId, actorUserId, reason = null, details = {} }) {
  const cur = await pool.query(
    "SELECT id, status, request_type FROM subscription_requests WHERE id = $1",
    [requestId]
  );
  const current = cur.rows[0];
  if (!current) return { ok: false, error: "REQUEST_NOT_FOUND" };
  if (!isValidTransition(current.status, STATUS.ACTIVE, current.request_type)) {
    return {
      ok: false,
      error: "INVALID_TRANSITION",
      from: current.status,
      to: STATUS.ACTIVE,
      allowed: listAllowedNextStatuses(current.status, current.request_type)
    };
  }

  const update = await pool.query(
    `UPDATE subscription_requests
        SET status = $2,
            activated_at = NOW(),
            status_updated_at = NOW(),
            status_updated_by = $3,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [requestId, STATUS.ACTIVE, actorUserId]
  );

  await insertHistory(pool, {
    request_id: requestId,
    from_status: current.status,
    to_status: STATUS.ACTIVE,
    changed_by: actorUserId,
    reason: reason || "activate",
    details: { ...(details || {}), activated: true }
  });

  return { ok: true, row: update.rows[0] };
}

/**
 * Staff-Zuweisung. Setzt assigned_staff_id + assigned_at (idempotent fuer
 * gleichen Staff). Bei Reassignment bleibt die Historie aktuell.
 */
export async function assignStaff(pool, { requestId, staffUserId, actorUserId = null }) {
  if (!staffUserId) return { ok: false, error: "STAFF_USER_ID_REQUIRED" };
  const { rows } = await pool.query(
    `UPDATE subscription_requests
        SET assigned_staff_id = $2,
            assigned_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [requestId, staffUserId]
  );
  if (!rows[0]) return { ok: false, error: "REQUEST_NOT_FOUND" };

  await insertHistory(pool, {
    request_id: requestId,
    from_status: rows[0].status,
    to_status: rows[0].status,
    changed_by: actorUserId,
    reason: "assign_staff",
    details: { assigned_staff_id: staffUserId }
  });

  return { ok: true, row: rows[0] };
}

/* ── Listen / Queries ─────────────────────────────────────────── */

export async function getRequest(pool, requestId) {
  const { rows } = await pool.query(
    "SELECT * FROM subscription_requests WHERE id = $1",
    [requestId]
  );
  return rows[0] || null;
}

export async function listOpenForOrg(pool, orgId) {
  const openStatuses = Array.from(OPEN);
  const { rows } = await pool.query(
    `SELECT * FROM subscription_requests
      WHERE org_id = $1 AND status = ANY($2::text[])
      ORDER BY created_at DESC`,
    [orgId, openStatuses]
  );
  return rows;
}

export async function hasOpenRequest(pool, { orgId, userId, requestType }) {
  if (!orgId && !userId) return false;
  const openStatuses = Array.from(OPEN);
  const conds = ["status = ANY($1::text[])"];
  const params = [openStatuses];
  if (requestType) { params.push(requestType); conds.push(`request_type = $${params.length}`); }
  if (orgId)       { params.push(orgId);       conds.push(`org_id = $${params.length}`); }
  if (userId)      { params.push(userId);      conds.push(`user_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT 1 FROM subscription_requests WHERE ${conds.join(" AND ")} LIMIT 1`,
    params
  );
  return rows.length > 0;
}

export async function listHistory(pool, requestId) {
  const { rows } = await pool.query(
    `SELECT id, from_status, to_status, changed_by, reason, details, created_at
       FROM subscription_request_status_history
      WHERE request_id = $1
      ORDER BY created_at ASC`,
    [requestId]
  );
  return rows;
}

/* ── Internal Helpers ─────────────────────────────────────────── */

async function insertHistory(pool, { request_id, from_status, to_status, changed_by, reason, details }) {
  await pool.query(
    `INSERT INTO subscription_request_status_history
       (request_id, from_status, to_status, changed_by, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [request_id, from_status || null, to_status, changed_by || null, reason || null, JSON.stringify(details || {})]
  );
}

function throwServiceError(code, details = {}) {
  const err = new Error(code || "SUBSCRIPTION_REQUEST_SERVICE_ERROR");
  err.code = code || "SUBSCRIPTION_REQUEST_SERVICE_ERROR";
  err.details = details;
  throw err;
}

function activationDocumentType(req) {
  switch (req?.request_type) {
    case REQUEST_TYPES.CANCELLATION:
      return "cancellation_confirmation";
    case REQUEST_TYPES.UPGRADE:
    case REQUEST_TYPES.DOWNGRADE:
      return "change_confirmation";
    case REQUEST_TYPES.NEW_INDIVIDUAL:
    case REQUEST_TYPES.PILOT:
      return "order_confirmation";
    default:
      return "order_confirmation";
  }
}

function formatDocumentResult(result) {
  if (!result?.row) return null;
  return {
    id: result.row.id,
    document_type: result.row.document_type,
    document_number: result.row.document_number,
    status: result.row.status,
    title: result.row.title || null,
    issued_at: result.row.issued_at || null,
    download_available: true,
    created: result.created === true,
    already_exists: result.already_exists === true
  };
}

/* ── Impact-Preview fuer Downgrade ────────────────────────────
 * Liefert eine kompakte Auflistung dessen, was der Kunde durch den Wechsel
 * verliert. Wird sowohl im Customer-UI angezeigt als auch im Datensatz
 * (`downgrade_impact_snapshot`) persistiert, damit Staff exakt nachvollzieht,
 * was zum Anfragezeitpunkt sichtbar war.
 * ─────────────────────────────────────────────────────────────── */
export async function previewDowngradeImpact(pool, { orgId, currentPlan, desiredPlan }) {
  const cur = normalizePlan(currentPlan);
  const tgt = normalizePlan(desiredPlan);
  const tgtLimits = PLAN_LIMITS[tgt] || PLAN_LIMITS.DEMO;

  const result = {
    current_plan: cur,
    desired_plan: tgt,
    users_count: 0,
    users_limit_after: null,
    sites_count: 0,
    sites_limit_after: null,
    listings_count: 0,
    listings_limit_after: limitNumber(tgtLimits.listings),
    suppliers_count: 0,
    suppliers_limit_after: null,
    multi_org_slots_count: 0,
    multi_org_slots_limit_after: null,
    features_lost: [],
    blocking_processes: [],
    hard_blocking_processes: [],
    blocked: false
  };

  if (!orgId) return result;
  const usage = await getUsageAgainstLimits(pool, orgId, { effectivePlan: tgt });
  applyImpactMetric(result, "users", usage.users, { hard: true });
  applyImpactMetric(result, "sites", usage.sites);
  applyImpactMetric(result, "listings", usage.listings);
  applyImpactMetric(result, "suppliers", usage.suppliers);
  applyImpactMetric(result, "multi_org_slots", usage.multi_org_slots);

  // Feature-Diff: alles was der aktuelle Plan kann, der Zielplan aber nicht
  for (const [featureKey, allowedPlans] of Object.entries(planFeatures)) {
    const inCur = Array.isArray(allowedPlans) && allowedPlans.includes(cur);
    const inTgt = Array.isArray(allowedPlans) && allowedPlans.includes(tgt);
    if (inCur && !inTgt) result.features_lost.push(featureKey);
  }
  result.hard_blocked = result.hard_blocking_processes.length > 0;
  result.blocked = result.blocking_processes.length > 0 || result.hard_blocked;
  return result;
}

/* ── Effektivitaet setzen (Wirksamkeitsdatum) ────────────────── */
export async function setEffectivity(pool, {
  requestId, actorUserId = null, effectiveFrom = null,
  billingEffectiveFrom = null, effectiveUntil = null,
  cancellationEffectiveAt = null, reason = null
}) {
  const fields = [];
  const params = [];
  function add(col, val) { params.push(val); fields.push(`${col} = $${params.length}`); }
  if (effectiveFrom !== undefined) add("effective_from", effectiveFrom);
  if (billingEffectiveFrom !== undefined) add("billing_effective_from", billingEffectiveFrom);
  if (effectiveUntil !== undefined) add("effective_until", effectiveUntil);
  if (cancellationEffectiveAt !== undefined) add("cancellation_effective_at", cancellationEffectiveAt);
  if (!fields.length) return { ok: false, error: "NO_FIELDS" };
  fields.push("updated_at = NOW()");
  params.push(requestId);
  const idIdx = params.length;
  const { rows } = await pool.query(
    `UPDATE subscription_requests SET ${fields.join(", ")} WHERE id = $${idIdx} RETURNING *`,
    params
  );
  if (!rows[0]) return { ok: false, error: "REQUEST_NOT_FOUND" };
  await insertHistory(pool, {
    request_id: requestId,
    from_status: rows[0].status,
    to_status: rows[0].status,
    changed_by: actorUserId,
    reason: reason || "set_effectivity",
    details: {
      effective_from: effectiveFrom || null,
      billing_effective_from: billingEffectiveFrom || null,
      effective_until: effectiveUntil || null,
      cancellation_effective_at: cancellationEffectiveAt || null
    }
  });
  return { ok: true, row: rows[0] };
}

/* ── Atomare Aktivierung: schreibt Live-Plan + transitioniert auf active ──
 * Nur fuer Status `accepted` aufrufen. Schreibt:
 *   - organizations.plan (org-effektiv)
 *   - subscriptions: aktualisiert Plan/Status fuer Owner-User
 *   - subscription_requests.activated_at + status='active'
 * Nutzt withTransaction, falls vom Aufrufer ein Client uebergeben wird,
 * wird der durchgereicht (siehe utils/transaction.js Welle 7-Hotfix).
 * ─────────────────────────────────────────────────────────────── */
export async function applyApprovedChange(pool, { requestId, actorUserId, reason = null, verifiedPayment = false }) {
  return await withTransaction(pool, async (client) => {
    const cur = await client.query(
      `SELECT id, status, request_type, org_id, user_id,
              desired_plan, desired_individual_tier, desired_addons, desired_features,
              current_plan, employee_count,
              cancellation_effective_at, effective_from,
              quote_snapshot, quote_frozen_at, quote_catalog_version
         FROM subscription_requests WHERE id = $1`,
      [requestId]
    );
    const req = cur.rows[0];
    if (!req) return { ok: false, error: "REQUEST_NOT_FOUND" };
    if (req.status !== STATUS.ACCEPTED) {
      return { ok: false, error: "NOT_ACCEPTED", current_status: req.status };
    }

    // Invariante "Aktivierung NUR nach verifizierter Zahlung, NIE aus dem Staff Center":
    // Eine Self-Service-NEW_INDIVIDUAL-Anfrage mit OFFENER (nicht abgeschlossener)
    // Stripe-Payment-Session darf NUR der Webhook aktivieren (verifiedPayment=true,
    // gesetzt NACH dem Betrags-/Waehrungs-Tamper-Check). Staff /activate und der
    // Auto-Activate-Cron (ohne Flag) werden geblockt. Inquiry-Anfragen erzeugen KEINE
    // Stripe-Session, Upgrade/Downgrade/Cancellation sind kein NEW_INDIVIDUAL → alle
    // unberuehrt (kein zusaetzlicher Query). Korrelation via payment_sessions.request_id (Mig 130).
    if (!verifiedPayment && req.request_type === REQUEST_TYPES.NEW_INDIVIDUAL) {
      const openPay = await client.query(
        `SELECT 1 FROM payment_sessions
          WHERE request_id = $1 AND method = 'stripe' AND status <> 'completed'
          LIMIT 1`,
        [requestId]
      );
      if (openPay.rows.length > 0) {
        return { ok: false, error: "PAYMENT_NOT_VERIFIED" };
      }
    }

    const targetPlan = normalizePlan(
      req.request_type === REQUEST_TYPES.CANCELLATION
        ? req.current_plan || req.desired_plan
        : req.desired_plan || req.current_plan
    );

    const quote = await freezeQuoteSnapshot(client, { requestId, actorUserId });
    if (!quote.ok) throwServiceError(quote.error || "QUOTE_SNAPSHOT_FAILED");

    // 1. organizations: org-effektiver Plan + entitlement-relevante Felder.
    if (req.org_id) {
      const orgUpdate = await client.query(
        `UPDATE organizations
            SET plan = $2,
                individual_tier_auto = CASE WHEN $2 = 'INDIVIDUELL' THEN COALESCE($3, individual_tier_auto) ELSE NULL END,
                employee_count_approx = COALESCE($4, employee_count_approx),
                feature_bundle = CASE WHEN $2 = 'INDIVIDUELL' THEN 'enterprise_full' ELSE 'standard' END,
                billing_mode = CASE WHEN $2 = 'INDIVIDUELL' THEN 'individual_contract' ELSE 'standard_catalog' END,
                individual_contract_price_cents = CASE WHEN $2 = 'INDIVIDUELL' THEN COALESCE($5, individual_contract_price_cents) ELSE NULL END,
                custom_quote_pending = FALSE,
                updated_at = NOW()
          WHERE id = $1`,
        [
          req.org_id,
          targetPlan,
          req.desired_individual_tier || quote.snapshot?.individual_tier || null,
          Number.isFinite(req.employee_count) ? req.employee_count : null,
          Number.isFinite(quote.snapshot?.proposed_price_cents) ? quote.snapshot.proposed_price_cents : null
        ]
      );
      if (orgUpdate.rowCount === 0) throwServiceError("ORG_NOT_FOUND");
      if (req.request_type !== REQUEST_TYPES.CANCELLATION) {
        await syncOrgActiveAddons(client, {
          orgId: req.org_id,
          requestId: req.id,
          desiredAddons: req.desired_addons,
          actorUserId,
          source: "subscription_request"
        });
      }
    }

    // 2. subscriptions des Owner-Users aktualisieren.
    if (req.user_id) {
      let subUpdate;
      if (req.request_type === REQUEST_TYPES.CANCELLATION) {
        const cancelAt = req.cancellation_effective_at || new Date().toISOString();
        subUpdate = await client.query(
          `UPDATE subscriptions
              SET status = 'canceling',
                  cancel_at = $2,
                  cancel_requested_at = NOW(),
                  cancel_requested_by = $3,
                  updated_at = NOW()
            WHERE user_id = $1
              AND id = (SELECT id FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)`,
          [req.user_id, cancelAt, actorUserId]
        );
      } else {
        subUpdate = await client.query(
          `UPDATE subscriptions
              SET plan = $2,
                  status = 'active',
                  updated_at = NOW()
            WHERE user_id = $1
              AND id = (SELECT id FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)`,
          [req.user_id, targetPlan]
        );
      }
      if (subUpdate.rowCount === 0) throwServiceError("SUBSCRIPTION_NOT_FOUND");
    }

    // 3. subscription_requests: status=active + activated_at.
    const upd = await client.query(
      `UPDATE subscription_requests
          SET status = 'active',
              activated_at = NOW(),
              effective_from = COALESCE(effective_from, NOW()),
              status_updated_at = NOW(),
              status_updated_by = $2,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [requestId, actorUserId]
    );
    if (!upd.rows[0]) throwServiceError("REQUEST_UPDATE_FAILED");

    const documentType = activationDocumentType(req, targetPlan);
    let document = null;
    if (documentType) {
      document = await ensureDocumentForRequest(client, {
        documentType,
        subscriptionRequestId: requestId,
        actorUserId
      });
      if (!document.ok) throwServiceError(document.error || "DOCUMENT_GENERATION_FAILED");
    }

    const historyDetails = {
      applied: true,
      target_plan: targetPlan,
      request_type: req.request_type,
      cancellation_effective_at: req.cancellation_effective_at || null,
      quote_snapshot_already_frozen: quote.already_frozen === true,
      quote_catalog_version: quote.snapshot?.catalog_version || null,
      document_type: documentType || null,
      document_id: document?.row?.id || null,
      document_number: document?.row?.document_number || null,
      document_created: document?.created === true,
      document_already_exists: document?.already_exists === true,
      active_addons_synced: req.org_id && req.request_type !== REQUEST_TYPES.CANCELLATION,
      active_addons_count: req.request_type !== REQUEST_TYPES.CANCELLATION
        ? normalizeAddonList(req.desired_addons).length
        : null
    };

    await insertHistory(client, {
      request_id: requestId,
      from_status: STATUS.ACCEPTED,
      to_status: STATUS.ACTIVE,
      changed_by: actorUserId,
      reason: reason || "apply_approved_change",
      details: historyDetails
    });

    await auditLog.writeAudit(client, {
      action: "subscription_request.apply_approved_change",
      entity_type: "subscription_request",
      entity_id: requestId,
      actor_id: actorUserId || null,
      org_id: req.org_id || null,
      details: historyDetails
    });

    return {
      ok: true,
      row: upd.rows[0],
      target_plan: targetPlan,
      quote_snapshot: quote.snapshot,
      quote_already_frozen: quote.already_frozen === true,
      document: document ? formatDocumentResult(document) : null
    };
  });
}

/* ── Hilfen ─────────────────────────────────────────────────── */
function normalizePlan(plan) {
  return normalizePlanKey(plan, { fallback: "DEMO" });
}
function limitNumber(v) {
  if (v === -1) return -1;
  return Number.isFinite(v) ? Number(v) : null;
}

function applyImpactMetric(result, key, metric, opts = {}) {
  const current = Number(metric?.current || 0);
  const limit = metric?.limit ?? null;
  result[`${key}_count`] = current;
  result[`${key}_limit_after`] = limit;
  if (limit === -1 || limit == null) return;
  if (current <= Number(limit)) return;
  const entry = {
    kind: `${key}_over_limit`,
    current,
    limit_after: Number(limit)
  };
  if (opts.hard) result.hard_blocking_processes.push(entry);
  else result.blocking_processes.push(entry);
}

async function syncOrgActiveAddons(client, { orgId, requestId, desiredAddons, actorUserId, source }) {
  const addons = normalizeAddonList(desiredAddons);
  const addonKeys = addons.map((a) => a.key);

  await client.query(
    `UPDATE org_active_addons
        SET status = 'inactive',
            deactivated_by = $2,
            deactivated_at = NOW(),
            updated_at = NOW()
      WHERE org_id = $1
        AND status = 'active'
        AND NOT (addon_key = ANY($3::text[]))`,
    [orgId, actorUserId || null, addonKeys]
  );

  for (const addon of addons) {
    await client.query(
      `INSERT INTO org_active_addons (
         org_id, addon_key, addon_name, status, price_cents, interval,
         source, source_request_id, activated_by, activated_at, metadata,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, 'active', $4, $5,
         $6, $7, $8, NOW(), $9::jsonb,
         NOW(), NOW()
       )
       ON CONFLICT (org_id, addon_key) DO UPDATE
          SET addon_name = EXCLUDED.addon_name,
              status = 'active',
              price_cents = EXCLUDED.price_cents,
              interval = EXCLUDED.interval,
              source = EXCLUDED.source,
              source_request_id = EXCLUDED.source_request_id,
              activated_by = EXCLUDED.activated_by,
              activated_at = NOW(),
              deactivated_by = NULL,
              deactivated_at = NULL,
              expires_at = NULL,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()`,
      [
        orgId,
        addon.key,
        addon.name,
        addon.price_cents,
        addon.interval,
        source,
        requestId,
        actorUserId || null,
        JSON.stringify(addon.metadata || {})
      ]
    );
  }
}

function normalizeAddonList(addons) {
  const parsed = parseJsonArray(addons);
  const seen = new Set();
  const out = [];
  for (const raw of parsed) {
    const key = String(raw?.key || raw?.addon_key || raw?.id || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const meta = ADDON_CATALOG.find((a) => a.key === key) || null;
    out.push({
      key,
      name: String(raw?.name || raw?.addon_name || meta?.name || key),
      price_cents: Number.isFinite(raw?.price_cents) ? raw.price_cents : (meta?.price_cents ?? null),
      interval: raw?.interval || meta?.interval || null,
      metadata: {
        source_payload: raw || null
      }
    });
  }
  return out;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
