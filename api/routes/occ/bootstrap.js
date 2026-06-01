import { Router } from "express";
import { isQueueAvailable, getConnectionOpts } from "../../queue/connection.js";

const ALLOWED_MODULES = Object.freeze([
  { key: "executive", label: "Executive", allowed: true },
  { key: "decisions-requests", label: "Decisions & Requests", allowed: true },
  { key: "revenue", label: "Revenue", allowed: true },
  { key: "platform", label: "Platform", allowed: true },
  { key: "operations", label: "Operations", allowed: true },
  { key: "support-oversight", label: "Support Oversight", allowed: true },
  { key: "risk", label: "Risk & Compliance", allowed: true },
  { key: "audit", label: "Audit & Decisions", allowed: true },
  { key: "infrastructure", label: "Infrastructure", allowed: true },
  { key: "data-explorer", label: "Data Explorer", allowed: true },
  { key: "automation-runbooks", label: "Automation", allowed: true }
]);

let userLastLoginColumnChecked = false;
let userLastLoginColumnPresent = false;

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toIsoOrNull(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
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

async function checkSystem(pool) {
  let dbConnected = false;
  let redisConnected = null;

  try {
    await pool.query("SELECT 1");
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  if (isQueueAvailable()) {
    try {
      const { createClient } = await import("redis");
      const client = createClient(getConnectionOpts());
      await client.connect();
      await client.ping();
      await client.quit();
      redisConnected = true;
    } catch {
      redisConnected = false;
    }
  }

  const systemStatus = dbConnected
    ? (redisConnected === false ? "degraded" : "healthy")
    : "critical";

  return { dbConnected, redisConnected, systemStatus };
}

export function createOccBootstrapRouter(deps) {
  const { pool } = deps;
  const router = Router();

  router.get("/bootstrap", async (req, res) => {
    const userId = req.occAccess?.user_id || req.session?.userId || null;
    const occRole = req.occAccess?.occ_role || "owner";

    const hasLastLoginAt = await ensureUserLastLoginColumn(pool);

    const identityRow = await safeScalar(
      pool,
      `SELECT id AS user_id,
              email,
              company_name,
              contact_person
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [userId],
      "user_id",
      null
    );

    let userIdentity = { user_id: userId, email: null, company_name: null, contact_person: null };
    if (identityRow) {
      const { rows } = await pool.query(
        `SELECT id AS user_id,
                email,
                company_name,
                contact_person
           FROM users
          WHERE id = $1
          LIMIT 1`,
        [userId]
      ).catch(() => ({ rows: [] }));
      userIdentity = rows[0] || userIdentity;
    }

    const lastLoginAt = hasLastLoginAt
      ? await safeScalar(
        pool,
        `SELECT last_login_at
           FROM users
          WHERE id = $1
          LIMIT 1`,
        [userId],
        "last_login_at",
        null
      )
      : null;

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
      `SELECT COUNT(DISTINCT org_id)::int AS n
         FROM org_memberships
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

    const openDecisionsCount = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM occ_decisions
        WHERE status IN ('new', 'triaged', 'waiting_for_owner_decision')`,
      [],
      "n",
      0
    ), 0);

    const openRequestsCount = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM strategic_collaboration_requests
        WHERE status NOT IN ('abgeschlossen', 'abgelehnt')`,
      [],
      "n",
      0
    ), 0);

    const openSupportEscalations = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM support_escalations se
         JOIN support_cases sc ON sc.id = se.case_id
        WHERE se.status IN ('pending', 'acknowledged')
          AND sc.status NOT IN ('resolved', 'closed')`,
      [],
      "n",
      0
    ), 0);

    const openHighRiskSignals = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM risk_signals
        WHERE resolved_at IS NULL
          AND level IN ('high', 'critical')`,
      [],
      "n",
      0
    ), 0);

    const warpFailures24h = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM warp_executions
        WHERE status IN ('failed', 'error')
          AND started_at > NOW() - INTERVAL '24 hours'`,
      [],
      "n",
      0
    ), 0);

    const infraCriticalHosts = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM (
           SELECT DISTINCT ON (host_name)
                  host_name,
                  cpu_percent,
                  ram_percent,
                  docker_unhealthy_count,
                  tls_days_remaining,
                  backup_age_h
             FROM infrastructure_snapshots
            ORDER BY host_name, collected_at DESC
         ) snap
        WHERE COALESCE(snap.cpu_percent, 0) >= 95
           OR COALESCE(snap.ram_percent, 0) >= 95
           OR COALESCE(snap.docker_unhealthy_count, 0) > 0
           OR (snap.tls_days_remaining IS NOT NULL AND snap.tls_days_remaining < 7)
           OR (snap.backup_age_h IS NOT NULL AND snap.backup_age_h > 48)`,
      [],
      "n",
      0
    ), 0);

    const lastAuditAt = await safeScalar(
      pool,
      `SELECT MAX(created_at) AS last_audit_at
         FROM audit_log
        WHERE action LIKE 'owner_control.%'`,
      [],
      "last_audit_at",
      null
    );

    const { dbConnected, redisConnected, systemStatus } = await checkSystem(pool);

    const criticalSignals = [];
    if (!dbConnected) criticalSignals.push({ code: "DB_DOWN", severity: "critical", message: "Datenbank nicht erreichbar." });
    if (redisConnected === false) criticalSignals.push({ code: "REDIS_DOWN", severity: "warning", message: "Redis/Queues nicht erreichbar." });
    if (infraCriticalHosts > 0) {
      criticalSignals.push({
        code: "INFRA_CRITICAL",
        severity: "critical",
        message: `${infraCriticalHosts} Host(s) mit kritischen Infrastruktur-Signalen.`
      });
    }
    if (warpFailures24h > 0) {
      criticalSignals.push({
        code: "WARP_FAILURES_24H",
        severity: "warning",
        message: `${warpFailures24h} fehlgeschlagene Warp-Ausführungen in den letzten 24h.`
      });
    }
    if (openSupportEscalations > 0) {
      criticalSignals.push({
        code: "SUPPORT_ESCALATIONS_OPEN",
        severity: "warning",
        message: `${openSupportEscalations} offene Support-Eskalation(en).`
      });
    }
    if (openHighRiskSignals > 0) {
      criticalSignals.push({
        code: "RISK_SIGNALS_OPEN",
        severity: "warning",
        message: `${openHighRiskSignals} offene High/Critical Risk-Signale.`
      });
    }

    return res.json({
      success: true,
      data: {
        identity: {
          user_id: userIdentity.user_id || userId || null,
          email: userIdentity.email || null,
          display_name: userIdentity.contact_person || userIdentity.company_name || userIdentity.email || null,
          occ_role: occRole,
          last_login_at: toIsoOrNull(lastLoginAt),
          step_up_required: false
        },
        allowed_modules: ALLOWED_MODULES.map((item) => ({ ...item })),
        allowed_actions: [],
        executive_summary: {
          active_users_30d: activeUsers30d,
          active_orgs: activeOrgs,
          mrr_eur: mrrEur,
          open_decisions: openDecisionsCount,
          open_support_escalations: openSupportEscalations,
          critical_signals: criticalSignals.length
        },
        critical_signal_breakdown: {
          support_escalations_open: openSupportEscalations,
          risk_signals_open: openHighRiskSignals,
          warp_failures_24h: warpFailures24h,
          infrastructure_critical_hosts: infraCriticalHosts
        },
        critical_signals: criticalSignals,
        system_status: systemStatus,
        last_audit_at: toIsoOrNull(lastAuditAt),
        open_decisions_count: openDecisionsCount,
        open_requests_count: openRequestsCount
      },
      error: null
    });
  });

  return router;
}
