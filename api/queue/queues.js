/**
 * Named BullMQ queues for background work.
 * Each queue is lazily created so the app still boots without Redis.
 */

import { Queue } from "bullmq";
import { getConnectionOpts, isQueueAvailable } from "./connection.js";
import { logger } from "../config/index.js";

const _queues = new Map();

function getOrCreate(name, opts = {}) {
  if (!isQueueAvailable()) return null;
  if (!_queues.has(name)) {
    const q = new Queue(name, { connection: getConnectionOpts(), ...opts });
    q.on("error", (err) => logger.error({ queue: name, err: err.message }, "Queue error"));
    _queues.set(name, q);
  }
  return _queues.get(name);
}

/* ── Queue accessors ─────────────────────────────────── */

export function emailQueue()    { return getOrCreate("email"); }
export function matchQueue()    { return getOrCreate("match"); }
export function capacityQueue() { return getOrCreate("capacity"); }

/* ── Convenience: add a job if the queue is available ── */

/**
 * Safely enqueue a job. Returns the Job or null if Redis is unavailable.
 */
export async function enqueue(queueFn, jobName, data, opts = {}) {
  const q = queueFn();
  if (!q) {
    logger.warn({ jobName }, "Queue unavailable — job not enqueued");
    return null;
  }
  return q.add(jobName, data, { attempts: 3, backoff: { type: "exponential", delay: 2000 }, ...opts });
}

/**
 * Gracefully close all open queues (call on shutdown).
 */
export async function closeAll() {
  for (const [name, q] of _queues) {
    try { await q.close(); } catch (e) { logger.warn({ queue: name, err: e.message }, "Error closing queue"); }
  }
  _queues.clear();
}
