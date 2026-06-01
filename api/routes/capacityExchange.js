/**
 * Capacity Exchange routes — professional workforce availability management.
 * Mounted at /api/capacity-exchange/* to avoid conflicts with existing
 * /api/capacities and /api/marketplace/capacity-posts.
 */

import { z } from "zod";
import { Router } from "express";
import * as capacityExchangeService from "../services/capacityExchangeService.js";
import * as matchingEngine from "../services/matchingEngine.js";
import * as auditLog from "../services/auditLog.js";
import { dispatch } from "../services/notificationMatrix.js";
import * as listingAnalytics from "../services/listingAnalyticsService.js";
import * as settingsService from "../services/settingsService.js";
import { hasFeature } from "../config/planFeatures.js";
import { canInteractWithCapacity } from "../services/capacityInteractionPolicy.js";
import { requireOrgLimit } from "../middleware/entitlementGuard.js";

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
  interaction_type: z.enum(["interest", "offer_request", "question", "save", "requisition_link", "deal_start", "contact", "deal_accept", "deal_negotiate"]),
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
  const listingsLimitGate = requireOrgLimit("listings", { pool, logger });

  /* ── Supplier: Create entry ───────────────────────── */

  router.post("/capacity-exchange/entries", requireAuth, ceBasic, listingsLimitGate, async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      const parsed = createEntrySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const plan = me?.plan ?? "FREE";
      // Security: req.orgId (server-set by orgContextMiddleware) always wins over body org_id.
      // A client must never be able to bind an entry to a foreign org by supplying org_id in the body.
      const payload = { ...parsed.data };
      if (req.orgId) payload.org_id = req.orgId;
      const entry = await capacityExchangeService.createCapacityEntry(pool, req.session.userId, plan, payload);

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

      // ── Match Alerts: dispatch bidirectional notifications on activation ──
      if (targetStatus === "active") {
        try {
          const matches = await matchingEngine.matchCapacityToRequisitions(pool, req.params.id, {
            topN: 5, minScore: 20
          });
          if (matches.length > 0) {
            // Notify supplier about matching demands/requisitions
            await dispatch(pool, 'capacity.match_found', {
              recipientUserIds: [req.session.userId],
              entityType: 'capacity_post',
              entityId: req.params.id,
              message: `${matches.length} passende Nachfrage${matches.length > 1 ? 'n' : ''} gefunden fuer "${result.entry.title}"`
            });

            // Notify demand creators about the new matching capacity
            const demandCreatorIds = [...new Set(
              matches
                .filter(m => m.type === 'demand_request' && m.entity?.requester_company_id)
                .map(m => m.entity.requester_company_id)
            )];
            if (demandCreatorIds.length > 0) {
              await dispatch(pool, 'demand.match_found', {
                recipientUserIds: demandCreatorIds,
                entityType: 'capacity_post',
                entityId: req.params.id,
                message: `Neues Kapazitaetsangebot passt zu Ihrer Nachfrage: "${result.entry.title}" – ${result.entry.role}, ${result.entry.location_city}`
              });
            }
          }
        } catch (matchErr) {
          logger.warn({ err: matchErr?.message, entryId: req.params.id }, 'Match alert dispatch failed (non-critical)');
        }
      }

      res.json(result.entry);
    } catch (e) {
      if (e.name === "CapacityTransitionError") {
        return res.status(400).json({ error: "INVALID_TRANSITION", from: e.from, to: e.to });
      }
      logger.error({ err: e }, `POST /capacity-exchange/entries/:id/${targetStatus}`);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  }

  router.post("/capacity-exchange/entries/:id/activate", requireAuth, ceBasic, listingsLimitGate, (req, res) => handleTransition(req, res, "active"));
  router.post("/capacity-exchange/entries/:id/pause", requireAuth, ceBasic, (req, res) => handleTransition(req, res, "paused"));
  router.post("/capacity-exchange/entries/:id/reactivate", requireAuth, ceBasic, listingsLimitGate, (req, res) => handleTransition(req, res, "active"));
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
      const me = await getUserAndPlan(req.session.userId);
      let interAgencyEnabled = false;
      let interAgencySupplyVisible = false;
      if (me?.role === "agency" && req.orgId) {
        const settings = await settingsService.getSettings(pool, req.orgId);
        const planAllows = hasFeature(me?.plan, "inter_agency_matching");
        interAgencyEnabled = planAllows && settings.inter_agency_matching_enabled === true;
        interAgencySupplyVisible = interAgencyEnabled && settings.inter_agency_supply_visible === true;
      }
      const opts = {
        worker_category: req.query.worker_category || undefined,
        role: req.query.role || undefined,
        location_city: req.query.city || undefined,
        availability_from: req.query.availability_from || undefined,
        availability_window: req.query.availability_window || undefined,
        min_headcount: req.query.min_headcount ? parseInt(req.query.min_headcount, 10) : undefined,
        shift_model: req.query.shift_model || undefined,
        compliance_status: req.query.compliance_status || undefined,
        priority_level: req.query.priority_level || undefined,
        latitude: req.query.latitude ? parseFloat(req.query.latitude) : undefined,
        longitude: req.query.longitude ? parseFloat(req.query.longitude) : undefined,
        radius_km: req.query.radius_km ? parseInt(req.query.radius_km, 10) : undefined,
        skill_tags: req.query.skill_tags ? String(req.query.skill_tags).split(",").map(t => t.trim()).filter(Boolean) : undefined,
        sort: req.query.sort || undefined,
        viewer_role: me?.role || null,
        viewer_user_id: req.session.userId,
        inter_agency_enabled: interAgencyEnabled,
        inter_agency_supply_visible: interAgencySupplyVisible,
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

      // Track listing view for analytics (fire-and-forget)
      listingAnalytics.recordView(pool, req.params.id, req.session.userId).catch(() => {});

      // Match Suggestions: top matching demands/requisitions for this capacity
      try {
        const matches = await matchingEngine.matchCapacityToRequisitions(pool, req.params.id, {
          topN: 5, minScore: 20
        });
        entry.suggested_matches = matches.map(m => ({
          type: m.type,
          id: m.entity?.id,
          title: m.entity?.title || m.entity?.role,
          role: m.entity?.role,
          location_city: m.entity?.location_city,
          score: m.score
        }));
      } catch { entry.suggested_matches = []; }

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
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });

      const me = await getUserAndPlan(req.session.userId);
      const policy = canInteractWithCapacity({
        viewerRole: me?.role || null,
        viewerUserId: req.session.userId,
        supplierUserId: entry.supplier_company_id,
        entryStatus: entry.status
      });
      if (!policy.allowed) return res.status(policy.status).json({ error: policy.code });

      const interaction = await capacityExchangeService.createInteraction(
        pool, req.params.id, req.session.userId, parsed.data
      );
      if (!interaction) return res.status(200).json({ ok: true, deduped: true });

      await auditLog.writeAudit(pool, {
        action: `capacity_exchange.interaction.${parsed.data.interaction_type}`,
        entity_type: "capacity_interaction",
        entity_id: interaction.id,
        actor_id: req.session.userId,
        details: { capacity_post_id: req.params.id, type: parsed.data.interaction_type }
      });

      // Notify supplier — type-specific notification for deal actions
      const iType = parsed.data.interaction_type;
      try {
        if (iType === "deal_accept") {
          await dispatch(pool, "capacity.interest_received", {
            recipientUserIds: [entry.supplier_company_id],
            entityType: "capacity_post",
            entityId: req.params.id,
            message: `Dealbereitschaft f\u00fcr "${entry.title}" \u2013 Konditionen wurden zugestimmt. N\u00e4chster Schritt: operative Abstimmung.`
          });
        } else if (iType === "deal_negotiate") {
          await dispatch(pool, "capacity.interest_received", {
            recipientUserIds: [entry.supplier_company_id],
            entityType: "capacity_post",
            entityId: req.params.id,
            message: `Verhandlungsanfrage f\u00fcr "${entry.title}" \u2013 Anpassungsw\u00fcnsche liegen vor. Bitte pr\u00fcfen.`
          });
        } else if (["interest", "offer_request", "deal_start", "contact"].includes(iType)) {
          await dispatch(pool, "capacity.interest_received", {
            recipientUserIds: [entry.supplier_company_id],
            entityType: "capacity_post",
            entityId: req.params.id,
            message: `Neue Reaktion auf "${entry.title}" (${iType})`
          });
        }
      } catch { /* notification failure is non-critical */ }

      res.status(201).json(interaction);
    } catch (e) {
      logger.error({ err: e }, "POST /capacity-exchange/entries/:id/interactions");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Premium Analytics: per-listing stats ──────────── */

  router.get("/capacity-exchange/entries/:id/analytics", requireAuth, async (req, res) => {
    try {
      const entry = await capacityExchangeService.getEntryById(pool, req.params.id, req.session.userId);
      if (!entry) return res.status(404).json({ error: "NOT_FOUND" });
      if (entry.supplier_company_id !== req.session.userId) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      const stats = await listingAnalytics.getListingStats(pool, req.params.id);
      res.json(stats);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/entries/:id/analytics");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Premium Analytics: supplier dashboard ────────── */

  router.get("/capacity-exchange/my-analytics", requireAuth, async (req, res) => {
    try {
      const dashboard = await listingAnalytics.getSupplierDashboard(pool, req.session.userId);
      res.json(dashboard);
    } catch (e) {
      logger.error({ err: e }, "GET /capacity-exchange/my-analytics");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Premium Analytics: record click ──────────────── */

  router.post("/capacity-exchange/entries/:id/click", requireAuth, async (req, res) => {
    try {
      await listingAnalytics.recordClick(pool, req.params.id, req.session.userId);
      res.locals.audit = {
        action: "capacity_exchange.click",
        entity_type: "capacity_post",
        entity_id: req.params.id,
        details: { viewer_id: req.session.userId }
      };
      res.json({ ok: true });
    } catch (e) {
      logger.error({ err: e }, "POST /capacity-exchange/entries/:id/click");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Admin/Cron: Confirmation reminders + escalation ── */

  router.post("/capacity-exchange/admin/process-reminders", requireAuth, async (req, res) => {
    try {
      const me = req.user;
      if (me?.role !== "admin") return res.status(403).json({ error: "ADMIN_ONLY" });
      const result = await capacityExchangeService.processConfirmationReminders(pool, {
        reminderDays: parseInt(req.body.reminder_days, 10) || 7,
        escalationDays: parseInt(req.body.escalation_days, 10) || 14
      });
      res.locals.audit = { action: "capacity_exchange.process_reminders", entity_type: "capacity_post", entity_id: null, details: { reminders_sent: result.reminders_sent, escalations: result.escalations } };
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "POST /capacity-exchange/admin/process-reminders");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
