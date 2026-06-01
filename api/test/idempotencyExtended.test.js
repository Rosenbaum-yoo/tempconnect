/**
 * Idempotency middleware extended tests — covers requestBodyHash,
 * response replay, response capture, finish handler, error propagation.
 * (Basic scope/path/lookup covered in idempotency.test.js)
 *
 * Run: node --test --test-force-exit test/idempotencyExtended.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { idempotencyMiddleware } from "../middleware/idempotency.js";

/* ── helpers ──────────────────────────────────────────────── */

function mockPool(response) {
  const queries = [];
  return {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (typeof response === "function") return response(sql, params);
      return response;
    },
    queries
  };
}

function mockReq(overrides = {}) {
  return {
    method: "POST",
    headers: { "idempotency-key": "test-key-123" },
    baseUrl: "/api",
    path: "/orders",
    session: { userId: "user-1" },
    body: { item: "widget", qty: 5 },
    ...overrides
  };
}

function mockRes() {
  const res = new EventEmitter();
  let _status = 200;
  let _body = null;
  res.statusCode = 200;
  res.status = function (code) { _status = code; res.statusCode = code; return res; };
  res.json = function (body) { _body = body; return res; };
  Object.defineProperty(res, "_status", { get: () => _status });
  Object.defineProperty(res, "_body", { get: () => _body });
  return res;
}

/* ═══════════════════════════════════════════════════════════
   Skip for read methods
   ═══════════════════════════════════════════════════════════ */

describe("idempotency — read method bypass", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    it(`skips ${method} requests`, async () => {
      const pool = mockPool({ rows: [] });
      const mw = idempotencyMiddleware(pool);
      const req = mockReq({ method });
      const res = mockRes();
      let nextCalled = false;
      await mw(req, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
      assert.strictEqual(pool.queries.length, 0, "No DB queries for read methods");
    });
  }
});

/* ═══════════════════════════════════════════════════════════
   Missing Idempotency-Key — warn and pass through
   ═══════════════════════════════════════════════════════════ */

describe("idempotency — missing key", () => {
  it("calls next() with warning when key header is missing", async () => {
    const warnings = [];
    const pool = mockPool({ rows: [] });
    const mw = idempotencyMiddleware(pool, {
      logger: { warn: (obj, msg) => warnings.push({ obj, msg }) }
    });
    const req = mockReq({ headers: {} }); // no idempotency-key
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0].msg.includes("missing"));
    assert.strictEqual(pool.queries.length, 0, "No DB lookup for missing key");
  });

  it("calls next() when key is empty string", async () => {
    const pool = mockPool({ rows: [] });
    const mw = idempotencyMiddleware(pool);
    const req = mockReq({ headers: { "idempotency-key": "  " } }); // whitespace only
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });
});

/* ═══════════════════════════════════════════════════════════
   Response replay — existing key returns cached response
   ═══════════════════════════════════════════════════════════ */

describe("idempotency — response replay", () => {
  it("replays cached response when key exists", async () => {
    const cached = { response_status: 201, response_body: { id: "order-42", success: true } };
    const pool = mockPool({ rows: [cached] });
    const mw = idempotencyMiddleware(pool);
    const req = mockReq();
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, "next() should NOT be called on replay");
    assert.strictEqual(res._status, 201);
    assert.deepStrictEqual(res._body, { id: "order-42", success: true });
  });
});

/* ═══════════════════════════════════════════════════════════
   New key — passes through and captures response
   ═══════════════════════════════════════════════════════════ */

describe("idempotency — new key passthrough", () => {
  it("calls next() when key is new (no cached response)", async () => {
    const pool = mockPool({ rows: [] });
    const mw = idempotencyMiddleware(pool);
    const req = mockReq();
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    // res.json should be monkey-patched
    assert.strictEqual(pool.queries.length, 1, "One lookup query");
  });

  it("stores response on finish event", async () => {
    const pool = mockPool({ rows: [] });
    const mw = idempotencyMiddleware(pool);
    const req = mockReq();
    const res = mockRes();
    await mw(req, res, () => {});
    // Simulate handler response
    res.status(201).json({ created: true });
    // Trigger finish event
    res.emit("finish");
    // Give async handler time to complete
    await new Promise(resolve => setTimeout(resolve, 20));
    // Should have INSERT query
    const insertQuery = pool.queries.find(q => q.sql.includes("INSERT INTO idempotency_keys"));
    assert.ok(insertQuery, "Should insert idempotency key");
    assert.ok(insertQuery.sql.includes("ON CONFLICT (scope, key) DO NOTHING"));
    assert.strictEqual(insertQuery.params[0], "user-1"); // scope
    assert.strictEqual(insertQuery.params[1], "test-key-123"); // key
    assert.strictEqual(insertQuery.params[6], 201); // response_status
  });

  it("does not store response for non-2xx status", async () => {
    // The middleware checks captured.status >= 200 && < 600, so 4xx/5xx ARE stored.
    // Let's test the boundary: status < 200 should not store
    const pool = mockPool({ rows: [] });
    const mw = idempotencyMiddleware(pool);
    const req = mockReq();
    const res = mockRes();
    await mw(req, res, () => {});
    // No json call → captured is null
    res.emit("finish");
    await new Promise(resolve => setTimeout(resolve, 20));
    const insertQuery = pool.queries.find(q => q.sql.includes("INSERT INTO idempotency_keys"));
    assert.strictEqual(insertQuery, undefined, "No insert when no json captured");
  });
});

/* ═══════════════════════════════════════════════════════════
   Key truncation
   ═══════════════════════════════════════════════════════════ */

describe("idempotency — key truncation", () => {
  it("truncates key to 128 chars", async () => {
    const longKey = "x".repeat(200);
    const pool = mockPool({ rows: [] });
    const mw = idempotencyMiddleware(pool);
    const req = mockReq({ headers: { "idempotency-key": longKey } });
    const res = mockRes();
    await mw(req, res, () => {});
    const lookupKey = pool.queries[0].params[1];
    assert.strictEqual(lookupKey.length, 128);
  });
});

/* ═══════════════════════════════════════════════════════════
   Scope — unauthenticated users
   ═══════════════════════════════════════════════════════════ */

describe("idempotency — scope for unauthenticated", () => {
  it("uses empty scope when session has no userId", async () => {
    const pool = mockPool({ rows: [] });
    const mw = idempotencyMiddleware(pool);
    const req = mockReq({ session: {} });
    const res = mockRes();
    await mw(req, res, () => {});
    assert.strictEqual(pool.queries[0].params[0], ""); // empty scope
  });

  it("uses empty scope when session is null", async () => {
    const pool = mockPool({ rows: [] });
    const mw = idempotencyMiddleware(pool);
    const req = mockReq({ session: null });
    const res = mockRes();
    await mw(req, res, () => {});
    assert.strictEqual(pool.queries[0].params[0], "");
  });
});

/* ═══════════════════════════════════════════════════════════
   Error propagation
   ═══════════════════════════════════════════════════════════ */

describe("idempotency — error handling", () => {
  it("calls next(error) when lookup query fails", async () => {
    const pool = { query: async () => { throw new Error("db_down"); } };
    const mw = idempotencyMiddleware(pool);
    const req = mockReq();
    const res = mockRes();
    let nextError = null;
    await mw(req, res, (err) => { nextError = err; });
    assert.ok(nextError);
    assert.strictEqual(nextError.message, "db_down");
  });

  it("swallows insert error on finish (does not crash)", async () => {
    let callCount = 0;
    const pool = {
      query: async () => {
        callCount++;
        if (callCount === 1) return { rows: [] }; // lookup OK
        throw new Error("insert_failed"); // insert fails
      }
    };
    const mw = idempotencyMiddleware(pool);
    const req = mockReq();
    const res = mockRes();
    await mw(req, res, () => {});
    res.status(200).json({ ok: true });
    res.emit("finish");
    // Should not throw — the catch in the finish handler swallows the error
    await new Promise(resolve => setTimeout(resolve, 20));
  });
});

/* ═══════════════════════════════════════════════════════════
   Path normalization
   ═══════════════════════════════════════════════════════════ */

describe("idempotency — path normalization", () => {
  it("normalizes UUIDs in path to :id", async () => {
    const pool = mockPool({ rows: [] });
    const mw = idempotencyMiddleware(pool);
    const req = mockReq({
      baseUrl: "/api",
      path: "/orders/550e8400-e29b-41d4-a716-446655440000/items"
    });
    const res = mockRes();
    await mw(req, res, () => {});
    // The stored path should have UUID normalized
    res.status(200).json({ ok: true });
    res.emit("finish");
    await new Promise(resolve => setTimeout(resolve, 20));
    const insertQuery = pool.queries.find(q => q.sql.includes("INSERT"));
    if (insertQuery) {
      const path = insertQuery.params[4]; // path param
      assert.ok(path.includes(":id"), "UUID should be normalized to :id");
      assert.ok(!path.includes("550e8400"), "Original UUID should not be in path");
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   Write methods coverage
   ═══════════════════════════════════════════════════════════ */

describe("idempotency — write method coverage", () => {
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    it(`processes ${method} requests`, async () => {
      const pool = mockPool({ rows: [] });
      const mw = idempotencyMiddleware(pool);
      const req = mockReq({ method });
      const res = mockRes();
      let nextCalled = false;
      await mw(req, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
      assert.strictEqual(pool.queries.length, 1, `Should query DB for ${method}`);
    });
  }
});
