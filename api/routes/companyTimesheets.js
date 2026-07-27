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
import { requirePermission } from "../middleware/rbac.js";
import { requireScope } from "../middleware/apiKeyAuth.js";
import { swallow } from "../utils/logger.js";
import { recordActivity } from "../services/eventTrackingService.js";

export function createCompanyTimesheetsRouter(deps) {
  const { pool, logger, requireAuth, requireFeature } = deps;
  const router = Router();
  const companyOrg = requireCompanyOrg(deps, {
    errorCode: "COMPANY_TIMESHEETS_NOT_AVAILABLE_FOR_ORG_TYPE",
    errorMessage: "Der Stundenzettel-Eingang steht nur für Unternehmensorganisationen zur Verfügung."
  });
  const base = [requireAuth, requireFeature("worker_module"), companyOrg];

  /**
   * RBAC (zentrale Guards, keine Inline-Rollenchecks). Org-Mitgliedschaft allein reicht
   * hier NICHT: Stundenfreigabe ist eine Geldentscheidung und eine Sperre hat kommerzielle
   * Folgen für die Zeitarbeitsfirma. Wir nutzen bewusst die BESTEHENDEN Permissions
   * (rbacService), statt neue zu erfinden:
   *   timesheet.view/approve/reject → identisch zum Legacy-/timesheets-Pfad (keine zwei Wahrheiten)
   *   assignment.view  → lesende Käufer-Sichten (Live-Belegschaft, Sperrliste, eigene Meldungen)
   *   assignment.edit  → Sperren/Freigeben (greift in künftige Besetzung ein)
   * Beschwerde melden bleibt bewusst auf `assignment.view`: wer die Kraft im Einsatz sieht
   * (auch ein Schichtverantwortlicher mit `member`), muss ein Problem melden können — es ist
   * ein Hinweis, keine Zustandsänderung am Einsatz.
   */
  const rperm = (p) => requirePermission(p, { pool, logger });

  /**
   * Org-Boundary-Guard: die Submission muss zur eigenen Käufer-Org gehören (org_id),
   * sonst Cross-Org-IDOR. Spiegelt requireOwnSubmission der Agentur-Seite, aber
   * käuferseitig (org_id statt supplier_org_id).
   *
   * Zusätzlich Freigabe-Grenze: auch die eigene Org darf einen Zettel erst ab
   * `sent_to_customer` sehen — der interne Prüfstand der Agentur (draft/submitted/
   * approved_internal) bleibt dem Kunden verborgen (404, kein 403: die Existenz eines
   * noch nicht freigegebenen Zettels ist selbst schon eine Information).
   */
  async function requireCompanySubmission(req, res, next) {
    try {
      const companyOrgId = req.orgId;
      if (!companyOrgId) return res.status(400).json({ error: "NO_ORG_CONTEXT" });
      const sub = await submissionSvc.getSubmission(pool, req.params.id);
      if (!sub) return res.status(404).json({ error: "NOT_FOUND" });
      if (sub.org_id !== companyOrgId) return res.status(403).json({ error: "FORBIDDEN" });
      if (!submissionSvc.COMPANY_VISIBLE_STATUSES.includes(sub.status)) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }
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
  router.get("/company/live-workforce", ...base, requireScope("read:workers"), rperm("assignment.view"), async (req, res, next) => {
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

  router.get("/company/blocklist", ...base, requireScope("read:workers"), rperm("assignment.view"), async (req, res, next) => {
    try {
      const items = await blocklistSvc.listCompanyBlocklist(pool, req.orgId, {
        includeExpired: req.query.include_expired === "1"
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  router.post("/company/blocklist", ...base, requireScope("write:workers"), rperm("assignment.edit"), async (req, res, next) => {
    try {
      const workerUserId = String(req.body?.worker_user_id || "").trim();
      if (!uuidRx.test(workerUserId)) return res.status(400).json({ error: "INVALID_WORKER" });
      const blockedUntil = req.body?.blocked_until ? String(req.body.blocked_until).trim() : null;
      if (blockedUntil && !dateRx.test(blockedUntil)) return res.status(400).json({ error: "INVALID_DATE" });
      const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 500) : null;
      // supplier_org_id kommt bewusst NICHT aus dem Body — der Service leitet die
      // Herkunfts-Agentur aus dem echten Einsatz ab (keine Fremdzuordnung durch den Client).
      const result = await blocklistSvc.blockWorkerForCompany(pool, {
        companyOrgId: req.orgId, workerUserId, reason, blockedUntil, createdBy: req.session.userId
      });
      if (result.error) return res.status(400).json(result);
      res.locals.audit = {
        action: "company.worker_blocklist.block", entity_type: "worker", entity_id: workerUserId,
        details: { blocked_until: blockedUntil, reason, responsible_actor_user_id: req.session.userId }
      };
      recordActivity(pool, {
        event_type: "worker_blocked", actor_id: req.session.userId, org_id: req.orgId,
        entity_type: "worker", entity_id: workerUserId, metadata: { blocked_until: blockedUntil }
      });
      res.status(201).json(result.block);
    } catch (err) { next(err); }
  });

  router.delete("/company/blocklist/:workerUserId([0-9a-fA-F-]{36})", ...base, requireScope("write:workers"), rperm("assignment.edit"), async (req, res, next) => {
    try {
      const ok = await blocklistSvc.unblockWorkerForCompany(pool, req.orgId, req.params.workerUserId);
      if (!ok) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = {
        action: "company.worker_blocklist.unblock", entity_type: "worker", entity_id: req.params.workerUserId,
        details: { responsible_actor_user_id: req.session.userId }
      };
      recordActivity(pool, {
        event_type: "worker_unblocked", actor_id: req.session.userId, org_id: req.orgId,
        entity_type: "worker", entity_id: req.params.workerUserId
      });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  /* ── Beschwerde-Meldung (P3.2): Problem mit einer Kraft → Agentur benachrichtigen ── */
  router.get("/company/complaints", ...base, requireScope("read:workers"), rperm("assignment.view"), async (req, res, next) => {
    try {
      const items = await complaintSvc.listCompanyComplaints(pool, req.orgId, { status: req.query.status || null });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  router.post("/company/complaints", ...base, requireScope("write:workers"), rperm("assignment.view"), async (req, res, next) => {
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
      recordActivity(pool, {
        event_type: "complaint_filed", actor_id: req.session.userId, org_id: req.orgId,
        target_org_id: result.supplierOrgId || null,
        entity_type: "worker_complaint", entity_id: result.complaint.id,
        metadata: { severity, worker_user_id: workerUserId }
      });
      res.status(201).json({ complaint: result.complaint, notified_dispatcher: !!result.dispatcherUserId });
    } catch (err) { next(err); }
  });

  /* ── Empfangene Stundenzettel der eigenen Org auflisten ────────────────────── */
  router.get("/company/submissions", ...base, requireScope("read:timesheets"), rperm("timesheet.view"), async (req, res, next) => {
    try {
      const items = await submissionSvc.listCompanySubmissions(pool, req.orgId, {
        status: req.query.status || null,
        limit: parseInt(req.query.limit, 10) || 100
      });
      res.json({ items, total: items.length });
    } catch (err) { next(err); }
  });

  /* ── Detail (inkl. Tageseinträge) ──────────────────────────────────────────── */
  router.get("/company/submissions/:id([0-9a-fA-F-]{36})", ...base, requireScope("read:timesheets"), rperm("timesheet.view"), requireCompanySubmission, async (req, res, next) => {
    try {
      const detail = await submissionSvc.getSubmissionWithEntries(pool, req.params.id);
      if (!detail) return res.status(404).json({ error: "NOT_FOUND" });
      res.json(detail);
    } catch (err) { next(err); }
  });

  /* ── Käufer bestätigt: sent_to_customer → customer_confirmed ───────────────── */
  router.post("/company/submissions/:id([0-9a-fA-F-]{36})/confirm", ...base, requireScope("write:timesheets"), rperm("timesheet.approve"), requireCompanySubmission, async (req, res, next) => {
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
      recordActivity(pool, {
        event_type: "timesheet_customer_confirmed", actor_id: req.session.userId, org_id: req.orgId,
        entity_type: "worker_submission", entity_id: req.params.id
      });
      res.json(result);
    } catch (err) { next(err); }
  });

  /* ── Käufer lehnt ab: sent_to_customer → customer_rejected (Grund Pflicht) ───── */
  router.post("/company/submissions/:id([0-9a-fA-F-]{36})/reject", ...base, requireScope("write:timesheets"), rperm("timesheet.reject"), requireCompanySubmission, async (req, res, next) => {
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
      recordActivity(pool, {
        event_type: "timesheet_customer_rejected", actor_id: req.session.userId, org_id: req.orgId,
        entity_type: "worker_submission", entity_id: req.params.id
      });
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}
