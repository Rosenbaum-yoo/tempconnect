/**
 * Emergency Staffing Routes — /api/emergency/*
 *
 * Professional Notdienst-Endpoints fuer dringende Personalbedarfe.
 * Plan-gated: emergency_staffing (PLUS/PRO/ENTERPRISE).
 */

import { z } from "zod";
import { Router } from "express";
import * as emergencyService from "../services/emergencyStaffingService.js";
import * as emergencyCommitmentService from "../services/emergencyCommitmentService.js";
import * as dealAgreementService from "../services/dealAgreementService.js";
import { dispatch } from "../services/notificationMatrix.js";
import { canAccessAsOwner } from "../utils/ownerCheck.js";
import { swallow } from "../utils/logger.js";

const emergencyRequestSchema = z.object({
  title: z.string().min(1).max(200),
  role: z.string().min(1).max(120),
  skill_tags: z.array(z.string().max(80)).optional().default([]),
  headcount: z.number().int().min(1).max(999).optional().default(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  location_city: z.string().min(1).max(120),
  location_postal: z.string().max(20).optional().nullable(),
  location_lat: z.number().optional().nullable(),
  location_lng: z.number().optional().nullable(),
  radius_km: z.number().int().min(1).max(500).optional().default(25),
  shifts: z.record(z.unknown()).optional().nullable(),
  requirements: z.record(z.unknown()).optional().nullable(),
  urgency: z.enum(["urgent", "critical", "notdienst"]).optional().default("notdienst"),
  budget_min: z.number().optional().nullable(),
  budget_max: z.number().optional().nullable(),
  sla_minutes: z.number().int().min(15).max(10080).optional().nullable()
});

const commitmentSchema = z.object({
  committed_quantity: z.number().int().min(1).max(999),
  note: z.string().max(1000).optional().nullable()
});

const commitmentStatusSchema = z.object({
  status: z.enum(["withdrawn", "rejected", "expired"]),
  note: z.string().max(1000).optional().nullable()
});

/**
 * @param {{ pool, requireAuth, requireFeature, getUserAndPlan, logger }} deps
 */
export function createEmergencyRouter(deps) {
  const { pool, requireAuth, requireFeature, getUserAndPlan, logger } = deps;
  const router = Router();
  const emergencyAccess = requireFeature("emergency_staffing");

  async function getDemandById(demandId) {
    const { rows } = await pool.query(
      `SELECT dr.id, dr.requester_company_id, dr.urgency, dr.status, dr.required_total_count,
              dr.currently_committed_count, dr.remaining_open_count
         FROM demand_requests dr
        WHERE dr.id = $1`,
      [demandId]
    );
    return rows[0] || null;
  }

  async function canAgencyAccessEmergency(demandId, agencyUserId) {
    const { rows } = await pool.query(
      `SELECT 1
         FROM matches m
         JOIN capacity_posts cp ON cp.id = m.capacity_post_id
        WHERE m.demand_request_id = $1
          AND cp.supplier_company_id = $2
        LIMIT 1`,
      [demandId, agencyUserId]
    );
    return Boolean(rows[0]);
  }

  /* ── POST /api/emergency/request ─────────────────── */

  router.post("/emergency/request", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "company") return res.status(403).json({ error: "COMPANY_ONLY" });

      const parsed = emergencyRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await emergencyService.createEmergencyRequest(
        pool, req.session.userId, me?.plan ?? "FREE", parsed.data
      );

      res.locals.audit = {
        action: "emergency.request.create",
        entity_type: "demand_request",
        entity_id: result.demand?.id,
        details: { urgency: result.urgency_level, role: parsed.data.role, city: parsed.data.location_city }
      };
      res.status(201).json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /emergency/request");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/emergency/active ───────────────────── */

  router.get("/emergency/active", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const items = await emergencyService.getActiveEmergencies(
        pool, req.query.all === "1" ? null : req.session.userId
      );
      res.json({ items, count: items.length });
    } catch (e) {
      logger.error({ err: e.message }, "GET /emergency/active");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/emergency/dashboard ────────────────── */

  router.get("/emergency/dashboard", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const dashboard = await emergencyService.getEmergencyDashboard(
        pool, req.query.all === "1" ? null : req.session.userId
      );
      res.json(dashboard);
    } catch (e) {
      logger.error({ err: e.message }, "GET /emergency/dashboard");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/emergency/:id/respond ─────────────── */

  router.post("/emergency/:id/respond", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });

      const result = await emergencyService.recordSupplierResponse(
        pool, req.params.id, req.session.userId
      );
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "NOT_EMERGENCY") return res.status(400).json(result);
      if (result.error === "NOT_OPEN") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);

      res.locals.audit = {
        action: "emergency.respond",
        entity_type: "demand_request",
        entity_id: req.params.id,
        details: { response_count: result.response_count }
      };
      res.json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /emergency/:id/respond");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/emergency/:id/escalate ────────────── */

  router.post("/emergency/:id/escalate", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const result = await emergencyService.escalateEmergency(
        pool, req.params.id, req.session.userId
      );
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "NOT_OPEN") return res.status(409).json(result);
      if (result.error === "NOT_EMERGENCY") return res.status(400).json(result);
      if (result.error === "MAX_ESCALATION_REACHED") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);

      res.locals.audit = {
        action: "emergency.escalate",
        entity_type: "demand_request",
        entity_id: req.params.id,
        details: { new_level: result.new_level }
      };
      res.json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /emergency/:id/escalate");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/emergency/history ──────────────────── */

  router.get("/emergency/history", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const items = await emergencyService.getEmergencyHistory(
        pool,
        req.query.all === "1" ? null : req.session.userId,
        { limit: Number(req.query.limit) || 50, offset: Number(req.query.offset) || 0 }
      );
      res.json({ items, count: items.length });
    } catch (e) {
      logger.error({ err: e.message }, "GET /emergency/history");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/emergency/config ───────────────────── */

  router.get("/emergency/config", requireAuth, (_req, res) => {
    res.json({
      urgency_levels: Object.entries(emergencyService.URGENCY_CONFIG).map(([key, cfg]) => ({
        level: key,
        label: cfg.label,
        sla_minutes: cfg.slaMinutes,
        response_window_minutes: cfg.responseWindow,
        escalation: cfg.escalation,
        force_email: cfg.forceEmail,
        is_emergency: emergencyService.isEmergency(key)
      }))
    });
  });

  /* ── GET /api/emergency/:id/commitments ───────────── */

  router.get("/emergency/:id/commitments", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const demand = await getDemandById(req.params.id);
      if (!demand) return res.status(404).json({ error: "NOT_FOUND" });
      if (!emergencyService.isEmergency(demand.urgency)) return res.status(400).json({ error: "NOT_EMERGENCY" });

      const me = await getUserAndPlan(req.session.userId);
      const isRequester = await canAccessAsOwner(pool, demand.requester_company_id, req.session.userId);
      const isMatchedAgency = me?.role === "agency" ? await canAgencyAccessEmergency(demand.id, req.session.userId) : false;
      if (!isRequester && !isMatchedAgency) return res.status(403).json({ error: "FORBIDDEN" });

      const commitments = await emergencyCommitmentService.listCommitments(pool, req.params.id);
      res.json({
        demand_id: demand.id,
        status: demand.status,
        required_total_count: demand.required_total_count,
        currently_committed_count: demand.currently_committed_count,
        remaining_open_count: demand.remaining_open_count,
        commitments
      });
    } catch (e) {
      logger.error({ err: e.message }, "GET /emergency/:id/commitments");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/emergency/:id/commitments ──────────── */

  router.post("/emergency/:id/commitments", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      const parsed = commitmentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await emergencyCommitmentService.createCommitment(pool, {
        demandId: req.params.id,
        supplierCompanyId: req.session.userId,
        quantity: parsed.data.committed_quantity,
        actorUserId: req.session.userId,
        note: parsed.data.note || null
      });
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "NOT_EMERGENCY") return res.status(400).json(result);
      if (result.error === "NOT_OPEN") return res.status(409).json(result);
      if (result.error === "OVERFILL_NOT_ALLOWED") return res.status(409).json(result);
      if (result.error === "SUPPLIER_NOT_MATCHED") return res.status(403).json(result);
      if (result.error) return res.status(400).json(result);
      try {
        await emergencyService.recordSupplierResponse(pool, req.params.id, req.session.userId);
      } catch { /* non-critical */ }

      const demand = await getDemandById(req.params.id);
      if (demand?.requester_company_id) {
        await dispatch(pool, "emergency.commitment_received", {
          recipientUserIds: [demand.requester_company_id],
          entityType: "demand_request",
          entityId: req.params.id,
          message: `Neue Teilzusage: ${parsed.data.committed_quantity} Personen zugesagt.`
        }).catch(swallow("emergency"));
      }

      res.locals.audit = {
        action: "emergency.commitment.create",
        entity_type: "demand_request",
        entity_id: req.params.id,
        details: {
          commitment_id: result.commitment.id,
          committed_quantity: result.commitment.committed_quantity,
          demand_status: result.coverage?.status
        }
      };
      res.status(201).json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /emergency/:id/commitments");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── PATCH /api/emergency/commitments/:id ─────────── */

  router.patch("/emergency/commitments/:id", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const parsed = commitmentStatusSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const me = await getUserAndPlan(req.session.userId);

      const result = await emergencyCommitmentService.updateCommitmentStatus(pool, {
        commitmentId: req.params.id,
        actorUserId: req.session.userId,
        actorRole: me?.role || null,
        status: parsed.data.status,
        note: parsed.data.note || null
      });
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "FORBIDDEN") return res.status(403).json(result);
      if (result.error === "INVALID_TRANSITION") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);

      res.locals.audit = {
        action: `emergency.commitment.${parsed.data.status}`,
        entity_type: "demand_request",
        entity_id: result.commitment.demand_request_id,
        details: {
          commitment_id: result.commitment.id,
          demand_status: result.coverage?.status
        }
      };
      res.json(result);
    } catch (e) {
      logger.error({ err: e.message }, "PATCH /emergency/commitments/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/emergency/:id/commitments/:cid/create-agreement ── */
  /* Notdienst-Sofortvereinbarung: erzeugt bindendes Offer + Agreement aus Commitment */

  const emergencyAgreementSchema = z.object({
    quantity: z.number().int().min(1).optional(),
    hourly_rate: z.number().min(0).optional().nullable(),
    start_time: z.string().optional().nullable(),
    response_time_minutes: z.number().int().min(0).optional().nullable(),
    replacement_sla_minutes: z.number().int().min(0).optional().nullable(),
    terms: z.string().max(2000).optional().nullable(),
    note: z.string().max(1000).optional().nullable()
  });

  router.post("/emergency/:id/commitments/:cid/create-agreement", requireAuth, emergencyAccess, async (req, res) => {
    try {
      const parsed = emergencyAgreementSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await dealAgreementService.createEmergencyAgreement(pool, {
        demandId: req.params.id,
        commitmentId: req.params.cid,
        conditions: parsed.data,
        actorId: req.session.userId
      });

      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "FORBIDDEN") return res.status(403).json(result);
      if (result.error === "COMMITMENT_NOT_ACTIVE") return res.status(409).json(result);
      if (result.error) return res.status(400).json(result);

      // Notify requester
      const demand = await getDemandById(req.params.id);
      if (demand?.requester_company_id) {
        await dispatch(pool, "deal.emergency_agreement_created", {
          recipientUserIds: [demand.requester_company_id],
          entityType: "offer",
          entityId: result.offer.id,
          message: `Notdienst-Sofortvereinbarung ${result.offer.agreement_ref} erstellt \u2013 Ihre Best\u00e4tigung wird erwartet.`
        }).catch(swallow("emergency"));
      }

      res.locals.audit = {
        action: "emergency.agreement.create",
        entity_type: "offer",
        entity_id: result.offer.id,
        details: { demand_id: req.params.id, commitment_id: req.params.cid, agreement_ref: result.offer.agreement_ref }
      };
      res.status(201).json(result);
    } catch (e) {
      logger.error({ err: e.message }, "POST /emergency/:id/commitments/:cid/create-agreement");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
