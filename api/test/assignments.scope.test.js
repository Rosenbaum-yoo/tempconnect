/**
 * API-Key SCOPE-ENFORCEMENT boundary test for routes/assignments.js.
 *
 * Verifies requireScope("read:assignments"|"write:assignments") is wired into
 * EVERY auth-protected route, positioned right after requireAuth and before the
 * rperm/gate layers, with correct read/write semantics.
 *
 * Strategy: build the real router, then for a representative GET and a
 * representative mutating route, RUN THE FULL MIDDLEWARE CHAIN (iterate the
 * route.stack layers, calling each handle(req,res,next) in order until one
 * responds) with:
 *   1. API-key request LACKING the scope (isApiKeyAuth=true, apiKeyScopes=[])
 *      → assert 403 + code "SCOPE_INSUFFICIENT".
 *   2. API-key request WITH the correct scope → assert the chain proceeds
 *      PAST the requireScope layer (no 403 from requireScope).
 *   3. Session auth (isApiKeyAuth falsy) → assert requireScope does NOT block.
 *
 * Run: node --test --test-force-exit test/assignments.scope.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAssignmentsRouter } from "../routes/assignments.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

// A pool whose every query throws — proves that when the chain reaches the real
// handler (i.e. it got PAST requireScope) we observe handler-side behaviour, not
// a requireScope 403. We never assert success shape here, only "not blocked by
// requireScope", so a throwing pool is sufficient and keeps the test pure.
function throwingPool() {
  const query = async () => { throw new Error("db not wired in scope test"); };
  return { query, connect: async () => ({ query, release() {} }) };
}

function makeDeps(pool) {
  return {
    pool,
    logger: mockLogger(),
    // requireAuth passes through (auth already established upstream)
    requireAuth: (_req, _res, next) => next()
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    user: { id: "u1" },
    orgId: "org-1",
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    get: () => "",
    ...overrides
  };
}

function mockRes() {
  const headers = {};
  const res = {
    _status: 200,
    _statusExplicit: false,
    _json: null,
    _send: null,
    _ended: false,
    _headers: headers,
    locals: {},
    status(code) { res._status = code; res._statusExplicit = true; return res; },
    json(payload) { res._json = payload; res._ended = true; return res; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    set() { return res; },
    type() { return res; },
    send(payload) { res._send = payload; res._ended = true; return res; },
    end() { res._ended = true; return res; }
  };
  return res;
}

/* Find the full ordered middleware stack for a method+path. */
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
 * Run the middleware chain in order. Stops when a layer responds (res ended) or
 * when a layer calls next(err). Returns { res, responded, error, reached }.
 * `reached` = index of the last layer that was invoked.
 */
async function runChain(stack, req) {
  const res = mockRes();
  let error = null;
  let reached = -1;
  for (let i = 0; i < stack.length; i++) {
    reached = i;
    let calledNext = false;
    let nextErr = null;
    const next = (err) => { calledNext = true; if (err) nextErr = err; };
    try {
      await stack[i](req, res, next);
    } catch (err) {
      // Real handler throwing synchronously/asynchronously counts as "reached
      // the handler" — i.e. it got past requireScope.
      error = err;
      break;
    }
    if (nextErr) { error = nextErr; break; }
    if (res._ended) break;       // a layer produced a response
    if (!calledNext) break;      // layer neither responded nor continued
  }
  return { res, error, reached, stackLen: stack.length };
}

/* Representative routes: a GET (read scope) and a mutation (write scope). */
const READ_ROUTE = { method: "get", path: "/assignments", scope: "read:assignments" };
const WRITE_ROUTE = { method: "post", path: "/assignments", scope: "write:assignments" };

/* ── Registration: every auth-protected route carries the right scope ───── */

describe("assignments router — scope wiring", () => {
  it("inserts requireScope on every auth-protected route with correct read/write scope", () => {
    const router = createAssignmentsRouter(makeDeps(throwingPool()));

    // Expected scope per route (the no-auth meta endpoints — none here — would be excluded).
    const expected = [
      { method: "get", path: "/assignments", scope: "read:assignments" },
      { method: "post", path: "/assignments", scope: "write:assignments" },
      { method: "get", path: "/assignments/:id", scope: "read:assignments" },
      { method: "patch", path: "/assignments/:id", scope: "write:assignments" },
      { method: "post", path: "/assignments/:id/transition", scope: "write:assignments" },
      { method: "post", path: "/assignments/:id/complete", scope: "write:assignments" }
    ];

    for (const { method, path, scope } of expected) {
      const stack = getStack(router, method, path);
      // requireScope is positioned right after requireAuth (index 0) → index 1.
      const second = stack[1];
      // Drive that layer as an API-key request lacking the scope: it must 403.
      // This both proves the layer IS requireScope AND that it carries `scope`.
      const res = mockRes();
      let nexted = false;
      second(
        mockReq({ isApiKeyAuth: true, apiKeyScopes: [] }),
        res,
        () => { nexted = true; }
      );
      assert.strictEqual(res._status, 403, `${method} ${path}: layer[1] should 403 for missing scope`);
      assert.strictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT", `${method} ${path}: layer[1] not requireScope`);
      assert.strictEqual(nexted, false, `${method} ${path}: requireScope must not call next() when scope missing`);

      // And the scope message must reference the correct scope (read vs write).
      assert.match(
        String(res._json.error.message),
        new RegExp(scope.replace(":", ":")),
        `${method} ${path}: wrong scope on requireScope (expected ${scope})`
      );
    }
  });
});

/* ── Boundary: API-key WITHOUT the scope → 403 SCOPE_INSUFFICIENT ───────── */

describe("assignments router — API-key lacking scope is blocked (403)", () => {
  for (const route of [READ_ROUTE, WRITE_ROUTE]) {
    it(`${route.method.toUpperCase()} ${route.path}: 403 SCOPE_INSUFFICIENT when apiKeyScopes=[]`, async () => {
      const router = createAssignmentsRouter(makeDeps(throwingPool()));
      const stack = getStack(router, route.method, route.path);
      const req = mockReq({
        isApiKeyAuth: true,
        apiKeyScopes: [],
        params: { id: "a1" },
        body: { start_date: "2026-01-01", status: "active" }
      });
      const { res, error } = await runChain(stack, req);
      assert.strictEqual(error, null, "chain should be stopped by requireScope, not throw");
      assert.strictEqual(res._status, 403);
      assert.strictEqual(res._json?.success, false);
      assert.strictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
    });
  }
});

/* ── Boundary: API-key WITH the scope → proceeds past requireScope ──────── */

describe("assignments router — API-key with correct scope proceeds past requireScope", () => {
  for (const route of [READ_ROUTE, WRITE_ROUTE]) {
    it(`${route.method.toUpperCase()} ${route.path}: not 403'd by requireScope when scope present`, async () => {
      const router = createAssignmentsRouter(makeDeps(throwingPool()));
      const stack = getStack(router, route.method, route.path);
      const req = mockReq({
        isApiKeyAuth: true,
        apiKeyScopes: [route.scope],
        params: { id: "a1" },
        body: { start_date: "2026-01-01", status: "active" }
      });
      const { res } = await runChain(stack, req);
      // The chain must NOT terminate with a SCOPE_INSUFFICIENT 403 — that proves
      // requireScope let it through (downstream may 4xx/5xx for other reasons,
      // but it must not be the scope gate).
      const blockedByScope =
        res._status === 403 && res._json?.error?.code === "SCOPE_INSUFFICIENT";
      assert.strictEqual(blockedByScope, false, "requireScope must pass through when scope present");
    });
  }
});

/* ── Boundary: session auth (no API-key) → never blocked by requireScope ── */

describe("assignments router — session auth is never blocked by requireScope", () => {
  for (const route of [READ_ROUTE, WRITE_ROUTE]) {
    it(`${route.method.toUpperCase()} ${route.path}: session request passes requireScope`, async () => {
      const router = createAssignmentsRouter(makeDeps(throwingPool()));
      const stack = getStack(router, route.method, route.path);
      // No isApiKeyAuth → falsy → requireScope must pass through.
      const req = mockReq({
        params: { id: "a1" },
        body: { start_date: "2026-01-01", status: "active" }
      });
      const { res } = await runChain(stack, req);
      const blockedByScope =
        res._status === 403 && res._json?.error?.code === "SCOPE_INSUFFICIENT";
      assert.strictEqual(blockedByScope, false, "session auth must not be blocked by requireScope");
    });
  }
});
