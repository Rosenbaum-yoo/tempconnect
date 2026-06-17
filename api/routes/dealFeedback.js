/**
 * dealFeedback.js — Routen für Deal-Feedback v2 (eBay-modelliert).
 * Gemountet auf /api (orgContext -> req.orgId, csrfProtect auto auf Mutationen).
 * Logik + Guards liegen im dealFeedbackService; die Routen sind dünne HTTP-Wrapper.
 * Spec: docs/finalization/RATING_SYSTEM_V2_EBAY_SPEC.md
 */
import { z } from "zod";
import { Router } from "express";
import * as dealFeedbackService from "../services/dealFeedbackService.js";

const submitSchema = z.object({
  assignment_id: z.string().uuid(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  dimensions: z.record(z.number().int().min(1).max(5)),
  comment: z.string().max(500).optional().nullable()
});

// Service-Fehlercode -> HTTP-Status
const ERROR_STATUS = {
  NOT_FOUND: 404,
  NOT_COMPLETED: 409,
  FORBIDDEN: 403,
  NO_COUNTERPARTY: 409,
  WINDOW_CLOSED: 409,
  INVALID_SENTIMENT: 400,
  INVALID_DIMENSIONS: 400,
  COMMENT_TOO_LONG: 400,
  ALREADY_RATED: 409
};

export function createDealFeedbackRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  /** Bewertbare abgeschlossene Deals der aktiven Org. */
  router.get("/deal-feedback/pending", requireAuth, async (req, res) => {
    try {
      if (!req.orgId) return res.json({ items: [], total: 0 });
      const items = await dealFeedbackService.getPendingFeedback(pool, { orgIds: [req.orgId] });
      res.json({ items, total: items.length });
    } catch (e) {
      logger.error({ err: e }, "GET /deal-feedback/pending");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** Feedback abgeben (transaktions-verankert, mutual-blind, auto-moderiert). */
  router.post("/deal-feedback", requireAuth, async (req, res) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      if (!req.orgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const result = await dealFeedbackService.submitFeedback(pool, {
        assignmentId: parsed.data.assignment_id,
        raterOrgId: req.orgId,
        actorUserId: req.session.userId,
        sentiment: parsed.data.sentiment,
        dimensions: parsed.data.dimensions,
        comment: parsed.data.comment || null
      });
      if (result.error) return res.status(ERROR_STATUS[result.error] || 400).json({ error: result.error });
      res.locals.audit = {
        action: "deal_feedback.submit",
        entity_type: "deal_feedback",
        entity_id: result.feedback.id,
        details: { assignment_id: parsed.data.assignment_id, direction: result.feedback.direction, revealed: result.revealed, auto_flagged: result.flagged }
      };
      res.json({ id: result.feedback.id, direction: result.feedback.direction, status: result.feedback.status, revealed: !!result.revealed });
    } catch (e) {
      logger.error({ err: e }, "POST /deal-feedback");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** Öffentliches Feedback + Reputations-Summary einer Org (eBay-Profil). */
  router.get("/deal-feedback/org/:orgId", requireAuth, async (req, res) => {
    try {
      const [items, summary] = await Promise.all([
        dealFeedbackService.getOrgFeedback(pool, req.params.orgId),
        dealFeedbackService.getOrgReputationSummary(pool, req.params.orgId)
      ]);
      res.json({ items, total: items.length, summary });
    } catch (e) {
      logger.error({ err: e }, "GET /deal-feedback/org/:orgId");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
