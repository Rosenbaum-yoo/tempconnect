/**
 * Two-Sided Marketplace: capacity_posts, demand_requests, matches.
 * Plan-Gating: sla_access für Erstellung; Pulse nur PLUS/NOTDIENST.
 */

import { z } from "zod";
import { Router } from "express";
import * as marketplaceService from "../services/marketplaceService.js";
import { BRANDING } from "../config/branding.js";

const capacityPostSchema = z.object({
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
  is_search_agent: z.boolean().optional().default(false)
});

const offerSchema = z.object({
  price_type: z.enum(["hourly", "daily", "fixed"]).optional().nullable(),
  price_value: z.number().optional().nullable(),
  price_min: z.number().optional().nullable(),
  price_max: z.number().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  attachments: z.array(z.string()).optional().nullable(),
  terms: z.string().max(5000).optional().nullable(),
  // Neue Felder
  offered_quantity: z.number().int().min(1).optional().nullable(),
  offered_hourly_rate: z.number().min(0).optional().nullable(),
  start_confirmed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  surcharges: z.object({
    night: z.number().optional(),
    weekend: z.number().optional(),
    holiday: z.number().optional()
  }).optional().nullable(),
  min_hours_per_shift: z.number().min(0).optional().nullable(),
  billing_unit: z.enum(["hourly", "daily", "weekly", "monthly"]).optional().nullable(),
  validity_until: z.string().optional().nullable(),
  replacement_sla_minutes: z.number().int().min(0).optional().nullable(),
  response_time_minutes: z.number().int().min(0).optional().nullable(),
  contact_name: z.string().max(200).optional().nullable(),
  contact_phone: z.string().max(50).optional().nullable(),
  compliance_check: z.object({
    qualification_met: z.boolean().optional(),
    proofs_available: z.boolean().optional(),
    ppe_required: z.boolean().optional()
  }).optional().nullable(),
  cancellation_policy: z.object({
    notice_hours: z.number().optional(),
    penalty_percent: z.number().optional()
  }).optional().nullable()
});

const demandRequestSchema = z.object({
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
  urgency: z.enum(["normal", "plus", "notdienst"]).optional().default("normal"),
  budget_min: z.number().optional().nullable(),
  budget_max: z.number().optional().nullable(),
  sla_minutes: z.number().int().min(15).max(10080).optional().nullable()
});

/**
 * @param {{ pool, requireAuth, requireFeature, sendMail, getUserAndPlan, logger }} deps
 */
export function createMarketplaceRouter(deps) {
  const { pool, requireAuth, requireFeature, sendMail, getUserAndPlan, logger } = deps;
  const router = Router();
  const slaAccess = requireFeature("sla_access");

  /* ── capacity_posts (Zeitarbeit = Supplier) ───────────────── */

  router.get("/marketplace/capacity-posts", requireAuth, slaAccess, async (req, res) => {
    try {
      const opts = {
        supplier_company_id: req.query.supplier_id || (req.query.mine === "1" ? req.session.userId : undefined),
        location_city: req.query.city || undefined,
        role: req.query.role || undefined,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50)
      };
      const rows = await marketplaceService.listCapacityPosts(pool, opts);
      res.json(rows);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/capacity-posts");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/marketplace/capacity-posts", requireAuth, slaAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "agency") return res.status(403).json({ error: "AGENCY_ONLY" });
      const parsed = capacityPostSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const row = await marketplaceService.createCapacityPost(pool, req.session.userId, parsed.data);
      res.locals.audit = { action: "marketplace.capacity_post.create", entity_type: "capacity_post", entity_id: row.id, details: { role: parsed.data.role, city: parsed.data.location_city } };
      res.status(201).json(row);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/capacity-posts");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── demand_requests (Unternehmen = Requester) ─────────────── */

  router.get("/marketplace/demand-requests", requireAuth, slaAccess, async (req, res) => {
    try {
      const opts = {
        requester_company_id: req.session.userId,
        status: req.query.status || undefined,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50)
      };
      const rows = await marketplaceService.listDemandRequests(pool, opts);
      res.json(rows);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/marketplace/demand-requests", requireAuth, slaAccess, async (req, res) => {
    try {
      const me = await getUserAndPlan(req.session.userId);
      if (me?.role !== "company") return res.status(403).json({ error: "COMPANY_ONLY" });
      const urgency = (req.body?.urgency || "normal").toLowerCase();
      if (urgency === "notdienst" && !me?.limits?.notdienst) return res.status(403).json({ error: "PLAN_REQUIRED_NOTDIENST" });
      const parsed = demandRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const plan = me?.plan ?? "FREE";
      const demand = await marketplaceService.createDemandRequest(pool, req.session.userId, plan, parsed.data);

      if (demand.sla_status === "RUNNING") {
        await marketplaceService.recordDemandSlaStarted(pool, demand.id);
      }

      const verifiedIds = await marketplaceService.getVerifiedSupplierIds(pool);
      const { candidateCount, matchCount, matches } = await marketplaceService.runInitialMatching(pool, demand, verifiedIds);

      await marketplaceService.recordDemandMatchingAttempt(pool, demand.id, { candidateCount, matchCount });

      let notified = 0;
      const toNotify = matches.slice(0, 15);
      const notifiedIds = [];
      for (const m of toNotify) {
        const cap = m.cap;
        const { rows: userRows } = await pool.query("SELECT email, company_name FROM users WHERE id = $1", [cap.supplier_company_id]);
        const supplier = userRows[0];
        if (supplier?.email) {
          const sent = await sendMail(
            supplier.email,
            `${BRANDING.MAIL_SUBJECT_DEMAND} – Neue Nachfrage passt zu deiner Kapazität`,
            `<h2>Neue Nachfrage im Marketplace</h2>
             <p>Eine Anfrage passt zu deinem Kapazitätsangebot.</p>
             <p><b>Nachfrage:</b> ${demand.title} – ${demand.role}, ${demand.location_city}</p>
             <p><b>Dein Angebot:</b> ${cap.title}</p>
             <p style="color:#666;font-size:12px">Hinweis: Dies ist ein ${BRANDING.SLA_SHORT}-Matching-Versuch. Es wird kein Vermittlungserfolg zugesagt. Bitte im Dashboard prüfen.</p>`
          );
          if (sent) { notified++; notifiedIds.push(cap.id); }
        }
      }
      if (notifiedIds.length > 0) {
        await marketplaceService.recordDemandNotificationSent(pool, demand.id, { notifiedCount: notified });
        await marketplaceService.markMatchesNotified(pool, demand.id, notifiedIds);
      }

      if (demand.sla_due_at && new Date() <= new Date(demand.sla_due_at)) {
        await marketplaceService.markDemandSlaMet(pool, demand.id);
      }

      const events = await marketplaceService.getDemandSlaEvents(pool, demand.id);
      const matchList = await marketplaceService.getDemandMatches(pool, demand.id);
      res.locals.audit = { action: "marketplace.demand_request.create", entity_type: "demand_request", entity_id: demand.id, details: { role: parsed.data.role, urgency: parsed.data.urgency, city: parsed.data.location_city } };
      res.status(201).json({ ...demand, sla_events: events, matches: matchList });
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/demand-requests");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/demand-requests/:id", requireAuth, slaAccess, async (req, res) => {
    try {
      const id = req.params.id;
      const row = await marketplaceService.getDemandById(pool, id);
      if (!row) return res.status(404).json({ error: "NOT_FOUND" });
      if (row.requester_company_id !== req.session.userId) return res.status(403).json({ error: "FORBIDDEN" });
      const events = await marketplaceService.getDemandSlaEvents(pool, id);
      const matches = await marketplaceService.getDemandMatches(pool, id);
      res.json({ ...row, sla_events: events, matches });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests/:id");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/demand-requests/:id/sla-report", requireAuth, slaAccess, async (req, res) => {
    try {
      const id = req.params.id;
      const row = await marketplaceService.getDemandById(pool, id);
      if (!row) return res.status(404).json({ error: "NOT_FOUND" });
      if (row.requester_company_id !== req.session.userId) return res.status(403).json({ error: "FORBIDDEN" });
      const events = await marketplaceService.getDemandSlaEvents(pool, id);
      res.json({
        demand_request_id: row.id,
        created_at: row.created_at,
        sla_started_at: row.sla_started_at,
        sla_due_at: row.sla_due_at,
        sla_status: row.sla_status,
        sla_met_at: row.sla_met_at,
        sla_breached_at: row.sla_breached_at,
        first_matching_attempt_at: row.first_matching_attempt_at,
        first_notification_sent_at: row.first_notification_sent_at,
        sla_events: events
      });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests/:id/sla-report");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/demand-requests/:id/matches", requireAuth, slaAccess, async (req, res) => {
    try {
      const id = req.params.id;
      const row = await marketplaceService.getDemandById(pool, id);
      if (!row) return res.status(404).json({ error: "NOT_FOUND" });
      if (row.requester_company_id !== req.session.userId) return res.status(403).json({ error: "FORBIDDEN" });
      const matches = await marketplaceService.getDemandMatches(pool, id);
      res.json(matches);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests/:id/matches");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── offers (sla_access gated) ───────────────────────────── */

  router.post("/marketplace/demand-requests/:id/offers", requireAuth, slaAccess, async (req, res) => {
    try {
      const demandId = req.params.id;
      const demand = await marketplaceService.getDemandById(pool, demandId);
      if (!demand) return res.status(404).json({ error: "NOT_FOUND" });
      if (demand.status === "fulfilled") return res.status(400).json({ error: "DEMAND_ALREADY_FULFILLED" });
      const parsed = offerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const offer = await marketplaceService.createOffer(pool, req.session.userId, demandId, parsed.data);
      res.locals.audit = { action: "marketplace.offer.create", entity_type: "offer", entity_id: offer.id, details: { demand_request_id: demandId } };
      res.status(201).json(offer);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/demand-requests/:id/offers");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/demand-requests/:id/offers", requireAuth, slaAccess, async (req, res) => {
    try {
      const demandId = req.params.id;
      const demand = await marketplaceService.getDemandById(pool, demandId);
      if (!demand) return res.status(404).json({ error: "NOT_FOUND" });
      const offers = await marketplaceService.listOffersForDemand(pool, demandId);
      res.json(offers);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/demand-requests/:id/offers");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.patch("/marketplace/offers/:id/status", requireAuth, slaAccess, async (req, res) => {
    try {
      const newStatus = req.body?.status;
      if (!newStatus || !["sent", "accepted", "rejected"].includes(newStatus)) {
        return res.status(400).json({ error: "INVALID_STATUS" });
      }
      const result = await marketplaceService.updateOfferStatus(pool, req.params.id, newStatus, req.session.userId);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
      if (result.error === "INVALID_TRANSITION") return res.status(400).json(result);
      res.locals.audit = { action: `marketplace.offer.${newStatus}`, entity_type: "offer", entity_id: req.params.id, new_values: { status: newStatus } };
      res.json(result.offer);
    } catch (e) {
      logger.error({ err: e }, "PATCH /marketplace/offers/:id/status");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Accept Offer (Requester)
  router.post("/marketplace/offers/:id/accept", requireAuth, slaAccess, async (req, res) => {
    try {
      const result = await marketplaceService.acceptOffer(pool, req.params.id, req.session.userId);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
      if (result.error) return res.status(400).json(result);
      res.locals.audit = { action: "marketplace.offer.accept", entity_type: "offer", entity_id: req.params.id, new_values: { status: "accepted" } };
      res.json(result.offer);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/accept");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Counter Offer (Requester)
  router.post("/marketplace/offers/:id/counter", requireAuth, slaAccess, async (req, res) => {
    try {
      const result = await marketplaceService.counterOffer(pool, req.params.id, req.session.userId, req.body);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
      if (result.error) return res.status(400).json(result);
      res.locals.audit = { action: "marketplace.offer.counter", entity_type: "offer", entity_id: req.params.id };
      res.json(result.offer);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/counter");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  // Withdraw Offer (Supplier)
  router.post("/marketplace/offers/:id/withdraw", requireAuth, slaAccess, async (req, res) => {
    try {
      const result = await marketplaceService.withdrawOffer(pool, req.params.id, req.session.userId);
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      if (result.error === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
      if (result.error) return res.status(400).json(result);
      res.locals.audit = { action: "marketplace.offer.withdraw", entity_type: "offer", entity_id: req.params.id };
      res.json(result.offer);
    } catch (e) {
      logger.error({ err: e }, "POST /marketplace/offers/:id/withdraw");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── My Offers (supplier view) & Received Offers (requester view) ── */

  router.get("/marketplace/my-offers", requireAuth, slaAccess, async (req, res) => {
    try {
      const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
      const status = req.query.status || null;
      const where = status ? "AND o.status = $2" : "";
      const params = status ? [req.session.userId, status] : [req.session.userId];
      const { rows } = await pool.query(
        `SELECT o.*, d.title AS demand_title, d.role AS demand_role, d.location_city AS demand_city,
                u.company_name AS requester_name
         FROM offers o
         JOIN demand_requests d ON d.id = o.demand_request_id
         LEFT JOIN users u ON u.id = d.requester_company_id
         WHERE o.supplier_company_id = $1 ${where}
         ORDER BY o.created_at DESC LIMIT ${limit}`, params
      );
      res.json({ success: true, data: { items: rows, count: rows.length } });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/my-offers");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/received-offers", requireAuth, slaAccess, async (req, res) => {
    try {
      const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
      const { rows } = await pool.query(
        `SELECT o.*, d.title AS demand_title, d.role AS demand_role, d.location_city AS demand_city,
                su.company_name AS supplier_name
         FROM offers o
         JOIN demand_requests d ON d.id = o.demand_request_id
         LEFT JOIN users su ON su.id = o.supplier_company_id
         WHERE d.requester_company_id = $1
         ORDER BY o.created_at DESC LIMIT ${limit}`, [req.session.userId]
      );
      res.json({ success: true, data: { items: rows, count: rows.length } });
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/received-offers");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── public read-only (all authenticated users, no sla_access) ── */

  router.get("/marketplace/public/capacity-posts", requireAuth, async (req, res) => {
    try {
      const opts = {
        location_city: req.query.city || undefined,
        role: req.query.role || undefined,
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50)
      };
      const rows = await marketplaceService.listCapacityPosts(pool, opts);
      // Strip contact details for public view
      const publicRows = rows.map(r => ({
        id: r.id, title: r.title, role: r.role, skill_tags: r.skill_tags,
        headcount: r.headcount, availability_from: r.availability_from,
        availability_to: r.availability_to, location_city: r.location_city,
        price_type: r.price_type, supplier_company_name: r.supplier_company_name,
        created_at: r.created_at
      }));
      res.json(publicRows);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/public/capacity-posts");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/marketplace/public/demand-requests", requireAuth, async (req, res) => {
    try {
      const opts = {
        status: "open",
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50)
      };
      const rows = await marketplaceService.listDemandRequests(pool, opts);
      const publicRows = rows.map(r => ({
        id: r.id, title: r.title, role: r.role, skill_tags: r.skill_tags,
        headcount: r.headcount, start_date: r.start_date, end_date: r.end_date,
        location_city: r.location_city, urgency: r.urgency,
        requester_company_name: r.requester_company_name, created_at: r.created_at
      }));
      res.json(publicRows);
    } catch (e) {
      logger.error({ err: e }, "GET /marketplace/public/demand-requests");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
