/**
 * Email worker — processes jobs from the "email" queue.
 * Delegates to the existing emailService for actual delivery.
 */

import { Worker } from "bullmq";
import { getConnectionOpts } from "../queue/connection.js";
import { logger } from "../config/index.js";
import * as emailService from "../services/emailService.js";

/**
 * Start the email worker. Returns the Worker instance (or null if Redis unavailable).
 */
export function startEmailWorker() {
  const conn = getConnectionOpts();
  if (!conn) return null;

  const worker = new Worker("email", async (job) => {
    const { to, subject, html, text, templateName, templateData } = job.data;
    logger.info({ jobId: job.id, to, subject, templateName }, "Processing email job");
    await emailService.sendMail({ to, subject, html, text });
  }, {
    connection: conn,
    concurrency: 5,
    limiter: { max: 20, duration: 60_000 }   // max 20 emails / min
  });

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "Email job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err: err.message }, "Email job failed"));

  return worker;
}
