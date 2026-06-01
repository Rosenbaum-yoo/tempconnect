/**
 * Agency Portal Router — Einreichungen & Kundenflow
 * Für Dispatcher / Agentur-Admins (NICHT worker-role).
 * Scoped auf req.orgId (supplier_org_id) via orgContextMiddleware.
 */
import { Router } from "express";
import * as submissionSvc from "../services/workerSubmissionService.js";
import { requirePermission } from "../middleware/rbac.js";

/* ── Agency-only Auth-Middleware ─────────────────────────────────────────── */

function requireAgencyRole(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  if (req.session.userRole === "worker") {
    return res.status(403).json({ error: "AGENCY_ROLE_REQUIRED" });
  }
  next();
}

/* ── Hilfsfunktion: Status-Fehlerstatus mappen ───────────────────────────── */

function transitionStatus(result) {
  if (!result.error) return null;
  if (result.error === "NOT_FOUND")          return 404;
  if (result.error === "INVALID_TRANSITION") return 409;
  if (result.error === "FORBIDDEN")          return 403;
  return 400;
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/* ── Router ──────────────────────────────────────────────────────────────── */

export function createAgencyPortalRouter(deps) {
  const { pool, logger, requireAuth, requireFeature } = deps;
  const router = Router();
  const rperm = (permission) => requirePermission(permission, { pool, logger });
  const base = [requireAuth, requireFeature("worker_module"), requireAgencyRole, rperm("worker.review")];

  /* ── KPIs (Dashboard-Widget) ──────────────────────────────────────────── */

  router.get("/agency/submissions/kpis", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const kpis = await submissionSvc.getSupplierSubmissionKPIs(pool, supplierOrgId);
      res.json(kpis);
    } catch (err) { next(err); }
  });

  /* ── Alle Einreichungen der Agentur auflisten (mit Filtern) ───────────── */

  router.get("/agency/submissions", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });

      const items = await submissionSvc.listAgencySubmissions(pool, {
        supplierOrgId,
        orgId:         req.query.org_id         || null,
        assignmentId:  req.query.assignment_id  || null,
        workerSearch:  req.query.worker         || null,
        status:        req.query.status         || null,
        weekFrom:      req.query.week_from      || null,
        weekTo:        req.query.week_to        || null,
        limit:         Math.min(parseInt(req.query.limit,  10) || 100, 500),
        offset:        parseInt(req.query.offset, 10) || 0
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  /* ── Einzelne Einreichung mit Einträgen + Events ──────────────────────── */

  router.get("/agency/submissions/:id([0-9a-fA-F-]{36})", ...base, async (req, res, next) => {
    try {
      const sub = await submissionSvc.getSubmissionWithEntries(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      // Org-Boundary: Nur eigene Agentur
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (supplierOrgId && sub.supplier_org_id !== supplierOrgId) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      res.json(sub);
    } catch (err) { next(err); }
  });

  /* ── Prüfung starten: submitted → under_review ──────────────────────── */

  router.post("/agency/submissions/:id([0-9a-fA-F-]{36})/start-review", ...base, async (req, res, next) => {
    try {
      const result = await submissionSvc.startReview(
        pool, req.params.id, req.session.userId
      );
      const s = transitionStatus(result);
      if (s) return res.status(s).json(result);
      res.locals.audit = { action: "agency_submission.start_review", entity_type: "worker_submission", entity_id: req.params.id };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Intern genehmigen: under_review → approved_internal ───────────────── */

  router.post("/agency/submissions/:id([0-9a-fA-F-]{36})/approve", ...base, async (req, res, next) => {
    try {
      const result = await submissionSvc.approveInternal(
        pool, req.params.id, req.session.userId,
        req.body?.note || null
      );
      const s = transitionStatus(result);
      if (s) return res.status(s).json(result);
      res.locals.audit = { action: "agency_submission.approve_internal", entity_type: "worker_submission", entity_id: req.params.id };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── An Kunden senden: approved_internal → sent_to_customer ──────────── */

  router.post("/agency/submissions/:id([0-9a-fA-F-]{36})/send-to-customer", ...base, async (req, res, next) => {
    try {
      const result = await submissionSvc.sendToCustomer(
        pool, req.params.id, req.session.userId, {
          customerContactName:  req.body?.customer_contact_name  || null,
          customerContactEmail: req.body?.customer_contact_email || null,
          note:                 req.body?.note                   || null
        }
      );
      const s = transitionStatus(result);
      if (s) return res.status(s).json(result);
      res.locals.audit = { action: "agency_submission.send_to_customer", entity_type: "worker_submission", entity_id: req.params.id, details: { customer_contact_email: req.body?.customer_contact_email || null } };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Kundenbestätigung erfassen: sent_to_customer → customer_confirmed ── */

  router.post("/agency/submissions/:id([0-9a-fA-F-]{36})/customer-confirm", ...base, async (req, res, next) => {
    try {
      const result = await submissionSvc.confirmByCustomer(
        pool, req.params.id, req.session.userId, {
          customerConfirmedBy: req.body?.customer_confirmed_by || null,
          note:                req.body?.note                  || null
        }
      );
      const s = transitionStatus(result);
      if (s) return res.status(s).json(result);
      res.locals.audit = { action: "agency_submission.customer_confirm", entity_type: "worker_submission", entity_id: req.params.id };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Kundenablehnung erfassen: sent_to_customer → customer_rejected ───── */

  router.post("/agency/submissions/:id([0-9a-fA-F-]{36})/customer-reject", ...base, async (req, res, next) => {
    try {
      const result = await submissionSvc.rejectByCustomer(
        pool, req.params.id, req.session.userId, {
          reason: req.body?.reason || req.body?.note || null
        }
      );
      const s = transitionStatus(result);
      if (s) return res.status(s).json(result);
      res.locals.audit = { action: "agency_submission.customer_reject", entity_type: "worker_submission", entity_id: req.params.id, details: { reason: req.body?.reason || null } };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── In Abrechnung buchen: confirmed/approved → posted_to_timesheet ───── */

  router.post("/agency/submissions/:id([0-9a-fA-F-]{36})/post-to-timesheet", ...base, async (req, res, next) => {
    try {
      const result = await submissionSvc.postToTimesheet(
        pool, req.params.id, req.session.userId,
        req.body?.note || null
      );
      const s = transitionStatus(result);
      if (s) return res.status(s).json(result);
      res.locals.audit = { action: "agency_submission.post_to_timesheet", entity_type: "worker_submission", entity_id: req.params.id };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Korrektur anfordern (under_review → needs_correction) ───────────── */

  router.post("/agency/submissions/:id([0-9a-fA-F-]{36})/request-correction", ...base, async (req, res, next) => {
    try {
      const note = String(req.body?.note || "").trim();
      if (!note) return res.status(400).json({ error: "NOTE_REQUIRED" });
      const result = await submissionSvc.requestCorrection(
        pool, req.params.id, req.session.userId, note
      );
      const s = transitionStatus(result);
      if (s) return res.status(s).json(result);
      res.locals.audit = { action: "agency_submission.request_correction", entity_type: "worker_submission", entity_id: req.params.id, details: { note } };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Ablehnen (submitted/under_review → rejected) ────────────────────── */

  router.post("/agency/submissions/:id([0-9a-fA-F-]{36})/reject", ...base, async (req, res, next) => {
    try {
      const reason = String(req.body?.reason || req.body?.note || "").trim();
      const result = await submissionSvc.rejectSubmission(
        pool, req.params.id, req.session.userId, reason
      );
      const s = transitionStatus(result);
      if (s) return res.status(s).json(result);
      res.locals.audit = { action: "agency_submission.reject", entity_type: "worker_submission", entity_id: req.params.id, details: { reason } };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Sammelprozess: Vorschau pro Kunde/Periode ─────────────────────────── */
  router.get("/agency/submissions/bundles/preview", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const items = await submissionSvc.previewCustomerBundles(pool, {
        supplierOrgId,
        orgId: req.query.org_id || null,
        periodMode: req.query.period_mode || "week",
        weekFrom: req.query.week_from || null,
        weekTo: req.query.week_to || null
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  /* ── Sammelprozess: Sammelversand auslösen ──────────────────────────────── */
  router.post("/agency/submissions/bundles/send", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });

      const result = await submissionSvc.sendBundleToCustomer(pool, {
        supplierOrgId,
        actorId: req.session.userId,
        orgId: req.body?.org_id || null,
        periodMode: req.body?.period_mode || "week",
        periodKey: req.body?.period_key || null,
        submissionIds: Array.isArray(req.body?.submission_ids) ? req.body.submission_ids : [],
        customerContactName: req.body?.customer_contact_name || null,
        customerContactEmail: req.body?.customer_contact_email || null,
        bundleRef: req.body?.bundle_ref || null,
        note: req.body?.note || null
      });
      if (result.error === "BUNDLE_SCOPE_REQUIRED") return res.status(400).json(result);
      if (["NO_ELIGIBLE_SUBMISSIONS", "BUNDLE_SELECTION_INVALID", "BUNDLE_SCOPE_MISMATCH"].includes(result.error)) {
        return res.status(409).json(result);
      }
      res.locals.audit = {
        action: "agency_submission.bundle_send",
        entity_type: "worker_submission_bundle",
        entity_id: result.bundle_key || null,
        details: { bundle_ref: result.bundle_ref || null, submission_count: result.submission_count || 0 }
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Sammelprozess: Bundle-Liste/Detail ─────────────────────────────────── */
  router.get("/agency/submissions/bundles", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const items = await submissionSvc.listSentBundles(pool, {
        supplierOrgId,
        orgId: req.query.org_id || null
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  router.get("/agency/submissions/bundles/:bundleKey", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const items = await submissionSvc.getBundleDetails(pool, {
        supplierOrgId,
        bundleKey: req.params.bundleKey
      });
      if (!items.length) return res.status(404).json({ error: "NOT_FOUND" });
      res.json({ bundle_key: req.params.bundleKey, items, total: items.length });
    } catch (err) { next(err); }
  });

  router.get("/agency/submissions/bundles/:bundleKey/export.csv", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const items = await submissionSvc.getBundleDetails(pool, {
        supplierOrgId,
        bundleKey: req.params.bundleKey
      });
      if (!items.length) return res.status(404).json({ error: "NOT_FOUND" });
      const header = [
        "submission_id", "client_name", "worker_name", "worker_email", "week_start", "week_end",
        "total_hours", "overtime_hours", "status", "timesheet_id", "bundle_key", "bundle_ref"
      ];
      const lines = [header.join(",")];
      for (const it of items) {
        const workerName = `${it.first_name || ""} ${it.last_name || ""}`.trim();
        lines.push([
          it.id,
          it.client_name,
          workerName,
          it.worker_email,
          it.week_start,
          it.week_end,
          it.total_hours,
          it.overtime_hours,
          it.status,
          it.timesheet_id,
          it.customer_bundle_key,
          it.customer_bundle_ref
        ].map(csvEscape).join(","));
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="submission-bundle-${req.params.bundleKey}.csv"`);
      res.send(lines.join("\n"));
    } catch (err) { next(err); }
  });

  /* ── Sammelprozess: bestätigte Bundle-Items in Timesheets buchen ────────── */
  router.post("/agency/submissions/bundles/:bundleKey/post-to-timesheet", ...base, async (req, res, next) => {
    try {
      const supplierOrgId = req.orgId || req.session.supplierOrgId;
      if (!supplierOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const result = await submissionSvc.postBundleToTimesheets(pool, {
        supplierOrgId,
        bundleKey: req.params.bundleKey,
        actorId: req.session.userId
      });
      if (result.error === "NOT_FOUND") return res.status(404).json(result);
      if (result.error === "NO_ELIGIBLE_SUBMISSIONS") return res.status(409).json(result);
      res.locals.audit = {
        action: "agency_submission.bundle_post_to_timesheet",
        entity_type: "worker_submission_bundle",
        entity_id: req.params.bundleKey,
        details: { processed: result.processed || 0 }
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}
