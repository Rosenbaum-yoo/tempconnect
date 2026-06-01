/**
 * Profile Rankings Routes — Marketplace Visibility Center (M-04)
 *
 * Endpoints:
 *   GET /profile-rankings                — kuratiertes Ranking (Top 100, kein Auth)
 *   GET /profile-rankings/me             — eigener Rang (PRO+)
 *   GET /profile-rankings?segment=GOLD   — nach Segment gefiltert
 *
 * Plan-Gates:
 *   marketplace_ranking_participation  PRO, INDIVIDUELL
 *     (benötigt zum Lesen des eigenen Rangs; oeffentliches Ranking ist open)
 */

import { z } from "zod";
import { Router } from "express";
import * as rankingSvc from "../services/profileRankingService.js";

const rankingQuerySchema = z.object({
  segment: z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"]).optional(),
  limit:   z.coerce.number().int().min(1).max(100).optional().default(50)
});

export function createProfileRankingsRouter(deps) {
  const { pool, requireAuth, requireFeature, logger } = deps;
  const router = Router();

  const ok   = (res, data) => res.json({ success: true, data });
  const fail = (res, status, code, msg) =>
    res.status(status).json({ success: false, error: { code, message: msg } });

  const rankingAccess = requireFeature("marketplace_ranking_participation");

  /* ── Öffentliches Ranking (kein Auth) ─────────────────── */

  router.get("/profile-rankings", async (req, res) => {
    const parsed = rankingQuerySchema.safeParse(req.query);
    const { segment = null, limit = 50 } = parsed.success ? parsed.data : {};
    try {
      const data = await rankingSvc.getPublicRanking(pool, {
        limit: Math.min(100, limit),
        segment: segment || null
      });
      ok(res, { items: data, total: data.length });
    } catch (e) {
      logger.error({ err: e }, "GET /profile-rankings");
      fail(res, 500, "SERVER_ERROR", "Ranking konnte nicht geladen werden.");
    }
  });

  /* ── Eigener Rang (PRO+) ───────────────────────────────── */

  router.get("/profile-rankings/me", requireAuth, rankingAccess, async (req, res) => {
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const data = await rankingSvc.getOrgRankInfo(pool, req.orgId);
      if (!data) return ok(res, { rank_position: null, rank_segment: null, effective_rank_score: null });
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "GET /profile-rankings/me");
      fail(res, 500, "SERVER_ERROR", "Rang konnte nicht geladen werden.");
    }
  });

  return router;
}
