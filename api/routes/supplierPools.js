/**
 * Supplier Pools REST-Router: distribution stage management.
 */
import { z } from "zod";
import { Router } from "express";
import * as supplierPoolService from "../services/supplierPoolService.js";
import { requirePermission } from "../middleware/rbac.js";

const distributeSchema = z.object({
  requisition_id: z.string().uuid(),
  stages: z.array(z.object({
    stage_number: z.number().int().min(1),
    pool_tier: z.enum(['PREFERRED', 'SECONDARY', 'TRIAL', 'OPEN']),
    label: z.string().max(200).optional().nullable(),
    auto_advance_hours: z.number().int().min(1).optional().nullable()
  })).optional()
});

export function createSupplierPoolsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  /** POST /supplier-pools/distribute — create distribution plan */
  router.post("/supplier-pools/distribute", requireAuth, requirePermission("requisition.manage", { pool, logger }), async (req, res) => {
    const parsed = distributeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      const stages = await supplierPoolService.createDistributionPlan(
        pool, parsed.data.requisition_id, parsed.data.stages, req.session.userId
      );
      res.locals.audit = { action: "supplier_pool.distribute", entity_type: "distribution_plan", entity_id: parsed.data.requisition_id, details: { stage_count: stages.length } };
      res.status(201).json({ stages });
    } catch (err) {
      logger.error({ err: err.message }, "Distribution plan creation failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /supplier-pools/distribution/:requisitionId — get distribution plan */
  router.get("/supplier-pools/distribution/:requisitionId", requireAuth, async (req, res) => {
    const plan = await supplierPoolService.getDistributionPlan(pool, req.params.requisitionId);
    res.json(plan);
  });

  /** POST /supplier-pools/distribution/:requisitionId/advance — advance to next stage */
  router.post("/supplier-pools/distribution/:requisitionId/advance", requireAuth, requirePermission("requisition.manage", { pool, logger }), async (req, res) => {
    try {
      const nextStage = await supplierPoolService.advanceDistribution(
        pool, req.params.requisitionId, req.session.userId
      );
      if (!nextStage) {
        res.locals.audit = { action: "supplier_pool.advance", entity_type: "distribution_plan", entity_id: req.params.requisitionId, details: { result: "all_completed" } };
        return res.json({ ok: true, message: "All stages completed", next_stage: null });
      }
      res.locals.audit = { action: "supplier_pool.advance", entity_type: "distribution_plan", entity_id: req.params.requisitionId, details: { next_stage: nextStage.stage_number } };
      res.json({ ok: true, next_stage: nextStage });
    } catch (err) {
      logger.error({ err: err.message }, "Distribution advance failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /supplier-pools/distribution/:requisitionId/eligible — eligible suppliers for current/specific stage */
  router.get("/supplier-pools/distribution/:requisitionId/eligible", requireAuth, async (req, res) => {
    const stageNumber = parseInt(req.query.stage, 10) || null;
    let stage = stageNumber;

    if (!stage) {
      // Use current active stage
      const plan = await supplierPoolService.getDistributionPlan(pool, req.params.requisitionId);
      stage = plan.active_stage?.stage_number;
    }
    if (!stage) return res.json({ suppliers: [], stage: null });

    const suppliers = await supplierPoolService.getEligibleSuppliers(pool, req.params.requisitionId, stage);
    res.json({ stage, suppliers });
  });

  return router;
}
