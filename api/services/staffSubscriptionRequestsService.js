/**
 * staffSubscriptionRequestsService.js
 *
 * Staff Control Center - Subscription-Requests-Inbox.
 *
 * Liest aus `subscription_requests` (Welle 8 Schritt 3) und reichert die
 * Zeilen mit Org-Kontext + aktuellem Subscription-Live-State an. Mutationen
 * delegieren an `subscriptionRequestService` und schreiben zusaetzlich
 * `staff_control_audit_log` ueber den Aufrufer im Router.
 *
 * Filter:
 *   - status:        einzelner Status (draft/submitted/.../active/...)
 *   - statusBucket:  'open' | 'closed' (open = nicht-terminal)
 *   - requestType:   einer aus REQUEST_TYPES
 *   - quickFilter:   'pilot' | 'individuell' | 'enterprise' | 'upgrade' | 'cancellation' | 'open' | 'mine'
 *   - assignedToMe:  staff-user-id wird vom Aufrufer mitgegeben (`assigneeStaffId`)
 *   - planRequested: BASIS/PLUS/PRO/INDIVIDUELL
 */

import * as subreq from "./subscriptionRequestService.js";

const _TERMINAL = new Set(["rejected", "cancelled", "expired", "active"]);

/* ── Liste mit Filter ─────────────────────────────────────────── */

export async function listInbox(pool, opts = {}) {
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const conds = [];
  const params = [];

  if (opts.status) {
    params.push(String(opts.status));
    conds.push(`sr.status = $${params.length}`);
  }
  if (opts.statusBucket === "open") {
    conds.push(`sr.status NOT IN ('rejected','cancelled','expired','active')`);
  } else if (opts.statusBucket === "closed") {
    conds.push(`sr.status IN ('rejected','cancelled','expired','active')`);
  }

  if (opts.requestType) {
    params.push(String(opts.requestType));
    conds.push(`sr.request_type = $${params.length}`);
  }

  if (opts.assigneeStaffId) {
    params.push(String(opts.assigneeStaffId));
    conds.push(`sr.assigned_staff_id = $${params.length}`);
  }

  if (opts.unassigned === true) {
    conds.push(`sr.assigned_staff_id IS NULL`);
  }

  // Quick-Filter sind Convenience-Aliase + zusaetzliche Bedingungen.
  switch (opts.quickFilter) {
    case "pilot":
      params.push("pilot");
      conds.push(`sr.request_type = $${params.length}`);
      break;
    case "individuell":
      params.push("INDIVIDUELL");
      conds.push(`(sr.desired_plan = $${params.length} OR sr.current_plan = $${params.length})`);
      break;
    case "enterprise":
      // S/M/L/Enterprise-Tier; "enterprise" filtert auf den Top-Tier
      params.push("individuell_enterprise");
      conds.push(`sr.desired_individual_tier = $${params.length}`);
      break;
    case "upgrade":
      params.push("upgrade");
      conds.push(`sr.request_type = $${params.length}`);
      break;
    case "downgrade":
      params.push("downgrade");
      conds.push(`sr.request_type = $${params.length}`);
      break;
    case "cancellation":
      params.push("cancellation");
      conds.push(`sr.request_type = $${params.length}`);
      break;
    case "open":
      conds.push(`sr.status NOT IN ('rejected','cancelled','expired','active')`);
      break;
    case "mine":
      if (opts.staffActorId) {
        params.push(String(opts.staffActorId));
        conds.push(`sr.assigned_staff_id = $${params.length}`);
      }
      break;
    case "all":
    default:
      // kein zusaetzlicher Filter
      break;
  }

  if (opts.planRequested) {
    params.push(String(opts.planRequested));
    conds.push(`sr.desired_plan = $${params.length}`);
  }

  if (opts.contactEmail) {
    params.push(String(opts.contactEmail).trim().toLowerCase());
    conds.push(`LOWER(sr.contact_email) = $${params.length}`);
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  params.push(limit);
  params.push(offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const { rows } = await pool.query(
    `SELECT
        sr.id, sr.request_type, sr.status,
        sr.org_id, sr.user_id,
        sr.contact_email, sr.contact_name, sr.contact_phone,
        sr.requester_company_name,
        sr.current_plan, sr.desired_plan, sr.desired_individual_tier,
        sr.employee_count, sr.user_count, sr.site_count, sr.supplier_count,
        sr.region_scope, sr.industry,
        sr.expected_start_date,
        sr.assigned_staff_id, sr.assigned_at,
        sr.is_self_service, sr.requires_staff_approval,
        sr.proposed_price_cents, sr.proposed_term_months,
        sr.created_at, sr.updated_at, sr.status_updated_at,
        org.name AS org_name,
        org.plan AS org_current_plan,
        org.individual_tier_auto AS org_current_individual_tier,
        org.pilot_status AS org_pilot_status,
        staff.email AS assignee_email,
        staff.contact_person AS assignee_name
     FROM subscription_requests sr
     LEFT JOIN organizations org ON org.id = sr.org_id
     LEFT JOIN users staff ON staff.id = sr.assigned_staff_id
     ${where}
     ORDER BY COALESCE(sr.status_updated_at, sr.created_at) DESC, sr.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return rows;
}

/* ── Aggregations-Counter fuer Sidebar/Badges ─────────────────── */

export async function getInboxCounters(pool, { staffActorId } = {}) {
  const out = { total_open: 0, by_type: {}, mine_open: 0 };
  const { rows: openRows } = await pool.query(
    `SELECT request_type, COUNT(*)::int AS cnt
       FROM subscription_requests
      WHERE status NOT IN ('rejected','cancelled','expired','active')
      GROUP BY request_type`
  );
  for (const r of openRows) {
    out.by_type[r.request_type] = r.cnt;
    out.total_open += Number(r.cnt || 0);
  }

  if (staffActorId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt
         FROM subscription_requests
        WHERE assigned_staff_id = $1
          AND status NOT IN ('rejected','cancelled','expired','active')`,
      [staffActorId]
    );
    out.mine_open = Number(rows[0]?.cnt || 0);
  }
  return out;
}

/* ── Detail mit Org-Kontext + History ─────────────────────────── */

export async function getInboxDetail(pool, requestId) {
  const main = await pool.query(
    `SELECT sr.*,
            org.name AS org_name,
            org.plan AS org_current_plan,
            org.individual_tier_auto AS org_current_individual_tier,
            org.pilot_status AS org_pilot_status,
            org.account_type AS org_account_type,
            org.feature_bundle AS org_feature_bundle,
            org.employee_count_approx AS org_employee_count,
            staff.email AS assignee_email,
            staff.contact_person AS assignee_name
       FROM subscription_requests sr
       LEFT JOIN organizations org ON org.id = sr.org_id
       LEFT JOIN users staff ON staff.id = sr.assigned_staff_id
      WHERE sr.id = $1`,
    [requestId]
  );
  const row = main.rows[0];
  if (!row) return null;

  const history = await subreq.listHistory(pool, requestId);

  // Aktuelle Live-Subscription des verknuepften Users (falls vorhanden)
  let currentSubscription = null;
  if (row.user_id) {
    const sub = await pool.query(
      `SELECT id, plan, status, current_period_start, current_period_end,
              cancel_at, cancel_requested_at, canceled_at,
              cancel_reason, created_at, updated_at
         FROM subscriptions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
      [row.user_id]
    );
    currentSubscription = sub.rows[0] || null;
  }

  // Verknuepfte Strategic-Inquiry (falls aus Konfigurator entstanden)
  let sourceLead = null;
  if (row.source_strategic_request_id) {
    const lead = await pool.query(
      `SELECT id, status, request_type, contact_email, plan_requested,
              created_at, updated_at
         FROM strategic_collaboration_requests
        WHERE id = $1`,
      [row.source_strategic_request_id]
    );
    sourceLead = lead.rows[0] || null;
  }

  return {
    ...row,
    history,
    current_subscription: currentSubscription,
    source_lead: sourceLead
  };
}

/* ── Mutationen (delegieren an subscriptionRequestService) ────── */

export async function transitionStatus(pool, args) {
  return await subreq.transitionStatus(pool, args);
}

export async function approveRequest(pool, args) {
  return await subreq.approve(pool, args);
}

export async function rejectRequest(pool, args) {
  return await subreq.reject(pool, args);
}

export async function activateRequest(pool, args) {
  return await subreq.activate(pool, args);
}

export async function assignStaff(pool, args) {
  return await subreq.assignStaff(pool, args);
}

/**
 * Staff-Notiz / Angebots-Eckdaten (Preis, Laufzeit, Limits/Features) direkt
 * im Datensatz pflegen, OHNE Statusuebergang. Schreibt eine History-Zeile
 * mit Detail-JSON, damit das Audit den Vorher/Nachher-Vergleich erlaubt.
 */
export async function setOfferDetails(pool, {
  requestId,
  actorUserId = null,
  staffNotes,
  proposedPriceCents,
  proposedTermMonths,
  desiredFeatures,
  desiredAddons,
  expectedStartDate,
  expectedEndDate,
  cancellationEffectiveAt
}) {
  const fields = [];
  const params = [];
  function add(col, val) { params.push(val); fields.push(`${col} = $${params.length}`); }

  if (staffNotes !== undefined) add("staff_notes", staffNotes || null);
  if (proposedPriceCents !== undefined) {
    add("proposed_price_cents", Number.isFinite(proposedPriceCents) ? proposedPriceCents : null);
  }
  if (proposedTermMonths !== undefined) {
    add("proposed_term_months", Number.isFinite(proposedTermMonths) ? proposedTermMonths : null);
  }
  if (desiredFeatures !== undefined) {
    params.push(JSON.stringify(desiredFeatures || []));
    fields.push(`desired_features = $${params.length}::jsonb`);
  }
  if (desiredAddons !== undefined) {
    params.push(JSON.stringify(desiredAddons || []));
    fields.push(`desired_addons = $${params.length}::jsonb`);
  }
  if (expectedStartDate !== undefined) add("expected_start_date", expectedStartDate || null);
  if (expectedEndDate !== undefined) add("expected_end_date", expectedEndDate || null);
  // Kündigungswirksamkeitsdatum — nur relevant für request_type=cancellation
  if (cancellationEffectiveAt !== undefined) add("cancellation_effective_at", cancellationEffectiveAt || null);

  if (!fields.length) return { ok: false, error: "NO_FIELDS" };

  fields.push(`updated_at = NOW()`);
  params.push(requestId);
  const idIdx = params.length;

  const { rows } = await pool.query(
    `UPDATE subscription_requests
        SET ${fields.join(", ")}
      WHERE id = $${idIdx}
      RETURNING *`,
    params
  );
  if (!rows[0]) return { ok: false, error: "REQUEST_NOT_FOUND" };

  // Audit als "no-status-change"-Eintrag in der History.
  await pool.query(
    `INSERT INTO subscription_request_status_history
       (request_id, from_status, to_status, changed_by, reason, details)
     VALUES ($1, $2, $2, $3, $4, $5::jsonb)`,
    [
      requestId,
      rows[0].status,
      actorUserId,
      "set_offer_details",
      JSON.stringify({
        staff_notes_changed: staffNotes !== undefined,
        proposed_price_cents: proposedPriceCents ?? null,
        proposed_term_months: proposedTermMonths ?? null,
        desired_features_count: Array.isArray(desiredFeatures) ? desiredFeatures.length : null,
        desired_addons_count: Array.isArray(desiredAddons) ? desiredAddons.length : null
      })
    ]
  );

  return { ok: true, row: rows[0] };
}
