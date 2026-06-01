/**
 * Vendor Pool REST-Router: Lieferanten verwalten, Tier-Aenderungen, Sperren, Statistik.
 */
import { z } from "zod";
import { Router } from "express";
import * as vendorPoolService from "../services/vendorPoolService.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireCompanyOrg } from "../middleware/orgAccess.js";
import { requireOrgFeature, requireOrgLimit } from "../middleware/entitlementGuard.js";

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
  const supplierManagementGate = requireOrgFeature("supplier_management", { pool, logger });
  const supplierLimitGate = requireOrgLimit("suppliers", { pool, logger });
  const companyOrg = requireCompanyOrg(deps, {
    errorCode: "VENDOR_POOL_NOT_AVAILABLE_FOR_ORG_TYPE",
    errorMessage: "Lieferantensteuerung steht nur fuer Unternehmensorganisationen zur Verfuegung."
  });

  /** GET /vendor-pool – Pool fuer Client-Org */
  router.get("/vendor-pool", requireAuth, requirePermission("vendor_pool.view", { pool, logger }), companyOrg, async (req, res) => {
    // F-008 fix: use server-resolved orgId
    const clientOrgId = req.orgId;
    if (!clientOrgId) return res.status(400).json({ error: "client_org_id required" });
    const items = await vendorPoolService.listForClient(pool, clientOrgId, {
      tier: req.query.tier || null,
      status: req.query.status || null,
      category: req.query.category || null,
      limit: parseInt(req.query.limit, 10) || 100
    });
    res.json({ items, total: items.length });
  });

  /** GET /vendor-pool/my – Pool-Eintraege als Supplier */
  router.get("/vendor-pool/my", requireAuth, requirePermission("vendor_pool.view", { pool, logger }), async (req, res) => {
    // F-008 fix: use server-resolved orgId
    const supplierOrgId = req.orgId;
    if (!supplierOrgId) return res.status(400).json({ error: "supplier_org_id required" });
    const items = await vendorPoolService.listForSupplier(pool, supplierOrgId);
    res.json({ items, total: items.length });
  });

  /** GET /vendor-pool/stats – Statistik */
  router.get("/vendor-pool/stats", requireAuth, requirePermission("vendor_pool.view", { pool, logger }), companyOrg, async (req, res) => {
    // F-008 fix: use server-resolved orgId
    const clientOrgId = req.orgId;
    if (!clientOrgId) return res.status(400).json({ error: "client_org_id required" });
    const stats = await vendorPoolService.poolStats(pool, clientOrgId);
    res.json(stats);
  });

  /** GET /vendor-pool/supplier-lookup?q=... – name-based supplier search */
  router.get("/vendor-pool/supplier-lookup", requireAuth, requirePermission("vendor_pool.manage", { pool, logger }), companyOrg, async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ items: [] });
    try {
      const { rows } = await pool.query(
        `SELECT o.id, o.name, o.org_type,
                (SELECT COUNT(*)::int FROM org_memberships om WHERE om.org_id = o.id AND om.is_active = TRUE) AS member_count
         FROM organizations o
         WHERE o.is_active = TRUE
           AND o.id <> $1
           AND o.name ILIKE $2
         ORDER BY o.name ASC
         LIMIT 20`,
        [req.orgId || "00000000-0000-0000-0000-000000000000", `%${q}%`]
      );
      res.json({ items: rows });
    } catch (e) {
      logger.error({ err: e }, "vendor-pool supplier-lookup");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /vendor-pool/:id – Einzelner Eintrag */
  router.get("/vendor-pool/:id", requireAuth, requirePermission("vendor_pool.view", { pool, logger }), async (req, res) => {
    const entry = await vendorPoolService.getEntry(pool, req.params.id);
    if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
    // F-008 fix: org-boundary — user must be client or supplier
    if (req.orgId && entry.client_org_id !== req.orgId && entry.supplier_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    res.json(entry);
  });

  /** POST /vendor-pool – Supplier hinzufuegen */
  router.post("/vendor-pool", requireAuth, supplierManagementGate, supplierLimitGate, requirePermission("vendor_pool.manage", { pool, logger }), companyOrg, async (req, res) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    if (!req.orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
    const entry = await vendorPoolService.addToPool(pool, {
      ...parsed.data,
      client_org_id: req.orgId,
      assigned_by: req.session.userId
    });
    res.locals.audit = {
      action: "vendor_pool.add",
      entity_type: "vendor_pool",
      entity_id: entry.id,
      details: { client_org_id: req.orgId, supplier_org_id: parsed.data.supplier_org_id }
    };
    res.status(201).json(entry);
  });

  /** PATCH /vendor-pool/:id/tier – Tier aendern */
  router.patch("/vendor-pool/:id/tier", requireAuth, supplierManagementGate, requirePermission("vendor_pool.manage", { pool, logger }), companyOrg, async (req, res) => {
    const parsed = tierSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const existing = await vendorPoolService.getEntry(pool, req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (req.orgId && existing.client_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    const updated = await vendorPoolService.changeTier(pool, req.params.id, parsed.data.tier, req.session.userId, parsed.data.reason);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "vendor_pool.tier_change", entity_type: "vendor_pool", entity_id: req.params.id, new_values: { tier: parsed.data.tier } };
    res.json(updated);
  });

  /** PATCH /vendor-pool/:id/status */
  router.patch("/vendor-pool/:id/status", requireAuth, supplierManagementGate, requirePermission("vendor_pool.manage", { pool, logger }), companyOrg, async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const existing = await vendorPoolService.getEntry(pool, req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (req.orgId && existing.client_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    const updated = await vendorPoolService.changeStatus(pool, req.params.id, parsed.data.status, req.session.userId, parsed.data.reason);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "vendor_pool.status_change", entity_type: "vendor_pool", entity_id: req.params.id, new_values: { status: parsed.data.status } };
    res.json(updated);
  });

  /** DELETE /vendor-pool/:id */
  router.delete("/vendor-pool/:id", requireAuth, supplierManagementGate, requirePermission("vendor_pool.manage", { pool, logger }), companyOrg, async (req, res) => {
    const existing = await vendorPoolService.getEntry(pool, req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (req.orgId && existing.client_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    const removed = await vendorPoolService.removeFromPool(pool, req.params.id);
    if (!removed) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "vendor_pool.remove", entity_type: "vendor_pool", entity_id: req.params.id };
    res.json({ ok: true, entry: removed });
  });

  return router;
}
