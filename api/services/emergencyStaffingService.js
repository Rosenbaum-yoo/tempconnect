/**
 * Emergency Staffing Service — Premium Notdienst-Orchestrierung.
 *
 * Duenner Orchestrierungs-Layer, der bestehende Services koordiniert:
 *   - marketplaceService: demand_request CRUD, SLA, Matching
 *   - matchAlertService: priorisierte Alerts mit forced Email
 *   - instantMatchService: 10-Faktor Premium-Matching
 *   - notificationMatrix: In-App-Notifications
 *
 * Kein Duplikat-Code — alles delegiert an vorhandene Infrastruktur.
 */

import { createServiceLogger } from "../utils/logger.js";

const logger = createServiceLogger("emergencyStaffing");

/* ═══════════════════════════════════════════════════════
   Zentrale Urgency-Konfiguration
   ═══════════════════════════════════════════════════════ */

export const URGENCY_CONFIG = {
  NORMAL:   { slaMinutes: 120, responseWindow: null,  escalation: false, forceEmail: false, label: "Normal" },
  HIGH:     { slaMinutes: 90,  responseWindow: 60,    escalation: false, forceEmail: false, label: "Hoch" },
  URGENT:   { slaMinutes: 60,  responseWindow: 30,    escalation: true,  forceEmail: true,  label: "Dringend" },
  CRITICAL: { slaMinutes: 45,  responseWindow: 20,    escalation: true,  forceEmail: true,  label: "Kritisch" },
  NOTDIENST:{ slaMinutes: 30,  responseWindow: 15,    escalation: true,  forceEmail: true,  label: "Notdienst" }
};

const EMERGENCY_LEVELS = new Set(["URGENT", "CRITICAL", "NOTDIENST"]);

/* ── Urgency-Normalisierung ──────────────────────────── */

/**
 * Normalisiert verschiedene Urgency-Werte aus dem System in ein einheitliches Level.
 * Handles: notdienst, urgent, high, critical, plus, NOTDIENST, HIGH, etc.
 */
export function classifyUrgency(raw) {
  if (!raw) return "NORMAL";
  const u = String(raw).toUpperCase().trim();
  if (u === "NOTDIENST") return "NOTDIENST";
  if (u === "CRITICAL") return "CRITICAL";
  if (u === "URGENT") return "URGENT";
  if (u === "HIGH" || u === "PLUS") return "HIGH";
  return "NORMAL";
}

/**
 * Prueft ob ein Urgency-Level als Emergency gilt.
 */
export function isEmergency(urgency) {
  return EMERGENCY_LEVELS.has(classifyUrgency(urgency));
}

/**
 * Gibt die Konfiguration fuer ein Urgency-Level zurueck.
 */
export function getUrgencyConfig(urgency) {
  const level = classifyUrgency(urgency);
  return { level, ...URGENCY_CONFIG[level] };
}
async function persistEmergencyMatches(pool, demandId, matchResults) {
  const matches = Array.isArray(matchResults?.matches) ? matchResults.matches : [];
  if (!matches.length) return [];
  const capacityPostIds = [];
  for (const m of matches) {
    const capId = m.capacity_post?.id;
    if (!capId) continue;
    capacityPostIds.push(capId);
    const reasons = Array.isArray(m.reasons) ? m.reasons : [];
    await pool.query(
      `INSERT INTO matches (demand_request_id, capacity_post_id, match_score, reasons, status)
       VALUES ($1,$2,$3,$4,'suggested')
       ON CONFLICT (demand_request_id, capacity_post_id)
       DO UPDATE SET match_score = EXCLUDED.match_score, reasons = EXCLUDED.reasons, updated_at = NOW()`,
      [demandId, capId, m.score ?? null, JSON.stringify(reasons)]
    );
  }
  return [...new Set(capacityPostIds)];
}

/* ═══════════════════════════════════════════════════════
   createEmergencyRequest
   ═══════════════════════════════════════════════════════ */

/**
 * Erstellt einen Emergency Staffing Request (demand_request mit urgency=notdienst).
 * Orchestriert: demand_request + SLA + Instant-Match + Match-Alerts.
 */
export async function createEmergencyRequest(pool, userId, plan, payload) {
  const urgencyLevel = classifyUrgency(payload.urgency || "notdienst");
  const cfg = URGENCY_CONFIG[urgencyLevel] || URGENCY_CONFIG.NOTDIENST;

  // 1. Demand-Request ueber marketplaceService erstellen
  const { createDemandRequest, recordDemandSlaStarted, recordDemandMatchingAttempt,
          recordDemandNotificationSent, markDemandSlaMet, markMatchesNotified } = await import("./marketplaceService.js");

  const demandPayload = {
    ...payload,
    urgency: urgencyLevel === "NOTDIENST" ? "notdienst" : urgencyLevel.toLowerCase(),
    sla_minutes: payload.sla_minutes || cfg.slaMinutes
  };

  const demand = await createDemandRequest(pool, userId, plan, demandPayload);

  // Response-Window setzen
  if (cfg.responseWindow) {
    await pool.query(
      `UPDATE demand_requests SET response_window_minutes = $1 WHERE id = $2`,
      [cfg.responseWindow, demand.id]
    );
  }

  // 2. SLA starten
  if (demand.sla_status === "RUNNING") {
    await recordDemandSlaStarted(pool, demand.id);
  }

  // 3. Instant-Match ausfuehren (Premium 10-Faktor)
  let matchResults = { matches: [], total: 0 };
  let matchedCapacityIds = [];
  try {
    const { instantMatchFromParams } = await import("./instantMatchService.js");
    const demandParams = {
      role: demand.role,
      skill_tags: demand.skill_tags || [],
      latitude: demand.location_lat,
      longitude: demand.location_lng,
      location_city: demand.location_city,
      radius_km: demand.radius_km,
      start_date: demand.start_date,
      end_date: demand.end_date
    };
    matchResults = await instantMatchFromParams(pool, demandParams, null, {
      topN: 25, minScore: 10,
      budgetPerHour: demand.budget_max,
      workersNeeded: demand.headcount,
      urgency: urgencyLevel
    });
    matchedCapacityIds = await persistEmergencyMatches(pool, demand.id, matchResults);
    await recordDemandMatchingAttempt(pool, demand.id, {
      candidateCount: matchResults.total_candidates || 0,
      matchCount: matchResults.total
    });
  } catch (err) {
    logger.warn({ err: err.message, demandId: demand.id }, "Emergency instant match failed (non-blocking)");
  }

  // 4. Match-Alerts an passende Supplier senden
  let alerted = 0;
  try {
    // Wenn es Matches gibt, alert die zugehoerigen Supplier
    if (matchResults.matches?.length > 0) {
      const supplierIds = [...new Set(
        matchResults.matches.map(m => m.capacity_post?.supplier_company_id).filter(Boolean)
      )];
      // In-App + Emergency E-Mail via dispatch
      const { dispatch } = await import("./notificationMatrix.js");
      if (supplierIds.length > 0) {
        await dispatch(pool, "emergency.request_created", {
          recipientUserIds: supplierIds,
          entityType: "demand_request",
          entityId: demand.id,
          message: `🔴 NOTDIENST: "${demand.title}" – ${demand.role}, ${demand.location_city}. Sofortige Reaktion erforderlich.`,
          emailQueue: true
        });
        alerted = supplierIds.length;
        await recordDemandNotificationSent(pool, demand.id, { notifiedCount: alerted });
        if (matchedCapacityIds.length > 0) {
          await markMatchesNotified(pool, demand.id, matchedCapacityIds);
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message, demandId: demand.id }, "Emergency alerts failed (non-blocking)");
  }

  // 5. SLA pruefen
  if (demand.sla_due_at && new Date() <= new Date(demand.sla_due_at)) {
    try { await markDemandSlaMet(pool, demand.id); } catch { /* non-critical */ }
  }

  logger.info({
    demandId: demand.id, urgency: urgencyLevel,
    matchCount: matchResults.total, alerted
  }, "Emergency request created");

  return {
    demand,
    urgency_level: urgencyLevel,
    urgency_config: cfg,
    match_results: {
      total: matchResults.total,
      quality_summary: matchResults.quality_summary || {},
      top_matches: (matchResults.matches || []).slice(0, 5).map(m => ({
        capacity_post_id: m.capacity_post?.id,
        score: m.score,
        quality_label: m.quality_label,
        supplier_name: m.supplier_info?.name
      }))
    },
    alerted
  };
}

/* ═══════════════════════════════════════════════════════
   getActiveEmergencies
   ═══════════════════════════════════════════════════════ */

export async function getActiveEmergencies(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT dr.*, u.company_name AS requester_company_name,
            EXTRACT(EPOCH FROM (NOW() - dr.created_at)) / 60 AS age_minutes,
            CASE WHEN dr.sla_due_at IS NOT NULL AND dr.sla_due_at < NOW() THEN TRUE ELSE FALSE END AS sla_overdue
     FROM demand_requests dr
     JOIN users u ON u.id = dr.requester_company_id
     WHERE dr.status = 'open'
       AND dr.urgency IN ('notdienst', 'urgent', 'critical')
       AND ($1::text IS NULL OR dr.requester_company_id = $1)
     ORDER BY
       CASE dr.urgency
         WHEN 'notdienst' THEN 0
         WHEN 'critical' THEN 1
         WHEN 'urgent' THEN 2
         ELSE 3
       END,
       dr.created_at ASC`,
    [orgId || null]
  );
  return rows.map(r => ({
    ...r,
    urgency_level: classifyUrgency(r.urgency),
    urgency_label: getUrgencyConfig(r.urgency).label,
    age_minutes: Math.round(Number(r.age_minutes) || 0),
    sla_overdue: r.sla_overdue ?? false
  }));
}

/* ═══════════════════════════════════════════════════════
   getEmergencyDashboard — KPIs
   ═══════════════════════════════════════════════════════ */

export async function getEmergencyDashboard(pool, orgId) {
  const orgFilter = orgId ? "AND dr.requester_company_id = $1" : "";
  const params = orgId ? [orgId] : [];

  // Active emergencies count + escalation
  const { rows: activeRows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_active,
       COUNT(*) FILTER (WHERE escalation_level >= 1)::int AS escalated,
       COUNT(*) FILTER (WHERE sla_status = 'BREACHED')::int AS sla_breached,
       COUNT(*) FILTER (WHERE urgency = 'notdienst')::int AS notdienst_count,
       COUNT(*) FILTER (WHERE urgency IN ('urgent', 'critical'))::int AS urgent_count
     FROM demand_requests dr
     WHERE status = 'open'
       AND urgency IN ('notdienst', 'urgent', 'critical')
       ${orgFilter}`,
    params
  );

  // Response metrics (last 30 days)
  const { rows: metricsRows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_emergencies_30d,
       COUNT(*) FILTER (WHERE supplier_response_count > 0)::int AS responded_count,
       AVG(EXTRACT(EPOCH FROM (first_supplier_response_at - created_at)) / 60)
         FILTER (WHERE first_supplier_response_at IS NOT NULL) AS avg_response_minutes,
       COUNT(*) FILTER (WHERE sla_status = 'MET')::int AS sla_met_count,
       COUNT(*) FILTER (WHERE sla_status = 'BREACHED')::int AS sla_breached_count,
       COUNT(*) FILTER (WHERE status IN ('filled', 'closed'))::int AS filled_count
     FROM demand_requests dr
     WHERE urgency IN ('notdienst', 'urgent', 'critical')
       AND created_at > NOW() - INTERVAL '30 days'
       ${orgFilter}`,
    params
  );

  const active = activeRows[0] || {};
  const metrics = metricsRows[0] || {};
  const total30d = metrics.total_emergencies_30d || 0;

  return {
    active: {
      total: active.total_active || 0,
      notdienst: active.notdienst_count || 0,
      urgent: active.urgent_count || 0,
      escalated: active.escalated || 0,
      sla_breached: active.sla_breached || 0
    },
    metrics_30d: {
      total: total30d,
      response_rate: total30d > 0 ? Math.round((metrics.responded_count / total30d) * 100) : 0,
      avg_response_minutes: metrics.avg_response_minutes ? Math.round(Number(metrics.avg_response_minutes)) : null,
      sla_met_rate: total30d > 0 ? Math.round((metrics.sla_met_count / total30d) * 100) : 0,
      fill_rate: total30d > 0 ? Math.round((metrics.filled_count / total30d) * 100) : 0,
      sla_breach_rate: total30d > 0 ? Math.round((metrics.sla_breached_count / total30d) * 100) : 0
    }
  };
}

/* ═══════════════════════════════════════════════════════
   recordSupplierResponse
   ═══════════════════════════════════════════════════════ */

/**
 * Trackt eine Supplier-Reaktion auf einen Emergency-Request.
 * Idempotent: first_supplier_response_at wird nur einmal gesetzt.
 */
export async function recordSupplierResponse(pool, demandId, supplierId) {
  // Verify demand exists and is emergency
  const { rows } = await pool.query(
    `SELECT id, urgency, status FROM demand_requests WHERE id = $1`,
    [demandId]
  );
  if (!rows[0]) return { error: "NOT_FOUND" };
  if (!isEmergency(rows[0].urgency)) return { error: "NOT_EMERGENCY" };
  if (!["open", "partially_covered"].includes(rows[0].status)) return { error: "NOT_OPEN" };

  // Idempotent: set first response time, increment counter
  const { rows: updated } = await pool.query(
    `UPDATE demand_requests
     SET supplier_response_count = supplier_response_count + 1,
         first_supplier_response_at = COALESCE(first_supplier_response_at, NOW()),
         updated_at = NOW()
     WHERE id = $1
     RETURNING supplier_response_count, first_supplier_response_at`,
    [demandId]
  );

  // SLA event
  try {
    const { writeDemandSlaEvent } = await import("./marketplaceService.js");
    await writeDemandSlaEvent(pool, demandId, "SUPPLIER_RESPONSE", {
      supplier_id: supplierId,
      response_count: updated[0]?.supplier_response_count,
      at: new Date().toISOString()
    });
  } catch { /* non-critical */ }

  logger.info({ demandId, supplierId, count: updated[0]?.supplier_response_count }, "Emergency supplier response recorded");

  return {
    recorded: true,
    response_count: updated[0]?.supplier_response_count || 0,
    first_response_at: updated[0]?.first_supplier_response_at
  };
}

/* ═══════════════════════════════════════════════════════
   escalateEmergency
   ═══════════════════════════════════════════════════════ */

/**
 * Manuelle Eskalation eines Emergency-Requests.
 * Erhoeht escalation_level, re-triggert Alerts.
 */
export async function escalateEmergency(pool, demandId, actorId) {
  const { rows } = await pool.query(
    `SELECT id, urgency, status, escalation_level, title, role, location_city
     FROM demand_requests WHERE id = $1`,
    [demandId]
  );
  if (!rows[0]) return { error: "NOT_FOUND" };
  if (rows[0].status !== "open") return { error: "NOT_OPEN" };
  if (!isEmergency(rows[0].urgency)) return { error: "NOT_EMERGENCY" };

  const currentLevel = rows[0].escalation_level ?? 0;
  if (currentLevel >= 3) return { error: "MAX_ESCALATION_REACHED" };

  const newLevel = currentLevel + 1;
  await pool.query(
    `UPDATE demand_requests SET escalation_level = $1, updated_at = NOW() WHERE id = $2`,
    [newLevel, demandId]
  );

  // SLA event
  try {
    const { writeDemandSlaEvent } = await import("./marketplaceService.js");
    await writeDemandSlaEvent(pool, demandId, "ESCALATION_STAGE", {
      stage: newLevel,
      manual: true,
      actor_id: actorId,
      at: new Date().toISOString()
    });
  } catch { /* non-critical */ }

  // Re-trigger alerts
  try {
    const { dispatch } = await import("./notificationMatrix.js");
    const { instantMatchFromParams } = await import("./instantMatchService.js");

    const demand = rows[0];
    const matchResults = await instantMatchFromParams(pool, {
      role: demand.role,
      skill_tags: [],
      location_city: demand.location_city
    }, null, { topN: 50, minScore: 5, urgency: "CRITICAL" });

    const supplierIds = [...new Set(
      (matchResults.matches || []).map(m => m.capacity_post?.supplier_company_id).filter(Boolean)
    )];

    if (supplierIds.length > 0) {
      await dispatch(pool, "emergency.escalated", {
        recipientUserIds: supplierIds,
        entityType: "demand_request",
        entityId: demandId,
        message: `⚠️ ESKALATION Stufe ${newLevel}: "${demand.title}" – ${demand.role}, ${demand.location_city}. Dringend Kapazitaet benoetigt!`,
        emailQueue: true
      });
    }
  } catch (err) {
    logger.warn({ err: err.message, demandId }, "Escalation re-alert failed (non-blocking)");
  }

  logger.info({ demandId, newLevel, actorId }, "Emergency escalated");
  return { escalated: true, new_level: newLevel };
}

/* ═══════════════════════════════════════════════════════
   getEmergencyHistory
   ═══════════════════════════════════════════════════════ */

export async function getEmergencyHistory(pool, orgId, opts = {}) {
  const limit = Math.min(100, opts.limit || 50);
  const offset = Math.max(0, opts.offset || 0);

  const params = [orgId || null, limit, offset];
  const { rows } = await pool.query(
    `SELECT dr.*, u.company_name AS requester_company_name,
            EXTRACT(EPOCH FROM (COALESCE(first_supplier_response_at, NOW()) - dr.created_at)) / 60 AS response_minutes
     FROM demand_requests dr
     JOIN users u ON u.id = dr.requester_company_id
     WHERE dr.urgency IN ('notdienst', 'urgent', 'critical')
       AND ($1::text IS NULL OR dr.requester_company_id = $1)
     ORDER BY dr.created_at DESC
     LIMIT $2 OFFSET $3`,
    params
  );

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    role: r.role,
    location_city: r.location_city,
    urgency: r.urgency,
    urgency_level: classifyUrgency(r.urgency),
    status: r.status,
    sla_status: r.sla_status,
    escalation_level: r.escalation_level ?? 0,
    supplier_response_count: r.supplier_response_count ?? 0,
    response_minutes: r.first_supplier_response_at ? Math.round(Number(r.response_minutes) || 0) : null,
    created_at: r.created_at,
    requester_company_name: r.requester_company_name
  }));
}
