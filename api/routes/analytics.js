/**
 * Analytics REST-Router: workforce analytics, conversion funnel, event tracking.
 */
import { Router } from "express";
import * as analyticsService from "../services/analyticsService.js";
import * as eventTrackingService from "../services/eventTrackingService.js";

export function createAnalyticsRouter(deps) {
  const { pool, requireAuth } = deps;
  const router = Router();

  /** GET /analytics/workforce — workforce KPIs */
  router.get("/analytics/workforce", requireAuth, async (req, res) => {
    const orgId = req.query.org_id || null;
    const days = parseInt(req.query.days, 10) || 30;
    const data = await analyticsService.getWorkforceAnalytics(pool, orgId, days);
    res.json(data);
  });

  /** GET /analytics/funnel — conversion funnel */
  router.get("/analytics/funnel", requireAuth, async (req, res) => {
    const orgId = req.query.org_id || null;
    const days = parseInt(req.query.days, 10) || 30;
    const funnel = await analyticsService.getConversionFunnel(pool, orgId, days);
    res.json(funnel);
  });

  /** GET /analytics/supplier-performance — top suppliers by response speed */
  router.get("/analytics/supplier-performance", requireAuth, async (req, res) => {
    const orgId = req.query.org_id || null;
    const days = parseInt(req.query.days, 10) || 30;
    const limit = parseInt(req.query.limit, 10) || 20;
    const suppliers = await analyticsService.supplierResponsePerformance(pool, orgId, days, limit);
    res.json({ suppliers });
  });

  /** GET /analytics/events — platform event history */
  router.get("/analytics/events", requireAuth, async (req, res) => {
    const events = await eventTrackingService.queryEvents(pool, {
      event_type: req.query.event_type || null,
      org_id: req.query.org_id || null,
      actor_id: req.query.actor_id || null,
      entity_type: req.query.entity_type || null,
      from_date: req.query.from_date || null,
      to_date: req.query.to_date || null,
      limit: parseInt(req.query.limit, 10) || 100
    });
    res.json({ events });
  });

  /** GET /analytics/events/summary — aggregated event counts */
  router.get("/analytics/events/summary", requireAuth, async (req, res) => {
    const orgId = req.query.org_id || null;
    const days = parseInt(req.query.days, 10) || 30;
    const summary = await eventTrackingService.eventCounts(pool, orgId, days);
    res.json(summary);
  });

  return router;
}
