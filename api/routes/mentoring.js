import { Router } from "express";
import * as mentoringService from "../services/mentoringService.js";

export function createMentoringRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  router.get("/mentoring/sessions", requireAuth, async (req, res) => {
    try {
      const role = req.query.role || "all";
      const sessions = await mentoringService.listSessions(pool, req.session.userId, role);
      res.json({ sessions });
    } catch (e) { logger.error({ err: e }, "GET /mentoring/sessions"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.post("/mentoring/sessions", requireAuth, async (req, res) => {
    try {
      const { mentee_id, topic, description, scheduled_at } = req.body || {};
      if (!mentee_id) return res.status(400).json({ error: "MENTEE_ID_REQUIRED" });
      const session = await mentoringService.createSession(pool, req.session.userId, mentee_id, { topic, description, scheduled_at });
      res.locals.audit = {
        action: "mentoring.session_create",
        entity_type: "mentoring_session",
        entity_id: session?.id || null,
        details: { mentee_id }
      };
      res.status(201).json(session);
    } catch (e) { logger.error({ err: e }, "POST /mentoring/sessions"); res.status(500).json({ error: "SERVER_ERROR" }); }
  });

  router.post("/mentoring/sessions/:id/complete", requireAuth, async (req, res) => {
    const result = await mentoringService.completeSession(pool, req.params.id, req.session.userId);
    if (!result) return res.status(404).json({ error: "NOT_FOUND_OR_INVALID_STATUS" });
    res.locals.audit = { action: "mentoring.session_complete", entity_type: "mentoring_session", entity_id: req.params.id };
    res.json(result);
  });

  router.post("/mentoring/sessions/:id/cancel", requireAuth, async (req, res) => {
    const result = await mentoringService.cancelSession(pool, req.params.id, req.session.userId);
    if (!result) return res.status(404).json({ error: "NOT_FOUND_OR_INVALID_STATUS" });
    res.locals.audit = { action: "mentoring.session_cancel", entity_type: "mentoring_session", entity_id: req.params.id };
    res.json(result);
  });

  router.post("/mentoring/sessions/:id/feedback", requireAuth, async (req, res) => {
    const { feedback, rating } = req.body || {};
    const result = await mentoringService.addFeedback(pool, req.params.id, req.session.userId, feedback, rating);
    if (!result) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "mentoring.session_feedback", entity_type: "mentoring_session", entity_id: req.params.id, details: { rating: rating ?? null } };
    res.json(result);
  });

  return router;
}
