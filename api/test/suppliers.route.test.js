/**
 * Supplier route handler tests.
 * Covers GET /suppliers/enriched query forwarding for the
 * executive active-vendors 30-day drilldown contract.
 *
 * Run: node --test --test-force-exit test/suppliers.route.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSuppliersRouter } from "../routes/suppliers.js";

function recordingSequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "user-1" },
    params: {},
    query: {},
    body: {},
    orgId: "org-1",
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    locals: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; }
  };
  return res;
}

const requireAuth = (_req, _res, next) => next();

function baseDeps(pool) {
  return {
    pool,
    requireAuth,
    logger: mockLogger()
  };
}

function findHandler(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const routePath = layer.route.path;
    const routeMethod = Object.keys(layer.route.methods)[0];
    if (routeMethod === method && routePath.includes(pathFragment)) {
      const handlers = layer.route.stack.map((stackLayer) => stackLayer.handle);
      return handlers[handlers.length - 1];
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${pathFragment} not found`);
}

describe("GET /suppliers/enriched", () => {
  it("applies the buyer-activity 30-day scope for the executive drilldown", async () => {
    const pool = recordingSequencePool(
      { rows: [{ supplier_org_id: "sup-1", tier: "PREFERRED", status: "active" }] }
    );
    const router = createSuppliersRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/suppliers/enriched");
    const req = mockReq({
      query: {
        activity_scope: "buyer_activity_30d",
        tier: "PREFERRED",
        limit: "25"
      }
    });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 1);
    assert.match(pool.calls[0].sql, /DISTINCT ON \(vp\.supplier_org_id\)/);
    assert.match(pool.calls[0].sql, /JOIN \(\s*SELECT DISTINCT vendor_id/s);
    assert.match(pool.calls[0].sql, /vp\.status = 'active'/);
    assert.ok(pool.calls[0].params.includes("org-1"));
    assert.ok(pool.calls[0].params.includes("PREFERRED"));
    assert.ok(pool.calls[0].params.includes(25));
    assert.ok(pool.calls[0].params.some((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)));
    assert.ok(pool.calls[0].params.some((value) => typeof value === "string" && /T00:00:00\.000Z$/.test(value)));
  });

  it("uses req.orgId and ignores unsupported activity scopes", async () => {
    const pool = recordingSequencePool(
      { rows: [{ supplier_org_id: "sup-2", tier: "SECONDARY", status: "active" }] }
    );
    const router = createSuppliersRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/suppliers/enriched");
    const req = mockReq({
      query: {
        activity_scope: "unexpected_scope",
        limit: "10"
      }
    });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.total, 1);
    assert.strictEqual(pool.calls[0].params[0], "org-1");
    assert.ok(pool.calls[0].params.includes(10));
    assert.doesNotMatch(pool.calls[0].sql, /DISTINCT ON \(vp\.supplier_org_id\)/);
    assert.doesNotMatch(pool.calls[0].sql, /JOIN \(\s*SELECT DISTINCT vendor_id/s);
    assert.match(pool.calls[0].sql, /vp\.status != 'removed'/);
  });

  it("returns buyer_org_id required without any organization context", async () => {
    const pool = recordingSequencePool();
    const router = createSuppliersRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/suppliers/enriched");
    const res = mockRes();

    await handler(mockReq({ orgId: null, query: {} }), res);

    assert.strictEqual(res._status, 400);
    assert.deepStrictEqual(res._json, { error: "ORG_CONTEXT_REQUIRED" });
    assert.strictEqual(pool.calls.length, 0);
  });
});
