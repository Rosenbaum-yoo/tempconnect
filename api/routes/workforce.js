/**
 * Workforce Management REST-Router: operative Einsatzuebersicht.
 * Konsolidiert Assignments, Worker-Links, Timesheets, Submissions.
 * Alle Endpoints sind org-scoped (buyer OR supplier) mit RBAC.
 */
import { Router } from "express";
import * as workforceService from "../services/workforceService.js";
// Welle K3: der Monat als Fenster. Zwei Spuren, keine Zustimmungspflicht.
import { monatsplan, seiteFuerOrg } from "../services/monatsplanService.js";
import { requirePermission } from "../middleware/rbac.js";

export function createWorkforceRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });

  /** GET /workforce/overview — konsolidierte Einsatzliste */
  router.get("/workforce/overview", requireAuth, rperm("assignment.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const items = await workforceService.getWorkforceOverview(pool, orgId, {
        status:          req.query.status          || null,
        lifecycle_bucket: req.query.lifecycle_bucket || null,
        supplier_org_id: req.query.supplier_org_id || null,
        date_from:       req.query.date_from       || null,
        date_to:         req.query.date_to         || null,
        search:          req.query.search          || null,
        limit:           parseInt(req.query.limit, 10) || 100
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  /** GET /workforce/kpis — aggregierte Workforce-KPIs */
  router.get("/workforce/kpis", requireAuth, rperm("assignment.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const kpis = await workforceService.getWorkforceKpis(pool, orgId);
      res.json(kpis);
    } catch (err) { next(err); }
  });

  /** GET /workforce/pending-actions — priorisierte offene Aktionen */
  router.get("/workforce/pending-actions", requireAuth, rperm("assignment.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const actions = await workforceService.getPendingActions(
        pool, orgId, parseInt(req.query.limit, 10) || 20
      );
      res.json({ items: actions, total: actions.length });
    } catch (err) { next(err); }
  });

  /** GET /workforce/:assignmentId/detail — konsolidierte Einsatzdetails */
  router.get("/workforce/:assignmentId/detail", requireAuth, rperm("assignment.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const detail = await workforceService.getWorkforceDetail(pool, req.params.assignmentId, orgId);
      if (!detail) return res.status(404).json({ error: "NOT_FOUND" });
      if (detail.error === 'ORG_BOUNDARY_VIOLATION') return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      res.json(detail);
    } catch (err) { next(err); }
  });

  /**
   * GET /workforce/monatsplan — der Monat als Fenster (Welle K3.3/K3.4).
   *
   * DIE SPUR WIRD ABGELEITET, NICHT ERFRAGT. `seiteFuerOrg` liest den Typ der
   * Organisation; ein Einsatzunternehmen kann die Agentur-Sicht nicht anfordern.
   * Der Zuschnitt ist verschieden — die Agentur sieht bei einer Doppelbelegung
   * die Gegenseite mit Namen, der Kunde nicht.
   *
   * Die Mandantengrenze steht im Dienst (`WHERE a.org_id = $1` bzw.
   * `a.supplier_org_id = $1`), nicht hier: sie gehoert an die Abfrage, nicht in
   * eine Nachpruefung, die man vergessen kann.
   */
  router.get("/workforce/monatsplan", requireAuth, rperm("assignment.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });

      const seite = await seiteFuerOrg(pool, orgId);
      const plan = await monatsplan(pool, {
        orgId,
        seite,
        // Ein unbrauchbarer Monat faellt auf den laufenden zurueck, statt zu
        // werfen — E-K3-2 erlaubt ausdruecklich auch vergangene Monate.
        monat: typeof req.query.monat === "string" ? req.query.monat : null
      });
      res.json(plan);
    } catch (err) { next(err); }
  });

  return router;
}
