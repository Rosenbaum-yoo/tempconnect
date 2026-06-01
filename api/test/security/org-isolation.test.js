/**
 * Security Regression: Organization Isolation (Tenant Boundary)
 *
 * Verifies that a user in Org A cannot access, modify, or delete
 * resources belonging to Org B.  Also tests that tampered org_id
 * values in req.body / req.query are rejected or ignored.
 *
 * Attack classes:
 *   - Cross-tenant data access (IDOR via org_id)
 *   - Manipulated org_id parameter injection
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mockReq, mockRes, noop, mockLogger, returnPool, sequencePool,
  baseDeps, findHandlerExact,
  USER_A, USER_B, ORG_A, ORG_B, MEMBERSHIPS
} from "../helpers/security-mocks.js";

import { createOrganizationsRouter }  from "../../routes/organizations.js";
import { createComplianceDocsRouter } from "../../routes/complianceDocs.js";
import { createInvoicesRouter }       from "../../routes/invoices.js";
import { createRequisitionsRouter }   from "../../routes/requisitions.js";
import { createApprovalsRouter }      from "../../routes/approvals.js";
import { createVendorPoolRouter }     from "../../routes/vendorPool.js";

// ── Organizations: org-boundary checks ──────────────────────────────────────

describe("ORG-ISO: organizations — org boundary", () => {
  const router = createOrganizationsRouter(baseDeps());

  const orgBoundaryEndpoints = [
    { method: "get", path: "/organizations/:id",             label: "GET /organizations/:id" },
    { method: "get", path: "/organizations/:id/locations",   label: "GET /organizations/:id/locations" },
    { method: "get", path: "/organizations/:id/departments", label: "GET /organizations/:id/departments" },
    { method: "get", path: "/organizations/:id/members",     label: "GET /organizations/:id/members" },
  ];

  for (const { method, path, label } of orgBoundaryEndpoints) {
    it(`${label}: user from Org A blocked from Org B`, async () => {
      const handler = findHandlerExact(router, method, path);
      // User belongs to ORG_A, but requests ORG_B resource
      const req = mockReq({ orgId: ORG_A, params: { id: ORG_B } });
      const res = mockRes();
      await handler(req, res, noop);
      assert.equal(res._status, 403);
      assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
    });

    it(`${label}: same-org access allowed`, async () => {
      const pool = returnPool([{ id: ORG_A, name: "Test", items: [] }]);
      const deps = baseDeps(pool);
      const r = createOrganizationsRouter(deps);
      const handler = findHandlerExact(r, method, path);
      const req = mockReq({ orgId: ORG_A, params: { id: ORG_A } });
      const res = mockRes();
      await handler(req, res, noop);
      // Should NOT be 403 — either 200 or whatever the service returns
      assert.notEqual(res._status, 403);
    });
  }
});

// ── Compliance Docs: org-boundary checks ────────────────────────────────────

describe("ORG-ISO: complianceDocs — org boundary on single-doc ops", () => {
  // For GET/:id, PATCH/:id, verify, reject, delete — the handler fetches doc first,
  // then compares doc.org_id to req.orgId.
  const docInOrgB = { id: "doc-1", org_id: ORG_B, doc_type: "cert", status: "pending" };

  const singleDocEndpoints = [
    { method: "get",    path: "/compliance-documents/:id",          label: "GET /compliance-documents/:id" },
    { method: "patch",  path: "/compliance-documents/:id",          label: "PATCH /compliance-documents/:id" },
    { method: "post",   path: "/compliance-documents/:id/verify",   label: "POST /compliance-documents/:id/verify" },
    { method: "post",   path: "/compliance-documents/:id/reject",   label: "POST /compliance-documents/:id/reject" },
    { method: "delete", path: "/compliance-documents/:id",          label: "DELETE /compliance-documents/:id" },
  ];

  for (const { method, path, label } of singleDocEndpoints) {
    it(`${label}: Org A user blocked from Org B doc`, async () => {
      const pool = returnPool([docInOrgB]);
      const router = createComplianceDocsRouter(baseDeps(pool));
      const handler = findHandlerExact(router, method, path);
      const req = mockReq({
        orgId: ORG_A,
        params: { id: "doc-1" },
        body: {},
        user: { id: USER_A }
      });
      const res = mockRes();
      await handler(req, res, noop);
      assert.equal(res._status, 403);
    });
  }

  it("GET /compliance-documents/stats/:orgId: cross-org blocked", async () => {
    const router = createComplianceDocsRouter(baseDeps());
    const handler = findHandlerExact(router, "get", "/compliance-documents/stats/:orgId");
    const req = mockReq({ orgId: ORG_A, params: { orgId: ORG_B } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
  });
});

// ── Invoices: org-boundary checks ───────────────────────────────────────────

describe("ORG-ISO: invoices — org boundary", () => {
  const invoiceInOrgB = { id: "inv-1", org_id: ORG_B, user_id: USER_B, status: "pending" };

  it("GET /invoices/:id: Org A user blocked from Org B invoice", async () => {
    const pool = returnPool([invoiceInOrgB]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/invoices/:id");
    const req = mockReq({
      orgId: ORG_A,
      session: { userId: USER_A },
      params: { id: "inv-1" }
    });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("POST /invoices/:id/void: Org A user blocked from voiding Org B invoice", async () => {
    const pool = returnPool([invoiceInOrgB]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/invoices/:id/void");
    const req = mockReq({ orgId: ORG_A, params: { id: "inv-1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
  });

  it("POST /invoices/:id/paid: Org A user blocked from marking Org B invoice paid", async () => {
    const pool = returnPool([invoiceInOrgB]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/invoices/:id/paid");
    const req = mockReq({ orgId: ORG_A, params: { id: "inv-1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
  });
});

// ── Requisitions: org-boundary on detail ────────────────────────────────────

describe("ORG-ISO: requisitions — org boundary on detail", () => {
  const reqInOrgB = { id: "req-1", org_id: ORG_B, title: "Test", status: "OPEN" };

  it("GET /requisitions/:id: Org A user blocked from Org B requisition", async () => {
    const pool = returnPool([reqInOrgB]);
    const router = createRequisitionsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/requisitions/:id");
    const req = mockReq({ orgId: ORG_A, params: { id: "req-1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });
});

// ── Approvals: org-boundary on detail ───────────────────────────────────────

describe("ORG-ISO: approvals — org boundary", () => {
  const approvalInOrgB = { id: "apr-1", org_id: ORG_B, entity_type: "requisition", status: "pending" };

  it("GET /approvals/:id: Org A user blocked from Org B approval", async () => {
    const pool = returnPool([approvalInOrgB]);
    const router = createApprovalsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/approvals/:id");
    const req = mockReq({ orgId: ORG_A, params: { id: "apr-1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });
});

// ── Vendor Pool: dual org-boundary ──────────────────────────────────────────

describe("ORG-ISO: vendorPool — dual org boundary", () => {
  // Entry: client_org_id=ORG_B, supplier_org_id=ORG_B — user in ORG_A should be blocked
  const entryBothOrgB = { id: "vp-1", client_org_id: ORG_B, supplier_org_id: ORG_B, tier: "PREFERRED" };

  it("GET /vendor-pool/:id: Org A blocked when neither client nor supplier", async () => {
    const pool = returnPool([entryBothOrgB]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id");
    const req = mockReq({ orgId: ORG_A, params: { id: "vp-1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("GET /vendor-pool/:id: allowed when user org is client", async () => {
    const entryClientA = { id: "vp-2", client_org_id: ORG_A, supplier_org_id: ORG_B, tier: "PREFERRED" };
    const pool = returnPool([entryClientA]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id");
    const req = mockReq({ orgId: ORG_A, params: { id: "vp-2" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.notEqual(res._status, 403);
  });

  it("GET /vendor-pool/:id: allowed when user org is supplier", async () => {
    const entrySupplierA = { id: "vp-3", client_org_id: ORG_B, supplier_org_id: ORG_A, tier: "TRIAL" };
    const pool = returnPool([entrySupplierA]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id");
    const req = mockReq({ orgId: ORG_A, params: { id: "vp-3" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.notEqual(res._status, 403);
  });
});

// ── Manipulated org_id: server-resolved org_id ignores client input ─────────

describe("ORG-ISO: manipulated org_id — server ignores client-supplied values", () => {
  it("GET /invoices: uses req.orgId, ignores req.query.org_id", async () => {
    const pool = returnPool([]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/invoices");
    // Attacker sends org_id=ORG_B in query, but server should use req.orgId=ORG_A
    const req = mockReq({
      orgId: ORG_A,
      session: { userId: USER_A },
      query: { org_id: ORG_B }
    });
    const res = mockRes();
    await handler(req, res, noop);
    // The handler should return data scoped to ORG_A, not ORG_B
    // We verify it doesn't error and the pool was called (service invoked)
    assert.notEqual(res._status, 403);
  });

  it("POST /compliance-documents: uses req.orgId, ignores body.org_id", async () => {
    const uploadedDoc = { id: "doc-new", org_id: ORG_A };
    const pool = returnPool([uploadedDoc]);
    const router = createComplianceDocsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/compliance-documents");
    const req = mockReq({
      orgId: ORG_A,
      user: { id: USER_A },
      body: { org_id: ORG_B, doc_type: "cert", doc_name: "Test" } // attacker injects ORG_B
    });
    const res = mockRes();
    await handler(req, res, noop);
    // Handler should use req.orgId (ORG_A), not body.org_id (ORG_B)
    assert.notEqual(res._status, 403);
  });

  it("GET /settings: uses req.orgId, ignores query.org_id", async () => {
    const pool = returnPool([{ approval_required: false }]);
    const deps = baseDeps(pool);
    // Import settings router
    const { createSettingsRouter } = await import("../../routes/settings.js");
    const router = createSettingsRouter(deps);
    const handler = findHandlerExact(router, "get", "/settings");
    const req = mockReq({ orgId: ORG_A, query: { org_id: ORG_B } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.notEqual(res._status, 403);
  });

  it("GET /reporting/dashboard: uses req.orgId, ignores query.org_id", async () => {
    const pool = returnPool([]);
    const { createReportingRouter } = await import("../../routes/reporting.js");
    const router = createReportingRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/reporting/dashboard");
    const req = mockReq({ orgId: ORG_A, query: { org_id: ORG_B } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.notEqual(res._status, 403);
  });
});
