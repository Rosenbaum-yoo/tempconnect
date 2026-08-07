/**
 * Bounty & Milestone Routes — /api/bounties/*, /api/milestones/*, /api/value-report
 */

import { Router } from "express";
import * as bountyService from "../services/bountyService.js";
import { getTierStatus, getUserTier } from "../services/bountyTierService.js";

export function createBountyRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  /* ── GET /api/bounties/me — full bounty status + progress ── */
  router.get("/bounties/me", requireAuth, async (req, res) => {
    try {
      // Re-evaluate bounties on each view (lightweight enough)
      const ergebnisse = await bountyService.evaluateBounties(pool, req.session.userId);
      await bountyService.checkAndAwardMilestones(pool, req.session.userId);

      // Die Begruendungen entstehen bei der Auswertung; sie hier
      // durchzureichen spart eine zweite Runde derselben Abfragen.
      const notes = new Map(
        (ergebnisse || []).filter((r) => r.note).map((r) => [r.key, r.note])
      );
      const status = await bountyService.getBountyStatus(pool, req.session.userId, { notes });
      res.json(status);
    } catch (e) {
      logger.error({ err: e.message }, "GET /bounties/me");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/bounties/catalog — all available bounties ──── */
  router.get("/bounties/catalog", requireAuth, async (req, res) => {
    try {
      const catalog = await bountyService.getBountyCatalog(pool);
      res.json({ items: catalog });
    } catch (e) {
      logger.error({ err: e.message }, "GET /bounties/catalog");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/bounties/discount — current discount % ─────── */
  router.get("/bounties/discount", requireAuth, async (req, res) => {
    try {
      const discount = await bountyService.getUserDiscount(pool, req.session.userId);
      let tier = null;
      try { tier = await getUserTier(pool, req.session.userId); } catch { /* tier tables may not exist */ }
      const maxPct = tier ? Number(tier.max_discount_pct) : 25;
      res.json({
        discount_pct: discount,
        max_pct: maxPct,
        tier: tier ? { key: tier.tier_key, name_de: tier.name_de, icon: tier.icon, color: tier.color } : null
      });
    } catch (e) {
      logger.error({ err: e.message }, "GET /bounties/discount");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/bounties/tier — full tier status + progress ── */
  router.get("/bounties/tier", requireAuth, async (req, res) => {
    try {
      const status = await getTierStatus(pool, req.session.userId);
      res.json(status);
    } catch (e) {
      logger.error({ err: e.message }, "GET /bounties/tier");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/milestones/me — user milestones ────────────── */
  router.get("/milestones/me", requireAuth, async (req, res) => {
    try {
      const milestones = await bountyService.getUserMilestones(pool, req.session.userId);
      res.json({ milestones });
    } catch (e) {
      logger.error({ err: e.message }, "GET /milestones/me");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/value-report — ROI / success dashboard data ── */
  router.get("/value-report", requireAuth, async (req, res) => {
    try {
      const report = await bountyService.getValueReport(pool, req.session.userId);
      res.json(report);
    } catch (e) {
      logger.error({ err: e.message }, "GET /value-report");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
