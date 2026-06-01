/**
 * Worker bootstrap — starts all BullMQ workers.
 * Called once from server.js after the app has started.
 */

import { isQueueAvailable } from "../queue/connection.js";
import { startEmailWorker } from "./emailWorker.js";
import { startMatchWorker } from "./matchWorker.js";
import { startCapacityWorker } from "./capacityWorker.js";
import { startStaffingWorker } from "./staffingWorker.js";
import { instrumentWorker, registerQueueMetrics } from "../utils/metrics.js";
import { emailQueue, matchQueue, capacityQueue, staffingQueue } from "../queue/queues.js";
import { logger } from "../config/index.js";

const _workers = [];

export function startWorkers() {
  if (!isQueueAvailable()) {
    logger.info("Redis not configured — background workers disabled");
    return;
  }

  const email = startEmailWorker();
  if (email) { instrumentWorker(email, "email"); _workers.push(email); }

  const match = startMatchWorker();
  if (match) { instrumentWorker(match, "match"); _workers.push(match); }

  const capacity = startCapacityWorker();
  if (capacity) { instrumentWorker(capacity, "capacity"); _workers.push(capacity); }

  const staffing = startStaffingWorker();
  if (staffing) { instrumentWorker(staffing, "staffing"); _workers.push(staffing); }

  // Register queue gauges (waiting/active counts) for Prometheus scraping
  const queues = [
    { name: "email", queue: emailQueue() },
    { name: "match", queue: matchQueue() },
    { name: "capacity", queue: capacityQueue() },
    { name: "staffing", queue: staffingQueue() }
  ].filter(q => q.queue);
  registerQueueMetrics(queues);

  logger.info({ count: _workers.length }, "Background workers started");
}

export async function stopWorkers() {
  for (const w of _workers) {
    try { await w.close(); } catch (e) { logger.warn({ err: e.message }, "Error stopping worker"); }
  }
  _workers.length = 0;
}
