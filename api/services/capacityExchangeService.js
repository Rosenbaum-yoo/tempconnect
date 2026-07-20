/**
 * Capacity Exchange Service — the core business logic for the availability autopilot.
 * Builds on the existing capacity_posts table (extended by migration 021).
 * Handles: CRUD, status transitions, browsable feed, trust signals,
 * auto-expiry, interactions, supplier dashboard stats.
 */

import * as capacityWorkflow from "./capacityWorkflow.js";
import { haversineKm, scoreMatch } from "./matchingEngine.js";
import * as auditLog from "./auditLog.js";
import { computePremiumBoost } from "./reputationService.js";
import { assertLocationBelongsToOrg, assertDepartmentBelongsToOrg } from "../utils/orgBoundary.js";

/* ── Plan-based limits ────────────────────────────── */

const PLAN_LIMITS = {
  DEMO: 0,
  FREE: 0,
  BASIS: 5,
  PLUS: 20,
  PRO: 50,
  INDIVIDUELL: 999
};
PLAN_LIMITS.ENTERPRISE = PLAN_LIMITS.INDIVIDUELL;
PLAN_LIMITS.INDIVIDUAL = PLAN_LIMITS.INDIVIDUELL;

function getActiveLimit(plan) {
  return PLAN_LIMITS[plan] ?? 0;
}

/* ── Helpers ──────────────────────────────────────── */

const ENTRY_SELECT = `
  cp.*,
  u.company_name AS supplier_company_name,
  u.role AS supplier_role,
  u.email AS supplier_email,
  o.name AS org_name,
  COALESCE(o.logo_url, cfp.logo_url) AS supplier_logo_url
`;

const ENTRY_JOINS = `
  FROM capacity_posts cp
  JOIN users u ON u.id = cp.supplier_company_id
  LEFT JOIN organizations o ON o.id = cp.org_id
  LEFT JOIN company_profiles cfp ON cfp.user_id = cp.supplier_company_id
`;

const EMPTY_CAPACITY_COMMERCIAL_STATE = Object.freeze({
  committed_headcount: 0,
  remaining_headcount: 0,
  assigned_headcount: 0,
  staffing_reserved_headcount: 0,
  active_offer_count: 0,
  counterparty_user_ids: [],
  has_active_deal: false,
  is_partially_committed: false,
  is_fully_committed: false,
  commercial_status: 'open',
  commercial_visibility: 'public'
});

function toInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}
function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const datePart = raw.length >= 10 ? raw.slice(0, 10) : raw;
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildCapacityCommercialState(entry, rawState = EMPTY_CAPACITY_COMMERCIAL_STATE) {
  const headcount = Math.max(0, toInt(entry?.headcount, 0));
  const committedHeadcount = Math.max(0, toInt(rawState?.committed_headcount, 0));
  const assignedHeadcount = Math.max(0, toInt(rawState?.assigned_headcount, 0));
  const staffingReservedHeadcount = Math.max(0, toInt(rawState?.staffing_reserved_headcount, 0));
  const remainingHeadcount = Math.max(headcount - committedHeadcount, 0);
  const counterpartyUserIds = Array.isArray(rawState?.counterparty_user_ids)
    ? rawState.counterparty_user_ids.filter(Boolean)
    : [];
  const hasActiveDeal = committedHeadcount > 0;
  const isPartiallyCommitted = hasActiveDeal && remainingHeadcount > 0;
  const isFullyCommitted = hasActiveDeal && remainingHeadcount === 0;

  return {
    committed_headcount: committedHeadcount,
    remaining_headcount: remainingHeadcount,
    assigned_headcount: assignedHeadcount,
    staffing_reserved_headcount: staffingReservedHeadcount,
    active_offer_count: Math.max(0, toInt(rawState?.active_offer_count, 0)),
    counterparty_user_ids: counterpartyUserIds,
    has_active_deal: hasActiveDeal,
    is_partially_committed: isPartiallyCommitted,
    is_fully_committed: isFullyCommitted,
    commercial_status: isFullyCommitted ? 'reserved' : isPartiallyCommitted ? 'partially_committed' : 'open',
    commercial_visibility: isFullyCommitted ? 'counterparty_only' : 'public'
  };
}

function canViewerSeeReservedEntry(entry, viewerUserId) {
  if (!viewerUserId) return false;
  if (viewerUserId === entry.supplier_company_id) return true;
  return Array.isArray(entry.counterparty_user_ids) && entry.counterparty_user_ids.includes(viewerUserId);
}

function canViewerSeeEntry(entry, viewerUserId) {
  if (!entry) return false;
  if (viewerUserId && viewerUserId === entry.supplier_company_id) return true;
  if (entry.status === 'reserved') {
    return canViewerSeeReservedEntry(entry, viewerUserId);
  }
  if (entry.status !== 'active') {
    return false;
  }
  return entry.visibility_status !== 'private';
}

export async function getCapacityCommercialStates(pool, capacityPostIds = []) {
  const uniqueIds = [...new Set((capacityPostIds || []).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { rows } = await pool.query(
    `SELECT
       cp.id AS capacity_post_id,
       COALESCE(SUM(
         CASE
           WHEN o.status = 'accepted'
             AND COALESCE(o.agreement_status, 'none') NOT IN ('cancelled', 'expired')
           THEN GREATEST(COALESCE(o.offered_quantity, d.headcount, 0), 0)
           ELSE 0
         END
       ), 0)::int AS committed_headcount,
       COUNT(DISTINCT o.id) FILTER (
         WHERE o.status = 'accepted'
           AND COALESCE(o.agreement_status, 'none') NOT IN ('cancelled', 'expired')
       )::int AS active_offer_count,
       COALESCE(SUM(
         CASE
           WHEN o.status = 'accepted'
             AND COALESCE(o.agreement_status, 'none') NOT IN ('cancelled', 'expired')
           THEN COALESCE(a.filled_quantity, 0)
           ELSE 0
         END
       ), 0)::int AS assigned_headcount,
       COALESCE(SUM(
         CASE
           WHEN o.status = 'accepted'
             AND COALESCE(o.agreement_status, 'none') NOT IN ('cancelled', 'expired')
           THEN COALESCE(a.reserved_quantity, 0)
           ELSE 0
         END
       ), 0)::int AS staffing_reserved_headcount,
       ARRAY_REMOVE(ARRAY_AGG(DISTINCT CASE
         WHEN o.status = 'accepted'
           AND COALESCE(o.agreement_status, 'none') NOT IN ('cancelled', 'expired')
         THEN d.requester_company_id
         ELSE NULL
       END), NULL) AS counterparty_user_ids
     FROM capacity_posts cp
     LEFT JOIN offers o ON o.capacity_post_id = cp.id
     LEFT JOIN demand_requests d ON d.id = o.demand_request_id
     LEFT JOIN assignments a ON a.offer_id = o.id
     WHERE cp.id = ANY($1)
     GROUP BY cp.id`,
    [uniqueIds]
  );

  const stateMap = new Map();
  for (const row of rows) {
    stateMap.set(row.capacity_post_id, {
      committed_headcount: toInt(row.committed_headcount, 0),
      assigned_headcount: toInt(row.assigned_headcount, 0),
      staffing_reserved_headcount: toInt(row.staffing_reserved_headcount, 0),
      active_offer_count: toInt(row.active_offer_count, 0),
      counterparty_user_ids: Array.isArray(row.counterparty_user_ids)
        ? row.counterparty_user_ids.filter(Boolean)
        : []
    });
  }
  return stateMap;
}

export async function getCapacityCommercialState(pool, capacityPostId) {
  const { rows } = await pool.query(
    'SELECT id, headcount FROM capacity_posts WHERE id = $1',
    [capacityPostId]
  );
  const entry = rows[0];
  if (!entry) {
    return EMPTY_CAPACITY_COMMERCIAL_STATE;
  }
  const stateMap = await getCapacityCommercialStates(pool, [capacityPostId]);
  return buildCapacityCommercialState(entry, stateMap.get(capacityPostId));
}

export async function enrichCapacityEntries(pool, entries, { viewerUserId = null } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  const stateMap = await getCapacityCommercialStates(pool, entries.map((entry) => entry?.id).filter(Boolean));
  return entries.map((entry) => {
    const commercialState = buildCapacityCommercialState(entry, stateMap.get(entry.id));
    return {
      ...entry,
      ...commercialState,
      visible_to_viewer: canViewerSeeEntry({ ...entry, ...commercialState }, viewerUserId)
    };
  });
}

export async function syncCapacityCommercialState(pool, capacityPostId) {
  const { rows } = await pool.query(
    'SELECT * FROM capacity_posts WHERE id = $1 FOR UPDATE',
    [capacityPostId]
  );
  const entry = rows[0];
  if (!entry) return null;

  const commercialState = buildCapacityCommercialState(entry, await getCapacityCommercialState(pool, capacityPostId));

  if (!['active', 'reserved'].includes(entry.status)) {
    return { ...entry, ...commercialState };
  }

  const nextStatus = commercialState.is_fully_committed ? 'reserved' : 'active';
  const nextIsActive = capacityWorkflow.isEffectivelyActive(nextStatus);

  if (entry.status === nextStatus && entry.is_active === nextIsActive) {
    return { ...entry, ...commercialState };
  }

  const { rows: updatedRows } = await pool.query(
    `UPDATE capacity_posts
     SET status = $2,
         is_active = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [capacityPostId, nextStatus, nextIsActive]
  );
  const updatedEntry = updatedRows[0] || entry;
  return { ...updatedEntry, ...buildCapacityCommercialState(updatedEntry, commercialState) };
}

export async function syncCapacityCommercialStateForOffer(pool, offerId) {
  const { rows } = await pool.query(
    'SELECT capacity_post_id FROM offers WHERE id = $1',
    [offerId]
  );
  const capacityPostId = rows[0]?.capacity_post_id;
  if (!capacityPostId) return null;
  return syncCapacityCommercialState(pool, capacityPostId);
}

/* ── CREATE ───────────────────────────────────────── */

/**
 * Create a new capacity exchange entry.
 * @param {import('pg').Pool} pool
 * @param {string} supplierId - user id of the supplier
 * @param {string} plan - user's subscription plan
 * @param {Object} data - validated payload
 * @returns {Object} created entry
 */
export async function createCapacityEntry(pool, supplierId, plan, data) {
  // Check plan limit
  const limit = getActiveLimit(plan);
  if (limit <= 0 && data.status !== 'draft') {
    throw Object.assign(new Error('Plan does not allow capacity entries'), { code: 'PLAN_LIMIT' });
  }
  if (data.status === 'active' || !data.status) {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM capacity_posts WHERE supplier_company_id = $1 AND status = 'active'`,
      [supplierId]
    );
    if (countRows[0].cnt >= limit) {
      throw Object.assign(new Error(`Active entry limit reached (${limit})`), { code: 'PLAN_LIMIT' });
    }
  }

  // Org-Boundary: Standort und Abteilung muessen zur Org des Lieferanten gehoeren.
  await assertLocationBelongsToOrg(pool, data.location_id, data.org_id);
  await assertDepartmentBelongsToOrg(pool, data.department_id, data.org_id);

  const initialStatus = data.status || 'draft';
  const isActive = capacityWorkflow.isEffectivelyActive(initialStatus);

  const { rows } = await pool.query(
    `INSERT INTO capacity_posts
     (supplier_company_id, title, role, skill_tags, headcount,
      availability_from, availability_to, location_city, location_postal,
      location_lat, location_lng, radius_km, price_type, price_min, price_max,
      is_active, is_search_agent, status,
      worker_category, availability_type, shift_model, employment_type,
      country, mobility_notes, qualification_summary, certifications_summary,
      compliance_status, notes, visibility_status, priority_level,
      valid_until, last_confirmed_at, org_id, department_id, created_by, price_hint,
      worker_profile_id, primary_skill_id, offer_kind, is_anonymous)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,FALSE,$17,
             $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,
             $36,$37,$38,$39)
     RETURNING *`,
    [
      supplierId,
      data.title,
      data.role,
      data.skill_tags || [],
      data.headcount ?? 1,
      data.availability_from,
      data.availability_to || null,
      data.location_city,
      data.location_postal || null,
      data.location_lat ?? null,
      data.location_lng ?? null,
      data.radius_km ?? 25,
      data.price_type || null,
      data.price_min ?? null,
      data.price_max ?? null,
      isActive,
      initialStatus,
      data.worker_category || null,
      data.availability_type || 'immediate',
      data.shift_model || null,
      data.employment_type || 'temporary',
      data.country || 'DE',
      data.mobility_notes || null,
      data.qualification_summary || null,
      data.certifications_summary || null,
      data.compliance_status || 'unknown',
      data.notes || null,
      data.visibility_status || 'public',
      data.priority_level || 'normal',
      data.valid_until || null,
      isActive ? new Date() : null,
      data.org_id || null,
      data.department_id || null,
      supplierId,
      data.price_hint || null,
      data.worker_profile_id || null,
      data.primary_skill_id || null,
      data.offer_kind || 'legacy',
      data.is_anonymous ?? true
    ]
  );
  return rows[0];
}

/* ── UPDATE ───────────────────────────────────────── */

const UPDATABLE_FIELDS = [
  'title', 'role', 'skill_tags', 'headcount',
  'availability_from', 'availability_to', 'location_city', 'location_postal',
  'location_lat', 'location_lng', 'radius_km', 'price_type', 'price_min', 'price_max',
  'worker_category', 'availability_type', 'shift_model', 'employment_type',
  'country', 'mobility_notes', 'qualification_summary', 'certifications_summary',
  'compliance_status', 'notes', 'visibility_status', 'priority_level',
  'valid_until', 'department_id', 'price_hint'
];

export async function updateCapacityEntry(pool, entryId, supplierId, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const key of UPDATABLE_FIELDS) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }
  if (fields.length === 0) return getEntryById(pool, entryId, supplierId);

  fields.push('updated_at = NOW()');
  values.push(entryId, supplierId);
  const { rows } = await pool.query(
    `UPDATE capacity_posts SET ${fields.join(', ')}
     WHERE id = $${idx} AND supplier_company_id = $${idx + 1}
     RETURNING *`,
    values
  );
  return rows[0] || null;
}

/* ── STATUS TRANSITIONS ──────────────────────────── */

/**
 * Transition a capacity entry to a new status.
 * Enforces workflow rules and activation validation.
 */
export async function transitionStatus(pool, entryId, supplierId, newStatus, plan) {
  const { rows } = await pool.query(
    'SELECT * FROM capacity_posts WHERE id = $1 AND supplier_company_id = $2',
    [entryId, supplierId]
  );
  const entry = rows[0];
  if (!entry) return { error: 'NOT_FOUND' };

  capacityWorkflow.assertTransition(entry.status, newStatus);

  // Activation: validate required fields + check plan limit
  if (newStatus === 'active') {
    const validation = capacityWorkflow.validateForActivation(entry);
    if (!validation.valid) {
      return { error: 'VALIDATION', details: validation.errors };
    }
    const limit = getActiveLimit(plan);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM capacity_posts
       WHERE supplier_company_id = $1 AND status = 'active' AND id != $2`,
      [supplierId, entryId]
    );
    if (countRows[0].cnt >= limit) {
      return { error: 'PLAN_LIMIT', limit };
    }
  }

  const isActive = capacityWorkflow.isEffectivelyActive(newStatus);
  const extras = [];
  const extraVals = [];
  const eIdx = 3;

  if (newStatus === 'active') {
    extras.push(`last_confirmed_at = NOW()`);
  }

  const setCols = [`status = $1`, `is_active = $2`, 'updated_at = NOW()', ...extras].join(', ');
  const { rows: updated } = await pool.query(
    `UPDATE capacity_posts SET ${setCols}
     WHERE id = $${eIdx} RETURNING *`,
    [newStatus, isActive, ...extraVals, entryId]
  );
  return { entry: updated[0] };
}

/**
 * Confirm freshness of a capacity entry (sets last_confirmed_at = NOW).
 */
export async function confirmFreshness(pool, entryId, supplierId) {
  const { rows } = await pool.query(
    `UPDATE capacity_posts SET last_confirmed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND supplier_company_id = $2 AND status = 'active'
     RETURNING *`,
    [entryId, supplierId]
  );
  return rows[0] || null;
}

/* ── READ: Single entry ──────────────────────────── */

export async function getEntryById(pool, entryId, viewerUserId = null) {
  const { rows } = await pool.query(
    `SELECT ${ENTRY_SELECT} ${ENTRY_JOINS} WHERE cp.id = $1`,
    [entryId]
  );
  const row = rows[0];
  if (!row) return null;
  const [entry] = await enrichCapacityEntries(pool, [row], { viewerUserId });
  if (!canViewerSeeEntry(entry, viewerUserId)) {
    return null;
  }
  return entry;
}

/* ── READ: Supplier's own entries ─────────────────── */

export async function listOwnEntries(pool, supplierId, opts = {}) {
  const params = [supplierId];
  const where = ['cp.supplier_company_id = $1'];
  let idx = 2;

  if (opts.status) {
    params.push(opts.status);
    where.push(`cp.status = $${idx}`);
    idx++;
  }
  if (opts.expiring_within_days) {
    params.push(opts.expiring_within_days);
    where.push(`cp.status = 'active' AND cp.valid_until IS NOT NULL AND cp.valid_until < NOW() + ($${idx} || ' days')::INTERVAL`);
    idx++;
  }

  const limit = Math.min(100, opts.limit || 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT ${ENTRY_SELECT} ${ENTRY_JOINS}
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE cp.status WHEN 'active' THEN 0 WHEN 'reserved' THEN 1 WHEN 'paused' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END,
       cp.updated_at DESC
     LIMIT $${idx}`,
    params
  );
  return enrichCapacityEntries(pool, rows, { viewerUserId: supplierId });
}

/* ── READ: Public feed (company side) ────────────── */

export async function browseFeed(pool, opts = {}) {
  const viewerRole = opts.viewer_role || null;
  const viewerUserId = opts.viewer_user_id || null;
  const interAgencyEnabled = opts.inter_agency_enabled === true;
  const interAgencySupplyVisible = opts.inter_agency_supply_visible === true;
  const demandRemainingOpenSql = `COALESCE(
    dr.remaining_open_count,
    GREATEST(COALESCE(dr.required_total_count, dr.headcount, 1) - COALESCE(dr.currently_committed_count, 0), 0)
  )`;
  const isImmediateWindow = opts.availability_window === 'immediate';
  const immediateAnchor = isImmediateWindow
    ? (normalizeDateOnly(opts.availability_from) || todayDateString())
    : null;
  const immediateStart = isImmediateWindow ? immediateAnchor : null;
  const immediateEnd = isImmediateWindow && immediateStart ? addDays(immediateStart, 1) : null;
  const demandAvailabilityClause = (isImmediateWindow && immediateStart && immediateEnd)
    ? ` AND dr.start_date <= '${immediateEnd}' AND (dr.end_date IS NULL OR dr.end_date >= '${immediateStart}')`
    : '';
  const demandVisibilityWhere = `${demandRemainingOpenSql} > 0
      AND dr.status IN ('open', 'partially_covered')
      AND NOT EXISTS (
        SELECT 1
        FROM offers o_origin
        WHERE o_origin.demand_request_id = dr.id
          AND o_origin.capacity_post_id IS NOT NULL
      )
      AND (dr.end_date IS NULL OR dr.end_date >= CURRENT_DATE)${demandAvailabilityClause}`;

  const params = [];
  const where = ["cp.visibility_status != 'private'"];
  let idx = 1;

  if (viewerUserId) {
    params.push(viewerUserId);
    const viewerParam = `$${idx}`;
    where.push(`(
      cp.status = 'active'
      OR (
        cp.status = 'reserved'
        AND (
          cp.supplier_company_id = ${viewerParam}
          OR EXISTS (
            SELECT 1
            FROM offers o_reserved
            JOIN demand_requests dr_reserved ON dr_reserved.id = o_reserved.demand_request_id
            WHERE o_reserved.capacity_post_id = cp.id
              AND o_reserved.status = 'accepted'
              AND COALESCE(o_reserved.agreement_status, 'none') NOT IN ('cancelled', 'expired')
              AND (
                o_reserved.supplier_company_id = ${viewerParam}
                OR dr_reserved.requester_company_id = ${viewerParam}
              )
          )
        )
      )
    )`);
    idx++;
  } else {
    where.push("cp.status = 'active'");
  }

  // Marktplatz zeigt nur AKTUELLE Angebote: abgelaufene (Einsatz-Enddatum vorbei) ausblenden.
  // availability_to IS NULL = offenes Ende -> bleibt sichtbar. Reiner Query-Zeit-Filter:
  // kein Loeschen, reversibel; Angebote "laufen ab", sobald ihr Enddatum < heute ist.
  where.push("(cp.availability_to IS NULL OR cp.availability_to >= CURRENT_DATE)");

  if (opts.worker_category) {
    params.push(opts.worker_category);
    where.push(`cp.worker_category = $${idx}`);
    idx++;
  }
  if (opts.role) {
    params.push('%' + opts.role + '%');
    where.push(`LOWER(cp.role) LIKE LOWER($${idx})`);
    idx++;
  }
  if (opts.location_city) {
    params.push(opts.location_city);
    where.push(`LOWER(cp.location_city) = LOWER($${idx})`);
    idx++;
  }
  if (isImmediateWindow && immediateStart && immediateEnd) {
    params.push(immediateEnd);
    where.push(`cp.availability_from <= $${idx}`);
    idx++;
    params.push(immediateStart);
    where.push(`(cp.availability_to IS NULL OR cp.availability_to >= $${idx})`);
    idx++;
  } else if (opts.availability_from) {
    params.push(opts.availability_from);
    where.push(`cp.availability_from <= $${idx}`);
    idx++;
  }
  if (opts.min_headcount) {
    params.push(opts.min_headcount);
    where.push(`cp.headcount >= $${idx}`);
    idx++;
  }
  if (opts.shift_model) {
    params.push(opts.shift_model);
    where.push(`cp.shift_model = $${idx}`);
    idx++;
  }
  if (opts.compliance_status) {
    params.push(opts.compliance_status);
    where.push(`cp.compliance_status = $${idx}`);
    idx++;
  }
  if (opts.priority_level) {
    params.push(opts.priority_level);
    where.push(`cp.priority_level = $${idx}`);
    idx++;
  }
  if (Array.isArray(opts.skill_tags) && opts.skill_tags.length > 0) {
    params.push(opts.skill_tags);
    where.push(`cp.skill_tags && $${idx}`);
    idx++;
  }

  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, opts.limit || 25);
  const offset = (page - 1) * limit;

  // Build supply query with current filters
  const supplyCte = `
    SELECT ${ENTRY_SELECT},
           COALESCE(cp.updated_at, cp.created_at) AS sort_date
    ${ENTRY_JOINS}
    WHERE ${where.join(' AND ')}`;

  // Demand CTE (commercially open, no user filters applied)
  const demandRoleWhere = (viewerRole === "agency" && !interAgencyEnabled)
    ? "AND u.role = 'company'"
    : "";
  const demandCte = `
    SELECT
      dr.id, dr.title, dr.role, dr.skill_tags, dr.headcount,
      GREATEST(COALESCE(dr.required_total_count, dr.headcount, 1), 1)::int AS required_total_count,
      ${demandRemainingOpenSql}::int AS remaining_open_count,
      COALESCE(dr.currently_committed_count, 0)::int AS currently_committed_count,
      COALESCE(dr.currently_committed_count, 0)::int AS committed_headcount,
      dr.start_date AS availability_from, dr.end_date AS availability_to,
      dr.location_city, dr.location_postal,
      dr.location_lat, dr.location_lng, dr.radius_km,
      dr.urgency AS priority_level,
      dr.featured_until,
      dr.budget_min AS price_min, dr.budget_max AS price_max,
      NULL::text AS price_hint, NULL::text AS price_type,
      NULL::text AS shift_model, NULL::text AS employment_type,
      NULL::text AS worker_category, NULL::text AS compliance_status,
      NULL::timestamptz AS last_confirmed_at, NULL::text AS visibility_status,
      dr.status, dr.created_at, dr.updated_at,
      dr.requester_company_id AS supplier_company_id,
      u.company_name AS supplier_company_name,
      u.role AS supplier_role,
      u.email AS supplier_email,
      NULL::text AS org_name,
      'demand'::text AS feed_type,
      COALESCE(dr.updated_at, dr.created_at) AS sort_date
    FROM demand_requests dr
    JOIN users u ON u.id = dr.requester_company_id
    WHERE ${demandVisibilityWhere}
      ${demandRoleWhere}`;

  // Count: supply + demand separately (avoids UNION column mismatch)
  const { rows: supplyCount } = await pool.query(
    `SELECT COUNT(*)::int AS cnt ${ENTRY_JOINS} WHERE ${where.join(' AND ')}`, params);
  const demandCountSql = (viewerRole === "agency" && !interAgencyEnabled)
    ? `SELECT COUNT(*)::int AS cnt
         FROM demand_requests dr
         JOIN users u ON u.id = dr.requester_company_id
        WHERE ${demandVisibilityWhere} AND u.role = 'company'`
    : `SELECT COUNT(*)::int AS cnt
         FROM demand_requests dr
        WHERE ${demandVisibilityWhere}`;
  const { rows: demandCount } = await pool.query(demandCountSql);
  const total = (supplyCount[0]?.cnt ?? 0) + (demandCount[0]?.cnt ?? 0);

  // Fetch supply entries
  const supplyParams = [...params, limit, offset];
  const { rows: rawSupplyRows } = await pool.query(
    `${supplyCte} ORDER BY sort_date DESC LIMIT $${idx} OFFSET $${idx + 1}`, supplyParams);
  let supplyRows = await enrichCapacityEntries(pool, rawSupplyRows, { viewerUserId });
  supplyRows = supplyRows.filter((row) => row.visible_to_viewer);
  if (opts.min_headcount) {
    supplyRows = supplyRows.filter((row) => row.remaining_headcount >= Number(opts.min_headcount));
  }
  supplyRows = supplyRows.filter((row) => row.status !== 'active' || row.remaining_headcount > 0);
  supplyRows.forEach(r => { r.feed_type = 'supply'; });

  // Fetch demand entries (only if supply didn't fill the page)
  let demandRows = [];
  if (supplyRows.length < limit) {
    const demandLimit = limit - supplyRows.length;
    const { rows: dr } = await pool.query(
      `${demandCte} ORDER BY COALESCE(dr.updated_at, dr.created_at) DESC LIMIT $1`, [demandLimit]);
    demandRows = dr;
  }

  let items = [...supplyRows, ...demandRows];

  // Post-query geo filter
  if (opts.latitude != null && opts.longitude != null && opts.radius_km != null) {
    const sLat = Number(opts.latitude);
    const sLng = Number(opts.longitude);
    const sR = Number(opts.radius_km);
    items = items.filter(r => {
      if (r.location_lat == null || r.location_lng == null) return false;
      const dist = haversineKm(sLat, sLng, r.location_lat, r.location_lng);
      r._distance_km = Math.round(dist * 10) / 10;
      return dist <= Math.max(sR, r.radius_km || 25);
    });
    items.sort((a, b) => (a._distance_km || 0) - (b._distance_km || 0));
  }

  // ── R2-1: Activity Badges ──
  const now = Date.now();
  const MS_48H = 48 * 60 * 60 * 1000;
  const supplyIds = items.filter(i => i.feed_type === 'supply').map(i => i.id);

  // Batch-load interaction counts for HOT badge (>= 3 in last 7 days)
  const hotMap = new Map();
  if (supplyIds.length > 0) {
    try {
      const { rows: hotRows } = await pool.query(
        `SELECT capacity_post_id, COUNT(*)::int AS cnt
         FROM capacity_interactions
         WHERE capacity_post_id = ANY($1)
           AND created_at >= NOW() - INTERVAL '7 days'
         GROUP BY capacity_post_id
         HAVING COUNT(*) >= 3`,
        [supplyIds]
      );
      for (const r of hotRows) hotMap.set(r.capacity_post_id, r.cnt);
    } catch { /* graceful: no badges if interactions table unavailable */ }
  }

  // ── GEGENSEITENLOGIK: Strikte Marktseiten-Filterung ──
  // Unternehmen sehen primaer Supply (Zeitarbeitsangebote)
  // Zeitarbeitsfirmen sehen primaer Demand (Unternehmensbedarfe)
  if (viewerRole === "company") {
    // Company: nur Supply von Agencies anzeigen, keine eigenen Company-Demands
    items = items.filter((it) => it.feed_type === "supply");
  } else if (viewerRole === "agency") {
    // Agency: nur Demand anzeigen, Supply nur bei Inter-Agency-Freigabe
    if (!interAgencySupplyVisible) {
      items = items.filter((it) => it.feed_type !== "supply");
    }
  }

  // Batch-load reputation + ranking scores for feed ranking
  const participantIds = [...new Set(items.map(i => i.supplier_company_id).filter(Boolean))];
  const reputationMap = new Map();
  if (participantIds.length > 0) {
    try {
      const { rows: repRows } = await pool.query(
        `SELECT supplier_id, response_time_score, grade,
                reputation_score, deal_success_rate, ranking_score
         FROM supplier_reputation
         WHERE supplier_id = ANY($1)`,
        [participantIds]
      );
      for (const r of repRows) reputationMap.set(r.supplier_id, r);
    } catch { /* graceful: no ranking boost if reputation table unavailable */ }
  }

  // Batch-load subscription plans for premium boost
  const planMap = new Map();
  if (participantIds.length > 0) {
    try {
      const { rows: planRows } = await pool.query(
        `SELECT DISTINCT ON (s.user_id) s.user_id, s.plan
         FROM subscriptions s
         WHERE s.user_id = ANY($1) AND s.status = 'active'
         ORDER BY s.user_id, s.created_at DESC`,
        [participantIds]
      );
      for (const p of planRows) planMap.set(p.user_id, p.plan);
    } catch { /* graceful: no premium boost if subscriptions unavailable */ }
  }

  const preferredFeedType = viewerRole === "agency" ? "demand" : viewerRole === "company" ? "supply" : null;
  const intentStartDate = isImmediateWindow && immediateStart ? immediateStart : (opts.availability_from || null);
  const intentEndDate = isImmediateWindow && immediateEnd ? immediateEnd : null;
  const intentDemand = {
    role: opts.role || null,
    location_city: opts.location_city || null,
    radius_km: opts.radius_km || 25,
    start_date: intentStartDate,
    end_date: intentEndDate,
    skill_tags: Array.isArray(opts.skill_tags) ? opts.skill_tags : [],
    headcount: opts.min_headcount || null,
    shift_model: opts.shift_model || null
  };

  for (const item of items) {
    const badges = [];

    // NEW: created less than 48h ago
    const createdMs = item.created_at ? new Date(item.created_at).getTime() : 0;
    if (createdMs > 0 && (now - createdMs) < MS_48H) {
      badges.push('NEW');
    }

    // HOT: >= 3 interactions in last 7 days (supply only)
    if (item.feed_type === 'supply' && hotMap.has(item.id)) {
      badges.push('HOT');
    }

    item.badges = badges;

    const rep = reputationMap.get(item.supplier_company_id);
    const plan = planMap.get(item.supplier_company_id) || "FREE";
    const repScore = rep?.reputation_score != null ? Number(rep.reputation_score) : null;
    const trustScore = Math.max(0, Math.min(12,
      (rep?.reputation_score != null ? Number(rep.reputation_score) / 12 : 0) +
      (rep?.deal_success_rate != null ? Number(rep.deal_success_rate) / 30 : 0)
    ));

    // ── HIERARCHISCHES RANKING ──
    // Stufe 1: Gegenseite (45 Punkte fuer Gegenseite, 5 fuer gleiche Seite)
    // Stufe 2: Reputation / Qualitaet (bis 25 Punkte)
    // Stufe 3: Abo-Modell (bis 12 Punkte, reputationsgedaempft)
    // Stufe 4: Placement-Boost (bis 8 Punkte, gedeckelt, relevanzabhaengig)
    const counterpartyScore = preferredFeedType
      ? (item.feed_type === preferredFeedType ? 45 : 5)
      : 20;
    item.counterparty_priority = item.feed_type === preferredFeedType ? "preferred" : "secondary";
    const itemRole = String(item.supplier_role || "").toLowerCase();
    item.is_inter_agency = viewerRole === "agency" && item.feed_type === "demand" && itemRole === "agency";

    // Matching relevance from existing matching engine (same kernel as matching pages/services).
    let matchScore = 0;
    if (item.feed_type === "supply") {
      const capLike = {
        role: item.role,
        skill_tags: item.skill_tags || [],
        location_lat: item.location_lat,
        location_lng: item.location_lng,
        location_city: item.location_city,
        radius_km: item.radius_km,
        availability_from: item.availability_from,
        availability_to: item.availability_to
      };
      const scored = scoreMatch(intentDemand, capLike, { supplierVerified: false, vendorPoolTier: null });
      matchScore = scored.score || 0;
    } else {
      // For demand entries reuse same engine by mapping demand->cap-like inverse.
      const demandLike = {
        role: item.role,
        skill_tags: item.skill_tags || [],
        latitude: item.location_lat,
        longitude: item.location_lng,
        location_city: item.location_city,
        radius_km: item.radius_km,
        start_date: item.availability_from,
        end_date: item.availability_to
      };
      const capIntent = {
        role: intentDemand.role || "",
        skill_tags: intentDemand.skill_tags || [],
        location_lat: opts.latitude ?? null,
        location_lng: opts.longitude ?? null,
        location_city: intentDemand.location_city || "",
        radius_km: intentDemand.radius_km || 25,
        availability_from: intentDemand.start_date || null,
        availability_to: intentDemand.end_date || null
      };
      const scored = scoreMatch(demandLike, capIntent, {
        urgencyBoost: item.priority_level === "notdienst" || item.priority_level === "urgent"
      });
      matchScore = scored.score || 0;
    }
    item.match_score = matchScore;

    // Dynamic recency and urgency.
    const ageHours = Math.max(0, (now - createdMs) / (1000 * 60 * 60));
    const recencyBoost = Math.max(0, 10 - Math.floor((ageHours / 720) * 10));
    const urgencyBoost = (item.priority_level === "notdienst" || item.priority_level === "urgent")
      ? 12
      : item.priority_level === "plus" || item.priority_level === "elevated"
        ? 6
        : 0;

    // Stufe 2: Reputation / Qualitaet (trustScore normalisiert auf max 25)
    const reputationPoints = Math.min(25, Math.round(trustScore * 2.1));

    // Stufe 3: Abo-Modell (max 12 Punkte, reputationsgedaempft)
    const premiumBoostRaw = computePremiumBoost(plan, repScore);
    const planPoints = Math.min(12, Math.round(premiumBoostRaw * 0.6));

    // Stufe 4: Placement-Boost (max 8 Punkte, nur bei Relevanz, GEDECKELT)
    // placement_boost_level: 0-3 aus capacity_posts.placement_boost_level
    const placementLevel = Number(item.placement_boost_level) || 0;
    const PLACEMENT_CAP = 8;
    const placementRaw = Math.min(PLACEMENT_CAP, placementLevel * 3);
    // Placement wird durch Relevanz gedaempft: ohne Match-Passung nur 30%
    const placementRelevanceGate = matchScore >= 30 ? 1 : 0.3;
    const placementBoost = Math.round(placementRaw * placementRelevanceGate);

    // Premium-Anzeige (einmalige In-App-Gebuehr): aktive Hervorhebung boostet im normalen Feed.
    const featuredActive = !!(item.featured_until && new Date(item.featured_until).getTime() > now);
    const featuredBoost = featuredActive ? 15 : 0;

    // Gesamtscore: hierarchisch aufgebaut
    item.rank_score = Math.max(0, Math.round(
      counterpartyScore +    // Stufe 1: max 45
      reputationPoints +     // Stufe 2: max 25
      matchScore +           // Passung: variabel
      urgencyBoost +         // Dringlichkeit: max 12
      planPoints +           // Stufe 3: max 12
      placementBoost +       // Stufe 4: max 8 (gedeckelt!)
      featuredBoost +        // Premium-Anzeige: 15
      recencyBoost           // Aktualitaet: max 10
    ));
    item.subscription_plan = plan;
    item.reputation_grade = rep?.grade || null;
    item.reputation_score = repScore;
    item.deal_success_rate = rep?.deal_success_rate != null ? Number(rep.deal_success_rate) : null;

    if (featuredActive) badges.push("PREMIUM_PLACEMENT");
    if (item.priority_level === "notdienst") badges.push("NOTDIENST");
    if (item.priority_level === "urgent") badges.push("URGENT");
    if (['INDIVIDUELL', 'ENTERPRISE', 'PRO', 'PLUS'].includes(plan)) badges.push('PREMIUM');
    if (item.counterparty_priority === "preferred") badges.push("COUNTERPARTY");
    if (item.is_inter_agency) badges.push("INTER_AGENCY");
    if (matchScore >= 70) badges.push("TOP_MATCH");

    const rankLabels = [];
    if (item.counterparty_priority === "preferred") rankLabels.push("Fuer Sie priorisiert");
    if (featuredActive) rankLabels.push("Premium-Anzeige");
    if (matchScore >= 70) rankLabels.push("Top-Treffer");
    else if (matchScore >= 40) rankLabels.push("Gute Passung");
    if (item.is_inter_agency) rankLabels.push("Inter-Agency");
    if (item.priority_level === "notdienst") rankLabels.push("Notdienst");
    else if (item.priority_level === "urgent") rankLabels.push("Dringend");
    if (itemRole === "agency") rankLabels.push("Von Zeitarbeitsfirma");
    else if (itemRole === "company") rankLabels.push("Von Unternehmen");
    if (plan === "INDIVIDUELL" || plan === "ENTERPRISE") rankLabels.push("Individueller Tarif");
    else if (plan === "PRO" || plan === "PLUS") rankLabels.push("Premium");
    item.rank_labels = rankLabels;
  }

  // Sort by rank_score (unless geo-sorted)
  if (!(opts.latitude != null && opts.longitude != null && opts.radius_km != null)) {
    items.sort((a, b) => {
      const aPreferred = a.counterparty_priority === "preferred" ? 1 : 0;
      const bPreferred = b.counterparty_priority === "preferred" ? 1 : 0;
      if (bPreferred !== aPreferred) return bPreferred - aPreferred;
      return (b.rank_score || 0) - (a.rank_score || 0);
    });
  }

  if (opts.sort === "newest") {
    items.sort((a, b) => new Date(b.sort_date || b.created_at || 0) - new Date(a.sort_date || a.created_at || 0));
  } else if (opts.sort === "freshness") {
    items.sort((a, b) => new Date(b.last_confirmed_at || 0) - new Date(a.last_confirmed_at || 0));
  } else if (opts.sort === "headcount") {
    items.sort((a, b) => (b.headcount || 0) - (a.headcount || 0));
  }

  return {
    items,
    total,
    page,
    limit,
    feed_context: {
      viewer_role: viewerRole || null,
      inter_agency_enabled: interAgencyEnabled,
      inter_agency_supply_visible: interAgencySupplyVisible
    }
  };
}

/* ── INTERACTIONS ─────────────────────────────────── */

export async function createInteraction(pool, capacityPostId, companyUserId, data) {
  const { rows } = await pool.query(
    `INSERT INTO capacity_interactions (capacity_post_id, company_user_id, interaction_type, message, requisition_id)
     SELECT $1, $2, $3, $4, $5
     WHERE NOT EXISTS (
       SELECT 1
       FROM capacity_interactions ci
       WHERE ci.capacity_post_id = $1
         AND ci.company_user_id = $2
         AND ci.interaction_type = $3
         AND COALESCE(ci.message, '') = COALESCE($4, '')
         AND ci.created_at > NOW() - INTERVAL '10 minutes'
     )
     RETURNING *`,
    [
      capacityPostId, companyUserId,
      data.interaction_type,
      data.message || null,
      data.requisition_id || null
    ]
  );
  return rows[0] || null;
}

/**
 * Interaction on a demand_request (Nachfrage): agency/supplier responds to company bedarf.
 * @param {import('pg').Pool} pool
 * @param {string} demandRequestId
 * @param {string} actorUserId - must not be the demand requester
 */
export async function createDemandInteraction(pool, demandRequestId, actorUserId, data) {
  const { rows } = await pool.query(
    `INSERT INTO capacity_interactions (capacity_post_id, demand_request_id, company_user_id, interaction_type, message, requisition_id)
     SELECT NULL, $1, $2, $3, $4, $5
     WHERE NOT EXISTS (
       SELECT 1
       FROM capacity_interactions ci
       WHERE ci.demand_request_id = $1
         AND ci.company_user_id = $2
         AND ci.interaction_type = $3
         AND COALESCE(ci.message, '') = COALESCE($4, '')
         AND ci.created_at > NOW() - INTERVAL '10 minutes'
     )
     RETURNING *`,
    [
      demandRequestId,
      actorUserId,
      data.interaction_type,
      data.message || null,
      data.requisition_id || null
    ]
  );
  return rows[0] || null;
}

export async function listDemandInteractions(pool, demandRequestId, opts = {}) {
  const limit = Math.min(100, opts.limit || 50);
  const { rows } = await pool.query(
    `SELECT ci.*, u.company_name, u.email
     FROM capacity_interactions ci
     JOIN users u ON u.id = ci.company_user_id
     WHERE ci.demand_request_id = $1
     ORDER BY ci.created_at DESC
     LIMIT $2`,
    [demandRequestId, limit]
  );
  return rows;
}

export async function listInteractions(pool, capacityPostId, opts = {}) {
  const limit = Math.min(100, opts.limit || 50);
  const { rows } = await pool.query(
    `SELECT ci.*, u.company_name, u.email
     FROM capacity_interactions ci
     JOIN users u ON u.id = ci.company_user_id
     WHERE ci.capacity_post_id = $1
     ORDER BY ci.created_at DESC
     LIMIT $2`,
    [capacityPostId, limit]
  );
  return rows;
}

/* ── TRUST SIGNALS ────────────────────────────────── */

/**
 * Compute trust signals for a supplier.
 * Derived from proofs, subscription, deal history, profile completeness.
 */
export async function computeTrustSignals(pool, supplierId) {
  const signals = {
    supplier_verified: false,
    compliance_complete: false,
    active_subscriber: false,
    response_speed: null,
    completed_deals: 0,
    profile_completeness: 0,
    recently_confirmed: false
  };

  // Verified proofs
  const { rows: proofRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM proofs WHERE company_id = $1 AND status = 'verified'`,
    [supplierId]
  );
  signals.supplier_verified = proofRows[0].cnt > 0;

  // Compliance docs (if org-based)
  const { rows: userRows } = await pool.query(
    `SELECT u.company_name, u.org_id,
            COALESCE((SELECT s.plan FROM subscriptions s WHERE s.user_id = u.id ORDER BY s.created_at DESC LIMIT 1), 'FREE') AS plan
     FROM users u WHERE u.id = $1`,
    [supplierId]
  );
  const user = userRows[0];
  if (user) {
    signals.active_subscriber = !['FREE'].includes(user.plan || 'FREE');
    // Profile completeness: check key fields
    let filled = 0;
    if (user.company_name) filled++;
    if (user.plan && user.plan !== 'FREE') filled++;
    if (user.org_id) filled++;
    if (proofRows[0].cnt > 0) filled++;
    signals.profile_completeness = Math.round((filled / 4) * 100);
  }

  if (user?.org_id) {
    const { rows: compRows } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'verified') AS verified
       FROM compliance_documents WHERE org_id = $1`,
      [user.org_id]
    );
    if (compRows[0].total > 0) {
      signals.compliance_complete = compRows[0].verified === compRows[0].total;
    }
  }

  // Completed deals
  const { rows: dealRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM requests WHERE receiver_id = $1 AND status = 'FINALIZED'`,
    [supplierId]
  );
  signals.completed_deals = dealRows[0].cnt;

  // Recently confirmed (any active entry confirmed in last 48h)
  const { rows: freshRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM capacity_posts
     WHERE supplier_company_id = $1 AND status = 'active'
       AND last_confirmed_at > NOW() - INTERVAL '48 hours'`,
    [supplierId]
  );
  signals.recently_confirmed = freshRows[0].cnt > 0;

  // Reputation data — composite score, grade, deal success, response time
  try {
    const { rows: repRows } = await pool.query(
      `SELECT avg_stars, grade, reputation_score, deal_success_rate,
              response_time_score, ranking_score
       FROM supplier_reputation WHERE supplier_id = $1`,
      [supplierId]
    );
    if (repRows.length > 0) {
      const rep = repRows[0];
      // Composite reputation score (0-100)
      signals.reputation_score = rep.reputation_score != null
        ? Number(rep.reputation_score)
        : (rep.avg_stars != null ? Number(rep.avg_stars) : null);
      signals.reputation_grade = rep.grade || null;
      // Deal success rate (0-100, null if insufficient data)
      signals.deal_success_rate = rep.deal_success_rate != null ? Number(rep.deal_success_rate) : null;
      // Response time label for display
      const rts = rep.response_time_score != null ? Number(rep.response_time_score) : null;
      signals.response_time_score = rts;
      if (rts != null) {
        if (rts >= 100) signals.response_time_label = '<1h';
        else if (rts >= 75) signals.response_time_label = '1-4h';
        else if (rts >= 50) signals.response_time_label = '4-12h';
        else if (rts >= 25) signals.response_time_label = '12-24h';
        else signals.response_time_label = '>24h';
      }
      // Pre-aggregated ranking score
      signals.ranking_score = rep.ranking_score != null ? Number(rep.ranking_score) : null;
    }
    // Fallback: assignment-based reputation (supplier_org_id via user's org)
    if (signals.reputation_score == null && user?.org_id) {
      const { rows: orgRep } = await pool.query(
        `SELECT score FROM supplier_reputation WHERE supplier_org_id = $1`,
        [user.org_id]
      );
      if (orgRep.length > 0 && orgRep[0].score != null) {
        signals.reputation_score = Number(orgRep[0].score);
      }
    }
  } catch (_) { /* table may not exist yet */ }

  return signals;
}

/* ── AUTO-EXPIRY BATCH ────────────────────────────── */

/**
 * Expire active capacity entries (Personalangebote) deren Listing-Gueltigkeit (valid_until)
 * ODER deren Einsatz-Enddatum (availability_to) vorbei ist. So fallen abgelaufene Angebote
 * nicht nur aus dem Feed (Query-Filter), sondern bekommen status='expired' -> aktive-Counts/Limits frei.
 * Wird vom Background-Worker (capacity-expiry, taeglich) aufgerufen.
 */
export async function expireStaleEntries(pool, batchSize = 100) {
  const { rows } = await pool.query(
    `UPDATE capacity_posts SET status = 'expired', is_active = FALSE, updated_at = NOW()
     WHERE status = 'active'
       AND (
         (valid_until IS NOT NULL AND valid_until < NOW())
         OR (availability_to IS NOT NULL AND availability_to < CURRENT_DATE)
       )
     RETURNING id, supplier_company_id`,
  );
  // batchSize begrenzt nur die Notification-Liste; expired werden alle (Status-Konsistenz).
  const expired = rows.slice(0, batchSize);
  return { expired: expired.length, entries: expired };
}

/**
 * Expire offene Arbeitsplatzangebote (demand_requests) deren Einsatz-Enddatum (end_date) vorbei ist.
 * Gegenstueck zu expireStaleEntries fuer die Nachfrage-Seite. status open/partially_covered -> expired.
 * Wird vom Background-Worker (capacity-expiry, taeglich) aufgerufen.
 */
export async function expireDemandRequests(pool, batchSize = 100) {
  const { rows } = await pool.query(
    `UPDATE demand_requests SET status = 'expired', updated_at = NOW()
     WHERE status IN ('open', 'partially_covered')
       AND end_date IS NOT NULL AND end_date < CURRENT_DATE
     RETURNING id, requester_company_id`,
  );
  const expired = rows.slice(0, batchSize);
  return { expired: expired.length, entries: expired };
}

/**
 * Find entries that are stale (need reconfirmation).
 */
export async function findStaleEntries(pool, staleDays = 7, batchSize = 100) {
  const { rows } = await pool.query(
    `SELECT id, supplier_company_id, title, last_confirmed_at
     FROM capacity_posts
     WHERE status = 'active'
       AND (last_confirmed_at IS NULL OR last_confirmed_at < NOW() - ($1 || ' days')::INTERVAL)
     ORDER BY last_confirmed_at ASC NULLS FIRST
     LIMIT $2`,
    [staleDays, batchSize]
  );
  return rows;
}

/**
 * P12-5: Confirmation reminder with escalation.
 * Level 1 (>7 days stale):  Flag as 'needs_reconfirmation' + log reminder.
 * Level 2 (>14 days stale): Auto-pause entry to prevent stale listings.
 * Returns { reminded, escalated } counts.
 */
export async function processConfirmationReminders(pool, { reminderDays = 7, escalationDays = 14, batchSize = 200 } = {}) {
  let reminded = 0;
  let escalated = 0;

  // Level 2: Auto-pause entries stale beyond escalation threshold
  const { rows: escalateRows } = await pool.query(
    `UPDATE capacity_posts
     SET status = 'paused', is_active = FALSE, updated_at = NOW()
     WHERE status = 'active'
       AND (last_confirmed_at IS NULL OR last_confirmed_at < NOW() - ($1 || ' days')::INTERVAL)
     RETURNING id, supplier_company_id, title`,
    [escalationDays]
  );
  escalated = escalateRows.length;

  // Level 1: Flag remaining stale entries for reminder
  const { rows: reminderRows } = await pool.query(
    `SELECT id, supplier_company_id, title, last_confirmed_at
     FROM capacity_posts
     WHERE status = 'active'
       AND (last_confirmed_at IS NULL OR last_confirmed_at < NOW() - ($1 || ' days')::INTERVAL)
     LIMIT $2`,
    [reminderDays, batchSize]
  );
  reminded = reminderRows.length;

  // Log escalation actions for audit trail
  for (const entry of escalateRows) {
    try {
      await auditLog.writeAudit(pool, {
        action: 'capacity.auto_paused_stale',
        entity_type: 'capacity_post',
        entity_id: entry.id,
        actor_id: null,
        details: { reason: `Nicht bestätigt seit >${escalationDays} Tagen`, title: entry.title }
      });
    } catch (_) { /* non-critical */ }
  }

  return { reminded, escalated, escalated_entries: escalateRows, reminder_entries: reminderRows };
}

/* ── SUPPLIER DASHBOARD STATS ─────────────────────── */

export async function getSupplierDashboardStats(pool, supplierId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_entries,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_entries,
       COUNT(*) FILTER (WHERE status = 'reserved')::int AS reserved_entries,
       COUNT(*) FILTER (WHERE status = 'paused')::int AS paused_entries,
       COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_entries,
       COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_entries,
       COUNT(*) FILTER (WHERE status = 'filled')::int AS filled_entries,
       COUNT(*) FILTER (WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until < NOW() + INTERVAL '3 days')::int AS expiring_soon,
       COUNT(*) FILTER (WHERE status = 'active' AND (last_confirmed_at IS NULL OR last_confirmed_at < NOW() - INTERVAL '7 days'))::int AS needs_reconfirmation
     FROM capacity_posts
     WHERE supplier_company_id = $1`,
    [supplierId]
  );
  const stats = rows[0];

  // Interaction counts (last 30 days)
  const { rows: interactionRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ci.created_at > NOW() - INTERVAL '30 days')::int AS total_interactions_30d,
       COUNT(*) FILTER (WHERE ci.created_at > NOW() - INTERVAL '7 days')::int AS total_interactions_7d,
       COUNT(*) FILTER (WHERE ci.interaction_type = 'interest')::int AS interests,
       COUNT(*) FILTER (WHERE ci.interaction_type = 'offer_request')::int AS offer_requests,
       COUNT(*) FILTER (WHERE ci.interaction_type = 'deal_start')::int AS deal_starts
     FROM capacity_interactions ci
     JOIN capacity_posts cp ON cp.id = ci.capacity_post_id
     WHERE cp.supplier_company_id = $1 AND ci.created_at > NOW() - INTERVAL '30 days'`,
    [supplierId]
  );
  return {
    ...stats,
    total: stats.total_entries,
    active: stats.active_entries,
    reserved: stats.reserved_entries,
    paused: stats.paused_entries,
    draft: stats.draft_entries,
    interactions_last_7d: interactionRows[0]?.total_interactions_7d ?? 0,
    interactions_30d: interactionRows[0]
  };
}

/* ── METRICS (Platform-wide) ─────────────────────── */

export async function getCapacityMetrics(pool) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_entries,
       COUNT(*) FILTER (WHERE status = 'reserved')::int AS reserved_entries,
       COUNT(*) FILTER (WHERE status = 'filled')::int AS filled_entries,
       COUNT(DISTINCT supplier_company_id) FILTER (WHERE status = 'active')::int AS active_suppliers,
       AVG(headcount) FILTER (WHERE status = 'active')::numeric(10,1) AS avg_headcount
     FROM capacity_posts`
  );
  const { rows: interactionRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM capacity_interactions WHERE created_at > NOW() - INTERVAL '30 days'`
  );
  return { ...rows[0], interactions_30d: interactionRows[0]?.total ?? 0 };
}
