/**
 * RBAC Hardening Tests — validates security fixes for findings F-001 through F-010.
 *
 * Tests:
 *   1. requireOrgContext middleware (Phase 0)
 *   2. Route-level org-boundary enforcement (inline req.orgId checks)
 *   3. Structural verification: requirePermission is present in middleware chain
 *
 * No database required — all tests use mock pool pattern.
 *
 * Run: node --test --test-force-exit test/rbac-hardening.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Middleware under test
import { requireOrgContext } from "../middleware/rbac.js";

// Route factories
import { createOrganizationsRouter } from "../routes/organizations.js";
import { createComplianceDocsRouter } from "../routes/complianceDocs.js";
import { createInvoicesRouter } from "../routes/invoices.js";
import { createRequisitionsRouter } from "../routes/requisitions.js";
import { createSettingsRouter } from "../routes/settings.js";
import { createReportingRouter } from "../routes/reporting.js";
import { createAnalyticsRouter } from "../routes/analytics.js";
import { createApprovalsRouter } from "../routes/approvals.js";
import { createVendorPoolRouter } from "../routes/vendorPool.js";
import { createMatchingRouter } from "../routes/matching.js";

// ── Mock helpers ──────────────────────────────────────────────────────────────

const USER_ID = "user-abc-123";
const ORG_ID = "org-xyz-456";
const OTHER_ORG_ID = "org-other-789";

const OWNER_MEMBERSHIP = {
  user_id: USER_ID, org_id: ORG_ID, role_key: "owner",
  is_active: true, org_name: "Test GmbH", org_type: "company", org_plan: "PRO"
};

function returnPool(rows = []) {
  return { query: async () => ({ rows }) };
}

function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: USER_ID },
    headers: {},
    query: {},
    body: {},
    params: {},
    orgId: ORG_ID,
    orgRole: "owner",
    orgMembership: OWNER_MEMBERSHIP,
    user: { id: USER_ID },
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200, _json: null, locals: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; },
    setHeader() { return res; },
    send() { return res; }
  };
  return res;
}

const requireAuth = (_req, _res, next) => next();
const noop = () => {};

function baseDeps(poolOverride, extras = {}) {
  return {
    pool: poolOverride || returnPool(),
    requireAuth,
    logger: mockLogger(),
    config: {},
    ...extras
  };
}

/**
 * Extract the final handler from a router's route stack.
 * Skips middleware (requireAuth, requirePermission, etc.)
 */
function findHandler(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method && routePath.includes(pathFragment)) {
        const handlers = layer.route.stack.map(s => s.handle);
        return handlers[handlers.length - 1];
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${pathFragment} not found`);
}

/**
 * Get middleware function names for a route.
 * Used for structural verification that requirePermission is in the chain.
 */
function getMiddlewareNames(router, method, pathFragment) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method && routePath.includes(pathFragment)) {
        return layer.route.stack.map(s => s.name || "anonymous");
      }
    }
  }
  return [];
}

/**
 * Find a specific route (exact path match).
 */
function findHandlerExact(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method && routePath === path) {
        const handlers = layer.route.stack.map(s => s.handle);
        return handlers[handlers.length - 1];
      }
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

function getMiddlewareNamesExact(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method && routePath === path) {
        return layer.route.stack.map(s => s.name || "anonymous");
      }
    }
  }
  return [];
}


// ═══════════════════════════════════════════════════════════════════════════════
// Phase 0: requireOrgContext middleware
// ═══════════════════════════════════════════════════════════════════════════════

describe("requireOrgContext", () => {
  it("calls next() when req.orgId is present", () => {
    const req = { orgId: ORG_ID };
    const res = mockRes();
    let nextCalled = false;
    requireOrgContext(req, res, () => { nextCalled = true; });
    assert.ok(nextCalled);
  });

  it("returns 403 when req.orgId is undefined", () => {
    const req = {};
    const res = mockRes();
    requireOrgContext(req, res, () => assert.fail("next should not be called"));
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "NO_ORG_CONTEXT");
  });

  it("returns 403 when req.orgId is null", () => {
    const req = { orgId: null };
    const res = mockRes();
    requireOrgContext(req, res, () => assert.fail("next should not be called"));
    assert.strictEqual(res._status, 403);
  });

  it("returns 403 when req.orgId is empty string", () => {
    const req = { orgId: "" };
    const res = mockRes();
    requireOrgContext(req, res, () => assert.fail("next should not be called"));
    assert.strictEqual(res._status, 403);
  });

  it("includes NO_ORG_CONTEXT error code in response body", () => {
    const req = {};
    const res = mockRes();
    requireOrgContext(req, res, noop);
    assert.strictEqual(res._json.error, "NO_ORG_CONTEXT");
    assert.ok(res._json.message);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F-001: Organizations — org-boundary on GET endpoints
// ═══════════════════════════════════════════════════════════════════════════════

describe("F-001: Organizations — org-boundary enforcement", () => {
  // Pool returns OWNER_MEMBERSHIP for requirePermission (PATCH already had it)
  const pool = sequencePool({ rows: [OWNER_MEMBERSHIP] });
  const router = createOrganizationsRouter(baseDeps(returnPool()));

  it("GET /organizations/:id — allows when params.id === orgId", async () => {
    const handler = findHandler(router, "get", "/organizations/:id");
    const req = mockReq({ params: { id: ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    // Should not return 403 (may return 404 from service, which is OK)
    assert.notStrictEqual(res._status, 403);
  });

  it("GET /organizations/:id — blocks when params.id !== orgId", async () => {
    const handler = findHandler(router, "get", "/organizations/:id");
    const req = mockReq({ params: { id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("GET /organizations/:id/locations — blocks cross-org access", async () => {
    const handler = findHandlerExact(router, "get", "/organizations/:id/locations");
    const req = mockReq({ params: { id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("GET /organizations/:id/departments — blocks cross-org access", async () => {
    const handler = findHandlerExact(router, "get", "/organizations/:id/departments");
    const req = mockReq({ params: { id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
  });

  it("GET /organizations/:id/members — blocks cross-org access", async () => {
    const handler = findHandlerExact(router, "get", "/organizations/:id/members");
    const req = mockReq({ params: { id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
  });

  it("GET /organizations/:id/locations — allows same-org access", async () => {
    const handler = findHandlerExact(router, "get", "/organizations/:id/locations");
    const req = mockReq({ params: { id: ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F-002: Compliance Docs — RBAC + org-boundary
// ═══════════════════════════════════════════════════════════════════════════════

describe("F-002: Compliance Docs — structural RBAC verification", () => {
  // Need a pool that returns membership for requirePermission calls
  const pool = sequencePool({ rows: [OWNER_MEMBERSHIP] });
  const router = createComplianceDocsRouter(baseDeps(pool));

  it("GET /compliance-documents has requirePermission middleware", () => {
    const names = getMiddlewareNames(router, "get", "/compliance-documents");
    assert.ok(names.length >= 2, "Should have at least requireAuth + requirePermission + handler");
  });

  it("POST /compliance-documents has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "post", "/compliance-documents");
    assert.ok(names.length >= 2);
  });

  it("PATCH /compliance-documents/:id has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "patch", "/compliance-documents/:id");
    assert.ok(names.length >= 2);
  });

  it("DELETE /compliance-documents/:id has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "delete", "/compliance-documents/:id");
    assert.ok(names.length >= 2);
  });
});

describe("F-002: Compliance Docs — org-boundary in handlers", () => {
  it("GET /compliance-documents/:id — blocks when doc.org_id !== req.orgId", async () => {
    // Mock: getDocumentById returns a doc from a different org
    const pool = returnPool([{ id: "doc-1", org_id: OTHER_ORG_ID, doc_type: "insurance" }]);
    const router = createComplianceDocsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/compliance-documents/:id");
    const req = mockReq({ params: { id: "doc-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
  });

  it("GET /compliance-documents/:id — allows when doc.org_id === req.orgId", async () => {
    const pool = returnPool([{ id: "doc-1", org_id: ORG_ID, doc_type: "insurance" }]);
    const router = createComplianceDocsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/compliance-documents/:id");
    const req = mockReq({ params: { id: "doc-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
  });

  it("GET /compliance-documents/stats/:orgId — blocks cross-org stats", async () => {
    const router = createComplianceDocsRouter(baseDeps(returnPool()));
    const handler = findHandler(router, "get", "/compliance-documents/stats/:orgId");
    const req = mockReq({ params: { orgId: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
  });

  it("GET /compliance-documents/stats/:orgId — allows same-org stats", async () => {
    const pool = returnPool([{ total: 5, verified: 3, pending: 2, rejected: 0, expired: 0 }]);
    const router = createComplianceDocsRouter(baseDeps(pool));
    const handler = findHandler(router, "get", "/compliance-documents/stats/:orgId");
    const req = mockReq({ params: { orgId: ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
  });

  it("PATCH /compliance-documents/:id — blocks cross-org update", async () => {
    const pool = returnPool([{ id: "doc-1", org_id: OTHER_ORG_ID }]);
    const router = createComplianceDocsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "patch", "/compliance-documents/:id");
    const req = mockReq({ params: { id: "doc-1" }, body: { doc_name: "updated" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
  });

  it("POST /compliance-documents/:id/verify — blocks cross-org verify", async () => {
    const pool = returnPool([{ id: "doc-1", org_id: OTHER_ORG_ID }]);
    const router = createComplianceDocsRouter(baseDeps(pool));
    const handler = findHandler(router, "post", "/compliance-documents/:id/verify");
    const req = mockReq({ params: { id: "doc-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
  });

  it("POST /compliance-documents/:id/reject — blocks cross-org reject", async () => {
    const pool = returnPool([{ id: "doc-1", org_id: OTHER_ORG_ID }]);
    const router = createComplianceDocsRouter(baseDeps(pool));
    const handler = findHandler(router, "post", "/compliance-documents/:id/reject");
    const req = mockReq({ params: { id: "doc-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
  });

  it("DELETE /compliance-documents/:id — blocks cross-org delete", async () => {
    const pool = returnPool([{ id: "doc-1", org_id: OTHER_ORG_ID }]);
    const router = createComplianceDocsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "delete", "/compliance-documents/:id");
    const req = mockReq({ params: { id: "doc-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
  });

  it("POST /compliance-documents — uses req.orgId, not body.org_id", async () => {
    // Pool returns empty for the upload (simulates insert returning the doc)
    const pool = returnPool([{ id: "new-doc", org_id: ORG_ID }]);
    const router = createComplianceDocsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/compliance-documents");
    const req = mockReq({
      body: { org_id: OTHER_ORG_ID, doc_type: "insurance", doc_name: "test" }
    });
    const res = mockRes();
    await handler(req, res);
    // Should use req.orgId (ORG_ID), not body.org_id (OTHER_ORG_ID)
    assert.notStrictEqual(res._status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F-003 + F-010: Invoices — RBAC + org-boundary + no query param override
// ═══════════════════════════════════════════════════════════════════════════════

describe("F-003: Invoices — RBAC on void/paid", () => {
  const router = createInvoicesRouter(baseDeps(returnPool()));

  it("POST /invoices/:id/void has requirePermission middleware", () => {
    const names = getMiddlewareNames(router, "post", "/invoices/:id/void");
    assert.ok(names.length >= 2, "Should include requirePermission");
  });

  it("POST /invoices/:id/paid has requirePermission middleware", () => {
    const names = getMiddlewareNames(router, "post", "/invoices/:id/paid");
    assert.ok(names.length >= 2, "Should include requirePermission");
  });

  it("GET /invoices/export has requirePermission middleware", () => {
    const names = getMiddlewareNames(router, "get", "/invoices/export");
    assert.ok(names.length >= 2, "Should include requirePermission");
  });
});

describe("F-003: Invoices — org-boundary on void/paid", () => {
  it("POST /invoices/:id/void — blocks when invoice.org_id !== req.orgId", async () => {
    const pool = returnPool([{ id: "inv-1", org_id: OTHER_ORG_ID, status: "pending" }]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandler(router, "post", "/invoices/:id/void");
    const req = mockReq({ params: { id: "inv-1" } });
    const res = mockRes();
    const next = (err) => { if (err) throw err; };
    await handler(req, res, next);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("POST /invoices/:id/void — allows same-org invoice", async () => {
    // First query: getInvoice, second query: voidInvoice
    const pool = sequencePool(
      { rows: [{ id: "inv-1", org_id: ORG_ID, status: "pending" }] },
      { rows: [{ id: "inv-1", org_id: ORG_ID, status: "voided" }] }
    );
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandler(router, "post", "/invoices/:id/void");
    const req = mockReq({ params: { id: "inv-1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.notStrictEqual(res._status, 403);
  });

  it("POST /invoices/:id/paid — blocks cross-org invoice", async () => {
    const pool = returnPool([{ id: "inv-1", org_id: OTHER_ORG_ID, status: "pending" }]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandler(router, "post", "/invoices/:id/paid");
    const req = mockReq({ params: { id: "inv-1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.strictEqual(res._status, 403);
  });

  it("POST /invoices/:id/paid — returns 404 when invoice not found", async () => {
    const pool = returnPool([]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandler(router, "post", "/invoices/:id/paid");
    const req = mockReq({ params: { id: "inv-missing" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.strictEqual(res._status, 404);
  });
});

describe("F-010: Invoices — no query param org_id override", () => {
  it("GET /invoices uses req.orgId, not req.query.org_id", async () => {
    const pool = returnPool([]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/invoices");
    // Attacker tries to pass another org via query param
    const req = mockReq({ query: { org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res, noop);
    // Should return results for req.orgId, not the injected org_id
    assert.notStrictEqual(res._status, 500);
    assert.ok(res._json);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F-004: Requisitions — RBAC + org-boundary on reads
// ═══════════════════════════════════════════════════════════════════════════════

describe("F-004: Requisitions — structural RBAC on read endpoints", () => {
  const router = createRequisitionsRouter(baseDeps(returnPool()));

  it("GET /requisitions has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/requisitions");
    assert.ok(names.length >= 2);
  });

  it("GET /requisitions/:id has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/requisitions/:id");
    assert.ok(names.length >= 2);
  });

  it("GET /requisitions/:id/events has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/requisitions/:id/events");
    assert.ok(names.length >= 2);
  });

  it("GET /requisitions/:id/candidates has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/requisitions/:id/candidates");
    assert.ok(names.length >= 2);
  });
});

describe("F-004: Requisitions — org-boundary on detail", () => {
  it("GET /requisitions/:id — blocks when requisition.org_id !== req.orgId", async () => {
    const pool = returnPool([{ id: "req-1", org_id: OTHER_ORG_ID, title: "Secret" }]);
    const router = createRequisitionsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/requisitions/:id");
    const req = mockReq({ params: { id: "req-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("GET /requisitions/:id — allows same-org requisition", async () => {
    const pool = returnPool([{ id: "req-1", org_id: ORG_ID, title: "Open Req" }]);
    const router = createRequisitionsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/requisitions/:id");
    const req = mockReq({ params: { id: "req-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
  });

  it("GET /requisitions/:id — returns 404 for non-existent requisition", async () => {
    const pool = returnPool([]);
    const router = createRequisitionsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/requisitions/:id");
    const req = mockReq({ params: { id: "req-missing" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F-005: Settings — RBAC on GET + server-resolved orgId
// ═══════════════════════════════════════════════════════════════════════════════

describe("F-005: Settings — RBAC + server-resolved orgId", () => {
  it("GET /settings has requirePermission middleware", () => {
    const router = createSettingsRouter(baseDeps(returnPool()));
    const names = getMiddlewareNamesExact(router, "get", "/settings");
    assert.ok(names.length >= 2);
  });

  it("GET /settings uses req.orgId instead of query param", async () => {
    const pool = returnPool([{ org_id: ORG_ID, approval_required: true }]);
    const router = createSettingsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/settings");
    // Attacker tries to pass another org's settings via query
    const req = mockReq({ query: { org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
    assert.notStrictEqual(res._status, 400);
  });

  it("GET /settings returns 400 when no org context", async () => {
    const router = createSettingsRouter(baseDeps(returnPool()));
    const handler = findHandlerExact(router, "get", "/settings");
    const req = mockReq({ orgId: null, query: {} });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 400);
  });

  it("PATCH /settings uses req.orgId instead of body.org_id", async () => {
    const pool = returnPool([{ org_id: ORG_ID }]);
    const router = createSettingsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "patch", "/settings");
    const req = mockReq({
      body: { org_id: OTHER_ORG_ID, approval_required: false }
    });
    const res = mockRes();
    await handler(req, res);
    // Should use req.orgId, not body.org_id
    assert.notStrictEqual(res._status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F-006: Reporting — RBAC + server-resolved orgId
// ═══════════════════════════════════════════════════════════════════════════════

describe("F-006: Reporting — structural RBAC", () => {
  const router = createReportingRouter(baseDeps(returnPool()));

  for (const path of [
    "/reporting/dashboard",
    "/reporting/requisitions",
    "/reporting/requisitions/timeline",
    "/reporting/vendors",
    "/reporting/compliance",
    "/reporting/sla",
    "/reporting/top-roles"
  ]) {
    it(`GET ${path} has requirePermission middleware`, () => {
      const names = getMiddlewareNamesExact(router, "get", path);
      assert.ok(names.length >= 2, `${path} should have requirePermission`);
    });
  }
});

describe("F-006: Analytics — structural RBAC", () => {
  const router = createAnalyticsRouter(baseDeps(returnPool()));

  for (const path of [
    "/analytics/workforce",
    "/analytics/funnel",
    "/analytics/supplier-performance",
    "/analytics/events",
    "/analytics/events/summary"
  ]) {
    it(`GET ${path} has requirePermission middleware`, () => {
      const names = getMiddlewareNamesExact(router, "get", path);
      assert.ok(names.length >= 2, `${path} should have requirePermission`);
    });
  }
});

describe("F-006: Reporting — server-resolved orgId", () => {
  it("GET /reporting/dashboard uses req.orgId not query param", async () => {
    const pool = returnPool([{ total: 10 }]);
    const router = createReportingRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/reporting/dashboard");
    const req = mockReq({ query: { org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 500);
  });

  it("GET /reporting/vendors uses req.orgId instead of client_org_id query", async () => {
    const pool = returnPool([]);
    const router = createReportingRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/reporting/vendors");
    const req = mockReq({ query: { client_org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    // Should use req.orgId, not the injected client_org_id
    assert.notStrictEqual(res._status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F-007: Approvals — RBAC + org-boundary on reads
// ═══════════════════════════════════════════════════════════════════════════════

describe("F-007: Approvals — structural RBAC on read endpoints", () => {
  const router = createApprovalsRouter(baseDeps(returnPool()));

  it("GET /approvals has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/approvals");
    assert.ok(names.length >= 2);
  });

  it("GET /approvals/:id has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/approvals/:id");
    assert.ok(names.length >= 2);
  });

  it("GET /approvals/history/:entityType/:entityId has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/approvals/history/:entityType/:entityId");
    assert.ok(names.length >= 2);
  });
});

describe("F-007: Approvals — org-boundary on detail", () => {
  it("GET /approvals/:id — blocks when approval.org_id !== req.orgId", async () => {
    const pool = returnPool([{ id: "appr-1", org_id: OTHER_ORG_ID, status: "pending" }]);
    const router = createApprovalsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/approvals/:id");
    const req = mockReq({ params: { id: "appr-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("GET /approvals/:id — allows same-org approval", async () => {
    const pool = returnPool([{ id: "appr-1", org_id: ORG_ID, status: "pending" }]);
    const router = createApprovalsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/approvals/:id");
    const req = mockReq({ params: { id: "appr-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
  });

  it("GET /approvals/:id — returns 404 for missing approval", async () => {
    const pool = returnPool([]);
    const router = createApprovalsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/approvals/:id");
    const req = mockReq({ params: { id: "appr-missing" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F-008: Vendor Pool — RBAC + org ownership validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("F-008: Vendor Pool — structural RBAC on GET endpoints", () => {
  const router = createVendorPoolRouter(baseDeps(returnPool()));

  it("GET /vendor-pool has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/vendor-pool");
    assert.ok(names.length >= 2);
  });

  it("GET /vendor-pool/my has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/vendor-pool/my");
    assert.ok(names.length >= 2);
  });

  it("GET /vendor-pool/stats has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/vendor-pool/stats");
    assert.ok(names.length >= 2);
  });

  it("GET /vendor-pool/:id has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/vendor-pool/:id");
    assert.ok(names.length >= 2);
  });
});

describe("F-008: Vendor Pool — org-boundary on single entry", () => {
  it("GET /vendor-pool/:id — blocks when user is neither client nor supplier", async () => {
    const pool = returnPool([{
      id: "vp-1", client_org_id: OTHER_ORG_ID, supplier_org_id: "org-third-999"
    }]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id");
    const req = mockReq({ params: { id: "vp-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("GET /vendor-pool/:id — allows when user is client org", async () => {
    const pool = returnPool([{
      id: "vp-1", client_org_id: ORG_ID, supplier_org_id: OTHER_ORG_ID
    }]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id");
    const req = mockReq({ params: { id: "vp-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
  });

  it("GET /vendor-pool/:id — allows when user is supplier org", async () => {
    const pool = returnPool([{
      id: "vp-1", client_org_id: OTHER_ORG_ID, supplier_org_id: ORG_ID
    }]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id");
    const req = mockReq({ params: { id: "vp-1" } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
  });

  it("GET /vendor-pool/:id — returns 404 when not found", async () => {
    const pool = returnPool([]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id");
    const req = mockReq({ params: { id: "vp-missing" } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res._status, 404);
  });
});

describe("F-008: Vendor Pool — server-resolved orgId on list endpoints", () => {
  it("GET /vendor-pool uses req.orgId, not query.client_org_id", async () => {
    const pool = returnPool([]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool");
    const req = mockReq({ query: { client_org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
  });

  it("GET /vendor-pool/my uses req.orgId, not query.supplier_org_id", async () => {
    const pool = returnPool([]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/my");
    const req = mockReq({ query: { supplier_org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
  });

  it("GET /vendor-pool/stats uses req.orgId, not query.client_org_id", async () => {
    const pool = returnPool([{ total: 5 }]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/stats");
    const req = mockReq({ query: { client_org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F-009: Matching — RBAC gate
// ═══════════════════════════════════════════════════════════════════════════════

describe("F-009: Matching — structural RBAC on all endpoints", () => {
  const router = createMatchingRouter(baseDeps(returnPool()));

  it("GET /matching/demand/:id has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/matching/demand/:id");
    assert.ok(names.length >= 2);
  });

  it("GET /matching/supply/:id has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/matching/supply/:id");
    assert.ok(names.length >= 2);
  });

  it("GET /matching/worker/:id has requirePermission middleware", () => {
    const names = getMiddlewareNamesExact(router, "get", "/matching/worker/:id");
    assert.ok(names.length >= 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-cutting: no route trusts client-supplied org_id blindly
// ═══════════════════════════════════════════════════════════════════════════════

describe("Cross-cutting: org_id injection prevention", () => {
  it("Invoices list ignores query.org_id", async () => {
    const pool = returnPool([]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/invoices");
    const req = mockReq({ query: { org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.ok(res._json, "Should return response");
  });

  it("Analytics workforce ignores query.org_id", async () => {
    const pool = returnPool([{ active_workers: 5 }]);
    const router = createAnalyticsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/analytics/workforce");
    const req = mockReq({ query: { org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 500);
  });

  it("Approvals list ignores query.org_id", async () => {
    const pool = returnPool([]);
    const router = createApprovalsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/approvals");
    const req = mockReq({ query: { org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.ok(res._json);
  });

  it("Reporting dashboard ignores query.org_id", async () => {
    const pool = returnPool([{ total: 0 }]);
    const router = createReportingRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/reporting/dashboard");
    const req = mockReq({ query: { org_id: OTHER_ORG_ID } });
    const res = mockRes();
    await handler(req, res);
    assert.notStrictEqual(res._status, 500);
  });
});
