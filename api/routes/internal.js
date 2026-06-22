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
import * as productAnalyticsService from "../services/productAnalyticsService.js";
import * as workerService from "../services/workerService.js";
import * as workerNotifications from "../services/workerNotificationService.js";
import * as invoiceService from "../services/invoiceService.js";
import * as assignmentStaffingService from "../services/assignmentStaffingService.js";
import * as subscriptionLifecycle from "../services/subscriptionLifecycleService.js";
import * as recurringBillingService from "../services/recurringBillingService.js";
import * as infrastructureSnapshotService from "../services/infrastructureSnapshotService.js";
import * as documentCenterService from "../services/documentCenterService.js";
import * as dealFeedbackService from "../services/dealFeedbackService.js";
import fs from "node:fs";
import path from "node:path";

/**
 * @param {{ pool, config, cronRateLimit, logger, sendMail }} deps
 */
export function createInternalRouter(deps) {
  const { pool, config, cronRateLimit, logger, sendMail } = deps;
  const cronAllowedIps = config.INTERNAL_CRON_ALLOWED_IPS || [];
  const cronSecret = config.INTERNAL_CRON_SECRET || "";
  const infraSnapshotIngestEnabled = String(config.INFRA_SNAPSHOT_INGEST_ENABLED || "true").trim().toLowerCase() !== "false";
  const infraSnapshotMaxBatch = Math.max(1, Math.min(500, Number(config.INFRA_SNAPSHOT_MAX_BATCH) || 50));
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

  // Deal-Feedback v2: einseitiges Feedback nach der Reveal-Frist enthüllen (mutual-blind).
  router.post("/internal/reveal-due-feedback", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const deadlineDays = Math.max(1, parseInt(req.body?.deadline_days, 10) || dealFeedbackService.REVEAL_DEADLINE_DAYS);
      const { revealed } = await dealFeedbackService.revealDueFeedback(pool, { deadlineDays });
      if (revealed > 0) {
        await auditLog.writeAudit(pool, { action: "deal_feedback.reveal_batch", entity_type: "deal_feedback", details: { revealed, deadlineDays } });
      }
      logger.info({ path: "reveal-due-feedback", clientIp, revealed, deadlineDays }, "Cron reveal-due-feedback completed");
      res.json({ ok: true, revealed });
    } catch (e) {
      logger.error({ err: e, path: "reveal-due-feedback", clientIp }, "Cron reveal-due-feedback failed");
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

  router.post("/internal/invoice-overdue-scan", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const overdueMarked = await invoiceService.markOverdueInvoices(pool);
      if (overdueMarked > 0) {
        await auditLog.writeAudit(pool, {
          action: "invoice.overdue_batch",
          entity_type: "invoice",
          details: { overdue_marked: overdueMarked }
        });
      }
      logger.info({ path: "invoice-overdue-scan", clientIp, overdueMarked }, "Cron invoice-overdue-scan completed");
      res.json({ ok: true, overdue_marked: overdueMarked });
    } catch (e) {
      logger.error({ err: e, path: "invoice-overdue-scan", clientIp }, "Cron invoice-overdue-scan failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* SaaS-Self-Service-Billing: wiederkehrende Folge-Rechnungen am Periodenende.
     No-Op solange RECURRING_BILLING_ENABLED=false (Default) — kein Auto-Billing
     vor UG-Gründung. AN: aktive bezahlte Subscriptions mit abgelaufener Periode
     erhalten eine Folgerechnung + werden auf past_due gesetzt (Grace/Hard-Lock greift). */
  router.post("/internal/recurring-billing", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      if (!config.RECURRING_BILLING_ENABLED) {
        return res.json({ ok: true, disabled: true, reason: "RECURRING_BILLING_ENABLED=false" });
      }
      const result = await recurringBillingService.generateRecurringInvoices(pool, { logger });
      if (result.invoiced > 0 || result.skipped > 0) {
        await auditLog.writeAudit(pool, {
          action: "subscription.recurring_billing_batch",
          entity_type: "subscription",
          details: {
            invoiced: result.invoiced,
            skipped: result.skipped,
            processed: result.processed,
            failed: result.failed.length
          }
        });
      }
      logger.info({ path: "recurring-billing", clientIp, ...result, failed: result.failed.length }, "Cron recurring-billing completed");
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error({ err: e, path: "recurring-billing", clientIp }, "Cron recurring-billing failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* SaaS-Self-Service-Billing: gestaffelte Zahlungserinnerungen (Dunning) für
     überfällige Abo-Rechnungen. No-Op solange DUNNING_ENABLED=false (Default).
     AN: versendet pro überfälliger Rechnung eine Erinnerungs-Mail je Mahnstufe (1..3). */
  router.post("/internal/dunning-sweep", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      if (!config.DUNNING_ENABLED) {
        return res.json({ ok: true, disabled: true, reason: "DUNNING_ENABLED=false" });
      }
      const result = await recurringBillingService.runDunningSweep(pool, { sendMail, logger, baseUrl: config.BASE_URL || "" });
      if (result.reminded > 0) {
        await auditLog.writeAudit(pool, {
          action: "invoice.dunning_batch",
          entity_type: "invoice",
          details: { reminded: result.reminded, processed: result.processed, failed: result.failed.length }
        });
      }
      logger.info({ path: "dunning-sweep", clientIp, ...result, failed: result.failed.length }, "Cron dunning-sweep completed");
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error({ err: e, path: "dunning-sweep", clientIp }, "Cron dunning-sweep failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* Document-Center Retention-Sweep (DSGVO/GoBD): loescht Dokumente, deren
     retention_delete_at abgelaufen ist — DB-Zeile UND physische Datei. */
  router.post("/internal/document-center-retention-sweep", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batch = Math.min(500, parseInt(req.body?.batch_size, 10) || 200);
      const { deleted, file_refs } = await documentCenterService.purgeRetentionDue(pool, { limit: batch });
      for (const ref of file_refs) {
        try { fs.unlinkSync(path.join(process.cwd(), String(ref).replace(/^\//, ""))); } catch (_e) { /* Datei evtl. schon weg */ }
      }
      if (deleted > 0) {
        await auditLog.writeAudit(pool, { action: "document_center.retention_purge", entity_type: "document_center", details: { deleted, batch } });
      }
      logger.info({ path: "document-center-retention-sweep", clientIp, deleted }, "Cron document-center retention sweep completed");
      res.json({ ok: true, deleted });
    } catch (e) {
      logger.error({ err: e, path: "document-center-retention-sweep", clientIp }, "Cron document-center retention sweep failed");
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

  /* ── Webhook Retry ──────────────────── */
  router.post("/internal/webhook-retry", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const { retryFailedDeliveries } = await import("../services/integrationService.js");
      const result = await retryFailedDeliveries(pool);
      logger.info({ path: "webhook-retry", clientIp, ...result }, "Cron webhook-retry completed");
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error({ err: e, path: "webhook-retry", clientIp }, "Cron webhook-retry failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Webhook Cleanup ────────────────── */
  router.post("/internal/webhook-cleanup", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const { cleanupOldDeliveries } = await import("../services/integrationService.js");
      const daysOld = Math.min(365, Math.max(7, parseInt(req.body?.days_old, 10) || 30));
      const deleted = await cleanupOldDeliveries(pool, daysOld);
      logger.info({ path: "webhook-cleanup", clientIp, deleted, daysOld }, "Cron webhook-cleanup completed");
      res.json({ ok: true, deleted });
    } catch (e) {
      logger.error({ err: e, path: "webhook-cleanup", clientIp }, "Cron webhook-cleanup failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/product-analytics-rollup", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const daysBack = Math.min(30, Math.max(1, parseInt(req.body?.days_back, 10) || 1));
      const result = await productAnalyticsService.runDailyAnalyticsRollup(pool, { days_back: daysBack });
      logger.info({ path: "product-analytics-rollup", clientIp, ...result }, "Cron product-analytics-rollup completed");
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error({ err: e, path: "product-analytics-rollup", clientIp }, "Cron product-analytics-rollup failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/product-analytics-retention", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const retentionDays = Math.min(730, Math.max(30, parseInt(req.body?.retention_days, 10) || 180));
      const rollupRetentionDays = Math.min(1825, Math.max(90, parseInt(req.body?.rollup_retention_days, 10) || 540));
      const result = await productAnalyticsService.cleanupAnalyticsRetention(pool, {
        retention_days: retentionDays,
        rollup_retention_days: rollupRetentionDays
      });
      logger.info({ path: "product-analytics-retention", clientIp, ...result }, "Cron product-analytics-retention completed");
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error({ err: e, path: "product-analytics-retention", clientIp }, "Cron product-analytics-retention failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Pilot Auto-Expiry ──────────────── */
  router.post("/internal/pilot-expiry", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const { expireStalePilots } = await import("../services/pilotPolicyService.js");
      const result = await expireStalePilots(pool);
      if (result.expired > 0) {
        await auditLog.writeAudit(pool, {
          action: "pilot.auto_expiry_batch",
          entity_type: "organization",
          details: { expired: result.expired, org_ids: result.ids }
        });
      }
      logger.info({ path: "pilot-expiry", clientIp, expired: result.expired }, "Cron pilot-expiry completed");
      res.json({ ok: true, expired: result.expired });
    } catch (e) {
      logger.error({ err: e, path: "pilot-expiry", clientIp }, "Cron pilot-expiry failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Usage Limit Enforcement ───────── */
  router.post("/internal/usage-limit-scan", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const { scanAndEnforceUsageLimits } = await import("../services/usageMeteringService.js");
      const limit = Math.min(500, parseInt(req.body?.batch_size, 10) || 100);
      const offset = Math.max(0, parseInt(req.body?.offset, 10) || 0);
      const result = await scanAndEnforceUsageLimits(pool, { limit, offset });
      logger.info({ path: "usage-limit-scan", clientIp, limit, offset, ...result }, "Cron usage-limit-scan completed");
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error({ err: e, path: "usage-limit-scan", clientIp }, "Cron usage-limit-scan failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/worker-document-expiry-scan", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batchSize = Math.min(500, parseInt(req.body?.batch_size, 10) || 100);
      const daysAhead = Math.min(180, Math.max(1, parseInt(req.body?.days_ahead, 10) || workerService.WORKER_DOCUMENT_EXPIRY_WARNING_DAYS));
      const result = await workerService.scanWorkerDocumentDeadlines(pool, {
        daysAhead,
        limit: batchSize,
        onExpiring: (document) => workerNotifications.notifyWorkerDocumentExpiring(
          pool,
          document.worker_user_id,
          document.id,
          document.title || document.original_name || "Nachweis",
          document.valid_until,
          document.days_until_expiry
        ),
        onExpired: (document) => workerNotifications.notifyWorkerDocumentExpired(
          pool,
          document.worker_user_id,
          document.id,
          document.title || document.original_name || "Nachweis",
          document.valid_until
        )
      });
      logger.info({ path: "worker-document-expiry-scan", clientIp, daysAhead, batchSize, ...result }, "Cron worker-document-expiry-scan completed");
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error({ err: e, path: "worker-document-expiry-scan", clientIp }, "Cron worker-document-expiry-scan failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── Subscription Lifecycle (Welle 8 Schritt 16) ──────────────
   * Vereint die drei Cron-Phasen Expiry / Activation / Cancellation
   * fuer subscription_requests in einem Tick. Idempotent: doppelte
   * Aufrufe wirken wie Single-Aufrufe, da der Status-Filter den
   * Datensatz nach erfolgreicher Verarbeitung aus dem Set entfernt.
   * ───────────────────────────────────────────────────────────── */
  router.post("/internal/subscription-lifecycle-tick", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const batchSize = Math.min(500, Math.max(1, parseInt(req.body?.batch_size, 10) || 100));
      const result = await subscriptionLifecycle.runLifecycleTick(pool, {
        batchSize,
        deps: { sendMail, logger }
      });
      const totalProcessed =
        (result.expiry?.processed || 0) +
        (result.activation?.processed || 0) +
        (result.cancellation?.processed || 0);
      if (totalProcessed > 0) {
        await auditLog.writeAudit(pool, {
          action: "subscription_request.lifecycle_tick",
          entity_type: "subscription_request",
          details: {
            expired: result.expiry?.expired || 0,
            activated: result.activation?.activated || 0,
            cancellations_applied: result.cancellation?.revoked || 0,
            failed_total:
              (result.expiry?.failed?.length || 0) +
              (result.activation?.failed?.length || 0) +
              (result.cancellation?.failed?.length || 0),
            batch_size: batchSize
          }
        });
      }
      logger.info({ path: "subscription-lifecycle-tick", clientIp, batchSize, ...result }, "Cron subscription-lifecycle-tick completed");
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error({ err: e, path: "subscription-lifecycle-tick", clientIp }, "Cron subscription-lifecycle-tick failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  router.post("/internal/staffing-maintenance", cronRateLimit, checkCronAuth, async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.body?.limit, 10) || 25));
      const cooldownMinutes = Math.min(1440, Math.max(1, parseInt(req.body?.cooldown_minutes, 10) || 15));
      const result = await assignmentStaffingService.runStaffingMaintenance(pool, { limit, cooldownMinutes });
      if (
        result.expired_invites > 0
        || result.expired_reservations > 0
        || result.campaigns_created > 0
      ) {
        await auditLog.writeAudit(pool, {
          action: "assignment.staffing_maintenance_batch",
          entity_type: "assignment_staffing_campaign",
          details: {
            expired_invites: result.expired_invites,
            expired_reservations: result.expired_reservations,
            assignments_considered: result.assignments_considered,
            assignments_backfilled: result.assignments_backfilled,
            campaigns_created: result.campaigns_created,
            invited_workers: result.invited_workers,
            skipped_no_candidates: result.skipped_no_candidates,
            cooldown_minutes: cooldownMinutes,
            limit
          }
        });
      }
      logger.info({ path: "staffing-maintenance", clientIp, limit, cooldownMinutes, ...result }, "Cron staffing-maintenance completed");
      res.json({ ok: true, ...result });
    } catch (e) {
      logger.error({ err: e, path: "staffing-maintenance", clientIp }, "Cron staffing-maintenance failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  const ingestInfrastructureSnapshots = async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    if (!infraSnapshotIngestEnabled) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    try {
      const body = req.body;
      let incomingSnapshots = [];
      if (Array.isArray(body)) {
        incomingSnapshots = body;
      } else if (Array.isArray(body?.snapshots)) {
        incomingSnapshots = body.snapshots;
      } else if (body && typeof body === "object" && (body.host_name || body.host)) {
        incomingSnapshots = [body];
      }
      if (!incomingSnapshots.length) {
        return res.status(400).json({
          error: "INVALID_PAYLOAD",
          message: "Erwartet snapshots[] oder ein Snapshot-Objekt mit host_name."
        });
      }

      const requestedBatchSize = Math.max(
        1,
        Math.min(infraSnapshotMaxBatch, Number.parseInt(String(body?.batch_size || ""), 10) || infraSnapshotMaxBatch)
      );
      const snapshots = incomingSnapshots.slice(0, requestedBatchSize);
      const dropped = Math.max(0, incomingSnapshots.length - snapshots.length);
      const source = String(body?.source || "internal_collector").trim() || "internal_collector";

      const result = await infrastructureSnapshotService.ingestInfrastructureSnapshots(pool, snapshots, { source });
      logger.info(
        {
          path: "infrastructure-snapshots-ingest",
          clientIp,
          source,
          requested: incomingSnapshots.length,
          accepted: snapshots.length,
          dropped,
          inserted: result.inserted,
          failed: result.failed,
          critical_hosts: result.critical_hosts
        },
        "Cron infrastructure-snapshots-ingest completed"
      );
      return res.json({ ok: true, source, dropped, ...result });
    } catch (e) {
      logger.error({ err: e, path: "infrastructure-snapshots-ingest", clientIp }, "Cron infrastructure-snapshots-ingest failed");
      return res.status(500).json({ error: "SERVER_ERROR" });
    }
  };

  router.post("/internal/infrastructure-snapshots/ingest", cronRateLimit, checkCronAuth, ingestInfrastructureSnapshots);
  router.post("/internal/infrastructure-snapshot-ingest", cronRateLimit, checkCronAuth, ingestInfrastructureSnapshots);

  return router;
}
