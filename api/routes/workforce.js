/**
 * Workforce Management REST-Router: operative Einsatzuebersicht.
 * Konsolidiert Assignments, Worker-Links, Timesheets, Submissions.
 * Alle Endpoints sind org-scoped (buyer OR supplier) mit RBAC.
 */
import { Router } from "express";
import * as workforceService from "../services/workforceService.js";
import { requirePermission } from "../middleware/rbac.js";

export function createWorkforceRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });

  /** GET /workforce/overview — konsolidierte Einsatzliste */
  router.get("/workforce/overview", requireAuth, rperm("assignment.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const items = await workforceService.getWorkforceOverview(pool, orgId, {
        status:          req.query.status          || null,
        lifecycle_bucket: req.query.lifecycle_bucket || null,
        supplier_org_id: req.query.supplier_org_id || null,
        date_from:       req.query.date_from       || null,
        date_to:         req.query.date_to         || null,
        search:          req.query.search          || null,
        limit:           parseInt(req.query.limit, 10) || 100
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  /** GET /workforce/kpis — aggregierte Workforce-KPIs */
  router.get("/workforce/kpis", requireAuth, rperm("assignment.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const kpis = await workforceService.getWorkforceKpis(pool, orgId);
      res.json(kpis);
    } catch (err) { next(err); }
  });

  /** GET /workforce/pending-actions — priorisierte offene Aktionen */
  router.get("/workforce/pending-actions", requireAuth, rperm("assignment.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const actions = await workforceService.getPendingActions(
        pool, orgId, parseInt(req.query.limit, 10) || 20
      );
      res.json({ items: actions, total: actions.length });
    } catch (err) { next(err); }
  });

  /** GET /workforce/:assignmentId/detail — konsolidierte Einsatzdetails */
  router.get("/workforce/:assignmentId/detail", requireAuth, rperm("assignment.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const detail = await workforceService.getWorkforceDetail(pool, req.params.assignmentId, orgId);
      if (!detail) return res.status(404).json({ error: "NOT_FOUND" });
      if (detail.error === 'ORG_BOUNDARY_VIOLATION') return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      res.json(detail);
    } catch (err) { next(err); }
  });

  return router;
}
