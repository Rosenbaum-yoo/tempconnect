import { Router } from "express";
import { z } from "zod";
import { requireInternalPermission } from "../middleware/internalAccess.js";
import * as internalControlCenterService from "../services/internalControlCenterService.js";
import * as productAnalyticsService from "../services/productAnalyticsService.js";

const supportActionSchema = z.object({
  reason: z.string().min(8).max(500),
  confirm: z.literal(true)
});

export function createInternalControlCenterRouter(deps) {
  const { pool, logger, requireAuth, sendMail, config } = deps;
  const router = Router();
  const guard = (permission) => requireInternalPermission(permission, { pool, logger });

  router.get("/internal-control/me", requireAuth, async (req, res) => {
    const access = await internalControlCenterService.getInternalAccessSnapshot(pool, req.session.userId);
    res.json({ success: true, data: access });
  });

  router.get("/internal-control/platform/dashboard", requireAuth, guard("internal.platform.read"), async (_req, res) => {
    const metrics = await internalControlCenterService.getPlatformDashboard(pool);
    res.json({ success: true, data: metrics });
  });

  router.get("/internal-control/platform/organizations", requireAuth, guard("internal.platform.read"), async (req, res) => {
    const items = await internalControlCenterService.listOrganizations(pool, {
      q: req.query.q || "",
      limit: req.query.limit,
      offset: req.query.offset
    });
    res.json({ success: true, data: { items } });
  });

  router.get("/internal-control/platform/organizations/:orgId", requireAuth, guard("internal.platform.read"), async (req, res) => {
    const result = await internalControlCenterService.getOrganizationDetail(pool, String(req.params.orgId || ""));
    if (!result) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
    res.json({ success: true, data: result });
  });

  router.get("/internal-control/platform/product-insights/overview", requireAuth, guard("internal.platform.read"), async (req, res) => {
    const data = await productAnalyticsService.getOverview(pool, {
      days: req.query.days,
      segment: req.query.segment || null
    });
    res.json({ success: true, data });
  });

  router.get("/internal-control/platform/product-insights/pages", requireAuth, guard("internal.platform.read"), async (req, res) => {
    const items = await productAnalyticsService.getPageInsights(pool, {
      days: req.query.days,
      segment: req.query.segment || null
    });
    res.json({ success: true, data: { items } });
  });

  router.get("/internal-control/platform/product-insights/funnels/:key", requireAuth, guard("internal.platform.read"), async (req, res) => {
    try {
      const items = await productAnalyticsService.getFunnel(
        pool,
        String(req.params.key || ""),
        req.query.days,
        req.query.segment || null
      );
      res.json({ success: true, data: { key: req.params.key, items } });
    } catch {
      res.status(400).json({ success: false, error: { code: "UNKNOWN_FUNNEL" } });
    }
  });

  router.get("/internal-control/platform/product-insights/dropoff", requireAuth, guard("internal.platform.read"), async (req, res) => {
    const items = await productAnalyticsService.getDropoffByStep(pool, {
      days: req.query.days,
      segment: req.query.segment || null,
      flow: req.query.flow || null
    });
    res.json({ success: true, data: { items } });
  });

  router.get("/internal-control/platform/product-insights/session-to-completion", requireAuth, guard("internal.platform.read"), async (req, res) => {
    const items = await productAnalyticsService.getSessionToCompletionTime(pool, {
      days: req.query.days,
      segment: req.query.segment || null,
      flow: req.query.flow || null
    });
    res.json({ success: true, data: { items } });
  });

  router.get("/internal-control/platform/product-insights/role-conversion", requireAuth, guard("internal.platform.read"), async (req, res) => {
    const items = await productAnalyticsService.getRoleConversionComparison(pool, {
      days: req.query.days,
      segment: req.query.segment || null,
      flow: req.query.flow || null
    });
    res.json({ success: true, data: { items } });
  });

  router.get("/internal-control/platform/product-insights/dashboard-presets", requireAuth, guard("internal.platform.read"), (_req, res) => {
    res.json({ success: true, data: { items: productAnalyticsService.getDashboardPresets() } });
  });

  router.get("/internal-control/support/search", requireAuth, guard("internal.support.read"), async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ success: false, error: { code: "QUERY_REQUIRED" } });
    const items = await internalControlCenterService.searchSupportCustomers(pool, q, req.query.limit);
    res.json({ success: true, data: { items } });
  });

  router.post("/internal-control/support/users/:userId/resend-verification", requireAuth, guard("internal.support.execute"), async (req, res) => {
    const parsed = supportActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION", details: parsed.error.issues } });
    }
    const result = await internalControlCenterService.resendVerificationForUser(
      pool,
      String(req.params.userId || ""),
      config.BASE_URL,
      sendMail
    );
    if (result.code === "NOT_FOUND") return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
    if (result.code === "ALREADY_VERIFIED") return res.status(409).json({ success: false, error: { code: "ALREADY_VERIFIED" } });

    res.locals.audit = {
      action: "internal_control.support.resend_verification",
      entity_type: "user",
      entity_id: String(req.params.userId || ""),
      action_type: "SECURITY",
      details: {
        internal_area: "support",
        reason: parsed.data.reason,
        target_email: result.email
      }
    };
    res.json({ success: true, data: { sent: true } });
  });

  router.get("/internal-control/operations/overview", requireAuth, guard("internal.operations.read"), async (_req, res) => {
    const [plans, pendingApprovals] = await Promise.all([
      pool.query("SELECT plan, COUNT(*)::int AS count FROM organizations GROUP BY plan ORDER BY plan ASC"),
      pool.query("SELECT COUNT(*)::int AS total FROM approval_requests WHERE status = 'pending'")
    ]);
    res.json({
      success: true,
      data: {
        plans: plans.rows,
        pending_approvals: pendingApprovals.rows[0]?.total || 0
      }
    });
  });

  router.get("/internal-control/audit", requireAuth, guard("internal.audit.read"), async (req, res) => {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const { rows } = await pool.query(
      `SELECT al.id, al.created_at, al.action, al.entity_type, al.entity_id, al.status, al.details,
              u.email AS actor_email
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE al.action LIKE 'internal_control.%'
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ success: true, data: { items: rows, limit, offset } });
  });

  return router;
}
