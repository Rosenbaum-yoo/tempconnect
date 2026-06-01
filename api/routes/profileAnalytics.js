/**
 * Profile Analytics Routes — Marketplace Visibility Center (M-04)
 *
 * Endpoints:
 *   POST /profile-analytics/events            — View-Event aufzeichnen (kein Auth, anonym ok)
 *   GET  /profile-analytics/me                — eigene Profilreichweite (PRO+)
 *   GET  /profile-analytics/me/advanced       — erweiterte Analytics (INDIVIDUELL)
 *
 * Plan-Gates:
 *   profile_analytics_basic     PRO, INDIVIDUELL (views_7d, views_30d, likes)
 *   profile_analytics_advanced  INDIVIDUELL (views_90d, sections, chart)
 *
 * Datenschutz-Pflicht:
 *   IP und User-Agent werden in profileAnalyticsService.recordProfileView()
 *   AUSSCHLIESSLICH als SHA-256-Hash gespeichert. Kein Klartext in DB oder Logs.
 */

import { z } from "zod";
import { Router } from "express";
import * as analyticsSvc from "../services/profileAnalyticsService.js";
import * as visSvc from "../services/profileVisibilityService.js";

const viewEventSchema = z.object({
  org_id:  z.string().uuid(),
  section: z.string().max(64).optional().nullable()
});

export function createProfileAnalyticsRouter(deps) {
  const { pool, requireAuth, requireFeature, logger } = deps;
  const router = Router();

  const ok   = (res, data) => res.json({ success: true, data });
  const fail = (res, status, code, msg) =>
    res.status(status).json({ success: false, error: { code, message: msg } });

  const analyticsBasic    = requireFeature("profile_analytics_basic");
  const analyticsAdvanced = requireFeature("profile_analytics_advanced");

  /* ── View-Event aufzeichnen ────────────────────────────── */
  // Keine Auth-Pflicht: auch anonyme Besucher generieren Views.
  // IP/UA werden gehasht — kein Klartext gespeichert.

  router.post("/profile-analytics/events", async (req, res) => {
    const parsed = viewEventSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION", "org_id (uuid) erforderlich.");
    try {
      const { org_id, section } = parsed.data;

      // Nur oeffentlich sichtbare Profile tracken
      const isVisible = await visSvc.isProfilePubliclyVisible(pool, org_id);
      if (!isVisible) return fail(res, 404, "NOT_FOUND", "Profil nicht öffentlich.");

      const clientIp  = req.headers["x-forwarded-for"]
        ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
        : String(req.ip || "");
      const userAgent = String(req.headers["user-agent"] || "");

      await analyticsSvc.recordProfileView(pool, {
        viewedOrgId:   org_id,
        viewerOrgId:   req.orgId    || null,
        viewerUserId:  req.session?.userId || null,
        clientIp,
        userAgent,
        section: section || null
      });

      res.json({ success: true });
    } catch (e) {
      logger.error({ err: e }, "POST /profile-analytics/events");
      // Soft-fail: View-Tracking-Fehler darf Frontend nicht blockieren
      res.json({ success: false });
    }
  });

  /* ── Eigene Profilreichweite (Basic, PRO+) ─────────────── */

  router.get("/profile-analytics/me", requireAuth, analyticsBasic, async (req, res) => {
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const data = await analyticsSvc.getProfileAnalyticsSummary(pool, req.orgId, { advanced: false });
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "GET /profile-analytics/me");
      fail(res, 500, "SERVER_ERROR", "Analytics konnten nicht geladen werden.");
    }
  });

  /* ── Erweiterte Analytics (INDIVIDUELL) ───────────────── */

  router.get("/profile-analytics/me/advanced", requireAuth, analyticsAdvanced, async (req, res) => {
    try {
      if (!req.orgId) return fail(res, 403, "NO_ORG", "Keine aktive Organisation.");
      const data = await analyticsSvc.getProfileAnalyticsSummary(pool, req.orgId, { advanced: true });
      ok(res, data);
    } catch (e) {
      logger.error({ err: e }, "GET /profile-analytics/me/advanced");
      fail(res, 500, "SERVER_ERROR", "Erweiterte Analytics konnten nicht geladen werden.");
    }
  });

  return router;
}
