/**
 * Usage Metering Service — Plan-Limit Enforcement.
 *
 * Provides real-time usage checks against PLAN_LIMITS and a batch scan
 * for overage detection (called via /internal/usage-limit-scan cron).
 */

import { PLAN_LIMITS } from "./userService.js";

/**
 * Check if a user has reached their plan limit for a specific action.
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {string} plan - effective plan (from getUserAndPlan)
 * @param {'requests_send'|'requests_receive'|'listings'} limitKey
 * @returns {Promise<{allowed: boolean, current: number, limit: number}>}
 */
export async function checkUsageLimit(pool, userId, plan, limitKey) {
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.DEMO;
  const limit = limits[limitKey];

  // -1 means unlimited
  if (limit === -1) return { allowed: true, current: 0, limit: -1 };
  if (limit === 0) return { allowed: false, current: 0, limit: 0 };

  let current = 0;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  try {
    if (limitKey === "requests_send") {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM requests
         WHERE requester_id = $1 AND created_at >= $2`,
        [userId, monthStart]
      );
      current = rows[0]?.cnt || 0;
    } else if (limitKey === "requests_receive") {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM requests
         WHERE receiver_id = $1 AND created_at >= $2`,
        [userId, monthStart]
      );
      current = rows[0]?.cnt || 0;
    } else if (limitKey === "listings") {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM capacity_posts
         WHERE supplier_company_id = $1 AND status = 'active'`,
        [userId]
      );
      current = rows[0]?.cnt || 0;
    }
  } catch { /* graceful: allow on error */ return { allowed: true, current: 0, limit }; }

  return { allowed: current < limit, current, limit };
}

/**
 * Express middleware factory: reject request if plan limit exceeded.
 * @param {'requests_send'|'requests_receive'|'listings'} limitKey
 * @param {{ getUserAndPlan: Function, logger: object }} deps
 */
export function requireUsageLimit(limitKey, deps) {
  const { getUserAndPlan, logger } = deps;
  return async (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
    try {
      const me = await getUserAndPlan(req.session.userId);
      const plan = me?.plan ?? "DEMO";
      const pool = req.app?.locals?.pool || deps.pool;
      const result = await checkUsageLimit(pool, req.session.userId, plan, limitKey);
      if (!result.allowed) {
        logger.warn({ userId: req.session.userId, plan, limitKey, current: result.current, limit: result.limit }, "Usage limit reached");
        return res.status(403).json({
          error: "USAGE_LIMIT_REACHED",
          limit_key: limitKey,
          current: result.current,
          limit: result.limit,
          plan
        });
      }
      req.user = me;
      next();
    } catch (e) {
      logger.error({ err: e }, "Usage metering error");
      next(); // Fail-open: don't block on metering errors
    }
  };
}

/**
 * Batch scan: find users who are over their plan limits.
 * Called by /internal/usage-limit-scan cron for monitoring/alerting.
 * @param {import('pg').Pool} pool
 * @returns {Promise<{scanned: number, over_limit: number}>}
 */
export async function scanAndEnforceUsageLimits(pool) {
  let scanned = 0;
  let overLimit = 0;

  try {
    // Find users with active capacity_posts exceeding their plan limit
    const { rows } = await pool.query(`
      SELECT u.id, s.plan,
             (SELECT COUNT(*)::int FROM capacity_posts cp WHERE cp.supplier_company_id = u.id AND cp.status = 'active') AS active_posts
      FROM users u
      LEFT JOIN LATERAL (
        SELECT plan FROM subscriptions WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
      ) s ON TRUE
      WHERE u.is_demo = FALSE
    `);

    for (const row of rows) {
      scanned++;
      const plan = row.plan || "FREE";
      const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.DEMO;
      const listingLimit = limits.listings;
      if (listingLimit >= 0 && row.active_posts > listingLimit) {
        overLimit++;
        // Log overage — in production this would trigger a notification
      }
    }
  } catch { /* table may not exist in test */ }

  return { scanned, over_limit: overLimit };
}
