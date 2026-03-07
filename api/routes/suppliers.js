/**
 * Suppliers REST-Router: buyer-side supplier management.
 */
import { z } from "zod";
import { Router } from "express";
import * as supplierMgmt from "../services/supplierManagementService.js";
import { requirePermission } from "../middleware/rbac.js";

const inviteSchema = z.object({
  buyer_org_id: z.string().uuid(),
  supplier_org_id: z.string().uuid(),
  reason: z.string().max(2000).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable()
});

export function createSuppliersRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  router.get("/suppliers", requireAuth, async (req, res) => {
    if (!req.query.buyer_org_id) return res.status(400).json({ error: "buyer_org_id required" });
    const items = await supplierMgmt.listManagedSuppliers(pool, req.query.buyer_org_id, {
      tier: req.query.tier || null,
      status: req.query.status || null,
      limit: parseInt(req.query.limit, 10) || 100
    });
    res.json({ items, total: items.length });
  });

  router.post("/suppliers/invite", requireAuth, requirePermission("supplier.manage", { pool, logger }), async (req, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const entry = await supplierMgmt.inviteSupplier(
        pool, parsed.data.buyer_org_id, parsed.data.supplier_org_id, req.session.userId, parsed.data
      );
      res.locals.audit = { action: "supplier.invite", entity_type: "vendor_pool", entity_id: entry.id, details: { buyer_org_id: parsed.data.buyer_org_id, supplier_org_id: parsed.data.supplier_org_id } };
      res.status(201).json(entry);
    } catch (err) {
      logger.error({ err: err.message }, "Supplier invite failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.patch("/suppliers/:id/approve", requireAuth, requirePermission("supplier.manage", { pool, logger }), async (req, res) => {
    const entry = await supplierMgmt.approveSupplier(pool, req.params.id, req.session.userId, {
      tier: req.body.tier, reason: req.body.reason
    });
    if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "supplier.approve", entity_type: "vendor_pool", entity_id: req.params.id, details: { tier: req.body.tier } };
    res.json(entry);
  });

  router.patch("/suppliers/:id/suspend", requireAuth, requirePermission("supplier.manage", { pool, logger }), async (req, res) => {
    const entry = await supplierMgmt.suspendSupplier(pool, req.params.id, req.session.userId, req.body.reason);
    if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "supplier.suspend", entity_type: "vendor_pool", entity_id: req.params.id, details: { reason: req.body.reason } };
    res.json(entry);
  });

  router.get("/suppliers/:buyerOrgId/:supplierOrgId/profile", requireAuth, async (req, res) => {
    const profile = await supplierMgmt.getSupplierProfile(pool, req.params.buyerOrgId, req.params.supplierOrgId);
    res.json(profile);
  });

  /** PATCH /suppliers/:id/block — block a supplier */
  router.patch("/suppliers/:id/block", requireAuth, requirePermission("supplier.manage", { pool, logger }), async (req, res) => {
    try {
      const { client_org_id, supplier_org_id, reason } = req.body;
      if (!client_org_id || !supplier_org_id) return res.status(400).json({ error: "client_org_id and supplier_org_id required" });
      const { default: vpSvc } = await import("../services/vendorPoolService.js");
      const rows = await (await import("../services/vendorPoolService.js")).blockVendor(pool, client_org_id, supplier_org_id, req.session.userId, reason);
      // Track event
      const { trackEvent } = await import("../services/eventTrackingService.js");
      await trackEvent(pool, {
        event_type: 'supplier_blocked', actor_id: req.session.userId,
        org_id: client_org_id, target_org_id: supplier_org_id,
        entity_type: 'vendor_pool', metadata: { reason }
      }).catch(() => {});
      res.locals.audit = { action: "supplier.block", entity_type: "vendor_pool", entity_id: req.params.id, details: { client_org_id, supplier_org_id, reason } };
      res.json({ ok: true, blocked: rows.length });
    } catch (err) {
      logger.error({ err: err.message }, "Supplier block failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** PATCH /suppliers/:id/categorize — update category/notes */
  router.patch("/suppliers/:id/categorize", requireAuth, requirePermission("supplier.manage", { pool, logger }), async (req, res) => {
    const { category, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE vendor_pool SET category = COALESCE($2, category), notes = COALESCE($3, notes), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, category || null, notes || null]
    );
    if (!rows[0]) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "supplier.categorize", entity_type: "vendor_pool", entity_id: req.params.id, details: { category, notes } };
    res.json(rows[0]);
  });

  /** PATCH /suppliers/:id/tier — change tier (mark preferred) */
  router.patch("/suppliers/:id/tier", requireAuth, requirePermission("supplier.manage", { pool, logger }), async (req, res) => {
    const vpService = await import("../services/vendorPoolService.js");
    const { tier, reason } = req.body;
    if (!tier) return res.status(400).json({ error: "tier required" });
    try {
      const updated = await vpService.changeTier(pool, req.params.id, tier, req.session.userId, reason);
      if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: "supplier.tier_change", entity_type: "vendor_pool", entity_id: req.params.id, new_values: { tier }, details: { reason } };
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
