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
        const { expireStaleEntries, expireDemandRequests } = await import("../services/capacityExchangeService.js");
        const result = await expireStaleEntries(pool, job.data?.batchSize || 100);
        const demandResult = await expireDemandRequests(pool, job.data?.batchSize || 100);
        logger.info({ jobId: job.id, expired: result.expired, demandExpired: demandResult.expired }, "Capacity expiry completed");

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
            } catch { /* non-critical */ }
          }
        }

        return { ...result, demandExpired: demandResult.expired };
      }

      /* P10/E5 — Aufbewahrung des Zustands-Protokolls (24 Monate, Owner
       * 2026-08-13). Laeuft in dieser Queue mit, weil sie bereits einen
       * taeglichen Takt hat; eine eigene Queue fuer einen DELETE waere
       * Infrastruktur ohne Gegenwert. Die Frist selbst steht in der Datenbank. */
      case "worker-status-events-retention": {
        const { aufbewahrungDurchsetzen } = await import("../services/workerStatusEventService.js");
        const result = await aufbewahrungDurchsetzen(pool);
        logger.info({ jobId: job.id, geloescht: result.geloescht }, "Zustands-Protokoll aufgeraeumt (24 Monate)");
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
            } catch { /* non-critical */ }
          }
        }

        return { staleCount: stale.length };
      }

      /* Antwortfrist (Migration 193 + 195). Laeuft in dieser Queue mit, weil sie
       * den Scheduler bereits hat — dieselbe Begruendung wie bei der
       * Aufbewahrung darueber. Dieselbe Servicefunktion wie der interne
       * Endpunkt; wer zuerst kommt, gewinnt, der andere aendert nichts.
       *
       * Der Job-Name bleibt `ersatz-frist`: Der BullMQ-Scheduler ist unter
       * diesem Schluessel registriert (`ersatz-frist-10min`), und ein
       * umbenannter Job hinterliesse den alten Scheduler verwaist, waehrend der
       * neue erst beim naechsten Start entsteht. Der Name ist eine Adresse,
       * keine Beschreibung. */
      case "ersatz-frist": {
        const { verfalleneAnfragen } = await import("../services/workerService.js");
        const result = await verfalleneAnfragen(pool);
        if (result.verfallen > 0 || result.erinnert > 0) {
          logger.info({ jobId: job.id, ...result }, "Frist-Sweep: Anfragen verfallen/erinnert");
        }
        return result;
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
