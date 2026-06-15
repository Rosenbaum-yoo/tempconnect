/**
 * Rate limiters: auth, request, api, cron. Optional Redis store.
 */

import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { createClient as createRedisClient } from "redis";
import crypto from "node:crypto";

/**
 * Pro-API-Key-Limitierung (Audit F1.2): API-Key-Requests werden am KEY gezaehlt
 * (SHA-256-Hash-Prefix, nie der Klartext-Key als Bucket-Name), nicht an der IP —
 * ein geleakter Key kann das Limit nicht per IP-Rotation umgehen. Header-basiert,
 * damit es unabhaengig von der Middleware-Reihenfolge (vor/nach apiKeyAuth) greift.
 * Sessions/anonyme Requests bleiben IP-basiert (bisheriges Verhalten).
 */
export function apiKeyAwareKeyGenerator(req) {
  const headers = req.headers || {};
  const auth = String(headers.authorization || "");
  const rawKey = headers["x-api-key"]
    || (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "");
  if (rawKey && String(rawKey).startsWith("tc_live_")) {
    return "key:" + crypto.createHash("sha256").update(String(rawKey)).digest("hex").slice(0, 24);
  }
  return req.ip;
}

export async function createRateLimiters(config, logger) {
  const isLocalDev = !config.BASE_URL || /localhost|127\.0\.0\.1/.test(String(config.BASE_URL || "").toLowerCase());
  const AUTH_WINDOW_MS = Number(config.RATE_LIMIT_AUTH_WINDOW_MS) || (isLocalDev ? 60 * 1000 : 15 * 60 * 1000);
  const AUTH_MAX = Number(config.RATE_LIMIT_AUTH_MAX) || (isLocalDev ? 100 : 5);
  const REQUEST_WINDOW_MS = config.RATE_LIMIT_REQUEST_WINDOW_MS || 10 * 60 * 1000;
  const REQUEST_MAX = config.RATE_LIMIT_REQUEST_MAX || (isLocalDev ? 200 : 30);
  const API_WINDOW_MS = config.RATE_LIMIT_API_WINDOW_MS || 5 * 60 * 1000;
  const API_MAX = config.RATE_LIMIT_API_MAX || (isLocalDev ? 2000 : 600);
  const ANALYTICS_WINDOW_MS = config.RATE_LIMIT_ANALYTICS_WINDOW_MS || 60 * 1000;
  const ANALYTICS_MAX = config.RATE_LIMIT_ANALYTICS_MAX || (isLocalDev ? 600 : 120);
  const OCC_WINDOW_MS = config.RATE_LIMIT_OCC_WINDOW_MS || 60 * 1000;
  const OCC_MAX = config.RATE_LIMIT_OCC_MAX || 60;
  const SUPPORT_WINDOW_MS = config.RATE_LIMIT_SUPPORT_WINDOW_MS || 60 * 1000;
  const SUPPORT_MAX = config.RATE_LIMIT_SUPPORT_MAX || (isLocalDev ? 240 : 90);
  const WARP_EXEC_WINDOW_MS = config.RATE_LIMIT_WARP_EXEC_WINDOW_MS || 60 * 60 * 1000;
  const WARP_EXEC_MAX = config.RATE_LIMIT_WARP_EXEC_MAX || (isLocalDev ? 40 : 10);
  // SCC WAVE 01: Staff-Login Rate Limiter — 5 Versuche / 15 Min pro IP in Production
  const STAFF_LOGIN_WINDOW_MS = Number(config.RATE_LIMIT_STAFF_LOGIN_WINDOW_MS) || (isLocalDev ? 60 * 1000 : 15 * 60 * 1000);
  const STAFF_LOGIN_MAX = Number(config.RATE_LIMIT_STAFF_LOGIN_MAX) || (isLocalDev ? 100 : 5);
  // SCC WAVE 03: Staff-Mutation Rate Limiter — 30 Mutationen / 5 Min pro Staff-User
  const STAFF_MUTATION_WINDOW_MS = Number(config.RATE_LIMIT_STAFF_MUTATION_WINDOW_MS) || (isLocalDev ? 60 * 1000 : 5 * 60 * 1000);
  const STAFF_MUTATION_MAX = Number(config.RATE_LIMIT_STAFF_MUTATION_MAX) || (isLocalDev ? 500 : 30);
  // Public Pilot-Voranmeldung — eigener strenger Limiter: die Route ist OHNE Auth und loest pro
  // Submit eine Opt-in-Mail an eine frei waehlbare Adresse aus (Anti-Spam/Anti-Mail-Bombing).
  const PREREG_WINDOW_MS = Number(config.RATE_LIMIT_PREREG_WINDOW_MS) || (isLocalDev ? 60 * 1000 : 15 * 60 * 1000);
  const PREREG_MAX = Number(config.RATE_LIMIT_PREREG_MAX) || (isLocalDev ? 50 : 8);

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
    keyGenerator: apiKeyAwareKeyGenerator,
    ...commonLimiterConfig,
    ...makeStore("rl:req:")
  });

  const apiLimiter = rateLimit({
    windowMs: API_WINDOW_MS,
    max: API_MAX,
    message: { error: "RATE_LIMIT", message: "Zu viele API-Aufrufe. Bitte warte." },
    skip: (req) => {
      // GET/HEAD/OPTIONS are read-only — never rate-limit navigation/data-fetching.
      // Only state-changing requests (POST/PUT/PATCH/DELETE) count towards the limit.
      if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
      // Always skip CSRF token endpoint
      const p = (req.path || "").replace(/^\/api(\/v\d+)?/, "");
      if (p === "/csrf") return true;
      // Skip analytics tracking (has its own dedicated limiter)
      if (p.startsWith("/analytics/track")) return true;
      return false;
    },
    keyGenerator: apiKeyAwareKeyGenerator,
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

  const analyticsIngestLimiter = rateLimit({
    windowMs: ANALYTICS_WINDOW_MS,
    max: ANALYTICS_MAX,
    message: { error: "RATE_LIMIT", message: "Zu viele Analytics-Events in kurzer Zeit." },
    keyGenerator: (req) => {
      const sid = req.body?.session_id ? String(req.body.session_id).slice(0, 64) : "no-session";
      return `${req.ip}:${sid}`;
    },
    ...commonLimiterConfig,
    ...makeStore("rl:analytics:")
  });

  const occRateLimit = rateLimit({
    windowMs: OCC_WINDOW_MS,
    max: OCC_MAX,
    message: {
      success: false,
      data: null,
      error: { code: "RATE_LIMIT", message: "Zu viele Anfragen." }
    },
    ...commonLimiterConfig,
    ...makeStore("rl:occ:")
  });

  const supportRateLimit = rateLimit({
    windowMs: SUPPORT_WINDOW_MS,
    max: SUPPORT_MAX,
    message: { error: "RATE_LIMIT", message: "Zu viele Support-Anfragen in kurzer Zeit." },
    keyGenerator: (req) => `${req.session?.userId || req.ip || "anon"}:${req.path || "/support"}`,
    ...commonLimiterConfig,
    ...makeStore("rl:support:")
  });

  const warpExecutionRateLimit = rateLimit({
    windowMs: WARP_EXEC_WINDOW_MS,
    max: WARP_EXEC_MAX,
    message: {
      success: false,
      data: null,
      error: { code: "RATE_LIMIT", message: "Zu viele Warp-Ausführungen. Bitte später erneut versuchen." }
    },
    keyGenerator: (req) => `${req.occAccess?.user_id || req.session?.userId || req.ip || "anon"}:${req.path || "/owner-control/warp"}`,
    ...commonLimiterConfig,
    ...makeStore("rl:warp-exec:")
  });

  // SCC WAVE 01: Staff-Login Rate Limiter
  const staffLoginLimiter = rateLimit({
    windowMs: STAFF_LOGIN_WINDOW_MS,
    max: STAFF_LOGIN_MAX,
    message: {
      success: false,
      error: { code: "SCC_RATE_LIMIT", message: "Zu viele Login-Versuche. Bitte 15 Minuten warten." }
    },
    keyGenerator: (req) => (req.ip || "unknown") + ":scc-login",
    ...commonLimiterConfig,
    ...makeStore("rl:scc-login:")
  });

  // SCC WAVE 03: Staff-Mutation Rate Limiter
  // Keyed by staffUserId aus der Staff-Session (nach /staff-Session-Mount verfuegbar),
  // Fallback auf IP wenn kein Session-User gesetzt (z.B. nicht authentifizierter Aufruf).
  const staffMutationLimiter = rateLimit({
    windowMs: STAFF_MUTATION_WINDOW_MS,
    max: STAFF_MUTATION_MAX,
    message: {
      success: false,
      error: {
        code: "SCC_MUTATION_RATE_LIMIT",
        message: "Zu viele mutierende SCC-Anfragen in kurzer Zeit. Bitte 5 Minuten warten."
      }
    },
    keyGenerator: (req) => (req.session?.staffUserId || req.ip || "unknown") + ":scc-mutation",
    skip: (req) => ["GET", "HEAD", "OPTIONS"].includes(req.method),
    ...commonLimiterConfig,
    ...makeStore("rl:scc-mutation:")
  });

  // Public Pilot-Voranmeldung: streng per IP (deutlich unter apiLimiter), da ohne Auth +
  // mail-ausloesend. Nur an der POST-Route angewandt (nicht GET counts/confirm).
  const preregLimiter = rateLimit({
    windowMs: PREREG_WINDOW_MS,
    max: PREREG_MAX,
    message: { success: false, error: { code: "RATE_LIMIT", message: "Zu viele Voranmeldungen. Bitte spaeter erneut versuchen." } },
    keyGenerator: (req) => (req.ip || "unknown") + ":prereg",
    ...commonLimiterConfig,
    ...makeStore("rl:prereg:")
  });

  /* ── Plan-aware API rate limiter ─────────────────── */
  const PLAN_RATE_LIMITS = {
    DEMO: 10,
    FREE: 10,
    BASIS: 60,
    PLUS: 120,
    PRO: 300,
    INDIVIDUELL: 600,
    ENTERPRISE: 600
  };

  /**
   * Creates a plan-aware rate limiter middleware.
   * Looks up the user's plan from session and applies per-plan limits.
   * @param {{ getUserAndPlan: Function }} deps
   */
  function createPlanAwareRateLimiter(deps) {
    // We use a simple in-memory counter per userId per minute window
    const counters = new Map();
    const WINDOW_MS = 60 * 1000;

    // Cleanup old entries every 2 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of counters) {
        if (now - entry.windowStart > WINDOW_MS * 2) counters.delete(key);
      }
    }, WINDOW_MS * 2);

    return async (req, res, next) => {
      // Skip for read-only requests
      if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

      const userId = req.session?.userId;
      if (!userId) return next();

      // Resolve plan
      let plan = "DEMO";
      try {
        if (req.user?.plan) {
          plan = req.user.plan;
        } else if (deps.getUserAndPlan) {
          const me = await deps.getUserAndPlan(userId);
          plan = me?.plan || "DEMO";
        }
      } catch { /* fallback to DEMO */ }

      const limit = PLAN_RATE_LIMITS[plan] || PLAN_RATE_LIMITS.DEMO;
      const now = Date.now();
      const key = `${userId}:planrl`;
      let entry = counters.get(key);

      if (!entry || now - entry.windowStart > WINDOW_MS) {
        entry = { windowStart: now, count: 0 };
        counters.set(key, entry);
      }

      entry.count++;
      if (entry.count > limit) {
        res.setHeader("Retry-After", String(Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)));
        return res.status(429).json({
          error: "PLAN_RATE_LIMIT",
          message: `Ratenlimit erreicht (${limit} Mutationen/Min fuer Plan ${plan}).`,
          plan,
          limit,
          retry_after_ms: entry.windowStart + WINDOW_MS - now
        });
      }
      next();
    };
  }

  return {
    authLimiter,
    requestLimiter,
    apiLimiter,
    cronRateLimit,
    analyticsIngestLimiter,
    occRateLimit,
    supportRateLimit,
    warpExecutionRateLimit,
    staffLoginLimiter,
    staffMutationLimiter,
    preregLimiter,
    createPlanAwareRateLimiter
  };
}
