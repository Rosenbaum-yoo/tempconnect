/**
 * Approvals REST-Router: list pending, approve, reject.
 */
import { z } from "zod";
import { Router } from "express";
import * as approvalService from "../services/approvalService.js";
import { requirePermission } from "../middleware/rbac.js";

const decisionSchema = z.object({
  reason: z.string().max(2000).optional().nullable()
});

export function createApprovalsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  router.get("/approvals", requireAuth, async (req, res) => {
    const items = await approvalService.listPendingApprovals(pool, {
      org_id: req.query.org_id || null,
      entity_type: req.query.entity_type || null,
      limit: parseInt(req.query.limit, 10) || 50
    });
    res.json({ items, total: items.length });
  });

  router.get("/approvals/:id", requireAuth, async (req, res) => {
    const approval = await approvalService.getApprovalById(pool, req.params.id);
    if (!approval) return res.status(404).json({ error: "NOT_FOUND" });
    res.json(approval);
  });

  router.post("/approvals/:id/approve", requireAuth, requirePermission("approval.decide", { pool, logger }), async (req, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const result = await approvalService.approveEntity(pool, req.params.id, req.session.userId, parsed.data.reason);
    if (!result) return res.status(404).json({ error: "NOT_FOUND_OR_ALREADY_DECIDED" });
    res.locals.audit = { action: "approval.approve", entity_type: "approval_request", entity_id: req.params.id, details: { reason: parsed.data.reason }, old_values: { status: "pending" }, new_values: { status: "approved" } };
    res.json(result);
  });

  router.post("/approvals/:id/reject", requireAuth, requirePermission("approval.decide", { pool, logger }), async (req, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const result = await approvalService.rejectEntity(pool, req.params.id, req.session.userId, parsed.data.reason);
    if (!result) return res.status(404).json({ error: "NOT_FOUND_OR_ALREADY_DECIDED" });
    res.locals.audit = { action: "approval.reject", entity_type: "approval_request", entity_id: req.params.id, details: { reason: parsed.data.reason }, old_values: { status: "pending" }, new_values: { status: "rejected" } };
    res.json(result);
  });

  router.get("/approvals/history/:entityType/:entityId", requireAuth, async (req, res) => {
    const history = await approvalService.getApprovalHistory(pool, req.params.entityType, req.params.entityId);
    res.json({ items: history });
  });

  return router;
}
