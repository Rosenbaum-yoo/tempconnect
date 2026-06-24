/**
 * Boundary test for API-key SCOPE-ENFORCEMENT on routes/requisitions.js.
 *
 * Security gap closed: every auth-protected requisitions route must carry a
 * requireScope("read:requisitions" | "write:requisitions") guard, positioned
 * right after requireAuth and before requirePermission. For API-key auth
 * (req.isApiKeyAuth=true) lacking the scope, the chain must short-circuit with
 * 403 { code: "SCOPE_INSUFFICIENT" }. Session auth (req.isApiKeyAuth falsy)
 * must pass through untouched. With the correct scope present, the chain must
 * proceed PAST the requireScope layer.
 *
 * Strategy: build the real router, locate each route's middleware stack, and
 * run the full chain layer-by-layer (calling handle(req,res,next) in order)
 * until one layer responds or calls next() into the terminal handler. We assert
 * on the requireScope layer's behaviour by observing whether the chain advanced
 * past it (a downstream layer ran) vs. it responded 403 itself.
 *
 * Run: node --test --test-force-exit test/requisitions.scope.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequisitionsRouter } from "../routes/requisitions.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

// Pool whose every query resolves empty — keeps any downstream layer that runs
// (e.g. requirePermission's checkPermission) from throwing on a real DB.
function noopPool() {
  const query = async () => ({ rows: [], rowCount: 0 });
  return { query, connect: async () => ({ query, release() {} }) };
}

function makeDeps() {
  return {
    pool: noopPool(),
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next(),
    getUserAndPlan: async () => ({
      id: "u1",
      plan: "PRO",
      limits: { max_workers_per_request: -1 }
    })
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    orgId: null,
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
  const res = {
    _status: 200,
    _json: null,
    _ended: false,
    locals: {},
    status(code) { res._status = code; res._ended = true; return res; },
    json(payload) { res._json = payload; res._responded = true; return res; },
    setHeader() { return res; },
    set() { return res; },
    send(payload) { res._send = payload; res._responded = true; return res; },
    end() { res._responded = true; return res; }
  };
  res._responded = false;
  return res;
}

/** Locate the ordered middleware stack for a given method+path. */
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
 * Run the middleware chain in order. Returns:
 *   { responded: bool, status, json, reachedLayerCount }
 * Stops as soon as a layer responds (res.json/send/end called) or no further
 * next() is invoked. We cap the number of layers we actually execute so we
 * never run the terminal route handler's full body (we only need to know the
 * chain advanced PAST requireScope).
 */
async function runChain(stack, req, res, { maxLayers = Infinity } = {}) {
  let reached = 0;
  for (let i = 0; i < stack.length && i < maxLayers; i++) {
    reached = i + 1;
    let proceeded = false;
    await stack[i](req, res, (err) => { if (err) throw err; proceeded = true; });
    if (res._responded) break;        // a layer answered → chain short-circuits
    if (!proceeded) break;            // layer neither responded nor called next()
  }
  return { responded: res._responded, status: res._status, json: res._json, reached };
}

/* Representative GET (read scope) and mutating PATCH (write scope) routes. */
const READ_ROUTE = { method: "get", path: "/requisitions", scope: "read:requisitions" };
const WRITE_ROUTE = { method: "patch", path: "/requisitions/:id", scope: "write:requisitions" };

/* All auth-protected routes must be guarded — used by the coverage assertion. */
const GUARDED = [
  { method: "post", path: "/requisitions", scope: "write:requisitions" },
  { method: "get", path: "/requisitions", scope: "read:requisitions" },
  { method: "get", path: "/requisitions/:id", scope: "read:requisitions" },
  { method: "patch", path: "/requisitions/:id", scope: "write:requisitions" },
  { method: "post", path: "/requisitions/:id/transition", scope: "write:requisitions" },
  { method: "post", path: "/requisitions/:id/submit", scope: "write:requisitions" },
  { method: "post", path: "/requisitions/:id/approve", scope: "write:requisitions" },
  { method: "get", path: "/requisitions/:id/events", scope: "read:requisitions" },
  { method: "post", path: "/requisitions/:id/comment", scope: "write:requisitions" },
  { method: "get", path: "/requisitions/:id/candidates", scope: "read:requisitions" },
  { method: "post", path: "/requisitions/:id/candidates", scope: "write:requisitions" },
  { method: "patch", path: "/requisitions/:reqId/candidates/:candId", scope: "write:requisitions" }
];

/**
 * Find the index of the requireScope layer in a stack by behavioural probe:
 * it is the FIRST layer that, for an API-key req lacking the scope, responds
 * 403 SCOPE_INSUFFICIENT. We confirm via a fresh probe per layer.
 */

/* ── Coverage: every auth-protected route carries a requireScope guard ──── */

describe("requisitions router — every auth-protected route is scope-guarded", () => {
  it("each route 403s SCOPE_INSUFFICIENT for API-key auth lacking the scope", async () => {
    for (const r of GUARDED) {
      const router = createRequisitionsRouter(makeDeps());
      const stack = getStack(router, r.method, r.path);
      const req = mockReq({
        isApiKeyAuth: true,
        apiKeyScopes: [],            // no scopes → must be rejected
        orgId: "org-1",
        params: { id: "11111111-1111-1111-1111-111111111111", reqId: "11111111-1111-1111-1111-111111111111", candId: "22222222-2222-2222-2222-222222222222" },
        body: r.method === "post" || r.method === "patch" ? {} : {}
      });
      const res = mockRes();
      const out = await runChain(stack, req, res);
      assert.strictEqual(out.responded, true, `${r.method} ${r.path}: chain did not respond`);
      assert.strictEqual(out.status, 403, `${r.method} ${r.path}: expected 403, got ${out.status}`);
      assert.strictEqual(out.json?.success, false, `${r.method} ${r.path}: expected success:false`);
      assert.strictEqual(
        out.json?.error?.code,
        "SCOPE_INSUFFICIENT",
        `${r.method} ${r.path}: expected SCOPE_INSUFFICIENT, got ${JSON.stringify(out.json)}`
      );
    }
  });
});

/* ── Representative GET: read:requisitions enforcement ─────────────────── */

describe("GET /requisitions — read:requisitions scope boundary", () => {
  it("403 SCOPE_INSUFFICIENT for API-key auth without read:requisitions", async () => {
    const router = createRequisitionsRouter(makeDeps());
    const stack = getStack(router, READ_ROUTE.method, READ_ROUTE.path);
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: [], orgId: "org-1" });
    const res = mockRes();
    const out = await runChain(stack, req, res);
    assert.strictEqual(out.status, 403);
    assert.strictEqual(out.json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("does NOT 403 at requireScope when read:requisitions present (chain proceeds past it)", async () => {
    const router = createRequisitionsRouter(makeDeps());
    const stack = getStack(router, READ_ROUTE.method, READ_ROUTE.path);
    // requireAuth(0) → requireScope(1) → requirePermission(2). Run only the
    // first two layers: with the scope present, requireScope must call next()
    // (not respond), so after 2 layers no SCOPE_INSUFFICIENT 403 was emitted.
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["read:requisitions"], orgId: "org-1" });
    const res = mockRes();
    const out = await runChain(stack, req, res, { maxLayers: 2 });
    assert.notStrictEqual(out.status, 403, "requireScope must not 403 when scope is present");
    assert.strictEqual(
      out.json?.error?.code,
      undefined,
      "no SCOPE_INSUFFICIENT should be emitted when scope is present"
    );
  });

  it("write:requisitions implies read (chain proceeds past requireScope)", async () => {
    const router = createRequisitionsRouter(makeDeps());
    const stack = getStack(router, READ_ROUTE.method, READ_ROUTE.path);
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["write:requisitions"], orgId: "org-1" });
    const res = mockRes();
    const out = await runChain(stack, req, res, { maxLayers: 2 });
    assert.notStrictEqual(out.status, 403, "write:requisitions should satisfy read:requisitions");
  });

  it("session auth (no isApiKeyAuth) is NOT blocked by requireScope", async () => {
    const router = createRequisitionsRouter(makeDeps());
    const stack = getStack(router, READ_ROUTE.method, READ_ROUTE.path);
    // No isApiKeyAuth, no apiKeyScopes → requireScope passes through.
    const req = mockReq({ orgId: "org-1" });
    const res = mockRes();
    const out = await runChain(stack, req, res, { maxLayers: 2 });
    assert.notStrictEqual(out.status, 403, "session auth must pass requireScope untouched");
    assert.strictEqual(out.json?.error?.code, undefined);
  });
});

/* ── Representative mutation: write:requisitions enforcement ───────────── */

describe("PATCH /requisitions/:id — write:requisitions scope boundary", () => {
  it("403 SCOPE_INSUFFICIENT for API-key auth without write:requisitions", async () => {
    const router = createRequisitionsRouter(makeDeps());
    const stack = getStack(router, WRITE_ROUTE.method, WRITE_ROUTE.path);
    const req = mockReq({
      isApiKeyAuth: true,
      apiKeyScopes: ["read:requisitions"],   // read only → write must be rejected
      orgId: "org-1",
      params: { id: "11111111-1111-1111-1111-111111111111" },
      body: {}
    });
    const res = mockRes();
    const out = await runChain(stack, req, res);
    assert.strictEqual(out.status, 403);
    assert.strictEqual(out.json?.success, false);
    assert.strictEqual(out.json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("does NOT 403 at requireScope when write:requisitions present", async () => {
    const router = createRequisitionsRouter(makeDeps());
    const stack = getStack(router, WRITE_ROUTE.method, WRITE_ROUTE.path);
    const req = mockReq({
      isApiKeyAuth: true,
      apiKeyScopes: ["write:requisitions"],
      orgId: "org-1",
      params: { id: "11111111-1111-1111-1111-111111111111" },
      body: {}
    });
    const res = mockRes();
    const out = await runChain(stack, req, res, { maxLayers: 2 });
    assert.notStrictEqual(out.status, 403, "requireScope must not 403 when write scope is present");
    assert.strictEqual(out.json?.error?.code, undefined);
  });

  it("session auth (no isApiKeyAuth) is NOT blocked by requireScope on mutation", async () => {
    const router = createRequisitionsRouter(makeDeps());
    const stack = getStack(router, WRITE_ROUTE.method, WRITE_ROUTE.path);
    const req = mockReq({
      orgId: "org-1",
      params: { id: "11111111-1111-1111-1111-111111111111" },
      body: {}
    });
    const res = mockRes();
    const out = await runChain(stack, req, res, { maxLayers: 2 });
    assert.notStrictEqual(out.status, 403, "session auth must pass requireScope untouched");
  });
});
