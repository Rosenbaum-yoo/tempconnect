/**
 * API-Key SCOPE-ENFORCEMENT boundary tests for routes/capacityExchange.js.
 *
 * Goal: prove that requireScope("read:capacity" | "write:capacity") is wired
 * into EVERY auth-protected route, positioned right after requireAuth and
 * before the feature gates / handler — and behaves per apiKeyAuth.js semantics:
 *
 *   - API-key auth (req.isApiKeyAuth=true) lacking the scope  → 403 SCOPE_INSUFFICIENT
 *   - API-key auth WITH the scope                              → passes requireScope (chain proceeds)
 *   - Session auth (req.isApiKeyAuth falsy)                    → never blocked by requireScope
 *
 * Strategy: build the real router (mock deps), then for each tested route walk
 * the route.stack layers in order, invoking each layer.handle(req,res,next)
 * until one responds (res._ended) or the chain runs out. requireScope is the
 * ONLY layer that can 403 with code SCOPE_INSUFFICIENT, so a 403/that-code is a
 * precise probe; the absence of it (chain proceeds past the scope layer) proves
 * pass-through. requireAuth + feature gates are mocked as pass-through so we
 * isolate the scope layer.
 *
 * Run: node --test --test-force-exit test/capacity.scope.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCapacityExchangeRouter } from "../routes/capacityExchange.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/** Tracking pool — every query degrades to empty rows (handlers tolerate this). */
function trackingPool() {
  const query = async () => ({ rows: [], rowCount: 0 });
  return { query, connect: async () => ({ query, release() {} }) };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    user: { id: "u1", role: "agency" },
    orgId: "org-1",
    params: { id: "11111111-1111-1111-1111-111111111111" },
    query: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    get: () => "",
    // API-key auth context (overridden per case)
    isApiKeyAuth: false,
    apiKeyScopes: [],
    ...overrides
  };
}

function mockRes() {
  const headers = {};
  const res = {
    _status: 200,
    _json: null,
    _send: null,
    _ended: false,
    _headers: headers,
    locals: {},
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; res._ended = true; return res; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    set() { return res; },
    type() { return res; },
    send(payload) { res._send = payload; res._ended = true; return res; },
    end() { res._ended = true; return res; }
  };
  return res;
}

/**
 * Deps for the router. requireAuth + requireFeature(...) gates are pass-through
 * so the ONLY enforcing layer in the chain is requireScope (the real import).
 */
function makeDeps(pool) {
  return {
    pool,
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next(),
    requireFeature: () => (_req, _res, next) => next(),
    getUserAndPlan: async () => ({ id: "u1", plan: "PRO", role: "agency", org_id: "org-1" })
  };
}

/** Find the ordered middleware stack for a method+path on the router. */
function getStack(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method]) continue;
    return layer.route.stack.map((l) => l.handle);
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/**
 * Run the full middleware chain in order. Each layer may: respond (res._ended),
 * call next() to continue, or call next(err). We stop at the first response.
 * Returns { res, reached } where reached = number of layers fully passed
 * (i.e. that called next without responding).
 */
async function runChain(stack, req, res) {
  let reached = 0;
  for (const handle of stack) {
    if (res._ended) break;
    let nexted = false;
    let nextErr = null;
    const next = (err) => { nexted = true; if (err) nextErr = err; };
    await handle(req, res, next);
    if (res._ended) break;
    if (nextErr) break;
    if (nexted) { reached += 1; continue; }
    // Layer neither responded nor called next within the awaited tick.
    // For async handlers that resolve without next (terminal handlers), this is fine.
    break;
  }
  return { res, reached };
}

/* ── Representative routes (one read, one write) ───────────────────────── */

const READ_ROUTE = { method: "get", path: "/capacity-exchange/feed", scope: "read:capacity" };
const WRITE_ROUTE = { method: "post", path: "/capacity-exchange/entries", scope: "write:capacity" };

/* ── 1. API-key auth WITHOUT scope → 403 SCOPE_INSUFFICIENT ────────────── */

describe("capacity scope enforcement — API-key lacking scope is blocked", () => {
  it("GET /capacity-exchange/feed → 403 SCOPE_INSUFFICIENT (no read:capacity)", async () => {
    const router = createCapacityExchangeRouter(makeDeps(trackingPool()));
    const stack = getStack(router, READ_ROUTE.method, READ_ROUTE.path);
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: [] });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.strictEqual(res._status, 403, "must be 403");
    assert.strictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("POST /capacity-exchange/entries → 403 SCOPE_INSUFFICIENT (no write:capacity)", async () => {
    const router = createCapacityExchangeRouter(makeDeps(trackingPool()));
    const stack = getStack(router, WRITE_ROUTE.method, WRITE_ROUTE.path);
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: [] });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.strictEqual(res._status, 403, "must be 403");
    assert.strictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("write route is NOT satisfied by the read scope (wrong scope still 403)", async () => {
    const router = createCapacityExchangeRouter(makeDeps(trackingPool()));
    const stack = getStack(router, WRITE_ROUTE.method, WRITE_ROUTE.path);
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["read:capacity"] });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });
});

/* ── 2. API-key auth WITH correct scope → NOT blocked at scope layer ────── */

describe("capacity scope enforcement — correct scope passes the scope layer", () => {
  it("GET /capacity-exchange/feed with read:capacity does NOT 403 SCOPE_INSUFFICIENT", async () => {
    const router = createCapacityExchangeRouter(makeDeps(trackingPool()));
    const stack = getStack(router, READ_ROUTE.method, READ_ROUTE.path);
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["read:capacity"] });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.notStrictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT",
      "chain must proceed past requireScope when scope present");
  });

  it("POST /capacity-exchange/entries with write:capacity does NOT 403 SCOPE_INSUFFICIENT", async () => {
    const router = createCapacityExchangeRouter(makeDeps(trackingPool()));
    const stack = getStack(router, WRITE_ROUTE.method, WRITE_ROUTE.path);
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["write:capacity"] });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.notStrictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT",
      "chain must proceed past requireScope when scope present");
  });
});

/* ── 3. Session auth is never blocked by requireScope ──────────────────── */

describe("capacity scope enforcement — session auth is never scope-gated", () => {
  it("GET /capacity-exchange/feed (session, no apiKeyScopes) does NOT 403 SCOPE_INSUFFICIENT", async () => {
    const router = createCapacityExchangeRouter(makeDeps(trackingPool()));
    const stack = getStack(router, READ_ROUTE.method, READ_ROUTE.path);
    const req = mockReq({ isApiKeyAuth: false, apiKeyScopes: [] });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.notStrictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("POST /capacity-exchange/entries (session) does NOT 403 SCOPE_INSUFFICIENT", async () => {
    const router = createCapacityExchangeRouter(makeDeps(trackingPool()));
    const stack = getStack(router, WRITE_ROUTE.method, WRITE_ROUTE.path);
    const req = mockReq({ isApiKeyAuth: false, apiKeyScopes: [] });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.notStrictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });
});

/* ── 4. Coverage: EVERY auth-protected route carries the right scope guard ─ */

describe("capacity scope enforcement — all routes guarded with correct scope", () => {
  // Expected scope per route per the SCOPE RULE (GET=read, mutations=write).
  const EXPECTED = [
    ["post", "/capacity-exchange/entries", "write:capacity"],
    ["patch", "/capacity-exchange/entries/:id", "write:capacity"],
    ["post", "/capacity-exchange/entries/:id/activate", "write:capacity"],
    ["post", "/capacity-exchange/entries/:id/pause", "write:capacity"],
    ["post", "/capacity-exchange/entries/:id/reactivate", "write:capacity"],
    ["post", "/capacity-exchange/entries/:id/fill", "write:capacity"],
    ["post", "/capacity-exchange/entries/:id/archive", "write:capacity"],
    ["post", "/capacity-exchange/entries/:id/confirm", "write:capacity"],
    ["get", "/capacity-exchange/entries", "read:capacity"],
    ["get", "/capacity-exchange/entries/:id", "read:capacity"],
    ["get", "/capacity-exchange/stats", "read:capacity"],
    ["get", "/capacity-exchange/entries/:id/matches", "read:capacity"],
    ["get", "/capacity-exchange/entries/:id/interactions", "read:capacity"],
    ["get", "/capacity-exchange/feed", "read:capacity"],
    ["get", "/capacity-exchange/feed/:id", "read:capacity"],
    ["post", "/capacity-exchange/entries/:id/interactions", "write:capacity"],
    ["get", "/capacity-exchange/entries/:id/analytics", "read:capacity"],
    ["get", "/capacity-exchange/my-analytics", "read:capacity"],
    ["post", "/capacity-exchange/entries/:id/click", "write:capacity"],
    ["post", "/capacity-exchange/admin/process-reminders", "write:capacity"]
  ];

  for (const [method, path, scope] of EXPECTED) {
    it(`${method.toUpperCase()} ${path} enforces ${scope}`, async () => {
      const router = createCapacityExchangeRouter(makeDeps(trackingPool()));
      const stack = getStack(router, method, path);

      // API-key WITHOUT the scope → 403 SCOPE_INSUFFICIENT
      const reqNo = mockReq({ isApiKeyAuth: true, apiKeyScopes: [] });
      const resNo = mockRes();
      await runChain(stack, reqNo, resNo);
      assert.strictEqual(resNo._status, 403, `${method} ${path}: expected 403`);
      assert.strictEqual(resNo._json?.error?.code, "SCOPE_INSUFFICIENT",
        `${method} ${path}: expected SCOPE_INSUFFICIENT`);

      // API-key WITH the scope → not blocked at scope layer
      const reqYes = mockReq({ isApiKeyAuth: true, apiKeyScopes: [scope] });
      const resYes = mockRes();
      await runChain(stack, reqYes, resYes);
      assert.notStrictEqual(resYes._json?.error?.code, "SCOPE_INSUFFICIENT",
        `${method} ${path}: ${scope} should pass requireScope`);
    });
  }
});
