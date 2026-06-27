/**
 * Auth middleware unit tests — requireAuth + csrfProtect.
 * No DB.  Tests the security boundary: session checks, CSRF validation.
 *
 * Run: node --test --test-force-exit test/auth.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { requireAuth, csrfProtect } from "../middleware/auth.js";

/* ── Test helpers ───────────────────────────────────────── */

function mockRes() {
  let _status, _json;
  return {
    status(code) { _status = code; return this; },
    json(body) { _json = body; return this; },
    get _status() { return _status; },
    get _json() { return _json; }
  };
}

// ─────────────────────────────────────────────────────────────
// requireAuth
// ─────────────────────────────────────────────────────────────

describe("requireAuth", () => {
  it("returns 401 when session is missing", () => {
    const req = {};
    const res = mockRes();
    requireAuth(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error, "NOT_AUTHENTICATED");
  });

  it("returns 401 when session exists but userId is missing", () => {
    const req = { session: {} };
    const res = mockRes();
    requireAuth(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 401);
    assert.strictEqual(res._json.error, "NOT_AUTHENTICATED");
  });

  it("returns 401 when session.userId is null", () => {
    const req = { session: { userId: null } };
    const res = mockRes();
    requireAuth(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 401);
  });

  it("calls next() when session.userId is present", () => {
    const req = { session: { userId: "user-123" } };
    const res = mockRes();
    let nextCalled = false;
    requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("calls next() when session.userId is a number", () => {
    const req = { session: { userId: 42 } };
    const res = mockRes();
    let nextCalled = false;
    requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });
});

// ─────────────────────────────────────────────────────────────
// csrfProtect — safe method bypass
// ─────────────────────────────────────────────────────────────

describe("csrfProtect — safe method bypass", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    it(`skips CSRF for ${method} requests`, () => {
      const req = { method, path: "/api/something", headers: {}, session: {} };
      const res = mockRes();
      let nextCalled = false;
      csrfProtect(req, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// csrfProtect — /csrf path bypass
// ─────────────────────────────────────────────────────────────

describe("csrfProtect — /csrf endpoint bypass", () => {
  it("skips CSRF for POST to /api/csrf", () => {
    const req = { method: "POST", path: "/api/csrf", headers: {}, session: {} };
    const res = mockRes();
    let nextCalled = false;
    csrfProtect(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("skips CSRF for POST to /csrf (without /api prefix)", () => {
    const req = { method: "POST", path: "/csrf", headers: {}, session: {} };
    const res = mockRes();
    let nextCalled = false;
    csrfProtect(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });
});

// ─────────────────────────────────────────────────────────────
// csrfProtect — token validation
// ─────────────────────────────────────────────────────────────

describe("csrfProtect — token validation", () => {
  it("returns 403 when no CSRF token header is provided", () => {
    const req = {
      method: "POST", path: "/api/data",
      headers: {},
      session: { csrfToken: "abc123" }
    };
    const res = mockRes();
    csrfProtect(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "CSRF_INVALID");
  });

  it("returns 403 when session has no csrfToken", () => {
    const req = {
      method: "POST", path: "/api/data",
      headers: { "x-csrf-token": "abc123" },
      session: {}
    };
    const res = mockRes();
    csrfProtect(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "CSRF_INVALID");
  });

  it("returns 403 when tokens mismatch", () => {
    const req = {
      method: "POST", path: "/api/data",
      headers: { "x-csrf-token": "wrong-token" },
      session: { csrfToken: "correct-token" }
    };
    const res = mockRes();
    csrfProtect(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "CSRF_INVALID");
  });

  it("calls next() when tokens match", () => {
    const req = {
      method: "POST", path: "/api/data",
      headers: { "x-csrf-token": "valid-token-xyz" },
      session: { csrfToken: "valid-token-xyz" }
    };
    const res = mockRes();
    let nextCalled = false;
    csrfProtect(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("validates CSRF for PUT requests", () => {
    const req = {
      method: "PUT", path: "/api/resource/1",
      headers: { "x-csrf-token": "tok" },
      session: { csrfToken: "tok" }
    };
    const res = mockRes();
    let nextCalled = false;
    csrfProtect(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("validates CSRF for DELETE requests", () => {
    const req = {
      method: "DELETE", path: "/api/resource/1",
      headers: {},
      session: { csrfToken: "tok" }
    };
    const res = mockRes();
    csrfProtect(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 403);
  });

  it("validates CSRF for PATCH requests", () => {
    const req = {
      method: "PATCH", path: "/api/resource/1",
      headers: { "x-csrf-token": "match" },
      session: { csrfToken: "match" }
    };
    const res = mockRes();
    let nextCalled = false;
    csrfProtect(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });
});

// ─────────────────────────────────────────────────────────────
// csrfProtect — API-Key/M2M/OAuth bypass (sessionlose Auth)
// ─────────────────────────────────────────────────────────────

describe("csrfProtect — sessionlose Auth (API-Key/M2M/OAuth)", () => {
  it("laesst POST mit X-API-Key durch (kein CSRF-Token noetig)", () => {
    const req = { method: "POST", path: "/api/scim/v2/Users", headers: { "x-api-key": "tc_live_xxx" }, session: {} };
    const res = mockRes();
    let nextCalled = false;
    csrfProtect(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res._status, undefined);
  });

  it("laesst POST mit Authorization: Bearer durch (M2M-JWT/Key)", () => {
    const req = { method: "POST", path: "/api/v1/scim/v2/Users", headers: { authorization: "Bearer eyJhbGci..." }, session: {} };
    const res = mockRes();
    let nextCalled = false;
    csrfProtect(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("laesst POST /api/oauth/token ohne CSRF/Session durch", () => {
    const req = { method: "POST", path: "/api/oauth/token", headers: {}, session: {} };
    const res = mockRes();
    let nextCalled = false;
    csrfProtect(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("laesst POST /api/v1/oauth/token durch (versioniert)", () => {
    const req = { method: "POST", path: "/api/v1/oauth/token", headers: {}, session: {} };
    const res = mockRes();
    let nextCalled = false;
    csrfProtect(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  it("blockt weiterhin Cookie-Session-POST ohne CSRF (Basic-Auth ist KEIN Bearer-Bypass)", () => {
    const req = { method: "POST", path: "/api/data", headers: { authorization: "Basic Zm9vOmJhcg==" }, session: { csrfToken: "tok" } };
    const res = mockRes();
    csrfProtect(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "CSRF_INVALID");
  });
});

// ─────────────────────────────────────────────────────────────
// csrfProtect — edge cases
// ─────────────────────────────────────────────────────────────

describe("csrfProtect — edge cases", () => {
  it("handles missing session gracefully", () => {
    const req = {
      method: "POST", path: "/api/data",
      headers: { "x-csrf-token": "tok" }
    };
    const res = mockRes();
    csrfProtect(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 403);
  });

  it("handles empty path", () => {
    const req = {
      method: "POST", path: "",
      headers: {},
      session: { csrfToken: "tok" }
    };
    const res = mockRes();
    csrfProtect(req, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res._status, 403);
  });

  it("error response includes user-friendly German message", () => {
    const req = {
      method: "POST", path: "/api/data",
      headers: {},
      session: { csrfToken: "tok" }
    };
    const res = mockRes();
    csrfProtect(req, res, () => {});
    assert.ok(res._json.message, "Should include a message");
    assert.ok(typeof res._json.message === "string");
  });
});
