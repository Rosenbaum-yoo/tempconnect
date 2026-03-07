import { z } from "zod";
import { Router } from "express";
import * as ratingService from "../services/ratingService.js";

const ratingSchema = z.object({
  request_id: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  reliability: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  quality: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().nullable()
});

export function createRatingsRouter(deps) {
  const { pool, getUserAndPlan, requireAuth, logger } = deps;
  const router = Router();

  router.post("/ratings", requireAuth, async (req, res) => {
    const parsed = ratingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const { request_id, stars, reliability, communication, quality, comment } = parsed.data;
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (!me.is_verified) return res.status(403).json({ error: "EMAIL_NOT_VERIFIED" });
      const reqData = await ratingService.getRequestForRating(pool, request_id);
      if (!reqData) return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
      if (reqData.status !== "FINALIZED") return res.status(400).json({ error: "REQUEST_NOT_FINALIZED" });
      const isRequester = reqData.requester_id === req.session.userId;
      const isReceiver = reqData.receiver_id === req.session.userId;
      if (!isRequester && !isReceiver) return res.status(403).json({ error: "NOT_PARTICIPANT" });
      const rated_id = isRequester ? reqData.receiver_id : reqData.requester_id;
      const daysSinceDeal = (Date.now() - new Date(reqData.created_at)) / (1000 * 60 * 60 * 24);
      if (daysSinceDeal > 30) return res.status(400).json({ error: "RATING_WINDOW_EXPIRED" });
      if (await ratingService.checkExistingRating(pool, request_id, req.session.userId)) {
        return res.status(409).json({ error: "ALREADY_RATED" });
      }
      const rating = await ratingService.submitRating(pool, {
        requestId: request_id, raterId: req.session.userId, ratedId: rated_id,
        stars, reliability, communication, quality, comment
      });
      res.locals.audit = { action: "rating.submit", entity_type: "rating", entity_id: rating.id, details: { request_id, rated_id, stars } };
      res.json(rating);
    } catch (e) {
      logger.error({ err: e }, "POST /api/ratings");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/users/:id/ratings", async (req, res) => {
    const userId = String(req.params.id);
    try {
      const [ratings, stats] = await Promise.all([
        ratingService.getUserRatings(pool, userId),
        ratingService.getRatingStats(pool, userId)
      ]);
      res.json({ ratings, stats });
    } catch (e) {
      logger.error({ err: e }, "GET /api/users/:id/ratings");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/ratings/pending", requireAuth, async (req, res) => {
    try {
      const rows = await ratingService.getPendingRatings(pool, req.session.userId);
      res.json(rows);
    } catch (e) {
      logger.error({ err: e }, "GET /api/ratings/pending");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /users/:id/reputation — aggregated reputation from supplier_reputation */
  router.get("/users/:id/reputation", async (req, res) => {
    try {
      const reputationService = await import("../services/reputationService.js");
      const reputation = await reputationService.getReputation(pool, req.params.id);
      if (!reputation) return res.json({ reputation: null, message: "No reputation data yet" });
      res.json({ reputation });
    } catch (e) {
      logger.error({ err: e }, "GET /api/users/:id/reputation");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
