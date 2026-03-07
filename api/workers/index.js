/**
 * Worker bootstrap — starts all BullMQ workers.
 * Called once from server.js after the app has started.
 */

import { isQueueAvailable } from "../queue/connection.js";
import { startEmailWorker } from "./emailWorker.js";
import { startMatchWorker } from "./matchWorker.js";
import { startCapacityWorker } from "./capacityWorker.js";
import { logger } from "../config/index.js";

const _workers = [];

export function startWorkers() {
  if (!isQueueAvailable()) {
    logger.info("Redis not configured — background workers disabled");
    return;
  }

  const email = startEmailWorker();
  if (email) _workers.push(email);

  const match = startMatchWorker();
  if (match) _workers.push(match);

  const capacity = startCapacityWorker();
  if (capacity) _workers.push(capacity);

  logger.info({ count: _workers.length }, "Background workers started");
}

export async function stopWorkers() {
  for (const w of _workers) {
    try { await w.close(); } catch (e) { logger.warn({ err: e.message }, "Error stopping worker"); }
  }
  _workers.length = 0;
}
