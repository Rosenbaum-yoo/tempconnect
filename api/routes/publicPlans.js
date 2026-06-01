/**
 * publicPlans.js — Oeffentliche Plan-/Feature-/Addon-API.
 *
 * Liefert den zentralen Tarif- und Feature-Katalog aus
 * `api/config/planCatalog.js` als Read-only-API. Wird vom Frontend
 * (`pricing.html`, `sla_abo.html`, `enterprise_anfrage.html`) genutzt,
 * damit keine Preise/Featurelisten mehr im UI hartcodiert sind.
 *
 * Kein `requireAuth`. Endpoints sind explizit oeffentlich. CSRF gilt fuer
 * GETs nicht (csrfProtect skip GET/HEAD/OPTIONS).
 */

import { Router } from "express";
import {
  CATALOG_VERSION,
  CATALOG_CURRENCY,
  PLAN_VARIANTS,
  INDIVIDUAL_TIER_CATALOG,
  INDIVIDUELL_BASELINE,
  listPublicPlans,
  listPublicFeatures,
  listPublicAddons,
  buildCatalogResponse
} from "../config/planCatalog.js";

/**
 * @param {{}} _deps
 */
export function createPublicPlansRouter(_deps) {
  const router = Router();

  function setCacheHeaders(res) {
    // Tariflisten aendern sich selten; 5 Minuten Cache, ETag fuer 304.
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("ETag", `W/"catalog-${CATALOG_VERSION}"`);
  }

  router.get("/public/plans", (_req, res) => {
    setCacheHeaders(res);
    res.json({
      catalog_version: CATALOG_VERSION,
      currency: CATALOG_CURRENCY,
      plan_variants: PLAN_VARIANTS,
      plans: listPublicPlans(),
      individual_tiers: INDIVIDUAL_TIER_CATALOG.map((t) => ({ ...t })),
      individuell_baseline: { ...INDIVIDUELL_BASELINE }
    });
  });

  router.get("/public/features", (_req, res) => {
    setCacheHeaders(res);
    res.json({
      catalog_version: CATALOG_VERSION,
      features: listPublicFeatures()
    });
  });

  router.get("/public/addons", (_req, res) => {
    setCacheHeaders(res);
    res.json({
      catalog_version: CATALOG_VERSION,
      currency: CATALOG_CURRENCY,
      addons: listPublicAddons(),
      individuell_baseline: { ...INDIVIDUELL_BASELINE }
    });
  });

  router.get("/public/catalog", (_req, res) => {
    setCacheHeaders(res);
    res.json(buildCatalogResponse());
  });

  return router;
}
