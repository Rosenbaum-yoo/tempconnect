/**
 * Skill Catalog Router — plattformweiter Skill-Katalog (Referenzdaten)
 *
 * GET /skills/catalog — kategoriegruppierter Katalog für das Onboarding
 * (Checkbox-UX) sowie später für Angebotsgenerator und Suche.
 *
 * Nur Authentifizierung nötig (kein Org-Scope): der Katalog ist plattformweite
 * Referenzdaten und enthält keine mandantenspezifischen Informationen.
 */
import { Router } from "express";
import { z } from "zod";
import * as skillCatalogService from "../services/skillCatalogService.js";

const proposeSchema = z.object({
  name: z.string().min(2).max(100),
  category: z.string().max(50).optional().nullable()
}).strict();

export function createSkillCatalogRouter(deps) {
  const { pool, requireAuth } = deps;
  const router = Router();

  router.get("/skills/catalog", requireAuth, async (req, res, next) => {
    try {
      const catalog = await skillCatalogService.getSkillCatalog(pool);
      res.json(catalog);
    } catch (err) {
      next(err);
    }
  });

  router.get("/skills/categories", requireAuth, async (req, res, next) => {
    try {
      const categories = await skillCatalogService.listCategories(pool);
      res.json({ categories, count: categories.length });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /skills/propose — eigene Faehigkeit eintragen (Mig 160).
   *
   * Antwortet mit `matched:true`, wenn der Text eine Schreibvariante eines
   * bereits kuratierten Skills war ("Stapler" -> "Gabelstaplerfahrer"). Dann
   * ist der Arbeiter sofort auffindbar. Sonst entsteht ein Vorschlag, der auf
   * Kuratierung wartet — sichtbar am Profil, aber nicht im Katalog aller.
   */
  router.post("/skills/propose", requireAuth, async (req, res, next) => {
    const parsed = proposeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    }
    try {
      const result = await skillCatalogService.proposeSkill(pool, {
        name: parsed.data.name,
        category: parsed.data.category || null,
        userId: req.session?.userId || null,
        orgId: req.session?.orgId || null
      });
      res.locals.audit = {
        action: "skill.propose",
        entity_type: "platform_skill",
        entity_id: result.skill.id,
        details: { name: result.skill.name, matched: result.matched, matched_on: result.matched_on }
      };
      res.status(result.matched ? 200 : 201).json(result);
    } catch (err) {
      if (err.code === "INVALID_SKILL_NAME") {
        return res.status(400).json({ error: "INVALID_SKILL_NAME" });
      }
      next(err);
    }
  });

  return router;
}
