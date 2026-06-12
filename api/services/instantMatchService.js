/**
 * Instant Match Service — Premium Enriched Capacity Matching.
 *
 * Orchestriert den Matching-Prozess mit Batch-Pre-Fetch:
 *   1. Requisition/Demand laden
 *   2. Alle aktiven Capacity Posts laden
 *   3. Batch: Compliance, Reputation, VendorPool fuer alle Supplier vorladen
 *   4. ScoreMatch mit allen 10 Faktoren aufrufen
 *   5. Ergebnisse klassifizieren, anreichern, sortieren
 *
 * Kein N+1 — alles in 4-5 Queries vorab geladen.
 */

import { scoreMatch, classifyMatch, logMatch } from "./matchingEngine.js";
import { computeFillRateSignal, computeSlaComplianceSignal, computeRoleExpertiseSignal, computeRecencySignal, computeSmartRankScore, classifySmartRank, SMART_RANK_LABELS } from "./smartRankingService.js";
import { swallow } from "../utils/logger.js";

/* ── Batch-Loader ─────────────────────────────────────── */

async function loadComplianceMap(pool, supplierOrgIds) {
  if (!supplierOrgIds.length) return new Map();
  try {
    const { rows } = await pool.query(
      `SELECT supplier_org_id,
              COUNT(*) FILTER (WHERE status = 'GREEN')::int AS green_count,
              COUNT(*)::int AS total_count
       FROM compliance_documents
       WHERE supplier_org_id = ANY($1)
       GROUP BY supplier_org_id`,
      [supplierOrgIds]
    );
    const map = new Map();
    for (const r of rows) {
      const pct = r.total_count > 0 ? Math.round((r.green_count / r.total_count) * 100) : 0;
      map.set(r.supplier_org_id, pct);
    }
    return map;
  } catch { return new Map(); }
}

async function loadReputationMap(pool, orgIds) {
  if (!orgIds.length) return new Map();
  try {
    const { rows } = await pool.query(
      `SELECT org_id, overall_score FROM supplier_reputation WHERE org_id = ANY($1)`,
      [orgIds]
    );
    const map = new Map();
    for (const r of rows) map.set(r.org_id, Number(r.overall_score) || 0);
    return map;
  } catch { return new Map(); }
}

async function loadVendorPoolMap(pool, buyerOrgId, supplierOrgIds) {
  if (!buyerOrgId || !supplierOrgIds.length) return new Map();
  try {
    const { rows } = await pool.query(
      `SELECT supplier_org_id, tier FROM vendor_pool
       WHERE client_org_id = $1 AND supplier_org_id = ANY($2) AND status = 'active'`,
      [buyerOrgId, supplierOrgIds]
    );
    const map = new Map();
    for (const r of rows) map.set(r.supplier_org_id, r.tier);
    return map;
  } catch { return new Map(); }
}

async function loadVerifiedSet(pool, orgIds) {
  if (!orgIds.length) return new Set();
  try {
    const { rows } = await pool.query(
      `SELECT id FROM organizations WHERE id = ANY($1) AND is_verified = TRUE`,
      [orgIds]
    );
    return new Set(rows.map(r => r.id));
  } catch { return new Set(); }
}

async function loadSupplierNames(pool, orgIds) {
  if (!orgIds.length) return new Map();
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM organizations WHERE id = ANY($1)`,
      [orgIds]
    );
    const map = new Map();
    for (const r of rows) map.set(r.id, r.name);
    return map;
  } catch { return new Map(); }
}

/**
 * Batch-Loader fuer Smart Rank Signale.
 * Ein effizienter Query: supplier_metrics + supplier_reputation + role history.
 * @param {import('pg').Pool} pool
 * @param {string[]} supplierIds
 * @param {string|null} demandRole - gesuchte Rolle fuer Role-Expertise
 * @returns {Promise<Map<string, Object>>}
 */
async function loadSmartRankMap(pool, supplierIds, demandRole) {
  if (!supplierIds.length) return new Map();
  const map = new Map();
  try {
    // Metrics + Reputation in einem Query
    const { rows } = await pool.query(
      `SELECT
         o.id AS supplier_id,
         COALESCE(sm.requests_received, 0)::int AS requests_received,
         COALESCE(sm.requests_accepted, 0)::int AS requests_accepted,
         COALESCE(sm.sla_breaches, 0)::int AS sla_breaches,
         sr.timesheet_reliability_score,
         sr.activity_score
       FROM organizations o
       LEFT JOIN supplier_metrics sm ON sm.agency_id = o.id AND sm.window_days = 30
       LEFT JOIN supplier_reputation sr ON sr.supplier_id = o.id
       WHERE o.id = ANY($1)`,
      [supplierIds]
    );
    for (const r of rows) {
      map.set(r.supplier_id, {
        requests_received: r.requests_received,
        requests_accepted: r.requests_accepted,
        sla_breaches: r.sla_breaches,
        timesheet_quality: r.timesheet_reliability_score != null ? Number(r.timesheet_reliability_score) : null,
        platform_activity: r.activity_score != null ? Number(r.activity_score) : null
      });
    }
  } catch { /* graceful degradation */ }

  // Role expertise: count completed deals per supplier for the demand role
  if (demandRole) {
    try {
      const roleLower = demandRole.toLowerCase().trim();
      const { rows: roleRows } = await pool.query(
        `SELECT receiver_id AS supplier_id,
                COUNT(*) FILTER (WHERE LOWER(TRIM(role)) = $2 AND status IN ('FINALIZED','COMPLETED'))::int AS role_deals,
                COUNT(*) FILTER (WHERE status IN ('FINALIZED','COMPLETED'))::int AS total_deals
         FROM requests
         WHERE receiver_id = ANY($1)
         GROUP BY receiver_id`,
        [supplierIds, roleLower]
      );
      for (const r of roleRows) {
        const existing = map.get(r.supplier_id) || {};
        existing.role_deals = r.role_deals;
        existing.total_deals = r.total_deals;
        map.set(r.supplier_id, existing);
      }
    } catch { /* role column may not exist */ }
  }

  return map;
}

/* ── Highlights ───────────────────────────────────────── */

function buildHighlights(reasons) {
  return reasons
    .filter(r => r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map(r => r.detail);
}

/* ═══════════════════════════════════════════════════════
   instantMatchForRequisition
   ═══════════════════════════════════════════════════════ */

/**
 * Premium Instant Match fuer eine existierende Requisition.
 * Batch-Pre-Fetch + alle 10 Scoring-Faktoren + Enrichment.
 */
export async function instantMatchForRequisition(pool, requisitionId, orgId, opts = {}) {
  const topN = opts.topN || 25;
  const minScore = opts.minScore || 10;

  // 1. Requisition laden
  const { rows: reqRows } = await pool.query(
    `SELECT r.*, o.name AS org_name
     FROM requisitions r
     LEFT JOIN organizations o ON o.id = r.org_id
     WHERE r.id = $1`,
    [requisitionId]
  );
  const req = reqRows[0];
  if (!req) return { error: "REQUISITION_NOT_FOUND" };

  // Org-Boundary
  if (orgId && req.org_id !== orgId) {
    return { error: "ORG_BOUNDARY_VIOLATION" };
  }

  const demand = {
    role: req.role || req.title,
    skill_tags: req.skill_tags || [],
    latitude: req.latitude,
    longitude: req.longitude,
    location_city: req.location_city || req.location,
    radius_km: req.radius_km,
    start_date: req.start_date,
    end_date: req.end_date
  };

  return instantMatchFromParams(pool, demand, orgId, {
    ...opts,
    topN, minScore,
    budgetPerHour: req.budget_per_hour,
    workersNeeded: req.workers_needed,
    urgency: req.urgency,
    requisitionId
  });
}

/* ═══════════════════════════════════════════════════════
   instantMatchFromParams — Ad-hoc Matching
   ═══════════════════════════════════════════════════════ */

export async function instantMatchFromParams(pool, demand, orgId, opts = {}) {
  const topN = opts.topN || 25;
  const minScore = opts.minScore || 10;

  // 2. Alle aktiven Capacity Posts laden
  const { rows: caps } = await pool.query(
    `SELECT cp.*, o.name AS supplier_name
     FROM capacity_posts cp
     LEFT JOIN organizations o ON o.id = cp.supplier_company_id
     WHERE cp.is_active = TRUE`
  );

  if (caps.length === 0) return { matches: [], total: 0, demand };

  // 3. Batch Pre-Fetch: alle Supplier IDs sammeln
  const supplierIds = [...new Set(caps.map(c => c.supplier_company_id).filter(Boolean))];

  // Demand-Rolle fuer Role-Expertise-Signal
  const demandRole = demand.role || null;

  const [complianceMap, reputationMap, vendorPoolMap, verifiedSet, nameMap, smartRankDataMap] = await Promise.all([
    loadComplianceMap(pool, supplierIds),
    loadReputationMap(pool, supplierIds),
    loadVendorPoolMap(pool, orgId, supplierIds),
    loadVerifiedSet(pool, supplierIds),
    loadSupplierNames(pool, supplierIds),
    loadSmartRankMap(pool, supplierIds, demandRole)
  ]);

  // Urgency/Notdienst Boost (case-insensitive, auch legacy Werte)
  const urgencyValue = String(opts.urgency || "").toLowerCase();
  const isUrgent = ["high", "plus", "urgent", "critical", "notdienst"].includes(urgencyValue);

  // 4. Score all capacity posts
  const scored = [];
  for (const cap of caps) {
    const supplierId = cap.supplier_company_id;

    // Rate-Kompatibilität
    let rateCompatible = undefined;
    if (opts.budgetPerHour != null && cap.hourly_rate != null) {
      rateCompatible = cap.hourly_rate <= opts.budgetPerHour;
    }

    // Worker Count Match
    let workerCountMatch = undefined;
    if (opts.workersNeeded != null && cap.workers_count != null) {
      workerCountMatch = cap.workers_count >= opts.workersNeeded;
    }

    // Smart Rank berechnen
    let smartRankScore = 0;
    let smartRankLabel = null;
    const srd = smartRankDataMap.get(supplierId);
    if (srd) {
      const postAgeDays = cap.updated_at
        ? Math.max(0, (Date.now() - new Date(cap.updated_at).getTime()) / (1000 * 60 * 60 * 24))
        : 30;
      const srResult = computeSmartRankScore({
        fill_rate: computeFillRateSignal(srd.requests_accepted, srd.requests_received),
        sla_compliance: computeSlaComplianceSignal(srd.sla_breaches, srd.requests_received),
        role_expertise: computeRoleExpertiseSignal(srd.role_deals || 0, srd.total_deals || 0),
        timesheet_quality: srd.timesheet_quality,
        recency: computeRecencySignal(postAgeDays),
        platform_activity: srd.platform_activity
      });
      smartRankScore = srResult.score;
      smartRankLabel = SMART_RANK_LABELS[classifySmartRank(smartRankScore)] || null;
    }

    const { score, reasons } = scoreMatch(demand, cap, {
      supplierVerified: verifiedSet.has(supplierId),
      vendorPoolTier: vendorPoolMap.get(supplierId) || null,
      complianceScore: complianceMap.get(supplierId) || 0,
      reputationScore: reputationMap.get(supplierId) || 0,
      rateCompatible,
      urgencyBoost: isUrgent,
      workerCountMatch,
      preferredFirst: opts.preferredFirst || false,
      smartRankScore,
      smartRankLabel,
      weights: opts.weights
    });

    if (score >= minScore) {
      scored.push({
        capacity_post: cap,
        score,
        quality_label: classifyMatch(score),
        reasons,
        highlights: buildHighlights(reasons),
        supplier_info: {
          id: supplierId,
          name: cap.supplier_name || nameMap.get(supplierId) || null,
          verified: verifiedSet.has(supplierId),
          compliance_pct: complianceMap.get(supplierId) || 0,
          reputation_score: reputationMap.get(supplierId) || 0,
          vendor_pool_tier: vendorPoolMap.get(supplierId) || null
        }
      });
    }
  }

  // 5. Sort by score DESC
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, topN);

  // ML Log top matches
  for (const m of results.slice(0, 10)) {
    logMatch(pool, {
      match_type: "instant_match",
      source_id: opts.requisitionId || null,
      target_id: m.capacity_post?.id,
      score: m.score,
      reasons: m.reasons,
      outcome: "suggested",
      org_id: orgId || null
    }).catch(swallow("instantMatchService"));
  }

  return {
    matches: results,
    total: results.length,
    total_candidates: caps.length,
    demand,
    quality_summary: {
      excellent: results.filter(r => r.quality_label === "excellent").length,
      good: results.filter(r => r.quality_label === "good").length,
      fair: results.filter(r => r.quality_label === "fair").length,
      weak: results.filter(r => r.quality_label === "weak").length
    }
  };
}
