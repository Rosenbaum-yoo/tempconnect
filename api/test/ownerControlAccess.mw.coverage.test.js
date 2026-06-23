import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createOwnerControlAccessMiddleware,
  createOwnerStepUpMiddleware,
  requireConfirmAndReason
} from "../middleware/ownerControlAccess.js";

/* ── Test doubles ─────────────────────────────────────────── */
function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function mockReq(over = {}) {
  return {
    session: {},
    path: "/owner-control/x",
    body: {},
    ...over
  };
}

/** Pool whose query() returns scripted result sets in order. */
function scriptedPool(results) {
  let i = 0;
  const calls = [];
  return {
    calls,
    query(sql, params) {
      calls.push({ sql, params });
      const r = results[Math.min(i, results.length - 1)];
      i += 1;
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r);
    }
  };
}

/* ── createOwnerControlAccessMiddleware ───────────────────── */

test("OCC access: no ownerUserId in session -> 401 OCC_NOT_AUTHENTICATED, next not called", async () => {
  const pool = scriptedPool([{ rows: [] }]);
  const mw = createOwnerControlAccessMiddleware({ pool, logger: null });
  const req = mockReq({ session: {} });
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, "OCC_NOT_AUTHENTICATED");
  // Should short-circuit before any DB call
  assert.equal(pool.calls.length, 0);
});

test("OCC access: active owner -> next() called, req.occOwner/occActorId set", async () => {
  const owner = {
    user_id: "u-1",
    email: "o@x.de",
    display_name: "Owner",
    is_active: true,
    requires_step_up: true,
    last_access_at: null
  };
  const pool = scriptedPool([{ rows: [owner] }, { rows: [] }]);
  const mw = createOwnerControlAccessMiddleware({ pool, logger: null });
  const req = mockReq({ session: { ownerUserId: "u-1" } });
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null, "no error response on allow");
  assert.deepEqual(req.occOwner, owner);
  assert.equal(req.occActorId, "u-1");
  // occAuthorizedAt stamped
  assert.equal(typeof req.session.occAuthorizedAt, "number");
  // first query is the allowlist SELECT bound to userId
  assert.match(pool.calls[0].sql, /FROM tempconnect_owners WHERE user_id = \$1/);
  assert.deepEqual(pool.calls[0].params, ["u-1"]);
});

test("OCC access: user not in allowlist (no bootstrap match) -> 403 OCC_NOT_AUTHORIZED", async () => {
  const pool = scriptedPool([{ rows: [] }]);
  const mw = createOwnerControlAccessMiddleware({ pool, logger: { warn() {} } });
  const req = mockReq({ session: { ownerUserId: "stranger" } });
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, "OCC_NOT_AUTHORIZED");
});

test("OCC access: owner row exists but is_active=false -> 403", async () => {
  const pool = scriptedPool([{ rows: [{ user_id: "u-2", is_active: false }] }]);
  const mw = createOwnerControlAccessMiddleware({ pool, logger: { warn() {} } });
  const req = mockReq({ session: { ownerUserId: "u-2" } });
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, "OCC_NOT_AUTHORIZED");
});

test("OCC access: pool.query throws -> 500 OCC_GUARD_ERROR, logger.error called", async () => {
  const pool = scriptedPool([new Error("db down")]);
  let errLogged = false;
  const mw = createOwnerControlAccessMiddleware({ pool, logger: { error() { errLogged = true; } } });
  const req = mockReq({ session: { ownerUserId: "u-3" } });
  const res = mockRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, "OCC_GUARD_ERROR");
  assert.equal(errLogged, true);
});

test("OCC access: occAuthorizedAt preserved if already set", async () => {
  const owner = { user_id: "u-4", is_active: true, requires_step_up: false };
  const pool = scriptedPool([{ rows: [owner] }, { rows: [] }]);
  const mw = createOwnerControlAccessMiddleware({ pool, logger: null });
  const req = mockReq({ session: { ownerUserId: "u-4", occAuthorizedAt: 12345 } });
  const res = mockRes();
  await mw(req, res, () => {});
  assert.equal(req.session.occAuthorizedAt, 12345);
});

/* ── createOwnerStepUpMiddleware ──────────────────────────── */

test("step-up: no occOwner -> 401 OCC_NOT_AUTHENTICATED", () => {
  const mw = createOwnerStepUpMiddleware();
  const req = mockReq({ session: {} });
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, "OCC_NOT_AUTHENTICATED");
});

test("step-up: requires_step_up=false -> next() (bypass)", () => {
  const mw = createOwnerStepUpMiddleware();
  const req = mockReq({ occOwner: { requires_step_up: false }, session: {} });
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test("step-up: required but no ownerStepUpAt -> 428 OCC_STEP_UP_REQUIRED", () => {
  const mw = createOwnerStepUpMiddleware();
  const req = mockReq({ occOwner: { requires_step_up: true }, session: {} });
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 428);
  assert.equal(res.body.error.code, "OCC_STEP_UP_REQUIRED");
});

test("step-up: stale timestamp -> 428 OCC_STEP_UP_EXPIRED", () => {
  const mw = createOwnerStepUpMiddleware({ maxAgeMs: 1000 });
  const req = mockReq({
    occOwner: { requires_step_up: true },
    session: { ownerStepUpAt: Date.now() - 5000 }
  });
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 428);
  assert.equal(res.body.error.code, "OCC_STEP_UP_EXPIRED");
});

test("step-up: fresh timestamp within window -> next()", () => {
  const mw = createOwnerStepUpMiddleware({ maxAgeMs: 60000 });
  const req = mockReq({
    occOwner: { requires_step_up: true },
    session: { ownerStepUpAt: Date.now() - 1000 }
  });
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

/* ── requireConfirmAndReason ──────────────────────────────── */

test("confirm/reason: confirmed missing -> 400 OCC_CONFIRM_REQUIRED", () => {
  const req = mockReq({ body: { reason: "valid reason here" } });
  const res = mockRes();
  let nextCalled = false;
  requireConfirmAndReason(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, "OCC_CONFIRM_REQUIRED");
});

test("confirm/reason: reason too short (<10) -> 400 OCC_REASON_REQUIRED", () => {
  const req = mockReq({ body: { confirmed: true, reason: "short" } });
  const res = mockRes();
  let nextCalled = false;
  requireConfirmAndReason(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, "OCC_REASON_REQUIRED");
});

test("confirm/reason: valid -> next(), occReason/occConfirmed set", () => {
  const req = mockReq({ body: { confirmed: true, reason: "  this is a valid reason  " } });
  const res = mockRes();
  let nextCalled = false;
  requireConfirmAndReason(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
  assert.equal(req.occReason, "this is a valid reason");
  assert.equal(req.occConfirmed, true);
});

test("confirm/reason: missing body defaults to 400 confirm required", () => {
  const req = mockReq({ body: undefined });
  const res = mockRes();
  let nextCalled = false;
  requireConfirmAndReason(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, "OCC_CONFIRM_REQUIRED");
});
