/**
 * Two-Sided Marketplace: capacity_posts, demand_requests, matches, SLA für Demands.
 * Matching deterministisch, testbar; SLA = Prozessnachweis, kein Erfolgsversprechen.
 */

import { PLAN } from "../config/planFeatures.js";
import { withTransaction } from "../utils/transaction.js";
import { assertTransition, TransitionError } from "./stateMachine.js";
import * as capacityExchangeService from "./capacityExchangeService.js";

/** Haversine distance in km */
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLng = toRad(Number(lng2) - Number(lng1));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(Number(lat1))) * Math.cos(toRad(Number(lat2))) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Deterministic match score (role, skills, availability, distance, verified). */
function scoreMatch(demand, cap, supplierVerified) {
  let score = 0;
  if (demand.role && cap.role && demand.role.toLowerCase().trim() === cap.role.toLowerCase().trim()) score += 30;
  const dTags = new Set((demand.skill_tags || []).map((t) => String(t).toLowerCase().trim()));
  const cTags = new Set((cap.skill_tags || []).map((t) => String(t).toLowerCase().trim()));
  dTags.forEach((t) => { if (cTags.has(t)) score += 5; });
  const dStart = demand.start_date;
  const dEnd = demand.end_date || demand.start_date;
  const cFrom = cap.availability_from;
  const cTo = cap.availability_to || cap.availability_from;
  if (cFrom <= dEnd && (!cTo || cTo >= dStart)) score += 20;
  if (demand.location_lat != null && demand.location_lng != null && cap.location_lat != null && cap.location_lng != null) {
    const dist = haversineKm(demand.location_lat, demand.location_lng, cap.location_lat, cap.location_lng);
    const maxR = Math.max(demand.radius_km || 25, cap.radius_km || 25);
    if (dist <= maxR) score += Math.max(0, 25 - Math.floor(dist / 10));
  } else if (demand.location_city && cap.location_city &&
    demand.location_city.toLowerCase().trim() === cap.location_city.toLowerCase().trim()) {
    score += 15;
  }
  if (supplierVerified) score += 10;
  return score;
}

/** Liste company_ids mit mindestens einem verified proof */
export async function getVerifiedSupplierIds(pool) {
  const { rows } = await pool.query(
    "SELECT DISTINCT company_id FROM proofs WHERE status = 'verified'"
  );
  return new Set(rows.map((r) => r.company_id));
}

const CAPACITY_COMMERCIAL_JOIN = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(
      CASE
        WHEN o.status = 'accepted'
          AND COALESCE(o.agreement_status, 'none') NOT IN ('cancelled', 'expired')
        THEN GREATEST(COALESCE(o.offered_quantity, dr.headcount, 0), 0)
        ELSE 0
      END
    ), 0)::int AS committed_headcount
    FROM offers o
    JOIN demand_requests dr ON dr.id = o.demand_request_id
    WHERE o.capacity_post_id = cp.id
  ) capacity_commitments ON TRUE
`;

const CAPACITY_REMAINING_HEADCOUNT_SQL = `GREATEST(cp.headcount - COALESCE(capacity_commitments.committed_headcount, 0), 0)`;
const CAPACITY_COMMERCIAL_SELECT = `
  COALESCE(capacity_commitments.committed_headcount, 0)::int AS committed_headcount,
  ${CAPACITY_REMAINING_HEADCOUNT_SQL}::int AS remaining_headcount
`;

const EMPTY_DEMAND_COMMERCIAL_STATE = Object.freeze({
  required_total_count: 1,
  committed_headcount: 0,
  remaining_open_count: 1,
  active_offer_count: 0,
  has_active_offer: false,
  is_partially_covered: false,
  is_fully_covered: false,
  is_capacity_origin: false,
  commercial_status: "open",
  commercial_visibility: "public"
});

function toCommercialCount(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : fallback;
}

function buildDemandCommercialState(demand, rawState = EMPTY_DEMAND_COMMERCIAL_STATE) {
  const requiredTotalCount = Math.max(
    1,
    toCommercialCount(demand?.required_total_count ?? demand?.headcount, 1)
  );
  const committedHeadcount = Math.max(
    0,
    toCommercialCount(rawState?.committed_headcount, toCommercialCount(demand?.currently_committed_count, 0))
  );
  const remainingOpenCount = Math.max(requiredTotalCount - committedHeadcount, 0);
  const activeOfferCount = Math.max(0, toCommercialCount(rawState?.active_offer_count, 0));
  const hasActiveOffer = committedHeadcount > 0;
  const isPartiallyCovered = hasActiveOffer && remainingOpenCount > 0;
  const isFullyCovered = requiredTotalCount > 0 && remainingOpenCount === 0;
  const isCapacityOrigin = rawState?.is_capacity_origin === true;

  return {
    required_total_count: requiredTotalCount,
    committed_headcount: committedHeadcount,
    remaining_open_count: remainingOpenCount,
    active_offer_count: activeOfferCount,
    has_active_offer: hasActiveOffer,
    is_partially_covered: isPartiallyCovered,
    is_fully_covered: isFullyCovered,
    is_capacity_origin: isCapacityOrigin,
    commercial_status: isFullyCovered ? "fulfilled" : isPartiallyCovered ? "partially_covered" : "open",
    commercial_visibility: isCapacityOrigin ? "counterparty_only" : "public"
  };
}

/* ── capacity_posts ─────────────────────────────────────────── */

export async function createCapacityPost(pool, supplierId, payload) {
  // Basis-INSERT mit den Spalten aus der originalen Migration (014).
  // Neue Felder (shift_model, employment_type, etc.) werden per UPDATE nachgetragen,
  // falls die Spalten per spaeterer Migration existieren.
  const { rows } = await pool.query(
    `INSERT INTO capacity_posts
     (supplier_company_id, title, role, skill_tags, headcount, availability_from, availability_to,
      location_city, location_postal, location_lat, location_lng, radius_km, price_type, price_min, price_max,
      is_active, is_search_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,$16)
     RETURNING *`,
    [
      supplierId,
      payload.title || "",
      payload.role || "",
      payload.skill_tags || [],
      payload.headcount ?? 1,
      payload.availability_from,
      payload.availability_to || null,
      payload.location_city || "",
      payload.location_postal || null,
      payload.location_lat ?? null,
      payload.location_lng ?? null,
      payload.radius_km ?? 25,
      payload.price_type || null,
      payload.price_min ?? null,
      payload.price_max ?? null,
      !!payload.is_search_agent
    ]
  );
  const row = rows[0];

  // Optionale Felder per UPDATE nachsetzen (fail-soft: ignoriert fehlende Spalten)
  const extras = {
    shift_model: payload.shift_model || null,
    employment_type: payload.employment_type || null,
    qualification_summary: payload.qualifications || null,
    certifications_summary: payload.certifications || null,
    description: payload.description || null
  };
  const setClauses = [];
  const setParams = [row.id];
  let idx = 2;
  for (const [col, val] of Object.entries(extras)) {
    if (val != null) { setClauses.push(`${col} = $${idx}`); setParams.push(val); idx++; }
  }
  if (setClauses.length) {
    try {
      await pool.query(`UPDATE capacity_posts SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $1`, setParams);
    } catch { /* Spalte existiert nicht — ignorieren (Migration noch nicht gelaufen) */ }
  }

  return row;
}

export async function listCapacityPosts(pool, opts = {}) {
  let q = `
    SELECT cp.*, ${CAPACITY_COMMERCIAL_SELECT},
           u.company_name AS supplier_company_name,
           sr.grade AS reputation_grade,
           sr.reputation_score AS reputation_score,
           sr.avg_stars AS reputation_avg_stars,
           sr.total_ratings AS reputation_total_ratings
    FROM capacity_posts cp
    ${CAPACITY_COMMERCIAL_JOIN}
    JOIN users u ON u.id = cp.supplier_company_id
    LEFT JOIN supplier_reputation sr ON sr.supplier_id = cp.supplier_company_id
    WHERE cp.status = 'active'
      AND ${CAPACITY_REMAINING_HEADCOUNT_SQL} > 0
  `;
  const params = [];
  let i = 1;
  if (opts.supplier_company_id) { q += ` AND cp.supplier_company_id = $${i}`; params.push(opts.supplier_company_id); i++; }
  if (opts.location_city) { q += ` AND LOWER(cp.location_city) = LOWER($${i})`; params.push(opts.location_city); i++; }
  if (opts.role) { q += ` AND LOWER(cp.role) LIKE LOWER($${i})`; params.push("%" + opts.role + "%"); i++; }
  q += ` ORDER BY cp.updated_at DESC LIMIT $${i}`;
  params.push(opts.limit ?? 100);
  const { rows } = await pool.query(q, params);
  return rows;
}

export async function getCapacityPostById(pool, id, supplierId = null) {
  let q = `SELECT cp.*, ${CAPACITY_COMMERCIAL_SELECT},
                  u.company_name AS supplier_company_name
           FROM capacity_posts cp
           ${CAPACITY_COMMERCIAL_JOIN}
           JOIN users u ON u.id = cp.supplier_company_id
           WHERE cp.id = $1`;
  const params = [id];
  if (supplierId) { q += " AND cp.supplier_company_id = $2"; params.push(supplierId); }
  const { rows } = await pool.query(q, params);
  return rows[0] || null;
}

/* ── demand_requests ──────────────────────────────────────── */

export async function createDemandRequest(pool, requesterId, plan, payload) {
  const useSla = plan === PLAN.PLUS || plan === PLAN.PRO;
  const urgency = (payload.urgency || "normal").toLowerCase();
  const slaMinutes = useSla
    ? (payload.sla_minutes ?? (urgency === "notdienst" ? 30 : 120))
    : null;
  const now = new Date();
  const slaDueAt = useSla && slaMinutes ? new Date(now.getTime() + slaMinutes * 60 * 1000) : null;

  const { rows } = await pool.query(
    `INSERT INTO demand_requests
     (requester_company_id, title, role, skill_tags, headcount, start_date, end_date,
      location_city, location_postal, location_lat, location_lng, radius_km,
      shifts, requirements, urgency, budget_min, budget_max,
      sla_started_at, sla_minutes, sla_due_at, sla_status,
      required_total_count, remaining_open_count, currently_committed_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     RETURNING *`,
    [
      requesterId,
      payload.title || "",
      payload.role || "",
      payload.skill_tags || [],
      payload.headcount ?? 1,
      payload.start_date,
      payload.end_date || null,
      payload.location_city || "",
      payload.location_postal || null,
      payload.location_lat ?? null,
      payload.location_lng ?? null,
      payload.radius_km ?? 25,
      payload.shifts ? JSON.stringify(payload.shifts) : null,
      payload.requirements ? JSON.stringify(payload.requirements) : null,
      urgency,
      payload.budget_min ?? null,
      payload.budget_max ?? null,
      useSla ? now : null,
      slaMinutes,
      slaDueAt,
      useSla ? "RUNNING" : null,
      payload.headcount ?? 1,
      payload.headcount ?? 1,
      0
    ]
  );
  return rows[0];
}

export async function getDemandById(pool, id) {
  const { rows } = await pool.query(
    `SELECT dr.*, u.company_name AS requester_company_name,
            EXISTS (
              SELECT 1
              FROM offers o_origin
              WHERE o_origin.demand_request_id = dr.id
                AND o_origin.capacity_post_id IS NOT NULL
            ) AS is_capacity_origin
     FROM demand_requests dr
     JOIN users u ON u.id = dr.requester_company_id
     WHERE dr.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function getDemandCommercialStates(pool, demandRequestIds = []) {
  const uniqueIds = [...new Set((demandRequestIds || []).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { rows } = await pool.query(
    `SELECT
       dr.id AS demand_request_id,
       GREATEST(COALESCE(dr.required_total_count, dr.headcount, 1), 1)::int AS required_total_count,
       COALESCE(SUM(
         CASE
           WHEN o.status = 'accepted'
             AND COALESCE(o.agreement_status, 'none') NOT IN ('cancelled', 'expired')
           THEN GREATEST(COALESCE(o.offered_quantity, dr.headcount, 0), 0)
           ELSE 0
         END
       ), 0)::int AS committed_headcount,
       COUNT(DISTINCT o.id) FILTER (
         WHERE o.status = 'accepted'
           AND COALESCE(o.agreement_status, 'none') NOT IN ('cancelled', 'expired')
       )::int AS active_offer_count,
       COALESCE(BOOL_OR(o.capacity_post_id IS NOT NULL), FALSE) AS is_capacity_origin
     FROM demand_requests dr
     LEFT JOIN offers o ON o.demand_request_id = dr.id
     WHERE dr.id = ANY($1)
     GROUP BY dr.id, GREATEST(COALESCE(dr.required_total_count, dr.headcount, 1), 1)`,
    [uniqueIds]
  );

  const stateMap = new Map();
  for (const row of rows) {
    stateMap.set(row.demand_request_id, {
      required_total_count: toCommercialCount(row.required_total_count, 1),
      committed_headcount: toCommercialCount(row.committed_headcount, 0),
      active_offer_count: toCommercialCount(row.active_offer_count, 0),
      is_capacity_origin: row.is_capacity_origin === true
    });
  }
  return stateMap;
}

export async function getDemandCommercialState(pool, demandRequestId) {
  const { rows } = await pool.query(
    `SELECT id, headcount, required_total_count, currently_committed_count, remaining_open_count
     FROM demand_requests
     WHERE id = $1`,
    [demandRequestId]
  );
  const demand = rows[0];
  if (!demand) {
    return EMPTY_DEMAND_COMMERCIAL_STATE;
  }
  const stateMap = await getDemandCommercialStates(pool, [demandRequestId]);
  return buildDemandCommercialState(demand, stateMap.get(demandRequestId));
}

export async function syncDemandCommercialState(pool, demandRequestId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM demand_requests
     WHERE id = $1
     FOR UPDATE`,
    [demandRequestId]
  );
  const demand = rows[0];
  if (!demand) return null;

  const commercialState = buildDemandCommercialState(
    demand,
    await getDemandCommercialState(pool, demandRequestId)
  );

  if (!["open", "partially_covered", "fulfilled"].includes(demand.status)) {
    return { ...demand, ...commercialState };
  }

  const nextStatus = commercialState.commercial_status;
  const hasChanged =
    demand.status !== nextStatus ||
    toCommercialCount(demand.currently_committed_count, 0) !== commercialState.committed_headcount ||
    toCommercialCount(demand.remaining_open_count, 0) !== commercialState.remaining_open_count ||
    Math.max(1, toCommercialCount(demand.required_total_count ?? demand.headcount, 1)) !== commercialState.required_total_count;

  if (!hasChanged) {
    return { ...demand, ...commercialState };
  }

  const { rows: updatedRows } = await pool.query(
    `UPDATE demand_requests
     SET status = $2,
         required_total_count = $3,
         currently_committed_count = $4,
         remaining_open_count = $5,
         fulfilled_at = CASE
           WHEN $2 = 'fulfilled' THEN COALESCE(fulfilled_at, NOW())
           ELSE fulfilled_at
         END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      demandRequestId,
      nextStatus,
      commercialState.required_total_count,
      commercialState.committed_headcount,
      commercialState.remaining_open_count
    ]
  );
  const updatedDemand = updatedRows[0] || demand;
  return { ...updatedDemand, ...buildDemandCommercialState(updatedDemand, commercialState) };
}

export async function listDemandRequests(pool, opts = {}) {
  let q = `
    SELECT dr.*, u.company_name AS requester_company_name,
           EXISTS (
             SELECT 1
             FROM offers o_origin
             WHERE o_origin.demand_request_id = dr.id
               AND o_origin.capacity_post_id IS NOT NULL
           ) AS is_capacity_origin
    FROM demand_requests dr
    JOIN users u ON u.id = dr.requester_company_id
    WHERE 1=1
  `;
  const params = [];
  let i = 1;
  if (opts.requester_company_id) { q += ` AND dr.requester_company_id = $${i}`; params.push(opts.requester_company_id); i++; }
  if (opts.status) { q += ` AND dr.status = $${i}`; params.push(opts.status); i++; }
  if (opts.commercially_open_only) {
    q += ` AND dr.status IN ('open','partially_covered')
           AND COALESCE(
             dr.remaining_open_count,
             GREATEST(COALESCE(dr.required_total_count, dr.headcount, 1) - COALESCE(dr.currently_committed_count, 0), 0)
           ) > 0`;
  }
  if (opts.exclude_capacity_origin) {
    q += ` AND NOT EXISTS (
             SELECT 1
             FROM offers o_origin
             WHERE o_origin.demand_request_id = dr.id
               AND o_origin.capacity_post_id IS NOT NULL
           )`;
  }
  q += ` ORDER BY dr.created_at DESC LIMIT $${i}`;
  params.push(opts.limit ?? 100);
  const { rows } = await pool.query(q, params);
  return rows;
}

/* ── demand_sla_events (idempotent first-* updates) ─────────── */

export async function writeDemandSlaEvent(pool, demandId, eventType, payload = {}) {
  await pool.query(
    "INSERT INTO demand_sla_events (demand_request_id, event_type, payload) VALUES ($1,$2,$3)",
    [demandId, eventType, typeof payload === "object" ? JSON.stringify(payload) : payload]
  );
}

export async function recordDemandSlaStarted(pool, demandId) {
  await writeDemandSlaEvent(pool, demandId, "SLA_STARTED", { at: new Date().toISOString() });
}

/** Idempotent: set first_matching_attempt_at once, then insert MATCHING_ATTEMPT */
export async function recordDemandMatchingAttempt(pool, demandId, payload = {}) {
  const r = await pool.query(
    `UPDATE demand_requests
     SET first_matching_attempt_at = COALESCE(first_matching_attempt_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND first_matching_attempt_at IS NULL
     RETURNING id`,
    [demandId]
  );
  if (r.rowCount === 0) return { recorded: false };
  await writeDemandSlaEvent(pool, demandId, "MATCHING_ATTEMPT", payload);
  return { recorded: true };
}

/** Idempotent: set first_notification_sent_at once, then NOTIFICATION_SENT */
export async function recordDemandNotificationSent(pool, demandId, payload = {}) {
  const r = await pool.query(
    `UPDATE demand_requests
     SET first_notification_sent_at = COALESCE(first_notification_sent_at, NOW()), updated_at = NOW()
     WHERE id = $1 AND first_notification_sent_at IS NULL
     RETURNING id`,
    [demandId]
  );
  if (r.rowCount === 0) return { recorded: false };
  await writeDemandSlaEvent(pool, demandId, "NOTIFICATION_SENT", payload);
  return { recorded: true };
}

/** RUNNING -> MET (terminal) */
export async function markDemandSlaMet(pool, demandId) {
  const r = await pool.query(
    `UPDATE demand_requests
     SET sla_status = 'MET', sla_met_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND sla_status = 'RUNNING'
     RETURNING id`,
    [demandId]
  );
  if (r.rowCount === 0) return { updated: false };
  await writeDemandSlaEvent(pool, demandId, "SLA_MET", { at: new Date().toISOString() });
  return { updated: true };
}

export async function getDemandSlaEvents(pool, demandId) {
  const { rows } = await pool.query(
    "SELECT id, event_type, payload, created_at FROM demand_sla_events WHERE demand_request_id = $1 ORDER BY created_at ASC",
    [demandId]
  );
  return rows;
}

/* ── matching ───────────────────────────────────────────────── */

export async function runInitialMatching(pool, demandRow, verifiedSupplierIds = new Set()) {
  const { rows: caps } = await pool.query(
    `SELECT cp.*, ${CAPACITY_COMMERCIAL_SELECT}
     FROM capacity_posts cp
     ${CAPACITY_COMMERCIAL_JOIN}
     WHERE cp.status = 'active'
       AND ${CAPACITY_REMAINING_HEADCOUNT_SQL} > 0
       AND availability_from <= $1
       AND (availability_to IS NULL OR availability_to >= $2)`,
    [demandRow.end_date || demandRow.start_date, demandRow.start_date]
  );
  const scored = [];
  for (const cap of caps) {
    const verified = verifiedSupplierIds.has(cap.supplier_company_id);
    const score = scoreMatch(demandRow, cap, verified);
    if (score <= 0) continue;
    scored.push({ cap, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 25);

  for (const m of top) {
    await pool.query(
      `INSERT INTO matches (demand_request_id, capacity_post_id, match_score, reasons, status)
       VALUES ($1,$2,$3,$4,'suggested')
       ON CONFLICT (demand_request_id, capacity_post_id)
       DO UPDATE SET match_score = EXCLUDED.match_score, reasons = EXCLUDED.reasons, updated_at = NOW()`,
      [
        demandRow.id,
        m.cap.id,
        m.score,
        JSON.stringify([{ type: "score", value: m.score }])
      ]
    );
  }
  return { candidateCount: caps.length, matchCount: top.length, matches: top };
}

export async function getDemandMatches(pool, demandId) {
  const { rows } = await pool.query(
    `SELECT m.*, cp.title AS capacity_title, cp.role AS capacity_role, cp.location_city AS capacity_city,
            u.company_name AS supplier_company_name, u.email AS supplier_email
     FROM matches m
     JOIN capacity_posts cp ON cp.id = m.capacity_post_id
     JOIN users u ON u.id = cp.supplier_company_id
     WHERE m.demand_request_id = $1
     ORDER BY m.match_score DESC NULLS LAST`,
    [demandId]
  );
  return rows;
}

/** Mark matches as notified (bulk) */
export async function markMatchesNotified(pool, demandId, capacityPostIds) {
  if (!capacityPostIds?.length) return;
  await pool.query(
    `UPDATE matches SET status = 'notified', updated_at = NOW()
     WHERE demand_request_id = $1 AND capacity_post_id = ANY($2::uuid[])`,
    [demandId, capacityPostIds]
  );
}

/* ── cron: demand SLA scan (RUNNING -> BREACHED) ────────────── */

export async function demandSlaScan(pool, batchSize) {
  const size = Math.min(500, batchSize || 100);
  // Set-based statt N+1 (Spiegel von searchSlaScan): ein einziges geschütztes UPDATE
  // flippt den Batch und liefert nur die tatsächlich gewechselten Zeilen. Der
  // sla_status='RUNNING'-Guard steht bewusst AUF dem äußeren UPDATE, damit bei
  // überlappenden Cron-Läufen bereits geflippte Zeilen nicht erneut getroffen werden
  // → keine doppelten SLA_BREACHED-Events.
  const { rows: breachedRows } = await pool.query(
    `UPDATE demand_requests
     SET sla_status = 'BREACHED', sla_breached_at = NOW(), updated_at = NOW()
     WHERE sla_status = 'RUNNING'
       AND id IN (
         SELECT id FROM demand_requests
         WHERE status = 'open' AND sla_status = 'RUNNING' AND sla_due_at < NOW()
         ORDER BY sla_due_at ASC
         LIMIT $1
       )
     RETURNING id`,
    [size]
  );
  if (breachedRows.length > 0) {
    const ids = breachedRows.map((r) => r.id);
    await pool.query(
      `INSERT INTO demand_sla_events (demand_request_id, event_type, payload)
       SELECT id, 'SLA_BREACHED', $2::jsonb FROM UNNEST($1::uuid[]) AS id`,
      [ids, JSON.stringify({ at: new Date().toISOString() })]
    );
  }
  return { breached: breachedRows.length };
}

/* ── cron: notdienst escalation (Stage 2/3) ──────────────────── */

const NOTDIENST_STAGE2_MIN = 10;
const NOTDIENST_STAGE3_MIN = 20;

export async function notdienstEscalationDemands(pool, batchSize) {
  const size = Math.min(100, batchSize || 50);
  const now = new Date();
  const t2 = new Date(now.getTime() - NOTDIENST_STAGE2_MIN * 60 * 1000);
  const t3 = new Date(now.getTime() - NOTDIENST_STAGE3_MIN * 60 * 1000);

  const { rows } = await pool.query(
    `SELECT id, created_at, escalation_level FROM demand_requests
     WHERE status = 'open' AND sla_status = 'RUNNING' AND urgency = 'notdienst'
     ORDER BY created_at ASC
     LIMIT $1`,
    [size]
  );
  let escalated = 0;
  for (const row of rows) {
    const created = new Date(row.created_at);
    const lvl = row.escalation_level ?? 0;
    if (lvl >= 2) continue;
    if (lvl === 1 && created < t3) {
      const r = await pool.query(
        `UPDATE demand_requests SET escalation_level = 2, updated_at = NOW() WHERE id = $1 AND escalation_level = 1 RETURNING id`,
        [row.id]
      );
      if (r.rowCount > 0) {
        await writeDemandSlaEvent(pool, row.id, "ESCALATION_STAGE", { stage: 3, at: now.toISOString() });
        escalated++;
      }
    } else if (lvl === 0 && created < t2) {
      const r = await pool.query(
        `UPDATE demand_requests SET escalation_level = LEAST(COALESCE(escalation_level,0) + 1, 2), updated_at = NOW() WHERE id = $1 RETURNING id`,
        [row.id]
      );
      if (r.rowCount > 0) {
        await writeDemandSlaEvent(pool, row.id, "ESCALATION_STAGE", { stage: 2, at: now.toISOString() });
        escalated++;
      }
    }
  }
  return { escalated };
}

/* ── offers ──────────────────────────────────────────────────── */

export async function createOffer(pool, supplierCompanyId, demandRequestId, payload) {
  const { rows } = await pool.query(
    `INSERT INTO offers
     (demand_request_id, supplier_company_id, price_type, price_value, price_min, price_max,
      notes, attachments, terms, status,
      offered_quantity, offered_hourly_rate, start_confirmed, end_date,
      surcharges, min_hours_per_shift, billing_unit,
      validity_until, replacement_sla_minutes, response_time_minutes,
      contact_name, contact_phone, compliance_check, cancellation_policy)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING *`,
    [
      demandRequestId,
      supplierCompanyId,
      payload.price_type || null,
      payload.price_value ?? null,
      payload.price_min ?? null,
      payload.price_max ?? null,
      payload.notes || null,
      payload.attachments ? JSON.stringify(payload.attachments) : null,
      payload.terms || null,
      payload.offered_quantity ?? null,
      payload.offered_hourly_rate ?? null,
      payload.start_confirmed || null,
      payload.end_date || null,
      payload.surcharges ? JSON.stringify(payload.surcharges) : null,
      payload.min_hours_per_shift ?? null,
      payload.billing_unit || null,
      payload.validity_until || null,
      payload.replacement_sla_minutes ?? null,
      payload.response_time_minutes ?? null,
      payload.contact_name || null,
      payload.contact_phone || null,
      payload.compliance_check ? JSON.stringify(payload.compliance_check) : null,
      payload.cancellation_policy ? JSON.stringify(payload.cancellation_policy) : null
    ]
  );
  return rows[0];
}

export async function listOffersForDemand(pool, demandRequestId) {
  const { rows } = await pool.query(
    `SELECT o.*, u.company_name AS supplier_company_name,
            dr.requester_company_id,
            cp.title AS capacity_title,
            cp.role AS capacity_role,
            cp.location_city AS capacity_location,
            cp.status AS capacity_status
     FROM offers o
     JOIN users u ON u.id = o.supplier_company_id
     JOIN demand_requests dr ON dr.id = o.demand_request_id
     LEFT JOIN capacity_posts cp ON cp.id = o.capacity_post_id
     WHERE o.demand_request_id = $1
     ORDER BY o.created_at DESC`,
    [demandRequestId]
  );
  return rows;
}

export async function getOfferById(pool, offerId, opts = {}) {
  const forUpdate = opts.forUpdate === true;
  const { rows } = await pool.query(
    `SELECT o.*, u.company_name AS supplier_company_name,
            dr.requester_company_id, dr.title AS demand_title, dr.headcount AS demand_headcount,
            cp.title AS capacity_title,
            cp.role AS capacity_role,
            cp.location_city AS capacity_location,
            cp.status AS capacity_status,
            cp.headcount AS capacity_headcount
     FROM offers o
     JOIN users u ON u.id = o.supplier_company_id
     JOIN demand_requests dr ON dr.id = o.demand_request_id
     LEFT JOIN capacity_posts cp ON cp.id = o.capacity_post_id
     WHERE o.id = $1${forUpdate ? " FOR UPDATE OF o" : ""}`,
    [offerId]
  );
  return rows[0] || null;
}

/**
 * Perspektivische Statuslabels: je nach Rolle sieht der Nutzer einen anderen Text.
 * Schlüssel: `status.viewer_mode` (sender = Supplier, receiver = Requester).
 */
export const OFFER_VIEWER_LABELS = {
  "draft.sender":      "Entwurf \u2013 noch nicht gesendet",
  "draft.receiver":    "Entwurf",
  "sent.sender":       "Angebot gesendet \u2013 wartet auf R\u00fcckmeldung",
  "sent.receiver":     "Neues Angebot erhalten \u2013 Entscheidung ausstehend",
  "countered.sender":  "Gegenangebot erhalten \u2013 Antwort erforderlich",
  "countered.receiver": "Gegenangebot gesendet \u2013 wartet auf Entscheidung",
  "accepted.sender":   "Angebot angenommen",
  "accepted.receiver": "Angebot angenommen",
  "rejected.sender":   "Angebot abgelehnt",
  "rejected.receiver": "Angebot abgelehnt",
  "withdrawn.sender":  "Angebot zur\u00fcckgezogen",
  "withdrawn.receiver": "Angebot wurde zur\u00fcckgezogen"
};

/**
 * Counterparty-first view model for offers.
 * Encodes "who is next" and the actions for the CURRENT viewer.
 *
 * @param {object} offer - offer row including requester_company_id + supplier_company_id
 * @param {string} viewerUserId
 * @returns {{ actor_required: ('requester'|'supplier'|'none'), viewer_mode: ('sender'|'receiver'), viewer_state: string, viewer_label: string, actions: string[] }}
 */
export function computeOfferNextAction(offer, viewerUserId) {
  // PFLICHTFELDER der uebergebenen Zeile: `supplier_company_id` (auf `offers`) und
  // `requester_company_id` (auf `demand_requests` — muss mitselektiert werden).
  //
  // Fehlt das zweite, ist `undefined === viewerUserId` immer falsch: der Besteller
  // wird nicht als Besteller erkannt, sein Postfach meldet "wartet auf die
  // Gegenseite" und die Aktionsliste bleibt leer. Genau das passierte in
  // `received-offers` und `my-offers`, weil beide Queries nur `o.*` holten. Der
  // Fehler war unsichtbar — eine plausible, aber falsche Antwort.
  //
  // `undefined` heisst "Spalte nicht selektiert" (Programmierfehler), `null`
  // hiesse "kein Besteller hinterlegt" (Datenlage). Nur der erste Fall wird
  // gemeldet, und nur ausserhalb der Produktion — laut genug fuer Entwicklung und
  // Tests, ohne Lograuschen im Betrieb.
  if (offer && offer.requester_company_id === undefined && process.env.NODE_ENV !== "production") {
    console.warn(
      "[marketplace] computeOfferNextAction: 'requester_company_id' fehlt in der Zeile — " +
      "die Query muss d.requester_company_id mitselektieren, sonst ist die Besteller-Sicht falsch."
    );
  }

  const viewerIsSupplier = offer?.supplier_company_id === viewerUserId;
  const viewerIsRequester = offer?.requester_company_id === viewerUserId;
  const viewerMode = viewerIsSupplier ? "sender" : (viewerIsRequester ? "receiver" : "receiver");

  const status = String(offer?.status || "draft");
  const actorRequiredByStatus = {
    draft: "supplier",
    sent: "requester",
    countered: "supplier",
    accepted: "none",
    rejected: "none",
    withdrawn: "none"
  };
  const actor_required = actorRequiredByStatus[status] || "none";

  const isMyTurn = (actor_required === "supplier" && viewerIsSupplier) || (actor_required === "requester" && viewerIsRequester);
  const actions = [];

  if (status === "draft" && viewerIsSupplier) actions.push("send", "withdraw");
  if (status === "sent" && viewerIsRequester) actions.push("accept", "reject", "counter");
  if (status === "sent" && viewerIsSupplier) actions.push("withdraw");
  if (status === "countered" && viewerIsSupplier) actions.push("send", "withdraw");
  if (status === "countered" && viewerIsRequester) actions.push("wait");

  if (status === "accepted") actions.push("view_followup");
  if (status === "rejected" || status === "withdrawn") actions.push("view");

  let viewer_state = status;
  if (isMyTurn) viewer_state = "action_required";
  else if (actor_required !== "none") viewer_state = "waiting_on_counterparty";
  else viewer_state = "closed";

  const viewer_label = OFFER_VIEWER_LABELS[`${status}.${viewerMode}`] || status;

  return { actor_required, viewer_mode: viewerMode, viewer_state, viewer_label, actions };
}

/**
 * Status transitions: draft->sent (supplier), sent->accepted|rejected|countered (requester).
 * Uses stateMachine.assertTransition() for consistent guard logic.
 * On accept: demand status is resynced from canonical committed quantity.
 */
export async function updateOfferStatus(pool, offerId, newStatus, userId) {
  return await withTransaction(pool, async (client) => {
    const offer = await getOfferById(client, offerId, { forUpdate: true });
    if (!offer) return { error: "NOT_FOUND" };

    // Idempotency: if already in the requested terminal state, return current state.
    if (offer.status === newStatus) {
      return { offer };
    }

    // Validate transition via central state machine
    try {
      assertTransition("OFFER", offer.status, newStatus);
    } catch (e) {
      if (e instanceof TransitionError) {
        return { error: "INVALID_TRANSITION", current: offer.status, requested: newStatus };
      }
      throw e;
    }

    // Actor guards: who is allowed to trigger this transition?
    if (newStatus === "sent" || newStatus === "withdrawn") {
      if (offer.supplier_company_id !== userId) return { error: "FORBIDDEN" };
    }
    if (["accepted", "rejected", "countered"].includes(newStatus)) {
      if (offer.requester_company_id !== userId) return { error: "FORBIDDEN" };
    }

    if (newStatus === "accepted" && offer.capacity_post_id) {
      await client.query(
        "SELECT id FROM capacity_posts WHERE id = $1 FOR UPDATE",
        [offer.capacity_post_id]
      );
      const requestedHeadcount = Math.max(1, Number(offer.offered_quantity ?? offer.demand_headcount ?? 1) || 1);
      const capacityState = await capacityExchangeService.getCapacityCommercialState(client, offer.capacity_post_id);
      if (capacityState.remaining_headcount < requestedHeadcount) {
        return {
          error: "CAPACITY_UNAVAILABLE",
          requested_headcount: requestedHeadcount,
          remaining_headcount: capacityState.remaining_headcount
        };
      }
    }

    const { rows } = await client.query(
      `UPDATE offers SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3 RETURNING *`,
      [newStatus, offerId, offer.status]
    );

    // Concurrent modification guard: if no rows updated, status changed between read and write.
    if (!rows.length) {
      const refreshed = await getOfferById(client, offerId);
      return refreshed?.status === newStatus
        ? { offer: refreshed }
        : { error: "INVALID_TRANSITION", current: refreshed?.status, requested: newStatus };
    }

    // On accept: commercial lane is reserved, operational staffing still follows afterwards
    if (newStatus === "accepted") {
      const syncedDemand = await syncDemandCommercialState(client, offer.demand_request_id);
      if (offer.capacity_post_id) {
        await capacityExchangeService.syncCapacityCommercialState(client, offer.capacity_post_id);
      }
      return { offer: rows[0], demand: syncedDemand };
    }

    return { offer: rows[0] };
  });
}

/** Accept offer: requester accepts, demand fulfilled, audit log */
export function acceptOffer(pool, offerId, userId) {
  return updateOfferStatus(pool, offerId, "accepted", userId);
}

/** Counter offer: requester sends back with notes */
export async function counterOffer(pool, offerId, userId, payload) {
  const offer = await getOfferById(pool, offerId);
  if (!offer) return { error: "NOT_FOUND" };
  if (offer.requester_company_id !== userId) return { error: "FORBIDDEN" };
  if (offer.status !== "sent") return { error: "INVALID_TRANSITION", current: offer.status, requested: "countered" };
  const { rows } = await pool.query(
    `UPDATE offers SET status = 'countered', notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [offerId, payload?.notes || null]
  );
  return { offer: rows[0] };
}

/** Withdraw offer: supplier pulls back */
export async function withdrawOffer(pool, offerId, userId) {
  const offer = await getOfferById(pool, offerId);
  if (!offer) return { error: "NOT_FOUND" };
  if (offer.supplier_company_id !== userId) return { error: "FORBIDDEN" };
  if (!["draft", "sent", "countered"].includes(offer.status)) {
    return { error: "INVALID_TRANSITION", current: offer.status, requested: "withdrawn" };
  }
  const { rows } = await pool.query(
    `UPDATE offers SET status = 'withdrawn', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [offerId]
  );
  return { offer: rows[0] };
}
