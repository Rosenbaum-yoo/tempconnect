/**
 * Admin Panel Routes — platform administration endpoints.
 * Protected: requires platform_admin or owner role.
 */
import { Router } from "express";
import { queryAuditLog } from "../services/auditLog.js";
import * as eventService from "../services/eventTrackingService.js";

export function createAdminRouter(deps) {
  const { pool, requireAuth, logger } = deps;
  const router = Router();

  /** Lightweight admin guard: owner, admin, or platform_admin */
  function requireAdmin(req, res, next) {
    const role = req.orgRole || req.orgMembership?.role_key;
    if (role && ["platform_admin", "owner", "admin"].includes(role)) return next();
    // Fallback: check user.role field for legacy admins
    if (req.session?.userRole === "admin") return next();
    logger.warn({ userId: req.session?.userId, path: req.path }, "admin access denied");
    res.status(403).json({ success: false, error: { code: "ADMIN_REQUIRED", message: "Administratorrechte erforderlich." } });
  }

  /** Sanitize search input — strip SQL/XSS-dangerous chars */
  function sanitize(str, maxLen = 200) {
    if (!str || typeof str !== "string") return "";
    return str.slice(0, maxLen).replace(/[<>'";\\]/g, "").trim();
  }

  /* ── Users ──────────────────────────────── */
  router.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(500, parseInt(req.query.limit) || 100);
      const offset = parseInt(req.query.offset) || 0;
      const search = sanitize(req.query.q || "", 100);
      const where = search ? "WHERE u.email ILIKE $3 OR u.company_name ILIKE $3 OR u.contact_person ILIKE $3" : "";
      const params = search ? [limit, offset, `%${search}%`] : [limit, offset];
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.company_name, u.contact_person, u.role, u.plan, u.city, u.org_id, u.is_verified, u.created_at,
                o.name AS org_name
         FROM users u LEFT JOIN organizations o ON o.id = u.org_id
         ${where} ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`, params
      );
      const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM users u ${where}`, search ? [`%${search}%`] : []);
      res.json({ success: true, data: { items: rows, total: countRows[0]?.total || 0 } });
    } catch (e) { logger.error({ err: e }, "admin users"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /* ── Organizations ──────────────────────── */
  router.get("/admin/organizations", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT o.*,
                (SELECT COUNT(*)::int FROM org_memberships WHERE org_id = o.id AND is_active = TRUE) AS member_count,
                (SELECT COUNT(*)::int FROM org_locations WHERE org_id = o.id AND is_active = TRUE) AS location_count
         FROM organizations o ORDER BY o.created_at DESC LIMIT 200`
      );
      res.json({ success: true, data: { items: rows } });
    } catch (e) { logger.error({ err: e }, "admin orgs"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /* ── Audit Log ──────────────────────────── */
  router.get("/admin/audit-log", requireAuth, requireAdmin, async (req, res) => {
    try {
      const rows = await queryAuditLog(pool, {
        org_id: req.query.org_id || null,
        actor_id: req.query.actor_id || null,
        entity_type: sanitize(req.query.entity_type || "") || null,
        action: sanitize(req.query.action || "") || null,
        from: req.query.from || null,
        to: req.query.to || null,
        limit: req.query.limit || 100
      });
      res.json({ success: true, data: { items: rows, count: rows.length } });
    } catch (e) { logger.error({ err: e }, "admin audit"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /* ── Platform Metrics ───────────────────── */
  router.get("/admin/metrics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [users, orgs, reqs, offers, events, caps] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE created_at > NOW() - INTERVAL '30 days')::int AS last_30d FROM users"),
        pool.query("SELECT COUNT(*)::int AS total FROM organizations WHERE is_active = TRUE"),
        pool.query("SELECT status, COUNT(*)::int AS count FROM requisitions GROUP BY status"),
        pool.query("SELECT status, COUNT(*)::int AS count FROM offers GROUP BY status"),
        eventService.eventCounts(pool, null, 30),
        pool.query("SELECT COUNT(*)::int AS active FROM capacity_posts WHERE is_active = TRUE")
      ]);
      const reqMap = {}; (reqs.rows || []).forEach(r => { reqMap[r.status] = r.count; });
      const offMap = {}; (offers.rows || []).forEach(r => { offMap[r.status] = r.count; });
      res.json({
        success: true,
        data: {
          users: users.rows[0],
          organizations: orgs.rows[0],
          requisitions: reqMap,
          offers: offMap,
          events: events,
          capacity_posts: caps.rows[0]
        }
      });
    } catch (e) { logger.error({ err: e }, "admin metrics"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  /* ── User Actions ───────────────────── */
  router.patch("/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      if (!userId) return res.status(400).json({ success: false, error: { code: "INVALID_ID" } });
      const allowed = ["role", "plan", "is_verified"];
      const updates = [];
      const values = [];
      let idx = 1;
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates.push(`${key} = $${idx}`);
          values.push(req.body[key]);
          idx++;
        }
      }
      if (!updates.length) return res.status(400).json({ success: false, error: { code: "NO_FIELDS" } });
      values.push(userId);
      const { rows } = await pool.query(
        `UPDATE users SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING id, email, role, plan, is_verified`,
        values
      );
      if (!rows.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      // Audit log
      try {
        const { writeAuditEnhanced } = await import("../services/auditLog.js");
        await writeAuditEnhanced(pool, req, {
          action: "admin.user.update", entity_type: "user", entity_id: String(userId),
          details: { changed_fields: Object.keys(req.body).filter(k => allowed.includes(k)) }
        });
      } catch (_) {}
      res.json({ success: true, data: rows[0] });
    } catch (e) { logger.error({ err: e }, "admin patch user"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  router.post("/admin/users/:id/deactivate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      if (!userId) return res.status(400).json({ success: false, error: { code: "INVALID_ID" } });
      const { rows } = await pool.query(
        `UPDATE users SET is_verified = FALSE, role = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING id, email, role`,
        [userId]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND" } });
      try {
        const { writeAuditEnhanced } = await import("../services/auditLog.js");
        await writeAuditEnhanced(pool, req, {
          action: "admin.user.deactivate", entity_type: "user", entity_id: String(userId)
        });
      } catch (_) {}
      res.json({ success: true, data: rows[0] });
    } catch (e) { logger.error({ err: e }, "admin deactivate user"); res.status(500).json({ success: false, error: { code: "SERVER_ERROR" } }); }
  });

  return router;
}
