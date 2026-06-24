/**
 * Integrations REST-Router: CRUD for Slack/Teams webhook integrations.
 * Org-scoped, role-protected (owner/admin only).
 */
import { z } from "zod";
import { Router } from "express";
import { requirePermission } from "../middleware/rbac.js";
import { requireOrgFeature } from "../middleware/entitlementGuard.js";
import * as integrationService from "../services/integrationService.js";
import * as erpMappingService from "../services/erpMappingService.js";
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

// ── ERP/HR-Konnektor-Registry (org_erp_mappings) ──
const erpCreateSchema = z.object({
  system_type: z.enum(["sap_successfactors", "sap_hcm", "datev", "zvoove", "personio", "generic"]),
  external_client_id: z.string().max(200).optional(),
  label: z.string().max(200).optional().default(""),
  endpoint_url: z.string().url().max(2000).optional(),
  sync_config: z.record(z.unknown()).optional().default({}),
  status: z.enum(["active", "paused", "disabled"]).optional()
});

const erpUpdateSchema = z.object({
  external_client_id: z.string().max(200).optional(),
  label: z.string().max(200).optional(),
  endpoint_url: z.string().url().max(2000).optional(),
  sync_config: z.record(z.unknown()).optional(),
  status: z.enum(["active", "paused", "disabled"]).optional()
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

  // ── ERP/HR-Konnektor-Registry: /api/org/erp-mappings (Org ↔ SAP/DATEV/zvoove/…) ──

  // GET — alle Mappings der Org auflisten
  router.get("/org/erp-mappings", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const items = await erpMappingService.listMappings(pool, req.orgId);
      res.json({ items });
    } catch (err) {
      logger.error({ err: err.message }, "GET /org/erp-mappings");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // POST — neues Mapping anlegen (eindeutig je Org+System-Typ → 409 bei Duplikat)
  router.post("/org/erp-mappings", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const parsed = erpCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const mapping = await erpMappingService.createMapping(pool, req.orgId, {
        ...parsed.data,
        created_by: req.session.userId
      });
      res.locals.audit = {
        action: "erp_mapping.create", entity_type: "org_erp_mapping",
        entity_id: mapping.id, details: { system_type: parsed.data.system_type }
      };
      res.status(201).json(mapping);
    } catch (err) {
      if (err && err.code === "23505") {
        return res.status(409).json({ error: "MAPPING_EXISTS", message: "Für dieses Zielsystem existiert bereits ein Mapping." });
      }
      logger.error({ err: err.message }, "POST /org/erp-mappings");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // PATCH — Mapping aktualisieren
  router.patch("/org/erp-mappings/:id", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const parsed = erpUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const updated = await erpMappingService.updateMapping(pool, req.params.id, req.orgId, parsed.data);
      if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = {
        action: "erp_mapping.update", entity_type: "org_erp_mapping",
        entity_id: req.params.id, details: { changed_fields: Object.keys(parsed.data) }
      };
      res.json(updated);
    } catch (err) {
      logger.error({ err: err.message }, "PATCH /org/erp-mappings/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // DELETE — Mapping entfernen
  router.delete("/org/erp-mappings/:id", requireAuth, featureGate, rperm("org.settings"), async (req, res) => {
    try {
      if (!req.orgId) return res.status(400).json({ error: "ORG_REQUIRED" });
      const deleted = await erpMappingService.deleteMapping(pool, req.params.id, req.orgId);
      if (!deleted) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = {
        action: "erp_mapping.delete", entity_type: "org_erp_mapping", entity_id: req.params.id
      };
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err: err.message }, "DELETE /org/erp-mappings/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
