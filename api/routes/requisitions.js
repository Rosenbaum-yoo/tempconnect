/**
 * Requisitions REST-Router: CRUD, Status-Uebergaenge, Events, Candidates/Shortlist.
 * Alle Endpunkte erfordern Authentifizierung, RBAC optional ueber Middleware.
 */
import { z } from "zod";
import { Router } from "express";
import * as requisitionService from "../services/requisitionService.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireScope } from "../middleware/apiKeyAuth.js";
import { RequisitionTransitionError } from "../services/requisitionService.js";
import { scheduleMatchTrigger } from "../services/matchTriggerService.js";
import { trackProductEventFromRequest } from "../services/productAnalyticsService.js";
import { assertOrgOwnership, OrgBoundaryError } from "../utils/orgBoundary.js";

const createSchema = z.object({
  org_id: z.string().uuid().optional().nullable(),
  title: z.string().min(3).max(200),
  role: z.string().min(1).max(120),
  description: z.string().max(4000).optional().nullable(),
  skill_tags: z.array(z.string().max(80)).max(30).optional(),
  headcount: z.number().int().min(1).max(999).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  location_city: z.string().max(200).optional().nullable(),
  location_postal: z.string().max(10).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  radius_km: z.number().int().min(1).max(500).optional(),
  shift_requirements: z.record(z.unknown()).optional().nullable(),
  qualifications: z.record(z.unknown()).optional().nullable(),
  budget_min_cents: z.number().int().min(0).optional().nullable(),
  budget_max_cents: z.number().int().min(0).optional().nullable(),
  urgency: z.enum(["normal", "high", "urgent", "notdienst"]).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  approval_required: z.boolean().optional()
});

const transitionSchema = z.object({
  // PARTIALLY_FILLED ergaenzt in WAVE_15: fehlte im Enum trotz gueltiger State-Machine-Unterstuetzung (Migration 113)
  status: z.enum(["PENDING_APPROVAL", "APPROVED", "OPEN", "IN_REVIEW", "SHORTLISTED", "PARTIALLY_FILLED", "FILLED", "CLOSED", "CANCELLED"]),
  cancel_reason: z.string().max(2000).optional().nullable()
});

const candidateSchema = z.object({
  capacity_post_id: z.string().uuid().optional().nullable(),
  supplier_org_id: z.string().uuid().optional().nullable(),
  match_score: z.number().min(0).max(100).optional().nullable(),
  match_reasons: z.array(z.record(z.unknown())).optional(),
  internal_notes: z.string().max(4000).optional().nullable()
});

const candidateStatusSchema = z.object({
  status: z.enum(["under_review", "shortlisted", "accepted", "rejected", "withdrawn"]),
  rejected_reason: z.string().max(2000).optional().nullable(),
  internal_notes: z.string().max(4000).optional().nullable()
});

const commentSchema = z.object({
  text: z.string().min(1).max(4000)
});

export function createRequisitionsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  /** POST /requisitions – Neue Requisition erstellen */
  router.post("/requisitions", requireAuth, requireScope("write:requisitions"), requirePermission("requisition.create", { pool, logger }), async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      // Worker-Limit pro Vermittlung
      const me = await deps.getUserAndPlan(req.session.userId);
      const wLimit = me?.limits?.max_workers_per_request;
      if (wLimit !== undefined && wLimit !== -1 && (parsed.data.headcount || 1) > wLimit) {
        return res.status(403).json({ error: "WORKER_LIMIT_EXCEEDED", limit: wLimit, requested: parsed.data.headcount || 1, plan: me.plan });
      }
      // Security: org_id muss immer vom Server kommen — body org_id wird ignoriert.
      const dataWithOrg = { ...parsed.data, org_id: req.orgId || null };
      const requisition = await requisitionService.createRequisition(pool, req.session.userId, dataWithOrg);
      res.locals.audit = { action: "requisition.create", entity_type: "requisition", entity_id: requisition.id, details: { title: parsed.data.title, role: parsed.data.role, urgency: parsed.data.urgency } };
      try {
        await trackProductEventFromRequest(pool, req, "requisition_created", {
          flow_key: "enterprise_setup_to_ops",
          metadata: { requisition_id: requisition.id, role: parsed.data.role, urgency: parsed.data.urgency || null }
        });
        await trackProductEventFromRequest(pool, req, "suchauftrag_created", {
          flow_key: "enterprise_setup_to_ops",
          metadata: { requisition_id: requisition.id }
        });
      } catch { /* analytics non-critical */ }
      res.status(201).json(requisition);
    } catch (err) {
      logger.error({ err: err.message }, "Requisition create failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /** GET /requisitions – Liste mit Filtern */
  router.get("/requisitions", requireAuth, requireScope("read:requisitions"), requirePermission("requisition.view", { pool, logger }), async (req, res) => {
    const filters = {
      org_id: req.orgId || null, // F-004 fix: server-resolved org only
      created_by: req.query.mine === "true" ? req.session.userId : null,
      status: req.query.status || null,
      urgency: req.query.urgency || null,
      assigned_to: req.query.assigned_to || null,
      limit: parseInt(req.query.limit, 10) || 50
    };
    const rows = await requisitionService.listRequisitions(pool, filters);
    res.json({ items: rows, total: rows.length });
  });

  /** GET /requisitions/:id – Detail */
  router.get("/requisitions/:id", requireAuth, requireScope("read:requisitions"), requirePermission("requisition.view", { pool, logger }), async (req, res) => {
    const requisition = await requisitionService.getRequisitionById(pool, req.params.id);
    if (!requisition) return res.status(404).json({ error: "NOT_FOUND" });
    // F-004 fix: org-boundary check
    if (req.orgId && requisition.org_id && requisition.org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    res.json(requisition);
  });

  /** PATCH /requisitions/:id – Felder aktualisieren */
  router.patch("/requisitions/:id", requireAuth, requireScope("write:requisitions"), requirePermission("requisition.edit", { pool, logger }), async (req, res) => {
    const partial = createSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ error: "VALIDATION", details: partial.error.issues });
    const updated = await requisitionService.updateRequisition(pool, req.params.id, req.session.userId, partial.data);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND_OR_FORBIDDEN" });
    res.locals.audit = { action: "requisition.update", entity_type: "requisition", entity_id: req.params.id, details: { changed_fields: Object.keys(partial.data) } };
    res.json(updated);
  });

  /** POST /requisitions/:id/transition – Status aendern */
  router.post("/requisitions/:id/transition", requireAuth, requireScope("write:requisitions"), async (req, res, next) => {
    const parsed = transitionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      // Org-Boundary: Transition nur auf eigene Requisitions erlaubt.
      if (req.orgId) await assertOrgOwnership(pool, 'requisitions', req.params.id, req.orgId);
      const result = await requisitionService.transitionStatus(
        pool, req.params.id, req.session.userId, parsed.data.status,
        { cancel_reason: parsed.data.cancel_reason }
      );
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: `requisition.transition.${parsed.data.status}`, entity_type: "requisition", entity_id: req.params.id, new_values: { status: parsed.data.status } };
      res.json(result.requisition);
    } catch (err) {
      if (err instanceof OrgBoundaryError) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION", message: err.message });
      }
      if (err instanceof RequisitionTransitionError) {
        return res.status(409).json({ error: "INVALID_TRANSITION", from: err.from, to: err.to });
      }
      next(err); // Unbekannte Fehler an globalen Error-Handler weitergeben (verhindert haengende Verbindungen)
    }
  });

  /** POST /requisitions/:id/submit – Zur Freigabe einreichen (Shortcut) */
  router.post("/requisitions/:id/submit", requireAuth, requireScope("write:requisitions"), async (req, res) => {
    try {
      const result = await requisitionService.submitForApproval(pool, req.params.id, req.session.userId);
      if (result.error) return res.status(404).json({ error: result.error });
      res.locals.audit = { action: "requisition.submit_for_approval", entity_type: "requisition", entity_id: req.params.id };
      res.json(result.requisition);
    } catch (err) {
      if (err instanceof RequisitionTransitionError) {
        return res.status(409).json({ error: "INVALID_TRANSITION", from: err.from, to: err.to });
      }
      throw err;
    }
  });

  /** POST /requisitions/:id/approve – Freigabe */
  router.post("/requisitions/:id/approve", requireAuth, requireScope("write:requisitions"), requirePermission("requisition.approve", { pool, logger }), async (req, res) => {
    try {
      // Org-Boundary: Freigabe nur auf eigene Requisitions erlaubt.
      if (req.orgId) await assertOrgOwnership(pool, 'requisitions', req.params.id, req.orgId);
      const result = await requisitionService.approveRequisition(pool, req.params.id, req.session.userId);
      if (result.error) return res.status(404).json({ error: result.error });
      res.locals.audit = { action: "requisition.approve", entity_type: "requisition", entity_id: req.params.id, new_values: { status: "APPROVED" } };

      // ── Instant-Matching (P4.1): ein Chokepoint, beide Seiten, Dedup in der DB ──
      // Der Trigger laedt die Requisition selbst — kein zweiter, driftender Datensatz.
      scheduleMatchTrigger(pool, { sourceType: "requisition", sourceId: req.params.id });

      res.json(result.requisition);
    } catch (err) {
      if (err instanceof OrgBoundaryError) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION", message: err.message });
      }
      if (err instanceof RequisitionTransitionError) {
        return res.status(409).json({ error: "INVALID_TRANSITION", from: err.from, to: err.to });
      }
      throw err;
    }
  });

  /** GET /requisitions/:id/events – Audit Trail */
  router.get("/requisitions/:id/events", requireAuth, requireScope("read:requisitions"), requirePermission("requisition.view", { pool, logger }), async (req, res) => {
    const events = await requisitionService.getRequisitionEvents(pool, req.params.id);
    res.json({ events });
  });

  /** POST /requisitions/:id/comment – Kommentar hinzufuegen */
  router.post("/requisitions/:id/comment", requireAuth, requireScope("write:requisitions"), async (req, res) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    await requisitionService.addComment(pool, req.params.id, req.session.userId, parsed.data.text);
    res.locals.audit = { action: "requisition.comment", entity_type: "requisition", entity_id: req.params.id };
    res.json({ ok: true });
  });

  /* ── Candidates / Shortlist ──────────────────────────────── */

  /** GET /requisitions/:id/candidates – Kandidatenliste */
  router.get("/requisitions/:id/candidates", requireAuth, requireScope("read:requisitions"), requirePermission("requisition.view", { pool, logger }), async (req, res) => {
    const candidates = await requisitionService.listCandidates(pool, req.params.id);
    res.json({ candidates });
  });

  /** POST /requisitions/:id/candidates – Kandidat hinzufuegen */
  router.post("/requisitions/:id/candidates", requireAuth, requireScope("write:requisitions"), requirePermission("requisition.edit", { pool, logger }), async (req, res, next) => {
    const parsed = candidateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      // Org-Boundary: Kandidat nur an EIGENE Requisition haengen (sonst Cross-Org-IDOR).
      if (req.orgId) await assertOrgOwnership(pool, 'requisitions', req.params.id, req.orgId);
      const candidate = await requisitionService.addCandidate(pool, req.params.id, parsed.data, req.session.userId);
      res.locals.audit = { action: "requisition.candidate.add", entity_type: "requisition_candidate", entity_id: candidate.id, details: { requisition_id: req.params.id } };
      res.status(201).json(candidate);
    } catch (err) {
      if (err instanceof OrgBoundaryError) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION", message: err.message });
      next(err);
    }
  });

  /** PATCH /requisitions/:reqId/candidates/:candId – Kandidaten-Status aendern */
  router.patch("/requisitions/:reqId/candidates/:candId", requireAuth, requireScope("write:requisitions"), requirePermission("requisition.edit", { pool, logger }), async (req, res, next) => {
    const parsed = candidateStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    try {
      // Org-Boundary: nur Kandidaten der EIGENEN Requisition aendern; zusaetzlich bindet der
      // Service den Kandidaten an reqId (verhindert fremde candId unter eigener reqId) — Cross-Org-IDOR-Schutz.
      if (req.orgId) await assertOrgOwnership(pool, 'requisitions', req.params.reqId, req.orgId);
      const updated = await requisitionService.updateCandidateStatus(
        pool, req.params.candId, req.session.userId, parsed.data.status,
        { rejected_reason: parsed.data.rejected_reason, internal_notes: parsed.data.internal_notes, requisitionId: req.params.reqId }
      );
      if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: `requisition.candidate.${parsed.data.status}`, entity_type: "requisition_candidate", entity_id: req.params.candId, new_values: { status: parsed.data.status } };
      res.json(updated);
    } catch (err) {
      if (err instanceof OrgBoundaryError) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION", message: err.message });
      next(err);
    }
  });

  return router;
}
