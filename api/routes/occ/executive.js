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

export function createOccExecutiveRouter(deps) {
  const { pool } = deps;
  const router = Router();

  router.get("/executive/summary", async (_req, res) => {
    const hasLastLoginAt = await ensureUserLastLoginColumn(pool);

    const activeUsers30d = hasLastLoginAt
      ? toInt(await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM users
          WHERE last_login_at > NOW() - INTERVAL '30 days'`,
        [],
        "n",
        0
      ), 0)
      : toInt(await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM users
          WHERE created_at > NOW() - INTERVAL '30 days'`,
        [],
        "n",
        0
      ), 0);

    const activeOrgs = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM organizations
        WHERE is_active = TRUE`,
      [],
      "n",
      0
    ), 0);

    const mrrEur = toInt(await safeScalar(
      pool,
      `SELECT COALESCE(ROUND(SUM(amount)::numeric, 0), 0)::int AS mrr
         FROM payment_sessions
        WHERE status = 'completed'
          AND created_at > NOW() - INTERVAL '30 days'`,
      [],
      "mrr",
      0
    ), 0);

    const openDecisions = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM occ_decisions
        WHERE status = 'pending'`,
      [],
      "n",
      0
    ), 0);

    const openSupportEscalations = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM occ_decisions
        WHERE type = 'support_escalation'
          AND status = 'pending'`,
      [],
      "n",
      0
    ), 0);

    const criticalSignals = [];
    try {
      await pool.query("SELECT 1");
    } catch {
      criticalSignals.push({ code: "DB_DOWN", severity: "critical", message: "Datenbank nicht erreichbar." });
    }

    return res.json({
      success: true,
      data: {
        active_users_30d: activeUsers30d,
        active_orgs: activeOrgs,
        mrr_eur: mrrEur,
        open_decisions: openDecisions,
        open_support_escalations: openSupportEscalations,
        critical_signals: criticalSignals.length,
        critical_signals_items: criticalSignals
      },
      error: null
    });
  });

  return router;
}
