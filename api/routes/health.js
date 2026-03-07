import { Router } from "express";
import * as healthService from "../services/healthService.js";
import * as platformMetrics from "../services/platformMetricsService.js";
import * as searchService from "../services/searchService.js";
import { isQueueAvailable } from "../queue/connection.js";

/** LB health: no DB, just 200 OK. Register in server as app.get("/health", simpleHealthHandler). */
export function simpleHealthHandler(req, res) {
  res.status(200).send("OK");
}

/**
 * @param {{ pool: import('pg').Pool, config: object, logger: object }} deps
 * @returns {import('express').Router}
 */
export function createHealthRouter(deps) {
  const { pool, config, logger } = deps;
  const router = Router();

  router.get("/health", async (req, res) => {
    try {
      await healthService.pingDb(pool);
      res.json({ ok: true, service: "api" });
    } catch (e) {
      logger.error({ err: e }, "Health check failed");
      res.status(500).json({ ok: false, error: "DB_DOWN" });
    }
  });

  router.get("/ready", async (req, res) => {
    try {
      await healthService.pingDb(pool);
      res.status(200).json({ ok: true, ready: true });
    } catch (e) {
      res.status(503).json({ ok: false, ready: false, error: "DB_UNREACHABLE" });
    }
  });

  router.get("/admin/status", async (req, res) => {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    const adminSecret = config.ADMIN_SECRET;
    if (!adminSecret || secret !== adminSecret) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    try {
      await healthService.pingDb(pool);
      const migrations = await healthService.getMigrations(pool);

      // Memory-Nutzung
      const mem = process.memoryUsage();
      const memory = {
        rss_mb: Math.round(mem.rss / 1048576),
        heap_used_mb: Math.round(mem.heapUsed / 1048576),
        heap_total_mb: Math.round(mem.heapTotal / 1048576),
        external_mb: Math.round(mem.external / 1048576)
      };

      // Search-Engine Status
      let search = { available: false, engine: "unknown" };
      try { search = await searchService.getSearchStatus(); } catch { /* non-critical */ }

      res.json({
        db: "ok",
        queue: isQueueAvailable() ? "configured" : "unavailable",
        search,
        memory,
        version: process.env.npm_package_version || "1.0.0",
        node: process.version,
        platform: process.platform,
        uptime: Math.floor(process.uptime()),
        started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        migrations,
        service: "api",
        ts: new Date().toISOString()
      });
    } catch (e) {
      logger.error({ err: e }, "Admin status check failed");
      res.status(500).json({ db: "error", error: e.message, service: "api" });
    }
  });

  // ── Platform metrics (admin-only) ────────────────────
  router.get("/admin/metrics", async (req, res) => {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    if (!config.ADMIN_SECRET || secret !== config.ADMIN_SECRET) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    try {
      const metrics = await platformMetrics.getMetrics(pool);
      res.json(metrics);
    } catch (e) {
      logger.error({ err: e }, "Metrics fetch failed");
      res.status(500).json({ error: "METRICS_ERROR", message: e.message });
    }
  });

  return router;
}
