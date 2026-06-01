/**
 * DemoGuard middleware tests — blocks dangerous mutations in demo sessions,
 * passes through for non-demo sessions and non-blocked routes.
 *
 * Run: node --test --test-force-exit test/demoGuard.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { demoGuard } from "../middleware/demoGuard.js";

/* ── helpers ──────────────────────────────────────────────── */

function mockRes() {
  let _status, _json;
  return {
    status(code) { _status = code; return this; },
    json(body) { _json = body; return this; },
    get _status() { return _status; },
    get _json() { return _json; }
  };
}

/* ═══════════════════════════════════════════════════════════
   Non-demo sessions — pass through
   ═══════════════════════════════════════════════════════════ */

describe("demoGuard — non-demo sessions", () => {
  it("calls next() when session.isDemo is false", () => {
    const req = { method: "DELETE", originalUrl: "/api/me", session: { isDemo: false } };
    const res = mockRes();
    let nextCalled = false;
    demoGuard(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("calls next() when session.isDemo is undefined", () => {
    const req = { method: "DELETE", originalUrl: "/api/me", session: {} };
    const res = mockRes();
    let nextCalled = false;
    demoGuard(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("calls next() when session is undefined", () => {
    const req = { method: "DELETE", originalUrl: "/api/me" };
    const res = mockRes();
    let nextCalled = false;
    demoGuard(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("calls next() when session is null", () => {
    const req = { method: "DELETE", originalUrl: "/api/me", session: null };
    const res = mockRes();
    let nextCalled = false;
    demoGuard(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });
});

/* ═══════════════════════════════════════════════════════════
   Demo sessions — blocked routes
   ═══════════════════════════════════════════════════════════ */

describe("demoGuard — blocked routes in demo mode", () => {
  const BLOCKED = [
    { method: "DELETE", path: "/api/me", desc: "account deletion" },
    { method: "POST", path: "/api/me/change-password", desc: "password change" },
    { method: "POST", path: "/api/me/plan", desc: "plan change" },
    { method: "POST", path: "/api/me/plan/cancel", desc: "plan cancellation" }
  ];

  for (const { method, path, desc } of BLOCKED) {
    it(`blocks ${method} ${path} (${desc})`, () => {
      const req = { method, originalUrl: path, session: { isDemo: true } };
      const res = mockRes();
      demoGuard(req, res, () => assert.fail("next() should not be called"));
      assert.strictEqual(res._status, 403);
      assert.strictEqual(res._json.error, "DEMO_RESTRICTED");
      assert.ok(typeof res._json.message === "string");
      assert.ok(res._json.message.length > 10, "Message should be user-friendly");
    });
  }
});

/* ═══════════════════════════════════════════════════════════
   Demo sessions — non-blocked routes pass through
   ═══════════════════════════════════════════════════════════ */

describe("demoGuard — non-blocked routes in demo mode", () => {
  const ALLOWED = [
    { method: "GET", path: "/api/me" },
    { method: "PATCH", path: "/api/me" },
    { method: "POST", path: "/api/listings" },
    { method: "DELETE", path: "/api/listings/123" },
    { method: "POST", path: "/api/me/settings" },
    { method: "GET", path: "/api/me/plan" },
    { method: "POST", path: "/api/invoices" }
  ];

  for (const { method, path } of ALLOWED) {
    it(`allows ${method} ${path} even in demo mode`, () => {
      const req = { method, originalUrl: path, session: { isDemo: true } };
      const res = mockRes();
      let nextCalled = false;
      demoGuard(req, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
    });
  }
});

/* ═══════════════════════════════════════════════════════════
   Edge cases
   ═══════════════════════════════════════════════════════════ */

describe("demoGuard — edge cases", () => {
  it("uses originalUrl, not path (important for Express sub-routers)", () => {
    // When routes are mounted under /api, originalUrl contains the full path
    const req = {
      method: "DELETE",
      originalUrl: "/api/me",
      path: "/me",  // sub-router path
      session: { isDemo: true }
    };
    const res = mockRes();
    demoGuard(req, res, () => assert.fail("should be blocked"));
    assert.strictEqual(res._status, 403);
  });

  it("does not block when method matches but path does not", () => {
    const req = {
      method: "DELETE",
      originalUrl: "/api/me/avatar",
      session: { isDemo: true }
    };
    const res = mockRes();
    let nextCalled = false;
    demoGuard(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("does not block when path matches but method does not", () => {
    const req = {
      method: "GET",
      originalUrl: "/api/me/change-password",
      session: { isDemo: true }
    };
    const res = mockRes();
    let nextCalled = false;
    demoGuard(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });
});
