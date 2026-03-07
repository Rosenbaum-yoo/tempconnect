/**
 * Settings REST-Router: org-scoped enterprise configuration.
 */
import { z } from "zod";
import { Router } from "express";
import * as settingsService from "../services/settingsService.js";
import { requirePermission } from "../middleware/rbac.js";

const updateSchema = z.object({
  approval_required: z.boolean().optional(),
  preferred_supplier_only: z.boolean().optional(),
  auto_match_enabled: z.boolean().optional(),
  default_radius_km: z.number().int().min(1).max(500).optional(),
  compliance_strictness: z.enum(["relaxed", "standard", "strict"]).optional(),
  notification_preferences: z.record(z.unknown()).optional(),
  branding: z.record(z.unknown()).optional()
});

export function createSettingsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  router.get("/settings", requireAuth, async (req, res) => {
    if (!req.query.org_id) return res.status(400).json({ error: "org_id required" });
    const settings = await settingsService.getSettings(pool, req.query.org_id);
    res.json(settings);
  });

  router.patch("/settings", requireAuth, requirePermission("org.settings", { pool, logger }), async (req, res) => {
    if (!req.body.org_id && !req.query.org_id) return res.status(400).json({ error: "org_id required" });
    const orgId = req.body.org_id || req.query.org_id;
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const settings = await settingsService.updateSettings(pool, orgId, parsed.data);
    res.locals.audit = { action: "settings.update", entity_type: "org_settings", entity_id: orgId, details: { changed_fields: Object.keys(parsed.data) } };
    res.json(settings);
  });

  return router;
}
