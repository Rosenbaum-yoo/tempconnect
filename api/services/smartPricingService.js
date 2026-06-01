/**
 * Smart Pricing Service — Datengestützte Preisvorschläge für TempConnect.
 *
 * 4-Stufen-Modell:
 *   1. Marktpreis   (assignments.hourly_rate_cents)       — Gewicht 50%
 *   2. Angebotspreis (offers.offered_hourly_rate)          — Gewicht 25%
 *   3. Kapazitätspreis (capacity_posts.price_min/max)      — Gewicht 15%
 *   4. Nachfragepreis (demand_requests.budget_min/max)     — Gewicht 10%
 *
 * Kein ML, kein Blackbox. Reine SQL-Aggregation + gewichtete Logik.
 * Alle Preise in Cent (ganzzahlig), Confidence anhand Datenpunkte.
 */

import { createServiceLogger } from "../utils/logger.js";

const logger = createServiceLogger("smartPricing");

/* ── Constants ─────────────────────────────────────────── */

const STAGE_WEIGHTS = {
  deals:    0.50,
  offers:   0.25,
  supply:   0.15,
  demand:   0.10
};

const URGENCY_SURCHARGE = {
  notdienst: 0.20,
  critical:  0.15,
  urgent:    0.10,
  high:      0.05,
  normal:    0
};

/** Confidence thresholds based on total sample count */
function classifyConfidence(sampleCount) {
  if (sampleCount >= 20) return 'high';
  if (sampleCount >= 5)  return 'medium';
  return 'low';
}

/* ── Stage 1: Market Rate (Assignments) ─────────────── */

/**
 * Aggregiert Stundensätze aus abgeschlossenen/aktiven Assignments.
 * Stärkstes Signal: echte, vereinbarte Rates aus laufenden Einsätzen.
 */
export async function getMarketRateStats(pool, role, region) {
  const params = [];
  const where = ["a.hourly_rate_cents IS NOT NULL", "a.hourly_rate_cents > 0"];

  if (role) {
    params.push(`%${role}%`);
    where.push(`a.worker_description ILIKE $${params.length}`);
  }
  if (region) {
    params.push(`%${region}%`);
    where.push(`(o.name ILIKE $${params.length} OR so.name ILIKE $${params.length})`);
  }

  // Only completed/active assignments from last 12 months
  where.push("a.status IN ('active','completed','extended')");
  where.push("a.created_at > NOW() - INTERVAL '12 months'");

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS sample_count,
       ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY a.hourly_rate_cents))::int AS p25,
       ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY a.hourly_rate_cents))::int AS median,
       ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY a.hourly_rate_cents))::int AS p75,
       MIN(a.hourly_rate_cents)::int AS min_rate,
       MAX(a.hourly_rate_cents)::int AS max_rate
     FROM assignments a
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN organizations so ON so.id = a.supplier_org_id
     WHERE ${where.join(' AND ')}`,
    params
  );

  const r = rows[0] || {};
  return {
    stage: 'deals',
    sample_count: r.sample_count ?? 0,
    p25: r.p25 ?? null,
    median: r.median ?? null,
    p75: r.p75 ?? null,
    min_rate: r.min_rate ?? null,
    max_rate: r.max_rate ?? null
  };
}

/* ── Stage 2: Offer Rate ───────────────────────────── */

/**
 * Aggregiert Stundensätze aus gesendeten/akzeptierten Angeboten.
 */
export async function getOfferRateStats(pool, role, region) {
  const params = [];
  const where = [
    "o.offered_hourly_rate IS NOT NULL",
    "o.offered_hourly_rate > 0",
    "o.status IN ('sent','accepted')"
  ];

  if (role) {
    params.push(`%${role}%`);
    where.push(`dr.role ILIKE $${params.length}`);
  }
  if (region) {
    params.push(`%${region}%`);
    where.push(`dr.location_city ILIKE $${params.length}`);
  }

  where.push("o.created_at > NOW() - INTERVAL '12 months'");

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS sample_count,
       ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY o.offered_hourly_rate))::int AS p25,
       ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY o.offered_hourly_rate))::int AS median,
       ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY o.offered_hourly_rate))::int AS p75,
       MIN(o.offered_hourly_rate)::int AS min_rate,
       MAX(o.offered_hourly_rate)::int AS max_rate
     FROM offers o
     JOIN demand_requests dr ON dr.id = o.demand_request_id
     WHERE ${where.join(' AND ')}`,
    params
  );

  const r = rows[0] || {};
  return {
    stage: 'offers',
    sample_count: r.sample_count ?? 0,
    p25: r.p25 ?? null,
    median: r.median ?? null,
    p75: r.p75 ?? null,
    min_rate: r.min_rate ?? null,
    max_rate: r.max_rate ?? null
  };
}

/* ── Stage 3: Supply Rate (Capacity Posts) ──────────── */

/**
 * Aggregiert Preisangaben aus aktiven Kapazitätseinträgen.
 */
export async function getSupplyRateStats(pool, role, region) {
  const params = [];
  const where = [
    "cp.is_active = TRUE",
    "(cp.price_min IS NOT NULL OR cp.price_max IS NOT NULL)"
  ];

  if (role) {
    params.push(`%${role}%`);
    where.push(`cp.role ILIKE $${params.length}`);
  }
  if (region) {
    params.push(`%${region}%`);
    where.push(`cp.location_city ILIKE $${params.length}`);
  }

  // Use COALESCE(price_max, price_min) as effective rate
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS sample_count,
       ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY COALESCE(cp.price_max, cp.price_min)))::int AS p25,
       ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY COALESCE(cp.price_max, cp.price_min)))::int AS median,
       ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY COALESCE(cp.price_max, cp.price_min)))::int AS p75,
       MIN(COALESCE(cp.price_min, cp.price_max))::int AS min_rate,
       MAX(COALESCE(cp.price_max, cp.price_min))::int AS max_rate
     FROM capacity_posts cp
     WHERE ${where.join(' AND ')}`,
    params
  );

  const r = rows[0] || {};
  return {
    stage: 'supply',
    sample_count: r.sample_count ?? 0,
    p25: r.p25 ?? null,
    median: r.median ?? null,
    p75: r.p75 ?? null,
    min_rate: r.min_rate ?? null,
    max_rate: r.max_rate ?? null
  };
}

/* ── Stage 4: Demand Budget (Demand Requests) ──────── */

/**
 * Aggregiert Budgetangaben aus offenen/erfüllten Nachfragen.
 */
export async function getDemandBudgetStats(pool, role, region) {
  const params = [];
  const where = [
    "(dr.budget_min IS NOT NULL OR dr.budget_max IS NOT NULL)",
    "dr.status IN ('open','fulfilled')"
  ];

  if (role) {
    params.push(`%${role}%`);
    where.push(`dr.role ILIKE $${params.length}`);
  }
  if (region) {
    params.push(`%${region}%`);
    where.push(`dr.location_city ILIKE $${params.length}`);
  }

  where.push("dr.created_at > NOW() - INTERVAL '12 months'");

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS sample_count,
       ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY COALESCE(dr.budget_max, dr.budget_min)))::int AS p25,
       ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY COALESCE(dr.budget_max, dr.budget_min)))::int AS median,
       ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY COALESCE(dr.budget_max, dr.budget_min)))::int AS p75,
       MIN(COALESCE(dr.budget_min, dr.budget_max))::int AS min_rate,
       MAX(COALESCE(dr.budget_max, dr.budget_min))::int AS max_rate
     FROM demand_requests dr
     WHERE ${where.join(' AND ')}`,
    params
  );

  const r = rows[0] || {};
  return {
    stage: 'demand',
    sample_count: r.sample_count ?? 0,
    p25: r.p25 ?? null,
    median: r.median ?? null,
    p75: r.p75 ?? null,
    min_rate: r.min_rate ?? null,
    max_rate: r.max_rate ?? null
  };
}

/* ── Weighted Range Computation ────────────────────── */

/**
 * Berechnet gewichtete Preisspanne aus allen Stufen.
 * Nur Stufen mit sample_count > 0 fließen ein; Gewichte werden renormalisiert.
 * @param {Array<{stage, sample_count, p25, median, p75}>} stages
 * @returns {{ suggested_min, suggested_max, suggested_mid, total_samples, stages_used }}
 */
export function computeWeightedRange(stages) {
  const active = stages.filter(s => s.sample_count > 0 && s.median != null);
  if (active.length === 0) {
    return { suggested_min: null, suggested_max: null, suggested_mid: null, total_samples: 0, stages_used: [] };
  }

  // Renormalize weights
  const totalWeight = active.reduce((sum, s) => sum + (STAGE_WEIGHTS[s.stage] || 0), 0);
  let weightedMin = 0;
  let weightedMax = 0;
  let weightedMid = 0;
  let totalSamples = 0;

  for (const s of active) {
    const w = (STAGE_WEIGHTS[s.stage] || 0) / totalWeight;
    const lo = s.p25 ?? s.median;
    const hi = s.p75 ?? s.median;
    weightedMin += lo * w;
    weightedMax += hi * w;
    weightedMid += s.median * w;
    totalSamples += s.sample_count;
  }

  return {
    suggested_min: Math.round(weightedMin),
    suggested_max: Math.round(weightedMax),
    suggested_mid: Math.round(weightedMid),
    total_samples: totalSamples,
    stages_used: active.map(s => s.stage)
  };
}

/* ── Urgency Surcharge ─────────────────────────────── */

/**
 * Wendet Dringlichkeitszuschlag auf die Preisspanne an.
 * @param {{ suggested_min, suggested_max, suggested_mid }} range
 * @param {string} urgency
 * @returns {{ suggested_min, suggested_max, suggested_mid, surcharge_pct }}
 */
export function applyUrgencySurcharge(range, urgency) {
  if (!range.suggested_min && !range.suggested_max) return { ...range, surcharge_pct: 0 };

  const key = (urgency || 'normal').toLowerCase();
  const pct = URGENCY_SURCHARGE[key] ?? 0;
  if (pct === 0) return { ...range, surcharge_pct: 0 };

  const multiplier = 1 + pct;
  return {
    suggested_min: range.suggested_min != null ? Math.round(range.suggested_min * multiplier) : null,
    suggested_max: range.suggested_max != null ? Math.round(range.suggested_max * multiplier) : null,
    suggested_mid: range.suggested_mid != null ? Math.round(range.suggested_mid * multiplier) : null,
    surcharge_pct: Math.round(pct * 100)
  };
}

/* ── Explanation Builder ───────────────────────────── */

/**
 * Erzeugt menschenlesbare DE-Erklärungen, wie der Vorschlag zustande kommt.
 */
export function buildExplanation(stages, urgency, confidence) {
  const lines = [];

  for (const s of stages) {
    if (s.sample_count === 0) continue;
    const labels = {
      deals:  'abgeschlossene Einsätze',
      offers: 'Angebote',
      supply: 'Personalangebote',
      demand: 'Nachfragen'
    };
    const label = labels[s.stage] || s.stage;
    const median = s.median != null ? `${(s.median / 100).toFixed(2)} €/h` : 'k.A.';
    lines.push(`${label}: ${s.sample_count} Datenpunkte, Median ${median}`);
  }

  if (urgency && URGENCY_SURCHARGE[(urgency || '').toLowerCase()] > 0) {
    const pct = Math.round(URGENCY_SURCHARGE[urgency.toLowerCase()] * 100);
    lines.push(`Dringlichkeitszuschlag (${urgency}): +${pct}%`);
  }

  lines.push(`Konfidenz: ${confidence}`);

  return lines;
}

/* ── Main: getSuggestion ───────────────────────────── */

/**
 * Hauptfunktion: Liefert eine datengestützte Preisempfehlung.
 *
 * @param {import('pg').Pool} pool
 * @param {{ role?: string, region?: string, skillTags?: string[], urgency?: string, context?: string }} params
 * @returns {Promise<Object>} Pricing suggestion
 */
export async function getSuggestion(pool, { role, region, _skillTags, urgency, context } = {}) {
  if (!role && !region) {
    return { error: 'FILTER_REQUIRED', message: 'Mindestens role oder region angeben.' };
  }

  // Gather all 4 stages in parallel
  const [deals, offers, supply, demand] = await Promise.all([
    getMarketRateStats(pool, role, region),
    getOfferRateStats(pool, role, region),
    getSupplyRateStats(pool, role, region),
    getDemandBudgetStats(pool, role, region)
  ]);

  const stages = [deals, offers, supply, demand];

  // Compute weighted range
  const range = computeWeightedRange(stages);

  // Apply urgency surcharge
  const adjusted = applyUrgencySurcharge(range, urgency);

  // Confidence
  const confidence = classifyConfidence(range.total_samples);

  // Explanation
  const explanation = buildExplanation(stages, urgency, confidence);

  // Format cents → EUR for display
  const toEur = (cents) => cents != null ? Math.round(cents) / 100 : null;

  logger.debug({
    role, region, urgency,
    total_samples: range.total_samples,
    confidence,
    stages_used: range.stages_used
  }, 'Pricing suggestion generated');

  return {
    suggestion: {
      min_cents: adjusted.suggested_min,
      max_cents: adjusted.suggested_max,
      mid_cents: adjusted.suggested_mid,
      min_eur: toEur(adjusted.suggested_min),
      max_eur: toEur(adjusted.suggested_max),
      mid_eur: toEur(adjusted.suggested_mid),
      currency: 'EUR',
      surcharge_pct: adjusted.surcharge_pct
    },
    confidence,
    total_data_points: range.total_samples,
    stages_used: range.stages_used,
    data_points: {
      deals:  { sample_count: deals.sample_count,  median_cents: deals.median,  p25_cents: deals.p25,  p75_cents: deals.p75 },
      offers: { sample_count: offers.sample_count, median_cents: offers.median, p25_cents: offers.p25, p75_cents: offers.p75 },
      supply: { sample_count: supply.sample_count, median_cents: supply.median, p25_cents: supply.p25, p75_cents: supply.p75 },
      demand: { sample_count: demand.sample_count, median_cents: demand.median, p25_cents: demand.p25, p75_cents: demand.p75 }
    },
    explanation,
    query: { role: role || null, region: region || null, urgency: urgency || null, context: context || null },
    disclaimer: 'Unverbindliche Preisorientierung auf Basis historischer Plattformdaten. Kein Preisversprechen.'
  };
}
