/**
 * Shared Redis connection for BullMQ queues & workers.
 * Re-uses REDIS_URL from config. Gracefully degrades when Redis is unavailable.
 */

import { config, logger } from "../config/index.js";

let _connection = null;

/**
 * Returns an IORedis-compatible connection options object for BullMQ.
 * BullMQ creates its own IORedis instances internally — we just provide the config.
 */
export function getConnectionOpts() {
  if (!config.REDIS_URL) {
    logger.warn("REDIS_URL not set — BullMQ queues will be unavailable");
    return null;
  }
  if (!_connection) {
    const url = new URL(config.REDIS_URL);
    _connection = {
      host: url.hostname,
      port: Number(url.port) || 6379,
      ...(url.password && { password: decodeURIComponent(url.password) }),
      ...(url.pathname && url.pathname.length > 1 && { db: Number(url.pathname.slice(1)) }),
      maxRetriesPerRequest: null,   // required by BullMQ
      enableReadyCheck: false
    };
  }
  return _connection;
}

/**
 * Checks whether a BullMQ-capable Redis connection is configured.
 */
export function isQueueAvailable() {
  return !!config.REDIS_URL;
}
