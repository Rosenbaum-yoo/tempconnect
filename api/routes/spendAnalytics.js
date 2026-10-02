/**
 * Spend Analytics REST-Router.
 * Feature-Gate: spend_analytics (PRO/ENTERPRISE)
 * RBAC: report.executive
 */
import { Router } from "express";
import * as spendSvc from "../services/spendAnalyticsService.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireCompanyOrg } from "../middleware/orgAccess.js";
import { requireOrgFeature } from "../middleware/entitlementGuard.js";
import { assertLocationBelongsToOrg, OrgBoundaryError } from "../utils/orgBoundary.js";

export function createSpendAnalyticsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const featureGate = requireOrgFeature("spend_analytics", { pool, logger });
  const companyOrg = requireCompanyOrg(deps, {
    errorCode: "SPEND_ANALYTICS_NOT_AVAILABLE_FOR_ORG_TYPE",
    errorMessage: "Spend & Kosten steht nur fuer Unternehmensorganisationen zur Verfuegung."
  });

  /** Parse common filter query params (location_id ist optional; Validierung erfolgt im Handler) */
  function parseFilters(query) {
    return {
      dateFrom: query.date_from || null,
      dateTo: query.date_to || null,
      vendorId: query.vendor_id || null,
      category: query.category || null,
      region: query.region || null,
      assignmentStatus: query.assignment_status || null,
      locationId: query.location_id || null,
      granularity: query.granularity || null,
      limit: parseInt(query.limit, 10) || undefined
    };
  }

  /**
   * Validiert optional location_id: muss zur eigenen Org gehoeren.
   * Gibt 403 zurueck wenn fremde Org; ignoriert null/leere locationId.
   */
  async function validateLocationScope(req, res, locationId) {
    if (!locationId) return true;
    /*
     * Wortgleich zu `api/routes/reporting.js` — dort steht die ausfuehrliche
     * Begruendung. Kurz: ohne Organisation kann diese Pruefung nichts pruefen und
     * LAESST DURCH; unerreichbar ist der Zweig nur durch `rperm`, das zwei
     * Schichten hoeher `req.orgId` setzt. Erst protokollieren, dann (bei null
     * Treffern) auf 403 verengen — Owner-Freigabe 2026-10-02, Punkt 18.
     *
     * DIE ZWEI KOPIEN SIND ABSICHT UND EIN RISIKO. Eine gemeinsame Hilfsfunktion
     * waere schoener; sie wuerde aber `pool` und `logger` aus zwei Routern
     * zusammenfuehren und damit mehr aendern als dieser Schritt will. Dass beide
     * Kopien gleich bleiben, prueft `api/test/standortfilterNieAllein.test.js` —
     * dort ist die Gleichheit eine Zusicherung, nicht eine Hoffnung.
     */
    if (!req.orgId) {
      logger?.warn?.({
        route: req.originalUrl || req.path,
        method: req.method,
        locationId,
        userId: req.session?.userId || null
      }, "Standortfilter ohne Org-Kontext: Pruefung uebersprungen (ORG_CONTEXT_MISSING, Punkt 18 — Ablaufpfad fuer fail-closed)");
      return true;
    }
    try {
      await assertLocationBelongsToOrg(pool, locationId, req.orgId);
      return true;
    } catch (err) {
      if (err instanceof OrgBoundaryError) {
        res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION", message: err.message });
        return false;
      }
      throw err;
    }
  }

  /** GET /spend-analytics/summary */
  router.get("/spend-analytics/summary", requireAuth, featureGate, rperm("report.executive"), companyOrg, async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const filters = parseFilters(req.query);
      if (!await validateLocationScope(req, res, filters.locationId)) return;
      const data = await spendSvc.getSpendSummary(pool, orgId, filters);
      const scope = {
        org_id: orgId,
        location_id: filters.locationId || null,
        date_from: filters.dateFrom || null,
        date_to: filters.dateTo || null
      };
      res.json({ success: true, data, scope, generated_at: new Date().toISOString() });
    } catch (e) {
      logger.error({ err: e }, "spend-analytics summary");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /spend-analytics/by-vendor */
  router.get("/spend-analytics/by-vendor", requireAuth, featureGate, rperm("report.executive"), companyOrg, async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const filters = parseFilters(req.query);
      if (!await validateLocationScope(req, res, filters.locationId)) return;
      const data = await spendSvc.getSpendByVendor(pool, orgId, filters);
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "spend-analytics by-vendor");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /spend-analytics/by-category */
  router.get("/spend-analytics/by-category", requireAuth, featureGate, rperm("report.executive"), companyOrg, async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const filters = parseFilters(req.query);
      if (!await validateLocationScope(req, res, filters.locationId)) return;
      const data = await spendSvc.getSpendByCategory(pool, orgId, filters);
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "spend-analytics by-category");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /spend-analytics/by-region */
  router.get("/spend-analytics/by-region", requireAuth, featureGate, rperm("report.executive"), companyOrg, async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const filters = parseFilters(req.query);
      if (!await validateLocationScope(req, res, filters.locationId)) return;
      const data = await spendSvc.getSpendByRegion(pool, orgId, filters);
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "spend-analytics by-region");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /spend-analytics/over-time */
  router.get("/spend-analytics/over-time", requireAuth, featureGate, rperm("report.executive"), companyOrg, async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const filters = parseFilters(req.query);
      if (!await validateLocationScope(req, res, filters.locationId)) return;
      const data = await spendSvc.getSpendOverTime(pool, orgId, filters);
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "spend-analytics over-time");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /spend-analytics/rate-comparison */
  router.get("/spend-analytics/rate-comparison", requireAuth, featureGate, rperm("report.executive"), companyOrg, async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const filters = parseFilters(req.query);
      if (!await validateLocationScope(req, res, filters.locationId)) return;
      const data = await spendSvc.getRateComparison(pool, orgId, filters);
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "spend-analytics rate-comparison");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /spend-analytics/trends */
  router.get("/spend-analytics/trends", requireAuth, featureGate, rperm("report.executive"), companyOrg, async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const filters = parseFilters(req.query);
      if (!await validateLocationScope(req, res, filters.locationId)) return;
      const data = await spendSvc.getSpendTrends(pool, orgId, filters);
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "spend-analytics trends");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /spend-analytics/top-cost-drivers */
  router.get("/spend-analytics/top-cost-drivers", requireAuth, featureGate, rperm("report.executive"), companyOrg, async (req, res) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      const filters = parseFilters(req.query);
      if (!await validateLocationScope(req, res, filters.locationId)) return;
      const data = await spendSvc.getTopCostDrivers(pool, orgId, filters);
      res.json({ success: true, data });
    } catch (e) {
      logger.error({ err: e }, "spend-analytics top-cost-drivers");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
