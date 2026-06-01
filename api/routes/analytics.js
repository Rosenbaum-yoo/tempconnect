/**
 * Analytics REST-Router: workforce analytics, conversion funnel, event tracking.
 */
import { Router } from "express";
import * as analyticsService from "../services/analyticsService.js";
import * as eventTrackingService from "../services/eventTrackingService.js";
import * as productAnalyticsService from "../services/productAnalyticsService.js";
import { requirePermission } from "../middleware/rbac.js";
import { z } from "zod";

export function createAnalyticsRouter(deps) {
  const {
    pool,
    requireAuth,
    logger,
    analyticsIngestLimiter = (_req, _res, next) => next()
  } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const trackSchema = z.object({
    event_name: z.string().min(2).max(80),
    occurred_at: z.string().datetime().optional().nullable(),
    session_id: z.string().min(6).max(120),
    anonymous_id: z.string().min(6).max(120).optional().nullable(),
    page_path: z.string().max(240).optional().nullable(),
    flow_key: z.string().max(100).optional().nullable(),
    journey_id: z.string().max(120).optional().nullable(),
    step_name: z.string().max(120).optional().nullable(),
    route_name: z.string().max(120).optional().nullable(),
    component_name: z.string().max(120).optional().nullable(),
    importance: z.enum(["low", "normal", "high"]).optional().nullable(),
    feature_context: z.string().max(120).optional().nullable(),
    metadata: z.record(z.any()).optional().nullable()
  });

  // Public telemetry ingest endpoint for product analytics (session/page/form behavior).
  router.post("/analytics/track-public", analyticsIngestLimiter, async (req, res) => {
    try {
      const parsed = trackSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION" } });

      const userId = req.session?.userId || null;
      let me = null;
      if (userId) {
        const { rows } = await pool.query(
          `SELECT u.id, u.role, u.is_demo, u.plan, u.customer_stage AS user_stage,
                  om.role_key AS org_role, o.id AS org_id, o.name AS org_name, o.customer_stage AS org_stage
           FROM users u
           LEFT JOIN org_memberships om ON om.user_id = u.id AND om.is_active = TRUE
           LEFT JOIN organizations o ON o.id = COALESCE(om.org_id, u.org_id)
           WHERE u.id = $1
           LIMIT 1`,
          [userId]
        );
        me = rows[0] || null;
      }

      const segment = productAnalyticsService.deriveCustomerSegment({
        plan: me?.plan || null,
        isDemo: me?.is_demo || false,
        orgName: me?.org_name || null,
        explicitStage: me?.org_stage || me?.user_stage || null
      });

      await productAnalyticsService.trackProductEvent(pool, {
        ...parsed.data,
        user_id: me?.id || null,
        org_id: me?.org_id || null,
        user_role: me?.role || null,
        org_role: me?.org_role || null,
        user_plan: me?.plan || null,
        customer_segment: segment,
        source: "web"
      });

      return res.json({ success: true, data: { accepted: true } });
    } catch (err) {
      // Analytics ist non-critical: DB-/Service-Fehler duerfen keine 500er auf Produktseiten erzeugen.
      // Logge den Fehler, aber antworte mit 200 accepted (fail-soft).
      logger.warn({ err: err.message, code: err.code }, "analytics track-public fail-soft");
      return res.json({ success: true, data: { accepted: false, reason: "ingest_error" } });
    }
  });

  /** GET /analytics/workforce — workforce KPIs */
  router.get("/analytics/workforce", requireAuth, rperm("report.operational"), async (req, res) => {
    const orgId = req.orgId || null; // F-006 fix
    const days = parseInt(req.query.days, 10) || 30;
    const data = await analyticsService.getWorkforceAnalytics(pool, orgId, days);
    res.json(data);
  });

  /** GET /analytics/funnel — conversion funnel */
  router.get("/analytics/funnel", requireAuth, rperm("report.operational"), async (req, res) => {
    const orgId = req.orgId || null; // F-006 fix
    const days = parseInt(req.query.days, 10) || 30;
    const funnel = await analyticsService.getConversionFunnel(pool, orgId, days);
    res.json(funnel);
  });

  /** GET /analytics/supplier-performance — top suppliers by response speed */
  router.get("/analytics/supplier-performance", requireAuth, rperm("report.supplier"), async (req, res) => {
    const orgId = req.orgId || null; // F-006 fix
    const days = parseInt(req.query.days, 10) || 30;
    const limit = parseInt(req.query.limit, 10) || 20;
    const suppliers = await analyticsService.supplierResponsePerformance(pool, orgId, days, limit);
    res.json({ suppliers });
  });

  /** GET /analytics/events — platform event history */
  router.get("/analytics/events", requireAuth, rperm("report.operational"), async (req, res) => {
    const events = await eventTrackingService.queryEvents(pool, {
      event_type: req.query.event_type || null,
      org_id: req.orgId || null, // F-006 fix
      actor_id: req.query.actor_id || null,
      entity_type: req.query.entity_type || null,
      from_date: req.query.from_date || null,
      to_date: req.query.to_date || null,
      limit: parseInt(req.query.limit, 10) || 100
    });
    res.json({ events });
  });

  /** GET /analytics/events/summary — aggregated event counts */
  router.get("/analytics/events/summary", requireAuth, rperm("report.operational"), async (req, res) => {
    const orgId = req.orgId || null; // F-006 fix
    const days = parseInt(req.query.days, 10) || 30;
    const summary = await eventTrackingService.eventCounts(pool, orgId, days);
    res.json(summary);
  });

  // Product analytics overview for product/founder teams.
  router.get("/analytics/product/overview", requireAuth, rperm("report.operational"), async (req, res) => {
    const data = await productAnalyticsService.getOverview(pool, {
      days: req.query.days,
      segment: req.query.segment || null
    });
    res.json({ success: true, data });
  });

  router.get("/analytics/product/pages", requireAuth, rperm("report.operational"), async (req, res) => {
    const items = await productAnalyticsService.getPageInsights(pool, {
      days: req.query.days,
      segment: req.query.segment || null
    });
    res.json({ success: true, data: { items } });
  });

  router.get("/analytics/product/funnels/:key", requireAuth, rperm("report.operational"), async (req, res) => {
    try {
      const items = await productAnalyticsService.getFunnel(
        pool,
        String(req.params.key || ""),
        req.query.days,
        req.query.segment || null
      );
      res.json({ success: true, data: { key: req.params.key, items } });
    } catch {
      res.status(400).json({ success: false, error: { code: "UNKNOWN_FUNNEL" } });
    }
  });

  router.get("/analytics/product/dropoff", requireAuth, rperm("report.operational"), async (req, res) => {
    const items = await productAnalyticsService.getDropoffByStep(pool, {
      days: req.query.days,
      segment: req.query.segment || null,
      flow: req.query.flow || null
    });
    res.json({ success: true, data: { items } });
  });

  router.get("/analytics/product/session-to-completion", requireAuth, rperm("report.operational"), async (req, res) => {
    const items = await productAnalyticsService.getSessionToCompletionTime(pool, {
      days: req.query.days,
      segment: req.query.segment || null,
      flow: req.query.flow || null
    });
    res.json({ success: true, data: { items } });
  });

  router.get("/analytics/product/role-conversion", requireAuth, rperm("report.operational"), async (req, res) => {
    const items = await productAnalyticsService.getRoleConversionComparison(pool, {
      days: req.query.days,
      segment: req.query.segment || null,
      flow: req.query.flow || null
    });
    res.json({ success: true, data: { items } });
  });

  router.get("/analytics/product/dashboard-presets", requireAuth, rperm("report.operational"), (_req, res) => {
    res.json({ success: true, data: { items: productAnalyticsService.getDashboardPresets() } });
  });

  // Optional product analytics provider bootstrap (e.g. PostHog) for frontend.
  router.get("/analytics/provider-config", requireAuth, (_req, res) => {
    const enabled = String(process.env.POSTHOG_ENABLED || "").toLowerCase() === "true";
    return res.json({
      success: true,
      data: {
        provider: enabled ? "posthog" : "none",
        posthog: enabled ? {
          apiKey: process.env.POSTHOG_API_KEY || "",
          apiHost: process.env.POSTHOG_API_HOST || "https://eu.i.posthog.com",
          sessionRecording: true
        } : null
      }
    });
  });

  return router;
}
