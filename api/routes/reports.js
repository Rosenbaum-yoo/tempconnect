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
      if (!(await reportService.userExists(pool, reported_user_id))) {
        return res.status(404).json({ error: "USER_NOT_FOUND" });
      }
      if (request_id) {
        const v = await reportService.validateReportRequest(pool, request_id, reporterId, reported_user_id);
        if (!v.found) return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
        if (!v.reporterIsParticipant) return res.status(403).json({ error: "NOT_PARTICIPANT" });
        if (!v.reportedIsParticipant) return res.status(400).json({ error: "REPORTED_USER_NOT_IN_REQUEST" });
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
