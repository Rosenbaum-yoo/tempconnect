/**
 * Timesheets REST-Router: Stundenzettel erfassen, einreichen, freigeben.
 * Feature-gated: nur PRO / ENTERPRISE. Org-Boundary + RBAC + Audit.
 */
import { z } from "zod";
import { Router } from "express";
import { swallow } from "../utils/logger.js";
import * as timesheetService from "../services/timesheetService.js";
import * as integrationService from "../services/integrationService.js";
import * as erpMappingService from "../services/erpMappingService.js";
import { buildLohnBewegungsdaten } from "../services/datevExportService.js";
import { trackProductEventFromRequest } from "../services/productAnalyticsService.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireScope } from "../middleware/apiKeyAuth.js";
import { hasFeature } from "../config/planFeatures.js";

/* ── Validierungsschemas ─────────────────────────────────────────────────────── */

const dateRx = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  org_id:             z.string().uuid(),
  supplier_org_id:    z.string().uuid(),
  assignment_id:      z.string().uuid().optional().nullable(),
  worker_name:        z.string().min(1).max(200),
  worker_identifier:  z.string().max(100).optional().nullable(),
  week_start:         z.string().regex(dateRx),
  week_end:           z.string().regex(dateRx),
  notes:              z.string().max(4000).optional().nullable()
});

const updateSchema = createSchema.partial().omit({ org_id: true, supplier_org_id: true });

const entrySchema = z.object({
  work_date:      z.string().regex(dateRx),
  hours_regular:  z.number().min(0).max(24).default(0),
  hours_overtime: z.number().min(0).max(24).default(0),
  break_minutes:  z.number().int().min(0).default(0),
  shift_start:    z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  shift_end:      z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  notes:          z.string().max(2000).optional().nullable()
});

const rejectSchema = z.object({
  reason: z.string().max(2000).optional().nullable()
});

const prefillSchema = z.object({
  assignment_id:    z.string().uuid(),
  week_start:       z.string().regex(dateRx),
  week_end:         z.string().regex(dateRx),
  worker_user_id:   z.string().uuid().optional().nullable()
});

const batchIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
});

const batchRejectSchema = z.object({
  ids:    z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().max(2000).optional().nullable()
});

/* ── Hilfsfunktion: Org-Boundary pruefen ─────────────────────────────────────── */

function checkOrgBoundary(ts, orgId) {
  if (!orgId) return true; // Legacy-User ohne Org
  return ts.org_id === orgId || ts.supplier_org_id === orgId;
}

/* ── Feature-Gate Middleware ─────────────────────────────────────────────────── */

function requireTimesheetFeature(getUserAndPlan) {
  return async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
    try {
      const up = await getUserAndPlan(req.session.userId);
      const plan = up?.plan || "DEMO"; // DEMO ist kanonischer Default (planFeatures.js PLAN.DEMO)
      if (!hasFeature(plan, "timesheets")) {
        return res.status(403).json({
          error: "FEATURE_NOT_AVAILABLE",
          feature: "timesheets",
          required_plans: ["PLUS", "PRO", "ENTERPRISE"],
          current_plan: plan
        });
      }
      req.userPlan = plan;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/* ── Router ──────────────────────────────────────────────────────────────────── */

export function createTimesheetsRouter(deps) {
  const { pool, requireAuth, logger, getUserAndPlan } = deps;
  const router = Router();
  const rperm = (p) => requirePermission(p, { pool, logger });
  const featureGate = requireTimesheetFeature(getUserAndPlan);

  // Alle Timesheet-Routes benoetigen Auth + Feature-Gate
  const base = [requireAuth, featureGate];

  /* GET /timesheets – Liste (mit Filtern) */
  router.get("/timesheets", ...base, requireScope("read:timesheets"), rperm("timesheet.view"), async (req, res, next) => {
    try {
      const items = await timesheetService.listTimesheets(pool, {
        org_id:          req.orgId || null,  // SEC-002: server-resolved only, ignore client input
        supplier_org_id: req.query.supplier_org_id || null,
        assignment_id:   req.query.assignment_id   || null,
        status:          req.query.status          || null,
        worker_name:     req.query.worker_name     || null,
        week_start_from: req.query.week_start_from || null,
        week_start_to:   req.query.week_start_to   || null,
        limit:           parseInt(req.query.limit, 10) || 100
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  /* POST /timesheets – Neuen Stundenzettel anlegen */
  router.post("/timesheets", ...base, requireScope("write:timesheets"), rperm("timesheet.create"), async (req, res, next) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      // Org-Boundary: User muss zur org_id oder supplier_org_id gehoeren
      if (req.orgId && parsed.data.org_id !== req.orgId && parsed.data.supplier_org_id !== req.orgId) {
        return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      }

      const result = await timesheetService.createTimesheet(pool, {
        ...parsed.data,
        created_by: req.session.userId
      });
      if (result.error) {
        const status = result.error === 'ORG_BOUNDARY_VIOLATION' ? 403
                     : result.error === 'ASSIGNMENT_NOT_FOUND'   ? 404
                     : 400;
        return res.status(status).json({ error: result.error, message: result.message });
      }
      res.locals.audit = {
        action: "timesheet.create", entity_type: "timesheet", entity_id: result.timesheet.id,
        details: { org_id: result.timesheet.org_id, worker_name: result.timesheet.worker_name }
      };
      try {
        await trackProductEventFromRequest(pool, req, "assignment_created", {
          flow_key: "worker_to_timesheet",
          metadata: { assignment_id: result.timesheet.assignment_id || null, timesheet_id: result.timesheet.id }
        });
      } catch { /* analytics non-critical */ }
      res.status(201).json(result.timesheet);
    } catch (err) { next(err); }
  });

  /* GET /timesheets/:id – Einzelner Stundenzettel mit Eintraegen */
  router.get("/timesheets/:id", ...base, requireScope("read:timesheets"), rperm("timesheet.view"), async (req, res, next) => {
    try {
      const ts = await timesheetService.getTimesheetWithEntries(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      if (!checkOrgBoundary(ts, req.orgId)) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
      res.json(ts);
    } catch (err) { next(err); }
  });

  /* PATCH /timesheets/:id – Stundenzettel bearbeiten (nur draft) */
  router.patch("/timesheets/:id", ...base, requireScope("write:timesheets"), rperm("timesheet.edit"), async (req, res, next) => {
    try {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const ts = await timesheetService.getTimesheet(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      if (!checkOrgBoundary(ts, req.orgId)) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const result = await timesheetService.updateTimesheet(pool, req.params.id, parsed.data, req.session.userId);
      if (result.error) return res.status(result.error === 'NOT_FOUND' ? 404 : 409).json({ error: result.error, status: result.status });

      res.locals.audit = {
        action: "timesheet.update", entity_type: "timesheet", entity_id: req.params.id,
        details: { changed_fields: Object.keys(parsed.data) }
      };
      res.json(result.timesheet);
    } catch (err) { next(err); }
  });

  /* POST /timesheets/:id/entries – Tageseintrag hinzufuegen / ueberschreiben */
  router.post("/timesheets/:id/entries", ...base, requireScope("write:timesheets"), rperm("timesheet.edit"), async (req, res, next) => {
    try {
      const parsed = entrySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const ts = await timesheetService.getTimesheet(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      if (!checkOrgBoundary(ts, req.orgId)) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const result = await timesheetService.addEntry(pool, req.params.id, parsed.data, req.session.userId);
      if (result.error) return res.status(result.error === 'NOT_FOUND' ? 404 : 409).json({ error: result.error, message: result.message });
      res.locals.audit = { action: "timesheet.add_entry", entity_type: "timesheet_entry", entity_id: result.entry.id, details: { timesheet_id: req.params.id, work_date: parsed.data.work_date } };
      res.status(201).json(result.entry);
    } catch (err) { next(err); }
  });

  /* PATCH /timesheets/:id/entries/:entryId – Tageseintrag aktualisieren */
  router.patch("/timesheets/:id/entries/:entryId", ...base, requireScope("write:timesheets"), rperm("timesheet.edit"), async (req, res, next) => {
    try {
      const parsed = entrySchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const ts = await timesheetService.getTimesheet(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      if (!checkOrgBoundary(ts, req.orgId)) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const result = await timesheetService.updateEntry(pool, req.params.id, req.params.entryId, parsed.data, req.session.userId);
      if (result.error) return res.status(result.error === 'NOT_FOUND' || result.error === 'ENTRY_NOT_FOUND' ? 404 : 409).json({ error: result.error });
      res.locals.audit = { action: "timesheet.update_entry", entity_type: "timesheet_entry", entity_id: req.params.entryId, details: { timesheet_id: req.params.id, changed_fields: Object.keys(parsed.data) } };
      res.json(result.entry);
    } catch (err) { next(err); }
  });

  /* DELETE /timesheets/:id/entries/:entryId – Tageseintrag loeschen */
  router.delete("/timesheets/:id/entries/:entryId", ...base, requireScope("write:timesheets"), rperm("timesheet.edit"), async (req, res, next) => {
    try {
      const ts = await timesheetService.getTimesheet(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      if (!checkOrgBoundary(ts, req.orgId)) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const result = await timesheetService.deleteEntry(pool, req.params.id, req.params.entryId, req.session.userId);
      if (result.error) return res.status(result.error === 'ENTRY_NOT_FOUND' ? 404 : 409).json({ error: result.error });
      res.locals.audit = { action: "timesheet.delete_entry", entity_type: "timesheet_entry", entity_id: req.params.entryId, details: { timesheet_id: req.params.id } };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* POST /timesheets/:id/submit – Einreichen */
  router.post("/timesheets/:id/submit", ...base, requireScope("write:timesheets"), rperm("timesheet.submit"), async (req, res, next) => {
    try {
      const ts = await timesheetService.getTimesheet(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      if (!checkOrgBoundary(ts, req.orgId)) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const result = await timesheetService.submitTimesheet(pool, req.params.id, req.session.userId);
      if (result.error) return res.status(result.error === 'NOT_FOUND' ? 404 : 409).json({ error: result.error, message: result.message });

      res.locals.audit = {
        action: "timesheet.submit", entity_type: "timesheet", entity_id: req.params.id,
        details: { total_hours: result.timesheet.total_hours, worker_name: result.timesheet.worker_name }
      };
      try {
        await trackProductEventFromRequest(pool, req, "timesheet_submitted", {
          flow_key: "worker_to_timesheet",
          metadata: { timesheet_id: req.params.id, total_hours: result.timesheet.total_hours || null }
        });
      } catch { /* analytics non-critical */ }
      res.json(result.timesheet);
    } catch (err) { next(err); }
  });

  /* POST /timesheets/:id/approve – Freigeben (Company/Kunde) */
  router.post("/timesheets/:id/approve", ...base, requireScope("write:timesheets"), rperm("timesheet.approve"), async (req, res, next) => {
    try {
      const ts = await timesheetService.getTimesheet(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      // Nur Kundenorg (org_id) darf freigeben
      if (req.orgId && ts.org_id !== req.orgId) {
        return res.status(403).json({ error: "ONLY_BUYER_CAN_APPROVE" });
      }

      const result = await timesheetService.approveTimesheet(pool, req.params.id, req.session.userId);
      if (result.error) return res.status(result.error === 'NOT_FOUND' ? 404 : 409).json({ error: result.error });

      res.locals.audit = {
        action: "timesheet.approve", entity_type: "timesheet", entity_id: req.params.id,
        details: { total_hours: result.timesheet.total_hours, worker_name: result.timesheet.worker_name }
      };
      try {
        await trackProductEventFromRequest(pool, req, "timesheet_approved", {
          flow_key: "worker_to_timesheet",
          metadata: { timesheet_id: req.params.id, total_hours: result.timesheet.total_hours || null }
        });
      } catch { /* analytics non-critical */ }
      res.json(result.timesheet);
    } catch (err) { next(err); }
  });

  /* POST /timesheets/:id/reject – Ablehnen */
  router.post("/timesheets/:id/reject", ...base, requireScope("write:timesheets"), rperm("timesheet.reject"), async (req, res, next) => {
    try {
      const parsed = rejectSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const ts = await timesheetService.getTimesheet(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      if (req.orgId && ts.org_id !== req.orgId) {
        return res.status(403).json({ error: "ONLY_BUYER_CAN_REJECT" });
      }

      const result = await timesheetService.rejectTimesheet(pool, req.params.id, req.session.userId, parsed.data.reason);
      if (result.error) return res.status(result.error === 'NOT_FOUND' ? 404 : 409).json({ error: result.error });

      res.locals.audit = {
        action: "timesheet.reject", entity_type: "timesheet", entity_id: req.params.id,
        details: { rejection_reason: parsed.data.reason, worker_name: ts.worker_name }
      };
      res.json(result.timesheet);
    } catch (err) { next(err); }
  });

  /* POST /timesheets/:id/cancel – Stornieren */
  router.post("/timesheets/:id/cancel", ...base, requireScope("write:timesheets"), rperm("timesheet.submit"), async (req, res, next) => {
    try {
      const ts = await timesheetService.getTimesheet(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      if (!checkOrgBoundary(ts, req.orgId)) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const result = await timesheetService.cancelTimesheet(pool, req.params.id, req.session.userId);
      if (result.error) return res.status(result.error === 'NOT_FOUND' ? 404 : 409).json({ error: result.error });

      res.locals.audit = {
        action: "timesheet.cancel", entity_type: "timesheet", entity_id: req.params.id,
        details: { worker_name: ts.worker_name }
      };
      res.json(result.timesheet);
    } catch (err) { next(err); }
  });

  /* POST /timesheets/:id/return-to-draft – Zurueck zu Draft */
  router.post("/timesheets/:id/return-to-draft", ...base, requireScope("write:timesheets"), rperm("timesheet.edit"), async (req, res, next) => {
    try {
      const ts = await timesheetService.getTimesheet(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      if (!checkOrgBoundary(ts, req.orgId)) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const result = await timesheetService.returnToDraft(pool, req.params.id, req.session.userId);
      if (result.error) return res.status(result.error === 'NOT_FOUND' ? 404 : 409).json({ error: result.error });
      res.locals.audit = { action: "timesheet.return_to_draft", entity_type: "timesheet", entity_id: req.params.id };
      res.json(result.timesheet);
    } catch (err) { next(err); }
  });

  /* POST /timesheets/prefill – Vorbelegten Stundenzettel aus Assignment erstellen */
  router.post("/timesheets/prefill", ...base, requireScope("write:timesheets"), rperm("timesheet.create"), async (req, res, next) => {
    try {
      const parsed = prefillSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

      const result = await timesheetService.prefillFromAssignment(pool, {
        assignmentId:  parsed.data.assignment_id,
        supplierOrgId: req.orgId,
        weekStart:     parsed.data.week_start,
        weekEnd:       parsed.data.week_end,
        workerUserId:  parsed.data.worker_user_id || null,
        createdBy:     req.session.userId
      });
      if (result.error) {
        const status = result.error === 'ORG_BOUNDARY_VIOLATION' ? 403
                     : result.error === 'ASSIGNMENT_NOT_FOUND'   ? 404
                     : 400;
        return res.status(status).json({ error: result.error });
      }
      res.locals.audit = {
        action: "timesheet.prefill", entity_type: "timesheet", entity_id: result.timesheet.id,
        details: { assignment_id: parsed.data.assignment_id, entries_count: result.entries.length }
      };
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  /* POST /timesheets/:id/sign – Digitale Unterschrift (Worker) */
  router.post("/timesheets/:id/sign", ...base, requireScope("write:timesheets"), rperm("timesheet.submit"), async (req, res, next) => {
    try {
      const ts = await timesheetService.getTimesheet(pool, req.params.id);
      if (!ts) return res.status(404).json({ error: "NOT_FOUND" });
      if (!checkOrgBoundary(ts, req.orgId)) return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });

      const result = await timesheetService.signTimesheet(pool, req.params.id, req.session.userId, {
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
      });
      if (result.error) return res.status(result.error === 'NOT_FOUND' ? 404 : 409).json(result);
      res.locals.audit = { action: "timesheet.sign", entity_type: "timesheet", entity_id: req.params.id };
      res.json(result.timesheet);
    } catch (err) { next(err); }
  });

  /* POST /timesheets/batch-approve – Mehrere Timesheets genehmigen */
  router.post("/timesheets/batch-approve", ...base, requireScope("write:timesheets"), rperm("timesheet.approve"), async (req, res, next) => {
    try {
      const parsed = batchIdsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const result = await timesheetService.batchApprove(pool, parsed.data.ids, req.session.userId);
      if (result.error) return res.status(400).json(result);
      res.locals.audit = { action: "timesheet.batch_approve", entity_type: "timesheet", entity_id: null, details: { count: result.approved.length } };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* POST /timesheets/batch-reject – Mehrere Timesheets ablehnen */
  router.post("/timesheets/batch-reject", ...base, requireScope("write:timesheets"), rperm("timesheet.reject"), async (req, res, next) => {
    try {
      const parsed = batchRejectSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
      const result = await timesheetService.batchReject(pool, parsed.data.ids, req.session.userId, parsed.data.reason);
      if (result.error) return res.status(400).json(result);
      res.locals.audit = { action: "timesheet.batch_reject", entity_type: "timesheet", entity_id: null, details: { count: result.rejected.length, reason: parsed.data.reason } };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* GET /timesheets/status-meta – UI-Labels, Farben, Icons fuer alle Status */
  router.get("/timesheets/status-meta", (_req, res) => {
    res.json(timesheetService.getTimesheetStatusMeta());
  });

  /* GET /timesheets/worker-summary – KPIs fuer Worker-Dashboard */
  router.get("/timesheets/worker-summary", ...base, requireScope("read:timesheets"), rperm("timesheet.view"), async (req, res, next) => {
    try {
      const result = await timesheetService.getWorkerTimesheetSummary(pool, {
        workerName:    req.query.worker_name     || null,
        orgId:         req.orgId                 || null,
        supplierOrgId: req.query.supplier_org_id || null
      });
      if (result.error) return res.status(400).json(result);
      res.json(result);
    } catch (err) { next(err); }
  });

  /* GET /timesheets/export/csv – CSV-Export aller Timesheets (org-scoped) */
  router.get("/timesheets/export/csv", ...base, requireScope("read:timesheets"), rperm("timesheet.view"), async (req, res, next) => {
    try {
      const { exportTimesheetsCsv } = await import("../services/exportService.js");
      const items = await timesheetService.listTimesheets(pool, {
        org_id:          req.orgId || null,
        supplier_org_id: req.query.supplier_org_id || null,
        status:          req.query.status          || null,
        week_start_from: req.query.week_start_from || null,
        week_start_to:   req.query.week_start_to   || null,
        limit:           500
      });
      const csv = exportTimesheetsCsv(items);
      const filename = `timesheets-${new Date().toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
      // HR/Lohn-Outbound (Epic A.3b): signalisiert abonnierten Systemen (SAP/DATEV), dass
      // Stundenzettel-Daten exportiert wurden. Fire-and-forget (kein Block des CSV-Downloads).
      integrationService.dispatchToIntegrations(pool, "timesheet.exported", {
        orgId: req.orgId || null, entityType: "timesheet_export", entityId: null,
        message: `${items.length} Stundenzettel als CSV exportiert`, count: items.length
      }).catch(swallow("timesheet.integration.dispatch"));
    } catch (err) { next(err); }
  });

  /* GET /timesheets/export/datev-lohn – DATEV-Lohn-Bewegungsdaten (Stunden je Mitarbeiter/Monat).
     Nur FREIGEGEBENE Stundenzettel (status=approved); Lohnarten/Berater-Mandant aus dem DATEV-ERP-
     Mapping (sync_config.lohn), sonst Defaults. Ausgabe ISO-8859-1, mappbar in LODAS/Lohn+Gehalt. */
  router.get("/timesheets/export/datev-lohn", ...base, requireScope("read:timesheets"), rperm("timesheet.view"), async (req, res, next) => {
    try {
      const orgId = req.orgId || null;
      const items = await timesheetService.listTimesheets(pool, {
        org_id:          orgId,
        supplier_org_id: req.query.supplier_org_id || null,
        status:          req.query.status || "approved", // Default: nur freigegebene Stunden in die Lohnabrechnung
        week_start_from: req.query.week_start_from || null,
        week_start_to:   req.query.week_start_to   || null,
        limit:           1000
      });
      let cfg = {};
      if (orgId) {
        try {
          const mappings = await erpMappingService.listMappings(pool, orgId);
          const datev = mappings.find((m) => m.system_type === "datev" && m.status !== "disabled");
          if (datev && datev.sync_config && typeof datev.sync_config === "object" && datev.sync_config.lohn) cfg = datev.sync_config.lohn;
        } catch { /* Defaults greifen */ }
      }
      const { csv, rows, skipped } = buildLohnBewegungsdaten(items, cfg);
      const filename = `datev-lohn-bewegungsdaten-${new Date().toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=ISO-8859-1");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (skipped > 0) res.setHeader("X-Datev-Skipped", String(skipped)); // Zettel ohne Personalnummer/Periode
      res.send(Buffer.from(csv, "latin1")); // DATEV erwartet ISO-8859-1/CP1252
      integrationService.dispatchToIntegrations(pool, "timesheet.exported", {
        orgId, entityType: "datev_lohn_bewegungsdaten", entityId: null,
        message: `${rows} DATEV-Lohn-Bewegungszeile(n) exportiert`, count: rows
      }).catch(swallow("timesheet.integration.dispatch"));
    } catch (err) { next(err); }
  });

  /* GET /assignments/:id/timesheets – Alle Timesheets eines Assignments */
  router.get("/assignments/:id/timesheets", ...base, requireScope("read:timesheets"), rperm("timesheet.view"), async (req, res, next) => {
    try {
      const items = await timesheetService.listTimesheetsForAssignment(pool, req.params.id, {
        status: req.query.status || null
      });
      // Org-Boundary: Nur eigene Orgs
      const filtered = req.orgId
        ? items.filter(ts => ts.org_id === req.orgId || ts.supplier_org_id === req.orgId)
        : items;
      res.json({ items: filtered, total: filtered.length });
    } catch (err) { next(err); }
  });

  return router;
}
