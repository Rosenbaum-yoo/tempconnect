/**
 * Reputation Routes — /api/reputation/*
 *
 * Display-ready Reputation Endpoints für Marktplatz-Vertrauen.
 * Liefert strukturierte Reputation Cards, Signale und Leaderboard.
 */

import { Router } from "express";
import * as reputationService from "../services/reputationService.js";

/**
 * @param {{ pool, requireAuth, logger }} deps
 */
export function createReputationRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  router.get("/reputation/my-card", requireAuth, async (req, res) => {
    try {
      const card = await reputationService.getPublicReputationCard(pool, req.session.userId);
      res.json(card || null);
    } catch (e) {
      logger.error({ err: e.message }, "GET /reputation/my-card");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/reputation/:id/card ──────────────────── */

  router.get("/reputation/:id/card", requireAuth, async (req, res) => {
    try {
      const card = await reputationService.getPublicReputationCard(pool, req.params.id);
      if (!card) {
        return res.json({
          reputation: null,
          message: "Noch keine Reputationsdaten vorhanden."
        });
      }
      res.json({ reputation: card });
    } catch (e) {
      logger.error({ err: e.message }, "GET /reputation/:id/card");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/reputation/:id/signals ───────────────── */

  router.get("/reputation/:id/signals", requireAuth, async (req, res) => {
    try {
      const card = await reputationService.getPublicReputationCard(pool, req.params.id);
      if (!card) {
        return res.json({ signals: [], message: "Keine Daten." });
      }
      res.json({
        supplier_id: card.supplier_id,
        grade: card.grade,
        grade_label: card.grade_label,
        signals: card.signals
      });
    } catch (e) {
      logger.error({ err: e.message }, "GET /reputation/:id/signals");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/reputation/top ───────────────────────── */

  router.get("/reputation/top", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
      const rows = await reputationService.topSuppliers(pool, limit);

      const items = rows.map(r => ({
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        grade: r.grade,
        grade_label: ({ PLATINUM: 'Platin', GOLD: 'Gold', SILVER: 'Silber', BRONZE: 'Bronze' })[r.grade] || r.grade,
        reputation_score: r.reputation_score != null ? Number(r.reputation_score) : null,
        avg_stars: r.avg_stars != null ? Number(r.avg_stars) : null,
        total_ratings: r.total_ratings || 0,
        completed_deals: r.completed_deals || 0
      }));

      res.json({ items, total: items.length });
    } catch (e) {
      logger.error({ err: e.message }, "GET /reputation/top");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
