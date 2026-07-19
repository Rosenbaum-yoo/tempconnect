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
import * as skillCatalogService from "../services/skillCatalogService.js";

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

  return router;
}
