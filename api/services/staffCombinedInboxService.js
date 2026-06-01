/**
 * staffCombinedInboxService.js - Commercial Operations Inbox (Welle 8 Schritt 14).
 *
 * Vereint zwei Quellen in einer kommerziellen Sicht, OHNE Daten zu vermischen:
 *   - `strategic_collaboration_requests` (request_type = 'enterprise_config'
 *     fuer Public-Konfigurator-Submissions; daneben gibt es Trust-Gate-Inquiries
 *     mit anderem `source_context`)
 *   - `subscription_requests` (new_individual / pilot / upgrade / downgrade /
 *     cancellation)
 *
 * Jedes Item traegt ein eindeutiges `source_type`-Feld:
 *   - 'enterprise_request'        (strategic_collaboration_requests)
 *   - 'subscription_upgrade'
 *   - 'subscription_downgrade'
 *   - 'subscription_cancellation'
 *   - 'subscription_pilot'
 *   - 'subscription_new_individual'
 *
 * Plus eine fachlich konsolidierte `priority`-Heuristik (low/normal/high)
 * und ein normalisierter `summary_status` (open/needs_action/closed).
 *
 * Bulk-Aktionen (Welle 8 Schritt 14) ueber `runBulkAction`:
 *   - 'assign'             {assignee_id}
 *   - 'reject_with_reason' {reason}
 *   - 'to_under_review'    (status: under_review fuer subscription_requests,
 *                           rueckfrage_offen fuer strategic_collaboration_requests)
 *
 * KEINE bulk-aktivierung von Vertraegen \u2014 Aktivierungen brauchen
 * Einzelpruefung ueber den existierenden /activate-Endpoint.
 *
 * Auditierung passiert im Aufrufer (Router) per `writeStaffAudit`.
 */

import * as customerRequests from "./staffCustomerRequestsService.js";
import * as subreq from "./subscriptionRequestService.js";

/* ── Source-Type-Mapping ─────────────────────────────────────── */

export const SOURCE_TYPES = Object.freeze({
  ENTERPRISE_REQUEST:          "enterprise_request",
  SUBSCRIPTION_UPGRADE:        "subscription_upgrade",
  SUBSCRIPTION_DOWNGRADE:      "subscription_downgrade",
  SUBSCRIPTION_CANCELLATION:   "subscription_cancellation",
  SUBSCRIPTION_PILOT:          "subscription_pilot",
  SUBSCRIPTION_NEW_INDIVIDUAL: "subscription_new_individual"
});

const SUB_REQUEST_TO_SOURCE = {
  upgrade:        SOURCE_TYPES.SUBSCRIPTION_UPGRADE,
  downgrade:      SOURCE_TYPES.SUBSCRIPTION_DOWNGRADE,
  cancellation:   SOURCE_TYPES.SUBSCRIPTION_CANCELLATION,
  pilot:          SOURCE_TYPES.SUBSCRIPTION_PILOT,
  new_individual: SOURCE_TYPES.SUBSCRIPTION_NEW_INDIVIDUAL
};

/* ── Priority + Status-Heuristik ─────────────────────────────── */

function deriveCustomerRequestSummaryStatus(s) {
  if (s === "abgeschlossen" || s === "abgelehnt" || s === "aktiviert") return "closed";
  if (s === "rueckfrage_offen") return "needs_action";
  return "open";
}

function deriveSubscriptionSummaryStatus(s) {
  if (s === "active" || s === "rejected" || s === "cancelled" || s === "expired") return "closed";
  if (s === "needs_clarification" || s === "offered" || s === "accepted") return "needs_action";
  return "open";
}

/**
 * Heuristische Prioritaet. Konservativ: cancellation und INDIVIDUELL-Wunsch
 * werden hoch priorisiert (Kuendigung = Umsatz-Risiko, INDIVIDUELL = manueller
 * Vertrag). Aelter als 5 Tage offen erhoeht Prio um eine Stufe.
 */
function derivePriority({ requestType, desiredPlan, ageDays, summaryStatus }) {
  let prio = "normal";
  if (requestType === "cancellation") prio = "high";
  if (desiredPlan === "INDIVIDUELL" && summaryStatus === "open") prio = "high";
  if (summaryStatus === "open" && ageDays != null && ageDays >= 5 && prio === "normal") prio = "high";
  if (summaryStatus === "closed") prio = "low";
  return prio;
}

function ageInDays(createdAt) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

/* ── Combined Listing ─────────────────────────────────────────── */

/**
 * Vereint beide Quellen in einer Antwort. Keine Daten-Vermischung \u2014 jedes
 * Item behaelt seine originale Struktur unter `payload`, plus die
 * Cross-Cutting-Felder fuer Listendarstellung.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   sourceType?: string,            // Filter auf Source
 *   summaryStatus?: 'open'|'needs_action'|'closed',
 *   plan?: string,                  // Filter auf Plan (DEMO/BASIS/PLUS/PRO/INDIVIDUELL)
 *   email?: string,                 // contact-Email Filter
 *   assignedToStaffId?: string,     // Nur Items mit diesem Assignee
 *   limit?: number, offset?: number
 * }} opts
 * @returns {Promise<{items: Array, totals: {total: number, by_source: object}}>}
 */
export async function listCombinedInbox(pool, opts = {}) {
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);

  // 1) strategic_collaboration_requests
  let scrItems = [];
  if (!opts.sourceType || opts.sourceType === SOURCE_TYPES.ENTERPRISE_REQUEST) {
    const conds = [];
    const params = [];
    if (opts.email) {
      params.push(String(opts.email).trim().toLowerCase());
      conds.push(`LOWER(s.contact_email) = $${params.length}`);
    }
    if (opts.plan) {
      params.push(String(opts.plan));
      conds.push(`s.plan_requested = $${params.length}`);
    }
    if (opts.requestType) {
      params.push(String(opts.requestType));
      conds.push(`s.request_type = $${params.length}`);
    }
    if (opts.assignedToStaffId) {
      params.push(String(opts.assignedToStaffId));
      conds.push(`EXISTS (SELECT 1 FROM staff_customer_request_assignments a
                          WHERE a.request_id = s.id AND a.staff_id = $${params.length} AND a.released_at IS NULL)`);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT s.id, s.status, s.created_at, s.updated_at,
              s.contact_email, s.contact_name, s.requester_company_name,
              s.plan_requested, s.request_type, s.source_context,
              COALESCE(s.requester_org_id, s.target_org_id) AS org_id,
              s.monthly_estimate_cents, s.onetime_estimate_cents,
              s.seats_requested, s.seats_included,
              (SELECT a.staff_id FROM staff_customer_request_assignments a
               WHERE a.request_id = s.id AND a.released_at IS NULL
               ORDER BY a.assigned_at DESC LIMIT 1) AS assigned_staff_id
         FROM strategic_collaboration_requests s
         ${where}
         ORDER BY COALESCE(s.updated_at, s.created_at) DESC
         LIMIT 200`,
      params
    );
    scrItems = rows.map((r) => {
      const summaryStatus = deriveCustomerRequestSummaryStatus(r.status);
      return {
        id: r.id,
        source_type: SOURCE_TYPES.ENTERPRISE_REQUEST,
        original_status: r.status,
        summary_status: summaryStatus,
        priority: derivePriority({
          requestType: r.request_type,
          desiredPlan: r.plan_requested,
          ageDays: ageInDays(r.created_at),
          summaryStatus
        }),
        plan: r.plan_requested || null,
        contact_email: r.contact_email,
        contact_name: r.contact_name,
        requester_company_name: r.requester_company_name,
        org_id: r.org_id,
        request_type: r.request_type,
        source_context: r.source_context,
        monthly_estimate_cents: r.monthly_estimate_cents,
        onetime_estimate_cents: r.onetime_estimate_cents,
        seats_requested: r.seats_requested,
        seats_included: r.seats_included,
        assigned_staff_id: r.assigned_staff_id || null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        // Detail-Drilldown-URL fuer das Frontend
        detail_path: `/customer-requests/${r.id}`
      };
    });
  }

  // 2) subscription_requests
  let subItems = [];
  if (!opts.sourceType || opts.sourceType.startsWith("subscription_")) {
    const conds = [];
    const params = [];
    if (opts.sourceType && opts.sourceType.startsWith("subscription_")) {
      const reqType = Object.entries(SUB_REQUEST_TO_SOURCE)
        .find(([, v]) => v === opts.sourceType)?.[0];
      if (reqType) {
        params.push(reqType);
        conds.push(`sr.request_type = $${params.length}`);
      }
    }
    if (opts.assignedToStaffId) {
      params.push(String(opts.assignedToStaffId));
      conds.push(`sr.assigned_staff_id = $${params.length}`);
    }
    if (opts.email) {
      params.push(String(opts.email).trim().toLowerCase());
      conds.push(`LOWER(sr.contact_email) = $${params.length}`);
    }
    if (opts.plan) {
      params.push(String(opts.plan));
      conds.push(`(sr.desired_plan = $${params.length} OR sr.current_plan = $${params.length})`);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT sr.id, sr.status, sr.created_at, sr.updated_at, sr.status_updated_at,
              sr.request_type,
              sr.contact_email, sr.contact_name,
              sr.requester_company_name,
              sr.org_id,
              sr.current_plan, sr.desired_plan,
              sr.proposed_price_cents, sr.proposed_term_months,
              sr.assigned_staff_id,
              org.name AS org_name
         FROM subscription_requests sr
         LEFT JOIN organizations org ON org.id = sr.org_id
         ${where}
         ORDER BY COALESCE(sr.status_updated_at, sr.updated_at, sr.created_at) DESC
         LIMIT 200`,
      params
    );
    subItems = rows.map((r) => {
      const summaryStatus = deriveSubscriptionSummaryStatus(r.status);
      return {
        id: r.id,
        source_type: SUB_REQUEST_TO_SOURCE[r.request_type] || "subscription_other",
        original_status: r.status,
        summary_status: summaryStatus,
        priority: derivePriority({
          requestType: r.request_type,
          desiredPlan: r.desired_plan,
          ageDays: ageInDays(r.created_at),
          summaryStatus
        }),
        plan: r.desired_plan || r.current_plan || null,
        current_plan: r.current_plan,
        desired_plan: r.desired_plan,
        contact_email: r.contact_email,
        contact_name: r.contact_name,
        requester_company_name: r.requester_company_name || r.org_name,
        org_id: r.org_id,
        request_type: r.request_type,
        proposed_price_cents: r.proposed_price_cents,
        proposed_term_months: r.proposed_term_months,
        assigned_staff_id: r.assigned_staff_id,
        created_at: r.created_at,
        updated_at: r.updated_at || r.status_updated_at,
        detail_path: `/subscription-requests/${r.id}`
      };
    });
  }

  // 3) Filter auf summary_status (nach Mapping)
  let combined = scrItems.concat(subItems);
  if (opts.summaryStatus) {
    combined = combined.filter((i) => i.summary_status === opts.summaryStatus);
  }

  // 4) Sortierung: priority high zuerst, dann updated_at desc
  const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
  combined.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    return tb - ta;
  });

  const totals = { total: combined.length, by_source: {} };
  for (const i of combined) {
    totals.by_source[i.source_type] = (totals.by_source[i.source_type] || 0) + 1;
  }

  const items = combined.slice(offset, offset + limit);
  return { items, totals };
}

/* ── Bulk-Aktionen ───────────────────────────────────────────── */

const BULK_OP = Object.freeze({
  ASSIGN: "assign",
  REJECT_WITH_REASON: "reject_with_reason",
  TO_UNDER_REVIEW: "to_under_review"
});
export { BULK_OP };

/**
 * Fuehrt eine Bulk-Aktion auf einer Liste von {source_type, id}-Items aus.
 * Jede Aktion wird einzeln gewertet \u2014 Teilfehler werden im Result aggregiert.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   actorUserId: string,
 *   reason: string,
 *   operation: string,
 *   items: Array<{source_type: string, id: string}>,
 *   assigneeId?: string
 * }} args
 * @returns {Promise<{ok:boolean, processed:number, success:Array, failed:Array}>}
 */
export async function runBulkAction(pool, args) {
  const { actorUserId, reason, operation, items = [], assigneeId } = args || {};
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "EMPTY_ITEMS", processed: 0, success: [], failed: [] };
  }
  if (items.length > 100) {
    return { ok: false, error: "BULK_LIMIT_EXCEEDED", processed: 0, success: [], failed: [] };
  }
  if (!Object.values(BULK_OP).includes(operation)) {
    return { ok: false, error: "UNSUPPORTED_OPERATION", processed: 0, success: [], failed: [] };
  }
  const reasonText = String(reason || "").trim();
  if (reasonText.length < 10) {
    return { ok: false, error: "REASON_TOO_SHORT", processed: 0, success: [], failed: [] };
  }

  const success = [];
  const failed = [];

  for (const it of items) {
    try {
      const r = await applyBulk(pool, { item: it, actorUserId, operation, reason: reasonText, assigneeId });
      if (r.ok) success.push({ id: it.id, source_type: it.source_type, ...r });
      else failed.push({ id: it.id, source_type: it.source_type, error: r.error || "UNKNOWN" });
    } catch (err) {
      failed.push({ id: it.id, source_type: it.source_type, error: err && err.code ? err.code : "EXCEPTION" });
    }
  }

  return { ok: failed.length === 0, processed: items.length, success, failed };
}

async function applyBulk(pool, { item, actorUserId, operation, reason, assigneeId }) {
  if (!item || !item.id || !item.source_type) return { ok: false, error: "INVALID_ITEM" };
  const isSub = item.source_type.startsWith("subscription_");
  const isCustomerReq = item.source_type === SOURCE_TYPES.ENTERPRISE_REQUEST;
  if (!isSub && !isCustomerReq) return { ok: false, error: "UNSUPPORTED_SOURCE_TYPE" };

  if (operation === BULK_OP.ASSIGN) {
    if (!assigneeId) return { ok: false, error: "MISSING_ASSIGNEE" };
    if (isSub) {
      const r = await subreq.assignStaff(pool, { requestId: item.id, staffUserId: assigneeId, actorUserId });
      return r.ok ? { ok: true, action: "assign" } : { ok: false, error: r.error || "ASSIGN_FAILED" };
    }
    const r = await customerRequests.assign(pool, { requestId: item.id, staffId: actorUserId, assigneeId });
    return r.error ? { ok: false, error: r.error } : { ok: true, action: "assign" };
  }

  if (operation === BULK_OP.REJECT_WITH_REASON) {
    if (isSub) {
      const r = await subreq.reject(pool, { requestId: item.id, actorUserId, reason });
      return r.ok ? { ok: true, action: "rejected" } : { ok: false, error: r.error || "REJECT_FAILED" };
    }
    const r = await customerRequests.transitionStatus(pool, {
      requestId: item.id, staffId: actorUserId, nextStatus: "abgelehnt", reason
    });
    return r.error ? { ok: false, error: r.error } : { ok: true, action: "rejected" };
  }

  if (operation === BULK_OP.TO_UNDER_REVIEW) {
    if (isSub) {
      const r = await subreq.transitionStatus(pool, {
        requestId: item.id, toStatus: "under_review", actorUserId, reason
      });
      return r.ok ? { ok: true, action: "to_under_review" } : { ok: false, error: r.error || "TRANSITION_FAILED" };
    }
    const r = await customerRequests.transitionStatus(pool, {
      requestId: item.id, staffId: actorUserId, nextStatus: "rueckfrage_offen", reason
    });
    return r.error ? { ok: false, error: r.error } : { ok: true, action: "to_under_review" };
  }

  return { ok: false, error: "UNSUPPORTED_OPERATION" };
}

/* ── SCC WAVE 05: Item Detail ────────────────────────────────── */

/**
 * Laedt vollstaendige Detail-Daten fuer ein einzelnes Inbox-Item.
 * Probiert zuerst `strategic_collaboration_requests`, dann `subscription_requests`.
 *
 * @param {import('pg').Pool} pool
 * @param {string} id
 * @returns {Promise<object|null>} Detail oder null wenn nicht gefunden
 */
export async function getInboxItemDetail(pool, id) {
  // ── Enterprise Request (strategic_collaboration_requests) ───
  const { rows: scrRows } = await pool.query(
    `SELECT s.*,
            o.name AS org_name, o.type AS org_type, o.email AS org_contact_email,
            (SELECT a.staff_id FROM staff_customer_request_assignments a
             WHERE a.request_id = s.id AND a.released_at IS NULL
             ORDER BY a.assigned_at DESC LIMIT 1) AS assigned_staff_id
       FROM strategic_collaboration_requests s
       LEFT JOIN organizations o ON o.id = COALESCE(s.requester_org_id, s.target_org_id)
       WHERE s.id = $1`,
    [id]
  );

  if (scrRows[0]) {
    const r = scrRows[0];
    const ageDays = ageInDays(r.created_at);
    const summaryStatus = deriveCustomerRequestSummaryStatus(r.status);

    // Thread-Nachrichten
    const { rows: messages } = await pool.query(
      `SELECT m.id, m.author_staff_id, m.is_internal, m.body, m.created_at,
              ts.email AS author_email, ts.display_name AS author_name
         FROM staff_customer_request_messages m
         LEFT JOIN tempconnect_staff ts ON ts.user_id = m.author_staff_id
         WHERE m.request_id = $1
         ORDER BY m.created_at ASC`,
      [id]
    );

    // Assignee-Details
    let assignee = null;
    if (r.assigned_staff_id) {
      const { rows: ar } = await pool.query(
        `SELECT user_id, email, display_name FROM tempconnect_staff WHERE user_id = $1`,
        [r.assigned_staff_id]
      );
      if (ar[0]) assignee = { staff_id: ar[0].user_id, email: ar[0].email, display_name: ar[0].display_name };
    }

    return {
      id: r.id,
      source_type: SOURCE_TYPES.ENTERPRISE_REQUEST,
      original_status: r.status,
      summary_status: summaryStatus,
      priority: derivePriority({ requestType: r.request_type, desiredPlan: r.plan_requested, ageDays, summaryStatus }),
      contact_email: r.contact_email,
      contact_name: r.contact_name,
      requester_company_name: r.requester_company_name,
      org_id: r.org_id || r.requester_org_id || r.target_org_id,
      org_name: r.org_name,
      org_type: r.org_type,
      org_contact_email: r.org_contact_email,
      request_type: r.request_type,
      source_context: r.source_context,
      plan: r.plan_requested,
      monthly_estimate_cents: r.monthly_estimate_cents,
      onetime_estimate_cents: r.onetime_estimate_cents,
      seats_requested: r.seats_requested,
      seats_included: r.seats_included,
      notes: r.notes || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      age_days: ageDays,
      assignee,
      messages,
      message_count: messages.length,
    };
  }

  // ── Subscription Request ─────────────────────────────────────
  const { rows: subRows } = await pool.query(
    `SELECT sr.*,
            o.name AS org_name, o.type AS org_type, o.email AS org_contact_email,
            ts.email AS assignee_email, ts.display_name AS assignee_display_name
       FROM subscription_requests sr
       LEFT JOIN organizations o ON o.id = sr.org_id
       LEFT JOIN tempconnect_staff ts ON ts.user_id = sr.assigned_staff_id
       WHERE sr.id = $1`,
    [id]
  );

  if (subRows[0]) {
    const r = subRows[0];
    const ageDays = ageInDays(r.created_at);
    const summaryStatus = deriveSubscriptionSummaryStatus(r.status);

    const assignee = r.assigned_staff_id
      ? { staff_id: r.assigned_staff_id, email: r.assignee_email, display_name: r.assignee_display_name }
      : null;

    return {
      id: r.id,
      source_type: SUB_REQUEST_TO_SOURCE[r.request_type] || "subscription_other",
      original_status: r.status,
      summary_status: summaryStatus,
      priority: derivePriority({ requestType: r.request_type, desiredPlan: r.desired_plan, ageDays, summaryStatus }),
      contact_email: r.contact_email,
      contact_name: r.contact_name,
      requester_company_name: r.requester_company_name || r.org_name,
      org_id: r.org_id,
      org_name: r.org_name,
      org_type: r.org_type,
      org_contact_email: r.org_contact_email,
      request_type: r.request_type,
      plan: r.desired_plan || r.current_plan,
      current_plan: r.current_plan,
      desired_plan: r.desired_plan,
      proposed_price_cents: r.proposed_price_cents,
      proposed_term_months: r.proposed_term_months,
      notes: r.notes || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      age_days: ageDays,
      assignee,
      messages: [],
      message_count: 0,
    };
  }

  return null;
}

/* ── SCC WAVE 05: Active Staff Members ──────────────────────── */

/**
 * Liefert alle aktiven Staff-Mitglieder fuer die Assignee-Auswahl.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<Array<{user_id,email,display_name,role}>>}
 */
export async function getActiveStaffMembers(pool) {
  const { rows } = await pool.query(
    `SELECT user_id, email, display_name, role
       FROM tempconnect_staff
       WHERE is_active = TRUE
       ORDER BY COALESCE(display_name, email)`
  );
  return rows;
}
