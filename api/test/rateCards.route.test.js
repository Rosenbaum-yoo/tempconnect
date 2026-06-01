/**
 * Rate card route handler tests.
 * Covers GET /rate-cards and GET /rate-cards/stats query forwarding
 * for the executive overlap drilldown contract.
 *
 * Run: node --test --test-force-exit test/rateCards.route.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRateCardsRouter } from "../routes/rateCards.js";

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
    orgMembership: { org_id: "org-1", org_type: "company", role_key: "owner" },
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
const requireFeature = () => (_req, _res, next) => next();

function baseDeps(pool) {
  return {
    pool,
    requireAuth,
    requireFeature,
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

describe("GET /rate-cards", () => {
  it("applies active window-overlap filters from the request query", async () => {
    const pool = recordingSequencePool(
      { rows: [{ id: "rc-1", status: "active" }] },
      { rows: [{ total: 1 }] }
    );
    const router = createRateCardsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/rate-cards");
    const req = mockReq({
      query: {
        status: "active",
        date_from: "2026-04-01",
        date_to: "2026-04-30",
        limit: "50",
        offset: "10"
      }
    });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.total, 1);
    assert.match(pool.calls[0].sql, /rc\.valid_from <=/);
    assert.match(pool.calls[0].sql, /COALESCE\(rc\.valid_to/);
    assert.ok(pool.calls[0].params.includes("2026-04-01"));
    assert.ok(pool.calls[0].params.includes("2026-04-30"));
    assert.ok(pool.calls[0].params.includes(50));
    assert.ok(pool.calls[0].params.includes(10));
  });

  it("returns ORG_CONTEXT_REQUIRED without an organization context", async () => {
    const pool = recordingSequencePool();
    const router = createRateCardsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/rate-cards");
    const res = mockRes();

    await handler(mockReq({ orgId: null }), res);

    assert.strictEqual(res._status, 400);
    assert.deepStrictEqual(res._json, { error: "ORG_CONTEXT_REQUIRED" });
    assert.strictEqual(pool.calls.length, 0);
  });

  it("denies agency organizations before querying rate card data", async () => {
    const pool = recordingSequencePool();
    const router = createRateCardsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/rate-cards");
    const res = mockRes();

    await handler(mockReq({
      orgMembership: { org_id: "org-1", org_type: "agency", role_key: "owner" }
    }), res);

    assert.strictEqual(res._status, 403);
    assert.deepStrictEqual(res._json, {
      error: "RATE_CARD_NOT_AVAILABLE_FOR_ORG_TYPE",
      message: "Preisrahmen stehen nur fuer Unternehmensorganisationen zur Verfuegung."
    });
    assert.strictEqual(pool.calls.length, 0);
  });
});

describe("GET /rate-cards/stats", () => {
  it("applies overlap filters to both card and compliance stats queries", async () => {
    const pool = recordingSequencePool(
      { rows: [{ total: 2, active: 2, draft: 0, expired: 0, archived: 0, role_categories: 1, vendor_specific: 1 }] },
      { rows: [{ total_checks: 3, compliant: 2, warnings: 1, non_compliant: 0 }] }
    );
    const router = createRateCardsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/rate-cards/stats");
    const req = mockReq({
      query: {
        status: "active",
        date_from: "2026-04-01",
        date_to: "2026-04-30"
      }
    });
    const res = mockRes();

    await handler(req, res);

    assert.strictEqual(res._status, 200);
    assert.strictEqual(res._json.success, true);
    assert.strictEqual(res._json.data.cards.active, 2);
    assert.strictEqual(res._json.data.compliance_30d.total_checks, 3);
    assert.match(pool.calls[0].sql, /rc\.valid_from <=/);
    assert.match(pool.calls[0].sql, /COALESCE\(rc\.valid_to/);
    assert.match(pool.calls[1].sql, /JOIN rate_cards rc/);
    assert.ok(pool.calls[1].params.includes("2026-04-01"));
    assert.ok(pool.calls[1].params.includes("2026-04-30"));
  });

  it("denies agency organizations before querying stats", async () => {
    const pool = recordingSequencePool();
    const router = createRateCardsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/rate-cards/stats");
    const res = mockRes();

    await handler(mockReq({
      orgMembership: { org_id: "org-1", org_type: "agency", role_key: "owner" }
    }), res);

    assert.strictEqual(res._status, 403);
    assert.deepStrictEqual(res._json, {
      error: "RATE_CARD_NOT_AVAILABLE_FOR_ORG_TYPE",
      message: "Preisrahmen stehen nur fuer Unternehmensorganisationen zur Verfuegung."
    });
    assert.strictEqual(pool.calls.length, 0);
  });
});
