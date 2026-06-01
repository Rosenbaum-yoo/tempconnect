import { z } from "zod";
import { Router } from "express";
import * as capacityService from "../services/capacityService.js";
import * as requestService from "../services/requestService.js";
import * as auditLog from "../services/auditLog.js";
import { requireOrgLimit } from "../middleware/entitlementGuard.js";

const capacitySchema = z.object({
  role: z.string().min(1).max(120),
  region: z.string().min(1).max(120),
  available_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  available_workers: z.number().int().min(0).max(999).default(1),
  tags: z.array(z.string().max(80)).optional().nullable(),
  hourly_rate_cents: z.number().int().min(0).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  radius_km: z.number().int().min(1).max(500).optional().default(25),
  city: z.string().max(120).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable()
});

const capacityPatchSchema = z.object({
  role: z.string().min(1).max(120).optional(),
  region: z.string().min(1).max(120).optional(),
  available_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  available_workers: z.number().int().min(0).max(999).optional(),
  tags: z.array(z.string().max(80)).optional().nullable(),
  hourly_rate_cents: z.number().int().min(0).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  radius_km: z.number().int().min(1).max(500).optional(),
  city: z.string().max(120).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable()
});

export function createCapacitiesRouter(deps) {
  const { pool, requireAuth, requireFeature, logger } = deps;
  const router = Router();
  const slaAccess = requireFeature("sla_access");
  const slaOffersCreate = requireFeature("sla_offers_create");
  const listingsLimitGate = requireOrgLimit("listings", { pool, logger });

  router.get("/capacities", requireAuth, slaAccess, async (req, res) => {
    try {
      const opts = {
        region: req.query.region || undefined,
        role: req.query.role || undefined,
        available_from: req.query.available_from || undefined,
        availability_window: req.query.availability_window || undefined,
        available_min: req.query.available_min != null ? parseInt(req.query.available_min, 10) : undefined,
        max_rate_cents: req.query.max_rate_cents != null ? parseInt(req.query.max_rate_cents, 10) : undefined,
        latitude: req.query.latitude != null ? parseFloat(req.query.latitude) : undefined,
        longitude: req.query.longitude != null ? parseFloat(req.query.longitude) : undefined,
        radius_km: req.query.radius_km != null ? parseInt(req.query.radius_km, 10) : undefined,
        page: req.query.page,
        limit: req.query.limit
      };
      if (req.query.tags) opts.tags = String(req.query.tags).split(",").map((t) => t.trim()).filter(Boolean);
      const result = await capacityService.searchCapacities(pool, opts);
      res.json(result);
    } catch (e) {
      logger.error({ err: e }, "GET /api/capacities");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/capacities/:id", requireAuth, slaAccess, async (req, res) => {
    try {
      const cap = await capacityService.getCapacityById(pool, req.params.id, req.session.userId);
      if (!cap) return res.status(404).json({ error: "NOT_FOUND" });
      res.json(cap);
    } catch (e) {
      logger.error({ err: e }, "GET /api/capacities/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/capacities", requireAuth, slaAccess, slaOffersCreate, listingsLimitGate, async (req, res) => {
    try {
      const me = req.user;
      if (me.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      const parsed = capacitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const cap = await capacityService.createCapacity(pool, req.session.userId, parsed.data);
      await auditLog.writeAudit(pool, { action: "capacity.create", entity_type: "capacity", entity_id: cap.id, capacity_id: cap.id, actor_id: req.session.userId, details: { role: cap.role, region: cap.region, available_workers: cap.available_workers } });
      res.status(201).json(cap);
    } catch (e) {
      logger.error({ err: e }, "POST /api/capacities");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.patch("/capacities/:id", requireAuth, slaAccess, async (req, res) => {
    try {
      const parsed = capacityPatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const before = await capacityService.getCapacityById(pool, req.params.id, req.session.userId);
      if (!before) return res.status(404).json({ error: "NOT_FOUND" });
      const cap = await capacityService.updateCapacity(pool, req.params.id, req.session.userId, parsed.data);
      if (!cap) return res.status(404).json({ error: "NOT_FOUND" });
      const action = parsed.data.is_active === false ? "capacity.deactivate" : "capacity.update";
      await auditLog.writeAudit(pool, { action, entity_type: "capacity", entity_id: cap.id, capacity_id: cap.id, actor_id: req.session.userId, details: { old: { is_active: before.is_active }, new: { is_active: cap.is_active } } });
      res.json(cap);
    } catch (e) {
      logger.error({ err: e }, "PATCH /api/capacities/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/capacities/:capacityId/reserve", requireAuth, slaAccess, async (req, res) => {
    try {
      const requestId = req.body?.request_id || null;
      if (!requestId) return res.status(400).json({ error: "VALIDATION", message: "request_id required for reserve" });
      const quantity = Math.max(1, parseInt(req.body?.quantity, 10) || 1);
      const capacityId = req.params.capacityId;
      const r = await requestService.getRequestForReserve(pool, requestId);
      if (!r) return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
      if (r.requester_id !== req.session.userId) return res.status(403).json({ error: "FORBIDDEN" });
      if (r.capacity_id !== capacityId) return res.status(400).json({ error: "VALIDATION", message: "request capacity_id must match URL" });
      if (r.status !== "SENT") return res.status(409).json({ error: "INVALID_REQUEST_STATE", message: "request must be SENT to reserve" });
      if (quantity !== (r.quantity ?? 1)) return res.status(400).json({ error: "VALIDATION", message: "quantity must match request.quantity" });
      const hasActive = await requestService.hasActiveReservationForRequest(pool, requestId);
      if (hasActive) return res.status(409).json({ error: "ALREADY_RESERVED", message: "request already has active reservation" });
      const { reservation, error } = await capacityService.reserve(pool, capacityId, quantity, requestId);
      if (error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (error === "INSUFFICIENT_CAPACITY") return res.status(409).json({ error: "INSUFFICIENT_CAPACITY" });
      await auditLog.writeAudit(pool, { action: "reservation.active", entity_type: "capacity_reservation", entity_id: reservation.id, request_id: requestId, capacity_id: capacityId, reservation_id: reservation.id, actor_id: req.session.userId, details: { quantity } });
      res.status(201).json(reservation);
    } catch (e) {
      logger.error({ err: e }, "POST /api/capacities/:capacityId/reserve");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
