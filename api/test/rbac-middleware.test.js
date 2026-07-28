/**
 * RBAC Middleware Tests
 *
 * Tests requirePermission() and requireRole() from middleware/rbac.js.
 * Mock pool controls DB responses — tests the full middleware-to-service integration.
 * rbacService functions (checkPermission, getPrimaryOrg, getMembership) execute with
 * real logic; only the pool layer is mocked.
 *
 * Covered branches:
 *   requirePermission:
 *     - Unauthenticated (no session, no userId, null userId)
 *     - Explicit org_id: permission granted, permission denied, not a member
 *     - Fallback (no org_id): primary org found + granted, primary org found + denied,
 *       no org membership at all
 *     - org_id resolution priority: body > query > params
 *     - req.orgMembership / req.orgId correctly set on success
 *     - logger.warn called on denial
 *     - pool.query error propagation
 *
 *   requireRole:
 *     - Unauthenticated
 *     - Explicit org_id: matching role, wrong role, null membership → 403
 *     - Fallback: primary org matching, primary org wrong role, no membership → 403
 *     - Multiple allowed roles
 *     - Response body structure (error, required, current)
 *     - NO_ORG_MEMBERSHIP consistent with requirePermission
 *     - pool.query error propagation
 *
 * No database required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requirePermission, requireRole } from "../middleware/rbac.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const USER_ID = "user-abc-123";
const ORG_ID = "org-xyz-456";

const OWNER_MEMBERSHIP = {
  user_id: USER_ID,
  org_id: ORG_ID,
  role_key: "owner",
  is_active: true,
  org_name: "Test GmbH",
  org_type: "company",
  org_plan: "PRO"
};

const VIEWER_MEMBERSHIP = {
  ...OWNER_MEMBERSHIP,
  role_key: "viewer"
};

// ── Mock factories ────────────────────────────────────────────────────────────

/**
 * Creates a mock pool where pool.query() returns responses in call order.
 * Throws if more queries are made than provided.
 */
function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) {
        throw new Error(`Unexpected pool.query call #${idx + 1} (only ${responses.length} configured)`);
      }
      return responses[idx++];
    }
  };
}

/**
 * Wie sequencePool, merkt sich aber die Query-Parameter. Noetig, um zu pruefen
 * *gegen welche* Org eine Berechtigung geprueft wurde — sequencePool verwirft
 * die Argumente und wuerde jede Org gleich gruen faerben.
 */
function recordingPool(...responses) {
  let idx = 0;
  const params = [];
  return {
    params,
    query: async (_sql, args = []) => {
      params.push(args);
      if (idx >= responses.length) {
        throw new Error(`Unexpected pool.query call #${idx + 1} (only ${responses.length} configured)`);
      }
      return responses[idx++];
    }
  };
}

function mockLogger() {
  const calls = { warn: [] };
  return {
    warn: (...args) => calls.warn.push(args),
    error: () => {},
    info: () => {},
    debug: () => {},
    calls
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: USER_ID },
    body: {},
    query: {},
    params: {},
    ...overrides
  };
}

function mockRes() {
  let _status = null;
  let _json = null;
  return {
    status(code) { _status = code; return this; },
    json(data) { _json = data; return this; },
    get statusCode() { return _status; },
    get body() { return _json; }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// requirePermission
// ═══════════════════════════════════════════════════════════════════════════════

describe("requirePermission — unauthenticated", () => {
  const logger = mockLogger();
  const pool = sequencePool(); // no queries expected

  it("returns 401 when session is undefined", async () => {
    const mw = requirePermission("requisition.create", { pool, logger });
    const res = mockRes();
    await mw({ body: {}, query: {}, params: {} }, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, "NOT_AUTHENTICATED");
  });

  it("returns 401 when session exists but userId is missing", async () => {
    const mw = requirePermission("requisition.create", { pool, logger });
    const res = mockRes();
    await mw(mockReq({ session: {} }), res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res.statusCode, 401);
  });

  it("returns 401 when session.userId is null", async () => {
    const mw = requirePermission("requisition.create", { pool, logger });
    const res = mockRes();
    await mw(mockReq({ session: { userId: null } }), res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res.statusCode, 401);
  });
});

// ── requirePermission with explicit org_id ────────────────────────────────────

describe("requirePermission — explicit org_id", () => {
  it("blocks when explicit org_id mismatches active org context", async () => {
    const pool = sequencePool(); // should not be called
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq({
      orgId: ORG_ID,
      orgMembership: OWNER_MEMBERSHIP,
      query: { org_id: "org-other-999" }
    });
    const res = mockRes();

    await mw(req, res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "ORG_CONTEXT_MISMATCH");
  });
  it("grants access when user has matching permission in org", async () => {
    // checkPermission → getMembership → 1 query returning owner
    const pool = sequencePool({ rows: [OWNER_MEMBERSHIP] });
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq({ query: { org_id: ORG_ID } });
    const res = mockRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled, "next() must be called on success");
    assert.deepStrictEqual(req.orgMembership, OWNER_MEMBERSHIP);
    assert.strictEqual(req.orgId, ORG_ID);
    assert.strictEqual(logger.calls.warn.length, 0, "No warning should be logged");
  });

  it("denies access when user has wrong role for permission", async () => {
    // viewer cannot create requisitions
    const pool = sequencePool({ rows: [VIEWER_MEMBERSHIP] });
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq({ query: { org_id: ORG_ID } });
    const res = mockRes();

    await mw(req, res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "PERMISSION_DENIED");
    // SEC-003: sanitized responses no longer contain permission/reason fields
    assert.strictEqual(res.body.permission, undefined, "Must not leak permission name");
    assert.ok(res.body.message, "Should have generic message");
    assert.ok(logger.calls.warn.length > 0, "Should log warning on denial");
  });

  it("denies access when user is not a member of the org", async () => {
    const pool = sequencePool({ rows: [] }); // no membership
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq({ query: { org_id: ORG_ID } });
    const res = mockRes();

    await mw(req, res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "PERMISSION_DENIED");
    // SEC-003: sanitized responses no longer contain reason field
    assert.strictEqual(res.body.reason, undefined, "Must not leak reason");
  });

  it("reads org_id from req.query when body is empty", async () => {
    const pool = sequencePool({ rows: [OWNER_MEMBERSHIP] });
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq({ query: { org_id: ORG_ID } });
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled, "Should resolve org_id from query");
  });

  it("reads org_id from req.params when body and query are empty", async () => {
    const pool = sequencePool({ rows: [OWNER_MEMBERSHIP] });
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq({ params: { org_id: ORG_ID } });
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled, "Should resolve org_id from params");
  });

  // ── Body ist Nutzdatum, nicht Kontext (Audit-Backlog C-11) ────────────────
  //
  // Frueher galt "body.org_id schlaegt query.org_id". Dieser Vertrag war die
  // Wurzel eines Cross-Org-Lecks: `orgContext` liess `req.orgId` auf null fallen,
  // wenn der Body eine fremde Org nannte, und die Grenzpruefungen der Routen
  // (`if (req.orgId && ...)`) schalteten sich damit selbst ab. Zugleich brach er
  // legitime Lieferanten-Vorgaenge, bei denen `org_id` im Body den *Kunden*
  // bezeichnet (Stundenzettel, Template-Zuweisung).
  //
  // Neuer Vertrag: Kontext kommt aus Adressierung (Header/Query/Pfad). Der Body
  // wird beim Kontext ignoriert — die Route prueft ihn selbst gegen `req.orgId`.
  it("body.org_id bestimmt den Kontext NICHT — die Query gewinnt", async () => {
    const pool = recordingPool({ rows: [OWNER_MEMBERSHIP] });
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq({
      body: { org_id: "payload-org-999" },
      query: { org_id: ORG_ID }
    });
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled, "Die Query-Org bestimmt den Kontext");
    assert.strictEqual(req.orgId, ORG_ID);
    const lookedUp = pool.params.flat();
    assert.ok(lookedUp.includes(ORG_ID), "Die Berechtigung muss gegen die Query-Org geprueft werden");
    assert.ok(!lookedUp.includes("payload-org-999"),
      "Die Org aus dem Body darf nie in die Berechtigungspruefung einfliessen");
  });

  it("ein fremdes org_id im Body loest keinen ORG_CONTEXT_MISMATCH aus", async () => {
    // Der Lieferanten-Fall: eine Agentur legt einen Datensatz FUER einen Kunden an.
    // `org_id` = Kunde, gehandelt wird als Agentur. Wuerde der Body als
    // Kontextwechsel gelesen, scheiterte der legitime Vorgang mit 403.
    const pool = recordingPool({ rows: [OWNER_MEMBERSHIP] });
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq({
      orgId: ORG_ID,
      orgMembership: OWNER_MEMBERSHIP,
      body: { org_id: "kunden-org-999" }
    });
    const res = mockRes();
    let nextCalled = false;

    await mw(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled, `Erwartet: durchgelassen, bekam ${res.statusCode} ${JSON.stringify(res.body)}`);
    assert.strictEqual(req.orgId, ORG_ID, "Der Kontext bleibt die eigene Org");
  });
});

// ── requirePermission fallback (no org_id) ────────────────────────────────────

describe("requirePermission — fallback to primary org", () => {
  it("grants access when primary org membership has matching permission", async () => {
    // getPrimaryOrg: query 1 = users.org_id → found, query 2 = getMembership → owner
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },    // SELECT org_id FROM users
      { rows: [OWNER_MEMBERSHIP] }        // getMembership
    );
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq(); // no org_id anywhere
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled, "Should grant via primary org");
    assert.deepStrictEqual(req.orgMembership, OWNER_MEMBERSHIP);
    assert.strictEqual(req.orgId, ORG_ID);
  });

  it("denies access when primary org membership lacks permission", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },
      { rows: [VIEWER_MEMBERSHIP] }
    );
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq();
    const res = mockRes();

    await mw(req, res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "PERMISSION_DENIED");
    // SEC-003: sanitized responses no longer contain reason field
    assert.strictEqual(res.body.reason, undefined, "Must not leak reason");
    assert.ok(logger.calls.warn.length > 0);
  });

  it("returns 403 NO_ORG_MEMBERSHIP when user has no org at all", async () => {
    // getPrimaryOrg: users.org_id is null → fallback query also empty
    const pool = sequencePool(
      { rows: [{ org_id: null }] },    // users.org_id = null
      { rows: [] }                      // fallback: no active memberships
    );
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq();
    const res = mockRes();

    await mw(req, res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "NO_ORG_MEMBERSHIP");
    assert.ok(logger.calls.warn.length > 0);
  });

  it("returns 403 NO_ORG_MEMBERSHIP when user does not exist in users table", async () => {
    const pool = sequencePool(
      { rows: [] },   // user not found
      { rows: [] }    // no memberships either
    );
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const res = mockRes();

    await mw(mockReq(), res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "NO_ORG_MEMBERSHIP");
  });

  it("uses fallback membership when users.org_id is null but membership exists", async () => {
    // users.org_id = null, but there's a membership via the fallback query
    const fallbackMembership = { ...OWNER_MEMBERSHIP, org_id: "org-fallback" };
    const pool = sequencePool(
      { rows: [{ org_id: null }] },     // users.org_id = null
      { rows: [fallbackMembership] }    // fallback: first active membership
    );
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq();
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.strictEqual(req.orgMembership.org_id, "org-fallback");
  });
});

// ── requirePermission error handling ──────────────────────────────────────────

describe("requirePermission — error handling", () => {
  it("propagates pool.query errors (does not swallow)", async () => {
    const dbError = new Error("connection refused");
    const pool = { query: async () => { throw dbError; } };
    const logger = mockLogger();
    const mw = requirePermission("requisition.create", { pool, logger });
    const req = mockReq({ query: { org_id: ORG_ID } });

    await assert.rejects(
      () => mw(req, mockRes(), () => {}),
      (err) => {
        assert.strictEqual(err.message, "connection refused");
        return true;
      }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requireRole
// ═══════════════════════════════════════════════════════════════════════════════

describe("requireRole — unauthenticated", () => {
  const pool = sequencePool();
  const logger = mockLogger();

  it("returns 401 when session is undefined", async () => {
    const mw = requireRole(["admin"], { pool, logger });
    const res = mockRes();
    await mw({ body: {}, query: {}, params: {} }, res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, "NOT_AUTHENTICATED");
  });

  it("returns 401 when userId is missing", async () => {
    const mw = requireRole(["admin"], { pool, logger });
    const res = mockRes();
    await mw(mockReq({ session: {} }), res, () => assert.fail("next() should not be called"));
    assert.strictEqual(res.statusCode, 401);
  });
});

// ── requireRole with explicit org_id ──────────────────────────────────────────

describe("requireRole — explicit org_id", () => {
  it("blocks when explicit org_id mismatches active org context", async () => {
    const pool = sequencePool(); // should not be called
    const logger = mockLogger();
    const mw = requireRole(["owner"], { pool, logger });
    const req = mockReq({
      orgId: ORG_ID,
      orgMembership: OWNER_MEMBERSHIP,
      query: { org_id: "org-other-999" }
    });
    const res = mockRes();

    await mw(req, res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "ORG_CONTEXT_MISMATCH");
  });
  it("grants access when user role matches one of the allowed roles", async () => {
    const pool = sequencePool({ rows: [OWNER_MEMBERSHIP] });
    const logger = mockLogger();
    const mw = requireRole(["owner", "admin"], { pool, logger });
    const req = mockReq({ query: { org_id: ORG_ID } });
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.deepStrictEqual(req.orgMembership, OWNER_MEMBERSHIP);
    assert.strictEqual(req.orgId, ORG_ID);
  });

  it("denies access when user role is not in allowed list", async () => {
    const pool = sequencePool({ rows: [VIEWER_MEMBERSHIP] });
    const logger = mockLogger();
    const mw = requireRole(["owner", "admin"], { pool, logger });
    const req = mockReq({ query: { org_id: ORG_ID } });
    const res = mockRes();

    await mw(req, res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "ROLE_DENIED");
    // SEC-003: sanitized responses no longer contain required/current fields
    assert.strictEqual(res.body.required, undefined, "Must not leak required roles");
    assert.strictEqual(res.body.current, undefined, "Must not leak current role");
    assert.ok(res.body.message, "Should have generic message");
    assert.ok(logger.calls.warn.length > 0);
  });

  it("returns 403 NO_ORG_MEMBERSHIP when user is not a member of the org", async () => {
    const pool = sequencePool({ rows: [] }); // no membership
    const logger = mockLogger();
    const mw = requireRole(["owner", "admin"], { pool, logger });
    const req = mockReq({ query: { org_id: ORG_ID } });
    const res = mockRes();

    await mw(req, res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "NO_ORG_MEMBERSHIP");
    // SEC-003: sanitized — has message, no reason
    assert.ok(res.body.message, "Should include human-readable message");
    assert.ok(logger.calls.warn.length > 0, "Should log warning on missing membership");
  });

  it("matches any role in the allowed list (not just the first)", async () => {
    const dispatcherMembership = { ...OWNER_MEMBERSHIP, role_key: "dispatcher" };
    const pool = sequencePool({ rows: [dispatcherMembership] });
    const logger = mockLogger();
    const mw = requireRole(["owner", "admin", "dispatcher"], { pool, logger });
    const req = mockReq({ query: { org_id: ORG_ID } });
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled, "Should match 'dispatcher' as the third allowed role");
  });
});

// ── requireRole fallback (no org_id) ──────────────────────────────────────────

describe("requireRole — fallback to primary org", () => {
  it("grants access when primary org role matches", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },
      { rows: [OWNER_MEMBERSHIP] }
    );
    const logger = mockLogger();
    const mw = requireRole(["owner"], { pool, logger });
    const req = mockReq(); // no org_id
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.strictEqual(req.orgMembership.role_key, "owner");
  });

  it("denies access when primary org role does not match", async () => {
    const pool = sequencePool(
      { rows: [{ org_id: ORG_ID }] },
      { rows: [VIEWER_MEMBERSHIP] }
    );
    const logger = mockLogger();
    const mw = requireRole(["owner", "admin"], { pool, logger });
    const req = mockReq();
    const res = mockRes();

    await mw(req, res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "ROLE_DENIED");
    // SEC-003: sanitized responses
    assert.strictEqual(res.body.current, undefined, "Must not leak current role");
    assert.strictEqual(res.body.required, undefined, "Must not leak required roles");
  });

  it("returns 403 NO_ORG_MEMBERSHIP when user has no org membership at all", async () => {
    const pool = sequencePool(
      { rows: [] },   // user not in users table (or no org_id)
      { rows: [] }    // no memberships
    );
    const logger = mockLogger();
    const mw = requireRole(["owner"], { pool, logger });
    const req = mockReq();
    const res = mockRes();

    await mw(req, res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "NO_ORG_MEMBERSHIP");
    assert.ok(logger.calls.warn.length > 0);
  });
});

// ── requireRole error handling ────────────────────────────────────────────────

describe("requireRole — error handling", () => {
  it("propagates pool.query errors (does not swallow)", async () => {
    const pool = { query: async () => { throw new Error("pool timeout"); } };
    const logger = mockLogger();
    const mw = requireRole(["admin"], { pool, logger });

    await assert.rejects(
      () => mw(mockReq({ query: { org_id: ORG_ID } }), mockRes(), () => {}),
      (err) => {
        assert.strictEqual(err.message, "pool timeout");
        return true;
      }
    );
  });
});

// ── Cross-cutting: inherited permissions through middleware ────────────────────

describe("requirePermission — role inheritance via middleware", () => {
  it("platform_admin inherits org.settings via owner inheritance", async () => {
    const platformAdminMembership = { ...OWNER_MEMBERSHIP, role_key: "platform_admin" };
    const pool = sequencePool({ rows: [platformAdminMembership] });
    const logger = mockLogger();
    const mw = requirePermission("org.settings", { pool, logger });
    const req = mockReq({ query: { org_id: ORG_ID } });
    let nextCalled = false;

    await mw(req, mockRes(), () => { nextCalled = true; });

    assert.ok(nextCalled, "platform_admin should inherit org.settings via owner");
  });

  it("member cannot access org.settings even through middleware", async () => {
    const memberMembership = { ...OWNER_MEMBERSHIP, role_key: "member" };
    const pool = sequencePool({ rows: [memberMembership] });
    const logger = mockLogger();
    const mw = requirePermission("org.settings", { pool, logger });
    const res = mockRes();

    await mw(mockReq({ query: { org_id: ORG_ID } }), res, () => assert.fail("next() should not be called"));

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, "PERMISSION_DENIED");
  });
});
