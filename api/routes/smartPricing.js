/**
 * Smart Pricing Routes — /api/pricing/*
 *
 * Datengestützte Preisvorschläge für Rollen/Regionen.
 * Plan-gated: smart_pricing (PLUS/PRO/ENTERPRISE).
 */

import { z } from "zod";
import { Router } from "express";
import * as smartPricingService from "../services/smartPricingService.js";

const suggestQuerySchema = z.object({
  role: z.string().min(1).max(200).optional(),
  region: z.string().min(1).max(200).optional(),
  urgency: z.enum(["normal", "high", "urgent", "critical", "notdienst"]).optional().default("normal"),
  context: z.enum(["supply", "demand", "offer"]).optional()
}).refine(d => d.role || d.region, { message: "Mindestens role oder region angeben." });

/**
 * @param {{ pool, requireAuth, requireFeature, logger }} deps
 */
export function createSmartPricingRouter(deps) {
  const { pool, requireAuth, requireFeature, logger } = deps;
  const router = Router();
  const pricingAccess = requireFeature("smart_pricing");

  /* ── GET /api/pricing/suggest ─────────────────────── */

  router.get("/pricing/suggest", requireAuth, pricingAccess, async (req, res) => {
    try {
      const parsed = suggestQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: "VALIDATION",
          details: parsed.error.issues
        });
      }

      const { role, region, urgency, context } = parsed.data;

      const result = await smartPricingService.getSuggestion(pool, {
        role,
        region,
        urgency,
        context
      });

      if (result.error) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (e) {
      logger.error({ err: e.message }, "GET /pricing/suggest");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
