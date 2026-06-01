import { Router } from "express";
import { isQueueAvailable, getConnectionOpts } from "../../queue/connection.js";
import { safeQuery, safeScalar, toIsoOrNull } from "./_helpers.js";

function inferSystemStatus(dbConnected, redisConnected) {
  if (!dbConnected) return "critical";
  if (redisConnected === false) return "degraded";
  return "healthy";
}

export function createOccInfraRouter(deps) {
  const { pool } = deps;
  const router = Router();
  router.get("/infrastructure/hetzner", async (_req, res) => {
    const hosts = await safeQuery(
      pool,
      `SELECT id, name, role, env, status, ip, region, risk_state, tags, last_checked_at, last_error
         FROM warp_hosts
        ORDER BY name ASC`,
      [],
      []
    );
    const deploymentRows = await safeQuery(
      pool,
      `SELECT id, env, version, status, deployed_at, deployed_by, duration_ms, rollback_ready, post_checks
         FROM deployments
        ORDER BY deployed_at DESC
        LIMIT 1`,
      [],
      []
    );
    const backupRows = await safeQuery(
      pool,
      `SELECT name, last_run_at, next_run_at, last_run_status, risk_level
         FROM automation_jobs
        WHERE category = 'backup'
        ORDER BY COALESCE(last_run_at, created_at) DESC`,
      [],
      []
    );
    const tlsSignals = await safeQuery(
      pool,
      `SELECT title, message, level, created_at
         FROM risk_signals
        WHERE source = 'tls_check'
          AND resolved_at IS NULL
        ORDER BY created_at DESC`,
      [],
      []
    );

    const lastDeployment = deploymentRows[0]
      ? {
        id: deploymentRows[0].id,
        env: deploymentRows[0].env || "production",
        version: deploymentRows[0].version || null,
        status: deploymentRows[0].status || "unknown",
        deployed_at: toIsoOrNull(deploymentRows[0].deployed_at),
        deployed_by: deploymentRows[0].deployed_by || null,
        duration_ms: deploymentRows[0].duration_ms ?? null,
        rollback_ready: deploymentRows[0].rollback_ready === true,
        post_checks: Array.isArray(deploymentRows[0].post_checks) ? deploymentRows[0].post_checks : []
      }
      : null;

    return res.json({
      success: true,
      data: {
        hosts: hosts.map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role || "primary",
          env: row.env || "production",
          status: row.status || "unknown",
          ip: row.ip || null,
          region: row.region || null,
          risk_state: row.risk_state || "unknown",
          resources: {
            cpu_percent: null,
            ram_percent: null,
            disk_percent: null,
            load_1m: null,
            load_5m: null,
            load_15m: null
          },
          last_checked_at: toIsoOrNull(row.last_checked_at),
          last_error: row.last_error || null,
          tags: Array.isArray(row.tags) ? row.tags : []
        })),
        docker: {
          containers: [],
          total: 0,
          running: 0,
          stopped: 0,
          unhealthy: 0,
          last_checked: new Date().toISOString()
        },
        network: {
          domains: tlsSignals.map((row) => ({
            domain: row.title || "unknown",
            tls_status: "valid",
            tls_expires_at: null,
            days_remaining: null,
            proxy_healthy: row.level !== "critical",
            last_checked: toIsoOrNull(row.created_at),
            risk_level: row.level || "low",
            message: row.message || null
          })),
          proxy_status: "ok",
          last_checked: new Date().toISOString()
        },
        disks: [],
        backups: backupRows.map((row) => ({
          target: row.name || "backup",
          status: row.last_run_status || "unknown",
          last_successful_at: toIsoOrNull(row.last_run_at),
          next_scheduled_at: toIsoOrNull(row.next_run_at),
          restore_tested_at: null,
          restore_ready: row.last_run_status === "success",
          risk_level: row.risk_level || "low"
        })),
        last_deployment: lastDeployment
      },
      error: null
    });
  });

  router.get("/infrastructure/status", async (_req, res) => {
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

    const dockerServices = [
      { key: "api", connected: true },
      { key: "db", connected: dbConnected },
      { key: "redis", connected: redisConnected }
    ];
    const lastDeploymentAt = await safeScalar(
      pool,
      "SELECT MAX(deployed_at) AS deployed_at FROM deployments",
      [],
      "deployed_at",
      null
    );

    return res.json({
      success: true,
      data: {
        environment: process.env.NODE_ENV || "development",
        db_connected: dbConnected,
        redis_connected: redisConnected,
        api_healthy: dbConnected,
        docker_services: dockerServices,
        last_deployment_at: toIsoOrNull(lastDeploymentAt),
        uptime_seconds: Math.floor(process.uptime()),
        node_version: process.version,
        system_status: inferSystemStatus(dbConnected, redisConnected)
      },
      error: null
    });
  });

  return router;
}
