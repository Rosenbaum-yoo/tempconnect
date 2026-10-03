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
     * ════════════════════════════════════════════════════════════════════════
     * DER ZWEIG SPERRT JETZT — fail-closed seit dem 2026-10-02
     * ════════════════════════════════════════════════════════════════════════
     *
     * Ohne Organisation kann diese Pruefung nichts pruefen: `location_id` gehoert
     * genau EINER Org, und ohne eigene Org gibt es nichts, wogegen man sie haelt.
     * Vorher gab der Zweig `true` zurueck — er LIESS DURCH. Der Dienst darunter
     * baut seine Org-Bedingung bedingt (`if (orgId)`), die Standort-Bedingung
     * unbedingt: zusammen waere das eine Abfrage, die NUR nach Standort filtert,
     * also ein Lesezugriff auf eine fremde Organisation.
     *
     * WARUM DIE VERENGUNG JETZT KOMMT, UND WAS SIE NICHT HAT (Owner-Anweisung
     * 2026-10-02). Der Zwischenschritt davor hatte eine Abloese-Bedingung: null
     * Treffer ueber einen vereinbarten Beobachtungszeitraum. DIESE BEDINGUNG IST
     * NICHT ERFUELLT, und zwar nicht weil Treffer kamen, sondern weil der Zeitraum
     * nicht beginnen KONNTE. Der Grund ist staerker als zuerst angenommen:
     * `docker inspect tempconnect_api` zeigt genau DREI Einbindungen
     * (frontend/public/js, sql/migrations, uploads) — `routes/` ist KEINE davon,
     * es liegt IM ABBILD. Die Fassung dort ist noch die urspruengliche,
     * verschmolzene Form `if (!locationId || !req.orgId) return true;`, ohne jede
     * Protokollzeile. Also haette auch eine Aenderung am Haupt-Repo die Datei nie
     * erreicht, nur ein Neubau. Die "0 Treffer" im Protokoll sind die Abwesenheit
     * einer Messung, und ein `grep` auf ORG_CONTEXT_MISSING in `docker logs` ist
     * wertlos, weil die Zeichenkette im Abbild gar nicht vorkommt.
     *
     * Die Verengung steht deshalb auf dem ANALYTISCHEN Beweis, nicht auf
     * Beobachtung — und der ist belegt und bewacht, in drei Schichten
     * (`api/test/standortfilterNieAllein.test.js`):
     *
     *   SCHICHT 1  jede Route, die diesen Pruefer erreicht, traegt `rperm(...)`
     *   SCHICHT 2  `requirePermission` setzt `req.orgId` ODER antwortet
     *              403 NO_ORG_MEMBERSHIP — es gibt keinen next()-Pfad dazwischen
     *   SCHICHT 3  wo beides gegeben ist, steht beides auch im SQL
     *
     * Der Zweig ist damit unerreichbar, und die Verengung kostet keinen
     * erreichbaren Aufrufer. Faellt SCHICHT 1 kuenftig (eine neue Route ohne
     * `rperm`), wird die Probe rot, BEVOR jemand eine 403 bekommt.
     *
     * GEMESSEN (Wirkungs-Erhebung 2026-10-02, vier Blickwinkel mit Gegenpruefung):
     * 13 Aufrufstellen, alle mit `rperm`; `requirePermission` hat genau EIN
     * `next()`, unmittelbar nach `req.orgId = membership?.org_id || orgId || null`,
     * und `org_memberships.org_id` ist NOT NULL (0 aktive Mitgliedschaften mit
     * NULL). Von 447 Nutzern bekommen 169 schon heute 403 NO_ORG_MEMBERSHIP an
     * `rperm` — vor und nach der Verengung dieselbe Antwort. Die Menge "bekam
     * vorher Daten, bekommt jetzt 403" ist LEER.
     *
     * UND ZWEI SCHICHTEN MEHR, als der Beweis oben braucht: in
     * `spendAnalytics.js` steht VOR jedem der acht Aufrufe schon
     * `if (!orgId) return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" })`.
     * Dort ist dieser Zweig DOPPELT unerreichbar und die Verhaltensaenderung exakt
     * null. Nur vier Routen in `reporting.js` (`/requisitions`, `/timeline`,
     * `/sla`, `/top-roles`) haben `rperm` als ALLEINIGE Schicht — das sind die
     * Stellen, an denen eine 403 ueberhaupt erscheinen koennte, wenn SCHICHT 2 je
     * bricht.
     *
     * UND DAS PROTOKOLL BLEIBT STEHEN, obwohl der Zweig jetzt abweist. Es ist
     * nicht mehr die Entscheidungsgrundlage, sondern die Diagnose: eine 403 ohne
     * Protokolleintrag laesst den Betroffenen und den Betreiber gleichermassen
     * ratlos. Die Kennung ORG_CONTEXT_MISSING bleibt dieselbe, damit eine
     * bestehende Suche sie weiter findet.
     */
    if (!req.orgId) {
      logger?.warn?.({
        route: req.originalUrl || req.path,
        method: req.method,
        locationId,
        userId: req.session?.userId || null
      }, "Standortfilter ohne Org-Kontext: ABGEWIESEN (ORG_CONTEXT_MISSING, Punkt 18 — fail-closed seit 2026-10-02)");
      res.status(403).json({
        error: "ORG_CONTEXT_REQUIRED",
        message: "Ein Standortfilter braucht einen Organisationskontext."
      });
      return false;
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
