/**
 * Capacity Exchange worker — processes background jobs:
 * - capacity-expiry: auto-expire entries past valid_until
 * - capacity-stale-check: find stale entries needing reconfirmation
 * - capacity-stale-notify: send reconfirmation reminder notifications
 */

import { Worker } from "bullmq";
import { getConnectionOpts } from "../queue/connection.js";
import { logger } from "../config/index.js";
import { pool } from "../db/pool.js";

export function startCapacityWorker() {
  const conn = getConnectionOpts();
  if (!conn) return null;

  const worker = new Worker("capacity", async (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, "Processing capacity job");

    switch (job.name) {
      case "capacity-expiry": {
        const { expireStaleEntries } = await import("../services/capacityExchangeService.js");
        const result = await expireStaleEntries(pool, job.data?.batchSize || 100);
        logger.info({ jobId: job.id, expired: result.expired }, "Capacity expiry completed");

        // Notify suppliers of expired entries
        if (result.entries?.length > 0) {
          const { dispatch } = await import("../services/notificationMatrix.js");
          for (const entry of result.entries) {
            try {
              await dispatch(pool, "capacity.expiring_soon", {
                recipientUserIds: [entry.supplier_company_id],
                entityType: "capacity_post",
                entityId: entry.id,
                message: "Ihr Kapazitaetseintrag ist abgelaufen"
              });
            } catch (_) { /* non-critical */ }
          }
        }

        return result;
      }

      case "capacity-stale-check": {
        const { findStaleEntries } = await import("../services/capacityExchangeService.js");
        const staleDays = job.data?.staleDays || 7;
        const stale = await findStaleEntries(pool, staleDays, 100);
        logger.info({ jobId: job.id, staleCount: stale.length }, "Stale capacity check completed");

        // Notify suppliers
        if (stale.length > 0) {
          const { dispatch } = await import("../services/notificationMatrix.js");
          for (const entry of stale) {
            try {
              await dispatch(pool, "capacity.stale", {
                recipientUserIds: [entry.supplier_company_id],
                entityType: "capacity_post",
                entityId: entry.id,
                message: `"${entry.title}" benoetigt Bestaetigung`
              });
            } catch (_) { /* non-critical */ }
          }
        }

        return { staleCount: stale.length };
      }

      default:
        logger.warn({ jobName: job.name }, "Unknown capacity job type");
        return { skipped: true };
    }
  }, {
    connection: conn,
    concurrency: 2
  });

  worker.on("completed", (job) => logger.info({ jobId: job.id, jobName: job.name }, "Capacity job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err: err.message }, "Capacity job failed"));

  return worker;
}
