/**
 * Integrations REST-Router: CRUD for Slack/Teams webhook integrations.
 * Org-scoped, role-protected (owner/admin only).
 */
import { z } from "zod";
import { Router } from "express";
import { requirePermission } from "../middleware/rbac.js";
import { requireOrgFeature } from "../middleware/entitlementGuard.js";
import * as integrationService from "../services/integrationService.js";
import { trackProductEventFromRequest } from "../services/productAnalyticsService.js";

const createSchema = z.object({
  provider: z.enum(["slack", "teams"]),
  label: z.string().max(200).optional().default(""),
  webhook_url: z.string().url().min(10).max(2000),
  enabled_events: z.array(z.string().max(80)).optional().default([])
});

const updateSchema = z.object({
  label: z.string().max(200).optional(),
  webhook_url: z.string().url().min(10).max(2000).optional(),
  enabled_events: z.array(z.string().max(80)).optional(),
  is_active: z.boolean().optional()
});

/**
 * @param {{ pool, requireAuth, logger }} deps
 */
export function createIntegrationsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const featureGate = requireOrgFeature("integrations", { pool, logger });

  // GET /api/integrations — list all for current org
  router.get("/integrations", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const items = await integrationService.listIntegrations(pool, req.orgId);
      res.json({ items });
    } catch (err) {
      logger.error({ err: err.message }, "GET /integrations");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // GET /api/integrations/events — list supported events
  router.get("/integrations/events", requireAuth, (req, res) => {
    res.json({ events: integrationService.getSupportedEvents() });
  });

  // POST /api/integrations — create new
  router.post("/integrations", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const integration = await integrationService.createIntegration(pool, req.orgId, {
        ...parsed.data,
        created_by: req.session.userId
      });
      res.locals.audit = {
        action: "integration.create", entity_type: "org_integration",
        entity_id: integration.id, details: { provider: parsed.data.provider }
      };
      try {
        await trackProductEventFromRequest(pool, req, "integration_connected", {
          flow_key: "enterprise_setup_to_ops",
          metadata: { integration_id: integration.id, provider: parsed.data.provider }
        });
      } catch { /* analytics non-critical */ }
      res.status(201).json(integration);
    } catch (err) {
      logger.error({ err: err.message }, "POST /integrations");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // PATCH /api/integrations/:id — update
  router.patch("/integrations/:id", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const updated = await integrationService.updateIntegration(pool, req.params.id, req.orgId, parsed.data);
      if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = {
        action: "integration.update", entity_type: "org_integration",
        entity_id: req.params.id, details: { changed_fields: Object.keys(parsed.data) }
      };
      res.json(updated);
    } catch (err) {
      logger.error({ err: err.message }, "PATCH /integrations/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // DELETE /api/integrations/:id
  router.delete("/integrations/:id", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const deleted = await integrationService.deleteIntegration(pool, req.params.id, req.orgId);
      if (!deleted) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = {
        action: "integration.delete", entity_type: "org_integration", entity_id: req.params.id
      };
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err: err.message }, "DELETE /integrations/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // POST /api/integrations/:id/test — send test message
  router.post("/integrations/:id/test", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const result = await integrationService.testIntegration(pool, req.params.id, req.orgId);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = {
        action: "integration.test", entity_type: "org_integration",
        entity_id: req.params.id, details: { success: result.ok }
      };
      res.json(result);
    } catch (err) {
      logger.error({ err: err.message }, "POST /integrations/:id/test");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // GET /api/integrations/:id/deliveries — webhook delivery history
  router.get("/integrations/:id/deliveries", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
      const items = await integrationService.getDeliveryLog(pool, req.params.id, req.orgId, limit);
      if (items === null) return res.status(404).json({ error: "NOT_FOUND" });
      res.json({ items });
    } catch (err) {
      logger.error({ err: err.message }, "GET /integrations/:id/deliveries");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // POST /api/integrations/retry-failed — trigger retry of failed deliveries
  router.post("/integrations/retry-failed", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      const result = await integrationService.retryFailedDeliveries(pool);
      res.locals.audit = {
        action: "integration.retry_failed",
        entity_type: "org_integration",
        entity_id: null,
        details: { retried: result?.retried || null, failed: result?.failed || null }
      };
      res.json(result);
    } catch (err) {
      logger.error({ err: err.message }, "POST /integrations/retry-failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
