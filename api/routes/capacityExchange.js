/**
 * Capacity Exchange routes — professional workforce availability management.
 * Mounted at /api/capacity-exchange/* to avoid conflicts with existing
 * /api/capacities and /api/marketplace/capacity-posts.
 */

import { z } from "zod";
import { Router } from "express";
import * as capacityExchangeService from "../services/capacityExchangeService.js";
import * as capacityWorkflow from "../services/capacityWorkflow.js";
import * as matchingEngine from "../services/matchingEngine.js";
import * as auditLog from "../services/auditLog.js";
import { dispatch } from "../services/notificationMatrix.js";

/* ── Zod Schemas ──────────────────────────────────── */

const createEntrySchema = z.object({
  title: z.string().min(1).max(200),
  role: z.string().min(1).max(120),
  skill_tags: z.array(z.string().max(80)).optional().default([]),
  headcount: z.number().int().min(1).max(999).optional().default(1),
  availability_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  availability_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  location_city: z.string().min(1).max(120),
  location_postal: z.string().max(20).optional().nullable(),
  location_lat: z.number().optional().nullable(),
  location_lng: z.number().optional().nullable(),
  radius_km: z.number().int().min(1).max(500).optional().default(25),
  price_type: z.enum(["hourly", "daily", "fixed"]).optional().nullable(),
  price_min: z.number().optional().nullable(),
  price_max: z.number().optional().nullable(),
  price_hint: z.string().max(200).optional().nullable(),
  worker_category: z.string().max(120).optional().nullable(),
  availability_type: z.enum(["immediate", "scheduled", "flexible"]).optional().default("immediate"),
  shift_model: z.enum(["day", "night", "rotating", "flexible", "weekend", "on_call"]).optional().nullable(),
  employment_type: z.enum(["temporary", "contract", "temp_to_perm", "project", "on_call"]).optional().default("temporary"),
  country: z.string().max(10).optional().default("DE"),
  mobility_notes: z.string().max(500).optional().nullable(),
  qualification_summary: z.string().max(2000).optional().nullable(),
  certifications_summary: z.string().max(2000).optional().nullable(),
  compliance_status: z.enum(["unknown", "pending", "partial", "complete"]).optional().default("unknown"),
  notes: z.string().max(2000).optional().nullable(),
  visibility_status: z.enum(["public", "plan_gated", "vendor_pool_only", "private"]).optional().default("public"),
  priority_level: z.enum(["normal", "elevated", "urgent"]).optional().default("normal"),
  valid_until: z.string().optional().nullable(),
  org_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "active"]).optional().default("draft")
});

const updateEntrySchema = createEntrySchema.partial().omit({ status: true });

const interactionSchema = z.object({
  interaction_type: z.enum(["interest", "offer_request", "question", "save", "requisition_link", "deal_start", "contact"]),
  message: z.string().max(2000).optional().nullable(),
  requisition_id: z.string().uuid().optional().nullable()
});

/* ── Router factory ───────────────────────────────── */

/**
 * @param {{ pool, requireAuth, requireFeature, getUserAndPlan, logger }} deps
 */
export function createCapacityExchangeRouter(deps) {
  const { pool, requireAuth, requireFeature, getUserAndPlan, logger } = deps;
  const router = Router();

  // Feature gates
  const ceBasic = requireFeature("capacity_exchange_basic");
  const ceMatching = requireFeature("capacity_exchange_matching");

  /* ── Supplier: Create entry ───────────────────────── */

  router.post("/capacity-exchange/entries", requireAuth, ceBasic, async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      const parsed = createEntrySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const plan = me?.plan ?? "FREE";
      const entry = await capacityExchangeService.createCapacityEntry(pool, req.session.userId, plan, parsed.data);

      await auditLog.writeAudit(pool, {
        action: "capacity_exchange.create", entity_type: "capacity_post",
        entity_id: entry.id, actor_id: req.session.userId,
        details: { title: entry.title, role: entry.role, status: entry.status, headcount: entry.headcount }
      });

      res.status(201).json(entry);
    } catch (e) {
      if (e.code === "PLAN_LIMIT") return res.status(403).json({ error: "PLAN_LIMIT", message: e.message });
      logger.error({ err: e }, "POST /capacity-exchange/entries");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Update entry ───────────────────────── */

  router.patch("/capacity-exchange/entries/:id", requireAuth, ceBasic, async (req, res) => {
    try {
      const parsed = updateEntrySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const entry = await capacityExchangeService.updateCapacityEntry(pool, req.params.id, req.session.userId, parsed.data);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });

      await auditLog.writeAudit(pool, {
        action: "capacity_exchange.update", entity_type: "capacity_post",
        entity_id: entry.id, actor_id: req.session.userId,
        details: { changed_fields: Object.keys(parsed.data) }
      });

      res.json(entry);
    } catch (e) {
      logger.error({ err: e }, "PATCH /capacity-exchange/entries/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Status transitions ─────────────────── */

  async function handleTransition(req, res, targetStatus) {
    try {
      const me = await getUserAndPlan(req.session.userId);
      const plan = me?.plan ?? "FREE";
      const result = await capacityExchangeService.transitionStatus(pool, req.params.id, req.session.userId, targetStatus, plan);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "VALIDATION") return res.status(400).json({ error: "VALIDATION", details: result.details });
      if (result.error === "PLAN_LIMIT") return res.status(403).json({ error: "PLAN_LIMIT", limit: result.limit });

      await auditLog.writeAudit(pool, {
        action: `capacity_exchange.${targetStatus}`, entity_type: "capacity_post",
        entity_id: req.params.id, actor_id: req.session.userId,
        details: { new_status: targetStatus }
      });

      res.json(result.entry);
    } catch (e) {
      if (e.name === "CapacityTransitionError") {
        return res.status(400).json({ error: "INVALID_TRANSITION", from: e.from, to: e.to });
      }
      logger.error({ err: e }, `POST /capacity-exchange/entries/:id/${targetStatus}`);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  }

  router.post("/capacity-exchange/entries/:id/activate", requireAuth, ceBasic, (req, res) => handleTransition(req, res, "active"));
  router.post("/capacity-exchange/entries/:id/pause", requireAuth, ceBasic, (req, res) => handleTransition(req, res, "paused"));
  router.post("/capacity-exchange/entries/:id/reactivate", requireAuth, ceBasic, (req, res) => handleTransition(req, res, "active"));
  router.post("/capacity-exchange/entries/:id/fill", requireAuth, ceBasic, (req, res) => handleTransition(req, res, "filled"));
  router.post("/capacity-exchange/entries/:id/archive", requireAuth, ceBasic, (req, res) => handleTransition(req, res, "archived"));

  /* ── Supplier: Confirm freshness ──────────────────── */

  router.post("/capacity-exchange/entries/:id/confirm", requireAuth, ceBasic, async (req, res) => {
    try {
      const entry = await capacityExchangeService.confirmFreshness(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });

      await auditLog.writeAudit(pool, {
        action: "capacity_exchange.confirm", entity_type: "capacity_post",
        entity_id: entry.id, actor_id: req.session.userId
      });

      res.json(entry);
    } catch (e) {
      logger.error({ err: e }, "POST /capacity-exchange/entries/:id/confirm");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: List own entries ────────────────────── */

  router.get("/capacity-exchange/entries", requireAuth, ceBasic, async (req, res) => {
    try {
      const opts = {
        status: req.query.status || undefined,
        expiring_within_days: req.query.expiring_within_days ? parseInt(req.query.expiring_within_days, 10) : undefined,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50)
      };
      const rows = await capacityExchangeService.listOwnEntries(pool, req.session.userId, opts);
      res.json(rows);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/entries");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Single entry detail ────────────────── */

  router.get("/capacity-exchange/entries/:id", requireAuth, ceBasic, async (req, res) => {
    try {
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      // Attach trust signals for owner view
      if (entry.supplier_company_id === req.session.userId) {
        entry.trust_signals = await capacityExchangeService.computeTrustSignals(pool, req.session.userId);
      }
      res.json(entry);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/entries/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: Dashboard stats ────────────────────── */

  router.get("/capacity-exchange/stats", requireAuth, ceBasic, async (req, res) => {
    try {
      const stats = await capacityExchangeService.getSupplierDashboardStats(pool, req.session.userId);
      res.json(stats);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/stats");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: View matching requisitions ─────────── */

  router.get("/capacity-exchange/entries/:id/matches", requireAuth, ceMatching, async (req, res) => {
    try {
      // Verify ownership
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      if (entry.supplier_company_id !== req.session.userId) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const matches = await matchingEngine.matchCapacityToRequisitions(pool, req.params.id, {
        topN: 25, minScore: 10, supplierVerified: true
      });
      res.json(matches);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/entries/:id/matches");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Supplier: View interactions on entry ─────────── */

  router.get("/capacity-exchange/entries/:id/interactions", requireAuth, ceBasic, async (req, res) => {
    try {
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      if (entry.supplier_company_id !== req.session.userId) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      const interactions = await capacityExchangeService.listInteractions(pool, req.params.id);
      res.json(interactions);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/entries/:id/interactions");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Company: Browse capacity feed ────────────────── */

  router.get("/capacity-exchange/feed", requireAuth, async (req, res) => {
    try {
      const opts = {
        worker_category: req.query.worker_category || undefined,
        role: req.query.role || undefined,
        location_city: req.query.city || undefined,
        availability_from: req.query.availability_from || undefined,
        min_headcount: req.query.min_headcount ? parseInt(req.query.min_headcount, 10) : undefined,
        shift_model: req.query.shift_model || undefined,
        compliance_status: req.query.compliance_status || undefined,
        priority_level: req.query.priority_level || undefined,
        latitude: req.query.latitude ? parseFloat(req.query.latitude) : undefined,
        longitude: req.query.longitude ? parseFloat(req.query.longitude) : undefined,
        radius_km: req.query.radius_km ? parseInt(req.query.radius_km, 10) : undefined,
        skill_tags: req.query.skill_tags ? String(req.query.skill_tags).split(",").map(t => t.trim()).filter(Boolean) : undefined,
        page: parseInt(req.query.page, 10) || 1,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 25)
      };
      const result = await capacityExchangeService.browseFeed(pool, opts);
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/feed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Company: Single feed entry detail ────────────── */

  router.get("/capacity-exchange/feed/:id", requireAuth, async (req, res) => {
    try {
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      // Attach trust signals for the viewer
      entry.trust_signals = await capacityExchangeService.computeTrustSignals(pool, entry.supplier_company_id);
      res.json(entry);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/feed/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Company: Create interaction ──────────────────── */

  router.post("/capacity-exchange/entries/:id/interactions", requireAuth, async (req, res) => {
    try {
      const parsed = interactionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      // Verify entry exists and is active
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry || entry.status !== "active") return res.status(404).json({ error: "NOT_FOUND" });

      const interaction = await capacityExchangeService.createInteraction(
        pool, req.params.id, req.session.userId, parsed.data
      );

      await auditLog.writeAudit(pool, {
        action: `capacity_exchange.interaction.${parsed.data.interaction_type}`,
        entity_type: "capacity_interaction",
        entity_id: interaction.id,
        actor_id: req.session.userId,
        details: { capacity_post_id: req.params.id, type: parsed.data.interaction_type }
      });

      // Notify supplier of interest
      if (["interest", "offer_request", "deal_start"].includes(parsed.data.interaction_type)) {
        try {
          await dispatch(pool, "capacity.interest_received", {
            recipientUserIds: [entry.supplier_company_id],
            entityType: "capacity_post",
            entityId: req.params.id,
            message: `Neues Interesse an "${entry.title}" (${parsed.data.interaction_type})`
          });
        } catch (_) { /* notification failure is non-critical */ }
      }

      res.status(201).json(interaction);
    } catch (e) {
      logger.error({ err: e }, "POST /capacity-exchange/entries/:id/interactions");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
