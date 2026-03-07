/**
 * Vendor Pool REST-Router: Lieferanten verwalten, Tier-Aenderungen, Sperren, Statistik.
 */
import { z } from "zod";
import { Router } from "express";
import * as vendorPoolService from "../services/vendorPoolService.js";
import { requirePermission } from "../middleware/rbac.js";

const addSchema = z.object({
  client_org_id: z.string().uuid(),
  supplier_org_id: z.string().uuid(),
  tier: z.enum(["PREFERRED", "SECONDARY", "TRIAL", "RESTRICTED", "BLOCKED"]).optional(),
  category: z.string().max(120).optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
});

const tierSchema = z.object({
  tier: z.enum(["PREFERRED", "SECONDARY", "TRIAL", "RESTRICTED", "BLOCKED"]),
  reason: z.string().max(2000).optional().nullable()
});

const statusSchema = z.object({
  status: z.enum(["active", "suspended", "removed"]),
  reason: z.string().max(2000).optional().nullable()
});

export function createVendorPoolRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  /** GET /vendor-pool – Pool fuer Client-Org */
  router.get("/vendor-pool", requireAuth, async (req, res) => {
    if (!req.query.client_org_id) return res.status(400).json({ error: "client_org_id required" });
    const items = await vendorPoolService.listForClient(pool, req.query.client_org_id, {
      tier: req.query.tier || null,
      status: req.query.status || null,
      category: req.query.category || null,
      limit: parseInt(req.query.limit, 10) || 100
    });
    res.json({ items, total: items.length });
  });

  /** GET /vendor-pool/my – Pool-Eintraege als Supplier */
  router.get("/vendor-pool/my", requireAuth, async (req, res) => {
    if (!req.query.supplier_org_id) return res.status(400).json({ error: "supplier_org_id required" });
    const items = await vendorPoolService.listForSupplier(pool, req.query.supplier_org_id);
    res.json({ items, total: items.length });
  });

  /** GET /vendor-pool/stats – Statistik */
  router.get("/vendor-pool/stats", requireAuth, async (req, res) => {
    if (!req.query.client_org_id) return res.status(400).json({ error: "client_org_id required" });
    const stats = await vendorPoolService.poolStats(pool, req.query.client_org_id);
    res.json(stats);
  });

  /** GET /vendor-pool/:id – Einzelner Eintrag */
  router.get("/vendor-pool/:id", requireAuth, async (req, res) => {
    const entry = await vendorPoolService.getEntry(pool, req.params.id);
    if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
    res.json(entry);
  });

  /** POST /vendor-pool – Supplier hinzufuegen */
  router.post("/vendor-pool", requireAuth, requirePermission("vendor_pool.manage", { pool, logger }), async (req, res) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const entry = await vendorPoolService.addToPool(pool, { ...parsed.data, assigned_by: req.session.userId });
    res.locals.audit = { action: "vendor_pool.add", entity_type: "vendor_pool", entity_id: entry.id, details: { client_org_id: parsed.data.client_org_id, supplier_org_id: parsed.data.supplier_org_id } };
    res.status(201).json(entry);
  });

  /** PATCH /vendor-pool/:id/tier – Tier aendern */
  router.patch("/vendor-pool/:id/tier", requireAuth, requirePermission("vendor_pool.manage", { pool, logger }), async (req, res) => {
    const parsed = tierSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const updated = await vendorPoolService.changeTier(pool, req.params.id, parsed.data.tier, req.session.userId, parsed.data.reason);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "vendor_pool.tier_change", entity_type: "vendor_pool", entity_id: req.params.id, new_values: { tier: parsed.data.tier } };
    res.json(updated);
  });

  /** PATCH /vendor-pool/:id/status
  router.patch("/vendor-pool/:id/status", requireAuth, requirePermission("vendor_pool.manage", { pool, logger }), async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const updated = await vendorPoolService.changeStatus(pool, req.params.id, parsed.data.status, req.session.userId, parsed.data.reason);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "vendor_pool.status_change", entity_type: "vendor_pool", entity_id: req.params.id, new_values: { status: parsed.data.status } };
    res.json(updated);
  });

  /** DELETE /vendor-pool/:id
  router.delete("/vendor-pool/:id", requireAuth, requirePermission("vendor_pool.manage", { pool, logger }), async (req, res) => {
    const removed = await vendorPoolService.removeFromPool(pool, req.params.id);
    if (!removed) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "vendor_pool.remove", entity_type: "vendor_pool", entity_id: req.params.id };
    res.json({ ok: true, entry: removed });
  });

  return router;
}
