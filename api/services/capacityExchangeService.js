/**
 * Capacity Exchange Service — the core business logic for the availability autopilot.
 * Builds on the existing capacity_posts table (extended by migration 021).
 * Handles: CRUD, status transitions, browsable feed, trust signals,
 * auto-expiry, interactions, supplier dashboard stats.
 */

import * as capacityWorkflow from "./capacityWorkflow.js";
import * as auditLog from "./auditLog.js";
import { hasFeature } from "../config/planFeatures.js";
import { haversineKm } from "./matchingEngine.js";

/* ── Plan-based limits ────────────────────────────── */

const PLAN_LIMITS = {
  FREE: 0,
  BASIS: 5,
  PLUS: 20,
  NOTDIENST: 20,
  PRO: 50,
  ENTERPRISE: 999
};

function getActiveLimit(plan) {
  return PLAN_LIMITS[plan] ?? 0;
}

/* ── Helpers ──────────────────────────────────────── */

const ENTRY_SELECT = `
  cp.*,
  u.company_name AS supplier_company_name,
  u.email AS supplier_email,
  o.name AS org_name
`;

const ENTRY_JOINS = `
  FROM capacity_posts cp
  JOIN users u ON u.id = cp.supplier_company_id
  LEFT JOIN organizations o ON o.id = cp.org_id
`;

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
      valid_until, last_confirmed_at, org_id, department_id, created_by, price_hint)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,FALSE,$17,
             $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
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
      data.price_hint || null
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
  'valid_until', 'org_id', 'department_id', 'price_hint'
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
  let eIdx = 3;

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
  // Draft/private entries: only owner can see
  if ((row.status === 'draft' || row.visibility_status === 'private') &&
      viewerUserId !== row.supplier_company_id) {
    return null;
  }
  return row;
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
       CASE cp.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
       cp.updated_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/* ── READ: Public feed (company side) ────────────── */

export async function browseFeed(pool, opts = {}) {
  const params = [];
  const where = ["cp.status = 'active'", "cp.visibility_status != 'private'"];
  let idx = 1;

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
  if (opts.availability_from) {
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

  // Count
  const countQ = `SELECT COUNT(*)::int AS total ${ENTRY_JOINS} WHERE ${where.join(' AND ')}`;
  const { rows: countRows } = await pool.query(countQ, params);
  const total = countRows[0]?.total ?? 0;

  // List
  params.push(limit, offset);
  const listQ = `
    SELECT ${ENTRY_SELECT} ${ENTRY_JOINS}
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE cp.priority_level WHEN 'urgent' THEN 0 WHEN 'elevated' THEN 1 ELSE 2 END,
      cp.last_confirmed_at DESC NULLS LAST,
      cp.updated_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  const { rows } = await pool.query(listQ, params);

  // Post-query geo filter
  let items = rows;
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

  return { items, total, page, limit };
}

/* ── INTERACTIONS ─────────────────────────────────── */

export async function createInteraction(pool, capacityPostId, companyUserId, data) {
  const { rows } = await pool.query(
    `INSERT INTO capacity_interactions (capacity_post_id, company_user_id, interaction_type, message, requisition_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      capacityPostId, companyUserId,
      data.interaction_type,
      data.message || null,
      data.requisition_id || null
    ]
  );
  return rows[0];
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
    'SELECT plan, company_name, org_id FROM users WHERE id = $1',
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

  return signals;
}

/* ── AUTO-EXPIRY BATCH ────────────────────────────── */

/**
 * Expire active entries past their valid_until date.
 * Called by background worker.
 */
export async function expireStaleEntries(pool, batchSize = 100) {
  const { rows } = await pool.query(
    `UPDATE capacity_posts SET status = 'expired', is_active = FALSE, updated_at = NOW()
     WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until < NOW()
     RETURNING id, supplier_company_id`,
  );
  // Limit to batch size for safety
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

/* ── SUPPLIER DASHBOARD STATS ─────────────────────── */

export async function getSupplierDashboardStats(pool, supplierId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_entries,
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
       COUNT(*)::int AS total_interactions,
       COUNT(*) FILTER (WHERE ci.interaction_type = 'interest')::int AS interests,
       COUNT(*) FILTER (WHERE ci.interaction_type = 'offer_request')::int AS offer_requests,
       COUNT(*) FILTER (WHERE ci.interaction_type = 'deal_start')::int AS deal_starts
     FROM capacity_interactions ci
     JOIN capacity_posts cp ON cp.id = ci.capacity_post_id
     WHERE cp.supplier_company_id = $1 AND ci.created_at > NOW() - INTERVAL '30 days'`,
    [supplierId]
  );

  return { ...stats, interactions_30d: interactionRows[0] };
}

/* ── METRICS (Platform-wide) ─────────────────────── */

export async function getCapacityMetrics(pool) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_entries,
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
