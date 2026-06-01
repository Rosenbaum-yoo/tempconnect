/**
 * Assignments REST-Router: CRUD and lifecycle for worker assignments.
 */
import { z } from "zod";
import { Router } from "express";
import * as assignmentService from "../services/assignmentService.js";
import { requirePermission } from "../middleware/rbac.js";
import { assertLocationBelongsToOrg, assertDepartmentBelongsToOrg, OrgBoundaryError } from "../utils/orgBoundary.js";

const createSchema = z.object({
  org_id: z.string().uuid().optional().nullable(),
  requisition_id: z.string().uuid().optional().nullable(),
  supplier_org_id: z.string().uuid().optional().nullable(),
  deal_request_id: z.string().uuid().optional().nullable(),
  demand_request_id: z.string().uuid().optional().nullable(),
  offer_id: z.string().uuid().optional().nullable(),
  contract_id: z.string().uuid().optional().nullable(),
  worker_description: z.string().max(2000).optional().nullable(),
  worker_count: z.number().int().min(1).max(999).optional(),
  requested_quantity: z.number().int().min(1).max(999).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  planned_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  hourly_rate_cents: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(4000).optional().nullable()
});

const transitionSchema = z.object({
  status: z.enum(["active", "completed", "cancelled", "extended"]),
  actual_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  planned_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  cancel_reason: z.string().max(2000).optional().nullable()
});

export function createAssignmentsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });

  router.get("/assignments", requireAuth, rperm("assignment.view"), async (req, res) => {
    // SEC-002: Org-Scoping — server-resolved, both buyer AND supplier perspective
    const orgId = req.orgId || null;
    const filters = {
      requisition_id: req.query.requisition_id || null,
      status: req.query.status || null,
      lifecycle_bucket: req.query.lifecycle_bucket || null,
      limit: parseInt(req.query.limit, 10) || 100
    };
    // Dual-perspective: return assignments where org is buyer OR supplier
    if (orgId) {
      const [buyerItems, supplierItems] = await Promise.all([
        assignmentService.listAssignments(pool, { ...filters, org_id: orgId }),
        assignmentService.listAssignments(pool, { ...filters, supplier_org_id: orgId })
      ]);
      // Deduplicate by id (in case org is both buyer and supplier)
      const seen = new Set();
      const items = [];
      for (const item of [...buyerItems, ...supplierItems]) {
        if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
      }
      items.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      return res.json({ items, total: items.length });
    }
    const items = await assignmentService.listAssignments(pool, filters);
    res.json({ items, total: items.length });
  });

  router.post("/assignments", requireAuth, rperm("assignment.create"), async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const data = { ...parsed.data, created_by: req.session.userId };
      // Org-Boundary: org_id default auf eigene Org
      if (!data.org_id && req.orgId) data.org_id = req.orgId;
      if (req.orgId && data.org_id && data.org_id !== req.orgId) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }
      const assignment = await assignmentService.createAssignment(pool, data);
      res.locals.audit = { action: "assignment.create", entity_type: "assignment", entity_id: assignment.id, details: { org_id: data.org_id, supplier_org_id: data.supplier_org_id } };
      res.status(201).json(assignment);
    } catch (err) {
      logger.error({ err: err.message }, "Assignment create failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/assignments/:id", requireAuth, rperm("assignment.view"), async (req, res) => {
    const assignment = await assignmentService.getAssignment(pool, req.params.id);
    if (!assignment) return res.status(404).json({ error: "NOT_FOUND" });
    // Org-Boundary: eigene Org muss buyer oder supplier sein
    if (req.orgId && assignment.org_id !== req.orgId && assignment.supplier_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    res.json(assignment);
  });

  router.patch("/assignments/:id", requireAuth, rperm("assignment.edit"), async (req, res) => {
    const partial = createSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ error: "VALIDATION", details: partial.error.issues });
    const existing = await assignmentService.getAssignment(pool, req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (req.orgId && existing.org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    // Org-Boundary: Standort und Abteilung muessen zur Org der Assignment gehoeren.
    try {
      await assertLocationBelongsToOrg(pool, partial.data.location_id, existing.org_id);
      await assertDepartmentBelongsToOrg(pool, partial.data.department_id, existing.org_id);
    } catch (boundaryErr) {
      if (boundaryErr instanceof OrgBoundaryError) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION", message: boundaryErr.message });
      }
      throw boundaryErr;
    }
    const updated = await assignmentService.updateAssignment(pool, req.params.id, partial.data, req.session.userId);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "assignment.update", entity_type: "assignment", entity_id: req.params.id, details: { changed_fields: Object.keys(partial.data) } };
    res.json(updated);
  });

  router.post("/assignments/:id/transition", requireAuth, rperm("assignment.edit"), async (req, res) => {
    const parsed = transitionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    // SEC-002: Org-boundary check before transition
    const existing = await assignmentService.getAssignment(pool, req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (req.orgId && existing.org_id !== req.orgId && existing.supplier_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    const result = await assignmentService.transitionAssignment(
      pool, req.params.id, parsed.data.status, req.session.userId, parsed.data
    );
    if (result.error === 'NOT_FOUND') return res.status(404).json({ error: "NOT_FOUND" });
    if (result.error === 'INVALID_TRANSITION') return res.status(409).json({ error: "INVALID_TRANSITION", from: result.from, to: result.to });
    res.locals.audit = { action: `assignment.transition.${parsed.data.status}`, entity_type: "assignment", entity_id: req.params.id, old_values: { status: result.from }, new_values: { status: parsed.data.status } };
    res.json(result.assignment);
  });

  router.post("/assignments/:id/complete", requireAuth, rperm("assignment.complete"), async (req, res) => {
    // SEC-002: Org-boundary check before complete
    const existing = await assignmentService.getAssignment(pool, req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (req.orgId && existing.org_id !== req.orgId && existing.supplier_org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    const result = await assignmentService.completeAssignment(pool, req.params.id, req.session.userId, {
      actual_end_date: req.body.actual_end_date
    });
    if (result.error) return res.status(result.error === 'NOT_FOUND' ? 404 : 409).json({ error: result.error });
    res.locals.audit = { action: "assignment.complete", entity_type: "assignment", entity_id: req.params.id, new_values: { status: "completed" } };
    res.json(result.assignment);
  });

  return router;
}
