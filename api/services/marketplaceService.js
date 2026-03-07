/**
 * Two-Sided Marketplace: capacity_posts, demand_requests, matches, SLA für Demands.
 * Matching deterministisch, testbar; SLA = Prozessnachweis, kein Erfolgsversprechen.
 */

import { PLAN } from "../config/planFeatures.js";

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

/* ── capacity_posts ─────────────────────────────────────────── */

export async function createCapacityPost(pool, supplierId, payload) {
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
  return rows[0];
}

export async function listCapacityPosts(pool, opts = {}) {
  let q = `
    SELECT cp.*, u.company_name AS supplier_company_name
    FROM capacity_posts cp
    JOIN users u ON u.id = cp.supplier_company_id
    WHERE cp.is_active = TRUE
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
  let q = "SELECT cp.*, u.company_name AS supplier_company_name FROM capacity_posts cp JOIN users u ON u.id = cp.supplier_company_id WHERE cp.id = $1";
  const params = [id];
  if (supplierId) { q += " AND cp.supplier_company_id = $2"; params.push(supplierId); }
  const { rows } = await pool.query(q, params);
  return rows[0] || null;
}

/* ── demand_requests ──────────────────────────────────────── */

export async function createDemandRequest(pool, requesterId, plan, payload) {
  const useSla = plan === PLAN.PLUS || plan === PLAN.NOTDIENST;
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
      sla_started_at, sla_minutes, sla_due_at, sla_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
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
      useSla ? "RUNNING" : null
    ]
  );
  return rows[0];
}

export async function getDemandById(pool, id) {
  const { rows } = await pool.query(
    `SELECT dr.*, u.company_name AS requester_company_name
     FROM demand_requests dr
     JOIN users u ON u.id = dr.requester_company_id
     WHERE dr.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function listDemandRequests(pool, opts = {}) {
  let q = `
    SELECT dr.*, u.company_name AS requester_company_name
    FROM demand_requests dr
    JOIN users u ON u.id = dr.requester_company_id
    WHERE 1=1
  `;
  const params = [];
  let i = 1;
  if (opts.requester_company_id) { q += ` AND dr.requester_company_id = $${i}`; params.push(opts.requester_company_id); i++; }
  if (opts.status) { q += ` AND dr.status = $${i}`; params.push(opts.status); i++; }
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
    `SELECT * FROM capacity_posts
     WHERE is_active = TRUE
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
  const { rows } = await pool.query(
    `SELECT id FROM demand_requests
     WHERE status = 'open' AND sla_status = 'RUNNING' AND sla_due_at < NOW()
     ORDER BY sla_due_at ASC
     LIMIT $1`,
    [size]
  );
  let breached = 0;
  for (const row of rows) {
    const r = await pool.query(
      `UPDATE demand_requests
       SET sla_status = 'BREACHED', sla_breached_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND sla_status = 'RUNNING'
       RETURNING id`,
      [row.id]
    );
    if (r.rowCount > 0) {
      await writeDemandSlaEvent(pool, row.id, "SLA_BREACHED", { at: new Date().toISOString() });
      breached++;
    }
  }
  return { breached };
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
    `SELECT o.*, u.company_name AS supplier_company_name
     FROM offers o
     JOIN users u ON u.id = o.supplier_company_id
     WHERE o.demand_request_id = $1
     ORDER BY o.created_at DESC`,
    [demandRequestId]
  );
  return rows;
}

export async function getOfferById(pool, offerId) {
  const { rows } = await pool.query(
    `SELECT o.*, u.company_name AS supplier_company_name,
            dr.requester_company_id, dr.title AS demand_title
     FROM offers o
     JOIN users u ON u.id = o.supplier_company_id
     JOIN demand_requests dr ON dr.id = o.demand_request_id
     WHERE o.id = $1`,
    [offerId]
  );
  return rows[0] || null;
}

/**
 * Status transitions: draft->sent (supplier), sent->accepted|rejected|countered (requester).
 * On accept: demand_requests.status -> 'fulfilled', audit log.
 */
export async function updateOfferStatus(pool, offerId, newStatus, userId) {
  const offer = await getOfferById(pool, offerId);
  if (!offer) return { error: "NOT_FOUND" };

  const allowed = {
    draft: ["sent", "withdrawn"],
    sent: ["accepted", "rejected", "countered", "withdrawn"],
    countered: ["sent", "withdrawn"]
  };
  if (!allowed[offer.status]?.includes(newStatus)) {
    return { error: "INVALID_TRANSITION", current: offer.status, requested: newStatus };
  }

  // draft/sent->sent/withdrawn: only supplier
  if (newStatus === "sent" || newStatus === "withdrawn") {
    if (offer.supplier_company_id !== userId) return { error: "FORBIDDEN" };
  }
  // accepted/rejected/countered: only requester
  if (["accepted", "rejected", "countered"].includes(newStatus)) {
    if (offer.requester_company_id !== userId) return { error: "FORBIDDEN" };
  }

  const { rows } = await pool.query(
    `UPDATE offers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [newStatus, offerId]
  );

  // On accept: mark demand as fulfilled
  if (newStatus === "accepted") {
    await pool.query(
      `UPDATE demand_requests SET status = 'fulfilled', updated_at = NOW() WHERE id = $1`,
      [offer.demand_request_id]
    );
  }

  return { offer: rows[0] };
}

/** Accept offer: requester accepts, demand fulfilled, audit log */
export async function acceptOffer(pool, offerId, userId) {
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
