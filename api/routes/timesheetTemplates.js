/**
 * Timesheet Templates Router
 * Verwaltung von Stundenzettel-Vorlagen (Zeitarbeit).
 * Nur für Agentur-Nutzer (kein worker-role).
 */
import { z } from "zod";
import { Router } from "express";
import * as templateSvc from "../services/timesheetTemplateService.js";

/* ── Schemas ─────────────────────────────────────────────────────────────── */

const fieldSchema = z.object({
  field_key:     z.string().min(1).max(100),
  label:         z.string().min(1).max(200),
  field_type:    z.enum(["text", "number", "time", "date", "boolean", "select"]).default("text"),
  is_required:   z.boolean().default(false),
  is_visible:    z.boolean().default(true),
  default_value: z.string().max(500).optional().nullable(),
  options:       z.array(z.string()).optional().nullable(),
  sort_order:    z.number().int().min(0).optional()
});

const createTemplateSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  is_default:  z.boolean().default(false),
  fields:      z.array(fieldSchema).default([])
});

const updateTemplateSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  is_default:  z.boolean().optional(),
  is_active:   z.boolean().optional(),
  fields:      z.array(fieldSchema).optional()
});

const assignSchema = z.object({
  assignment_id: z.string().uuid().optional().nullable(),
  org_id:        z.string().uuid().optional().nullable()
});

/* ── Auth-Hilfsfunktion ──────────────────────────────────────────────────── */

function requireAgencyRole(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  if (req.session.userRole === "worker") return res.status(403).json({ error: "AGENCY_ROLE_REQUIRED" });
  next();
}

/* ── Router ──────────────────────────────────────────────────────────────── */

export function createTimesheetTemplatesRouter(deps) {
  const { pool, requireAuth } = deps;
  const router = Router();
  const base = [requireAuth, requireAgencyRole];

  /* ── Liste aller Templates der Agentur ────────────────────────────────── */

  router.get("/timesheet-templates", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const items = await templateSvc.listTemplates(pool, supplierOrgId);
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  /* ── Einzelnes Template mit Feldern ───────────────────────────────────── */

  router.get("/timesheet-templates/:id", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      const tmpl = await templateSvc.getTemplate(pool, req.params.id, supplierOrgId);
      if (!tmpl) return res.status(404).json({ error: "NOT_FOUND" });
      res.json(tmpl);
    } catch (err) { next(err); }
  });

  /* ── Template für einen konkreten Einsatz ermitteln ──────────────────── */

  router.get("/timesheet-templates/for-assignment/:id", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const tmpl = await templateSvc.getTemplateForAssignment(pool, req.params.id, supplierOrgId);
      res.json(tmpl || null);
    } catch (err) { next(err); }
  });

  /* ── Template anlegen ──────────────────────────────────────────────────── */

  router.post("/timesheet-templates", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const parsed = createTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const result = await templateSvc.createTemplate(pool, {
        supplierOrgId,
        name:        parsed.data.name,
        description: parsed.data.description,
        isDefault:   parsed.data.is_default,
        createdBy:   req.session.userId,
        fields:      parsed.data.fields
      });
      if (result.error) {
        return res.status(result.error === "DUPLICATE_NAME" ? 409 : 400).json(result);
      }
      res.locals.audit = { action: "timesheet_template.create", entity_type: "timesheet_template", entity_id: result.template.id, details: { name: parsed.data.name } };
      res.status(201).json(result.template);
    } catch (err) { next(err); }
  });

  /* ── Template aktualisieren ─────────────────────────────────────────── */

  router.patch("/timesheet-templates/:id", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const parsed = updateTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const result = await templateSvc.updateTemplate(pool, req.params.id, supplierOrgId, {
        name:        parsed.data.name,
        description: parsed.data.description,
        isDefault:   parsed.data.is_default,
        isActive:    parsed.data.is_active,
        fields:      parsed.data.fields
      });
      if (result.error) return res.status(result.error === "NOT_FOUND" ? 404 : 400).json(result);
      res.locals.audit = { action: "timesheet_template.update", entity_type: "timesheet_template", entity_id: req.params.id, details: { changed_fields: Object.keys(parsed.data) } };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* ── Template löschen ──────────────────────────────────────────────── */

  router.delete("/timesheet-templates/:id", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const result = await templateSvc.deleteTemplate(pool, req.params.id, supplierOrgId);
      if (result.error) {
        const s = result.error === "NOT_FOUND" ? 404 : result.error === "TEMPLATE_IN_USE" ? 409 : 400;
        return res.status(s).json(result);
      }
      res.locals.audit = { action: "timesheet_template.delete", entity_type: "timesheet_template", entity_id: req.params.id };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* ── Template einem Einsatz / einer Org zuweisen ──────────────────────── */

  router.post("/timesheet-templates/:id/assign", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const parsed = assignSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const result = await templateSvc.assignTemplate(pool, {
        templateId:   req.params.id,
        supplierOrgId,
        assignmentId: parsed.data.assignment_id || null,
        orgId:        parsed.data.org_id        || null,
        createdBy:    req.session.userId
      });
      if (result.error) {
        const s = result.error === "TEMPLATE_NOT_FOUND" ? 404 : 409;
        return res.status(s).json(result);
      }
      res.locals.audit = { action: "timesheet_template.assign", entity_type: "timesheet_template_assignment", entity_id: result.assignment.id, details: { template_id: req.params.id, assignment_id: parsed.data.assignment_id || null } };
      res.status(201).json(result.assignment);
    } catch (err) { next(err); }
  });

  /* ── Einsatz-Zuweisung entfernen ──────────────────────────────────────── */

  router.delete("/timesheet-templates/assignment/:assignmentId", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const result = await templateSvc.removeAssignment(pool, req.params.assignmentId, supplierOrgId);
      if (result.error) return res.status(result.error === "NOT_FOUND" ? 404 : 400).json(result);
      res.locals.audit = { action: "timesheet_template.remove_assignment", entity_type: "timesheet_template_assignment", entity_id: req.params.assignmentId };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
}
