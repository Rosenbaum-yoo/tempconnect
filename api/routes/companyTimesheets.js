/**
 * Company Timesheets Router — Käufer-Sicht (P2.2)
 * Für Unternehmens-/Käufer-Organisationen: empfangene Stundenzettel einsehen und
 * selbst bestätigen/ablehnen (statt dass die Agentur es stellvertretend erfasst).
 * Gescoped auf req.orgId = die eigene Einsatz-/Käufer-Org (worker_time_submissions.org_id).
 * Arbeitet auf dem ECHTEN System (worker_time_submissions), nicht dem Legacy-/timesheets-Modell.
 */
import { Router } from "express";
import * as submissionSvc from "../services/workerSubmissionService.js";
import * as workforceSvc from "../services/workforceService.js";
import * as blocklistSvc from "../services/companyBlocklistService.js";
import * as complaintSvc from "../services/companyComplaintService.js";
import * as workerNotifications from "../services/workerNotificationService.js";
import { requireCompanyOrg } from "../middleware/orgAccess.js";
import { swallow } from "../utils/logger.js";

export function createCompanyTimesheetsRouter(deps) {
  const { pool, logger, requireAuth, requireFeature } = deps;
  const router = Router();
  const companyOrg = requireCompanyOrg(deps, {
    errorCode: "COMPANY_TIMESHEETS_NOT_AVAILABLE_FOR_ORG_TYPE",
    errorMessage: "Der Stundenzettel-Eingang steht nur für Unternehmensorganisationen zur Verfügung."
  });
  const base = [requireAuth, requireFeature("worker_module"), companyOrg];

  /**
   * Org-Boundary-Guard: die Submission muss zur eigenen Käufer-Org gehören (org_id),
   * sonst Cross-Org-IDOR. Spiegelt requireOwnSubmission der Agentur-Seite, aber
   * käuferseitig (org_id statt supplier_org_id).
   */
  async function requireCompanySubmission(req, res, next) {
    try {
      const companyOrgId = req.orgId;
      if (!companyOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const sub = await submissionSvc.getSubmission(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.org_id !== companyOrgId) return res.status(403).json({ error: "FORBIDDEN" });
      req._companySubmission = sub;
      next();
    } catch (err) { next(err); }
  }

  function mapTransitionError(error) {
    if (error === "NOT_FOUND") return 404;
    if (error === "INVALID_TRANSITION") return 409;
    if (error === "FORBIDDEN") return 403;
    return 400;
  }

  /* ── Live-Belegschaft (P2.3/3.1): wer arbeitet gerade beim Unternehmen ───────── */
  router.get("/company/live-workforce", ...base, async (req, res, next) => {
    try {
      const board = await workforceSvc.getCompanyLiveWorkforce(pool, req.orgId, {
        search: (req.query.search || "").toString().trim() || null,
        limit: parseInt(req.query.limit, 10) || 300
      });
      res.json(board);
    } catch (err) { next(err); }
  });

  /* ── Sperrliste (P3.3): Kraft für dieses Unternehmen sperren / freigeben ─────── */
  const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const dateRx = /^\d{4}-\d{2}-\d{2}$/;

  router.get("/company/blocklist", ...base, async (req, res, next) => {
    try {
      const items = await blocklistSvc.listCompanyBlocklist(pool, req.orgId, {
        includeExpired: req.query.include_expired === "1"
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  router.post("/company/blocklist", ...base, async (req, res, next) => {
    try {
      const workerUserId = String(req.body?.worker_user_id || "").trim();
      if (!uuidRx.test(workerUserId)) return res.status(400).json({ error: "INVALID_WORKER" });
      const blockedUntil = req.body?.blocked_until ? String(req.body.blocked_until).trim() : null;
      if (blockedUntil && !dateRx.test(blockedUntil)) return res.status(400).json({ error: "INVALID_DATE" });
      const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 500) : null;
      const supplierOrgId = (req.body?.supplier_org_id && uuidRx.test(req.body.supplier_org_id)) ? req.body.supplier_org_id : null;
      const result = await blocklistSvc.blockWorkerForCompany(pool, {
        companyOrgId: req.orgId, workerUserId, supplierOrgId, reason, blockedUntil, createdBy: req.session.userId
      });
      if (result.error) return res.status(400).json(result);
      res.locals.audit = {
        action: "company.worker_blocklist.block", entity_type: "worker", entity_id: workerUserId,
        details: { blocked_until: blockedUntil, reason, responsible_actor_user_id: req.session.userId }
      };
      res.status(201).json(result.block);
    } catch (err) { next(err); }
  });

  router.delete("/company/blocklist/:workerUserId([0-9a-fA-F-]{36})", ...base, async (req, res, next) => {
    try {
      const ok = await blocklistSvc.unblockWorkerForCompany(pool, req.orgId, req.params.workerUserId);
      if (!ok) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = {
        action: "company.worker_blocklist.unblock", entity_type: "worker", entity_id: req.params.workerUserId,
        details: { responsible_actor_user_id: req.session.userId }
      };
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* ── Beschwerde-Meldung (P3.2): Problem mit einer Kraft → Agentur benachrichtigen ── */
  router.get("/company/complaints", ...base, async (req, res, next) => {
    try {
      const items = await complaintSvc.listCompanyComplaints(pool, req.orgId, { status: req.query.status || null });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  router.post("/company/complaints", ...base, async (req, res, next) => {
    try {
      const workerUserId = String(req.body?.worker_user_id || "").trim();
      if (!uuidRx.test(workerUserId)) return res.status(400).json({ error: "INVALID_WORKER" });
      const reason = String(req.body?.reason || "").trim();
      if (reason.length < 3) return res.status(400).json({ error: "REASON_REQUIRED" });
      const severity = ["low", "medium", "high"].includes(req.body?.severity) ? req.body.severity : "medium";
      const assignmentLinkId = (req.body?.assignment_link_id && uuidRx.test(req.body.assignment_link_id)) ? req.body.assignment_link_id : null;

      const result = await complaintSvc.fileComplaint(pool, {
        companyOrgId: req.orgId, workerUserId, assignmentLinkId, severity, reason, createdBy: req.session.userId
      });
      if (result.error) return res.status(400).json(result);

      // Disponent der Agentur benachrichtigen (fire-and-forget) → kann via P1.1 Ersatz stellen.
      workerNotifications
        .notifyComplaintToDispatcher(pool, result.dispatcherUserId, result.complaint.id, result.workerName, { severity, reason })
        .catch(swallow("company.complaint.notify"));

      res.locals.audit = {
        action: "company.worker_complaint.file", entity_type: "worker_complaint", entity_id: result.complaint.id,
        details: { worker_user_id: workerUserId, severity, responsible_actor_user_id: req.session.userId }
      };
      res.status(201).json({ complaint: result.complaint, notified_dispatcher: !!result.dispatcherUserId });
    } catch (err) { next(err); }
  });

  /* ── Empfangene Stundenzettel der eigenen Org auflisten ────────────────────── */
  router.get("/company/submissions", ...base, async (req, res, next) => {
    try {
      const items = await submissionSvc.listCompanySubmissions(pool, req.orgId, {
        status: req.query.status || null,
        limit: parseInt(req.query.limit, 10) || 100
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  /* ── Detail (inkl. Tageseinträge) ──────────────────────────────────────────── */
  router.get("/company/submissions/:id([0-9a-fA-F-]{36})", ...base, requireCompanySubmission, async (req, res, next) => {
    try {
      const detail = await submissionSvc.getSubmissionWithEntries(pool, req.params.id);
      if (!detail) return res.status(404).json({ error: "NOT_FOUND" });
      res.json(detail);
    } catch (err) { next(err); }
  });

  /* ── Käufer bestätigt: sent_to_customer → customer_confirmed ───────────────── */
  router.post("/company/submissions/:id([0-9a-fA-F-]{36})/confirm", ...base, requireCompanySubmission, async (req, res, next) => {
    try {
      const result = await submissionSvc.confirmByCustomer(pool, req.params.id, req.session.userId, {
        customerConfirmedBy: req.body?.confirmed_by || null,
        note: req.body?.note || null
      });
      if (result.error) return res.status(mapTransitionError(result.error)).json(result);
      res.locals.audit = {
        action: "company_submission.customer_confirm",
        entity_type: "worker_time_submission",
        entity_id: req.params.id,
        details: { responsible_actor_user_id: req.session.userId, confirmed_by: req.body?.confirmed_by || null }
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Käufer lehnt ab: sent_to_customer → customer_rejected (Grund Pflicht) ───── */
  router.post("/company/submissions/:id([0-9a-fA-F-]{36})/reject", ...base, requireCompanySubmission, async (req, res, next) => {
    try {
      const reason = String(req.body?.reason || req.body?.note || "").trim();
      if (reason.length < 3) return res.status(400).json({ error: "REASON_REQUIRED" });
      const result = await submissionSvc.rejectByCustomer(pool, req.params.id, req.session.userId, {
        customerConfirmedBy: req.body?.rejected_by || null,
        note: reason
      });
      if (result.error) return res.status(mapTransitionError(result.error)).json(result);
      res.locals.audit = {
        action: "company_submission.customer_reject",
        entity_type: "worker_time_submission",
        entity_id: req.params.id,
        details: { reason, responsible_actor_user_id: req.session.userId }
      };
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}
