/**
 * multi-location-middleware.test.js
 * Unit-Tests fuer die neuen Multi-Location-Middleware-Funktionen.
 *
 * - requireLocationContext (entitlementGuard.js)
 * - requireLocationBelongsToOrg (orgBoundary.js)
 * - requireDepartmentBelongsToOrg (orgBoundary.js)
 *
 * Kein DB noetig — alle DB-Calls werden mit Mock-Pools simuliert.
 *
 * Run: node --test api/test/multi-location-middleware.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { requireLocationContext } from "../middleware/entitlementGuard.js";
import {
  requireLocationBelongsToOrg,
  requireDepartmentBelongsToOrg,
} from "../middleware/orgBoundary.js";

/* ── Helpers ─────────────────────────────────────────────── */

function mockReq(overrides = {}) {
  return {
    session: { userId: "user-uuid" },
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

function mockRes() {
  const res = { _status: null, _body: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (b) { res._body = b; return res; };
  return res;
}

/** Creates a mock pool that always returns the given rows from pool.query(). */
function mockPool(rows = []) {
  return {
    query: async () => ({ rows }),
  };
}

/** Creates a mock pool that throws on pool.query(). */
function errorPool(msg = "DB error") {
  return {
    query: async () => { throw new Error(msg); },
  };
}

/* ── requireLocationContext ──────────────────────────────── */

describe("requireLocationContext", () => {
  it("calls next() when req.locationId is set", (_, done) => {
    const req = mockReq({ locationId: "loc-uuid" });
    const res = mockRes();
    requireLocationContext(req, res, () => { done(); });
  });

  it("returns 403 with NO_LOCATION_CONTEXT when req.locationId is missing", (_, done) => {
    const req = mockReq(); // no locationId
    const res = mockRes();
    requireLocationContext(req, res, () => {
      done(new Error("next() should NOT be called"));
    });
    // next is synchronous no-op here — assertions after microtask
    setImmediate(() => {
      assert.equal(res._status, 403);
      assert.equal(res._body?.error?.code, "NO_LOCATION_CONTEXT");
      done();
    });
  });

  it("returns 403 when req.locationId is null", (_, done) => {
    const req = mockReq({ locationId: null });
    const res = mockRes();
    let nextCalled = false;
    requireLocationContext(req, res, () => { nextCalled = true; });
    setImmediate(() => {
      assert.equal(nextCalled, false);
      assert.equal(res._status, 403);
      done();
    });
  });
});

/* ── requireLocationBelongsToOrg ─────────────────────────── */

describe("requireLocationBelongsToOrg", () => {
  const VALID_LOC_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const VALID_ORG_UUID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
  const INVALID_UUID   = "not-a-uuid";

  it("returns 403 ORG_REQUIRED when req.orgId is missing", async () => {
    const mw = requireLocationBelongsToOrg(null, { pool: mockPool([]) });
    const req = mockReq({ orgId: null, body: { location_id: VALID_LOC_UUID } });
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.equal(res._body?.error?.code, "ORG_REQUIRED");
  });

  it("returns 400 LOCATION_ID_REQUIRED when no location_id given and not optional", async () => {
    const mw = requireLocationBelongsToOrg(null, { pool: mockPool([]), optional: false });
    const req = mockReq({ orgId: VALID_ORG_UUID }); // no location_id in body/params/query
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 400);
    assert.equal(res._body?.error?.code, "LOCATION_ID_REQUIRED");
  });

  it("calls next() when no location_id and optional=true", async () => {
    const mw = requireLocationBelongsToOrg(null, { pool: mockPool([]), optional: true });
    const req = mockReq({ orgId: VALID_ORG_UUID });
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it("returns 400 INVALID_LOCATION_ID for malformed UUID", async () => {
    const mw = requireLocationBelongsToOrg(null, { pool: mockPool([]) });
    const req = mockReq({ orgId: VALID_ORG_UUID, body: { location_id: INVALID_UUID } });
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 400);
    assert.equal(res._body?.error?.code, "INVALID_LOCATION_ID");
  });

  it("returns 404 LOCATION_NOT_FOUND when pool returns empty rows", async () => {
    const mw = requireLocationBelongsToOrg(null, { pool: mockPool([]) /* no rows */ });
    const req = mockReq({ orgId: VALID_ORG_UUID, body: { location_id: VALID_LOC_UUID } });
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 404);
    assert.equal(res._body?.error?.code, "LOCATION_NOT_FOUND");
  });

  it("calls next() and sets validatedLocationId/Name when location is found", async () => {
    const locRow = { id: VALID_LOC_UUID, name: "Muenchen HQ" };
    const mw = requireLocationBelongsToOrg(null, { pool: mockPool([locRow]) });
    const req = mockReq({ orgId: VALID_ORG_UUID, body: { location_id: VALID_LOC_UUID } });
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.validatedLocationId, VALID_LOC_UUID);
    assert.equal(req.validatedLocationName, "Muenchen HQ");
  });

  it("uses custom extractLocationId function", async () => {
    const locRow = { id: VALID_LOC_UUID, name: "Berlin" };
    const extract = (req) => req.params.loc_id;
    const mw = requireLocationBelongsToOrg(extract, { pool: mockPool([locRow]) });
    const req = mockReq({ orgId: VALID_ORG_UUID, params: { loc_id: VALID_LOC_UUID } });
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.validatedLocationId, VALID_LOC_UUID);
  });

  it("calls next() when pool returns empty and optional=true (location not found but optional)", async () => {
    const mw = requireLocationBelongsToOrg(null, { pool: mockPool([]), optional: true });
    const req = mockReq({ orgId: VALID_ORG_UUID, body: { location_id: VALID_LOC_UUID } });
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.validatedLocationId, undefined); // not set when location not found
  });

  it("passes DB errors to next(err)", async () => {
    const mw = requireLocationBelongsToOrg(null, { pool: errorPool("connection failed") });
    const req = mockReq({ orgId: VALID_ORG_UUID, body: { location_id: VALID_LOC_UUID } });
    const res = mockRes();
    let nextErr = null;
    await mw(req, res, (err) => { nextErr = err; });
    assert.ok(nextErr instanceof Error);
    assert.match(nextErr.message, /connection failed/);
  });
});

/* ── requireDepartmentBelongsToOrg ──────────────────────── */

describe("requireDepartmentBelongsToOrg", () => {
  const VALID_DEPT_UUID = "c3d4e5f6-a7b8-9012-cdef-123456789012";
  const VALID_ORG_UUID  = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

  it("returns 403 ORG_REQUIRED when no orgId", async () => {
    const mw = requireDepartmentBelongsToOrg(null, { pool: mockPool([]) });
    const req = mockReq({ orgId: null, body: { department_id: VALID_DEPT_UUID } });
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
  });

  it("returns 400 DEPARTMENT_ID_REQUIRED when no department_id and not optional", async () => {
    const mw = requireDepartmentBelongsToOrg(null, { pool: mockPool([]) });
    const req = mockReq({ orgId: VALID_ORG_UUID });
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 400);
    assert.equal(res._body?.error?.code, "DEPARTMENT_ID_REQUIRED");
  });

  it("calls next() and sets validatedDepartmentId when department is found", async () => {
    const deptRow = { id: VALID_DEPT_UUID, name: "IT-Abteilung" };
    const mw = requireDepartmentBelongsToOrg(null, { pool: mockPool([deptRow]) });
    const req = mockReq({ orgId: VALID_ORG_UUID, body: { department_id: VALID_DEPT_UUID } });
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.validatedDepartmentId, VALID_DEPT_UUID);
    assert.equal(req.validatedDepartmentName, "IT-Abteilung");
  });
});
