/**
 * TempConnect — Prometheus Metrics
 *
 * Exports:
 *   metricsMiddleware  — Express middleware for HTTP request instrumentation
 *   metricsEndpoint    — Handler for GET /metrics (Prometheus scrape target)
 *   registerDbPoolMetrics — Registers pg Pool gauges (call once at startup)
 *
 * Metrics exposed:
 *   http_requests_total           — Counter  (method, route, status_code)
 *   http_request_duration_seconds — Histogram (method, route, status_code)
 *   http_requests_in_flight       — Gauge
 *   db_pool_total_count           — Gauge
 *   db_pool_idle_count            — Gauge
 *   db_pool_waiting_count         — Gauge
 *   queue_jobs_completed_total    — Counter  (queue)
 *   queue_jobs_failed_total       — Counter  (queue)
 *   queue_jobs_duration_seconds   — Histogram (queue)
 *   queue_jobs_waiting            — Gauge    (queue)
 *   queue_jobs_active             — Gauge    (queue)
 *   + prom-client defaults (nodejs_*, process_*)
 */

import client from "prom-client";

// ── Registry ────────────────────────────────────────────────────────────────
const register = new client.Registry();

register.setDefaultLabels({ service: "tempconnect-api" });

// Node.js defaults: heap, event loop, GC, active handles, open FDs
client.collectDefaultMetrics({ register, prefix: "" });

// ── HTTP Metrics ────────────────────────────────────────────────────────────

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register]
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  // Buckets optimiert fuer typische API-Latenz: 10ms bis 10s
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

const httpRequestsInFlight = new client.Gauge({
  name: "http_requests_in_flight",
  help: "HTTP requests currently being processed",
  registers: [register]
});

// ── Route Normalization ─────────────────────────────────────────────────────
// Verhindert Label-Kardinalitaetsexplosion durch dynamische Pfadsegmente.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_RE = /\/\d+(?=\/|$)/g;

/**
 * Normalisiert eine Route:
 * - Express-gematchte Route bevorzugt (z.B. /api/listings/:id)
 * - Fallback: UUIDs und Zahlen durch Platzhalter ersetzen
 */
function normalizeRoute(req) {
  // Express setzt req.route.path fuer gematchte Routen
  if (req.route?.path) {
    // baseUrl enthaelt das Mount-Prefix (z.B. /api)
    return (req.baseUrl || "") + req.route.path;
  }

  // Fallback: dynamische Segmente normalisieren
  return req.path
    .replace(UUID_RE, ":id")
    .replace(NUMERIC_RE, "/:id");
}

// ── Endpoints die NICHT instrumentiert werden ────────────────────────────────
const SKIP_PATHS = new Set(["/health", "/metrics", "/api/health"]);

// ── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware — muss frueh in der Kette registriert werden.
 * Misst Request-Dauer und zaehlt Requests nach method/route/status.
 */
export function metricsMiddleware(req, res, next) {
  if (SKIP_PATHS.has(req.path)) {
    return next();
  }

  httpRequestsInFlight.inc();
  const end = httpRequestDuration.startTimer();

  res.on("finish", () => {
    httpRequestsInFlight.dec();
    const route = normalizeRoute(req);
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode
    };
    httpRequestsTotal.inc(labels);
    end(labels);
  });

  next();
}

// ── Metrics Endpoint Handler ────────────────────────────────────────────────

/**
 * Express handler fuer GET /metrics.
 * Liefert Prometheus-Text-Format.
 */
export async function metricsEndpoint(_req, res) {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
}

// ── DB Pool Metrics ─────────────────────────────────────────────────────

/**
 * Registriert pg Pool Gauges. Einmal bei App-Start aufrufen.
 * @param {import('pg').Pool} pool
 */
export function registerDbPoolMetrics(pool) {
  if (!pool) return;

  new client.Gauge({
    name: "db_pool_total_count",
    help: "Total number of connections in the pool (active + idle)",
    registers: [register],
    collect() {
      this.set(pool.totalCount);
    }
  });

  new client.Gauge({
    name: "db_pool_idle_count",
    help: "Number of idle connections in the pool",
    registers: [register],
    collect() {
      this.set(pool.idleCount);
    }
  });

  new client.Gauge({
    name: "db_pool_waiting_count",
    help: "Number of queued requests waiting for a connection",
    registers: [register],
    collect() {
      this.set(pool.waitingCount);
    }
  });
}

// ── DB Query Metrics ────────────────────────────────────────────────────

const dbQueryErrors = new client.Counter({
  name: "db_query_errors_total",
  help: "Total number of failed database queries",
  labelNames: ["operation"],
  registers: [register]
});

const dbQueryDuration = new client.Histogram({
  name: "db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["operation", "status"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

const dbConnectionErrors = new client.Counter({
  name: "db_connection_errors_total",
  help: "Total number of pool-level connection errors",
  registers: [register]
});

/**
 * Extrahiert den Operationsnamen aus einem SQL-String (SELECT, INSERT, etc.).
 * @param {string|{text:string}} queryOrConfig
 * @returns {string}
 */
function extractOperation(queryOrConfig) {
  const sql = typeof queryOrConfig === "string" ? queryOrConfig : queryOrConfig?.text;
  if (!sql) return "unknown";
  const match = sql.trimStart().match(/^(SELECT|INSERT|UPDATE|DELETE|WITH|BEGIN|COMMIT|ROLLBACK)/i);
  return match ? match[1].toUpperCase() : "other";
}

/**
 * Wraps a pg Pool so that every pool.query() is automatically instrumented
 * with duration and error metrics. Call once at app startup.
 *
 * Also listens for pool-level connection errors.
 *
 * @param {import('pg').Pool} pool
 */
export function wrapPoolWithMetrics(pool) {
  if (!pool || pool.__metricsWrapped) return;

  const originalQuery = pool.query.bind(pool);

  pool.query = function instrumentedQuery(...args) {
    const operation = extractOperation(args[0]);
    const end = dbQueryDuration.startTimer();

    // pool.query can return a promise or accept a callback.
    // We handle the promise path (standard in our codebase).
    const result = originalQuery(...args);

    // Guard: if result is thenable, hook into it
    if (result && typeof result.then === "function") {
      return result.then(
        (res) => { end({ operation, status: "success" }); return res; },
        (err) => { end({ operation, status: "error" }); dbQueryErrors.inc({ operation }); throw err; }
      );
    }

    // Fallback for non-promise (callback) usage — can't instrument timing
    return result;
  };

  // Connection-level errors (e.g. idle client error, lost connection)
  pool.on("error", () => {
    dbConnectionErrors.inc();
  });

  pool.__metricsWrapped = true;
}

// ── Queue Metrics ───────────────────────────────────────────────────────

const queueJobsCompleted = new client.Counter({
  name: "queue_jobs_completed_total",
  help: "Total number of completed queue jobs",
  labelNames: ["queue"],
  registers: [register]
});

const queueJobsFailed = new client.Counter({
  name: "queue_jobs_failed_total",
  help: "Total number of failed queue jobs",
  labelNames: ["queue"],
  registers: [register]
});

const queueJobsDuration = new client.Histogram({
  name: "queue_jobs_duration_seconds",
  help: "Queue job processing duration in seconds",
  labelNames: ["queue"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [register]
});

/**
 * Registers BullMQ queue gauges (waiting + active job counts).
 * Uses collect() callbacks — values are fetched lazily on each Prometheus scrape.
 *
 * @param {Array<{name: string, queue: import('bullmq').Queue}>} queues
 */
export function registerQueueMetrics(queues) {
  if (!queues || queues.length === 0) return;

  new client.Gauge({
    name: "queue_jobs_waiting",
    help: "Number of jobs waiting in the queue",
    labelNames: ["queue"],
    registers: [register],
    async collect() {
      this.reset();
      for (const { name, queue } of queues) {
        try {
          const counts = await queue.getJobCounts("waiting");
          this.set({ queue: name }, counts.waiting || 0);
        } catch { /* Redis unavailable — skip */ }
      }
    }
  });

  new client.Gauge({
    name: "queue_jobs_active",
    help: "Number of jobs currently being processed",
    labelNames: ["queue"],
    registers: [register],
    async collect() {
      this.reset();
      for (const { name, queue } of queues) {
        try {
          const counts = await queue.getJobCounts("active");
          this.set({ queue: name }, counts.active || 0);
        } catch { /* Redis unavailable — skip */ }
      }
    }
  });
}

/**
 * Instruments a BullMQ Worker with Prometheus metrics.
 * Attaches event listeners for completed/failed and tracks job duration.
 *
 * @param {import('bullmq').Worker} worker
 * @param {string} queueName
 */
// Registry-Export fuer programmatischen Zugriff (z.B. System-Health-Diagnostics)
export { register as metricsRegistry };

export function instrumentWorker(worker, queueName) {
  if (!worker) return;

  worker.on("completed", (job) => {
    queueJobsCompleted.inc({ queue: queueName });
    // Track duration if BullMQ provides timestamps
    if (job?.processedOn && job?.finishedOn) {
      const durationSec = (job.finishedOn - job.processedOn) / 1000;
      if (durationSec >= 0) {
        queueJobsDuration.observe({ queue: queueName }, durationSec);
      }
    }
  });

  worker.on("failed", () => {
    queueJobsFailed.inc({ queue: queueName });
  });
}
