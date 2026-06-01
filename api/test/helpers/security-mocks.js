/**
 * Shared Security Test Utilities
 *
 * Deterministic, database-free mock factories for security regression tests.
 * All security test suites import from this single module.
 *
 * Usage:
 *   import { USER_A, ORG_B, membership, mockReq, ... } from "../helpers/security-mocks.js";
 */

// ── Standard identifiers for two-tenant testing ─────────────────────────────

export const USER_A = "user-alpha-001";
export const USER_B = "user-beta-002";
export const ORG_A  = "org-alpha-001";
export const ORG_B  = "org-beta-002";

// ── Membership fixture factory ──────────────────────────────────────────────

/**
 * Create an org membership fixture for a given role.
 * @param {string} role - e.g. "owner", "admin", "member", "viewer"
 * @param {string} [userId=USER_A]
 * @param {string} [orgId=ORG_A]
 */
export function membership(role, userId = USER_A, orgId = ORG_A) {
  return {
    user_id: userId,
    org_id: orgId,
    role_key: role,
    is_active: true,
    org_name: `Test Org (${orgId.slice(-3)})`,
    org_type: "company",
    org_plan: "PRO"
  };
}

/** Alias matching the spec name: mockOrgMembership */
export const mockOrgMembership = membership;

/** Pre-built membership fixtures for common test scenarios. */
export const MEMBERSHIPS = {
  ownerA:     membership("owner",            USER_A, ORG_A),
  adminA:     membership("admin",            USER_A, ORG_A),
  managerA:   membership("program_manager",  USER_A, ORG_A),
  hiringA:    membership("hiring_manager",   USER_A, ORG_A),
  supplierA:  membership("supplier_manager", USER_A, ORG_A),
  financeA:   membership("finance",          USER_A, ORG_A),
  recruiterA: membership("recruiter",        USER_A, ORG_A),
  memberA:    membership("member",           USER_A, ORG_A),
  viewerA:    membership("viewer",           USER_A, ORG_A),
  ownerB:     membership("owner",            USER_B, ORG_B),
  memberB:    membership("member",           USER_B, ORG_B),
  viewerB:    membership("viewer",           USER_B, ORG_B),
};

// ── Pool mocks ──────────────────────────────────────────────────────────────

/** Mock pool returning the same rows for every query. */
export function returnPool(rows = []) {
  return { query: async () => ({ rows }) };
}

/** Alias matching the spec name: mockPoolQuery */
export const mockPoolQuery = returnPool;

/** Mock pool returning responses in call order. Throws on unexpected calls. */
export function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      return responses[idx++];
    }
  };
}

// ── Logger mock ─────────────────────────────────────────────────────────────

export function mockLogger() {
  const calls = { warn: [], error: [] };
  return {
    info() {}, debug() {}, trace() {}, fatal() {},
    warn(...a)  { calls.warn.push(a); },
    error(...a) { calls.error.push(a); },
    calls
  };
}

// ── Request / Response mocks ────────────────────────────────────────────────

/** Create a mock session. */
export function mockSession(overrides = {}) {
  return { userId: USER_A, ...overrides };
}

/** Create a mock user object. */
export function mockUser(overrides = {}) {
  return { id: USER_A, email: "test@example.com", role: "company", ...overrides };
}

/** Create a mock Express request with sensible defaults. */
export function mockReq(overrides = {}) {
  return {
    session: mockSession(),
    headers: {},
    query: {},
    body: {},
    params: {},
    orgId: ORG_A,
    orgRole: "owner",
    orgMembership: MEMBERSHIPS.ownerA,
    user: { id: USER_A },
    ...overrides
  };
}

/** Create a mock Express response. */
export function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    locals: {},
    status(code) { res._status = code; return res; },
    json(data)   { res._json = data;   return res; },
    setHeader()  { return res; },
    send()       { return res; }
  };
  return res;
}

// ── Middleware stubs ─────────────────────────────────────────────────────────

/** Pass-through requireAuth for route factory injection. */
export const requireAuth = (_req, _res, next) => next();

/** No-op callback for next(). */
export const noop = () => {};

// ── Route factory helpers ───────────────────────────────────────────────────

/** Base dependency object for route factories. */
export function baseDeps(pool, extras = {}) {
  return {
    pool: pool || returnPool(),
    requireAuth,
    logger: mockLogger(),
    config: {},
    ...extras
  };
}

/** Extract the final handler from a route (exact path match). */
export function findHandlerExact(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path) {
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method) {
        return layer.route.stack.map(s => s.handle).pop();
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/** Count middleware functions in a route's stack. RBAC routes have >= 3 (auth + permission + handler). */
export function getMiddlewareCount(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path) {
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method) {
        return layer.route.stack.length;
      }
    }
  }
  return 0;
}

/** Enumerate all routes in a router. */
export function listRoutes(router) {
  const routes = [];
  for (const layer of router.stack) {
    if (layer.route) {
      routes.push({
        method: Object.keys(layer.route.methods)[0],
        path: layer.route.path,
        middlewareCount: layer.route.stack.length
      });
    }
  }
  return routes;
}
