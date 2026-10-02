/**
 * Reporting REST-Router: Executive Dashboard, KPIs, Vendor Performance, Compliance.
 */
import { Router } from "express";
import * as reportingService from "../services/reportingService.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireCompanyOrg } from "../middleware/orgAccess.js";
import { requireOrgFeature } from "../middleware/entitlementGuard.js";
import { assertLocationBelongsToOrg, OrgBoundaryError } from "../utils/orgBoundary.js";

export function createReportingRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const companyOrg = requireCompanyOrg(deps, {
    errorCode: "EXECUTIVE_REPORTING_NOT_AVAILABLE_FOR_ORG_TYPE",
    errorMessage: "Executive Reporting steht nur fuer Unternehmensorganisationen zur Verfuegung."
  });
  // Entitlement-Gate: Executive-Reporting (Dashboard + Finance-Truth-Export) ist als
  // INDIVIDUELL-Feature verkauft (planFeatures: enterprise_analytics). Pilot-aware via
  // requireOrgFeature → aktive Piloten (effective_plan=INDIVIDUELL) behalten Zugang;
  // zahlende Tarife unterhalb INDIVIDUELL erhalten korrekt FEATURE_NOT_ENABLED.
  // Operationale Reports (report.operational) bleiben bewusst ungegated.
  const enterpriseAnalyticsGate = requireOrgFeature("enterprise_analytics", { pool, logger });

  /**
   * Validiert optional location_id gegen die Org des Aufrufers.
   * Gibt false zurueck und setzt 403 wenn Violation; true wenn OK.
   */
  async function validateLocationScope(req, res, locationId) {
    if (!locationId) return true;
    /*
     * ═══════════════════════════════════════════════════════════════════════
     * DER ZWEIG, DER DURCHLAESST — JETZT LAUT, NOCH NICHT GESCHLOSSEN
     * ═══════════════════════════════════════════════════════════════════════
     *
     * Ohne Organisation kann diese Pruefung nichts pruefen: `location_id` gehoert
     * genau EINER Org, und ohne eigene Org gibt es nichts, wogegen man sie haelt.
     * Sie gibt deshalb `true` zurueck — sie LAESST DURCH, statt zu sperren. Der
     * Dienst darunter baut seine Org-Bedingung bedingt (`if (orgId)`), die
     * Standort-Bedingung unbedingt: zusammen waere das eine Abfrage, die NUR nach
     * Standort filtert, also ein Lesezugriff auf eine fremde Organisation.
     *
     * HEUTE IST DAS UNERREICHBAR, und zwar nicht hier, sondern zwei Schichten
     * hoeher: `requirePermission` setzt `req.orgId` (rbac.js) und antwortet ohne
     * Mitgliedschaft `403 NO_ORG_MEMBERSHIP`. Gemessen am 2026-10-02: alle 16
     * standortgebundenen Routen in dieser und in spendAnalytics.js tragen
     * `rperm(...)`. Festgenagelt von `api/test/standortfilterNieAllein.test.js`
     * ueber alle drei Schichten.
     *
     * WARUM HIER ERST EIN PROTOKOLL UND NOCH KEIN 403 (Owner-Freigabe 2026-10-02,
     * Punkt 18): fail-closed ist eine Verhaltensaenderung. Feuert diese Zeile
     * ueber einen vereinbarten Zeitraum NIE, ist die Verengung gratis — dann
     * kostet sie niemanden etwas. Feuert sie doch, haben wir den Aufrufer
     * gefunden, der sonst eine 403 bekommen haette, OHNE dass jemand von ihm
     * wusste. Der Umweg ist nicht Zoegern, er macht die Aenderung messbar.
     *
     * ABLOESE-BEDINGUNG, damit das hier nicht dauerhaft steht: null Treffer ueber
     * den vereinbarten Zeitraum -> der `return true` wird zu
     * `res.status(403).json({ error: "ORG_CONTEXT_REQUIRED" })`.
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

  /** GET /reporting/dashboard – Executive Dashboard (kombinierte KPIs) */
  router.get("/reporting/dashboard", requireAuth, enterpriseAnalyticsGate, rperm("report.executive"), companyOrg, async (req, res) => {
    const orgId = req.orgId || null;
    const locationId = req.query.location_id || null;
    if (!await validateLocationScope(req, res, locationId)) return;
    const data = await reportingService.executiveDashboard(pool, orgId, locationId);
    res.json(data);
  });

  /** GET /reporting/finance-truth/export – Executive Finance Truth Export (CSV/JSON) */
  router.get("/reporting/finance-truth/export", requireAuth, enterpriseAnalyticsGate, rperm("report.executive"), companyOrg, async (req, res, next) => {
    try {
      const orgId = req.orgId || null;
      const format = String(req.query.format || "csv").toLowerCase();
      if (!["csv", "json"].includes(format)) {
        return res.status(400).json({ error: "INVALID_FORMAT", message: "format must be csv or json" });
      }
      const exported = await reportingService.executiveFinanceTruthExport(pool, orgId);
      const actorUserId = req?.session?.userId || req?.user?.id || null;
      res.locals.audit = {
        action: "report.finance_truth_export",
        entity_type: "organization",
        entity_id: orgId || "platform",
        details: {
          format,
          row_count: exported.rows.length,
          generated_at: exported.generated_at,
          source: exported.source,
          generator: "reporting.executiveFinanceTruthExport",
          responsible_actor_user_id: actorUserId
        }
      };
      if (format === "json") {
        return res.json({
          generated_at: exported.generated_at,
          org_id: exported.org_id,
          source: exported.source,
          rows: exported.rows,
          finance: exported.finance
        });
      }
      const filename = `finance-truth-${new Date(exported.generated_at).toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(exported.csv);
    } catch (err) {
      next(err);
    }
  });

  /** GET /reporting/requisitions – Requisition KPIs */
  router.get("/reporting/requisitions", requireAuth, rperm("report.operational"), async (req, res) => {
    const orgId = req.orgId || null;
    const locationId = req.query.location_id || null;
    if (!await validateLocationScope(req, res, locationId)) return;
    const kpis = await reportingService.requisitionKpis(pool, orgId, locationId);
    res.json(kpis);
  });

  /** GET /reporting/requisitions/timeline – Requisitions pro Tag */
  router.get("/reporting/requisitions/timeline", requireAuth, rperm("report.operational"), async (req, res) => {
    const orgId = req.orgId || null;
    const locationId = req.query.location_id || null;
    if (!await validateLocationScope(req, res, locationId)) return;
    const days = parseInt(req.query.days, 10) || 30;
    const timeline = await reportingService.requisitionsByPeriod(pool, orgId, days, locationId);
    res.json({ timeline });
  });

  /** GET /reporting/vendors – Vendor Performance */
  router.get("/reporting/vendors", requireAuth, rperm("report.supplier"), companyOrg, async (req, res) => {
    // F-006 fix: use server-resolved orgId
    const clientOrgId = req.orgId;
    if (!clientOrgId) return res.status(400).json({ error: "client_org_id required" });
    const vendors = await reportingService.vendorPerformance(
      pool, clientOrgId, parseInt(req.query.limit, 10) || 20
    );
    res.json({ vendors });
  });

  /** GET /reporting/compliance – Compliance Summary (org-scoped, kein Standortfilter) */
  router.get("/reporting/compliance", requireAuth, rperm("report.operational"), async (req, res) => {
    const orgId = req.orgId || null;
    const summary = await reportingService.complianceSummary(pool, orgId);
    res.json(summary);
  });

  /** GET /reporting/sla – SLA Report */
  router.get("/reporting/sla", requireAuth, rperm("report.operational"), async (req, res) => {
    const orgId = req.orgId || null;
    const locationId = req.query.location_id || null;
    if (!await validateLocationScope(req, res, locationId)) return;
    const days = parseInt(req.query.days, 10) || 30;
    const report = await reportingService.slaReport(pool, orgId, days, locationId);
    res.json(report);
  });

  /** GET /reporting/top-roles – Meistgesuchte Rollen */
  router.get("/reporting/top-roles", requireAuth, rperm("report.operational"), async (req, res) => {
    const orgId = req.orgId || null;
    const locationId = req.query.location_id || null;
    if (!await validateLocationScope(req, res, locationId)) return;
    const roles = await reportingService.topRoles(pool, orgId, parseInt(req.query.limit, 10) || 10, locationId);
    res.json({ roles });
  });

  return router;
}
