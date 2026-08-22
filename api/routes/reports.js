import { z } from "zod";
import { Router } from "express";
import * as reportService from "../services/reportService.js";

const reportSchema = z.object({
  reported_user_id: z.string().uuid(),
  request_id: z.string().uuid().optional().nullable(),
  reason: z.enum(["spam", "betrug", "belaestigung", "sonstiges"]),
  comment: z.string().max(1000).optional().nullable()
});

export function createReportsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  router.post("/reports", requireAuth, async (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const { reported_user_id, request_id, reason, comment } = parsed.data;
    const reporterId = req.session.userId;
    if (reported_user_id === reporterId) return res.status(400).json({ error: "CANNOT_REPORT_SELF" });
    try {
      /*
       * DAS ORAKEL IST GESCHLOSSEN — die offene Frage dahinter nicht.
       *
       * BEFUND (2026-08-22): Diese Route antwortete auf vier unterscheidbare
       * Weisen — 404 USER_NOT_FOUND, 404 REQUEST_NOT_FOUND, 403 NOT_PARTICIPANT,
       * 400 REPORTED_USER_NOT_IN_REQUEST. Jeder angemeldete Nutzer konnte damit
       * eine beliebige Nutzer- oder Anfragekennung darauf pruefen, ob es sie
       * gibt und wer daran beteiligt war. `requireAuth` ist die einzige Huerde;
       * `request_id` ist optional (:7) und die Beteiligungspruefung steht hinter
       * `if (request_id)` — wer das Feld weglaesst, umgeht sie vollstaendig.
       *
       * Dieselbe Klasse Fehler wie bei `/offers/:id/report`, wo sie heute schon
       * geschlossen wurde: "gibt es nicht" und "gehoert nicht zu dir" bekommen
       * DIESELBE Antwort, und das Protokoll unterscheidet.
       *
       * WAS DAS HIER NICHT ENTSCHEIDET: ob es Personen-Meldungen ueberhaupt
       * geben soll. Die Route hat 0 Aufrufer im Repo und 0 Zeilen in der
       * Datenbank; ob sie entfernt, gehaertet (Pflicht-`request_id`) oder in
       * `profile_abuse_reports` zusammengefuehrt wird, ist eine Owner-Frage.
       * Bis dahin verraet sie wenigstens nichts mehr. Der Registereintrag
       * (`wachen.json`, wachart BEFUND) haelt den offenen Punkt fest.
       */
      const abweisen = (grund) => {
        logger.warn({ reporterId, grund }, "POST /reports abgewiesen");
        return res.status(404).json({ error: "NOT_FOUND" });
      };

      if (!(await reportService.userExists(pool, reported_user_id))) {
        return abweisen("reported_user_unknown");
      }
      if (request_id) {
        const v = await reportService.validateReportRequest(pool, request_id, reporterId, reported_user_id);
        if (!v.found) return abweisen("request_unknown");
        if (!v.reporterIsParticipant) return abweisen("reporter_not_participant");
        if (!v.reportedIsParticipant) return abweisen("reported_not_participant");
      }
      await reportService.submitReport(pool, { reporterId, reportedUserId: reported_user_id, requestId: request_id, reason, comment });
      res.locals.audit = { action: "report.submit", entity_type: "report", details: { reported_user_id, reason } };
      res.json({ ok: true, message: "Meldung wurde uebermittelt. Wir pruelfen den Fall." });
    } catch (e) {
      logger.error({ err: e }, "POST /api/reports");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
