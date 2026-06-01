import { Router } from "express";
import { isQueueAvailable, getConnectionOpts } from "../../queue/connection.js";

function deriveSystemStatus(services = []) {
  const statuses = services.map((s) => s.status);
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("degraded")) return "degraded";
  return "healthy";
}

async function loadQueueStats() {
  if (!isQueueAvailable()) return [];
  try {
    const { Queue } = await import("bullmq");
    const queueNames = ["email", "match", "capacity", "staffing"];
    const items = [];
    for (const name of queueNames) {
      const queue = new Queue(name, { connection: getConnectionOpts() });
      try {
        const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused");
        items.push({
          name,
          waiting: Number(counts.waiting || 0),
          active: Number(counts.active || 0),
          completed: Number(counts.completed || 0),
          failed: Number(counts.failed || 0),
          delayed: Number(counts.delayed || 0),
          paused: Number(counts.paused || 0)
        });
      } finally {
        await queue.close().catch(() => {});
      }
    }
    return items;
  } catch {
    return [];
  }
}

export function createOccOperationsRouter(deps) {
  const { pool } = deps;
  const router = Router();

  router.get("/operations/health", async (_req, res) => {
    let dbStatus = "ok";
    let redisStatus = isQueueAvailable() ? "ok" : "unconfigured";

    try {
      await pool.query("SELECT 1");
    } catch {
      dbStatus = "critical";
    }

    if (isQueueAvailable()) {
      try {
        const { createClient } = await import("redis");
        const client = createClient(getConnectionOpts());
        await client.connect();
        await client.ping();
        await client.quit();
      } catch {
        redisStatus = "degraded";
      }
    }

    const queues = await loadQueueStats();
    const services = [
      { key: "db", label: "PostgreSQL", status: dbStatus },
      { key: "redis", label: "Redis", status: redisStatus }
    ];

    const memoryMb = Math.round(process.memoryUsage().rss / 1048576);
    const uptimeSeconds = Math.floor(process.uptime());
    const dbPoolSize = {
      total: Number(pool.totalCount || 0),
      idle: Number(pool.idleCount || 0),
      waiting: Number(pool.waitingCount || 0)
    };

    return res.json({
      success: true,
      data: {
        services,
        queues,
        db_pool_size: dbPoolSize,
        memory_mb: memoryMb,
        uptime_seconds: uptimeSeconds,
        system_status: deriveSystemStatus(services)
      },
      error: null
    });
  });

  return router;
}
