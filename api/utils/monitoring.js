/**
 * Error Monitoring (Sentry v9) – Conditional Init.
 *
 * Nur aktiv wenn SENTRY_DSN als Environment-Variable gesetzt ist.
 * Ohne SENTRY_DSN: alle Calls sind no-ops (kein Fehler, kein Crash).
 *
 * Architektur:
 *   server.js  → await initMonitoring()           // VOR createApp()
 *   app.js     → app.use(sentryContextMiddleware)  // NACH session + orgContext
 *              → setupSentryErrorHandler(app)      // NACH allen Routes
 *              → app.use(customErrorHandler)        // NACH Sentry Error Handler
 *
 * PII-Schutz:
 *   - sendDefaultPii: false
 *   - beforeSend scrubbt Cookies, Auth-Header, CSRF-Tokens, Request-Body
 *   - User-Kontext nur als anonyme ID (kein Name, keine E-Mail)
 */

let Sentry = null;
let initialized = false;

/* ── Sensitive headers die NIE an Sentry gesendet werden ─── */
const SCRUBBED_HEADERS = [
  "cookie", "authorization", "x-csrf-token",
  "x-admin-secret", "x-internal-secret"
];

/**
 * Initialize Sentry if SENTRY_DSN is configured.
 * Safe to call multiple times (idempotent).
 * MUST be called BEFORE Express app is created (server.js top-level).
 *
 * @param {Object} [opts]
 * @param {string} [opts.dsn]         - Override for SENTRY_DSN env var
 * @param {string} [opts.environment] - e.g. 'production', 'staging'
 * @param {string} [opts.release]     - e.g. 'tempconnect-api@2.0.0'
 */
export async function initMonitoring(opts = {}) {
  if (initialized) return;
  const dsn = opts.dsn || process.env.SENTRY_DSN || "";
  if (!dsn) {
    initialized = true;
    return;
  }
  try {
    Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      environment: opts.environment || process.env.NODE_ENV || "development",
      release: opts.release || `tempconnect-api@${process.env.npm_package_version || "2.0.0"}`,

      /* ── Sampling ────────────────────────────────────── */
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),

      /* ── PII Protection ─────────────────────────────── */
      sendDefaultPii: false,

      /* ── Scrub sensitive data before it leaves the process ── */
      beforeSend(event) {
        if (event.request?.headers) {
          for (const h of SCRUBBED_HEADERS) {
            delete event.request.headers[h];
          }
        }
        // Never send request body (could contain passwords, tokens, PII)
        if (event.request) {
          delete event.request.data;
        }
        return event;
      },

      /* ── Noise filtering ────────────────────────────── */
      ignoreErrors: [
        // Network noise (load balancer probes, dropped connections)
        "ECONNRESET",
        "ECONNREFUSED",
        "EPIPE",
        "ENOTFOUND",
        // Expected business logic (state machine rejects)
        "TransitionError"
      ]
    });
    initialized = true;
  } catch (_e) {
    // @sentry/node load failed – monitoring disabled silently
    initialized = true;
  }
}

/* ── captureException ─────────────────────────────────────── */

/**
 * Capture an exception in Sentry (no-op if not initialized).
 * @param {Error} err
 * @param {Object} [context] - Extra context to attach (e.g. { method, path })
 */
export function captureException(err, context) {
  if (!Sentry) return;
  if (context) {
    Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(context)) {
        scope.setExtra(k, v);
      }
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }
}

/* ── captureMessage ───────────────────────────────────────── */

/**
 * Capture a message in Sentry (no-op if not initialized).
 * @param {string} message
 * @param {'info'|'warning'|'error'} [level='info']
 */
export function captureMessage(message, level = "info") {
  if (!Sentry) return;
  Sentry.captureMessage(message, level);
}

/* ── Express context middleware ───────────────────────────── */

/**
 * Enriches Sentry scope with per-request context.
 * Must be placed AFTER correlationMiddleware, session, and orgContextMiddleware.
 *
 * Tags set (filterable in Sentry dashboard):
 *   correlation_id, org_id
 * User set (only anonymous ID — no email/name):
 *   { id: session.userId }
 */
export function sentryContextMiddleware(req, _res, next) {
  if (!Sentry) return next();

  if (req.correlationId) {
    Sentry.setTag("correlation_id", req.correlationId);
  }
  if (req.session?.userId) {
    Sentry.setUser({ id: req.session.userId });
  }
  if (req.orgId) {
    Sentry.setTag("org_id", req.orgId);
  }
  next();
}

/* ── Express error handler (Sentry v9) ───────────────────── */

/**
 * Registers Sentry's Express error handler on the app.
 * Must be called AFTER all routes, BEFORE custom error handler.
 * No-op when Sentry is not loaded.
 *
 * @param {import('express').Application} app
 */
export function setupSentryErrorHandler(app) {
  if (!Sentry?.setupExpressErrorHandler) return;
  Sentry.setupExpressErrorHandler(app);
}

/* ── Deprecated: kept as no-op for backward compat ───────── */

/** @deprecated Use setupSentryErrorHandler(app) instead */
export function sentryErrorHandler(_req, _res, next) {
  next();
}

/* ── Status / diagnostics ─────────────────────────────────── */

/**
 * Check if monitoring is active (Sentry loaded and initialized).
 */
export function isMonitoringActive() {
  return !!Sentry;
}
