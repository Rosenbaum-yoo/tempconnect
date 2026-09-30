/**
 * Workforce Management REST-Router: operative Einsatzuebersicht.
 * Konsolidiert Assignments, Worker-Links, Timesheets, Submissions.
 * Alle Endpoints sind org-scoped (buyer OR supplier) mit RBAC.
 */
import { Router } from "express";
import * as workforceService from "../services/workforceService.js";
// Welle K3: der Monat als Fenster. Zwei Spuren, keine Zustimmungspflicht.
import {
  monatsplan, seiteFuerOrg, planungsVorschau, mitarbeiterMonat
} from "../services/monatsplanService.js";
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

  /**
   * GET /workforce/monatsplan/vorschau — was bricht, WENN ich so plane? (K3.5)
   *
   * Der Kern von Abschnitt 3b: die Doppelbelegung soll beim PLANEN auffallen,
   * nicht am Einsatztag. Beide Schreibwege gibt es laengst
   * (`POST /marketplace/demand-requests`,
   * `POST /workers/staffing-assignments/:id/quick-assign`) — nur sagen beide
   * erst NACH dem Schreiben, ob etwas kollidiert.
   *
   * LESEND UND FOLGENLOS. Deshalb GET und `assignment.view`: die Vorschau darf
   * jeder anschauen, der den Plan sehen darf. Wer schreiben will, geht ueber den
   * bestehenden Schreibweg — mit dessen Rechten, dessen CSRF und dessen Audit.
   * Eine zweite Schreibtuer neben `quick-assign` waere eine Schattenwahrheit.
   *
   * Die beiden Riegel (der Einsatz gehoert der Firma, die Kraft auch) stehen im
   * Dienst, nicht hier: sie gehoeren an die Abfrage, nicht in eine Nachpruefung,
   * die man vergessen kann.
   */
  router.get("/workforce/monatsplan/vorschau", requireAuth, rperm("assignment.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });

      const seite = await seiteFuerOrg(pool, orgId);
      const ergebnis = await planungsVorschau(pool, {
        orgId,
        seite,
        workerUserId: typeof req.query.worker_user_id === "string" ? req.query.worker_user_id : null,
        assignmentId: typeof req.query.assignment_id === "string" ? req.query.assignment_id : null
      });

      if (ergebnis?.fehler) {
        /* Fremder Einsatz und fremde Kraft antworten BEIDE mit 403 und ohne
         * Zusatzangabe: ein 404 fuer das eine und ein 403 fuer das andere waere
         * ein Auskunftsdienst darueber, welche Kennungen es gibt. */
        const kode = {
          UNVOLLSTAENDIG: 400,
          NUR_AGENTURSPUR: 400,
          EINSATZ_NICHT_GEFUNDEN: 404,
          FREMDER_EINSATZ: 403,
          FREMDE_KRAFT: 403
        }[ergebnis.fehler] || 400;
        return res.status(kode).json({ error: ergebnis.fehler });
      }

      res.json(ergebnis);
    } catch (err) { next(err); }
  });

  /**
   * GET /workforce/monatsplan/mitarbeiter — der Monat je Mitarbeiter (K3.7)
   *
   * DAS EINSATZ-RASTER ZEIGT DIE MINDERHEIT. Gemessen am 2026-08-31: von 31
   * Mitarbeitern der Zeitarbeitsfirmen erscheinen im April-Raster VIER — der
   * Rest hat in diesem Monat keinen Einsatz und kommt deshalb gar nicht vor.
   * Das sind genau die, die man verplanen will.
   *
   * Diese Ansicht dreht die Achse: Zeilen sind MENSCHEN, und die freie Spanne
   * ist der Inhalt, nicht die Luecke zwischen zwei Balken.
   *
   * DIE FIRMA ERGIBT SICH AUS DEM BESITZ DER PERSONALAKTE
   * (`worker_profiles.supplier_org_id`), nicht aus dem Organisationstyp. Wer
   * Personalakten fuehrt, sieht seine eigenen — und nur die. Die Spur entscheidet
   * hier nur ueber den ZUSCHNITT (ob Entleiher-Namen und Abwesenheitsgruende
   * mitgehen), so wie im Einsatz-Raster.
   */
  router.get("/workforce/monatsplan/mitarbeiter", requireAuth, rperm("worker.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId;
      if (!orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });

      const seite = await seiteFuerOrg(pool, orgId);
      const plan = await mitarbeiterMonat(pool, {
        orgId,
        seite,
        monat: typeof req.query.monat === "string" ? req.query.monat : null
      });
      res.json(plan);
    } catch (err) { next(err); }
  });

  return router;
}
