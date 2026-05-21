/**
 * staffControlCenter.js - SCC API-Router.
 *
 * Mount: `/staff/api/*` (separat von `/api/v1`), hinter der SCC-Session
 * + `createStaffControlAccessMiddleware`.
 *
 * Kernbereich ist die Customer-Requests-Inbox. Alle mutierenden Aktionen
 * brauchen Step-up + Confirm + Reason.
 */

import { Router } from "express";
import * as staffControlService from "../services/staffControlService.js";
import * as hetzner from "../services/staffHetznerService.js";
import * as runbookService from "../services/staffRunbookService.js";
import * as customerRequests from "../services/staffCustomerRequestsService.js";
import * as subInbox from "../services/staffSubscriptionRequestsService.js";
import * as subDocs from "../services/subscriptionDocumentService.js";
import * as combinedInbox from "../services/staffCombinedInboxService.js";
import * as subLifecycle from "../services/subscriptionLifecycleService.js";
import { withTransaction } from "../utils/transaction.js";
import {
  notifyRequestStatusChanged,
  notifyActivationFailed
} from "../services/subscriptionNotificationService.js";

/**
 * Welle 8 Schritt 15: fire-and-forget Notification-Hook fuer SCC-Pfade.
 * Wirft niemals — Status-Transitions im Staff-Workflow bleiben atomar,
 * Mail-/Notification-Probleme landen im subscription_notification_log mit
 * mail_status='failed', nicht im 5xx-Antwort-Body.
 */
function dispatchSubscriptionHook(pool, change, deps) {
  Promise.resolve()
    .then(() => notifyRequestStatusChanged(pool, change, deps))
    .catch((err) => { try { (deps && deps.logger ? deps.logger : console).warn?.({ err: err && err.message }, "scc notify hook failed"); } catch { /* noop */ } });
}

function activationErrorStatus(code) {
  if (code === "REQUEST_NOT_FOUND") return 404;
  if (code === "NOT_ACCEPTED" || code === "INVALID_TRANSITION" || code === "NO_CHANGE") return 409;
  if (code === "ORG_NOT_FOUND" || code === "SUBSCRIPTION_NOT_FOUND") return 409;
  return 500;
}

function documentPayload(result) {
  if (!result?.row) return null;
  return {
    id: result.row.id,
    document_type: result.row.document_type,
    document_number: result.row.document_number,
    status: result.row.status,
    title: result.row.title || null,
    issued_at: result.row.issued_at || null,
    download_available: true,
    created: result.created === true,
    already_exists: result.already_exists === true
  };
}

function serviceError(code) {
  const err = new Error(code || "SERVICE_ERROR");
  err.code = code || "SERVICE_ERROR";
  return err;
}
import { REQUEST_TYPES as SUB_REQUEST_TYPES, STATUS as SUB_STATUS, listAllowedNextStatuses as subAllowedNext, canBypassStaffApproval as subCanBypass, applyApprovedChange } from "../services/subscriptionRequestService.js";
import { writeStaffAudit, listStaffAudit, auditContextFromReq } from "../services/staffAuditService.js";
import {
  createStaffControlAccessMiddleware,
  createStaffStepUpMiddleware,
  requireConfirmAndReason
} from "../middleware/staffControlAccess.js";

export function createStaffControlCenterRouter(deps) {
  const { pool, logger, sendMail } = deps;
  const router = Router();
  const notifyDeps = { sendMail, logger };
  const requireStaff = createStaffControlAccessMiddleware({ pool, logger });
  const requireStepUp = createStaffStepUpMiddleware({ maxAgeMs: 15 * 60 * 1000 });

  // ── Bootstrap ───────────────────────────────────────────────
  router.get("/bootstrap", requireStaff, async (req, res) => {
    const [platform, executive] = await Promise.all([
      staffControlService.loadPlatformSnapshot(pool),
      staffControlService.loadExecutiveSnapshot(pool)
    ]);
    res.json({
      success: true,
      data: {
        staff: {
          user_id: req.sccStaff.user_id,
          email: req.sccStaff.email,
          display_name: req.sccStaff.display_name,
          requires_step_up: req.sccStaff.requires_step_up,
          step_up_at: req.session?.staffStepUpAt || null,
          authorized_at: req.session?.sccAuthorizedAt || null
        },
        hetzner_mode: hetzner.HETZNER_MODE,
        executive_summary: executive,
        platform_summary: platform
      }
    });
  });

  // ── Step-up + Logout ────────────────────────────────────────
  router.post("/auth/step-up", requireStaff, async (req, res) => {
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ success: false, error: { code: "STEP_UP_NEEDS_CONFIRM" } });
    }
    req.session.staffStepUpAt = Date.now();
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "auth", action: "staff_control.auth.step_up",
      status: "ok", confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req), details: {}
    });
    res.json({ success: true, data: { step_up_at: req.session.staffStepUpAt } });
  });

  router.post("/auth/logout", requireStaff, async (req, res) => {
    const userId = req.sccActorId;
    req.session.destroy(() => {});
    res.clearCookie("tc.staff.sid", { path: "/staff" });
    try {
      await writeStaffAudit(pool, {
        actorId: userId, area: "auth", action: "staff_control.auth.logout", status: "ok",
        ...auditContextFromReq(req)
      });
    } catch { /* best effort */ }
    res.json({ success: true });
  });

  // ── Customer Requests — Kernarbeitsplatz ────────────────────
  router.get("/customer-requests", requireStaff, async (req, res) => {
    const items = await customerRequests.listRequests(pool, {
      status: req.query.status || null,
      assigneeStaffId: req.query.assignee || null,
      unassigned: req.query.unassigned === "true",
      limit: req.query.limit, offset: req.query.offset
    });
    res.json({ success: true, data: { items } });
  });

  router.get("/customer-requests/:id", requireStaff, async (req, res) => {
    const data = await customerRequests.getRequest(pool, req.params.id);
    if (!data) return res.status(404).json({ success: false, error: { code: "REQUEST_NOT_FOUND" } });
    res.json({ success: true, data });
  });

  router.post("/customer-requests/:id/messages", requireStaff, requireStepUp, async (req, res) => {
    const { body, is_internal } = req.body || {};
    if (!body) return res.status(400).json({ success: false, error: { code: "MISSING_BODY" } });
    const result = await customerRequests.addMessage(pool, {
      requestId: req.params.id, staffId: req.sccActorId, body,
      isInternal: is_internal !== false
    });
    if (result.error) return res.status(400).json({ success: false, error: { code: result.error } });
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "customer_requests",
      action: is_internal === false ? "staff_control.customer_request.customer_message" : "staff_control.customer_request.internal_note",
      entityType: "customer_request", entityId: req.params.id, status: "ok",
      confirmed: true, riskLevel: "low", ...auditContextFromReq(req), details: { is_internal: is_internal !== false }
    });
    res.json({ success: true, data: result });
  });

  router.post("/customer-requests/:id/transition", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const { next_status } = req.body || {};
    if (!next_status) return res.status(400).json({ success: false, error: { code: "MISSING_NEXT_STATUS" } });
    const result = await customerRequests.transitionStatus(pool, {
      requestId: req.params.id, staffId: req.sccActorId, nextStatus: next_status, reason: req.sccReason
    });
    if (result.error) {
      return res.status(400).json({ success: false, error: { code: result.error }, data: result });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "customer_requests",
      action: `staff_control.customer_request.transition.${next_status}`,
      entityType: "customer_request", entityId: req.params.id, status: "ok",
      reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req), details: { next_status }
    });
    res.json({ success: true, data: result });
  });

  router.post("/customer-requests/:id/assign", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const { assignee_id } = req.body || {};
    if (!assignee_id) return res.status(400).json({ success: false, error: { code: "MISSING_ASSIGNEE" } });
    const result = await customerRequests.assign(pool, {
      requestId: req.params.id, staffId: req.sccActorId, assigneeId: assignee_id
    });
    if (result.error) return res.status(400).json({ success: false, error: { code: result.error } });
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "customer_requests",
      action: "staff_control.customer_request.assign",
      entityType: "customer_request", entityId: req.params.id, status: "ok",
      reason: req.sccReason, confirmed: true, riskLevel: "low",
      ...auditContextFromReq(req), details: { assignee_id }
    });
    res.json({ success: true, data: result });
  });

  router.post("/customer-requests/:id/release", requireStaff, requireStepUp, async (req, res) => {
    const result = await customerRequests.release(pool, {
      requestId: req.params.id, staffId: req.sccActorId, reasonText: req.body?.reason || null
    });
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "customer_requests",
      action: "staff_control.customer_request.release",
      entityType: "customer_request", entityId: req.params.id, status: "ok",
      confirmed: true, riskLevel: "low", ...auditContextFromReq(req), details: result
    });
    res.json({ success: true, data: result });
  });

  // ── Combined Inbox (Welle 8 Schritt 14) ────────────────────
  // Vereint customer-requests + subscription-requests in einer kommerziellen Sicht
  // mit `source_type`-Pill, `priority` und `summary_status`. Daten werden NICHT
  // vermischt — jedes Item bleibt strukturell aus seiner Quelle.
  router.get("/inbox", requireStaff, async (req, res) => {
    const data = await combinedInbox.listCombinedInbox(pool, {
      sourceType: req.query.source_type || null,
      summaryStatus: req.query.summary_status || null,
      plan: req.query.plan || null,
      email: req.query.email || null,
      requestType: req.query.request_type || null,
      limit: req.query.limit, offset: req.query.offset
    });
    res.json({ success: true, data });
  });

  // Bulk-Aktionen: nur sichere Operationen (assign / reject_with_reason / to_under_review).
  // Aktivierung von Vertraegen ist BEWUSST nicht hier — jeder Vertrag braucht
  // Einzel-Pruefung ueber /subscription-requests/:id/activate.
  router.post("/inbox/bulk", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const operation = String(req.body?.operation || "").trim();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const assigneeId = req.body?.assignee_id || null;
    const result = await combinedInbox.runBulkAction(pool, {
      actorUserId: req.sccActorId,
      reason: req.sccReason,
      operation,
      items,
      assigneeId
    });
    if (!result.ok && result.error) {
      const code = result.error;
      const status = code === "REASON_TOO_SHORT" ? 400
        : code === "BULK_LIMIT_EXCEEDED" ? 413
        : code === "UNSUPPORTED_OPERATION" ? 400
        : code === "EMPTY_ITEMS" ? 400 : 400;
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "commercial_inbox",
        action: `staff_control.commercial_inbox.bulk.${operation || "unknown"}`,
        entityType: "bulk_inbox", entityId: "",
        status: "error", reason: req.sccReason, confirmed: true, riskLevel: "medium",
        ...auditContextFromReq(req), details: { error: code, items_count: items.length }
      });
      return res.status(status).json({ success: false, error: { code }, data: result });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "commercial_inbox",
      action: `staff_control.commercial_inbox.bulk.${operation}`,
      entityType: "bulk_inbox", entityId: "",
      status: result.failed.length ? "partial" : "ok",
      reason: req.sccReason, confirmed: true,
      riskLevel: operation === "reject_with_reason" ? "medium" : "low",
      ...auditContextFromReq(req),
      details: {
        operation,
        processed: result.processed,
        success_count: result.success.length,
        failed_count: result.failed.length,
        item_ids: items.map((i) => i && i.id).filter(Boolean).slice(0, 50)
      }
    });
    res.json({ success: true, data: result });
  });

  router.get("/inbox/meta", requireStaff, (_req, res) => {
    res.json({
      success: true,
      data: {
        source_types: Object.values(combinedInbox.SOURCE_TYPES),
        summary_statuses: ["open", "needs_action", "closed"],
        priorities: ["low", "normal", "high"],
        bulk_operations: Object.values(combinedInbox.BULK_OP),
        bulk_limit: 100
      }
    });
  });

  // ── Filterbarer Audit-Report (Welle 8 Schritt 14) ──────────
  // Liefert reine Audit-Eintraege mit Filtern fuer area/actor/entity/range.
  // Das bestehende `/audit-decisions` bleibt fuer den Snapshot + High-Level-Sicht.
  router.get("/audit", requireStaff, async (req, res) => {
    const filters = {
      area: req.query.area || null,
      action: req.query.action || null,
      riskLevel: req.query.risk_level || null,
      actorId: req.query.actor_id || null,
      entityId: req.query.entity_id || null,
      entityType: req.query.entity_type || null,
      since: req.query.since || null,
      until: req.query.until || null,
      limit: req.query.limit,
      offset: req.query.offset
    };
    const items = await listStaffAudit(pool, filters);
    res.json({ success: true, data: { items, filters } });
  });

  router.get("/customer-requests-meta/statuses", requireStaff, (_req, res) => {
    res.json({
      success: true,
      data: {
        allowed_transitions: {
          eingegangen:       customerRequests.listAllowedNextStatuses("eingegangen"),
          rueckfrage_offen:  customerRequests.listAllowedNextStatuses("rueckfrage_offen"),
          angebot_erstellt:  customerRequests.listAllowedNextStatuses("angebot_erstellt"),
          bestaetigt:        customerRequests.listAllowedNextStatuses("bestaetigt"),
          aktiviert:         customerRequests.listAllowedNextStatuses("aktiviert")
        }
      }
    });
  });

  // ── Subscription Requests Inbox (new_individual/pilot/upgrade/downgrade/cancellation)
  router.get("/subscription-requests", requireStaff, async (req, res) => {
    const items = await subInbox.listInbox(pool, {
      status: req.query.status || null,
      statusBucket: req.query.status_bucket || null,
      requestType: req.query.request_type || null,
      quickFilter: req.query.quick_filter || null,
      assigneeStaffId: req.query.assignee || null,
      unassigned: req.query.unassigned === "true",
      planRequested: req.query.plan_requested || null,
      contactEmail: req.query.email || null,
      limit: req.query.limit,
      offset: req.query.offset,
      staffActorId: req.sccActorId
    });
    const counters = await subInbox.getInboxCounters(pool, { staffActorId: req.sccActorId });
    res.json({ success: true, data: { items, counters } });
  });

  router.get("/subscription-requests-meta", requireStaff, (_req, res) => {
    const buildAllowed = {};
    Object.values(SUB_STATUS).forEach((s) => { buildAllowed[s] = subAllowedNext(s); });
    res.json({
      success: true,
      data: {
        request_types: Object.values(SUB_REQUEST_TYPES),
        statuses: Object.values(SUB_STATUS),
        allowed_transitions: buildAllowed
      }
    });
  });

  router.get("/subscription-requests/:id", requireStaff, async (req, res) => {
    const data = await subInbox.getInboxDetail(pool, req.params.id);
    if (!data) return res.status(404).json({ success: false, error: { code: "REQUEST_NOT_FOUND" } });
    const allowed_next = subAllowedNext(data.status, data.request_type);
    const can_bypass_staff = subCanBypass({
      request_type: data.request_type,
      current_plan: data.current_plan,
      desired_plan: data.desired_plan
    });
    res.json({ success: true, data: { ...data, allowed_next, can_bypass_staff } });
  });

  router.post("/subscription-requests/:id/transition", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const next = String(req.body?.next_status || "").trim();
    if (!next) return res.status(400).json({ success: false, error: { code: "MISSING_NEXT_STATUS" } });
    const result = await subInbox.transitionStatus(pool, {
      requestId: req.params.id,
      toStatus: next,
      actorUserId: req.sccActorId,
      reason: req.sccReason,
      details: req.body?.details || {}
    });
    if (!result.ok) {
      const code = result.error || "TRANSITION_FAILED";
      const status = code === "REQUEST_NOT_FOUND" ? 404 : code === "INVALID_TRANSITION" || code === "NO_CHANGE" ? 409 : 400;
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "subscription_requests",
        action: `staff_control.subscription_request.transition.${next}`,
        entityType: "subscription_request", entityId: req.params.id,
        status: "error", reason: req.sccReason, confirmed: true, riskLevel: "medium",
        ...auditContextFromReq(req), details: { error: code, allowed: result.allowed || [] }
      });
      return res.status(status).json({ success: false, error: { code, allowed: result.allowed || [] } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "subscription_requests",
      action: `staff_control.subscription_request.transition.${next}`,
      entityType: "subscription_request", entityId: req.params.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req), details: { from: result.row && result.row.status, to: next }
    });
    dispatchSubscriptionHook(pool, {
      requestId: req.params.id,
      toStatus: next,
      fromStatus: result.row && result.row.status_from || null,
      requestType: result.row && result.row.request_type
    }, notifyDeps);
    res.json({
      success: true,
      data: {
        ...result.row,
        quote_snapshot: result.quote_snapshot || result.row?.quote_snapshot || null,
        quote_already_frozen: result.quote_already_frozen === true,
        document: result.document || null
      }
    });
  });

  router.post("/subscription-requests/:id/approve", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const result = await subInbox.approveRequest(pool, {
      requestId: req.params.id,
      actorUserId: req.sccActorId,
      reason: req.sccReason
    });
    if (!result.ok) {
      const code = result.error || "APPROVE_FAILED";
      const status = code === "REQUEST_NOT_FOUND" ? 404 : 409;
      return res.status(status).json({ success: false, error: { code, allowed: result.allowed || [] } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "subscription_requests",
      action: "staff_control.subscription_request.approve",
      entityType: "subscription_request", entityId: req.params.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "high",
      ...auditContextFromReq(req),
      details: {
        approved: true,
        quote_snapshot_already_frozen: result.quote_already_frozen === true,
        quote_catalog_version: result.quote_snapshot?.catalog_version || null
      }
    });
    dispatchSubscriptionHook(pool, {
      requestId: req.params.id, toStatus: "accepted",
      requestType: result.row && result.row.request_type
    }, notifyDeps);
    res.json({
      success: true,
      data: {
        ...result.row,
        quote_snapshot: result.quote_snapshot || result.row?.quote_snapshot || null,
        quote_already_frozen: result.quote_already_frozen === true
      }
    });
  });

  router.post("/subscription-requests/:id/reject", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const result = await subInbox.rejectRequest(pool, {
      requestId: req.params.id,
      actorUserId: req.sccActorId,
      reason: req.sccReason
    });
    if (!result.ok) {
      const code = result.error || "REJECT_FAILED";
      const status = code === "REQUEST_NOT_FOUND" ? 404 : 409;
      return res.status(status).json({ success: false, error: { code, allowed: result.allowed || [] } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "subscription_requests",
      action: "staff_control.subscription_request.reject",
      entityType: "subscription_request", entityId: req.params.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req), details: { rejection_reason: req.sccReason }
    });
    dispatchSubscriptionHook(pool, {
      requestId: req.params.id, toStatus: "rejected",
      requestType: result.row && result.row.request_type
    }, notifyDeps);
    res.json({ success: true, data: result.row });
  });

  router.post("/subscription-requests/:id/activate", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    let result = null;
    try {
      result = await applyApprovedChange(pool, {
        requestId: req.params.id,
        actorUserId: req.sccActorId,
        reason: req.sccReason
      });
    } catch (err) {
      const code = err?.code || err?.message || "ACTIVATE_FAILED";
      const status = activationErrorStatus(code);
      Promise.resolve()
        .then(() => notifyActivationFailed(pool, {
          requestId: req.params.id,
          errorCode: code,
          errorMessage: code
        }, notifyDeps))
        .catch((notifyErr) => { try { logger?.warn?.({ err: notifyErr && notifyErr.message }, "activation_failed hook failed"); } catch { /* noop */ } });
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "subscription_requests",
        action: "staff_control.subscription_request.activate",
        entityType: "subscription_request", entityId: req.params.id,
        status: "error", reason: req.sccReason, confirmed: true, riskLevel: "high",
        ...auditContextFromReq(req), details: { error: code }
      });
      return res.status(status).json({ success: false, error: { code } });
    }
    if (!result.ok) {
      const code = result.error || "ACTIVATE_FAILED";
      const status = activationErrorStatus(code);
      Promise.resolve()
        .then(() => notifyActivationFailed(pool, {
          requestId: req.params.id, errorCode: code, errorMessage: code
        }, notifyDeps))
        .catch((err) => { try { logger?.warn?.({ err: err && err.message }, "activation_failed hook failed"); } catch { /* noop */ } });
      return res.status(status).json({ success: false, error: { code, allowed: result.allowed || [] } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "subscription_requests",
      action: "staff_control.subscription_request.activate",
      entityType: "subscription_request", entityId: req.params.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "high",
      ...auditContextFromReq(req),
      details: {
        activated: true,
        target_plan: result.target_plan || null,
        quote_snapshot_already_frozen: result.quote_already_frozen === true,
        quote_catalog_version: result.quote_snapshot?.catalog_version || null,
        document_type: result.document?.document_type || null,
        document_number: result.document?.document_number || null,
        document_created: result.document?.created === true,
        document_already_exists: result.document?.already_exists === true
      }
    });
    dispatchSubscriptionHook(pool, {
      requestId: req.params.id, toStatus: "active",
      requestType: result.row && result.row.request_type
    }, notifyDeps);
    res.json({
      success: true,
      data: {
        ...result.row,
        target_plan: result.target_plan || null,
        quote_snapshot: result.quote_snapshot || result.row?.quote_snapshot || null,
        quote_already_frozen: result.quote_already_frozen === true,
        document: result.document || null
      }
    });
  });

  router.post("/subscription-requests/:id/assign", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const staffUserId = req.body?.staff_user_id ? String(req.body.staff_user_id) : null;
    if (!staffUserId) return res.status(400).json({ success: false, error: { code: "STAFF_USER_ID_REQUIRED" } });
    const result = await subInbox.assignStaff(pool, {
      requestId: req.params.id,
      staffUserId,
      actorUserId: req.sccActorId
    });
    if (!result.ok) {
      const code = result.error || "ASSIGN_FAILED";
      const status = code === "REQUEST_NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ success: false, error: { code } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "subscription_requests",
      action: "staff_control.subscription_request.assign",
      entityType: "subscription_request", entityId: req.params.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "low",
      ...auditContextFromReq(req), details: { assigned_staff_id: staffUserId }
    });
    res.json({ success: true, data: result.row });
  });

  router.get("/subscription-requests/:id/documents", requireStaff, async (req, res) => {
    const list = await subDocs.listForRequest(pool, req.params.id);
    res.json({ success: true, data: { items: list } });
  });

  router.post("/subscription-requests/:id/documents", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const documentType = String(req.body?.document_type || "").trim();
    if (!documentType) return res.status(400).json({ success: false, error: { code: "DOCUMENT_TYPE_REQUIRED" } });
    const result = await subDocs.generateDocument(pool, {
      documentType,
      subscriptionRequestId: req.params.id,
      actorUserId: req.sccActorId
    });
    if (!result.ok) {
      const status = result.error === "REQUEST_NOT_FOUND" ? 404 : result.error === "EMPTY_DOCUMENT" ? 400 : 400;
      return res.status(status).json({ success: false, error: { code: result.error || "GENERATION_FAILED" } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "subscription_requests",
      action: `staff_control.subscription_request.document.create.${documentType}`,
      entityType: "subscription_document", entityId: result.row.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req),
      details: { document_type: documentType, document_number: result.row.document_number, request_id: req.params.id }
    });
    res.status(201).json({ success: true, data: { id: result.row.id, document_number: result.row.document_number, title: result.row.title } });
  });

  router.get("/subscription-documents/:id/download", requireStaff, async (req, res) => {
    const row = await subDocs.getDocument(pool, req.params.id);
    if (!row) return res.status(404).json({ success: false, error: { code: "DOCUMENT_NOT_FOUND" } });
    await subDocs.markDownloaded(pool, { id: row.id, actorUserId: req.sccActorId });
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "subscription_requests",
      action: "staff_control.subscription_document.download",
      entityType: "subscription_document", entityId: row.id,
      status: "ok", confirmed: true, riskLevel: "low",
      ...auditContextFromReq(req),
      details: { document_type: row.document_type, document_number: row.document_number }
    });
    const payload = subDocs.getDocumentDownloadPayload(row);
    const number = String(row.document_number || row.id || "subscription-document").replace(/[^A-Za-z0-9_.-]/g, "_");
    res.setHeader("Content-Type", payload.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${number}.${payload.extension}"`);
    res.send(payload.body);
  });

  router.post("/subscription-requests/:id/offer", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const body = req.body || {};
    let result;
    try {
      result = await withTransaction(pool, async (client) => {
        const offerUpdate = await subInbox.setOfferDetails(client, {
          requestId: req.params.id,
          actorUserId: req.sccActorId,
          staffNotes: body.staff_notes,
          proposedPriceCents: Number.isFinite(body.proposed_price_cents) ? body.proposed_price_cents : undefined,
          proposedTermMonths: Number.isFinite(body.proposed_term_months) ? body.proposed_term_months : undefined,
          desiredFeatures: Array.isArray(body.desired_features) ? body.desired_features : undefined,
          desiredAddons: Array.isArray(body.desired_addons) ? body.desired_addons : undefined,
          expectedStartDate: body.expected_start_date,
          expectedEndDate: body.expected_end_date
        });
        if (!offerUpdate.ok) return offerUpdate;
        const snapshotResult = await subLifecycle.freezeQuoteSnapshot(client, {
          requestId: req.params.id,
          actorUserId: req.sccActorId
        });
        if (!snapshotResult.ok) throw serviceError(snapshotResult.error || "QUOTE_SNAPSHOT_FAILED");
        const documentResult = await subDocs.ensureDocumentForRequest(client, {
          documentType: "offer",
          subscriptionRequestId: req.params.id,
          actorUserId: req.sccActorId
        });
        if (!documentResult.ok) throw serviceError(documentResult.error || "DOCUMENT_GENERATION_FAILED");
        return {
          ...offerUpdate,
          quote_snapshot: snapshotResult.snapshot || null,
          quote_already_frozen: snapshotResult.already_frozen === true,
          document: documentPayload(documentResult)
        };
      });
    } catch (err) {
      const code = err?.code || err?.message || "OFFER_UPDATE_FAILED";
      const status = code === "REQUEST_NOT_FOUND" ? 404 : code === "NO_FIELDS" ? 400 : 500;
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "subscription_requests",
        action: "staff_control.subscription_request.offer_set",
        entityType: "subscription_request", entityId: req.params.id,
        status: "error", reason: req.sccReason, confirmed: true, riskLevel: "medium",
        ...auditContextFromReq(req), details: { error: code }
      });
      return res.status(status).json({ success: false, error: { code } });
    }
    if (!result.ok) {
      const code = result.error || "OFFER_UPDATE_FAILED";
      const status = code === "REQUEST_NOT_FOUND" ? 404 : code === "NO_FIELDS" ? 400 : 400;
      return res.status(status).json({ success: false, error: { code } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "subscription_requests",
      action: "staff_control.subscription_request.offer_set",
      entityType: "subscription_request", entityId: req.params.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req),
      details: {
        proposed_price_cents: result.row.proposed_price_cents,
        proposed_term_months: result.row.proposed_term_months,
        quote_snapshot_already_frozen: result.quote_already_frozen === true,
        quote_catalog_version: result.quote_snapshot?.catalog_version || null,
        document_type: result.document?.document_type || null,
        document_number: result.document?.document_number || null,
        document_created: result.document?.created === true,
        document_already_exists: result.document?.already_exists === true
      }
    });
    res.json({
      success: true,
      data: {
        ...result.row,
        quote_snapshot: result.quote_snapshot || result.row?.quote_snapshot || null,
        quote_already_frozen: result.quote_already_frozen === true,
        document: result.document || null
      }
    });
  });

  // ── Welle 8 Schritt 16: Strategic-Request -> Subscription-Request konvertieren ──
  // Manuelle Staff-Aktion. Idempotent: doppelter Aufruf liefert ALREADY_LINKED.
  router.post("/strategic-requests/:id/convert-to-subscription", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const requestType = String(req.body?.request_type || "new_individual").trim();
    const result = await subLifecycle.linkEnterpriseRequestToSubscription(pool, {
      strategicRequestId: req.params.id,
      actorUserId: req.sccActorId,
      requestType,
      sendMail,
      logger
    });
    if (!result.ok) {
      const code = result.error || "CONVERT_FAILED";
      const status = code === "STRATEGIC_REQUEST_NOT_FOUND" ? 404 : 400;
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "subscription_requests",
        action: "staff_control.strategic_request.convert_to_subscription",
        entityType: "strategic_collaboration_request", entityId: req.params.id,
        status: "error", reason: req.sccReason, confirmed: true, riskLevel: "medium",
        ...auditContextFromReq(req), details: { error: code, request_type: requestType }
      });
      return res.status(status).json({ success: false, error: { code } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "subscription_requests",
      action: "staff_control.strategic_request.convert_to_subscription",
      entityType: "strategic_collaboration_request", entityId: req.params.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req),
      details: {
        linked: result.linked === true,
        already_linked: result.linked === false,
        reason: result.reason || null,
        subscription_request_id: result.subscription_request_id,
        request_type: requestType
      }
    });
    res.json({
      success: true,
      data: {
        linked: result.linked === true,
        reason: result.reason || null,
        subscription_request_id: result.subscription_request_id,
        status: result.status || (result.row && result.row.status) || null,
        request_type: requestType
      }
    });
  });

  // ── Uebrige Areas (read-only Aggregationen) ─────────────
  router.get("/executive", requireStaff, async (_req, res) => {
    res.json({ success: true, data: await staffControlService.loadExecutiveSnapshot(pool) });
  });
  router.get("/platform", requireStaff, async (_req, res) => {
    res.json({ success: true, data: await staffControlService.loadPlatformSnapshot(pool) });
  });
  router.get("/support", requireStaff, async (_req, res) => {
    res.json({ success: true, data: await staffControlService.loadSupportSnapshot() });
  });
  router.get("/operations", requireStaff, async (_req, res) => {
    res.json({ success: true, data: await staffControlService.loadOperationsSnapshot(pool) });
  });
  router.get("/hetzner", requireStaff, async (_req, res) => {
    try { res.json({ success: true, data: await hetzner.getInfraOverview() }); }
    catch (err) { logger?.error({ err }, "SCC hetzner overview failed"); res.status(502).json({ success: false, error: { code: "HETZNER_OVERVIEW_FAILED" } }); }
  });
  router.get("/revenue", requireStaff, async (_req, res) => {
    res.json({ success: true, data: await staffControlService.loadRevenueSnapshot(pool) });
  });
  router.get("/risk-trust", requireStaff, async (_req, res) => {
    res.json({ success: true, data: await staffControlService.loadRiskSnapshot(pool) });
  });
  router.get("/audit-decisions", requireStaff, async (req, res) => {
    const filters = {
      area: req.query.area || null, action: req.query.action || null,
      riskLevel: req.query.risk_level || null, limit: req.query.limit, offset: req.query.offset
    };
    const [snapshot, audit] = await Promise.all([
      staffControlService.loadAuditDecisionsSnapshot(pool),
      listStaffAudit(pool, filters)
    ]);
    res.json({ success: true, data: { snapshot, audit } });
  });
  router.get("/data-explorer", requireStaff, (_req, res) => {
    res.json({ success: true, data: { views: staffControlService.listDataExplorerViews() } });
  });
  router.get("/data-explorer/:key", requireStaff, async (req, res) => {
    const data = await staffControlService.runDataExplorerView(pool, req.params.key);
    if (data.error === "VIEW_NOT_FOUND") return res.status(404).json({ success: false, error: { code: "VIEW_NOT_FOUND" } });
    res.json({ success: true, data });
  });
  router.get("/automation", requireStaff, async (_req, res) => {
    try { await runbookService.ensureSeedRunbooks(pool); } catch { /* ignore */ }
    const runbooks = await runbookService.listRunbooks(pool);
    res.json({ success: true, data: { runbooks, hetzner_mode: hetzner.HETZNER_MODE, safe_actions: hetzner.listSafeActions() } });
  });

  // ── Mutierende Aktionen (Platform/Hetzner/Automation/Decisions) ─
  router.post("/platform/feature-flags", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const { flag_key, enabled, risk_level_override } = req.body || {};
    if (!flag_key || typeof enabled !== "boolean") {
      return res.status(400).json({ success: false, error: { code: "INVALID_FLAG_PAYLOAD" } });
    }
    const { rows: existing } = await pool.query(
      "SELECT flag_key, risk_level FROM staff_control_feature_flags WHERE flag_key = $1", [flag_key]
    );
    if (!existing[0]) return res.status(404).json({ success: false, error: { code: "FLAG_NOT_FOUND" } });
    const riskLevel = risk_level_override || existing[0].risk_level || "medium";
    await pool.query(
      `UPDATE staff_control_feature_flags
         SET is_enabled = $1, updated_by = $2, updated_at = NOW(), reason = $3
       WHERE flag_key = $4`,
      [enabled, req.sccActorId, req.sccReason, flag_key]
    );
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "platform",
      action: "staff_control.platform.feature_flag.set",
      entityType: "feature_flag", entityId: flag_key, status: "ok",
      reason: req.sccReason, confirmed: true, riskLevel,
      ...auditContextFromReq(req), details: { flag_key, enabled }
    });
    res.json({ success: true, data: { flag_key, enabled } });
  });

  router.post("/hetzner/action", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const { action_key, params } = req.body || {};
    if (!action_key) return res.status(400).json({ success: false, error: { code: "MISSING_ACTION_KEY" } });
    const result = await hetzner.runSafeAction(action_key, params || {});
    const status = result?.error ? "error" : "ok";
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "hetzner",
      action: `staff_control.hetzner.${action_key}`,
      entityType: "hetzner_action",
      entityId: String(params?.serverId || params?.lbId || action_key),
      status, reason: req.sccReason, confirmed: true, riskLevel: "high",
      ...auditContextFromReq(req), details: { action_key, params, result }
    });
    if (result?.error) return res.status(400).json({ success: false, error: { code: result.error }, data: result });
    res.json({ success: true, data: result });
  });

  router.post("/automation/run", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const { runbook_key, dry_run } = req.body || {};
    if (!runbook_key) return res.status(400).json({ success: false, error: { code: "MISSING_RUNBOOK_KEY" } });
    const result = await runbookService.executeRunbook(pool, {
      runbookKey: runbook_key, actorId: req.sccActorId, reason: req.sccReason,
      confirmed: true, dryRun: dry_run === true
    });
    if (result.error) return res.status(400).json({ success: false, error: { code: result.error }, data: result });
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "automation",
      action: `staff_control.automation.run.${runbook_key}`,
      entityType: "runbook_run", entityId: result.runId,
      status: result.status === "success" ? "ok" : "error",
      reason: req.sccReason, confirmed: true, riskLevel: "high",
      ...auditContextFromReq(req), details: { runbook_key, dry_run: !!dry_run, final_status: result.status }
    });
    res.json({ success: true, data: result });
  });

  router.post("/audit-decisions", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const { area, title, decision, reversible, linked_entity_type, linked_entity_id, details } = req.body || {};
    if (!area || !title || !decision) {
      return res.status(400).json({ success: false, error: { code: "MISSING_DECISION_FIELDS" } });
    }
    const { rows } = await pool.query(
      `INSERT INTO staff_control_decisions
         (area, title, decision, reason, confirmed_by, reversible, linked_entity_type, linked_entity_id, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, confirmed_at`,
      [area, title, decision, req.sccReason, req.sccActorId,
       reversible !== false, linked_entity_type || null, linked_entity_id || null,
       JSON.stringify(details || {})]
    );
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "audit_decisions",
      action: "staff_control.decision.recorded",
      entityType: "decision", entityId: rows[0].id, status: "ok",
      reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req), details: { area, title }
    });
    res.json({ success: true, data: { id: rows[0].id, confirmed_at: rows[0].confirmed_at } });
  });

  return router;
}

/** Separater Login-Router (vor dem Access-Guard gemountet). */
export function createStaffControlAuthRouter(deps) {
  const { pool, logger } = deps;
  const router = Router();

  router.post("/auth/login", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!email || !password) return res.status(400).json({ success: false, error: { code: "MISSING_CREDENTIALS" } });

      const bcrypt = await import("bcryptjs");
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.password_hash
           FROM users u JOIN tempconnect_staff s ON s.user_id = u.id
           WHERE LOWER(u.email) = $1 AND s.is_active = TRUE`,
        [email]
      );
      const user = rows[0];
      if (!user) {
        logger?.warn({ email }, "SCC login denied: user not in tempconnect_staff");
        return res.status(401).json({ success: false, error: { code: "SCC_LOGIN_FAILED" } });
      }
      const ok = await bcrypt.default.compare(password, user.password_hash || "");
      if (!ok) return res.status(401).json({ success: false, error: { code: "SCC_LOGIN_FAILED" } });

      req.session.staffUserId = user.id;
      req.session.sccAuthorizedAt = Date.now();
      // Explizites save() bevor Response gesendet wird — verhindert Race Condition
      // zwischen async Session-Save und Client der sofort Bootstrap aufruft.
      req.session.save((saveErr) => {
        if (saveErr) {
          logger?.error({ saveErr }, "SCC session save error");
          return res.status(500).json({ success: false, error: { code: "SCC_SESSION_ERROR" } });
        }
        res.json({ success: true, data: { user_id: user.id, email: user.email } });
      });
    } catch (err) {
      logger?.error({ err }, "SCC login error");
      res.status(500).json({ success: false, error: { code: "SCC_LOGIN_ERROR" } });
    }
  });

  return router;
}
