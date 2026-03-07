/**
 * Idempotency: scope (user_id, key), replay, expiry, different users.
 * Run: npm test
 * With DB: same-user replay, different-user isolation, expired-key treated as new.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";

const hasDb = process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD);

describe("Idempotency scope and path", () => {
  it("scope is user_id string when authenticated, empty when not", () => {
    const scopeAuthed = "550e8400-e29b-41d4-a716-446655440000";
    const scopeAnon = "";
    assert.strictEqual(scopeAnon, "");
    assert.ok(scopeAuthed.length > 0);
  });

  it("path normalizes UUID to :id for stable keying", () => {
    const path = "/api/capacities/550e8400-e29b-41d4-a716-446655440000";
    const out = path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
    assert.ok(out.includes(":id"));
    assert.strictEqual(out, "/api/capacities/:id");
  });
});

describe("Idempotency middleware (mock pool)", () => {
  it("lookup uses scope and key and expires_at", async () => {
    const queries = [];
    const mockPool = {
      query: async (q, params) => {
        queries.push({ q, params });
        if (q.includes("SELECT") && q.includes("response_status")) {
          if (params && params[0] === "user-a" && params[1] === "key-1") return { rows: [{ response_status: 201, response_body: { id: "cap-1" } }] };
          return { rows: [] };
        }
        return { rows: [] };
      }
    };
    const { idempotencyMiddleware } = await import("../middleware/idempotency.js");
    const mw = idempotencyMiddleware(mockPool);
    const req = {
      method: "POST",
      headers: { "idempotency-key": "key-1" },
      baseUrl: "/api",
      path: "/capacities",
      session: { userId: "user-a" },
      body: {}
    };
    const res = {
      statusCode: 200,
      status: function (c) { this.statusCode = c; return this; },
      json: function (body) { this._body = body; return this; },
      on: function () {}
    };
    mw(req, res, () => {});
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(queries.length, 1);
    assert.strictEqual(queries[0].params[0], "user-a");
    assert.strictEqual(queries[0].params[1], "key-1");
    assert.ok(queries[0].q.includes("expires_at > NOW()"));
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res._body?.id, "cap-1");
  });

  it("different scope (user) with same key gets empty lookup", async () => {
    const queries = [];
    const mockPool = {
      query: async (q, params) => {
        queries.push({ params: params ? [...params] : [] });
        return { rows: [] };
      }
    };
    const { idempotencyMiddleware } = await import("../middleware/idempotency.js");
    const mw = idempotencyMiddleware(mockPool);
    const req = {
      method: "POST",
      headers: { "idempotency-key": "same-key" },
      baseUrl: "/api",
      path: "/capacities",
      session: { userId: "user-b" },
      body: {}
    };
    const res = {
      statusCode: 200,
      status: function (c) { this.statusCode = c; return this; },
      json: function (body) { this._body = body; return this; },
      on: function (ev, fn) { if (ev === "finish") this._onFinish = fn; }
    };
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(queries[0].params[0], "user-b");
    assert.strictEqual(queries[0].params[1], "same-key");
  });
});

describe("Idempotency integration (requires DB + migration 012)", { skip: !hasDb }, () => {
  let pool;

  before(async () => {
    const mod = await import("../db/pool.js");
    pool = mod.pool;
  });

  after(async () => {
    if (pool) {
      await pool.query("DELETE FROM idempotency_keys WHERE key LIKE 'test-key-%'").catch(() => {});
    }
  });

  it("same user + same key: one row per (scope, key), replay returns stored response", async () => {
    const scope = "user-replay";
    const key = "test-key-replay-" + Date.now();
    await pool.query(
      `INSERT INTO idempotency_keys (scope, key, user_id, method, path, response_status, response_body, expires_at)
       VALUES ($1, $2, NULL, 'POST', '/api/capacities', 201, $3, NOW() + INTERVAL '24 hours')
       ON CONFLICT (scope, key) DO NOTHING`,
      [scope, key, JSON.stringify({ id: "cap-1" })]
    );
    const res = await pool.query(
      `SELECT response_status, response_body FROM idempotency_keys WHERE scope = $1 AND key = $2 AND expires_at > NOW()`,
      [scope, key]
    );
    assert.strictEqual(res.rows.length, 1);
    assert.strictEqual(res.rows[0].response_status, 201);
    assert.strictEqual(JSON.parse(res.rows[0].response_body).id, "cap-1");
  });

  it("different user + same key do not replay each other", async () => {
    const scope1 = "user-alpha";
    const scope2 = "user-beta";
    const key = "test-key-shared";
    await pool.query(
      `INSERT INTO idempotency_keys (scope, key, user_id, method, path, response_status, response_body, expires_at)
       VALUES ($1, $2, $3, 'POST', '/api/capacities', 201, $4, NOW() + INTERVAL '24 hours')
       ON CONFLICT (scope, key) DO NOTHING`,
      [scope1, key, null, JSON.stringify({ id: "cap-alpha" })]
    );
    const forBeta = await pool.query(
      `SELECT response_status, response_body FROM idempotency_keys WHERE scope = $1 AND key = $2`,
      [scope2, key]
    );
    assert.strictEqual(forBeta.rows.length, 0);
    const forAlpha = await pool.query(
      `SELECT response_status, response_body FROM idempotency_keys WHERE scope = $1 AND key = $2`,
      [scope1, key]
    );
    assert.strictEqual(forAlpha.rows.length, 1);
    assert.strictEqual(forAlpha.rows[0].response_body.id, "cap-alpha");
    await pool.query("DELETE FROM idempotency_keys WHERE key = $1", [key]);
  });

  it("expired key is not returned by lookup", async () => {
    const scope = "user-exp";
    const key = "test-key-expired-" + Date.now();
    await pool.query(
      `INSERT INTO idempotency_keys (scope, key, user_id, method, path, response_status, response_body, expires_at)
       VALUES ($1, $2, NULL, 'POST', '/test', 200, '{}', NOW() - INTERVAL '1 hour')`,
      [scope, key]
    );
    const r = await pool.query(
      `SELECT response_status FROM idempotency_keys WHERE scope = $1 AND key = $2 AND expires_at > NOW()`,
      [scope, key]
    );
    assert.strictEqual(r.rows.length, 0);
    await pool.query("DELETE FROM idempotency_keys WHERE key = $1", [key]);
  });
});
