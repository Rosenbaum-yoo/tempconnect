/**
 * SLA-Suchaufträge (Search Jobs) – API-Router.
 * Plan-Gating: Erstellung/Änderung nur mit sla_access (PLUS/PRO).
 * Lesen (Liste/Detail) für eingeloggte Nutzer erlaubt (Transparenz, kein SLA-Versprechen).
 */

import { z } from "zod";
import { Router } from "express";
import * as slaSearchService from "../services/slaSearchService.js";
import { canAccessAsOwner } from "../utils/ownerCheck.js";

const createJobSchema = z.object({
  target_type: z.enum(["CAPACITY", "DEMAND"]),
  title: z.string().min(1).max(200),
  role: z.string().max(120).optional().nullable(),
  skill_tags: z.array(z.string().max(80)).optional().default([]),
  headcount: z.number().int().min(1).max(999).optional().default(1),
  location_city: z.string().max(120).optional().nullable(),
  location_postal: z.string().max(20).optional().nullable(),
  location_lat: z.number().optional().nullable(),
  location_lng: z.number().optional().nullable(),
  radius_km: z.number().int().min(1).max(500).optional().default(25),
  urgency: z.enum(["normal", "plus", "notdienst"]).optional().default("normal"),
  sla_minutes: z.number().int().min(15).max(10080).optional().nullable()
});

/**
 * @param {{ pool, requireAuth, requireFeature, getUserAndPlan, logger }} deps
 */
export function createSlaSearchJobsRouter(deps) {
  const { pool, requireAuth, requireFeature, getUserAndPlan, logger } = deps;
  const router = Router();
  const slaAccess = requireFeature("sla_access");

  // Liste eigene Jobs (READ-ONLY, nur Auth)
  router.get("/sla/search-jobs", requireAuth, async (req, res) => {
    try {
      const jobs = await slaSearchService.listSearchJobsForOwner(pool, req.session.userId);
      res.json(jobs);
    } catch (e) {
      logger.error({ err: e }, "GET /sla/search-jobs");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Detail (inkl. Events & Matches), nur Besitzer
  router.get("/sla/search-jobs/:id", requireAuth, async (req, res) => {
    try {
      const id = req.params.id;
      const job = await slaSearchService.getSearchJobById(pool, id);
      if (!job) return res.status(404).json({ error: "NOT_FOUND" });
      const allowed = await canAccessAsOwner(pool, job.owner_company_id, req.session.userId);
      if (!allowed) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      const events = await slaSearchService.getSearchSlaEvents(pool, id);
      const matches = await slaSearchService.getSearchMatches(pool, id);
      res.json({ ...job, sla_events: events, matches });
    } catch (e) {
      logger.error({ err: e }, "GET /sla/search-jobs/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Anlage eines neuen SLA-Suchauftrags
  router.post("/sla/search-jobs", requireAuth, slaAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (!me) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
      const parsed = createJobSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      }
      const ownerType = me.role === "agency" ? "AGENCY" : "COMPANY";
      const plan = me.plan || "FREE";
      const job = await slaSearchService.createSearchJob(pool, req.session.userId, ownerType, plan, parsed.data);
      if (job.sla_status === "RUNNING") {
        await slaSearchService.recordSearchSlaStarted(pool, job.id);
      }
      const events = await slaSearchService.getSearchSlaEvents(pool, job.id);
      res.locals.audit = { action: "sla_search_job.create", entity_type: "sla_search_job", entity_id: job.id, details: { target_type: parsed.data.target_type, urgency: parsed.data.urgency } };
      res.status(201).json({ ...job, sla_events: events });
    } catch (e) {
      logger.error({ err: e }, "POST /sla/search-jobs");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Suchauftrag bearbeiten (Parameter anpassen)
  const updateJobSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    role: z.string().max(120).optional().nullable(),
    skill_tags: z.array(z.string().max(80)).optional(),
    headcount: z.number().int().min(1).max(999).optional(),
    location_city: z.string().max(120).optional().nullable(),
    location_postal: z.string().max(20).optional().nullable(),
    location_lat: z.number().optional().nullable(),
    location_lng: z.number().optional().nullable(),
    radius_km: z.number().int().min(1).max(500).optional(),
    urgency: z.enum(["normal", "plus", "notdienst"]).optional(),
    sla_minutes: z.number().int().min(15).max(10080).optional().nullable()
  });

  router.put("/sla/search-jobs/:id", requireAuth, slaAccess, async (req, res) => {
    try {
      const parsed = updateJobSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      }
      const job = await slaSearchService.updateSearchJob(pool, req.params.id, req.session.userId, parsed.data);
      if (!job) return res.status(404).json({ error: "NOT_FOUND" });
      const events = await slaSearchService.getSearchSlaEvents(pool, job.id);
      const matches = await slaSearchService.getSearchMatches(pool, job.id);
      res.locals.audit = { action: "sla_search_job.update", entity_type: "sla_search_job", entity_id: req.params.id, details: { changed_fields: Object.keys(parsed.data) } };
      res.json({ ...job, sla_events: events, matches });
    } catch (e) {
      logger.error({ err: e }, "PUT /sla/search-jobs/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Suchauftrag löschen
  router.delete("/sla/search-jobs/:id", requireAuth, slaAccess, async (req, res) => {
    try {
      const deleted = await slaSearchService.deleteSearchJob(pool, req.params.id, req.session.userId);
      if (!deleted) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: "sla_search_job.delete", entity_type: "sla_search_job", entity_id: req.params.id };
      res.json({ ok: true });
    } catch (e) {
      logger.error({ err: e }, "DELETE /sla/search-jobs/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  async function mutateStatus(req, res, nextStatus) {
    try {
      const id = req.params.id;
      const job = await slaSearchService.updateSearchJobStatus(pool, id, req.session.userId, nextStatus);
      if (!job) return res.status(404).json({ error: "NOT_FOUND" });
      if (nextStatus === "closed") {
        await slaSearchService.writeSearchSlaEvent(pool, id, "JOB_CLOSED", { at: new Date().toISOString() });
      }
      const events = await slaSearchService.getSearchSlaEvents(pool, id);
      const matches = await slaSearchService.getSearchMatches(pool, id);
      res.locals.audit = { action: `sla_search_job.${nextStatus}`, entity_type: "sla_search_job", entity_id: id, new_values: { status: nextStatus } };
      res.json({ ...job, sla_events: events, matches });
    } catch (e) {
      if (e && e.message === "invalid_status") {
        return res.status(400).json({ error: "INVALID_STATUS" });
      }
      logger.error({ err: e }, "mutateStatus /sla/search-jobs/:id/*");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  }

  router.post("/sla/search-jobs/:id/close", requireAuth, slaAccess, (req, res) =>
    mutateStatus(req, res, "closed")
  );

  router.post("/sla/search-jobs/:id/pause", requireAuth, slaAccess, (req, res) =>
    mutateStatus(req, res, "paused")
  );

  router.post("/sla/search-jobs/:id/resume", requireAuth, slaAccess, (req, res) =>
    mutateStatus(req, res, "open")
  );

  // ── Search & Save: Suche = automatisch persistenter Suchauftrag + sofortiges Matching ──
  router.post("/sla/search-and-save", requireAuth, slaAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (!me) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
      const role = String(req.body.role || "").trim();
      const region = String(req.body.region || "").trim();
      const minAvailable = parseInt(req.body.min_available, 10) || 1;
      const pulseMinutes = parseInt(req.body.pulse_minutes, 10) || 60;
      const priority = (req.body.priority || "NORMAL").toUpperCase();

      const title = (role || "Suche") + (region ? " – " + region : "");
      const ownerType = me.role === "agency" ? "AGENCY" : "COMPANY";
      const plan = me.plan || "FREE";
      const urgency = priority === "NOTDIENST" ? "notdienst" : "normal";

      // 1) Suchauftrag anlegen
      const job = await slaSearchService.createSearchJob(pool, req.session.userId, ownerType, plan, {
        target_type: "CAPACITY",
        title,
        role: role || null,
        location_city: region || null,
        headcount: minAvailable,
        urgency,
        sla_minutes: pulseMinutes
      });

      if (job.sla_status === "RUNNING") {
        await slaSearchService.recordSearchSlaStarted(pool, job.id);
      }

      // 2) Sofortiges Matching
      const { candidateCount, matchCount } = await slaSearchService.runSearchMatching(pool, job);
      await slaSearchService.recordSearchMatchingAttempt(pool, job.id, { candidateCount, matchCount });

      // 3) Match-Alert
      if (matchCount > 0) {
        await slaSearchService.createMatchAlert(pool, req.session.userId, job.id, matchCount);
      }

      // 4) SLA met?
      if (job.sla_status === "RUNNING" && job.sla_due_at && matchCount > 0) {
        if (new Date() <= new Date(job.sla_due_at)) {
          await slaSearchService.markSearchSlaMet(pool, job.id);
        }
      }

      // 5) Matches + Events laden
      const matches = await slaSearchService.getSearchMatches(pool, job.id);
      const events = await slaSearchService.getSearchSlaEvents(pool, job.id);

      res.locals.audit = { action: "sla_search_job.search_and_save", entity_type: "sla_search_job", entity_id: job.id, details: { matchCount, candidateCount } };
      res.status(201).json({
        job: { ...job, sla_events: events },
        matches,
        matchCount,
        candidateCount
      });
    } catch (e) {
      logger.error({ err: e }, "POST /sla/search-and-save");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Match Alerts
  router.get("/sla/match-alerts", requireAuth, async (req, res) => {
    try {
      const alerts = await slaSearchService.getUnreadAlerts(pool, req.session.userId);
      res.json(alerts);
    } catch (e) {
      logger.error({ err: e }, "GET /sla/match-alerts");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/sla/match-alerts/count", requireAuth, async (req, res) => {
    try {
      const count = await slaSearchService.getUnreadAlertCount(pool, req.session.userId);
      res.json({ count });
    } catch (e) {
      logger.error({ err: e }, "GET /sla/match-alerts/count");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/sla/match-alerts/:id/read", requireAuth, async (req, res) => {
    try {
      const alert = await slaSearchService.markAlertRead(pool, req.params.id, req.session.userId);
      if (!alert) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: "sla_match_alert.read", entity_type: "sla_match_alert", entity_id: req.params.id };
      res.json(alert);
    } catch (e) {
      logger.error({ err: e }, "POST /sla/match-alerts/:id/read");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/sla/match-alerts/read-all", requireAuth, async (req, res) => {
    try {
      const result = await slaSearchService.markAllAlertsRead(pool, req.session.userId);
      res.locals.audit = { action: "sla_match_alert.read_all", entity_type: "sla_match_alert" };
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "POST /sla/match-alerts/read-all");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Batch trigger for cron (admin-only) ─────────── */
  router.post("/sla/search-jobs/run-batch", requireAuth, async (req, res) => {
    try {
      // Admin secret or admin role required
      const adminSecret = req.headers["x-admin-secret"];
      const me = await getUserAndPlan(req.session.userId);
      const isAdmin = me?.role === "admin" || (adminSecret && adminSecret === process.env.ADMIN_SECRET);
      if (!isAdmin) return res.status(403).json({ error: "ADMIN_ONLY" });

      const batchSize = parseInt(req.body?.batch_size, 10) || 50;
      const sendMailFn = deps.sendMail || null;
      const result = await slaSearchService.runSearchJobsBatch(pool, sendMailFn, batchSize);
      res.locals.audit = { action: "sla_search_job.run_batch", entity_type: "sla_search_job", details: result };
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "POST /sla/search-jobs/run-batch");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}

