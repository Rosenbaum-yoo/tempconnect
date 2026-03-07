/**
 * Reporting REST-Router: Executive Dashboard, KPIs, Vendor Performance, Compliance.
 */
import { Router } from "express";
import * as reportingService from "../services/reportingService.js";

export function createReportingRouter(deps) {
  const { pool, requireAuth } = deps;
  const router = Router();

  /** GET /reporting/dashboard – Executive Dashboard (kombinierte KPIs) */
  router.get("/reporting/dashboard", requireAuth, async (req, res) => {
    const orgId = req.query.org_id || null;
    const data = await reportingService.executiveDashboard(pool, orgId);
    res.json(data);
  });

  /** GET /reporting/requisitions – Requisition KPIs */
  router.get("/reporting/requisitions", requireAuth, async (req, res) => {
    const orgId = req.query.org_id || null;
    const kpis = await reportingService.requisitionKpis(pool, orgId);
    res.json(kpis);
  });

  /** GET /reporting/requisitions/timeline – Requisitions pro Tag */
  router.get("/reporting/requisitions/timeline", requireAuth, async (req, res) => {
    const orgId = req.query.org_id || null;
    const days = parseInt(req.query.days, 10) || 30;
    const timeline = await reportingService.requisitionsByPeriod(pool, orgId, days);
    res.json({ timeline });
  });

  /** GET /reporting/vendors – Vendor Performance */
  router.get("/reporting/vendors", requireAuth, async (req, res) => {
    if (!req.query.client_org_id) return res.status(400).json({ error: "client_org_id required" });
    const vendors = await reportingService.vendorPerformance(
      pool, req.query.client_org_id, parseInt(req.query.limit, 10) || 20
    );
    res.json({ vendors });
  });

  /** GET /reporting/compliance – Compliance Summary */
  router.get("/reporting/compliance", requireAuth, async (req, res) => {
    const orgId = req.query.org_id || null;
    const summary = await reportingService.complianceSummary(pool, orgId);
    res.json(summary);
  });

  /** GET /reporting/sla – SLA Report */
  router.get("/reporting/sla", requireAuth, async (req, res) => {
    const orgId = req.query.org_id || null;
    const days = parseInt(req.query.days, 10) || 30;
    const report = await reportingService.slaReport(pool, orgId, days);
    res.json(report);
  });

  /** GET /reporting/top-roles – Meistgesuchte Rollen */
  router.get("/reporting/top-roles", requireAuth, async (req, res) => {
    const orgId = req.query.org_id || null;
    const roles = await reportingService.topRoles(pool, orgId, parseInt(req.query.limit, 10) || 10);
    res.json({ roles });
  });

  return router;
}
