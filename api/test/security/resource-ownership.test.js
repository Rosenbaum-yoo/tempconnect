/**
 * Security Regression: Resource Ownership (IDOR)
 *
 * Verifies that User B cannot GET, PATCH, or DELETE resources
 * owned by User A, even when both are in different orgs or when
 * the resource ID is known.
 *
 * Attack class: Insecure Direct Object Reference (IDOR).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mockReq, mockRes, noop, baseDeps, findHandlerExact, findChainFrom, returnPool,
  USER_A, USER_B, ORG_A, ORG_B
} from "../helpers/security-mocks.js";

import { createInvoicesRouter }       from "../../routes/invoices.js";
import { createComplianceDocsRouter } from "../../routes/complianceDocs.js";
import { createOrganizationsRouter }  from "../../routes/organizations.js";
import { createApprovalsRouter }      from "../../routes/approvals.js";
import { createVendorPoolRouter }     from "../../routes/vendorPool.js";
import { createRequisitionsRouter }   from "../../routes/requisitions.js";

// ── Invoices: invoice belongs to User A / Org A ─────────────────────────────

describe("OWNERSHIP: invoices — User B cannot access User A invoice", () => {
  const invoiceA = { id: "inv-a1", org_id: ORG_A, user_id: USER_A, status: "pending" };

  it("GET /invoices/:id: User B (different org) blocked", async () => {
    const pool = returnPool([invoiceA]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/invoices/:id");
    const req = mockReq({
      orgId: ORG_B,
      session: { userId: USER_B },
      params: { id: "inv-a1" }
    });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("GET /invoices/:id: same user allowed (user_id match)", async () => {
    const pool = returnPool([invoiceA]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/invoices/:id");
    const req = mockReq({
      orgId: null, // no org context
      session: { userId: USER_A },
      params: { id: "inv-a1" }
    });
    const res = mockRes();
    await handler(req, res, noop);
    // Allowed because invoice.user_id === userId
    assert.notEqual(res._status, 403);
  });

  it("POST /invoices/:id/void: User B blocked from voiding User A invoice", async () => {
    const pool = returnPool([invoiceA]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/invoices/:id/void");
    const req = mockReq({ orgId: ORG_B, params: { id: "inv-a1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
  });

  it("POST /invoices/:id/paid: User B blocked from marking User A invoice paid", async () => {
    const pool = returnPool([invoiceA]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/invoices/:id/paid");
    const req = mockReq({ orgId: ORG_B, params: { id: "inv-a1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
  });
});

// ── Compliance Docs: doc belongs to Org A ───────────────────────────────────

describe("OWNERSHIP: complianceDocs — User B cannot access Org A doc", () => {
  const docA = { id: "doc-a1", org_id: ORG_A, doc_type: "cert", status: "pending" };

  const ops = [
    { method: "get",    path: "/compliance-documents/:id",        label: "GET" },
    { method: "patch",  path: "/compliance-documents/:id",        label: "PATCH" },
    { method: "post",   path: "/compliance-documents/:id/verify", label: "VERIFY" },
    { method: "post",   path: "/compliance-documents/:id/reject", label: "REJECT" },
    { method: "delete", path: "/compliance-documents/:id",        label: "DELETE" },
  ];

  for (const { method, path, label } of ops) {
    it(`${label}: User B (Org B) blocked from Org A doc`, async () => {
      const pool = returnPool([docA]);
      const router = createComplianceDocsRouter(baseDeps(pool));
      const handler = findHandlerExact(router, method, path);
      const req = mockReq({
        orgId: ORG_B,
        params: { id: "doc-a1" },
        body: {},
        user: { id: USER_B }
      });
      const res = mockRes();
      await handler(req, res, noop);
      assert.equal(res._status, 403);
    });
  }
});

// ── Organizations: User B cannot read Org A subresources ────────────────────

describe("OWNERSHIP: organizations — cross-org subresource access", () => {
  const router = createOrganizationsRouter(baseDeps());

  const endpoints = [
    { method: "get", path: "/organizations/:id",             label: "org detail" },
    { method: "get", path: "/organizations/:id/locations",   label: "locations" },
    { method: "get", path: "/organizations/:id/departments", label: "departments" },
    { method: "get", path: "/organizations/:id/members",     label: "members" },
  ];

  for (const { method, path, label } of endpoints) {
    it(`User B (Org B) cannot read Org A ${label}`, async () => {
      /* Die Grenze steht in `sameOrgParam`, nicht im Handler (zusammengefasst
       * am 2026-08-21: vier Kopien zu einer Stelle). `findHandlerExact` liefert
       * nur den letzten Handler und saehe sie deshalb nicht — Fallstrick 5
       * aus Plan H2. `findChainFrom` fuehrt die Kette ab dem benannten
       * Middleware aus und bindet die Probe zugleich an seinen Bestand: faellt
       * `sameOrgParam` aus der Kette, wirft der Helfer. */
      const handler = findChainFrom(router, method, path, "sameOrgParam");
      const req = mockReq({ orgId: ORG_B, params: { id: ORG_A } });
      const res = mockRes();
      await handler(req, res, noop);
      assert.equal(res._status, 403);
    });
  }
});

// ── Approvals: approval belongs to Org A ────────────────────────────────────

describe("OWNERSHIP: approvals — User B cannot read Org A approval", () => {
  const approvalA = { id: "apr-a1", org_id: ORG_A, entity_type: "requisition", status: "pending" };

  it("GET /approvals/:id: User B (Org B) blocked", async () => {
    const pool = returnPool([approvalA]);
    const router = createApprovalsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/approvals/:id");
    const req = mockReq({ orgId: ORG_B, params: { id: "apr-a1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
  });
});

// ── Vendor Pool: entry belongs to different orgs ────────────────────────────

describe("OWNERSHIP: vendorPool — third-party org blocked", () => {
  // Entry is between ORG_A (client) and a third org — User B in ORG_B is neither
  const entry = { id: "vp-x1", client_org_id: ORG_A, supplier_org_id: "org-gamma-003" };

  it("GET /vendor-pool/:id: User B (Org B) blocked from entry between Org A and Org C", async () => {
    const pool = returnPool([entry]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id");
    const req = mockReq({ orgId: ORG_B, params: { id: "vp-x1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
  });
});

// ── Requisitions: requisition belongs to Org A ──────────────────────────────

describe("OWNERSHIP: requisitions — User B cannot access Org A requisition", () => {
  const reqA = { id: "req-a1", org_id: ORG_A, title: "Backend Dev", status: "OPEN" };

  it("GET /requisitions/:id: User B (Org B) blocked", async () => {
    const pool = returnPool([reqA]);
    const router = createRequisitionsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/requisitions/:id");
    const req = mockReq({ orgId: ORG_B, params: { id: "req-a1" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 403);
  });
});

// ── Non-existent resource → 404, not information leak ───────────────────────

describe("OWNERSHIP: non-existent resources return 404", () => {
  it("GET /invoices/:id: unknown ID → 404", async () => {
    const pool = returnPool([]);
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/invoices/:id");
    const req = mockReq({ orgId: ORG_A, session: { userId: USER_A }, params: { id: "nonexistent" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 404);
  });

  it("GET /compliance-documents/:id: unknown ID → 404", async () => {
    const pool = returnPool([]);
    const router = createComplianceDocsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/compliance-documents/:id");
    const req = mockReq({ orgId: ORG_A, params: { id: "nonexistent" }, user: { id: USER_A } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 404);
  });

  it("GET /approvals/:id: unknown ID → 404", async () => {
    const pool = returnPool([]);
    const router = createApprovalsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/approvals/:id");
    const req = mockReq({ orgId: ORG_A, params: { id: "nonexistent" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 404);
  });

  it("GET /vendor-pool/:id: unknown ID → 404", async () => {
    const pool = returnPool([]);
    const router = createVendorPoolRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/vendor-pool/:id");
    const req = mockReq({ orgId: ORG_A, params: { id: "nonexistent" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 404);
  });

  it("GET /requisitions/:id: unknown ID → 404", async () => {
    const pool = returnPool([]);
    const router = createRequisitionsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/requisitions/:id");
    const req = mockReq({ orgId: ORG_A, params: { id: "nonexistent" } });
    const res = mockRes();
    await handler(req, res, noop);
    assert.equal(res._status, 404);
  });
});
