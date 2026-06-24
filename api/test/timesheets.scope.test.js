/**
 * API-Key SCOPE-ENFORCEMENT boundary test for routes/timesheets.js.
 *
 * Verifies that requireScope("read:timesheets" | "write:timesheets") is wired
 * into every auth-protected timesheet route and behaves correctly:
 *   - API-key auth LACKING the scope        → 403 SCOPE_INSUFFICIENT
 *   - API-key auth WITH the correct scope    → passes the requireScope layer
 *   - Session auth (no API key)              → passes the requireScope layer
 *   - The no-auth meta route (/status-meta)  → has NO requireScope guard
 *
 * Unlike the handler-coverage harness, this test runs the FULL middleware
 * chain (every layer in route.stack in order) so the requireScope layer is
 * actually exercised. Downstream layers (requireAuth / featureGate / rperm)
 * are no-op passthroughs via deps + service stubs, so once the chain proceeds
 * PAST requireScope we stop — we only assert the scope gate's behaviour.
 *
 * Run: node --test --test-force-exit test/timesheets.scope.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTimesheetsRouter } from "../routes/timesheets.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

// pool whose every query resolves empty; handlers that reach DB just no-op out.
function noopPool() {
  const query = async () => ({ rows: [], rowCount: 0 });
  return { query, connect: async () => ({ query, release() {} }) };
}

function makeDeps() {
  return {
    pool: noopPool(),
    logger: mockLogger(),
    // requireAuth passthrough (session already present on req)
    requireAuth: (_req, _res, next) => next(),
    // getUserAndPlan returns a plan that has the timesheets feature (PRO)
    getUserAndPlan: async () => ({ id: "u1", plan: "PRO" })
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    user: { id: "u1" },
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    get: () => "",
    ...overrides
  };
}

function mockRes() {
  const headers = {};
  const res = {
    _status: 200,
    _json: null,
    _send: null,
    _headers: headers,
    _ended: false,
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

/** Locate a route layer (with its full middleware stack) by method + path. */
function getRoute(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method]) continue;
    return layer.route;
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/**
 * Run the route's middleware chain layer-by-layer, stopping as soon as a layer
 * responds (res._ended) or a layer fails to call next(). The terminal handler
 * (last stack entry) is NEVER invoked — it would hit the (stubbed) DB — but by
 * the time the chain advances into it, every middleware (incl. requireScope)
 * has already passed. We record the index of the last layer that called next()
 * so callers can prove the chain advanced PAST the requireScope gate.
 *
 * Returns:
 *   responded     - did a layer send a response?
 *   status / json - that response (if any)
 *   blockedAt     - index of the layer that responded/stalled (or null)
 *   advancedTo    - index of the last middleware that called next() (-1 if none)
 *   reachedHandler- true if the chain advanced all the way into the handler
 */
async function runChain(route, req, res) {
  const stack = route.stack;
  let advancedTo = -1;

  for (let i = 0; i < stack.length; i++) {
    // Last layer = handler. If we got here, all middleware passed; don't run it.
    if (i === stack.length - 1) {
      return { responded: false, status: res._status, json: res._json, blockedAt: null, advancedTo, reachedHandler: true };
    }
    let calledNext = false;
    let nextErr = null;
    await stack[i].handle(req, res, (err) => { calledNext = true; nextErr = err; });
    if (nextErr) throw nextErr;
    if (res._ended) {
      return { responded: true, status: res._status, json: res._json, blockedAt: i, advancedTo, reachedHandler: false };
    }
    if (!calledNext) {
      return { responded: false, status: res._status, json: res._json, blockedAt: i, advancedTo, reachedHandler: false };
    }
    advancedTo = i;
  }
  return { responded: false, status: res._status, json: res._json, blockedAt: null, advancedTo, reachedHandler: true };
}

/**
 * Probe a route with an API-key request carrying NO scopes: the ONLY layer that
 * can emit a 403 SCOPE_INSUFFICIENT is requireScope, so the layer that blocks is
 * the requireScope gate. Returns its stack index (used to prove that, with a
 * valid scope, the chain advances strictly past this index).
 */
async function findScopeLayerIndex(route) {
  const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: [], orgId: "org-1" });
  const res = mockRes();
  const out = await runChain(route, req, res);
  assert.ok(out.responded && out.json?.error?.code === "SCOPE_INSUFFICIENT",
    `expected requireScope to block a no-scope API key on ${route.path}`);
  return out.blockedAt;
}

/* ── Route inventory: scope expectations ───────────────────────────────── */

const READ = "read:timesheets";
const WRITE = "write:timesheets";

const AUTH_ROUTES = [
  ["get", "/timesheets", READ],
  ["post", "/timesheets", WRITE],
  ["get", "/timesheets/:id", READ],
  ["patch", "/timesheets/:id", WRITE],
  ["post", "/timesheets/:id/entries", WRITE],
  ["patch", "/timesheets/:id/entries/:entryId", WRITE],
  ["delete", "/timesheets/:id/entries/:entryId", WRITE],
  ["post", "/timesheets/:id/submit", WRITE],
  ["post", "/timesheets/:id/approve", WRITE],
  ["post", "/timesheets/:id/reject", WRITE],
  ["post", "/timesheets/:id/cancel", WRITE],
  ["post", "/timesheets/:id/return-to-draft", WRITE],
  ["post", "/timesheets/prefill", WRITE],
  ["post", "/timesheets/:id/sign", WRITE],
  ["post", "/timesheets/batch-approve", WRITE],
  ["post", "/timesheets/batch-reject", WRITE],
  ["get", "/timesheets/worker-summary", READ],
  ["get", "/timesheets/export/csv", READ],
  ["get", "/assignments/:id/timesheets", READ]
];

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe("timesheets router — scope-enforcement boundary", () => {
  it("registers all auth-protected routes plus the no-auth meta route", () => {
    const router = createTimesheetsRouter(makeDeps());
    const seen = new Set(
      router.stack
        .filter((l) => l.route)
        .map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
    );
    for (const [method, path] of AUTH_ROUTES) {
      assert.ok(seen.has(`${method} ${path}`), `missing route: ${method} ${path}`);
    }
    assert.ok(seen.has("get /timesheets/status-meta"), "missing /timesheets/status-meta");
  });

  it("EVERY auth route 403s SCOPE_INSUFFICIENT for an API-key lacking the scope", async () => {
    for (const [method, path, scope] of AUTH_ROUTES) {
      const router = createTimesheetsRouter(makeDeps());
      const route = getRoute(router, method, path);
      const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: [], orgId: "org-1" });
      const res = mockRes();
      const out = await runChain(route, req, res);
      assert.ok(out.responded, `${method} ${path}: chain should have been blocked, but proceeded`);
      assert.strictEqual(out.status, 403, `${method} ${path}: expected 403, got ${out.status}`);
      assert.strictEqual(
        out.json?.error?.code,
        "SCOPE_INSUFFICIENT",
        `${method} ${path}: expected SCOPE_INSUFFICIENT, got ${JSON.stringify(out.json)}`
      );
      assert.strictEqual(out.json?.success, false, `${method} ${path}: expected success:false`);
    }
  });

  it("EVERY auth route 403s when an API-key holds a DIFFERENT-resource scope only", async () => {
    // A key scoped to an unrelated resource must never satisfy a timesheets route.
    // (Note: write:timesheets legitimately implies read:timesheets per hasScope,
    //  so a same-resource read key on a read route is NOT a boundary violation —
    //  we therefore probe with a genuinely unrelated scope.)
    for (const [method, path] of AUTH_ROUTES) {
      const router = createTimesheetsRouter(makeDeps());
      const route = getRoute(router, method, path);
      const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["read:invoices", "write:invoices"], orgId: "org-1" });
      const res = mockRes();
      const out = await runChain(route, req, res);
      assert.ok(out.responded, `${method} ${path}: foreign-scope key should be blocked`);
      assert.strictEqual(out.status, 403, `${method} ${path}: expected 403 for foreign scope`);
      assert.strictEqual(out.json?.error?.code, "SCOPE_INSUFFICIENT", `${method} ${path}: expected SCOPE_INSUFFICIENT`);
    }
  });

  it("READ-scope key is REJECTED on every WRITE route (no read→write escalation)", async () => {
    for (const [method, path, scope] of AUTH_ROUTES) {
      if (scope !== WRITE) continue;
      const router = createTimesheetsRouter(makeDeps());
      const route = getRoute(router, method, path);
      const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: [READ], orgId: "org-1" });
      const res = mockRes();
      const out = await runChain(route, req, res);
      assert.ok(out.responded, `${method} ${path}: read-only key must not reach a write route`);
      assert.strictEqual(out.status, 403, `${method} ${path}: expected 403 for read key on write route`);
      assert.strictEqual(out.json?.error?.code, "SCOPE_INSUFFICIENT", `${method} ${path}: expected SCOPE_INSUFFICIENT`);
    }
  });

  it("EVERY auth route PASSES the requireScope layer when the correct scope is present", async () => {
    for (const [method, path, scope] of AUTH_ROUTES) {
      const router = createTimesheetsRouter(makeDeps());
      const route = getRoute(router, method, path);
      const scopeIdx = await findScopeLayerIndex(route);

      const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: [scope], orgId: "org-1" });
      const res = mockRes();
      const out = await runChain(route, req, res);
      // Must NOT be blocked by the scope gate...
      assert.ok(
        !(out.responded && out.json?.error?.code === "SCOPE_INSUFFICIENT"),
        `${method} ${path}: correct scope was wrongly blocked by requireScope`
      );
      // ...and the chain must have advanced strictly PAST the requireScope layer
      // (either into a later middleware or all the way to the handler).
      assert.ok(
        out.reachedHandler || out.advancedTo >= scopeIdx,
        `${method} ${path}: chain did not advance past requireScope (advancedTo=${out.advancedTo}, scopeIdx=${scopeIdx})`
      );
    }
  });

  it("EVERY auth route lets SESSION auth (no API key) through the requireScope layer", async () => {
    for (const [method, path] of AUTH_ROUTES) {
      const router = createTimesheetsRouter(makeDeps());
      const route = getRoute(router, method, path);
      const scopeIdx = await findScopeLayerIndex(route);

      // No isApiKeyAuth → requireScope passes through.
      const req = mockReq({ orgId: "org-1" });
      const res = mockRes();
      const out = await runChain(route, req, res);
      assert.ok(
        !(out.responded && out.json?.error?.code === "SCOPE_INSUFFICIENT"),
        `${method} ${path}: session auth wrongly blocked by requireScope`
      );
      assert.ok(
        out.reachedHandler || out.advancedTo >= scopeIdx,
        `${method} ${path}: session chain did not advance past requireScope (advancedTo=${out.advancedTo}, scopeIdx=${scopeIdx})`
      );
    }
  });

  it("/timesheets/status-meta (no-auth meta) carries NO requireScope guard and is NOT scope-blocked", async () => {
    const router = createTimesheetsRouter(makeDeps());
    const route = getRoute(router, "get", "/timesheets/status-meta");
    // single static handler, no middleware
    assert.strictEqual(route.stack.length, 1, "status-meta should have exactly one (handler) layer");
    // Even simulating an API-key with NO scopes must not 403 here.
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: [] });
    const res = mockRes();
    await route.stack[0].handle(req, res, () => {});
    assert.notStrictEqual(res._status, 403, "status-meta must not be scope-blocked");
  });
});
