/**
 * Rate limiters: auth, request, api, cron. Optional Redis store.
 */

import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { createClient as createRedisClient } from "redis";

export async function createRateLimiters(config, logger) {
  const isLocalDev = !config.BASE_URL || /localhost|127\.0\.0\.1/.test(String(config.BASE_URL || "").toLowerCase());
  const AUTH_WINDOW_MS = Number(config.RATE_LIMIT_AUTH_WINDOW_MS) || (isLocalDev ? 60 * 1000 : 15 * 60 * 1000);
  const AUTH_MAX = Number(config.RATE_LIMIT_AUTH_MAX) || (isLocalDev ? 50 : 5);
  const REQUEST_WINDOW_MS = config.RATE_LIMIT_REQUEST_WINDOW_MS || 10 * 60 * 1000;
  const REQUEST_MAX = config.RATE_LIMIT_REQUEST_MAX || 30;
  const API_WINDOW_MS = config.RATE_LIMIT_API_WINDOW_MS || 5 * 60 * 1000;
  const API_MAX = config.RATE_LIMIT_API_MAX || 200;

  let redisClient = null;
  const RATE_LIMIT_STORE = (config.RATE_LIMIT_STORE || "memory").toLowerCase();

  if (RATE_LIMIT_STORE === "redis") {
    if (!config.REDIS_URL) {
      logger.fatal("RATE_LIMIT_STORE=redis, aber REDIS_URL fehlt");
      process.exit(1);
    }
    redisClient = createRedisClient({ url: config.REDIS_URL });
    redisClient.on("error", (err) => logger.error({ err: err.message }, "Redis-Client Fehler (Rate-Limit)"));
    await redisClient.connect();
    logger.info("Rate-Limit Store: Redis aktiv");
  } else {
    logger.info("Rate-Limit Store: Memory (pro Instanz)");
  }

  /** Jeder Limiter braucht eine eigene Store-Instanz (express-rate-limit v7). */
  function makeStore(prefix) {
    if (!redisClient) return {};
    return { store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args), prefix }) };
  }

  const commonLimiterConfig = {
    standardHeaders: true,
    legacyHeaders: false
  };

  if (isLocalDev) logger.info({ authMax: AUTH_MAX, windowSec: AUTH_WINDOW_MS / 1000 }, "Auth-Rate-Limit: lokale Umgebung (locker)");

  const authLimiter = rateLimit({
    windowMs: AUTH_WINDOW_MS,
    max: AUTH_MAX,
    message: { error: "RATE_LIMIT", message: "Zu viele Versuche. Bitte warte kurz." },
    keyGenerator: (req) => req.ip + ":" + req.path,
    ...commonLimiterConfig,
    ...makeStore("rl:auth:")
  });

  const requestLimiter = rateLimit({
    windowMs: REQUEST_WINDOW_MS,
    max: REQUEST_MAX,
    message: { error: "RATE_LIMIT", message: "Zu viele Anfragen. Bitte warte 10 Minuten." },
    ...commonLimiterConfig,
    ...makeStore("rl:req:")
  });

  const apiLimiter = rateLimit({
    windowMs: API_WINDOW_MS,
    max: API_MAX,
    message: { error: "RATE_LIMIT", message: "Zu viele API-Aufrufe. Bitte warte." },
    ...commonLimiterConfig,
    ...makeStore("rl:api:")
  });

  const cronRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: "CRON_RATE_LIMIT" },
    standardHeaders: true,
    keyGenerator: (req) => req.ip || req.socket?.remoteAddress || "unknown"
  });

  return { authLimiter, requestLimiter, apiLimiter, cronRateLimit };
}
