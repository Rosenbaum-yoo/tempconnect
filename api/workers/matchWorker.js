/**
 * Match worker — processes jobs from the "match" queue.
 * Delegates to the existing matchingEngine for scoring.
 */

import { Worker } from "bullmq";
import { getConnectionOpts } from "../queue/connection.js";
import { logger } from "../config/index.js";
import { pool } from "../db/pool.js";

/**
 * Start the match worker. Returns the Worker instance (or null if Redis unavailable).
 */
export function startMatchWorker() {
  const conn = getConnectionOpts();
  if (!conn) return null;

  const worker = new Worker("match", async (job) => {
    const { requestId } = job.data;
    logger.info({ jobId: job.id, requestId }, "Processing match job");

    // Dynamic import to avoid circular deps at module load time
    const { findMatches } = await import("../services/matchingEngine.js");
    const matches = await findMatches(pool, requestId);
    logger.info({ jobId: job.id, requestId, matchCount: matches.length }, "Match job completed");
    return { matchCount: matches.length, topScore: matches[0]?.score ?? null };
  }, {
    connection: conn,
    concurrency: 3
  });

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "Match job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err: err.message }, "Match job failed"));

  return worker;
}
