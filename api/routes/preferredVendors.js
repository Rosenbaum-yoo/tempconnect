/**
 * Preferred Vendors Self-Service REST-Router.
 * Enterprise-Kunden verwalten ihre bevorzugten Dienstleister.
 * Baut auf vendorPoolService auf — keine doppelte Logik.
 */
import { z } from "zod";
import { Router } from "express";
import * as vendorPoolService from "../services/vendorPoolService.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireOrgFeature, requireOrgLimit } from "../middleware/entitlementGuard.js";

const addPreferredSchema = z.object({
  supplier_org_id: z.string().uuid(),
  category: z.string().max(120).optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
});

const bulkSchema = z.object({
  action: z.enum(["promote", "demote"]),
  entry_ids: z.array(z.string().uuid()).min(1).max(50),
  reason: z.string().max(2000).optional().nullable()
});

export function createPreferredVendorsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const supplierManagementGate = requireOrgFeature("supplier_management", { pool, logger });
  const supplierLimitGate = requireOrgLimit("suppliers", { pool, logger });

  /** GET /preferred-vendors — Liste aller Preferred Vendors mit KPIs */
  router.get("/preferred-vendors", requireAuth, requirePermission("vendor_pool.view", { pool, logger }), async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) return res.status(400).json({ error: "org_id required" });
    try {
      const items = await vendorPoolService.getPreferredVendors(pool, orgId, {
        category: req.query.category || null,
        location_id: req.query.location_id || null,
        department_id: req.query.department_id || null,
        limit: parseInt(req.query.limit, 10) || 100
      });
      res.json({ items, total: items.length });
    } catch (err) {
      logger.error({ err: err.message }, "Preferred vendors list failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /preferred-vendors/summary — Dashboard: Counts, Coverage, Performance */
  router.get("/preferred-vendors/summary", requireAuth, requirePermission("vendor_pool.view", { pool, logger }), async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) return res.status(400).json({ error: "org_id required" });
    try {
      const summary = await vendorPoolService.getPreferredSummary(pool, orgId);
      res.json(summary);
    } catch (err) {
      logger.error({ err: err.message }, "Preferred vendors summary failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /preferred-vendors/coverage — Gap-Analyse nach Kategorie/Standort */
  router.get("/preferred-vendors/coverage", requireAuth, requirePermission("vendor_pool.view", { pool, logger }), async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) return res.status(400).json({ error: "org_id required" });
    try {
      const coverage = await vendorPoolService.getPoolCoverage(pool, orgId);
      res.json(coverage);
    } catch (err) {
      logger.error({ err: err.message }, "Preferred vendors coverage failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /preferred-vendors/suggest — Auto-Suggestions fuer Promotion */
  router.get("/preferred-vendors/suggest", requireAuth, requirePermission("vendor_pool.view", { pool, logger }), async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) return res.status(400).json({ error: "org_id required" });
    try {
      const limit = parseInt(req.query.limit, 10) || 10;
      const suggestions = await vendorPoolService.suggestForPreferred(pool, orgId, limit);
      res.json({ items: suggestions, total: suggestions.length });
    } catch (err) {
      logger.error({ err: err.message }, "Preferred vendors suggest failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /preferred-vendors/capacity — Workforce-Kapazitaet der Preferred Vendors */
  router.get("/preferred-vendors/capacity", requireAuth, requirePermission("vendor_pool.view", { pool, logger }), async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) return res.status(400).json({ error: "org_id required" });
    try {
      const capacity = await vendorPoolService.getWorkforceCapacity(pool, orgId);
      res.json(capacity);
    } catch (err) {
      logger.error({ err: err.message }, "Preferred vendors capacity failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** POST /preferred-vendors — Supplier als Preferred hinzufuegen */
  router.post("/preferred-vendors", requireAuth, supplierManagementGate, supplierLimitGate, requirePermission("vendor_pool.manage", { pool, logger }), async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) return res.status(400).json({ error: "org_id required" });
    const parsed = addPreferredSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const entry = await vendorPoolService.addToPool(pool, {
        client_org_id: orgId,
        supplier_org_id: parsed.data.supplier_org_id,
        tier: 'PREFERRED',
        assigned_by: req.session.userId,
        category: parsed.data.category || null,
        location_id: parsed.data.location_id || null,
        department_id: parsed.data.department_id || null,
        reason: parsed.data.reason || 'Added as preferred vendor',
        valid_from: parsed.data.valid_from || null,
        valid_until: parsed.data.valid_until || null
      });
      res.locals.audit = {
        action: "preferred_vendor.add",
        entity_type: "vendor_pool",
        entity_id: entry.id,
        details: { supplier_org_id: parsed.data.supplier_org_id }
      };
      res.status(201).json(entry);
    } catch (err) {
      logger.error({ err: err.message }, "Add preferred vendor failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** POST /preferred-vendors/bulk — Batch promote/demote */
  router.post("/preferred-vendors/bulk", requireAuth, supplierManagementGate, requirePermission("vendor_pool.manage", { pool, logger }), async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) return res.status(400).json({ error: "org_id required" });
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      let results;
      if (parsed.data.action === 'promote') {
        results = await vendorPoolService.bulkSetPreferred(
          pool, orgId, parsed.data.entry_ids, req.session.userId, parsed.data.reason
        );
      } else {
        results = [];
        for (const entryId of parsed.data.entry_ids) {
          const r = await vendorPoolService.demoteFromPreferred(
            pool, entryId, req.session.userId, parsed.data.reason
          );
          if (r) results.push(r);
        }
      }
      res.locals.audit = {
        action: `preferred_vendor.bulk_${parsed.data.action}`,
        entity_type: "vendor_pool",
        details: { count: results.length, entry_ids: parsed.data.entry_ids }
      };
      res.json({ ok: true, updated: results.length, items: results });
    } catch (err) {
      logger.error({ err: err.message }, "Bulk preferred vendor operation failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** DELETE /preferred-vendors/:supplierOrgId — Aus Preferred entfernen (-> SECONDARY) */
  router.delete("/preferred-vendors/:supplierOrgId", requireAuth, supplierManagementGate, requirePermission("vendor_pool.manage", { pool, logger }), async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) return res.status(400).json({ error: "org_id required" });
    try {
      // Find the PREFERRED entry for this supplier
      const items = await vendorPoolService.listForClient(pool, orgId, { tier: 'PREFERRED', limit: 200 });
      const entry = items.find(i => i.supplier_org_id === req.params.supplierOrgId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      const updated = await vendorPoolService.demoteFromPreferred(
        pool, entry.id, req.session.userId, req.body?.reason || 'Removed from preferred'
      );
      if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = {
        action: "preferred_vendor.remove",
        entity_type: "vendor_pool",
        entity_id: entry.id,
        details: { supplier_org_id: req.params.supplierOrgId }
      };
      res.json({ ok: true, entry: updated });
    } catch (err) {
      logger.error({ err: err.message }, "Remove preferred vendor failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
