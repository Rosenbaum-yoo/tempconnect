/**
 * Approvals REST-Router: list pending, approve, reject, my-pending aggregation.
 */
import { z } from "zod";
import { Router } from "express";
import * as approvalService from "../services/approvalService.js";
import { requirePermission } from "../middleware/rbac.js";

const decisionSchema = z.object({
  reason: z.string().max(2000).optional().nullable()
});

/* ── Status → Badge-Klasse + deutscher Text (shared mapping) ── */
const STATUS_MAP = {
  // approval_requests
  pending:               { badge: "pending",     label: "Ausstehend" },
  approved:              { badge: "approved",    label: "Freigegeben" },
  rejected:              { badge: "rejected",    label: "Abgelehnt" },
  expired:               { badge: "expired",     label: "Abgelaufen" },
  // submissions
  submitted:             { badge: "pending",     label: "Eingereicht" },
  under_review:          { badge: "in-review",   label: "In Prüfung" },
  needs_correction:      { badge: "correction",  label: "Korrektur nötig" },
  approved_internal:     { badge: "approved",    label: "Intern freigegeben" },
  sent_to_customer:      { badge: "customer",    label: "Beim Kunden" },
  customer_confirmed:    { badge: "approved",    label: "Kunde bestätigt" },
  customer_rejected:     { badge: "correction",  label: "Kunde abgelehnt" },
  posted_to_timesheet:   { badge: "completed",   label: "Abgerechnet" },
  // requests
  SENT:                  { badge: "pending",     label: "Gesendet" },
  ACCEPTED:              { badge: "approved",    label: "Angenommen" },
  DECLINED:              { badge: "rejected",    label: "Abgelehnt" },
  FILLED:                { badge: "completed",   label: "Besetzt" },
  FINALIZED:             { badge: "completed",   label: "Abgeschlossen" },
  CANCELED:              { badge: "expired",     label: "Storniert" },
  // worker assignment confirmation
  pending_confirmation:  { badge: "pending",     label: "Bestätigung ausstehend" },
  worker_confirmed:      { badge: "approved",    label: "Bestätigt" },
  worker_declined:       { badge: "rejected",    label: "Abgelehnt" },
  auto_confirmed:        { badge: "approved",    label: "Auto-bestätigt" }
};

function mapStatus(raw) {
  return STATUS_MAP[raw] || { badge: "pending", label: raw };
}

export function createApprovalsRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  /* ────────────────────────────────────────────────────────────
   * GET /approvals/my-pending — unified pending-actions for current user.
   * Aggregates: approval_requests, submissions, requests, worker assignments.
   * ──────────────────────────────────────────────────────────── */
  router.get("/approvals/my-pending", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const orgId  = req.orgId || null;
      const role   = req.orgRole || null;
      const items  = [];

      // 1) Generic approval_requests — for users with approval.decide permission
      //    (owners, admins, program_managers in same org)
      const approvalRoles = ["owner", "admin", "program_manager"];
      if (orgId && approvalRoles.includes(role)) {
        const { rows: arRows } = await pool.query(
          `SELECT ar.id, ar.entity_type, ar.entity_id, ar.status, ar.reason,
                  ar.created_at, ar.expires_at,
                  u.email AS requester_email, u.company_name AS requester_name
           FROM approval_requests ar
           LEFT JOIN users u ON u.id = ar.requested_by
           WHERE ar.status = 'pending' AND ar.org_id = $1
           ORDER BY ar.created_at ASC LIMIT 50`,
          [orgId]
        );
        for (const r of arRows) {
          const sm = mapStatus(r.status);
          items.push({
            type: "approval_request",
            id: r.id,
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            title: `${r.entity_type === "requisition" ? "Requisition" : r.entity_type === "offer" ? "Angebot" : r.entity_type} Freigabe`,
            subtitle: r.requester_name || r.requester_email || "—",
            status: r.status,
            badge: sm.badge,
            status_label: sm.label,
            reason: r.reason,
            link_path: r.entity_type === "requisition" ? "/public/requisitions.html" : "/public/approvals.html",
            created_at: r.created_at,
            expires_at: r.expires_at,
            can_decide: true,
            icon: "📋"
          });
        }
      }

      // 2) Submissions awaiting review (for dispatchers / agency admins in supplier org)
      const submissionRoles = ["owner", "admin", "dispatcher", "recruiter"];
      if (orgId && submissionRoles.includes(role)) {
        const { rows: subRows } = await pool.query(
          `SELECT wts.id, wts.status, wts.total_hours, wts.week_start, wts.week_end,
                  wts.created_at, wts.worker_comment,
                  u.email AS worker_email, u.company_name AS worker_name
           FROM worker_time_submissions wts
           LEFT JOIN users u ON u.id = wts.worker_user_id
           WHERE wts.supplier_org_id = $1
             AND wts.status IN ('submitted', 'under_review')
           ORDER BY wts.created_at ASC LIMIT 50`,
          [orgId]
        );
        for (const r of subRows) {
          const sm = mapStatus(r.status);
          items.push({
            type: "submission",
            id: r.id,
            entity_type: "worker_time_submission",
            entity_id: r.id,
            title: `Zeitnachweis ${r.week_start || ""} – ${r.week_end || ""}`,
            subtitle: r.worker_name || r.worker_email || "—",
            status: r.status,
            badge: sm.badge,
            status_label: sm.label,
            total_hours: r.total_hours,
            link_path: "/public/worker-submissions-review.html",
            created_at: r.created_at,
            can_decide: true,
            icon: "⏱️"
          });
        }
      }

      // 3) Incoming requests (SENT status, user is receiver)
      {
        const { rows: reqRows } = await pool.query(
          `SELECT r.id, r.status, r.role, r.quantity, r.location_text, r.region,
                  r.start_date, r.created_at, r.sla_status, r.sla_respond_by,
                  u.email AS requester_email, u.company_name AS requester_name
           FROM requests r
           LEFT JOIN users u ON u.id = r.requester_id
           WHERE r.receiver_id = $1 AND r.status = 'SENT'
           ORDER BY r.created_at ASC LIMIT 50`,
          [userId]
        );
        for (const r of reqRows) {
          const sm = mapStatus(r.status);
          const slaUrgent = r.sla_status === "BREACHED" || (r.sla_respond_by && new Date(r.sla_respond_by) < new Date());
          items.push({
            type: "request",
            id: r.id,
            entity_type: "request",
            entity_id: r.id,
            title: `Anfrage: ${r.role || "Personalanfrage"} ${r.quantity ? "(" + r.quantity + "x)" : ""}`.trim(),
            subtitle: r.requester_name || r.requester_email || "—",
            status: r.status,
            badge: slaUrgent ? "rejected" : sm.badge,
            status_label: slaUrgent ? "SLA-Bruch" : sm.label,
            sla_status: r.sla_status,
            link_path: "/public/agency_inbox.html",
            created_at: r.created_at,
            can_decide: true,
            icon: "📨"
          });
        }
      }

      // 4) Worker assignment confirmations (for workers)
      {
        const { rows: walRows } = await pool.query(
          `SELECT wal.id, wal.worker_confirmation_status, wal.start_date, wal.end_date,
                  wal.client_name, wal.contact_name, wal.created_at,
                  a.title AS assignment_title
           FROM worker_assignment_links wal
           LEFT JOIN assignments a ON a.id = wal.assignment_id
           WHERE wal.worker_user_id = $1
             AND wal.worker_confirmation_status = 'pending_confirmation'
             AND wal.is_active = true
           ORDER BY wal.created_at ASC LIMIT 50`,
          [userId]
        );
        for (const r of walRows) {
          const sm = mapStatus(r.worker_confirmation_status);
          items.push({
            type: "assignment_confirmation",
            id: r.id,
            entity_type: "worker_assignment_link",
            entity_id: r.id,
            title: r.assignment_title || `Einsatz ab ${r.start_date || "—"}`,
            subtitle: r.client_name || r.contact_name || "—",
            status: r.worker_confirmation_status,
            badge: sm.badge,
            status_label: sm.label,
            link_path: "/public/einsatzportal-auftraege.html",
            created_at: r.created_at,
            can_decide: true,
            icon: "✋"
          });
        }
      }

      // Sort all by created_at ascending (oldest first = most urgent)
      items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      // KPI summary
      const summary = {
        total: items.length,
        approval_requests: items.filter(i => i.type === "approval_request").length,
        submissions: items.filter(i => i.type === "submission").length,
        requests: items.filter(i => i.type === "request").length,
        assignments: items.filter(i => i.type === "assignment_confirmation").length
      };

      res.json({ items, summary });
    } catch (err) {
      logger.error({ err: err.message }, "approvals/my-pending error");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Status mapping endpoint (for frontend badge rendering) ── */
  router.get("/approvals/status-map", requireAuth, (req, res) => {
    res.json(STATUS_MAP);
  });

  router.get("/approvals", requireAuth, requirePermission("approval.view", { pool, logger }), async (req, res) => {
    const items = await approvalService.listPendingApprovals(pool, {
      org_id: req.orgId || null, // F-007 fix: server-resolved org only
      entity_type: req.query.entity_type || null,
      limit: parseInt(req.query.limit, 10) || 50
    });
    res.json({ items, total: items.length });
  });

  router.get("/approvals/:id", requireAuth, requirePermission("approval.view", { pool, logger }), async (req, res) => {
    const approval = await approvalService.getApprovalById(pool, req.params.id);
    if (!approval) return res.status(404).json({ error: "NOT_FOUND" });
    // F-007 fix: org-boundary check
    if (req.orgId && approval.org_id && approval.org_id !== req.orgId) {
      return res.status(403).json({ error: "ORG_BOUNDARY_VIOLATION" });
    }
    res.json(approval);
  });

  router.post("/approvals/:id/approve", requireAuth, requirePermission("approval.decide", { pool, logger }), async (req, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const result = await approvalService.approveEntity(pool, req.params.id, req.session.userId, parsed.data.reason);
    if (!result) return res.status(404).json({ error: "NOT_FOUND_OR_ALREADY_DECIDED" });
    res.locals.audit = { action: "approval.approve", entity_type: "approval_request", entity_id: req.params.id, details: { reason: parsed.data.reason }, old_values: { status: "pending" }, new_values: { status: "approved" } };
    res.json(result);
  });

  router.post("/approvals/:id/reject", requireAuth, requirePermission("approval.decide", { pool, logger }), async (req, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });
    const result = await approvalService.rejectEntity(pool, req.params.id, req.session.userId, parsed.data.reason);
    if (!result) return res.status(404).json({ error: "NOT_FOUND_OR_ALREADY_DECIDED" });
    res.locals.audit = { action: "approval.reject", entity_type: "approval_request", entity_id: req.params.id, details: { reason: parsed.data.reason }, old_values: { status: "pending" }, new_values: { status: "rejected" } };
    res.json(result);
  });

  router.get("/approvals/history/:entityType/:entityId", requireAuth, requirePermission("approval.view", { pool, logger }), async (req, res) => {
    const history = await approvalService.getApprovalHistory(pool, req.params.entityType, req.params.entityId);
    res.json({ items: history });
  });

  return router;
}
