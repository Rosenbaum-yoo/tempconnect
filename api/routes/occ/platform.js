import { Router } from "express";

let userLastLoginColumnChecked = false;
let userLastLoginColumnPresent = false;

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function safeScalar(pool, sql, params, key, fallback) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows?.[0]?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

async function ensureUserLastLoginColumn(pool) {
  if (userLastLoginColumnChecked) return userLastLoginColumnPresent;
  userLastLoginColumnChecked = true;
  try {
    const { rowCount } = await pool.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'last_login_at'
        LIMIT 1`
    );
    userLastLoginColumnPresent = rowCount > 0;
  } catch {
    userLastLoginColumnPresent = false;
  }
  return userLastLoginColumnPresent;
}

export function createOccPlatformRouter(deps) {
  const { pool } = deps;
  const router = Router();

  router.get("/platform/summary", async (_req, res) => {
    const hasLastLoginAt = await ensureUserLastLoginColumn(pool);

    const totalUsers = toInt(await safeScalar(pool, "SELECT COUNT(*)::int AS n FROM users", [], "n", 0), 0);
    const totalOrgs = toInt(await safeScalar(pool, "SELECT COUNT(*)::int AS n FROM organizations WHERE is_active = TRUE", [], "n", 0), 0);
    const totalListings = toInt(await safeScalar(pool, "SELECT COUNT(*)::int AS n FROM listings", [], "n", 0), 0);
    const totalDeals = toInt(await safeScalar(pool, "SELECT COUNT(*)::int AS n FROM offers", [], "n", 0), 0);

    const activeUsers7d = hasLastLoginAt
      ? toInt(await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM users
          WHERE last_login_at > NOW() - INTERVAL '7 days'`,
        [],
        "n",
        0
      ), 0)
      : toInt(await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM users
          WHERE created_at > NOW() - INTERVAL '7 days'`,
        [],
        "n",
        0
      ), 0);

    const newUsers30d = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM users
        WHERE created_at > NOW() - INTERVAL '30 days'`,
      [],
      "n",
      0
    ), 0);

    return res.json({
      success: true,
      data: {
        total_users: totalUsers,
        total_orgs: totalOrgs,
        total_listings: totalListings,
        total_deals: totalDeals,
        active_users_7d: activeUsers7d,
        new_users_30d: newUsers30d
      },
      error: null
    });
  });

  return router;
}
