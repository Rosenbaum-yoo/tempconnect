/**
 * Server-Sent Events (SSE) — Real-time notification stream.
 * GET /api/notifications/stream
 *
 * Sends new notifications to connected clients via EventSource.
 * Lightweight alternative to WebSocket — works through proxies, no special deps.
 */

import { Router } from "express";

// Active SSE connections: Map<userId, Set<Response>>
const connections = new Map();

/**
 * @param {{ pool, requireAuth, logger }} deps
 */
export function createNotificationStreamRouter(deps) {
  const { pool, requireAuth, logger: _logger } = deps;
  const router = Router();

  router.get("/notifications/stream", requireAuth, (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).end();

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Nginx proxy compatibility
    res.flushHeaders();

    // Send initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ userId, ts: Date.now() })}\n\n`);

    // Register connection
    if (!connections.has(userId)) connections.set(userId, new Set());
    connections.get(userId).add(res);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try { res.write(":heartbeat\n\n"); } catch { /* connection closed */ }
    }, 30000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      const userSet = connections.get(userId);
      if (userSet) {
        userSet.delete(res);
        if (userSet.size === 0) connections.delete(userId);
      }
    });
  });

  // Unread count endpoint (for badge polling fallback)
  router.get("/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM notifications WHERE user_id = $1 AND is_read = FALSE",
        [req.session.userId]
      );
      res.json({ count: rows[0]?.cnt || 0 });
    } catch {
      res.json({ count: 0 });
    }
  });

  return router;
}

/**
 * Push a notification to a specific user via SSE.
 * Call this from any service after creating a notification.
 * @param {string} userId
 * @param {object} notification
 */
export function pushToUser(userId, notification) {
  const userConns = connections.get(userId);
  if (!userConns || userConns.size === 0) return;
  const data = JSON.stringify(notification);
  for (const res of userConns) {
    try {
      res.write(`event: notification\ndata: ${data}\n\n`);
    } catch { /* connection closed, will be cleaned up */ }
  }
}

/**
 * Get count of active SSE connections (for health/metrics).
 */
export function getActiveConnectionCount() {
  let total = 0;
  for (const [, set] of connections) total += set.size;
  return total;
}
