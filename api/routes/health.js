import { Router } from "express";
import * as healthService from "../services/healthService.js";
import * as platformMetrics from "../services/platformMetricsService.js";
import * as searchService from "../services/searchService.js";
import { isQueueAvailable } from "../queue/connection.js";
import { isMonitoringActive, captureException } from "../utils/monitoring.js";
import { describeBilling } from "../services/billingProviderService.js";

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
    } catch {
      res.status(503).json({ ok: false, ready: false, error: "DB_UNREACHABLE" });
    }
  });

  /**
   * GET /api/live — Liveness probe.
   * No DB check — confirms only that the Node process is responsive.
   * Kubernetes / container orchestrators use this to decide when to restart a container.
   */
  router.get("/live", (_req, res) => {
    res.status(200).json({ ok: true, live: true, uptime_s: Math.floor(process.uptime()) });
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
        // Billing/Stripe-Selbstauskunft (placeholder-aware, KEINE Secrets): Provider,
        // payment_mode, Capabilities + Warnungen bei Fehlkonfiguration (Key/Webhook fehlt).
        billing: describeBilling(config),
        service: "api",
        ts: new Date().toISOString()
      });
    } catch (e) {
      logger.error({ err: e }, "Admin status check failed");
      res.status(500).json({ db: "error", error: e.message, service: "api" });
    }
  });

  /**
   * GET /api/service-status
   * Public-facing structured component health — safe subset (no secrets exposed).
   * Returns overall status + per-component checks with latency.
   */
  router.get("/service-status", async (req, res) => {
    const started = Date.now();
    const checks = {};

    // ── Database ───────────────────────────────────────────
    try {
      const dbStart = Date.now();
      await healthService.pingDb(pool);
      checks.database = { status: "ok", latency_ms: Date.now() - dbStart };
    } catch {
      checks.database = { status: "error", error: "DB_UNREACHABLE" };
    }

    // ── Redis / Queue ──────────────────────────────────────
    const queueConfigured = isQueueAvailable();
    if (queueConfigured) {
      try {
        // Dynamic import to avoid crashing when Redis is absent
        const { getConnection } = await import("../queue/connection.js");
        const conn = getConnection ? getConnection() : null;
        if (conn) {
          const redisStart = Date.now();
          await conn.ping();
          checks.redis = { status: "ok", latency_ms: Date.now() - redisStart };
        } else {
          checks.redis = { status: "configured", note: "connection not yet established" };
        }
      } catch {
        checks.redis = { status: "error", error: "REDIS_PING_FAILED" };
      }
    } else {
      checks.redis = { status: "unconfigured" };
    }

    // ── SMTP ───────────────────────────────────────────────
    const smtpConfigured = !!(config.SMTP_HOST);
    checks.smtp = smtpConfigured
      ? { status: "configured", host: config.SMTP_HOST, port: config.SMTP_PORT || 587 }
      : { status: "unconfigured", note: "SMTP_HOST not set — emails will be skipped" };

    // ── Stripe ─────────────────────────────────────────────
    // Placeholder-aware: ein Platzhalter-Key (sk_test_demo o.ae.) zaehlt NICHT als
    // konfiguriert. Gleiche Wahrheitsquelle wie /payment/config + Billing-Resolver.
    const billing = describeBilling(config);
    checks.stripe = billing.stripe_configured
      ? { status: "configured", webhook_secret: billing.capabilities.webhooks }
      : { status: "unconfigured", note: "Demo-Zahlungsmodus (kein echter Stripe-Key)" };

    // ── Search ─────────────────────────────────────────────
    try {
      const searchStatus = await searchService.getSearchStatus();
      checks.search = { status: searchStatus.available ? "ok" : "degraded", engine: searchStatus.engine };
    } catch {
      checks.search = { status: "unknown" };
    }

    // ── Overall status ─────────────────────────────────────
    const hasError = Object.values(checks).some(c => c.status === "error");
    const hasDegraded = Object.values(checks).some(c => c.status === "degraded");
    const overall = hasError ? "degraded" : hasDegraded ? "degraded" : "ok";

    const httpStatus = checks.database?.status === "error" ? 503 : 200;
    res.status(httpStatus).json({
      status: overall,
      version: process.env.npm_package_version || "1.0.0",
      node: process.version,
      uptime_s: Math.floor(process.uptime()),
      checked_at: new Date().toISOString(),
      response_ms: Date.now() - started,
      components: checks
    });
  });

  /**
   * GET /api/public/system-status
   * Public-facing component health for the Trust Center status page.
   * Returns business-level component statuses (no secrets, no internal details).
   * No authentication required.
   */
  router.get("/public/system-status", async (req, res) => {
    const started = Date.now();
    const components = {};

    // ── API Server ──────────────────────────────────────────
    components.api = { status: "ok", latency_ms: 0 };

    // ── Database ─────────────────────────────────────────────
    try {
      const dbStart = Date.now();
      await healthService.pingDb(pool);
      components.database = { status: "ok", latency_ms: Date.now() - dbStart };
    } catch {
      components.database = { status: "error" };
    }

    // ── Matching Engine ──────────────────────────────────────
    // Matching relies on DB + search; if both are up, matching is available
    try {
      const mStart = Date.now();
      await healthService.pingDb(pool);
      components.matching_engine = { status: "ok", latency_ms: Date.now() - mStart };
    } catch {
      components.matching_engine = { status: "error" };
    }

    // ── Timesheet Processing ─────────────────────────────────
    // Timesheet processing relies on DB for reads/writes
    try {
      const tStart = Date.now();
      await healthService.pingDb(pool);
      components.timesheet_processing = { status: "ok", latency_ms: Date.now() - tStart };
    } catch {
      components.timesheet_processing = { status: "error" };
    }

    // ── Notification System ──────────────────────────────────
    const smtpConfigured = !!(config.SMTP_HOST);
    components.notification_system = smtpConfigured
      ? { status: "ok" }
      : { status: "degraded", note: "E-Mail-Versand nicht konfiguriert" };

    // ── Background Services (Queue/Redis) ────────────────────
    const queueConfigured = isQueueAvailable();
    if (queueConfigured) {
      try {
        const { getConnection } = await import("../queue/connection.js");
        const conn = getConnection ? getConnection() : null;
        if (conn) {
          const rStart = Date.now();
          await conn.ping();
          components.background_services = { status: "ok", latency_ms: Date.now() - rStart };
        } else {
          components.background_services = { status: "ok" };
        }
      } catch {
        components.background_services = { status: "error" };
      }
    } else {
      components.background_services = { status: "ok" };
    }

    // ── Search ───────────────────────────────────────────────
    try {
      const sStart = Date.now();
      const searchStatus = await searchService.getSearchStatus();
      components.search = {
        status: searchStatus.available ? "ok" : "degraded",
        latency_ms: Date.now() - sStart
      };
    } catch {
      components.search = { status: "degraded" };
    }

    // ── Overall ──────────────────────────────────────────────
    const hasError = Object.values(components).some(c => c.status === "error");
    const hasDegraded = Object.values(components).some(c => c.status === "degraded");
    const overall = hasError ? "degraded" : hasDegraded ? "partial" : "ok";

    res.status(components.database?.status === "error" ? 503 : 200).json({
      status: overall,
      checked_at: new Date().toISOString(),
      response_ms: Date.now() - started,
      components
    });
  });

  /**
   * GET /api/debug/sentry-test
   * Fires a test exception to verify Sentry receives events.
   * Protected by ADMIN_SECRET (same as /admin/status).
   *
   * Usage: curl -H "X-Admin-Secret: <secret>" http://localhost:3000/api/debug/sentry-test
   */
  router.get("/debug/sentry-test", (req, res) => {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    if (!config.ADMIN_SECRET || secret !== config.ADMIN_SECRET) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    const active = isMonitoringActive();
    if (!active) {
      return res.json({
        ok: false,
        sentry: "inactive",
        hint: "Set SENTRY_DSN environment variable to enable error monitoring."
      });
    }
    const testErr = new Error("[Sentry Test] Verification from TempConnect API");
    captureException(testErr, { source: "debug/sentry-test", triggered_by: "admin" });
    res.json({
      ok: true,
      sentry: "active",
      message: "Test exception sent to Sentry. Check your Sentry dashboard."
    });
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
