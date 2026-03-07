/**
 * Notifications REST-Router: list, mark-read, read-all.
 */
import { Router } from "express";

export function createNotificationsRouter(deps) {
  const { pool, requireAuth } = deps;
  const router = Router();

  router.get("/notifications", requireAuth, async (req, res) => {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const unreadOnly = req.query.unread === "true";

    const where = ["n.user_id = $1"];
    const params = [req.session.userId];
    let idx = 2;
    if (unreadOnly) { where.push("n.is_read = FALSE"); }
    if (req.query.org_id) { where.push(`n.org_id = $${idx}`); params.push(req.query.org_id); idx++; }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT * FROM notifications n
       WHERE ${where.join(" AND ")}
       ORDER BY n.created_at DESC
       LIMIT $${idx}`,
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

  return router;
}
