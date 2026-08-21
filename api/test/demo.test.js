/**
 * Demo-System Tests — createDemoRouter
 *
 * Testet: Rollen-Login, Plan-Fallback, Validierung, Reset, Accounts-Endpunkt.
 * Run: node --test --test-force-exit test/demo.test.js
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDemoRouter } from "../routes/demo.js";

/* ── Helpers ──────────────────────────────────────────────── */

function mockPool(rows = []) {
  const queries = [];
  return {
    query(sql, params) {
      queries.push({ sql, params });
      return Promise.resolve({ rows });
    },
    async connect() {
      const txQueries = [];
      return {
        query(sql, params) { txQueries.push({ sql, params }); return Promise.resolve({ rows: [] }); },
        release() {},
        _txQueries: txQueries
      };
    },
    _queries: queries
  };
}

function mockLogger() {
  const entries = [];
  return {
    info(...args) { entries.push({ level: "info", args }); },
    warn(...args) { entries.push({ level: "warn", args }); },
    error(...args) { entries.push({ level: "error", args }); },
    _entries: entries
  };
}

function mockReq(body = {}, session = {}) {
  /* `regenerate` gehoert zur Attrappe, seit der Demo-Login die Sitzung neu
   * erzeugt (8.1.1): ohne `regenerate` erbte die Sitzung den `_orgCache` des
   * zuvor angemeldeten Kontos, und `req.orgId` zeigte fuer den Demo-Nutzer auf
   * eine fremde Organisation. Die Attrappe raeumt wie express-session: alles
   * vor dem Aufruf Gesetzte ist danach weg. */
  session.regenerate = (cb) => {
    for (const schluessel of Object.keys(session)) {
      if (schluessel !== "regenerate") delete session[schluessel];
    }
    cb(null);
  };
  return { body, session };
}

function mockRes() {
  let _status = 200, _json = null;
  const res = {
    locals: {},
    status(code) { _status = code; return res; },
    json(data) { _json = data; return res; },
    get _status() { return _status; },
    get _json() { return _json; }
  };
  return res;
}

const noopLimiter = (_req, _res, next) => next();

/* ── Router-Helfer: Extrahiert Route-Handler ──────────────── */

function getRouteHandler(router, method, path) {
  const layer = router.stack.find(
    l => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  // Letzter Handler (nach Middleware wie authLimiter)
  const handlers = layer.route.stack.map(s => s.handle);
  return handlers[handlers.length - 1];
}

/* ═══════════════════════════════════════════════════════════
   POST /auth/demo-login — Rollen-basiert (primär)
   ═══════════════════════════════════════════════════════════ */

describe("POST /auth/demo-login — role-based", () => {
  it("logs in with role=buyer", async () => {
    const pool = mockPool([{ id: "u1", role: "company" }]);
    const getUserAndPlan = async () => ({ id: "u1", plan: "ENTERPRISE", is_demo: true });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "buyer" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._json.id, "u1");
    assert.strictEqual(res._json.is_demo, true);
    assert.strictEqual(req.session.isDemo, true);
    assert.strictEqual(req.session.userId, "u1");
    assert.ok(pool._queries[0].sql.includes("is_demo"));
    assert.ok(pool._queries[0].params[0].includes("demo-buyer@"));
  });

  it("logs in with role=agency", async () => {
    const pool = mockPool([{ id: "u2", role: "agency" }]);
    const getUserAndPlan = async () => ({ id: "u2", plan: "ENTERPRISE", is_demo: true });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "agency" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._json.id, "u2");
    assert.strictEqual(req.session.userRole, "agency");
  });

  it("logs in with role=admin", async () => {
    const pool = mockPool([{ id: "u3", role: "company" }]);
    const getUserAndPlan = async () => ({ id: "u3", plan: "ENTERPRISE", is_demo: true });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "admin" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._json.id, "u3");
    assert.ok(pool._queries[0].params[0].includes("demo-admin@"));
  });

  it("is case-insensitive for role", async () => {
    const pool = mockPool([{ id: "u1", role: "company" }]);
    const getUserAndPlan = async () => ({ id: "u1" });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "BUYER" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(req.session.userId, "u1");
  });
});

/* ═══════════════════════════════════════════════════════════
   POST /auth/demo-login — Plan-basiert (Legacy-Fallback)
   ═══════════════════════════════════════════════════════════ */

describe("POST /auth/demo-login — plan-based fallback", () => {
  it("falls back to plan=ENTERPRISE when no role given", async () => {
    const pool = mockPool([{ id: "u1", role: "company" }]);
    const getUserAndPlan = async () => ({ id: "u1", plan: "ENTERPRISE" });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ plan: "ENTERPRISE" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(req.session.userId, "u1");
    assert.ok(pool._queries[0].params[0].includes("demo-buyer@"));
  });

  it("falls back to plan=BASIS", async () => {
    const pool = mockPool([{ id: "u6", role: "agency" }]);
    const getUserAndPlan = async () => ({ id: "u6" });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ plan: "BASIS" });
    const res = mockRes();
    await handler(req, res);

    assert.ok(pool._queries[0].params[0].includes("demo-agency3@"));
  });

  it("falls back to plan=PRO", async () => {
    const pool = mockPool([{ id: "u5", role: "agency" }]);
    const getUserAndPlan = async () => ({ id: "u5" });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ plan: "PRO" });
    const res = mockRes();
    await handler(req, res);

    assert.ok(pool._queries[0].params[0].includes("demo-agency2@"));
  });

  it("falls back to plan=PLUS", async () => {
    const pool = mockPool([{ id: "u4", role: "company" }]);
    const getUserAndPlan = async () => ({ id: "u4" });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ plan: "PLUS" });
    const res = mockRes();
    await handler(req, res);

    assert.ok(pool._queries[0].params[0].includes("demo-buyer2@"));
  });
});

/* ═══════════════════════════════════════════════════════════
   POST /auth/demo-login — Validation / Error cases
   ═══════════════════════════════════════════════════════════ */

describe("POST /auth/demo-login — validation", () => {
  it("rejects empty body with 400", async () => {
    const pool = mockPool();
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan: async () => ({}), authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({});
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._status, 400);
    assert.strictEqual(res._json.error, "INVALID_DEMO_LOGIN");
  });

  it("rejects invalid role with 400", async () => {
    const pool = mockPool();
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan: async () => ({}), authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "superadmin" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._status, 400);
  });

  it("rejects invalid plan with 400", async () => {
    const pool = mockPool();
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan: async () => ({}), authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ plan: "FREE" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._status, 400);
  });

  it("returns 404 when demo user not found in DB", async () => {
    const pool = mockPool([]);  // no rows
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan: async () => ({}), authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "buyer" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._status, 404);
    assert.strictEqual(res._json.error, "DEMO_USER_NOT_FOUND");
  });

  it("role takes priority over plan when both provided", async () => {
    const pool = mockPool([{ id: "u1", role: "company" }]);
    const getUserAndPlan = async () => ({ id: "u1" });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "buyer", plan: "BASIS" });
    const res = mockRes();
    await handler(req, res);

    // Should use role=buyer email, not plan=BASIS email
    assert.ok(pool._queries[0].params[0].includes("demo-buyer@"));
  });

  it("sets audit details in res.locals", async () => {
    const pool = mockPool([{ id: "u1", role: "company" }]);
    const getUserAndPlan = async () => ({ id: "u1" });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "buyer" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.locals.audit.action, "demo.login");
    assert.strictEqual(res.locals.audit.entity_type, "user");
    assert.strictEqual(res.locals.audit.entity_id, "u1");
  });

  it("handles DB error with 500", async () => {
    const pool = {
      query() { return Promise.reject(new Error("DB down")); }
    };
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan: async () => ({}), authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "buyer" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._status, 500);
    assert.strictEqual(res._json.error, "SERVER_ERROR");
  });
});

/* ═══════════════════════════════════════════════════════════
   POST /demo/reset
   ═══════════════════════════════════════════════════════════ */

describe("POST /demo/reset", () => {
  it("rejects non-demo sessions with 403", async () => {
    const pool = mockPool();
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan: async () => ({}), authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/demo/reset");

    const req = mockReq({}, { isDemo: false });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "DEMO_ONLY");
  });

  it("rejects missing session with 403", async () => {
    const pool = mockPool();
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan: async () => ({}), authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/demo/reset");

    const req = { body: {} };
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._status, 403);
  });

  it("performs reset for demo sessions", async () => {
    const txQueries = [];
    const pool = {
      async connect() {
        return {
          query(sql) { txQueries.push(sql); return Promise.resolve({ rows: [] }); },
          release() {}
        };
      }
    };
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan: async () => ({}), authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/demo/reset");

    const req = mockReq({}, { isDemo: true, userId: "d0a00000-0000-0000-0000-000000000001" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._json.ok, true);
    assert.ok(txQueries.includes("BEGIN"), "Should open transaction");
    assert.ok(txQueries.includes("COMMIT"), "Should commit transaction");
    // Should delete non-seed data from 4 tables
    const deleteQueries = txQueries.filter(q => typeof q === 'string' && q.includes("DELETE"));
    assert.ok(deleteQueries.length >= 4, `Expected 4 DELETE queries, got ${deleteQueries.length}`);
  });

  it("rolls back on error", async () => {
    let rolledBack = false;
    const pool = {
      async connect() {
        let callCount = 0;
        return {
          query(sql) {
            callCount++;
            if (callCount === 2) throw new Error("Simulated failure");
            if (sql === "ROLLBACK") rolledBack = true;
            return Promise.resolve({ rows: [] });
          },
          release() {}
        };
      }
    };
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan: async () => ({}), authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/demo/reset");

    const req = mockReq({}, { isDemo: true, userId: "u1" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res._status, 500);
    assert.ok(rolledBack, "Should have rolled back");
  });
});

/* ═══════════════════════════════════════════════════════════
   GET /demo/accounts
   ═══════════════════════════════════════════════════════════ */

describe("GET /demo/accounts", () => {
  it("returns available roles and plans", () => {
    const pool = mockPool();
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan: async () => ({}), authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "get", "/demo/accounts");

    const req = mockReq();
    const res = mockRes();
    handler(req, res);

    assert.deepStrictEqual(res._json.roles, ["buyer", "agency", "admin"]);
    assert.deepStrictEqual(res._json.plans, ["ENTERPRISE", "PLUS", "PRO", "BASIS"]);
    assert.ok(res._json.accounts.buyer);
    assert.ok(res._json.accounts.agency);
    assert.ok(res._json.accounts.admin);
    assert.strictEqual(res._json.accounts.buyer.plan, "ENTERPRISE");
  });
});

/* ═══════════════════════════════════════════════════════════
   Session-Flags
   ═══════════════════════════════════════════════════════════ */

describe("Session flags", () => {
  it("sets isDemo=true, userId and userRole on session", async () => {
    const pool = mockPool([{ id: "test-id", role: "agency" }]);
    const getUserAndPlan = async () => ({ id: "test-id", plan: "ENTERPRISE" });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "agency" });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(req.session.isDemo, true);
    assert.strictEqual(req.session.userId, "test-id");
    assert.strictEqual(req.session.userRole, "agency");
  });

  it("response always includes is_demo: true", async () => {
    const pool = mockPool([{ id: "u1", role: "company" }]);
    const getUserAndPlan = async () => ({ id: "u1", plan: "ENTERPRISE", is_demo: false });
    const router = createDemoRouter({ pool, logger: mockLogger(), getUserAndPlan, authLimiter: noopLimiter });
    const handler = getRouteHandler(router, "post", "/auth/demo-login");

    const req = mockReq({ role: "buyer" });
    const res = mockRes();
    await handler(req, res);

    // is_demo from spread should be overridden to true
    assert.strictEqual(res._json.is_demo, true);
  });
});
