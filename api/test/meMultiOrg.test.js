/**
 * Multi-Org: /me memberships, active org switch, and active location endpoints.
 * Tests binding enforcement, org-switch location clearing, and /me response shape.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMeRouter } from "../routes/me.js";
import { returnPool, sequencePool, mockLogger, requireAuth, mockRes, noop, findHandlerExact } from "./helpers/security-mocks.js";

const USER_ID  = "user-abc-123";
const ORG_ID   = "a0b1c2d3-e4f5-6789-abcd-ef0123456789";
const ORG_ID_B = "b1c2d3e4-f5a6-7890-bcde-f01234567890";
const LOC_A    = "c2d3e4f5-a6b7-8901-cdef-012345678901";
const LOC_B    = "d3e4f5a6-b7c8-9012-defa-123456789012";

const MEMBERSHIP = {
  id:           "mem-1",
  user_id:      USER_ID,
  org_id:       ORG_ID,
  role_key:     "owner",
  is_active:    true,
  org_name:     "Alpha GmbH",
  org_type:     "company",
  org_plan:     "PRO",
  location_id:  null,
  department_id: null,
};

const MEMBERSHIP_BOUND = {
  ...MEMBERSHIP,
  id:          "mem-2",
  role_key:    "member",
  location_id: LOC_A,   // bound to LOC_A
};

function mockReq(overrides = {}) {
  return {
    session: { userId: USER_ID },
    body: {},
    query: {},
    params: {},
    ...overrides
  };
}

function baseDeps(pool) {
  return {
    pool,
    requireAuth,
    logger: mockLogger(),
    config: {},
    sendMail: async () => true,
    getUserAndPlan: async () => ({ id: USER_ID, plan: "PRO" })
  };
}

describe("/me/memberships", () => {
  it("returns memberships with active org id", async () => {
    const pool = returnPool([MEMBERSHIP]);
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/me/memberships");
    const req = mockReq({ orgId: ORG_ID });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 200);
    assert.equal(res._json.items.length, 1);
    assert.equal(res._json.active_org_id, ORG_ID);
  });
});

describe("/me/active-org", () => {
  it("stores active org in session cache", async () => {
    const pool = returnPool([MEMBERSHIP]);
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/me/active-org");
    const req = mockReq({ body: { org_id: ORG_ID } });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 200);
    assert.equal(res._json.active_org_id, ORG_ID);
    assert.ok(req.session._orgCache);
    assert.equal(req.session._orgCache.orgId, ORG_ID);
  });

  it("rejects when user is not member", async () => {
    const pool = returnPool([]);
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/me/active-org");
    const req = mockReq({ body: { org_id: ORG_ID } });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "ORG_NOT_ALLOWED");
  });

  it("clears location cache on org switch", async () => {
    const pool = returnPool([{ ...MEMBERSHIP, org_id: ORG_ID_B, org_name: "New Org" }]);
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/me/active-org");
    const req = mockReq({
      body: { org_id: ORG_ID_B },
      session: {
        userId:         USER_ID,
        _orgCache:      { orgId: ORG_ID, role: "owner", name: "Old Org" },
        _locationCache: { locationId: LOC_A, locationName: "Alter Standort" }
      }
    });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 200);
    assert.equal(req.session._locationCache, undefined, "location cache must be cleared on org switch");
    assert.equal(res._json.active_location_id, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /me/active-location — binding enforcement
// ═══════════════════════════════════════════════════════════════

describe("/me/active-location (binding enforcement)", () => {
  it("bound member cannot switch to a different location", async () => {
    // Pool sequence: getMembership for binding check → returns MEMBERSHIP_BOUND
    const pool = sequencePool({ rows: [MEMBERSHIP_BOUND] });
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/me/active-location");
    const req = mockReq({
      orgId: ORG_ID,
      body:  { location_id: LOC_B }  // LOC_B !== MEMBERSHIP_BOUND.location_id (LOC_A)
    });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "LOCATION_BOUND");
  });

  it("bound member cannot clear location (set null)", async () => {
    const pool = sequencePool({ rows: [MEMBERSHIP_BOUND] });
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/me/active-location");
    const req = mockReq({
      orgId: ORG_ID,
      body:  { location_id: null }
    });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "LOCATION_BOUND");
  });

  it("owner (unbound) can clear location to org-wide view", async () => {
    const pool = sequencePool({ rows: [MEMBERSHIP] }); // no location_id
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/me/active-location");
    const req = mockReq({
      orgId: ORG_ID,
      session: {
        userId:         USER_ID,
        _locationCache: { locationId: LOC_A, locationName: "Berlin" }
      },
      body: { location_id: null }
    });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 200);
    assert.equal(res._json.ok, true);
    assert.equal(res._json.location_id, null);
    assert.equal(req.session._locationCache, undefined, "cache must be cleared");
  });

  it("owner can switch to a valid location in their org", async () => {
    const pool = sequencePool(
      { rows: [MEMBERSHIP] },                         // getMembership: unbound owner
      { rows: [{ id: LOC_A, name: "München HQ" }] }  // org_locations lookup
    );
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/me/active-location");
    const req = mockReq({ orgId: ORG_ID, body: { location_id: LOC_A } });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 200);
    assert.equal(res._json.ok, true);
    assert.equal(res._json.location_id, LOC_A);
    assert.equal(req.session._locationCache?.locationId, LOC_A);
  });

  it("returns 404 for unknown location_id", async () => {
    const pool = sequencePool(
      { rows: [MEMBERSHIP] },  // getMembership
      { rows: [] }             // org_locations: not found
    );
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/me/active-location");
    const req = mockReq({ orgId: ORG_ID, body: { location_id: LOC_A } });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 404);
    assert.equal(res._json.error, "LOCATION_NOT_FOUND");
  });

  it("returns 400 for malformed location_id", async () => {
    // No pool calls needed for UUID validation failure
    const pool = sequencePool({ rows: [MEMBERSHIP] });
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/me/active-location");
    const req = mockReq({ orgId: ORG_ID, body: { location_id: "not-a-uuid" } });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 400);
    assert.equal(res._json.error, "INVALID_LOCATION_ID");
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /me — location fields in response
// ═══════════════════════════════════════════════════════════════

describe("GET /me — location context fields", () => {
  it("returns active_location_id null for org-wide owner (no location set)", async () => {
    // returnPool returns the same row for every query (memberships + allowed locations)
    const pool = returnPool([MEMBERSHIP]);
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/me");
    const req = mockReq({
      orgId:      ORG_ID,
      locationId: undefined,  // not set by middleware
      departmentId: undefined
    });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 200);
    assert.equal(res._json.active_location_id, null);
    assert.equal(res._json.active_location,    null);
    assert.equal(res._json.active_department_id, null);
    assert.ok(Array.isArray(res._json.allowed_locations));
  });

  it("returns active_location_id when middleware set req.locationId", async () => {
    const pool = returnPool([MEMBERSHIP_BOUND]);
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/me");
    const req = mockReq({
      orgId:        ORG_ID,
      locationId:   LOC_A,
      locationName: "München HQ",
    });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 200);
    assert.equal(res._json.active_location_id, LOC_A);
    assert.equal(res._json.active_location?.id, LOC_A);
    assert.equal(res._json.active_location?.name, "München HQ");
  });

  it("returns active_department_id from req.departmentId", async () => {
    const pool = returnPool([MEMBERSHIP]);
    const router = createMeRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/me");
    const deptId = "dept-0000-0000-0000-000000000001";
    const req = mockReq({ orgId: ORG_ID, departmentId: deptId });
    const res = mockRes();

    await handler(req, res, noop);

    assert.equal(res._status, 200);
    assert.equal(res._json.active_department_id, deptId);
  });
});
