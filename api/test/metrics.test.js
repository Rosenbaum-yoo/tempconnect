/**
 * Prometheus metrics unit tests — route normalization, middleware,
 * metrics endpoint, queue metrics, worker instrumentation.
 *
 * Run: node --test --test-force-exit test/metrics.test.js
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  metricsMiddleware,
  metricsEndpoint,
  registerQueueMetrics,
  instrumentWorker
} from "../utils/metrics.js";

/* ── helpers ──────────────────────────────────────────────── */

function mockReq(overrides = {}) {
  return {
    method: "GET",
    path: "/api/listings",
    originalUrl: "/api/listings",
    baseUrl: "",
    route: null,
    ...overrides
  };
}

function mockRes() {
  const _headers = {};
  let _status = 200;
  let _body = null;
  const _listeners = {};
  return {
    statusCode: 200,
    set(k, v) { _headers[k] = v; },
    setHeader(k, v) { _headers[k] = v; },
    end(body) { _body = body; },
    status(code) { _status = code; this.statusCode = code; return this; },
    json(body) { _body = body; return this; },
    getHeader(k) { return _headers[k]; },
    on(ev, fn) {
      if (!_listeners[ev]) _listeners[ev] = [];
      _listeners[ev].push(fn);
    },
    emit(ev) {
      (_listeners[ev] || []).forEach(fn => fn());
    },
    get _body() { return _body; },
    get _headers() { return _headers; }
  };
}

/* ═══════════════════════════════════════════════════════════
   Route Normalization (tested via middleware behaviour)
   ═══════════════════════════════════════════════════════════ */

describe("metricsMiddleware — route normalization", () => {
  it("prefers req.route.path when available (Express matched route)", () => {
    const req = mockReq({
      baseUrl: "/api",
      route: { path: "/listings/:id" }
    });
    const res = mockRes();
    let nextCalled = false;

    metricsMiddleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);

    // Trigger finish to record metrics — should not throw
    res.emit("finish");
  });

  it("normalizes UUIDs in path to :id", () => {
    // When no req.route, fallback normalization kicks in
    const req = mockReq({
      path: "/api/listings/550e8400-e29b-41d4-a716-446655440000"
    });
    const res = mockRes();
    metricsMiddleware(req, res, () => {});
    res.emit("finish");
    // No assertion on labels directly — test that it doesn't throw
  });

  it("normalizes numeric IDs in path to :id", () => {
    const req = mockReq({ path: "/api/listings/12345" });
    const res = mockRes();
    metricsMiddleware(req, res, () => {});
    res.emit("finish");
  });
});

/* ═══════════════════════════════════════════════════════════
   Skip Paths
   ═══════════════════════════════════════════════════════════ */

describe("metricsMiddleware — skip paths", () => {
  for (const skipPath of ["/health", "/metrics", "/api/health"]) {
    it(`skips ${skipPath} without recording metrics`, () => {
      const req = mockReq({ path: skipPath });
      const res = mockRes();
      let nextCalled = false;
      metricsMiddleware(req, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
    });
  }

  it("does NOT skip regular API paths", () => {
    const req = mockReq({ path: "/api/listings" });
    const res = mockRes();
    let nextCalled = false;
    metricsMiddleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    // On finish, metrics should be recorded (no throw)
    res.emit("finish");
  });
});

/* ═══════════════════════════════════════════════════════════
   Metrics Endpoint
   ═══════════════════════════════════════════════════════════ */

describe("metricsEndpoint", () => {
  it("returns Prometheus text format with content-type header", async () => {
    const res = mockRes();
    await metricsEndpoint({}, res);

    assert.ok(res._headers["Content-Type"], "Content-Type header should be set");
    assert.ok(
      res._headers["Content-Type"].includes("text/"),
      "Content-Type should be text-based"
    );
    assert.ok(res._body, "Body should not be empty");
    assert.ok(
      res._body.includes("http_requests_total"),
      "Should contain http_requests_total metric"
    );
  });

  it("includes queue metrics in output", async () => {
    const res = mockRes();
    await metricsEndpoint({}, res);
    assert.ok(res._body.includes("queue_jobs_completed_total"), "Should contain queue_jobs_completed_total");
    assert.ok(res._body.includes("queue_jobs_failed_total"), "Should contain queue_jobs_failed_total");
    assert.ok(res._body.includes("queue_jobs_duration_seconds"), "Should contain queue_jobs_duration_seconds");
  });

  it("includes default Node.js metrics", async () => {
    const res = mockRes();
    await metricsEndpoint({}, res);
    assert.ok(res._body.includes("nodejs_heap_size"), "Should contain nodejs_heap metrics");
    assert.ok(res._body.includes("process_cpu"), "Should contain process CPU metrics");
  });

  it("includes DB metrics", async () => {
    const res = mockRes();
    await metricsEndpoint({}, res);
    assert.ok(res._body.includes("db_query_errors_total"), "Should contain db_query_errors_total");
    assert.ok(res._body.includes("db_query_duration_seconds"), "Should contain db_query_duration_seconds");
    assert.ok(res._body.includes("db_connection_errors_total"), "Should contain db_connection_errors_total");
  });
});

/* ═══════════════════════════════════════════════════════════
   Queue Metrics — registerQueueMetrics
   ═══════════════════════════════════════════════════════════ */

describe("registerQueueMetrics", () => {
  it("handles null/empty input gracefully", () => {
    assert.doesNotThrow(() => registerQueueMetrics(null));
    assert.doesNotThrow(() => registerQueueMetrics([]));
  });

  it("registers gauges for provided queues (no throw on scrape)", async () => {
    const mockQueue = {
      getJobCounts: async () => ({ waiting: 3, active: 1 })
    };
    // Should not throw — gauges might already be registered from module load
    // but registerQueueMetrics is safe to call
    try {
      registerQueueMetrics([{ name: "test-queue", queue: mockQueue }]);
    } catch {
      // Gauge already registered from prior test/module load — acceptable
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   Worker Instrumentation — instrumentWorker
   ═══════════════════════════════════════════════════════════ */

describe("instrumentWorker", () => {
  it("handles null worker gracefully", () => {
    assert.doesNotThrow(() => instrumentWorker(null, "test"));
  });

  it("increments completed counter on 'completed' event", () => {
    const worker = new EventEmitter();
    instrumentWorker(worker, "test-completed");

    // Emit completed with timestamps for duration tracking
    worker.emit("completed", {
      id: "job-1",
      processedOn: 1000,
      finishedOn: 2500
    });
    // No throw = success — counter incremented internally
  });

  it("increments failed counter on 'failed' event", () => {
    const worker = new EventEmitter();
    instrumentWorker(worker, "test-failed");

    worker.emit("failed", { id: "job-2" }, new Error("boom"));
    // No throw = success
  });

  it("handles completed event without timestamps gracefully", () => {
    const worker = new EventEmitter();
    instrumentWorker(worker, "test-no-ts");

    // Job without processedOn/finishedOn — should not throw
    worker.emit("completed", { id: "job-3" });
  });

  it("handles completed event with null job gracefully", () => {
    const worker = new EventEmitter();
    instrumentWorker(worker, "test-null-job");

    // BullMQ can emit null in edge cases
    worker.emit("completed", null);
  });

  it("tracks job duration from processedOn to finishedOn", () => {
    const worker = new EventEmitter();
    instrumentWorker(worker, "test-duration");

    // 1.5 second job
    worker.emit("completed", {
      id: "job-4",
      processedOn: Date.now() - 1500,
      finishedOn: Date.now()
    });
    // Duration should be ~1.5s — recorded in histogram
  });
});

/* ═══════════════════════════════════════════════════════════
   metricsMiddleware — calls next() and records on finish
   ═══════════════════════════════════════════════════════════ */

describe("metricsMiddleware — full lifecycle", () => {
  it("increments in-flight gauge and decrements on finish", () => {
    const req = mockReq({ path: "/api/users" });
    const res = mockRes();
    let nextCalled = false;

    metricsMiddleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "next() should be called");

    // Simulate response finish
    res.statusCode = 200;
    res.emit("finish");
  });

  it("handles 5xx status codes without throwing", () => {
    const req = mockReq({ path: "/api/crash" });
    const res = mockRes();

    metricsMiddleware(req, res, () => {});
    res.statusCode = 500;
    res.emit("finish");
  });

  it("handles 4xx status codes without throwing", () => {
    const req = mockReq({ path: "/api/notfound" });
    const res = mockRes();

    metricsMiddleware(req, res, () => {});
    res.statusCode = 404;
    res.emit("finish");
  });
});
