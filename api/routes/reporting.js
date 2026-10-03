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
