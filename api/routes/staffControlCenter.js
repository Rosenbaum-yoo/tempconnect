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
import { requireMfa } from "../middleware/requireMfa.js";
import * as staffControlService from "../services/staffControlService.js";
import * as hetzner from "../services/staffHetznerService.js";
import * as runbookService from "../services/staffRunbookService.js";
import * as customerRequests from "../services/staffCustomerRequestsService.js";
import * as subInbox from "../services/staffSubscriptionRequestsService.js";
import * as subDocs from "../services/subscriptionDocumentService.js";
import * as combinedInbox from "../services/staffCombinedInboxService.js";
import * as subLifecycle from "../services/subscriptionLifecycleService.js";
import * as customerOps from "../services/staffCustomerOperationsService.js";
import * as orgSuspension from "../services/orgAccessSuspensionService.js";
import * as staffBilling from "../services/staffBillingOverviewService.js";
import * as staffMail from "../services/staffMailCenterService.js";
import * as staffIncidents from "../services/staffIncidentService.js";
import * as pilotPolicy from "../services/pilotPolicyService.js";
import * as prereg from "../services/pilotPreregistrationService.js";
import { config } from "../config/index.js";
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
// Marketplace Visibility Center — M-07 (2026-05-30)
import * as visSvc from "../services/profileVisibilityService.js";
import {
  approveRating, rejectRating, getPendingModerationQueue
} from "../services/ratingService.js";
import * as bountySvc from "../services/profileBountyService.js";

// SCC WAVE 02: Typed-Confirmation-Text für critical Feature-Flags
function computeFeatureFlagConfirmation(flagKey, enabled) {
  const map = {
    "platform.read_only_mode":     enabled ? "READ ONLY ON"          : "READ ONLY OFF",
    "registration.disabled":       enabled ? "DISABLE REGISTRATION"  : "ENABLE REGISTRATION",
    "marketplace.new_offers_off":  enabled ? "DISABLE OFFERS"        : "ENABLE OFFERS",
    "notdienst.force_manual":      enabled ? "DISABLE AUTO MATCH"    : "ENABLE AUTO MATCH"
  };
  if (map[flagKey] !== undefined) return map[flagKey];
  // Generisches Fallback für unbekannte critical Flags
  return `CONFIRM ${flagKey.toUpperCase().replace(/\./g, " ")}`;
}

export function createStaffControlCenterRouter(deps) {
  const { pool, logger, sendMail } = deps;
  const router = Router();
  const notifyDeps = { sendMail, logger };
  const requireStaff = createStaffControlAccessMiddleware({ pool, logger });
  // SCC WAVE 02: risk-basierte Step-up TTLs (medium 15min / high 10min / critical 5min)
  const requireStepUp = createStaffStepUpMiddleware({ riskLevel: "medium" });
  const requireStepUpHigh = createStaffStepUpMiddleware({ riskLevel: "high" });
  const requireStepUpCritical = createStaffStepUpMiddleware({ riskLevel: "critical" });
  const mfaGuard = requireMfa({ pool, enforce: false });

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
        theme: {
          switcher_enabled: config.THEME_SWITCHER_ENABLED,
          ultra_premium_enabled: config.ULTRA_PREMIUM_THEME_ENABLED
        },
        executive_summary: executive,
        platform_summary: platform
      }
    });
  });

  // ── Pilot-Verwaltung (plattformweit) ────────────────────────
  // Owner-Wunsch 2026-06-14: alle Piloten zentral sehen + steuern, OHNE versehentliche Zahlung.
  // Bewusst KEIN manuelles "convert" hier — Konversion zu bezahlt passiert nur im Payment-Flow.
  router.get("/pilots", requireStaff, async (req, res) => {
    try {
      const items = await pilotPolicy.listAllPilots(pool);
      res.json({ success: true, data: { items, total: items.length } });
    } catch (err) {
      logger.error({ err: err.message }, "scc pilots list");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.post("/pilots/:orgId/extend", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
    try {
      const result = await pilotPolicy.extendPilotForOrganization(pool, {
        orgId: req.params.orgId, months: Number(req.body?.months) || 1, actorUserId: req.sccActorId
      });
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "pilots", action: "staff_control.pilot.extend",
        entityType: "organization", entityId: req.params.orgId, status: "ok",
        reason: req.sccReason, confirmed: true, riskLevel: "medium"
      });
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.code === "ORG_NOT_FOUND" ? 404 : err.code === "PILOT_NOT_ACTIVE" ? 409 : 500;
      if (status >= 500) logger.error({ err: err.message }, "scc pilot extend");
      res.status(status).json({ success: false, error: { code: err.code || "SERVER_ERROR" } });
    }
  });

  router.post("/pilots/:orgId/end", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
    try {
      const result = await pilotPolicy.endPilotForOrganization(pool, {
        orgId: req.params.orgId, actorUserId: req.sccActorId, reason: req.sccReason
      });
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "pilots", action: "staff_control.pilot.end",
        entityType: "organization", entityId: req.params.orgId, status: "ok",
        reason: req.sccReason, confirmed: true, riskLevel: "medium"
      });
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.code === "ORG_NOT_FOUND" ? 404 : 500;
      if (status >= 500) logger.error({ err: err.message }, "scc pilot end");
      res.status(status).json({ success: false, error: { code: err.code || "SERVER_ERROR" } });
    }
  });

  router.post("/pilots/:orgId/exception", requireStaff, mfaGuard, requireStepUpHigh, requireConfirmAndReason, async (req, res) => {
    try {
      const allowed = req.body?.allowed === true;
      const result = await pilotPolicy.setPilotException(pool, {
        orgId: req.params.orgId, actorUserId: req.sccActorId, allowed, reason: req.sccReason
      });
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "pilots",
        action: `staff_control.pilot.exception.${allowed ? "allow" : "block"}`,
        entityType: "organization", entityId: req.params.orgId, status: "ok",
        reason: req.sccReason, confirmed: true, riskLevel: "high"
      });
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.code === "ORG_NOT_FOUND" ? 404 : err.code === "PILOT_EXCEPTION_REASON_REQUIRED" ? 400 : 500;
      if (status >= 500) logger.error({ err: err.message }, "scc pilot exception");
      res.status(status).json({ success: false, error: { code: err.code || "SERVER_ERROR" } });
    }
  });

  // ── Pilot-Voranmeldungen (Kuratierung) ──────────────────────
  // Owner reviewt Bewerbungen (Telefon sichtbar fuer Outreach) + waehlt die 30+30 Paare.
  router.get("/preregistrations", requireStaff, async (req, res) => {
    try {
      const items = await prereg.listPreregs(pool, {
        cohort: req.query.cohort || undefined,
        side: req.query.side || null,
        status: req.query.status || null,
      });
      const counts = await prereg.getPublicCounts(pool, req.query.cohort || undefined);
      res.json({ success: true, data: { items, total: items.length, counts } });
    } catch (err) {
      logger.error({ err: err.message }, "scc preregs list");
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } });
    }
  });

  router.post("/preregistrations/:id/status", requireStaff, async (req, res) => {
    try {
      const status = String(req.body?.status || "");
      const result = await prereg.setPreregStatus(pool, { id: req.params.id, status });
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "preregistrations",
        action: `staff_control.prereg.status.${status}`,
        entityType: "pilot_preregistration", entityId: req.params.id, status: "ok",
        reason: req.body?.reason || null, confirmed: true, riskLevel: "low",
      });
      res.json({ success: true, data: result });
    } catch (err) {
      const code = err.code || "SERVER_ERROR";
      const httpStatus = code === "NOT_FOUND" ? 404 : code === "INVALID_STATUS" ? 400 : 500;
      if (httpStatus >= 500) logger.error({ err: err.message }, "scc prereg status");
      res.status(httpStatus).json({ success: false, error: { code } });
    }
  });

  // ── Step-up + Logout ────────────────────────────────────────
  // SCC WAVE 02: Echte Passwort-Reauth statt confirmed=true.
  // Unterstützte Methoden: password (jetzt) | totp (WAVE 02 Phase 2 / WebAuthn future).
  router.post("/auth/step-up", requireStaff, async (req, res) => {
    const method = String(req.body?.method || "password");

    if (method !== "password") {
      return res.status(400).json({
        success: false,
        error: { code: "STEP_UP_METHOD_UNSUPPORTED", message: "Nur method=password wird derzeit unterstützt." }
      });
    }

    const password = String(req.body?.password || "");
    if (!password) {
      return res.status(400).json({
        success: false,
        error: { code: "STEP_UP_CREDENTIAL_REQUIRED", message: "Passwort erforderlich für Step-up." }
      });
    }

    const bcrypt = await import("bcryptjs");
    const { rows } = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.sccActorId]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ success: false, error: { code: "SCC_STEP_UP_FAILED" } });
    }

    const ok = await bcrypt.default.compare(password, user.password_hash || "");
    if (!ok) {
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "auth", action: "staff_control.auth.step_up_failed",
        status: "error", confirmed: false, riskLevel: "high",
        ...auditContextFromReq(req), details: { method, reason: "wrong_password" }
      });
      return res.status(401).json({ success: false, error: { code: "SCC_STEP_UP_FAILED" } });
    }

    req.session.staffStepUpAt = Date.now();
    req.session.staffStepUpMethod = method;
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "auth", action: "staff_control.auth.step_up",
      status: "ok", confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req),
      details: { method, step_up_at: req.session.staffStepUpAt }
    });
    res.json({ success: true, data: { step_up_at: req.session.staffStepUpAt, method } });
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

  router.post("/customer-requests/:id/messages", requireStaff, mfaGuard, requireStepUp, async (req, res) => {
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

  router.post("/customer-requests/:id/transition", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
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

  router.post("/customer-requests/:id/assign", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
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

  router.post("/customer-requests/:id/release", requireStaff, mfaGuard, requireStepUp, async (req, res) => {
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
      sourceType:         req.query.source_type || null,
      summaryStatus:      req.query.summary_status || null,
      plan:               req.query.plan || null,
      email:              req.query.email || null,
      requestType:        req.query.request_type || null,
      // SCC WAVE 05: Neue Filter
      assignedToStaffId:  req.query.assigned_to_me === "1" ? req.sccActorId : (req.query.assigned_to_staff_id || null),
      limit: req.query.limit, offset: req.query.offset
    });
    res.json({ success: true, data });
  });

  // Bulk-Aktionen: nur sichere Operationen (assign / reject_with_reason / to_under_review).
  // Aktivierung von Vertraegen ist BEWUSST nicht hier — jeder Vertrag braucht
  // Einzel-Pruefung ueber /subscription-requests/:id/activate.
  router.post("/inbox/bulk", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
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

  // SCC WAVE 05: Inbox Item Detail ──────────────────────────────
  router.get("/inbox/:id", requireStaff, async (req, res) => {
    try {
      const detail = await combinedInbox.getInboxItemDetail(pool, req.params.id);
      if (!detail) {
        return res.status(404).json({ success: false, error: { code: "INBOX_ITEM_NOT_FOUND" } });
      }
      res.json({ success: true, data: detail });
    } catch (err) {
      logger?.error({ err }, "SCC inbox detail error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  // SCC WAVE 05: Active Staff Members (fuer Assignee-Dropdown) ─
  router.get("/staff-members", requireStaff, async (req, res) => {
    try {
      const members = await combinedInbox.getActiveStaffMembers(pool);
      res.json({ success: true, data: { members } });
    } catch (err) {
      logger?.error({ err }, "SCC staff-members error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  // ── SCC WAVE 11: Staff Access Management ─────────────────────

  /** GET /staff-access — vollstaendige Staff-Liste (aktiv + inaktiv) fuer Access Review */
  router.get("/staff-access", requireStaff, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT user_id, email, display_name, role, is_active, created_at
           FROM tempconnect_staff
           ORDER BY is_active DESC, COALESCE(display_name, email)`
      );
      res.json({ success: true, data: { members: rows } });
    } catch (err) {
      logger?.error({ err }, "SCC staff-access error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  /** PATCH /staff-access/:userId/deactivate — Staff-Mitglied deaktivieren (mit Reason + Audit) */
  router.patch("/staff-access/:userId/deactivate", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const { userId } = req.params;
    const reason     = String(req.body?.reason || "").trim();
    const actorId    = req.session.staffUserId;

    // Selbst-Deaktivierung ist verboten
    if (userId === actorId) {
      return res.status(400).json({
        success: false,
        error: { code: "SCC_SELF_DEACTIVATE_FORBIDDEN", message: "Eigenen Staff-Zugang kann nicht deaktiviert werden." }
      });
    }

    try {
      const { rowCount } = await pool.query(
        `UPDATE tempconnect_staff SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE`,
        [userId]
      );
      if (rowCount === 0) {
        return res.status(404).json({ success: false, error: { code: "SCC_STAFF_NOT_FOUND" } });
      }

      writeStaffAudit(pool, {
        actorId,
        area: "staff_access",
        action: "staff_access.member.deactivate",
        status: "ok",
        confirmed: true,
        riskLevel: "high",
        ...auditContextFromReq(req),
        details: { target_user_id: userId, reason }
      }).catch((e) => logger?.warn?.({ err: e }, "SCC staff-access deactivate audit error"));

      res.json({ success: true, data: { deactivated: userId } });
    } catch (err) {
      logger?.error({ err }, "SCC staff-access deactivate error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  // SCC WAVE 05: Single-Item Assign ────────────────────────────
  router.patch("/inbox/:id/assign", requireStaff, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const { assignee_id, source_type } = req.body || {};
    const itemId = req.params.id;
    if (!assignee_id) {
      return res.status(400).json({ success: false, error: { code: "ASSIGNEE_REQUIRED" } });
    }
    if (!source_type) {
      return res.status(400).json({ success: false, error: { code: "SOURCE_TYPE_REQUIRED" } });
    }
    try {
      const result = await combinedInbox.runBulkAction(pool, {
        actorUserId: req.sccActorId,
        reason: req.sccReason,
        operation: "assign",
        items: [{ id: itemId, source_type }],
        assigneeId: assignee_id,
      });
      if (!result.ok || result.failed?.length > 0) {
        const errCode = result.error || result.failed?.[0]?.error || "ASSIGN_FAILED";
        return res.status(409).json({ success: false, error: { code: errCode } });
      }
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "commercial_inbox",
        action: "staff_control.inbox.assign",
        entityType: "inbox_item", entityId: itemId,
        status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "low",
        ...auditContextFromReq(req),
        details: { item_id: itemId, source_type, assignee_id }
      });
      res.json({ success: true, data: { assigned: true, assignee_id } });
    } catch (err) {
      logger?.error({ err }, "SCC inbox assign error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
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

  // ── Customer Operations (Phase B): read-only Kundenroster über bestehende
  //    Wahrheiten (organizations.customer_stage/plan + subscription_requests +
  //    org_memberships). Aggregation only — Statuswechsel laufen über die
  //    /subscription-requests/*-Transition-Endpunkte (Step-up + Confirm + Reason).
  router.get("/customers", requireStaff, async (req, res) => {
    const data = await customerOps.listCustomers(pool, {
      stage: req.query.stage || null,
      plan: req.query.plan || null,
      risk: req.query.risk || null,
      search: req.query.search || req.query.q || null,
      suspended: req.query.suspended != null ? req.query.suspended : null,
      limit: req.query.limit,
      offset: req.query.offset
    });
    res.json({ success: true, data });
  });

  router.get("/customers-meta", requireStaff, (_req, res) => {
    res.json({ success: true, data: { ...customerOps.meta(), ...orgSuspension.meta() } });
  });

  router.get("/customers/:orgId", requireStaff, async (req, res) => {
    const data = await customerOps.getCustomerDetail(pool, req.params.orgId);
    if (!data) return res.status(404).json({ success: false, error: { code: "CUSTOMER_NOT_FOUND" } });
    res.json({ success: true, data });
  });

  // ── Betreiber-Kill-Switch (Phase 1, Mig 127): Org-Zugang sperren / freigeben ──
  //    Tarif-AKTIVIERUNG bleibt zahlungsgetrieben (Stripe) — der Staff steuert
  //    NUR diesen Soft-Lock + Monitoring (/customers?suspended=true). Sperre ist
  //    ein schwerer Kundeneingriff => High Step-up; Freigabe => Medium. Beide:
  //    Confirm + Reason (>=10) + Audit. Enforcement liegt in entitlementService.
  router.post("/customers/:orgId/suspend", requireStaff, mfaGuard, requireStepUpHigh, requireConfirmAndReason, async (req, res) => {
    const kind = req.body?.kind || null;
    const result = await orgSuspension.suspendOrgAccess(pool, {
      orgId: req.params.orgId,
      actorUserId: req.sccActorId,
      reason: req.sccReason,
      kind
    });
    if (!result.ok) {
      const code = result.error || "SUSPEND_FAILED";
      const status = code === "ORG_NOT_FOUND" ? 404 : code === "ALREADY_SUSPENDED" ? 409 : 400;
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "customer_operations",
        action: "staff_control.customer.access_suspend",
        entityType: "organization", entityId: req.params.orgId,
        status: "error", reason: req.sccReason, confirmed: true, riskLevel: "high",
        ...auditContextFromReq(req), details: { error: code, kind }
      });
      return res.status(status).json({ success: false, error: { code } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "customer_operations",
      action: "staff_control.customer.access_suspend",
      entityType: "organization", entityId: req.params.orgId,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "high",
      ...auditContextFromReq(req),
      details: { suspended_kind: result.row.suspended_kind, suspended_at: result.row.suspended_at }
    });
    res.json({ success: true, data: result.row });
  });

  router.post("/customers/:orgId/reactivate", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const result = await orgSuspension.reactivateOrgAccess(pool, {
      orgId: req.params.orgId,
      reason: req.sccReason
    });
    if (!result.ok) {
      const code = result.error || "REACTIVATE_FAILED";
      const status = code === "ORG_NOT_FOUND" ? 404 : code === "NOT_SUSPENDED" ? 409 : 400;
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "customer_operations",
        action: "staff_control.customer.access_reactivate",
        entityType: "organization", entityId: req.params.orgId,
        status: "error", reason: req.sccReason, confirmed: true, riskLevel: "medium",
        ...auditContextFromReq(req), details: { error: code }
      });
      return res.status(status).json({ success: false, error: { code } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "customer_operations",
      action: "staff_control.customer.access_reactivate",
      entityType: "organization", entityId: req.params.orgId,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req), details: {}
    });
    res.json({ success: true, data: result.row });
  });

  // ── Billing Overview (Phase D Slice 2): read-only Operator-Sicht auf
  //    Provider-Status (describeBilling) + plattformweite Rechnungs-Kennzahlen.
  //    Aggregation only — keine Mutation, keine Migration. Zero-State garantiert.
  router.get("/billing/overview", requireStaff, async (req, res) => {
    try {
      const data = await staffBilling.getBillingOverview(pool, {
        status: req.query.status || null,
        limit: req.query.limit
      });
      res.json({ success: true, data });
    } catch (err) {
      logger?.error({ err }, "SCC billing/overview error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  router.get("/billing/meta", requireStaff, (_req, res) => {
    res.json({ success: true, data: staffBilling.meta() });
  });

  // ── Mail Center (Phase E/F): read-only Operator-Sicht auf den Mailversand.
  //    Provider-Status (describeEmail) + plattformweite Zustell-/Kanal-Summen
  //    aus subscription_notification_log + letzte Notifications (PII-maskiert).
  //    Aggregation only — keine Mutation, keine Migration, kein Versand.
  router.get("/mail/overview", requireStaff, async (req, res) => {
    try {
      const data = await staffMail.getMailOverview(pool, {
        status: req.query.status || null,
        limit: req.query.limit
      });
      res.json({ success: true, data });
    } catch (err) {
      logger?.error({ err }, "SCC mail/overview error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  router.get("/mail/meta", requireStaff, (_req, res) => {
    res.json({ success: true, data: staffMail.meta() });
  });

  // ── Operativer Incident-Track (SCC Operations) ────────────────────────────
  //    ops_incidents (Mig 121): Operator eroeffnet/quittiert/schliesst Betriebs-
  //    vorfaelle, die ueberdauern. Lesepfad read-only (Summen je status/severity +
  //    Liste); Mutationen mit Step-Up (medium) + Confirm/Reason + Audit je Schritt.
  //    Statusmaschine: open -> acknowledged -> resolved (keine Rueckspruenge).
  router.get("/incidents", requireStaff, async (req, res) => {
    try {
      const data = await staffIncidents.listIncidents(pool, {
        status: req.query.status || null,
        severity: req.query.severity || null,
        limit: req.query.limit
      });
      res.json({ success: true, data });
    } catch (err) {
      logger?.error({ err }, "SCC incidents/list error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  router.get("/incidents/meta", requireStaff, (_req, res) => {
    res.json({ success: true, data: staffIncidents.meta() });
  });

  // Read-only: offene Betriebssignale OHNE Incident (Eroeffnungs-Vorschlaege).
  router.get("/incidents/signals", requireStaff, async (req, res) => {
    try {
      const data = await staffIncidents.listOpenSignals(pool, {
        window_hours: req.query.window_hours,
        limit: req.query.limit
      });
      res.json({ success: true, data });
    } catch (err) {
      logger?.error({ err }, "SCC incidents/signals error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  router.post("/incidents", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const result = await staffIncidents.openIncident(pool, {
      title: req.body?.title,
      severity: req.body?.severity,
      source: req.body?.source,
      signal_code: req.body?.signal_code,
      org_id: req.body?.org_id,
      details: req.body?.details,
      opened_by: req.sccActorId,
      opened_reason: req.sccReason
    });
    if (!result.ok) {
      const code = result.error || "INCIDENT_OPEN_FAILED";
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "operations",
        action: "staff_control.incident.open",
        entityType: "ops_incident", entityId: null,
        status: "error", reason: req.sccReason, confirmed: true, riskLevel: "medium",
        ...auditContextFromReq(req), details: { error: code }
      });
      return res.status(400).json({ success: false, error: { code } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "operations",
      action: "staff_control.incident.open",
      entityType: "ops_incident", entityId: result.row.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req),
      details: { severity: result.row.severity, source: result.row.source, signal_code: result.row.signal_code }
    });
    res.status(201).json({ success: true, data: result.row });
  });

  router.post("/incidents/:id/acknowledge", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const result = await staffIncidents.acknowledgeIncident(pool, req.params.id, { actorId: req.sccActorId });
    if (!result.ok) {
      const code = result.error || "INCIDENT_ACK_FAILED";
      const status = code === "INCIDENT_NOT_FOUND" ? 404 : (code === "INVALID_TRANSITION" || code === "NO_CHANGE") ? 409 : 400;
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "operations",
        action: "staff_control.incident.acknowledge",
        entityType: "ops_incident", entityId: req.params.id,
        status: "error", reason: req.sccReason, confirmed: true, riskLevel: "medium",
        ...auditContextFromReq(req), details: { error: code, current: result.current || null }
      });
      return res.status(status).json({ success: false, error: { code, current: result.current || null } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "operations",
      action: "staff_control.incident.acknowledge",
      entityType: "ops_incident", entityId: req.params.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req), details: { to: "acknowledged" }
    });
    res.json({ success: true, data: result.row });
  });

  router.post("/incidents/:id/resolve", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
    const result = await staffIncidents.resolveIncident(pool, req.params.id, {
      actorId: req.sccActorId,
      note: req.body?.resolution_note
    });
    if (!result.ok) {
      const code = result.error || "INCIDENT_RESOLVE_FAILED";
      const status = code === "INCIDENT_NOT_FOUND" ? 404 : (code === "INVALID_TRANSITION" || code === "NO_CHANGE") ? 409 : 400;
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "operations",
        action: "staff_control.incident.resolve",
        entityType: "ops_incident", entityId: req.params.id,
        status: "error", reason: req.sccReason, confirmed: true, riskLevel: "medium",
        ...auditContextFromReq(req), details: { error: code, current: result.current || null }
      });
      return res.status(status).json({ success: false, error: { code, current: result.current || null } });
    }
    await writeStaffAudit(pool, {
      actorId: req.sccActorId, area: "operations",
      action: "staff_control.incident.resolve",
      entityType: "ops_incident", entityId: req.params.id,
      status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
      ...auditContextFromReq(req), details: { to: "resolved" }
    });
    res.json({ success: true, data: result.row });
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

  router.post("/subscription-requests/:id/transition", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
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

  router.post("/subscription-requests/:id/approve", requireStaff, mfaGuard, requireStepUpHigh, requireConfirmAndReason, async (req, res) => {
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

  router.post("/subscription-requests/:id/reject", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
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

  router.post("/subscription-requests/:id/activate", requireStaff, mfaGuard, requireStepUpHigh, requireConfirmAndReason, async (req, res) => {
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

  router.post("/subscription-requests/:id/assign", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
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

  router.post("/subscription-requests/:id/documents", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
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

  router.post("/subscription-requests/:id/offer", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
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
          expectedEndDate: body.expected_end_date,
          cancellationEffectiveAt: body.cancellation_effective_at
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
  router.post("/strategic-requests/:id/convert-to-subscription", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
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
    res.json({ success: true, data: await staffControlService.loadSupportSnapshot(pool) });
  });

  // ── Support Cases — Liste (filterbar) ───────────────────────
  router.get("/support/cases", requireStaff, async (req, res) => {
    const status   = req.query.status    ? String(req.query.status)    : null;
    const priority = req.query.priority  ? String(req.query.priority)  : null;
    const caseType = req.query.case_type ? String(req.query.case_type) : null;
    const limit    = Math.min(100, Math.max(1, parseInt(String(req.query.limit  || "50"), 10) || 50));
    const offset   = Math.max(0,              parseInt(String(req.query.offset || "0"),  10) || 0);
    try {
      const { rows } = await pool.query(`
        SELECT sc.id, sc.case_number, sc.subject, sc.status, sc.priority, sc.case_type,
               sc.is_escalated, sc.escalation_target,
               sc.sla_resolution_deadline, sc.sla_first_response_deadline,
               sc.sla_resolved_at, sc.sla_first_responded_at,
               sc.created_at, sc.updated_at, sc.closed_at,
               o.name AS org_name,
               NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), '') AS reporter_name,
               sq.name AS queue_name
        FROM   support_cases sc
        LEFT JOIN organizations  o  ON o.id  = sc.reporter_org_id
        LEFT JOIN users          u  ON u.id  = sc.reporter_user_id
        LEFT JOIN support_queues sq ON sq.id = sc.queue_id
        WHERE ($1::text IS NULL OR sc.status    = $1)
          AND ($2::text IS NULL OR sc.priority  = $2)
          AND ($3::text IS NULL OR sc.case_type = $3)
        ORDER BY
          CASE WHEN sc.priority = 'critical' THEN 0
               WHEN sc.priority = 'urgent'   THEN 1
               WHEN sc.priority = 'high'     THEN 2
               WHEN sc.priority = 'normal'   THEN 3
               ELSE 4 END,
          sc.is_escalated DESC,
          sc.created_at DESC
        LIMIT $4 OFFSET $5
      `, [status, priority, caseType, limit, offset]);

      const { rows: cnt } = await pool.query(`
        SELECT COUNT(*)::int AS total FROM support_cases
        WHERE ($1::text IS NULL OR status    = $1)
          AND ($2::text IS NULL OR priority  = $2)
          AND ($3::text IS NULL OR case_type = $3)
      `, [status, priority, caseType]);

      res.json({ success: true, data: { items: rows, total: Number(cnt[0]?.total || 0), limit, offset } });
    } catch (err) {
      logger?.error({ err }, "SCC support/cases list error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  // ── Support Case — Detail mit Notes + Eskalationen ──────────
  router.get("/support/cases/:id", requireStaff, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT sc.*,
               o.name AS org_name,
               NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), '') AS reporter_name,
               sq.name AS queue_name
        FROM   support_cases sc
        LEFT JOIN organizations  o  ON o.id  = sc.reporter_org_id
        LEFT JOIN users          u  ON u.id  = sc.reporter_user_id
        LEFT JOIN support_queues sq ON sq.id = sc.queue_id
        WHERE  sc.id = $1
      `, [req.params.id]);

      if (!rows[0]) {
        return res.status(404).json({ success: false, error: { code: "SUPPORT_CASE_NOT_FOUND" } });
      }

      const { rows: notes } = await pool.query(`
        SELECT scn.id, scn.note_type, scn.body, scn.created_at,
               NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), '') AS author_name,
               u.email AS author_email
        FROM   support_case_notes scn
        LEFT JOIN support_agents sa ON sa.id  = scn.author_agent_id
        LEFT JOIN users          u  ON u.id   = sa.user_id
        WHERE  scn.case_id = $1
        ORDER BY scn.created_at ASC
      `, [req.params.id]);

      const { rows: escalations } = await pool.query(`
        SELECT id, target, priority, summary, reason, status,
               created_at, resolved_at, resolution_note
        FROM   support_escalations
        WHERE  case_id = $1
        ORDER BY created_at DESC
      `, [req.params.id]);

      res.json({ success: true, data: { ...rows[0], notes, escalations } });
    } catch (err) {
      logger?.error({ err }, "SCC support/cases/:id error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
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

  // ── Risk/Trust Drill-Downs ──────────────────────────────────
  router.get("/risk-trust/dsgvo-requests", requireStaff, async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit  || "50"), 10) || 50));
    const offset = Math.max(0,              parseInt(String(req.query.offset || "0"),  10) || 0);
    try {
      const { rows } = await pool.query(`
        SELECT dgr.id, dgr.request_type, dgr.subject_type, dgr.status,
               dgr.notes, dgr.created_at, dgr.completed_at,
               o.name AS org_name,
               NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), '') AS requested_by_name,
               u.email AS requested_by_email
        FROM   data_governance_requests dgr
        LEFT JOIN organizations o ON o.id = dgr.org_id
        LEFT JOIN users         u ON u.id = dgr.requested_by
        WHERE ($1::text IS NULL OR dgr.status = $1)
        ORDER BY dgr.created_at ASC
        LIMIT $2 OFFSET $3
      `, [status, limit, offset]);
      const { rows: cnt } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM data_governance_requests WHERE ($1::text IS NULL OR status = $1)`,
        [status]
      );
      res.json({ success: true, data: { items: rows, total: Number(cnt[0]?.total || 0), limit, offset } });
    } catch (err) {
      logger?.error({ err }, "SCC risk-trust/dsgvo-requests error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  router.get("/risk-trust/compliance-docs", requireStaff, async (req, res) => {
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit  || "50"), 10) || 50));
    const offset = Math.max(0,              parseInt(String(req.query.offset || "0"),  10) || 0);
    try {
      const { rows } = await pool.query(`
        SELECT cd.id, cd.doc_type, cd.doc_name, cd.status,
               cd.valid_from, cd.valid_until,
               o.name AS org_name
        FROM   compliance_documents cd
        LEFT JOIN organizations o ON o.id = cd.org_id
        WHERE  cd.valid_until IS NOT NULL
          AND  cd.valid_until < NOW() + INTERVAL '30 days'
        ORDER BY cd.valid_until ASC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      const { rows: cnt } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM compliance_documents
         WHERE valid_until IS NOT NULL AND valid_until < NOW() + INTERVAL '30 days'`
      );
      res.json({ success: true, data: { items: rows, total: Number(cnt[0]?.total || 0), limit, offset } });
    } catch (err) {
      logger?.error({ err }, "SCC risk-trust/compliance-docs error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
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
  // SCC WAVE 02: Critical-Step-up + Typed Confirmation für kritische Feature-Flags
  router.post("/platform/feature-flags", requireStaff, mfaGuard, requireStepUpCritical, requireConfirmAndReason, async (req, res) => {
    const { flag_key, enabled, risk_level_override } = req.body || {};
    if (!flag_key || typeof enabled !== "boolean") {
      return res.status(400).json({ success: false, error: { code: "INVALID_FLAG_PAYLOAD" } });
    }
    const { rows: existing } = await pool.query(
      "SELECT flag_key, risk_level FROM staff_control_feature_flags WHERE flag_key = $1", [flag_key]
    );
    if (!existing[0]) return res.status(404).json({ success: false, error: { code: "FLAG_NOT_FOUND" } });
    const riskLevel = risk_level_override || existing[0].risk_level || "medium";

    // Typed Confirmation für critical und high Flags (WAVE 02)
    if (riskLevel === "critical" || riskLevel === "high") {
      const expected = computeFeatureFlagConfirmation(flag_key, enabled);
      const provided = String(req.body?.typed_confirmation || "").trim();
      if (!provided || provided !== expected) {
        return res.status(400).json({
          success: false,
          error: {
            code: "SCC_TYPED_CONFIRMATION_REQUIRED",
            message: `Tippe zur Bestätigung genau ein: "${expected}"`,
            expected_hint: expected
          }
        });
      }
    }

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
      ...auditContextFromReq(req), details: { flag_key, enabled, typed_confirmation_provided: riskLevel === "critical" || riskLevel === "high" }
    });
    res.json({ success: true, data: { flag_key, enabled } });
  });

  router.post("/hetzner/action", requireStaff, mfaGuard, requireStepUpHigh, requireConfirmAndReason, async (req, res) => {
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

  router.post("/automation/run", requireStaff, mfaGuard, requireStepUpHigh, requireConfirmAndReason, async (req, res) => {
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

  router.post("/audit-decisions", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
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

  // ── Entscheidung zurücksetzen (SCC WAVE 10) ──────────────────
  // Nur für reversible Entscheidungen, die noch nicht zurückgesetzt wurden.
  // Step-up + Confirm + Reason Pflicht. Schreibt Audit-Eintrag.
  router.patch("/audit-decisions/:id/revert", requireStaff, mfaGuard, requireStepUp, requireConfirmAndReason, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, title, area, reversible, reverted_at FROM staff_control_decisions WHERE id = $1`,
        [req.params.id]
      );
      if (!rows[0]) {
        return res.status(404).json({ success: false, error: { code: "DECISION_NOT_FOUND" } });
      }
      const dec = rows[0];
      if (!dec.reversible) {
        return res.status(409).json({ success: false, error: { code: "DECISION_NOT_REVERSIBLE" } });
      }
      if (dec.reverted_at) {
        return res.status(409).json({ success: false, error: { code: "DECISION_ALREADY_REVERTED" } });
      }
      const { rows: updated } = await pool.query(
        `UPDATE staff_control_decisions SET reverted_at = NOW() WHERE id = $1 RETURNING reverted_at`,
        [req.params.id]
      );
      await writeStaffAudit(pool, {
        actorId: req.sccActorId, area: "audit_decisions",
        action: "staff_control.decision.reverted",
        entityType: "decision", entityId: req.params.id, status: "ok",
        reason: req.sccReason, confirmed: true, riskLevel: "medium",
        ...auditContextFromReq(req),
        details: { area: dec.area, title: dec.title }
      });
      res.json({ success: true, data: { id: req.params.id, reverted_at: updated[0].reverted_at } });
    } catch (err) {
      logger?.error({ err }, "SCC audit-decisions revert error");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  // ── Marketplace Visibility Center — M-07 (2026-05-30) ───────
  // Alle Aktionen erfordern Staff-Zugang + Step-up + Confirm+Reason.

  /** Snapshot: Kennzahlen pro Status-Kategorie */
  router.get("/marketplace-visibility/snapshot", requireStaff, async (req, res) => {
    try {
      const [pending, approved, moderationQueue, pendingBounties] = await Promise.all([
        visSvc.getPendingVisibilitySubmissions(pool, { limit: 5 }),
        visSvc.getApprovedPublicOrgIds(pool, { limit: 1 }),
        getPendingModerationQueue(pool, { limit: 5 }),
        bountySvc.getPendingBounties(pool, { limit: 5 })
      ]);
      res.json({ success: true, data: {
        pending_submissions: pending.length,
        approved_profiles:   approved.length,
        pending_moderation:  moderationQueue.length,
        pending_bounties:    pendingBounties.length,
        recent_pending:      pending,
        recent_moderation:   moderationQueue,
        recent_bounties:     pendingBounties
      }});
    } catch (err) {
      logger?.error({ err }, "SCC marketplace-visibility snapshot");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  /** Liste: eingereichte Profile (pending review) */
  router.get("/marketplace-visibility/pending", requireStaff, async (req, res) => {
    try {
      const data = await visSvc.getPendingVisibilitySubmissions(pool, { limit: 100 });
      res.json({ success: true, data });
    } catch (err) {
      logger?.error({ err }, "SCC marketplace-visibility pending");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  /** Aktion: Profil-Sichtbarkeit genehmigen */
  router.post("/marketplace-visibility/:orgId/approve",
    requireStaff, requireStepUp, requireConfirmAndReason,
    async (req, res) => {
      try {
        const result = await visSvc.approveVisibility(pool, req.params.orgId, req.sccActorId);
        if (!result.ok) return res.status(400).json({ success: false, error: { code: result.reason } });
        await writeStaffAudit(pool, {
          actorId: req.sccActorId, area: "marketplace_visibility",
          action: "staff.profile_visibility.approved",
          entityType: "profile_visibility", entityId: req.params.orgId,
          status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
          ...auditContextFromReq(req), details: {}
        });
        res.json({ success: true, data: result.settings });
      } catch (err) {
        logger?.error({ err }, "SCC marketplace-visibility approve");
        res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
      }
    }
  );

  /** Aktion: Profil-Sichtbarkeit ablehnen */
  router.post("/marketplace-visibility/:orgId/reject",
    requireStaff, requireStepUp, requireConfirmAndReason,
    async (req, res) => {
      try {
        const reason = String(req.body?.rejection_reason || req.sccReason || "");
        const result = await visSvc.rejectVisibility(pool, req.params.orgId, req.sccActorId, reason);
        if (!result.ok) return res.status(400).json({ success: false, error: { code: result.reason } });
        await writeStaffAudit(pool, {
          actorId: req.sccActorId, area: "marketplace_visibility",
          action: "staff.profile_visibility.rejected",
          entityType: "profile_visibility", entityId: req.params.orgId,
          status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
          ...auditContextFromReq(req), details: { rejection_reason: reason }
        });
        res.json({ success: true, data: result.settings });
      } catch (err) {
        logger?.error({ err }, "SCC marketplace-visibility reject");
        res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
      }
    }
  );

  /** Aktion: Profil suspendieren (schwerer Eingriff — High Step-up) */
  router.post("/marketplace-visibility/:orgId/suspend",
    requireStaff, requireStepUpHigh, requireConfirmAndReason,
    async (req, res) => {
      try {
        const reason = String(req.body?.suspension_reason || req.sccReason || "");
        const result = await visSvc.suspendVisibility(pool, req.params.orgId, req.sccActorId, reason);
        if (!result.ok) return res.status(400).json({ success: false, error: { code: result.reason } });
        await writeStaffAudit(pool, {
          actorId: req.sccActorId, area: "marketplace_visibility",
          action: "staff.profile_visibility.suspended",
          entityType: "profile_visibility", entityId: req.params.orgId,
          status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "high",
          ...auditContextFromReq(req), details: { suspension_reason: reason }
        });
        res.json({ success: true, data: result.settings });
      } catch (err) {
        logger?.error({ err }, "SCC marketplace-visibility suspend");
        res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
      }
    }
  );

  /** Liste: Ratings in Moderation-Queue (pending + flagged) */
  router.get("/marketplace-visibility/moderation-queue", requireStaff, async (req, res) => {
    try {
      const data = await getPendingModerationQueue(pool, { limit: 100 });
      res.json({ success: true, data });
    } catch (err) {
      logger?.error({ err }, "SCC marketplace-visibility moderation-queue");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  /** Aktion: Rating genehmigen */
  router.post("/marketplace-visibility/ratings/:id/approve",
    requireStaff, requireStepUp, requireConfirmAndReason,
    async (req, res) => {
      try {
        const result = await approveRating(pool, req.params.id, req.sccActorId);
        if (!result.ok) return res.status(400).json({ success: false, error: { code: result.reason } });
        await writeStaffAudit(pool, {
          actorId: req.sccActorId, area: "marketplace_visibility",
          action: "staff.rating_moderation.approved",
          entityType: "rating", entityId: req.params.id,
          status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
          ...auditContextFromReq(req), details: {}
        });
        res.json({ success: true });
      } catch (err) {
        logger?.error({ err }, "SCC rating moderation approve");
        res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
      }
    }
  );

  /** Aktion: Rating ablehnen */
  router.post("/marketplace-visibility/ratings/:id/reject",
    requireStaff, requireStepUp, requireConfirmAndReason,
    async (req, res) => {
      try {
        const reason = String(req.body?.rejection_reason || req.sccReason || "");
        const result = await rejectRating(pool, req.params.id, req.sccActorId, reason);
        if (!result.ok) return res.status(400).json({ success: false, error: { code: result.reason } });
        await writeStaffAudit(pool, {
          actorId: req.sccActorId, area: "marketplace_visibility",
          action: "staff.rating_moderation.rejected",
          entityType: "rating", entityId: req.params.id,
          status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
          ...auditContextFromReq(req), details: { rejection_reason: reason }
        });
        res.json({ success: true });
      } catch (err) {
        logger?.error({ err }, "SCC rating moderation reject");
        res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
      }
    }
  );

  /* ── Dokumenten-Tresor-Monitoring (org-uebergreifend, read-only) ─── */
  router.get("/document-vault/overview", requireStaff, async (req, res) => {
    try {
      const svc = await import("../services/staffDocumentVaultService.js");
      const data = await svc.getVaultOverview(pool, { limit: parseInt(req.query.limit, 10) || 50 });
      res.json({ success: true, data });
    } catch (err) {
      logger?.error({ err }, "SCC document-vault overview");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  /* ── Data Governance / DSGVO (org-uebergreifende Read-Only-Sicht fuer Staff) ─── */
  router.get("/data-governance/requests", requireStaff, async (req, res) => {
    try {
      const svc = await import("../services/staffDataGovernanceService.js");
      const limit = parseInt(req.query.limit, 10) || 100;
      const status = req.query.status ? String(req.query.status) : null;
      const [requests, counts] = await Promise.all([
        svc.listGovernanceRequests(pool, { limit, status }),
        svc.getGovernanceStatusCounts(pool),
      ]);
      res.json({ success: true, data: { requests, total: requests.length, counts } });
    } catch (err) {
      logger?.error({ err }, "SCC data-governance requests");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  router.get("/data-governance/requests.csv", requireStaff, async (req, res) => {
    try {
      const svc = await import("../services/staffDataGovernanceService.js");
      const rows = await svc.listGovernanceRequestsForCsv(pool, { limit: 5000 });
      const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const out = [["id", "org", "typ", "subjekt", "status", "anforderer", "erstellt", "abgeschlossen"].join(",")];
      for (const r of rows) {
        out.push([r.id, r.org_name, r.request_type, r.subject_type, r.status, r.requester_email, r.created_at, r.completed_at].map(esc).join(","));
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="dsgvo-anfragen.csv"');
      res.send(out.join("\n"));
      logger?.info({ actor: req.sccActorId, rows: rows.length }, "SCC DSGVO CSV export");
    } catch (err) {
      logger?.error({ err }, "SCC data-governance csv");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  /** Liste: Bounties die auf Staff-Aktion warten */
  router.get("/marketplace-visibility/bounties", requireStaff, async (req, res) => {
    try {
      const data = await bountySvc.getPendingBounties(pool, { limit: 100 });
      res.json({ success: true, data });
    } catch (err) {
      logger?.error({ err }, "SCC marketplace-visibility bounties");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  /** Aktion: Bounty genehmigen */
  router.post("/marketplace-visibility/bounties/:id/approve",
    requireStaff, requireStepUp, requireConfirmAndReason,
    async (req, res) => {
      try {
        const expires_at = req.body?.expires_at || null;
        const staff_note = req.body?.staff_note || null;
        const result = await bountySvc.approveBounty(pool, req.params.id, req.sccActorId, { expiresAt: expires_at, staffNote: staff_note });
        if (!result.ok) return res.status(400).json({ success: false, error: { code: result.reason } });
        await writeStaffAudit(pool, {
          actorId: req.sccActorId, area: "marketplace_visibility",
          action: "staff.bounty.approved",
          entityType: "profile_bounty", entityId: req.params.id,
          status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
          ...auditContextFromReq(req), details: { expires_at, staff_note }
        });
        res.json({ success: true, data: result.bounty });
      } catch (err) {
        logger?.error({ err }, "SCC bounty approve");
        res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
      }
    }
  );

  /** Aktion: Bounty aktivieren (approved → active, Step-up High) */
  router.post("/marketplace-visibility/bounties/:id/activate",
    requireStaff, requireStepUpHigh, requireConfirmAndReason,
    async (req, res) => {
      try {
        const result = await bountySvc.activateBounty(pool, req.params.id, req.sccActorId);
        if (!result.ok) return res.status(400).json({ success: false, error: { code: result.reason } });
        await writeStaffAudit(pool, {
          actorId: req.sccActorId, area: "marketplace_visibility",
          action: "staff.bounty.activated",
          entityType: "profile_bounty", entityId: req.params.id,
          status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "high",
          ...auditContextFromReq(req), details: {}
        });
        res.json({ success: true, data: result.bounty });
      } catch (err) {
        logger?.error({ err }, "SCC bounty activate");
        res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
      }
    }
  );

  /** Aktion: Bounty ablehnen */
  router.post("/marketplace-visibility/bounties/:id/reject",
    requireStaff, requireStepUp, requireConfirmAndReason,
    async (req, res) => {
      try {
        const reason = String(req.body?.rejection_reason || req.sccReason || "");
        const result = await bountySvc.rejectBounty(pool, req.params.id, req.sccActorId, reason);
        if (!result.ok) return res.status(400).json({ success: false, error: { code: result.reason } });
        await writeStaffAudit(pool, {
          actorId: req.sccActorId, area: "marketplace_visibility",
          action: "staff.bounty.rejected",
          entityType: "profile_bounty", entityId: req.params.id,
          status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
          ...auditContextFromReq(req), details: { rejection_reason: reason }
        });
        res.json({ success: true, data: result.bounty });
      } catch (err) {
        logger?.error({ err }, "SCC bounty reject");
        res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
      }
    }
  );

  /* ── M-11: Abuse Reports ─────────────────────────────── */

  /** Liste: offene Abuse-Reports (status=pending) */
  router.get("/marketplace-visibility/abuse-reports", requireStaff, async (req, res) => {
    try {
      const data = await visSvc.getPendingAbuseReports(pool, { limit: 100 });
      res.json({ success: true, data });
    } catch (err) {
      logger?.error({ err }, "SCC marketplace-visibility abuse-reports");
      res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
    }
  });

  /** Aktion: Abuse-Report als erledigt markieren */
  router.post("/marketplace-visibility/abuse-reports/:id/resolve",
    requireStaff, requireStepUp, requireConfirmAndReason,
    async (req, res) => {
      try {
        const result = await visSvc.resolveAbuseReport(pool, req.params.id, "resolved", req.sccActorId);
        if (!result.ok) return res.status(400).json({ success: false, error: { code: result.reason } });
        await writeStaffAudit(pool, {
          actorId: req.sccActorId, area: "marketplace_visibility",
          action: "staff.abuse_report.resolved",
          entityType: "profile_abuse_report", entityId: req.params.id,
          status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "medium",
          ...auditContextFromReq(req), details: {}
        });
        res.json({ success: true });
      } catch (err) {
        logger?.error({ err }, "SCC abuse-report resolve");
        res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
      }
    }
  );

  /** Aktion: Abuse-Report als unbegründet abweisen */
  router.post("/marketplace-visibility/abuse-reports/:id/dismiss",
    requireStaff, requireStepUp, requireConfirmAndReason,
    async (req, res) => {
      try {
        const result = await visSvc.resolveAbuseReport(pool, req.params.id, "dismissed", req.sccActorId);
        if (!result.ok) return res.status(400).json({ success: false, error: { code: result.reason } });
        await writeStaffAudit(pool, {
          actorId: req.sccActorId, area: "marketplace_visibility",
          action: "staff.abuse_report.dismissed",
          entityType: "profile_abuse_report", entityId: req.params.id,
          status: "ok", reason: req.sccReason, confirmed: true, riskLevel: "low",
          ...auditContextFromReq(req), details: {}
        });
        res.json({ success: true });
      } catch (err) {
        logger?.error({ err }, "SCC abuse-report dismiss");
        res.status(500).json({ success: false, error: { code: "SCC_INTERNAL_ERROR" } });
      }
    }
  );

  return router;
}

/** Separater Login-Router (vor dem Access-Guard gemountet). */
export function createStaffControlAuthRouter(deps) {
  const { pool, logger, staffLoginLimiter } = deps;
  const router = Router();

  // SCC WAVE 01: Rate Limit auf Login — 5 Versuche / 15 Min in Production
  // Limiter als optionale Middleware-Chain — eine einzige router.post-Registrierung
  // verhindert False-Positive im Audit-Coverage-Check.
  const loginMiddleware = staffLoginLimiter ? [staffLoginLimiter] : [];
  router.post("/auth/login", ...loginMiddleware, async (req, res) => {
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
        // SCC WAVE 01: Failed-Login-Audit auch für unbekannte Staff-Adressen
        writeStaffAudit(pool, {
          actorId: null, area: "auth", action: "staff_control.auth.login_failed",
          status: "error", confirmed: false, riskLevel: "medium",
          ...auditContextFromReq(req),
          details: { reason: "user_not_in_staff", email_hint: email.slice(0, 3) + "***" }
        }).catch((e) => logger?.warn?.({ err: e }, "SCC failed-login audit error"));
        return res.status(401).json({ success: false, error: { code: "SCC_LOGIN_FAILED" } });
      }
      const ok = await bcrypt.default.compare(password, user.password_hash || "");
      if (!ok) {
        // SCC WAVE 01: Failed-Login-Audit für falsche Passwörter
        writeStaffAudit(pool, {
          actorId: user.id, area: "auth", action: "staff_control.auth.login_failed",
          status: "error", confirmed: false, riskLevel: "medium",
          ...auditContextFromReq(req),
          details: { reason: "wrong_password" }
        }).catch((e) => logger?.warn?.({ err: e }, "SCC failed-login audit error"));
        return res.status(401).json({ success: false, error: { code: "SCC_LOGIN_FAILED" } });
      }

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
        // Fire-and-forget: SCC login audit (best effort — response already sent)
        writeStaffAudit(pool, {
          actorId: user.id, area: "auth", action: "staff_control.auth.login",
          status: "ok", confirmed: true, riskLevel: "medium",
          ...auditContextFromReq(req), details: { email: user.email }
        }).catch((e) => logger?.warn?.({ err: e }, "SCC login audit failed"));
      });
    } catch (err) {
      logger?.error({ err }, "SCC login error");
      res.status(500).json({ success: false, error: { code: "SCC_LOGIN_ERROR" } });
    }
  });

  return router;
}
