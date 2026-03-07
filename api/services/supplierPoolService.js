/**
 * Supplier Pool Distribution Service.
 * Manages stage-based distribution of requisitions through supplier pools.
 * Stage 1 → PREFERRED, Stage 2 → SECONDARY (regional), Stage 3 → OPEN platform.
 */

import * as eventTracking from "./eventTrackingService.js";

const DEFAULT_STAGES = [
  { stage_number: 1, pool_tier: 'PREFERRED', label: 'Bevorzugte Dienstleister', auto_advance_hours: 24 },
  { stage_number: 2, pool_tier: 'SECONDARY', label: 'Regionale Dienstleister', auto_advance_hours: 48 },
  { stage_number: 3, pool_tier: 'OPEN',      label: 'Offene Plattform',         auto_advance_hours: null }
];

/* ── Create Distribution Plan ─────────────────────────── */

/**
 * Create a distribution plan for a requisition.
 * @param {import('pg').Pool} pool
 * @param {string} requisitionId
 * @param {Array} [stages] - custom stages, or DEFAULT_STAGES
 * @param {string} [actorId]
 */
export async function createDistributionPlan(pool, requisitionId, stages, actorId) {
  const plan = stages && stages.length > 0 ? stages : DEFAULT_STAGES;

  const rows = [];
  for (const s of plan) {
    const { rows: inserted } = await pool.query(
      `INSERT INTO requisition_distribution_stages
       (requisition_id, stage_number, pool_tier, label, status, auto_advance_hours)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       ON CONFLICT (requisition_id, stage_number) DO UPDATE SET
         pool_tier = EXCLUDED.pool_tier, label = EXCLUDED.label,
         auto_advance_hours = EXCLUDED.auto_advance_hours
       RETURNING *`,
      [requisitionId, s.stage_number, s.pool_tier, s.label || null, s.auto_advance_hours ?? null]
    );
    rows.push(inserted[0]);
  }

  // Auto-activate stage 1
  if (rows.length > 0) {
    await pool.query(
      `UPDATE requisition_distribution_stages
       SET status = 'active', activated_at = NOW()
       WHERE requisition_id = $1 AND stage_number = 1`,
      [requisitionId]
    );
    rows[0].status = 'active';
  }

  await eventTracking.trackEvent(pool, {
    event_type: 'requisition_distributed',
    actor_id: actorId || null,
    entity_type: 'requisition',
    entity_id: requisitionId,
    metadata: { stages: plan.length }
  }).catch(() => {});

  return rows;
}

/* ── Get Distribution Plan ────────────────────────────── */

export async function getDistributionPlan(pool, requisitionId) {
  const { rows } = await pool.query(
    `SELECT ds.*
     FROM requisition_distribution_stages ds
     WHERE ds.requisition_id = $1
     ORDER BY ds.stage_number ASC`,
    [requisitionId]
  );
  const activeStage = rows.find(s => s.status === 'active') || null;
  return { stages: rows, active_stage: activeStage };
}

/* ── Advance to Next Stage ────────────────────────────── */

/**
 * Complete the current active stage and activate the next one.
 * Returns the newly active stage or null if all stages completed.
 */
export async function advanceDistribution(pool, requisitionId, actorId) {
  const { stages, active_stage } = await getDistributionPlan(pool, requisitionId);
  if (!active_stage) return null;

  // Complete current stage
  await pool.query(
    `UPDATE requisition_distribution_stages
     SET status = 'completed', completed_at = NOW()
     WHERE id = $1`,
    [active_stage.id]
  );

  // Find and activate next stage
  const nextStage = stages.find(s => s.stage_number === active_stage.stage_number + 1);
  if (!nextStage) return null; // All stages done

  await pool.query(
    `UPDATE requisition_distribution_stages
     SET status = 'active', activated_at = NOW()
     WHERE id = $1`,
    [nextStage.id]
  );

  await eventTracking.trackEvent(pool, {
    event_type: 'requisition_distributed',
    actor_id: actorId || null,
    entity_type: 'requisition',
    entity_id: requisitionId,
    metadata: { advanced_to_stage: nextStage.stage_number, tier: nextStage.pool_tier }
  }).catch(() => {});

  return { ...nextStage, status: 'active' };
}

/* ── Get Eligible Suppliers for a Stage ───────────────── */

/**
 * Resolve the list of eligible suppliers for the given stage of a requisition.
 * PREFERRED/SECONDARY/TRIAL → filters vendor_pool by tier for the requisition's org.
 * OPEN → returns all active suppliers not already in the pool.
 */
export async function getEligibleSuppliers(pool, requisitionId, stageNumber) {
  // Get requisition org
  const { rows: reqRows } = await pool.query(
    'SELECT org_id FROM requisitions WHERE id = $1',
    [requisitionId]
  );
  if (!reqRows[0]?.org_id) return [];
  const clientOrgId = reqRows[0].org_id;

  // Get stage tier
  const { rows: stageRows } = await pool.query(
    `SELECT pool_tier FROM requisition_distribution_stages
     WHERE requisition_id = $1 AND stage_number = $2`,
    [requisitionId, stageNumber]
  );
  if (!stageRows[0]) return [];
  const tier = stageRows[0].pool_tier;

  if (tier === 'OPEN') {
    // All active supplier orgs not already in client's vendor pool
    const { rows } = await pool.query(
      `SELECT o.id AS supplier_org_id, o.name AS supplier_name, o.type
       FROM organizations o
       WHERE o.type = 'agency' AND o.is_active = TRUE
         AND o.id NOT IN (
           SELECT vp.supplier_org_id FROM vendor_pool vp
           WHERE vp.client_org_id = $1 AND vp.status = 'active'
         )
       ORDER BY o.name ASC
       LIMIT 100`,
      [clientOrgId]
    );
    return rows;
  }

  // Pool-based tier
  const { rows } = await pool.query(
    `SELECT vp.supplier_org_id, o.name AS supplier_name, vp.tier, vp.category
     FROM vendor_pool vp
     JOIN organizations o ON o.id = vp.supplier_org_id
     WHERE vp.client_org_id = $1 AND vp.tier = $2 AND vp.status = 'active'
     ORDER BY o.name ASC`,
    [clientOrgId, tier]
  );
  return rows;
}

/* ── Find Stages Needing Auto-Advance ─────────────────── */

/**
 * Batch operation: find active stages that have exceeded their auto_advance_hours.
 * For use by a background worker.
 */
export async function findStagesNeedingAdvance(pool, limit = 50) {
  const { rows } = await pool.query(
    `SELECT ds.*, r.org_id
     FROM requisition_distribution_stages ds
     JOIN requisitions r ON r.id = ds.requisition_id
     WHERE ds.status = 'active'
       AND ds.auto_advance_hours IS NOT NULL
       AND ds.activated_at + (ds.auto_advance_hours || ' hours')::interval < NOW()
     ORDER BY ds.activated_at ASC
     LIMIT $1`,
    [limit]
  );
  return rows;
}
