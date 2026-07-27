/**
 * Notifications REST-Router: list, mark-read, read-all.
 */
import { Router } from "express";
import { summarizeBySurface } from "../services/notificationSurfaceMap.js";

export function createNotificationsRouter(deps) {
  const { pool, requireAuth } = deps;
  const router = Router();

  router.get("/notifications", requireAuth, async (req, res) => {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const unreadOnly = req.query.unread === "true";

    const where = ["n.user_id = $1"];
    const params = [req.session.userId];
    let idx = 2;
    if (unreadOnly) { where.push("n.is_read = FALSE"); }
    if (req.query.org_id) { where.push(`n.org_id = $${idx}`); params.push(req.query.org_id); idx++; }
    if (req.query.type) {
      const types = req.query.type.split(",").map(t => t.trim()).filter(Boolean);
      if (types.length) { where.push(`n.type = ANY($${idx}::text[])`); params.push(types); idx++; }
    }
    if (req.query.severity) { where.push(`n.severity = $${idx}`); params.push(req.query.severity); idx++; }
    params.push(limit);
    const limitIdx = idx; idx++;
    params.push(offset);

    const { rows } = await pool.query(
      `SELECT * FROM notifications n
       WHERE ${where.join(" AND ")}
       ORDER BY n.created_at DESC
       LIMIT $${limitIdx} OFFSET $${idx}`,
      params
    );

    const { rows: countRows } = await pool.query(
      "SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = FALSE",
      [req.session.userId]
    );

    res.json({ items: rows, unread_count: countRows[0]?.unread ?? 0 });
  });

  router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
    const { rowCount } = await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2",
      [req.params.id, req.session.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: "NOT_FOUND" });
    res.locals.audit = { action: "notification.mark_read", entity_type: "notification", entity_id: req.params.id };
    res.json({ ok: true });
  });

  router.post("/notifications/read-all", requireAuth, async (req, res) => {
    const { rowCount } = await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE",
      [req.session.userId]
    );
    res.locals.audit = { action: "notification.read_all", entity_type: "notification", details: { marked: rowCount } };
    res.json({ ok: true, marked: rowCount });
  });

  /* ── Notification Preferences ─────────── */

  router.get("/notification-preferences", requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM notification_preferences WHERE user_id = $1 ORDER BY event_category",
      [req.session.userId]
    );
    res.json({ items: rows });
  });

  router.put("/notification-preferences", requireAuth, async (req, res) => {
    const prefs = req.body?.preferences;
    if (!Array.isArray(prefs)) return res.status(400).json({ error: "VALIDATION", message: "preferences array required" });
    let upserted = 0;
    for (const p of prefs) {
      if (!p.event_category) continue;
      await pool.query(
        `INSERT INTO notification_preferences (user_id, event_category, channel_in_app, channel_email)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, event_category) DO UPDATE SET
           channel_in_app = $3, channel_email = $4, updated_at = NOW()`,
        [req.session.userId, p.event_category, p.channel_in_app !== false, p.channel_email === true]
      );
      upserted++;
    }
    res.locals.audit = { action: "notification.prefs_update", entity_type: "notification_preferences", details: { upserted } };
    res.json({ ok: true, upserted });
  });

  /* ── Unread count (lightweight) ─────────── */
  router.get("/notifications/unread-count", requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE",
      [req.session.userId]
    );
    res.json({ count: rows[0]?.count ?? 0 });
  });

  /* ── Per-surface unread summary (Enterprise-Hub Card-Badges) ─────────
   * Gruppiert ungelesene Notifications nach type und faltet sie ueber
   * notificationSurfaceMap auf Hub-Card-Surfaces. `total` bleibt mit der
   * Glocke konsistent (zaehlt auch bell-only Typen), `surfaces` enthaelt nur
   * routebare, positive Counts. User-scoped (kein Org-Leak). */
  router.get("/notifications/surface-summary", requireAuth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT type, COUNT(*)::int AS n
         FROM notifications
        WHERE user_id = $1 AND is_read = FALSE
        GROUP BY type`,
      [req.session.userId]
    );
    const { surfaces, total } = summarizeBySurface(rows);
    res.json({ surfaces, total, generated_at: new Date().toISOString() });
  });

  /* ── Match Alerts (general, beyond SLA search jobs) ─ */

  router.get("/match-alerts", requireAuth, async (req, res) => {
    try {
      const { getMatchAlerts, enrichMatchAlerts } = await import("../services/matchAlertService.js");
      const opts = {
        unreadOnly: req.query.unread === "true",
        sourceType: req.query.source_type || undefined,
        severity: req.query.severity || undefined,
        limit: parseInt(req.query.limit, 10) || 50,
        offset: parseInt(req.query.offset, 10) || 0
      };
      const result = await getMatchAlerts(pool, req.session.userId, opts);
      // Titel, Begruendung und Deep-Link auf das Gegenstueck (P4.4) — sonst ist der
      // Match-Alerts-Tab eine Liste ohne Aussage und ohne Ziel.
      res.json({ ...result, items: enrichMatchAlerts(result.items) });
    } catch (_e) {
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.get("/match-alerts/unread-count", requireAuth, async (req, res) => {
    try {
      const { getMatchAlertUnreadCount } = await import("../services/matchAlertService.js");
      const count = await getMatchAlertUnreadCount(pool, req.session.userId);
      res.json({ count });
    } catch (_e) {
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.patch("/match-alerts/:id/read", requireAuth, async (req, res) => {
    try {
      const { markMatchAlertRead } = await import("../services/matchAlertService.js");
      const alert = await markMatchAlertRead(pool, req.params.id, req.session.userId);
      if (!alert) return res.status(404).json({ error: "NOT_FOUND" });
      res.locals.audit = { action: "match_alert.read", entity_type: "match_alert", entity_id: req.params.id };
      res.json(alert);
    } catch (_e) {
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/match-alerts/read-all", requireAuth, async (req, res) => {
    try {
      const { markAllMatchAlertsRead } = await import("../services/matchAlertService.js");
      const result = await markAllMatchAlertsRead(pool, req.session.userId);
      res.locals.audit = { action: "match_alert.read_all", entity_type: "match_alert", details: { marked: result.updated } };
      res.json({ ok: true, marked: result.updated });
    } catch (_e) {
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
