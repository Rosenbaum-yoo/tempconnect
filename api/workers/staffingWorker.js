/**
 * Staffing worker — processes background delivery jobs for worker staffing requests.
 * Keeps invite delivery and reminder notifications queue-based and retry-capable.
 */

import { Worker } from "bullmq";
import { getConnectionOpts } from "../queue/connection.js";
import { logger } from "../config/index.js";
import { pool } from "../db/pool.js";

export function startStaffingWorker() {
  const conn = getConnectionOpts();
  if (!conn) return null;

  const worker = new Worker("staffing", async (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, "Processing staffing job");

    const { processStaffingDeliveryJob } = await import("../services/assignmentStaffingService.js");
    return processStaffingDeliveryJob(pool, {
      inviteId: job.data?.inviteId,
      kind: job.data?.kind || "initial"
    });
  }, {
    connection: conn,
    concurrency: 6
  });

  worker.on("completed", (job) => logger.info({ jobId: job.id, jobName: job.name }, "Staffing job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err: err.message }, "Staffing job failed"));

  return worker;
}
