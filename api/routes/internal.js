import { Router } from "express";
import * as capacityService from "../services/capacityService.js";
import * as slaService from "../services/slaService.js";
import * as supplierMetricsService from "../services/supplierMetricsService.js";
import * as complianceService from "../services/complianceService.js";
import * as auditLog from "../services/auditLog.js";
import * as stateMachine from "../services/stateMachine.js";
import * as idempotencyService from "../services/idempotencyService.js";
import * as marketplaceService from "../services/marketplaceService.js";
import * as slaSearchService from "../services/slaSearchService.js";

/**
 * @param {{ pool, config, cronRateLimit, logger, sendMail }} deps
 */
export function createInternalRouter(deps) {
  const { pool, config, cronRateLimit, logger, sendMail } = deps;
  const cronAllowedIps = config.INTERNAL_CRON_ALLOWED_IPS || [];
  const cronSecret = config.INTERNAL_CRON_SECRET || "";
  const router = Router();

  function checkCronAuth(req, res, next) {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    if (cronAllowedIps.length > 0 && !cronAllowedIps.includes(clientIp)) {
      logger.warn({ path: req.path, clientIp, allowed: cronAllowedIps }, "Cron IP not allowlisted");
      return res.status(403).json({ error: "FORBIDDEN", message: "IP not allowlisted" });
    }
    if (cronSecret && req.headers["x-internal-secret"] !== cronSecret) {
      logger.warn({ path: req.path, clientIp }, "Cron secret invalid");
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    next();
  }

  router.post("/internal/expire-reservations", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batchSize = Math.min(500, parseInt(req.body?.batch_size, 10) || 100);
      const { expired } = await capacityService.expireReservationsBatch(pool, batchSize);
      if (expired > 0) {
        await stateMachine.logTransition(pool, { entityType: "RESERVATION", from: "active", to: "expired", details: { count: expired, batchSize } });
        await auditLog.writeAudit(pool, { action: "reservation.expiry_batch", entity_type: "capacity_reservation", details: { expired, batchSize } });
      }
      logger.info({ path: "expire-reservations", clientIp, expired, batchSize }, "Cron expire-reservations completed");
      res.json({ ok: true, expired });
    } catch (e) {
      logger.error({ err: e, path: "expire-reservations", clientIp }, "Cron expire-reservations failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/sla-scan", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batch = Math.min(500, parseInt(req.body?.batch_size, 10) || 100);
      const { breached } = await slaService.slaScan(pool, batch);
      logger.info({ path: "sla-scan", clientIp, breached }, "Cron sla-scan completed");
      res.json({ ok: true, breached });
    } catch (e) {
      logger.error({ err: e, path: "sla-scan", clientIp }, "Cron sla-scan failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/recompute-supplier-metrics", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      await supplierMetricsService.recomputeForWindow(pool, 30);
      await supplierMetricsService.recomputeForWindow(pool, 90);
      logger.info({ path: "recompute-supplier-metrics", clientIp }, "Cron recompute-supplier-metrics completed");
      res.json({ ok: true });
    } catch (e) {
      logger.error({ err: e, path: "recompute-supplier-metrics", clientIp }, "Cron failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/recompute-compliance", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batch = Math.min(500, parseInt(req.query?.batch, 10) || 100);
      const { updated } = await complianceService.recomputeBatch(pool, batch);
      logger.info({ path: "recompute-compliance", clientIp, updated }, "Cron recompute-compliance completed");
      res.json({ ok: true, updated });
    } catch (e) {
      logger.error({ err: e, path: "recompute-compliance", clientIp }, "Cron failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/notdienst-escalate", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batch = Math.min(100, parseInt(req.body?.batch_size, 10) || 50);
      const { escalated } = await slaService.notdienstEscalationScan(pool, batch);
      logger.info({ path: "notdienst-escalate", clientIp, escalated }, "Cron notdienst-escalate completed");
      res.json({ ok: true, escalated });
    } catch (e) {
      logger.error({ err: e, path: "notdienst-escalate", clientIp }, "Cron notdienst-escalate failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/demand-sla-scan", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batchSize = Math.min(500, parseInt(req.body?.batch_size, 10) || 100);
      const { breached } = await marketplaceService.demandSlaScan(pool, batchSize);
      logger.info({ path: "demand-sla-scan", clientIp, breached }, "Cron demand-sla-scan completed");
      res.json({ ok: true, breached });
    } catch (e) {
      logger.error({ err: e, path: "demand-sla-scan", clientIp }, "Cron demand-sla-scan failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/demand-notdienst-escalate", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batchSize = Math.min(100, parseInt(req.body?.batch_size, 10) || 50);
      const { escalated } = await marketplaceService.notdienstEscalationDemands(pool, batchSize);
      logger.info({ path: "demand-notdienst-escalate", clientIp, escalated }, "Cron demand-notdienst-escalate completed");
      res.json({ ok: true, escalated });
    } catch (e) {
      logger.error({ err: e, path: "demand-notdienst-escalate", clientIp }, "Cron demand-notdienst-escalate failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/cleanup-idempotency", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batch = Math.min(5000, parseInt(req.body?.batch_size, 10) || 1000);
      const { deleted } = await idempotencyService.cleanupExpired(pool, batch);
      logger.info({ path: "cleanup-idempotency", clientIp, deleted }, "Idempotency cleanup completed");
      res.json({ ok: true, deleted });
    } catch (e) {
      logger.error({ err: e, path: "cleanup-idempotency", clientIp }, "Idempotency cleanup failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/sla-search-scan", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batchSize = Math.min(500, parseInt(req.body?.batch_size, 10) || 100);
      const { breached } = await slaSearchService.searchSlaScan(pool, batchSize);
      logger.info({ path: "sla-search-scan", clientIp, breached }, "Cron sla-search-scan completed");
      res.json({ ok: true, breached });
    } catch (e) {
      logger.error({ err: e, path: "sla-search-scan", clientIp }, "Cron sla-search-scan failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/sla-search-run", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batchSize = Math.min(100, parseInt(req.body?.batch_size, 10) || 50);
      const { processed } = await slaSearchService.runSearchJobsBatch(pool, sendMail, batchSize);
      logger.info({ path: "sla-search-run", clientIp, processed }, "Cron sla-search-run completed");
      res.json({ ok: true, processed });
    } catch (e) {
      logger.error({ err: e, path: "sla-search-run", clientIp }, "Cron sla-search-run failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  return router;
}
