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

/**
 * Plant die wiederkehrenden Capacity-Sweeps (BullMQ Job Scheduler, idempotent via Scheduler-ID,
 * ueberlebt Neustarts ohne Duplikate). Bisher gab es zwar den capacity-Worker, aber NICHTS
 * hat die Jobs eingeplant -> Expiry lief nie. Taeglich 03:00:
 *  - capacity-expiry: abgelaufene Angebote (Supply availability_to/valid_until + Demand end_date) -> status='expired'
 *  - capacity-stale-check: ueberfaellige Eintraege zur Reconfirmation melden
 */
function scheduleCapacitySweeps() {
  const q = capacityQueue();
  if (!q || typeof q.upsertJobScheduler !== "function") return;
  q.upsertJobScheduler("capacity-expiry-daily", { pattern: "0 3 * * *" }, { name: "capacity-expiry" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule capacity-expiry sweep"));
  q.upsertJobScheduler("capacity-stale-daily", { pattern: "30 3 * * *" }, { name: "capacity-stale-check" })
    .catch((e) => logger.warn({ err: e.message }, "Could not schedule capacity-stale sweep"));
}

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
  if (capacity) {
    instrumentWorker(capacity, "capacity");
    _workers.push(capacity);
    scheduleCapacitySweeps();
  }

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
