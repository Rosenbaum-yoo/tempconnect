/**
 * Supplier Management Service: buyer-side supplier lifecycle.
 * Orchestrates vendorPoolService, complianceDocService, supplierMetricsService,
 * and reputationService for consolidated vendor profiles.
 */

import * as vendorPoolService from "./vendorPoolService.js";
import * as complianceDocService from "./complianceDocService.js";
import * as auditLog from "./auditLog.js";
import * as eventTracking from "./eventTrackingService.js";
import * as supplierMetrics from "./supplierMetricsService.js";
import * as reputationService from "./reputationService.js";

/* ── Invite ────────────────────────────────────────────── */

export async function inviteSupplier(pool, buyerOrgId, supplierOrgId, actorId, opts = {}) {
  const entry = await vendorPoolService.addToPool(pool, {
    client_org_id: buyerOrgId,
    supplier_org_id: supplierOrgId,
    tier: 'TRIAL',
    assigned_by: actorId,
    reason: opts.reason || 'Invited via supplier management',
    category: opts.category || null,
    location_id: opts.location_id || null,
    department_id: opts.department_id || null
  });
  await auditLog.writeAudit(pool, {
    action: 'supplier.invited',
    entity_type: 'vendor_pool',
    entity_id: entry.id,
    actor_id: actorId,
    details: { buyer_org_id: buyerOrgId, supplier_org_id: supplierOrgId }
  });
  // Track platform event
  await eventTracking.trackEvent(pool, {
    event_type: 'supplier_invited',
    actor_id: actorId,
    org_id: buyerOrgId,
    target_org_id: supplierOrgId,
    entity_type: 'vendor_pool',
    entity_id: entry.id
  }).catch(() => {});
  return entry;
}

/* ── Approve / Suspend / Block ─────────────────────────── */

export async function approveSupplier(pool, entryId, actorId, opts = {}) {
  const entry = await vendorPoolService.changeTier(
    pool, entryId, opts.tier || 'SECONDARY', actorId, opts.reason || 'Approved'
  );
  if (entry) {
    await vendorPoolService.changeStatus(pool, entryId, 'active', actorId);
    await auditLog.writeAudit(pool, {
      action: 'supplier.approved', entity_type: 'vendor_pool',
      entity_id: entryId, actor_id: actorId,
      details: { tier: entry.tier }
    });
    // Track platform event
    await eventTracking.trackEvent(pool, {
      event_type: 'supplier_approved',
      actor_id: actorId,
      entity_type: 'vendor_pool',
      entity_id: entryId,
      metadata: { tier: entry.tier }
    }).catch(() => {});
  }
  return entry;
}

export async function suspendSupplier(pool, entryId, actorId, reason) {
  const entry = await vendorPoolService.changeStatus(pool, entryId, 'suspended', actorId, reason);
  if (entry) {
    await auditLog.writeAudit(pool, {
      action: 'supplier.suspended', entity_type: 'vendor_pool',
      entity_id: entryId, actor_id: actorId, details: { reason }
    });
  }
  return entry;
}

/* ── Supplier Profile (composite view) ─────────────────── */

/**
 * Consolidated vendor profile: vendor_pool entry + compliance + contracts
 * + supplier metrics scorecard + reputation + change history + notes.
 */
export async function getSupplierProfile(pool, buyerOrgId, supplierOrgId) {
  // Vendor pool entry
  const { rows: vpRows } = await pool.query(
    `SELECT vp.*, so.name AS supplier_name, so.type AS supplier_type,
            so.billing_email, so.website, so.legal_name, so.tax_id
     FROM vendor_pool vp
     JOIN organizations so ON so.id = vp.supplier_org_id
     WHERE vp.client_org_id = $1 AND vp.supplier_org_id = $2 AND vp.status != 'removed'
     ORDER BY vp.updated_at DESC LIMIT 1`,
    [buyerOrgId, supplierOrgId]
  );
  const vendorEntry = vpRows[0] || null;

  // Compliance status
  let compliance = null;
  try {
    compliance = await complianceDocService.complianceStats(pool, supplierOrgId);
  } catch { /* table may not have docs yet */ }

  // Active contracts
  const { rows: contracts } = await pool.query(
    `SELECT id, title, contract_type, status, valid_from, valid_until
     FROM contracts
     WHERE buyer_org_id = $1 AND supplier_org_id = $2 AND status = 'active'
     ORDER BY valid_until ASC NULLS LAST`,
    [buyerOrgId, supplierOrgId]
  ).catch(() => ({ rows: [] }));

  // Supplier metrics scorecard (30-day window)
  let scorecard = null;
  try {
    scorecard = await supplierMetrics.getScorecard(pool, supplierOrgId, 30);
  } catch { /* metrics may not exist */ }

  // Reputation
  let reputation = null;
  try {
    reputation = await reputationService.getReputation(pool, supplierOrgId);
  } catch { /* reputation may not exist */ }

  // Change history (last 20)
  let history = [];
  try {
    if (vendorEntry) {
      history = await vendorPoolService.getHistory(pool, vendorEntry.id, 20);
    }
  } catch { /* history table may not exist yet */ }

  // Notes (last 20)
  let notes = [];
  try {
    if (vendorEntry) {
      notes = await vendorPoolService.listNotes(pool, vendorEntry.id, 20);
    }
  } catch { /* notes table may not exist yet */ }

  // Active worker count (placements with this supplier)
  let activeWorkers = 0;
  try {
    const { rows: wRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM requests
       WHERE sender_id = $1 AND receiver_id = $2 AND status IN ('ACCEPTED','FILLED','ACTIVE')
       UNION ALL
       SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'requests')`,
      [buyerOrgId, supplierOrgId]
    );
    activeWorkers = wRows[0]?.count || 0;
  } catch { /* table may not exist */ }

  return {
    vendor_pool: vendorEntry,
    compliance,
    contracts,
    scorecard,
    reputation,
    history,
    notes,
    active_workers: activeWorkers
  };
}

/* ── List managed suppliers ────────────────────────────── */

export function listManagedSuppliers(pool, buyerOrgId, filters = {}) {
  return vendorPoolService.listForClient(pool, buyerOrgId, filters);
}
