/**
 * Suppliers REST-Router: buyer-side supplier management.
 * VMS-Erweiterung: Notes, History, enriched list, KPI dashboard.
 */
import { z } from "zod";
import { Router } from "express";
import * as supplierMgmt from "../services/supplierManagementService.js";
import * as vendorPoolService from "../services/vendorPoolService.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireCompanyOrg } from "../middleware/orgAccess.js";

const inviteSchema = z.object({
  buyer_org_id: z.string().uuid().optional(),
  supplier_org_id: z.string().uuid(),
  reason: z.string().max(2000).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable()
});

export function createSuppliersRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const companyOrg = requireCompanyOrg(deps, {
    errorCode: "SUPPLIER_MANAGEMENT_NOT_AVAILABLE_FOR_ORG_TYPE",
    errorMessage: "Lieferantenmanagement steht nur fuer Unternehmensorganisationen zur Verfuegung."
  });

  async function requireOwnedVendorEntry(req, res, entryId) {
    const entry = await vendorPoolService.getEntry(pool, entryId);
    if (!entry) {
      res.status(404).json({ error: "NOT_FOUND" });
      return null;
    }
    if (req.orgId && entry.client_org_id !== req.orgId) {
      res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      return null;
    }
    return entry;
  }

  router.get("/suppliers", requireAuth, rperm("supplier.view"), companyOrg, async (req, res) => {
    const buyerOrgId = req.orgId;
    if (!buyerOrgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
    const items = await supplierMgmt.listManagedSuppliers(pool, buyerOrgId, {
      tier: req.query.tier || null,
      status: req.query.status || null,
      limit: parseInt(req.query.limit, 10) || 100
    });
    res.json({ items, total: items.length });
  });

  router.post("/suppliers/invite", requireAuth, rperm("supplier.manage"), companyOrg, async (req, res) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const entry = await supplierMgmt.inviteSupplier(
        pool, req.orgId, parsed.data.supplier_org_id, req.session.userId, { ...parsed.data, buyer_org_id: req.orgId }
      );
      res.locals.audit = { action: "supplier.invite", entity_type: "vendor_pool", entity_id: entry.id, details: { buyer_org_id: req.orgId, supplier_org_id: parsed.data.supplier_org_id } };
      res.status(201).json(entry);
    } catch (err) {
      logger.error({ err: err.message }, "Supplier invite failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });
  router.patch("/suppliers/:id/approve", requireAuth, rperm("supplier.manage"), companyOrg, async (req, res) => {
    const existing = await requireOwnedVendorEntry(req, res, req.params.id);
    if (!existing) return;
    const entry = await supplierMgmt.approveSupplier(pool, req.params.id, req.session.userId, {
      tier: req.body.tier, reason: req.body.reason
    });
    if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "supplier.approve", entity_type: "vendor_pool", entity_id: req.params.id, details: { tier: req.body.tier } };
    res.json(entry);
  });

  router.patch("/suppliers/:id/suspend", requireAuth, rperm("supplier.manage"), companyOrg, async (req, res) => {
    const existing = await requireOwnedVendorEntry(req, res, req.params.id);
    if (!existing) return;
    const entry = await supplierMgmt.suspendSupplier(pool, req.params.id, req.session.userId, req.body.reason);
    if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "supplier.suspend", entity_type: "vendor_pool", entity_id: req.params.id, details: { reason: req.body.reason } };
    res.json(entry);
  });
  router.get("/suppliers/:buyerOrgId/:supplierOrgId/profile", requireAuth, rperm("vendor_pool.view"), companyOrg, async (req, res) => {
    if (req.orgId && req.params.buyerOrgId !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    const profile = await supplierMgmt.getSupplierProfile(pool, req.params.buyerOrgId, req.params.supplierOrgId);
    res.json(profile);
  });

  /** PATCH /suppliers/:id/block — block a supplier */
  router.patch("/suppliers/:id/block", requireAuth, rperm("supplier.manage"), companyOrg, async (req, res) => {
    try {
      const existing = await requireOwnedVendorEntry(req, res, req.params.id);
      if (!existing) return;
      const { reason } = req.body;
      const rows = await vendorPoolService.blockVendor(pool, req.orgId, existing.supplier_org_id, req.session.userId, reason);
      // Track event
      const { trackEvent } = await import("../services/eventTrackingService.js");
      await trackEvent(pool, {
        event_type: 'supplier_blocked', actor_id: req.session.userId,
        org_id: req.orgId, target_org_id: existing.supplier_org_id,
        entity_type: 'vendor_pool', metadata: { reason }
      }).catch(() => {});
      res.locals.audit = { action: "supplier.block", entity_type: "vendor_pool", entity_id: req.params.id, details: { client_org_id: req.orgId, supplier_org_id: existing.supplier_org_id, reason } };
      res.json({ ok: true, blocked: rows.length });
    } catch (err) {
      logger.error({ err: err.message }, "Supplier block failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** PATCH /suppliers/:id/categorize — update category/notes */
  router.patch("/suppliers/:id/categorize", requireAuth, rperm("supplier.manage"), companyOrg, async (req, res) => {
    const existing = await requireOwnedVendorEntry(req, res, req.params.id);
    if (!existing) return;
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
  router.patch("/suppliers/:id/tier", requireAuth, rperm("supplier.manage"), companyOrg, async (req, res) => {
    const existing = await requireOwnedVendorEntry(req, res, req.params.id);
    if (!existing) return;
    const { tier, reason } = req.body;
    if (!tier) return res.status(400).json({ error: "tier required" });
    try {
      const updated = await vendorPoolService.changeTier(pool, req.params.id, tier, req.session.userId, reason);
      if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: "supplier.tier_change", entity_type: "vendor_pool", entity_id: req.params.id, new_values: { tier }, details: { reason } };
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ── VMS: Enriched List ─────────────────────────────── */

  /** GET /suppliers/enriched — vendor list with inline KPIs */
  router.get("/suppliers/enriched", requireAuth, rperm("vendor_pool.view"), companyOrg, async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
    const items = await vendorPoolService.listForClientEnriched(pool, orgId, {
      tier: req.query.tier || null,
      status: req.query.status || null,
      category: req.query.category || null,
      activity_scope: req.query.activity_scope === 'buyer_activity_30d' ? 'buyer_activity_30d' : null,
      limit: parseInt(req.query.limit, 10) || 100
    });
    res.json({ items, total: items.length });
  });

  /* ── VMS: Dashboard KPIs ────────────────────────────── */

  /** GET /suppliers/dashboard — aggregated KPI dashboard */
  router.get("/suppliers/dashboard", requireAuth, rperm("vendor_pool.view"), companyOrg, async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
    try {
      const dashboard = await vendorPoolService.getVendorDashboard(pool, orgId);
      res.json(dashboard);
    } catch (err) {
      logger.error({ err: err.message }, "Vendor dashboard failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── VMS: Notes ─────────────────────────────────────── */

  /** GET /suppliers/:vpId/notes — list notes for a vendor pool entry */
  router.get("/suppliers/:vpId/notes", requireAuth, rperm("vendor_pool.view"), companyOrg, async (req, res) => {
    const existing = await requireOwnedVendorEntry(req, res, req.params.vpId);
    if (!existing) return;
    const notes = await vendorPoolService.listNotes(pool, req.params.vpId, parseInt(req.query.limit, 10) || 50);
    res.json({ items: notes, total: notes.length });
  });

  /** POST /suppliers/:vpId/notes — add a note */
  router.post("/suppliers/:vpId/notes", requireAuth, rperm("supplier.manage"), companyOrg, async (req, res) => {
    const existing = await requireOwnedVendorEntry(req, res, req.params.vpId);
    if (!existing) return;
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "text required" });
    try {
      const note = await vendorPoolService.addNote(pool, req.params.vpId, req.session.userId, text);
      res.locals.audit = { action: "vendor_pool.note_added", entity_type: "vendor_pool", entity_id: req.params.vpId, details: { text: text.slice(0, 200) } };
      res.status(201).json(note);
    } catch (err) {
      if (err.message === 'Note text required') return res.status(400).json({ error: err.message });
      logger.error({ err: err.message }, "Add vendor note failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── VMS: History ───────────────────────────────────── */

  /** GET /suppliers/:vpId/history — change history for a vendor pool entry */
  router.get("/suppliers/:vpId/history", requireAuth, rperm("vendor_pool.view"), companyOrg, async (req, res) => {
    const existing = await requireOwnedVendorEntry(req, res, req.params.vpId);
    if (!existing) return;
    const history = await vendorPoolService.getHistory(pool, req.params.vpId, parseInt(req.query.limit, 10) || 50);
    res.json({ items: history, total: history.length });
  });

  return router;
}
