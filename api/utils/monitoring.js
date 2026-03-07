/**
 * Error Monitoring (Sentry) – Conditional Init.
 * Nur aktiv wenn SENTRY_DSN als Environment-Variable gesetzt ist.
 * Ohne SENTRY_DSN: alle Calls sind no-ops (kein Fehler, kein Import).
 *
 * Usage:
 *   import { initMonitoring, captureException, captureMessage, sentryRequestHandler, sentryErrorHandler } from '../utils/monitoring.js';
 *   initMonitoring();              // in server.js, einmalig
 *   captureException(err);         // in catch-Blöcken
 *   app.use(sentryRequestHandler); // vor Routes
 *   app.use(sentryErrorHandler);   // nach Routes, vor Error-Handler
 */

let Sentry = null;
let initialized = false;

/**
 * Initialize Sentry if SENTRY_DSN is configured.
 * Safe to call multiple times (idempotent).
 * @param {Object} [opts]
 * @param {string} [opts.dsn] - Override for SENTRY_DSN env var
 * @param {string} [opts.environment] - e.g. 'production', 'staging'
 * @param {string} [opts.release] - e.g. 'tempconnect-api@1.0.0'
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
      release: opts.release || `tempconnect-api@${process.env.npm_package_version || "1.0.0"}`,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
      // Don't send PII by default
      sendDefaultPii: false
    });
    initialized = true;
  } catch (e) {
    // @sentry/node not installed – monitoring disabled
    initialized = true;
  }
}

/**
 * Capture an exception in Sentry (no-op if not initialized).
 * @param {Error} err
 * @param {Object} [context] - Extra context to attach
 */
export function captureException(err, context) {
  if (!Sentry) return;
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }
}

/**
 * Capture a message in Sentry (no-op if not initialized).
 * @param {string} message
 * @param {'info'|'warning'|'error'} [level='info']
 */
export function captureMessage(message, level = "info") {
  if (!Sentry) return;
  Sentry.captureMessage(message, level);
}

/**
 * Express request handler middleware (adds request context to Sentry).
 * Must be added BEFORE routes.
 */
export function sentryRequestHandler(req, res, next) {
  if (Sentry && Sentry.Handlers) {
    return Sentry.Handlers.requestHandler()(req, res, next);
  }
  next();
}

/**
 * Express error handler middleware (reports errors to Sentry).
 * Must be added AFTER routes, BEFORE your custom error handler.
 */
export function sentryErrorHandler(req, res, next) {
  if (Sentry && Sentry.Handlers) {
    return Sentry.Handlers.errorHandler()(req, res, next);
  }
  next();
}

/**
 * Check if monitoring is active.
 */
export function isMonitoringActive() {
  return !!Sentry;
}
