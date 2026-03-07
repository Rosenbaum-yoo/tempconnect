import { z } from "zod";
import { Router } from "express";
import { hasFeature } from "../config/planFeatures.js";
import * as capacityService from "../services/capacityService.js";
import * as complianceService from "../services/complianceService.js";
import * as slaService from "../services/slaService.js";
import * as supplierMetricsService from "../services/supplierMetricsService.js";
import * as auditLog from "../services/auditLog.js";
import * as stateMachine from "../services/stateMachine.js";
import * as requestService from "../services/requestService.js";

const requestSchema = z.object({
  listing_id: z.string().uuid().optional(),
  message: z.string().max(4000).optional().nullable(),
  priority: z.enum(["NORMAL", "NOTDIENST"]).default("NORMAL")
});

const requestCapacitySchema = z.object({
  capacity_id: z.string().uuid(),
  role: z.string().max(120).optional().nullable(),
  quantity: z.number().int().min(1).max(999).default(1),
  location_text: z.string().max(500).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  duration_days: z.number().int().min(1).optional().nullable(),
  shift_schedule: z.record(z.unknown()).optional().nullable(),
  qualification_tags: z.array(z.string().max(80)).optional().nullable(),
  required_certifications: z.array(z.string().max(120)).optional().nullable(),
  max_hourly_rate_cents: z.number().int().min(0).optional().nullable(),
  urgency: z.enum(["normal", "high", "urgent"]).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  message: z.string().max(4000).optional().nullable(),
  contact_email: z.string().max(255).optional().nullable(),
  contact_phone: z.string().max(50).optional().nullable(),
  priority: z.enum(["NORMAL", "NOTDIENST"]).default("NORMAL"),
  sla_minutes: z.number().int().min(15).max(10080).optional()
}).refine((d) => d.end_date || d.duration_days, { message: "end_date or duration_days required", path: ["end_date"] });

export function createRequestsRouter(deps) {
  const { pool, getUserAndPlan, requireAuth, requestLimiter, sendMail, logger } = deps;
  const router = Router();

  router.post("/requests", requireAuth, requestLimiter, async (req, res) => {
    const me = await getUserAndPlan(req.session.userId);
    if (me.limits.requests_send !== -1 && me.usage.sent_count >= me.limits.requests_send) {
      return res.status(403).json({ error: "LIMIT_REACHED", type: "requests_send", limit: me.limits.requests_send, current: me.usage.sent_count });
    }
    if (req.body?.capacity_id) {
      const plan = me?.plan ?? "FREE";
      if (!hasFeature(plan, "sla_access")) {
        logger.warn({ featureKey: "sla_access", userId: req.session.userId, plan }, "Feature gate violation");
        return res.status(403).json({ ok: false, code: "FEATURE_NOT_ALLOWED", feature: "sla_access", plan });
      }
      const parsed = requestCapacitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const data = parsed.data;
      if (data.priority === "NOTDIENST" && !me.limits.notdienst) return res.status(403).json({ error: "PLAN_REQUIRED_NOTDIENST" });
      const cap = await requestService.getActiveCapacity(pool, data.capacity_id);
      if (!cap) return res.status(404).json({ error: "CAPACITY_NOT_FOUND" });
      const receiver_id = cap.agency_id;
      if (receiver_id === req.session.userId) return res.status(400).json({ error: "CANNOT_REQUEST_OWN_CAPACITY" });
      if (me.role !== "company") return res.status(403).json({ error: "ROLE_MISMATCH", message: "Only companies can request capacity from agencies." });
      const defaultSla = data.priority === "NOTDIENST" ? 30 : 60;
      const slaMinutes = Math.max(15, Math.min(10080, data.sla_minutes ?? defaultSla));
      const respondBy = new Date(Date.now() + slaMinutes * 60 * 1000);
      const requestRow = await requestService.createCapacityRequest(pool, {
        ...data, requester_id: req.session.userId, receiver_id, sla_minutes: slaMinutes, sla_respond_by: respondBy
      });
      await slaService.recordSlaStarted(pool, requestRow.id);
      await slaService.recordMatchingAttempt(pool, requestRow.id, { resultCount: 1 });
      try {
        const [receiver, sender, capMeta] = await Promise.all([
          requestService.getUserContact(pool, receiver_id),
          requestService.getUserContact(pool, req.session.userId),
          requestService.getCapacityMeta(pool, data.capacity_id)
        ]);
        if (receiver && sender) {
          const sent = await sendMail(
            receiver.email,
            `TempConnect: Neue Kapazitätsanfrage${data.priority === "NOTDIENST" ? " [NOTDIENST]" : ""}`,
            `<h2>Neue Kapazitätsanfrage erhalten</h2>
             <p><b>${sender.company_name || sender.email}</b> fragt Kapazität an.</p>
             <p><b>Rolle/Region:</b> ${(capMeta?.role || data.role) || "–"} – ${(capMeta?.region || data.region) || "–"}</p>
             ${data.message ? `<p><b>Nachricht:</b> ${data.message}</p>` : ""}
             <p style="margin-top:20px">Bitte im Dashboard unter Eingang prüfen und annehmen oder ablehnen.</p>`
          );
          if (sent) await slaService.recordNotificationSent(pool, requestRow.id, {});
        }
      } catch (emailErr) {
        logger.warn({ err: emailErr }, "E-Mail bei Kapazitätsanfrage fehlgeschlagen");
      }
      if (new Date() <= respondBy) await slaService.markSlaMet(pool, requestRow.id);
      try { await complianceService.computeForRequest(pool, requestRow.id); } catch (_) {}
      const { reservation } = await capacityService.reserve(pool, data.capacity_id, data.quantity ?? 1, requestRow.id);
      if (reservation) {
        await requestService.linkReservationToRequest(pool, requestRow.id, reservation.id);
        reservation.request_id = requestRow.id;
        await auditLog.writeAudit(pool, { action: "reservation.active", entity_type: "capacity_reservation", entity_id: reservation.id, request_id: requestRow.id, capacity_id: data.capacity_id, reservation_id: reservation.id, actor_id: req.session.userId, details: { quantity: data.quantity ?? 1 } });
      }
      return res.status(201).json({ ...requestRow, reservation: reservation || null });
    }
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const { listing_id, message, priority } = parsed.data;
    if (!listing_id) return res.status(400).json({ error: "VALIDATION", message: "listing_id or capacity_id required" });
    if (priority === "NOTDIENST" && !me.limits.notdienst) return res.status(403).json({ error: "PLAN_REQUIRED_NOTDIENST" });
    const l = await requestService.getActiveListing(pool, listing_id);
    if (!l) return res.status(404).json({ error: "LISTING_NOT_FOUND" });
    const receiver_id = l.owner_id;
    const listingType = l.type;
    if (receiver_id === req.session.userId) return res.status(400).json({ error: "CANNOT_REQUEST_OWN_LISTING" });
    const allowed = (me.role === "company" && listingType === "supply") || (me.role === "agency" && listingType === "demand");
    if (!allowed) return res.status(403).json({ error: "ROLE_MISMATCH", message: "Unternehmen koennen nur Anfragen an Zeitarbeitsfirmen senden – Zeitarbeitsfirmen nur an Unternehmen." });
    const requestRow = await requestService.createListingRequest(pool, {
      listing_id, requester_id: req.session.userId, receiver_id, message, priority
    });
    try {
      const [listingMeta, receiver, sender] = await Promise.all([
        requestService.getListingMeta(pool, listing_id),
        requestService.getUserContact(pool, receiver_id),
        requestService.getUserContact(pool, req.session.userId)
      ]);
      if (receiver && listingMeta && sender) {
        const senderName = sender.company_name || sender.email;
        const priorityText = priority === "NOTDIENST" ? " <b style='color:#ffcc00'>[NOTDIENST]</b>" : "";
        await sendMail(
          receiver.email,
          `TempConnect: Neue Anfrage${priority === "NOTDIENST" ? " [NOTDIENST]" : ""}`,
          `<h2>Neue Anfrage erhalten!${priorityText}</h2>
         <p><b>${senderName}</b> möchte dich kontaktieren.</p>
         <p><b>Karteikarte:</b> ${listingMeta.category} - ${listingMeta.region}</p>
         ${message ? `<p><b>Nachricht:</b> ${message}</p>` : ""}
         <p style="margin-top:20px">Gehe in dein Dashboard unter "Anfragen & Status", um die Anfrage anzunehmen oder abzulehnen.</p>`
        );
      }
    } catch (emailErr) {
      logger.warn({ err: emailErr }, "Email bei neuer Anfrage fehlgeschlagen");
    }
    res.locals.audit = { action: "request.create", entity_type: "request", entity_id: requestRow.id, details: { listing_id, priority, type: "listing" } };
    res.json(requestRow);
  });

  router.post("/requests/broadcast", requireAuth, requestLimiter, async (req, res) => {
    const me = await getUserAndPlan(req.session.userId);
    if (me.limits.requests_send !== -1 && me.usage.sent_count >= me.limits.requests_send) {
      return res.status(403).json({ error: "LIMIT_REACHED", type: "requests_send", limit: me.limits.requests_send, current: me.usage.sent_count });
    }
    const priority = String(req.body?.priority || "NORMAL");
    const message = String(req.body?.message || "");
    const filters = req.body?.filters || {};
    if (priority === "NOTDIENST" && !me.limits.notdienst) return res.status(403).json({ error: "PLAN_REQUIRED_NOTDIENST" });

    const allowedType = me.role === "company" ? "supply" : "demand";
    const targets = await requestService.findBroadcastTargets(pool, req.session.userId, allowedType, filters);
    let created = 0;
    const remainingSlots = me.limits.requests_send === -1 ? 9999 : (me.limits.requests_send - me.usage.sent_count);
    for (const t of targets) {
      if (created >= remainingSlots) break;
      await requestService.insertBroadcastRequest(pool, t.listing_id, req.session.userId, t.receiver_id, message, priority);
      created++;
    }
    res.locals.audit = { action: "request.broadcast", entity_type: "request", details: { created, filters, priority } };
    res.json({ created, limited: created < targets.length });
  });

  router.get("/requests/:id", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const row = await requestService.getRequestDetail(pool, id);
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });
    if (row.requester_id !== req.session.userId && row.receiver_id !== req.session.userId) return res.status(403).json({ error: "FORBIDDEN" });
    const { compliance_status, compliance_reasons, sla_events } = await requestService.getRequestComplianceAndEvents(pool, id);
    let scorecard = null;
    if (row.receiver_id && (row.requester_id === req.session.userId || row.receiver_id === req.session.userId)) {
      try { scorecard = await supplierMetricsService.getScorecard(pool, row.receiver_id, 30); } catch (_) {}
    }
    res.json({
      ...row,
      compliance_status,
      compliance_reasons,
      sla_events,
      scorecard: scorecard
        ? {
            grade: scorecard.grade,
            fill_rate: scorecard.fill_rate,
            on_time_rate: scorecard.on_time_rate,
            avg_rating: scorecard.avg_rating,
            sla_breach_rate: scorecard.sla_breach_rate
          }
        : null
    });
  });

  router.get("/requests/:id/sla-report", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const row = await requestService.getFullRequest(pool, id);
    if (!row) return res.status(404).json({ error: "NOT_FOUND" });
    if (row.requester_id !== req.session.userId && row.receiver_id !== req.session.userId) return res.status(403).json({ error: "FORBIDDEN" });
    const { sla_events } = await requestService.getRequestComplianceAndEvents(pool, id);
    const report = {
      request_id: row.id,
      created_at: row.created_at,
      sla_started_at: row.sla_started_at,
      sla_respond_by: row.sla_respond_by,
      sla_status: row.sla_status,
      sla_met_at: row.sla_met_at,
      sla_breached_at: row.sla_breached_at,
      first_matching_attempt_at: row.first_matching_attempt_at,
      first_notification_sent_at: row.first_notification_sent_at,
      sla_minutes: row.sla_minutes,
      sla_events
    };
    res.json(report);
  });

  router.post("/requests/:id/sla", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const slaMinutes = Math.max(15, Math.min(10080, parseInt(req.body?.sla_minutes, 10) || 60));
    const out = await slaService.setSla(pool, id, slaMinutes, req.session.userId);
    if (!out.ok) return res.status(out.error === "NOT_FOUND" ? 404 : 403).json({ error: out.error });
    const sla = await requestService.getRequestSla(pool, id);
    res.locals.audit = { action: "request.sla.set", entity_type: "request", entity_id: id, details: { sla_minutes: slaMinutes } };
    res.json(sla);
  });

  router.get("/suppliers/:agencyId/scorecard", requireAuth, async (req, res) => {
    const agencyId = String(req.params.agencyId);
    const window = Math.min(90, Math.max(7, parseInt(req.query.window, 10) || 30));
    const me = await getUserAndPlan(req.session.userId);
    if (me.role === "agency" && agencyId !== req.session.userId) return res.status(403).json({ error: "FORBIDDEN" });
    try {
      const scorecard = await supplierMetricsService.getScorecard(pool, agencyId, window);
      res.json(scorecard);
    } catch (e) {
      logger.error({ err: e }, "GET scorecard");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/policies/compliance", requireAuth, async (req, res) => {
    const me = await getUserAndPlan(req.session.userId);
    if (me.role !== "company") return res.status(403).json({ error: "COMPANY_ONLY" });
    const body = req.body || {};
    const policy = await requestService.createCompliancePolicy(pool, req.session.userId, {
      role_pattern: typeof body.role_pattern === "string" ? body.role_pattern : null,
      required_fields: Array.isArray(body.required_fields) ? body.required_fields : null,
      required_certifications: Array.isArray(body.required_certifications) ? body.required_certifications : null,
      strict_mode: Boolean(body.strict_mode)
    });
    res.locals.audit = { action: "compliance.policy.create", entity_type: "compliance_policy", entity_id: policy.id, details: { strict_mode: Boolean(body.strict_mode) } };
    res.status(201).json(policy);
  });

  router.get("/my/requests/sent", requireAuth, async (req, res) => {
    const rows = await requestService.getSentRequests(pool, req.session.userId);
    res.json(rows);
  });

  router.get("/my/requests/received", requireAuth, async (req, res) => {
    const rows = await requestService.getReceivedRequests(pool, req.session.userId);
    res.json(rows);
  });

  router.patch("/requests/:id/status", requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const status = String(req.body?.status || "");
    const contact_email = String(req.body?.contact_email || "");
    const contact_phone = String(req.body?.contact_phone || "");
    if (!["ACCEPTED", "DECLINED", "FINALIZED", "FILLED", "CANCELED", "SENT"].includes(status)) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }
    try {
      const req_data = await requestService.getRequestById(pool, id);
      if (!req_data) return res.status(404).json({ error: "NOT_FOUND" });
      const isRequester = req_data.requester_id === req.session.userId;
      const isReceiver = req_data.receiver_id === req.session.userId;
      try {
        stateMachine.assertTransition("REQUEST", req_data.status, status);
      } catch (e) {
        if (e.name === "TransitionError") {
          return res.status(409).json({
            error: "invalid_transition",
            entityType: e.entityType,
            from: e.from,
            to: e.to
          });
        }
        throw e;
      }

      if (req_data.capacity_id) {
        if (status === "ACCEPTED") {
          if (!isReceiver) return res.status(403).json({ error: "FORBIDDEN" });
          const { request: updated, error } = await capacityService.acceptRequest(pool, id, req.session.userId, { contact_email, contact_phone });
          if (error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
          if (error === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
          if (error === "INVALID_STATE") return res.status(409).json({ error: "INVALID_STATE" });
          if (error === "INSUFFICIENT_CAPACITY") return res.status(409).json({ error: "INSUFFICIENT_CAPACITY" });
          const resv = await requestService.getReservationByStatus(pool, id, "converted");
          if (resv) {
            await stateMachine.logTransition(pool, { entityType: "RESERVATION", from: "active", to: "converted", entity_id: resv.id, reservation_id: resv.id, request_id: id, capacity_id: req_data.capacity_id, actor_id: req.session.userId });
            await auditLog.writeAudit(pool, { action: "reservation.converted", entity_type: "capacity_reservation", entity_id: resv.id, request_id: id, capacity_id: req_data.capacity_id, reservation_id: resv.id, actor_id: req.session.userId });
          }
          await stateMachine.logTransition(pool, { entityType: "REQUEST", from: req_data.status, to: "ACCEPTED", entity_id: id, request_id: id, capacity_id: req_data.capacity_id, actor_id: req.session.userId });
          await auditLog.writeAudit(pool, { action: "request.accept", entity_type: "request", entity_id: id, request_id: id, capacity_id: req_data.capacity_id, actor_id: req.session.userId, details: { from: "SENT", to: "ACCEPTED" } });
          try { await slaService.markSlaResolved(pool, id); } catch (_) {}
          const [requester, receiver] = await Promise.all([
            requestService.getUserContact(pool, req_data.requester_id),
            requestService.getUserContact(pool, req_data.receiver_id)
          ]);
          if (requester && receiver) {
            await sendMail(requester.email, "TempConnect: Deine Anfrage wurde angenommen!",
              `<h2>Gute Nachrichten!</h2><p><b>${receiver.company_name || receiver.email}</b> hat deine Anfrage angenommen.</p><p>Gehe in dein Dashboard unter "Anfragen & Status", um den Deal abzuschließen.</p>`);
          }
          return res.json(updated);
        }
        if (status === "DECLINED") {
          if (!isReceiver) return res.status(403).json({ error: "FORBIDDEN" });
          const { ok, error } = await capacityService.releaseReservationAndSetStatus(pool, id, "DECLINED", req.session.userId);
          if (!ok) return res.status(error === "NOT_FOUND" ? 404 : 403).json({ error: error || "FORBIDDEN" });
          const resvDecl = await requestService.getReservationByStatus(pool, id, "expired");
          if (resvDecl) {
            await stateMachine.logTransition(pool, { entityType: "RESERVATION", from: "active", to: "expired", entity_id: resvDecl.id, reservation_id: resvDecl.id, request_id: id, capacity_id: req_data.capacity_id, actor_id: req.session.userId });
            await auditLog.writeAudit(pool, { action: "reservation.expired", entity_type: "capacity_reservation", entity_id: resvDecl.id, request_id: id, capacity_id: req_data.capacity_id, actor_id: req.session.userId });
          }
          await stateMachine.logTransition(pool, { entityType: "REQUEST", from: req_data.status, to: "DECLINED", entity_id: id, request_id: id, actor_id: req.session.userId });
          await auditLog.writeAudit(pool, { action: "request.status_change", entity_type: "request", entity_id: id, request_id: id, actor_id: req.session.userId, details: { from: "SENT", to: "DECLINED" } });
          const fullReq = await requestService.getFullRequest(pool, id);
          const [requester, receiver, capMeta] = await Promise.all([
            requestService.getUserContact(pool, req_data.requester_id),
            requestService.getUserContact(pool, req_data.receiver_id),
            requestService.getCapacityMeta(pool, req_data.capacity_id)
          ]);
          try { await slaService.markSlaResolved(pool, id); } catch (_) {}
          if (requester && receiver && capMeta) {
            await sendMail(requester.email, "TempConnect: Anfrage wurde abgelehnt",
              `<h2>Anfrage abgelehnt</h2><p>Leider hat <b>${receiver.company_name || receiver.email}</b> deine Anfrage abgelehnt.</p><p><b>Kapazität:</b> ${capMeta.role} - ${capMeta.region}</p>`);
          }
          return res.json(fullReq);
        }
        if (status === "FINALIZED") {
          if (!isRequester) return res.status(403).json({ error: "FORBIDDEN" });
          const { request: updated, error } = await capacityService.finalizeRequest(pool, id, req.session.userId);
          if (error) return res.status(error === "NOT_FOUND" ? 404 : error === "FORBIDDEN" ? 403 : 409).json({ error: error || "SERVER_ERROR" });
          const [requester, receiver] = await Promise.all([
            requestService.getUserContact(pool, req_data.requester_id),
            requestService.getUserContact(pool, req_data.receiver_id)
          ]);
          await stateMachine.logTransition(pool, { entityType: "REQUEST", from: "ACCEPTED", to: "FINALIZED", entity_id: id, request_id: id, capacity_id: req_data.capacity_id, actor_id: req.session.userId });
          await auditLog.writeAudit(pool, { action: "request.finalize", entity_type: "request", entity_id: id, request_id: id, capacity_id: req_data.capacity_id, actor_id: req.session.userId, details: { from: "ACCEPTED", to: "FINALIZED" } });
          if (requester && receiver) {
            await sendMail(requester.email, "TempConnect: Deal abgeschlossen - Kontaktdaten",
              `<h2>Deal abgeschlossen!</h2><p>Dein Deal mit <b>${receiver.company_name || receiver.email}</b> wurde finalisiert.</p><h3>Kontaktdaten:</h3><p>E-Mail: <b>${updated.contact_email || receiver.email}</b></p><p>Telefon: <b>${updated.contact_phone || receiver.phone || "nicht angegeben"}</b></p>`);
            await sendMail(receiver.email, "TempConnect: Deal finalisiert",
              `<h2>Deal finalisiert!</h2><p><b>${requester.company_name || requester.email}</b> hat den Deal mit dir abgeschlossen.</p>`);
          }
          return res.json(updated);
        }
        if (status === "CANCELED") {
          if (!isRequester && !isReceiver) return res.status(403).json({ error: "FORBIDDEN" });
          const { ok, error } = await capacityService.releaseReservationAndSetStatus(pool, id, "CANCELED", req.session.userId);
          if (!ok) return res.status(error === "NOT_FOUND" ? 404 : 403).json({ error: error || "FORBIDDEN" });
          const resvCancel = await requestService.getReservationByStatus(pool, id, "expired");
          if (resvCancel) {
            await stateMachine.logTransition(pool, { entityType: "RESERVATION", from: "active", to: "expired", entity_id: resvCancel.id, reservation_id: resvCancel.id, request_id: id, capacity_id: req_data.capacity_id, actor_id: req.session.userId });
            await auditLog.writeAudit(pool, { action: "reservation.expired", entity_type: "capacity_reservation", entity_id: resvCancel.id, request_id: id, capacity_id: req_data.capacity_id, actor_id: req.session.userId });
          }
          await stateMachine.logTransition(pool, { entityType: "REQUEST", from: req_data.status, to: "CANCELED", entity_id: id, request_id: id, actor_id: req.session.userId });
          await auditLog.writeAudit(pool, { action: "request.status_change", entity_type: "request", entity_id: id, request_id: id, actor_id: req.session.userId, details: { from: req_data.status, to: "CANCELED" } });
          const fullReq = await requestService.getFullRequest(pool, id);
          return res.json(fullReq);
        }
        return res.status(400).json({ error: "INVALID_STATUS" });
      }

      if (status === "ACCEPTED" || status === "DECLINED") {
        if (!isReceiver) return res.status(403).json({ error: "FORBIDDEN" });
      } else if (status === "FINALIZED") {
        if (!isRequester) return res.status(403).json({ error: "FORBIDDEN" });
        if (req_data.status !== "ACCEPTED") return res.status(400).json({ error: "MUST_BE_ACCEPTED_FIRST" });
      } else if (status === "CANCELED") {
        if (!isRequester && !isReceiver) return res.status(403).json({ error: "FORBIDDEN" });
      }

      const updated = await requestService.updateRequestStatus(pool, id, status, contact_email, contact_phone);
      await stateMachine.logTransition(pool, { entityType: "REQUEST", from: req_data.status, to: status, entity_id: id, request_id: id, actor_id: req.session.userId });
      await auditLog.writeAudit(pool, { action: "request.status_change", entity_type: "request", entity_id: id, request_id: id, actor_id: req.session.userId, details: { from: req_data.status, to: status } });
      if (status === "ACCEPTED" || status === "DECLINED") {
        try { await slaService.markSlaResolved(pool, id); } catch (_) {}
      }
      if (status === "FINALIZED") {
        await requestService.fillRelatedRequests(pool, req_data.listing_id, req.session.userId, id);
        const [requester, receiver] = await Promise.all([
          requestService.getUserContact(pool, req_data.requester_id),
          requestService.getUserContact(pool, req_data.receiver_id)
        ]);
        if (requester && receiver) {
          await sendMail(requester.email, "TempConnect: Deal abgeschlossen - Kontaktdaten",
            `<h2>Deal abgeschlossen!</h2><p>Dein Deal mit <b>${receiver.company_name || receiver.email}</b> wurde finalisiert.</p><h3>Kontaktdaten:</h3><p>E-Mail: <b>${updated.contact_email || receiver.email}</b></p><p>Telefon: <b>${updated.contact_phone || receiver.phone || "nicht angegeben"}</b></p>`);
          await sendMail(receiver.email, "TempConnect: Deal finalisiert",
            `<h2>Deal finalisiert!</h2><p><b>${requester.company_name || requester.email}</b> hat den Deal mit dir abgeschlossen.</p><p>Du kannst jetzt direkt Kontakt aufnehmen.</p>`);
        }
      }
      if (status === "ACCEPTED") {
        const [requester, receiver] = await Promise.all([
          requestService.getUserContact(pool, req_data.requester_id),
          requestService.getUserContact(pool, req_data.receiver_id)
        ]);
        if (requester && receiver) {
          await sendMail(requester.email, "TempConnect: Deine Anfrage wurde angenommen!",
            `<h2>Gute Nachrichten!</h2><p><b>${receiver.company_name || receiver.email}</b> hat deine Anfrage angenommen.</p><p>Gehe in dein Dashboard unter "Anfragen & Status", um den Deal abzuschließen und Kontaktdaten auszutauschen.</p>`);
        }
      }
      if (status === "DECLINED") {
        const [requester, receiver, listingMeta] = await Promise.all([
          requestService.getUserContact(pool, req_data.requester_id),
          requestService.getUserContact(pool, req_data.receiver_id),
          requestService.getListingMeta(pool, req_data.listing_id)
        ]);
        if (requester && receiver && listingMeta) {
          await sendMail(requester.email, "TempConnect: Anfrage wurde abgelehnt",
            `<h2>Anfrage abgelehnt</h2><p>Leider hat <b>${receiver.company_name || receiver.email}</b> deine Anfrage abgelehnt.</p><p><b>Karteikarte:</b> ${listingMeta.category} - ${listingMeta.region}</p><p style="margin-top:16px">Das ist kein Problem - es gibt viele andere Anbieter auf TempConnect!</p><p>Suche im Marketplace nach weiteren passenden Partnern.</p>`);
        }
      }
      res.json(updated);
    } catch (e) {
      if (e.name === "TransitionError") {
        return res.status(409).json({
          error: "invalid_transition",
          entityType: e.entityType,
          from: e.from,
          to: e.to
        });
      }
      logger.error({ err: e }, "Status-Update fehlgeschlagen");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
