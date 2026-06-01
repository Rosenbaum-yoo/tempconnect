/**
 * Response Helpers & Centralized Error Handler Tests
 *
 * Tests two critical API surface contracts:
 *
 * 1. utils/response.js — ok() and fail()
 *    Guarantees every API response follows the envelope:
 *      { success: boolean, data: any|null, error: { code, message, [details] }|null }
 *
 * 2. Centralized error handler (app.js line 248–274)
 *    The final Express (err, req, res, next) middleware. Ensures:
 *      - 5xx errors get generic message (no stack leak to client)
 *      - 4xx errors forward original err.message
 *      - err.status / err.statusCode / fallback 500
 *      - err.code / fallback "SERVER_ERROR"
 *      - Response format matches fail() envelope
 *      - headersSent guard prevents double-send
 *      - logger.error for 5xx, logger.warn for 4xx
 *      - captureException is called with context
 *
 * No database, no HTTP server required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ok, fail } from "../utils/response.js";

// ── Mock factories ────────────────────────────────────────────────────────────

function mockRes() {
  let _status = null;
  let _json = null;
  let _headersSent = false;
  const self = {
    status(code) { _status = code; return self; },
    json(data) { _json = data; _headersSent = true; return self; },
    get statusCode() { return _status; },
    get body() { return _json; },
    get headersSent() { return _headersSent; }
  };
  return self;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ok()
// ═══════════════════════════════════════════════════════════════════════════════

describe("ok() — success envelope", () => {
  it("returns complete success envelope with data", () => {
    const res = mockRes();
    ok(res, { id: "abc", name: "Test" });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, {
      success: true,
      data: { id: "abc", name: "Test" },
      error: null
    });
  });

  it("defaults data to empty object when omitted", () => {
    const res = mockRes();
    ok(res);
    assert.deepStrictEqual(res.body.data, {});
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.error, null);
  });

  it("accepts custom status code (201 Created)", () => {
    const res = mockRes();
    ok(res, { created: true }, 201);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.success, true);
  });

  it("preserves null data when explicitly passed", () => {
    const res = mockRes();
    ok(res, null);
    assert.strictEqual(res.body.data, null);
    assert.strictEqual(res.body.success, true);
  });

  it("preserves array data", () => {
    const res = mockRes();
    ok(res, [1, 2, 3]);
    assert.deepStrictEqual(res.body.data, [1, 2, 3]);
  });

  it("preserves string data", () => {
    const res = mockRes();
    ok(res, "simple-value");
    assert.strictEqual(res.body.data, "simple-value");
  });

  it("always sets error to null", () => {
    const res = mockRes();
    ok(res, { anything: true }, 200);
    assert.strictEqual(res.body.error, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// fail()
// ═══════════════════════════════════════════════════════════════════════════════

describe("fail() — error envelope", () => {
  it("returns complete error envelope with code and message", () => {
    const res = mockRes();
    fail(res, "VALIDATION", "Name ist erforderlich");
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, {
      success: false,
      data: null,
      error: { code: "VALIDATION", message: "Name ist erforderlich" }
    });
  });

  it("defaults to status 400 when omitted", () => {
    const res = mockRes();
    fail(res, "INVALID_INPUT", "Bad input");
    assert.strictEqual(res.statusCode, 400);
  });

  it("accepts custom status code (404)", () => {
    const res = mockRes();
    fail(res, "NOT_FOUND", "Ressource nicht gefunden", 404);
    assert.strictEqual(res.statusCode, 404);
  });

  it("accepts custom status code (403)", () => {
    const res = mockRes();
    fail(res, "FORBIDDEN", "Zugriff verweigert", 403);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error.code, "FORBIDDEN");
  });

  it("accepts custom status code (500)", () => {
    const res = mockRes();
    fail(res, "SERVER_ERROR", "Interner Fehler", 500);
    assert.strictEqual(res.statusCode, 500);
  });

  it("always sets data to null", () => {
    const res = mockRes();
    fail(res, "ERR", "msg", 400);
    assert.strictEqual(res.body.data, null);
  });

  it("always sets success to false", () => {
    const res = mockRes();
    fail(res, "ERR", "msg");
    assert.strictEqual(res.body.success, false);
  });

  it("includes details when provided", () => {
    const zodIssues = [{ path: ["email"], message: "Invalid email" }];
    const res = mockRes();
    fail(res, "VALIDATION", "Validierung fehlgeschlagen", 400, zodIssues);
    assert.deepStrictEqual(res.body.error.details, zodIssues);
    assert.strictEqual(res.body.error.code, "VALIDATION");
    assert.strictEqual(res.body.error.message, "Validierung fehlgeschlagen");
  });

  it("omits details when undefined (not present in response)", () => {
    const res = mockRes();
    fail(res, "NOT_FOUND", "Nicht gefunden", 404);
    assert.strictEqual(res.body.error.details, undefined);
    assert.ok(!("details" in res.body.error), "details key should not exist");
  });

  it("includes details when explicitly null", () => {
    const res = mockRes();
    fail(res, "ERR", "msg", 400, null);
    assert.strictEqual(res.body.error.details, null);
    assert.ok("details" in res.body.error);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Envelope consistency — ok() and fail() produce compatible structures
// ═══════════════════════════════════════════════════════════════════════════════

describe("API envelope consistency", () => {
  it("ok() and fail() share the same top-level keys", () => {
    const okRes = mockRes();
    const failRes = mockRes();
    ok(okRes, {});
    fail(failRes, "ERR", "msg");

    const okKeys = Object.keys(okRes.body).sort();
    const failKeys = Object.keys(failRes.body).sort();
    assert.deepStrictEqual(okKeys, failKeys, "Both must have identical top-level keys");
    assert.deepStrictEqual(okKeys, ["data", "error", "success"]);
  });

  it("ok().error is always null, fail().data is always null", () => {
    const okRes = mockRes();
    const failRes = mockRes();
    ok(okRes, { x: 1 });
    fail(failRes, "ERR", "msg");
    assert.strictEqual(okRes.body.error, null);
    assert.strictEqual(failRes.body.data, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Centralized Error Handler (extracted from app.js lines 248–274)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracted error handler for isolated testing.
 * Exact replica of the app.js middleware, with injected logger and captureException.
 */
function createErrorHandler({ logger, captureException }) {
  return (err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const code = err.code || "SERVER_ERROR";
    const message = status < 500
      ? (err.message || "Unbekannter Fehler")
      : "Interner Serverfehler. Bitte spaeter erneut versuchen.";

    const logData = {
      err,
      correlationId: req.correlationId,
      method: req.method,
      url: req.originalUrl,
      status,
      errorCode: code,
      userId: req.session?.userId || undefined,
      orgId: req.orgId || undefined
    };

    if (status >= 500) {
      logger.error(logData, "server_error");
    } else {
      logger.warn(logData, "client_error");
    }

    captureException(err, { method: req.method, path: req.originalUrl, correlationId: req.correlationId });
    if (!res.headersSent) {
      res.status(status).json({ success: false, data: null, error: { code, message } });
    }
  };
}

function mockReq(overrides = {}) {
  return {
    correlationId: "corr-123",
    method: "POST",
    originalUrl: "/api/test",
    session: { userId: "user-001" },
    orgId: "org-001",
    ...overrides
  };
}

function mockLogger() {
  const calls = { error: [], warn: [] };
  return {
    error: (...args) => calls.error.push(args),
    warn: (...args) => calls.warn.push(args),
    info: () => {},
    debug: () => {},
    calls
  };
}

function mockCapture() {
  const calls = [];
  return {
    fn: (err, ctx) => calls.push({ err, ctx }),
    calls
  };
}

// ── Error handler: status code resolution ─────────────────────────────────────

describe("errorHandler — status code resolution", () => {
  it("uses err.status when present", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler({ status: 422, message: "Unprocessable" }, mockReq(), res, () => {});
    assert.strictEqual(res.statusCode, 422);
  });

  it("uses err.statusCode when err.status is absent", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler({ statusCode: 409, message: "Conflict" }, mockReq(), res, () => {});
    assert.strictEqual(res.statusCode, 409);
  });

  it("defaults to 500 when neither status nor statusCode", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler(new Error("boom"), mockReq(), res, () => {});
    assert.strictEqual(res.statusCode, 500);
  });
});

// ── Error handler: error code resolution ──────────────────────────────────────

describe("errorHandler — error code resolution", () => {
  it("uses err.code when present", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    const err = new Error("bad"); err.code = "CUSTOM_CODE"; err.status = 400;
    handler(err, mockReq(), res, () => {});
    assert.strictEqual(res.body.error.code, "CUSTOM_CODE");
  });

  it("defaults to SERVER_ERROR when err.code is absent", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler(new Error("crash"), mockReq(), res, () => {});
    assert.strictEqual(res.body.error.code, "SERVER_ERROR");
  });
});

// ── Error handler: message masking (security) ─────────────────────────────────

describe("errorHandler — message masking", () => {
  it("masks error message for 500 errors (no internal detail leak)", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler(new Error("SQL: relation users does not exist"), mockReq(), res, () => {});
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error.message, "Interner Serverfehler. Bitte spaeter erneut versuchen.");
    // Original error message must NOT appear in response
    assert.ok(!JSON.stringify(res.body).includes("SQL"));
  });

  it("masks error message for 503 errors", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    const err = new Error("Redis connection refused"); err.status = 503;
    handler(err, mockReq(), res, () => {});
    assert.strictEqual(res.body.error.message, "Interner Serverfehler. Bitte spaeter erneut versuchen.");
  });

  it("forwards original message for 4xx errors (client-facing)", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    const err = new Error("E-Mail-Adresse bereits registriert"); err.status = 409;
    handler(err, mockReq(), res, () => {});
    assert.strictEqual(res.body.error.message, "E-Mail-Adresse bereits registriert");
  });

  it("uses fallback message when 4xx error has no message", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler({ status: 400, message: "" }, mockReq(), res, () => {});
    assert.strictEqual(res.body.error.message, "Unbekannter Fehler");
  });

  it("boundary: status 499 uses original message (< 500)", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler({ status: 499, message: "Client closed" }, mockReq(), res, () => {});
    assert.strictEqual(res.body.error.message, "Client closed");
  });

  it("boundary: status 500 masks message (>= 500)", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler({ status: 500, message: "pool.query failed" }, mockReq(), res, () => {});
    assert.strictEqual(res.body.error.message, "Interner Serverfehler. Bitte spaeter erneut versuchen.");
  });
});

// ── Error handler: response envelope ──────────────────────────────────────────

describe("errorHandler — response envelope format", () => {
  it("matches fail() envelope structure exactly", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    const err = new Error("Not found"); err.status = 404; err.code = "NOT_FOUND";
    handler(err, mockReq(), res, () => {});

    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.data, null);
    assert.strictEqual(typeof res.body.error, "object");
    assert.strictEqual(res.body.error.code, "NOT_FOUND");
    assert.strictEqual(res.body.error.message, "Not found");

    const keys = Object.keys(res.body).sort();
    assert.deepStrictEqual(keys, ["data", "error", "success"]);
  });
});

// ── Error handler: logging behavior ───────────────────────────────────────────

describe("errorHandler — logging", () => {
  it("logs 5xx via logger.error", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    handler(new Error("db crash"), mockReq(), mockRes(), () => {});
    assert.strictEqual(logger.calls.error.length, 1);
    assert.strictEqual(logger.calls.warn.length, 0);
    assert.strictEqual(logger.calls.error[0][1], "server_error");
  });

  it("logs 4xx via logger.warn", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    handler({ status: 400, message: "bad" }, mockReq(), mockRes(), () => {});
    assert.strictEqual(logger.calls.warn.length, 1);
    assert.strictEqual(logger.calls.error.length, 0);
    assert.strictEqual(logger.calls.warn[0][1], "client_error");
  });

  it("includes correlationId, method, url, userId, orgId in log data", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const req = mockReq({ correlationId: "abc-123", method: "DELETE", originalUrl: "/api/users/1", session: { userId: "u-77" }, orgId: "org-99" });
    handler(new Error("x"), req, mockRes(), () => {});
    const logData = logger.calls.error[0][0];
    assert.strictEqual(logData.correlationId, "abc-123");
    assert.strictEqual(logData.method, "DELETE");
    assert.strictEqual(logData.url, "/api/users/1");
    assert.strictEqual(logData.userId, "u-77");
    assert.strictEqual(logData.orgId, "org-99");
  });

  it("handles missing session gracefully (no userId)", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    handler(new Error("x"), mockReq({ session: undefined }), mockRes(), () => {});
    const logData = logger.calls.error[0][0];
    assert.strictEqual(logData.userId, undefined);
  });
});

// ── Error handler: Sentry captureException ────────────────────────────────────

describe("errorHandler — captureException", () => {
  it("calls captureException with error and request context", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const err = new Error("test-error");
    const req = mockReq({ method: "GET", originalUrl: "/api/fail", correlationId: "cid-42" });
    handler(err, req, mockRes(), () => {});
    assert.strictEqual(capture.calls.length, 1);
    assert.strictEqual(capture.calls[0].err, err);
    assert.deepStrictEqual(capture.calls[0].ctx, {
      method: "GET",
      path: "/api/fail",
      correlationId: "cid-42"
    });
  });
});

// ── Error handler: headersSent guard ──────────────────────────────────────────

describe("errorHandler — headersSent guard", () => {
  it("does not send response when headers already sent", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });

    // Simulate headers already sent
    const res = mockRes();
    res.status(200).json({ already: "sent" }); // headersSent is now true
    const firstBody = res.body;

    // Now trigger error handler — should NOT overwrite
    handler(new Error("late error"), mockReq(), res, () => {});

    // Body should still be the first response
    assert.deepStrictEqual(res.body, firstBody);
    // But logging and captureException should still happen
    assert.strictEqual(logger.calls.error.length, 1);
    assert.strictEqual(capture.calls.length, 1);
  });
});

// ── Error handler: realistic error shapes ─────────────────────────────────────

describe("errorHandler — realistic error shapes", () => {
  it("handles Zod validation error shape", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    const err = new Error("Validation failed");
    err.status = 400;
    err.code = "VALIDATION";
    handler(err, mockReq(), res, () => {});
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, "VALIDATION");
    assert.strictEqual(res.body.error.message, "Validation failed");
  });

  it("handles rate-limit error (429)", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler({ status: 429, code: "RATE_LIMITED", message: "Zu viele Anfragen" }, mockReq(), res, () => {});
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.body.error.code, "RATE_LIMITED");
  });

  it("handles plain Error with no extra properties", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler(new Error("something broke"), mockReq(), res, () => {});
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.error.code, "SERVER_ERROR");
    assert.strictEqual(res.body.error.message, "Interner Serverfehler. Bitte spaeter erneut versuchen.");
  });

  it("handles plain object error (non-Error instance)", () => {
    const logger = mockLogger();
    const capture = mockCapture();
    const handler = createErrorHandler({ logger, captureException: capture.fn });
    const res = mockRes();
    handler({ status: 403, code: "FORBIDDEN", message: "Access denied" }, mockReq(), res, () => {});
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error.code, "FORBIDDEN");
    assert.strictEqual(res.body.error.message, "Access denied");
  });
});
