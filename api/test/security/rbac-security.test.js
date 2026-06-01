/**
 * Security Regression: RBAC Structural Integrity
 *
 * Verifies that every protected route has the expected number of middleware
 * (auth + RBAC permission check + handler). A route with < 3 middleware
 * on a protected endpoint is a regression — the RBAC guard was removed.
 *
 * Attack class: Middleware bypass via missing permission checks.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  baseDeps, getMiddlewareCount, listRoutes
} from "../helpers/security-mocks.js";

// ── Route factories ─────────────────────────────────────────────────────────

import { createOrganizationsRouter }  from "../../routes/organizations.js";
import { createComplianceDocsRouter } from "../../routes/complianceDocs.js";
import { createInvoicesRouter }       from "../../routes/invoices.js";
import { createRequisitionsRouter }   from "../../routes/requisitions.js";
import { createSettingsRouter }       from "../../routes/settings.js";
import { createReportingRouter }      from "../../routes/reporting.js";
import { createAnalyticsRouter }      from "../../routes/analytics.js";
import { createVendorPoolRouter }     from "../../routes/vendorPool.js";
import { createApprovalsRouter }      from "../../routes/approvals.js";
import { createMatchingRouter }       from "../../routes/matching.js";

// ── Test helper ─────────────────────────────────────────────────────────────

/**
 * Assert that the specified routes have the minimum middleware count.
 * Protected routes need >= minCount (typically 3: requireAuth + requirePermission + handler).
 */
function assertProtected(router, routes, minCount = 3) {
  for (const { method, path, label } of routes) {
    it(`${label || `${method.toUpperCase()} ${path}`} has >= ${minCount} middleware`, () => {
      const count = getMiddlewareCount(router, method, path);
      assert.ok(count >= minCount, `Expected >= ${minCount} middleware, got ${count}`);
    });
  }
}

// ── Organizations ───────────────────────────────────────────────────────────

describe("RBAC-STRUCT: organizations routes", () => {
  const router = createOrganizationsRouter(baseDeps());
  assertProtected(router, [
    { method: "patch",  path: "/organizations/:id",              label: "PATCH /organizations/:id (org.settings)" },
    { method: "post",   path: "/organizations/:id/locations",    label: "POST /organizations/:id/locations (org.locations)" },
    { method: "post",   path: "/organizations/:id/departments",  label: "POST /organizations/:id/departments (org.departments)" },
    { method: "post",   path: "/organizations/:id/members",      label: "POST /organizations/:id/members (org.members)" },
  ]);

  // Auth-only routes still need requireAuth (2 middleware: auth + handler)
  assertProtected(router, [
    { method: "post", path: "/organizations",                    label: "POST /organizations (auth only)" },
    { method: "get",  path: "/organizations/:id",                label: "GET /organizations/:id (auth only)" },
    { method: "get",  path: "/organizations/:id/locations",      label: "GET /organizations/:id/locations (auth only)" },
    { method: "get",  path: "/organizations/:id/departments",    label: "GET /organizations/:id/departments (auth only)" },
    { method: "get",  path: "/organizations/:id/members",        label: "GET /organizations/:id/members (auth only)" },
  ], 2);
});

// ── Compliance Docs ─────────────────────────────────────────────────────────

describe("RBAC-STRUCT: complianceDocs routes", () => {
  const router = createComplianceDocsRouter(baseDeps());
  assertProtected(router, [
    { method: "get",    path: "/compliance-documents",                     label: "GET /compliance-documents (compliance.view)" },
    { method: "get",    path: "/compliance-documents/stats/:orgId",        label: "GET /compliance-documents/stats/:orgId (compliance.view)" },
    { method: "get",    path: "/compliance-documents/:id",                 label: "GET /compliance-documents/:id (compliance.view)" },
    { method: "post",   path: "/compliance-documents",                     label: "POST /compliance-documents (compliance.upload)" },
    { method: "patch",  path: "/compliance-documents/:id",                 label: "PATCH /compliance-documents/:id (compliance.manage)" },
    { method: "post",   path: "/compliance-documents/:id/verify",          label: "POST /compliance-documents/:id/verify (compliance.verify)" },
    { method: "post",   path: "/compliance-documents/:id/reject",          label: "POST /compliance-documents/:id/reject (compliance.verify)" },
    { method: "delete", path: "/compliance-documents/:id",                 label: "DELETE /compliance-documents/:id (compliance.manage)" },
  ]);
});

// ── Invoices ────────────────────────────────────────────────────────────────

describe("RBAC-STRUCT: invoices routes", () => {
  const router = createInvoicesRouter(baseDeps());
  assertProtected(router, [
    { method: "get",  path: "/invoices/export",    label: "GET /invoices/export (org.billing)" },
    { method: "post", path: "/invoices/:id/void",  label: "POST /invoices/:id/void (org.billing)" },
    { method: "post", path: "/invoices/:id/paid",  label: "POST /invoices/:id/paid (org.billing)" },
  ]);
  // Auth-only
  assertProtected(router, [
    { method: "get", path: "/invoices",     label: "GET /invoices (auth only)" },
    { method: "get", path: "/invoices/:id", label: "GET /invoices/:id (auth only)" },
  ], 2);
});

// ── Requisitions ────────────────────────────────────────────────────────────

describe("RBAC-STRUCT: requisitions routes", () => {
  const router = createRequisitionsRouter(baseDeps());
  assertProtected(router, [
    { method: "post",  path: "/requisitions",                                  label: "POST /requisitions (requisition.create)" },
    { method: "get",   path: "/requisitions",                                  label: "GET /requisitions (requisition.view)" },
    { method: "get",   path: "/requisitions/:id",                              label: "GET /requisitions/:id (requisition.view)" },
    { method: "patch", path: "/requisitions/:id",                              label: "PATCH /requisitions/:id (requisition.edit)" },
    { method: "post",  path: "/requisitions/:id/approve",                      label: "POST /requisitions/:id/approve (requisition.approve)" },
    { method: "get",   path: "/requisitions/:id/events",                       label: "GET /requisitions/:id/events (requisition.view)" },
    { method: "get",   path: "/requisitions/:id/candidates",                   label: "GET /requisitions/:id/candidates (requisition.view)" },
    { method: "post",  path: "/requisitions/:id/candidates",                   label: "POST /requisitions/:id/candidates (requisition.edit)" },
    { method: "patch", path: "/requisitions/:reqId/candidates/:candId",        label: "PATCH candidates/:candId (requisition.edit)" },
  ]);
});

// ── Settings ────────────────────────────────────────────────────────────────

describe("RBAC-STRUCT: settings routes", () => {
  const router = createSettingsRouter(baseDeps());
  assertProtected(router, [
    { method: "get",   path: "/settings", label: "GET /settings (settings.view)" },
    { method: "patch", path: "/settings", label: "PATCH /settings (org.settings)" },
  ]);
});

// ── Reporting ───────────────────────────────────────────────────────────────

describe("RBAC-STRUCT: reporting routes", () => {
  const router = createReportingRouter(baseDeps());
  assertProtected(router, [
    { method: "get", path: "/reporting/dashboard",              label: "GET /reporting/dashboard (report.executive)" },
    { method: "get", path: "/reporting/requisitions",           label: "GET /reporting/requisitions (report.operational)" },
    { method: "get", path: "/reporting/requisitions/timeline",  label: "GET /reporting/requisitions/timeline (report.operational)" },
    { method: "get", path: "/reporting/vendors",                label: "GET /reporting/vendors (report.supplier)" },
    { method: "get", path: "/reporting/compliance",             label: "GET /reporting/compliance (report.operational)" },
    { method: "get", path: "/reporting/sla",                    label: "GET /reporting/sla (report.operational)" },
    { method: "get", path: "/reporting/top-roles",              label: "GET /reporting/top-roles (report.operational)" },
  ]);
});

// ── Analytics ───────────────────────────────────────────────────────────────

describe("RBAC-STRUCT: analytics routes", () => {
  const router = createAnalyticsRouter(baseDeps());
  assertProtected(router, [
    { method: "get", path: "/analytics/workforce",             label: "GET /analytics/workforce (report.operational)" },
    { method: "get", path: "/analytics/funnel",                label: "GET /analytics/funnel (report.operational)" },
    { method: "get", path: "/analytics/supplier-performance",  label: "GET /analytics/supplier-performance (report.supplier)" },
    { method: "get", path: "/analytics/events",                label: "GET /analytics/events (report.operational)" },
    { method: "get", path: "/analytics/events/summary",        label: "GET /analytics/events/summary (report.operational)" },
  ]);
});

// ── Vendor Pool ─────────────────────────────────────────────────────────────

describe("RBAC-STRUCT: vendorPool routes", () => {
  const router = createVendorPoolRouter(baseDeps());
  assertProtected(router, [
    { method: "get",    path: "/vendor-pool",             label: "GET /vendor-pool (vendor_pool.view)" },
    { method: "get",    path: "/vendor-pool/my",          label: "GET /vendor-pool/my (vendor_pool.view)" },
    { method: "get",    path: "/vendor-pool/stats",       label: "GET /vendor-pool/stats (vendor_pool.view)" },
    { method: "get",    path: "/vendor-pool/:id",         label: "GET /vendor-pool/:id (vendor_pool.view)" },
    { method: "post",   path: "/vendor-pool",             label: "POST /vendor-pool (vendor_pool.manage)" },
    { method: "patch",  path: "/vendor-pool/:id/tier",    label: "PATCH /vendor-pool/:id/tier (vendor_pool.manage)" },
    { method: "patch",  path: "/vendor-pool/:id/status",  label: "PATCH /vendor-pool/:id/status (vendor_pool.manage)" },
    { method: "delete", path: "/vendor-pool/:id",         label: "DELETE /vendor-pool/:id (vendor_pool.manage)" },
  ]);
});

// ── Approvals ───────────────────────────────────────────────────────────────

describe("RBAC-STRUCT: approvals routes", () => {
  const router = createApprovalsRouter(baseDeps());
  assertProtected(router, [
    { method: "get",  path: "/approvals",                                      label: "GET /approvals (approval.view)" },
    { method: "get",  path: "/approvals/:id",                                  label: "GET /approvals/:id (approval.view)" },
    { method: "post", path: "/approvals/:id/approve",                          label: "POST /approvals/:id/approve (approval.decide)" },
    { method: "post", path: "/approvals/:id/reject",                           label: "POST /approvals/:id/reject (approval.decide)" },
    { method: "get",  path: "/approvals/history/:entityType/:entityId",        label: "GET /approvals/history (approval.view)" },
  ]);
});

// ── Matching ────────────────────────────────────────────────────────────────

describe("RBAC-STRUCT: matching routes", () => {
  const router = createMatchingRouter(baseDeps());
  assertProtected(router, [
    { method: "get", path: "/matching/demand/:id",  label: "GET /matching/demand/:id (requisition.view)" },
    { method: "get", path: "/matching/supply/:id",  label: "GET /matching/supply/:id (requisition.view)" },
    { method: "get", path: "/matching/worker/:id",  label: "GET /matching/worker/:id (requisition.view)" },
  ]);
});

// ── Meta: ensure no route is unprotected (zero middleware) ──────────────────

describe("RBAC-STRUCT: no route has zero middleware", () => {
  const routers = [
    { name: "organizations",  router: createOrganizationsRouter(baseDeps()) },
    { name: "complianceDocs", router: createComplianceDocsRouter(baseDeps()) },
    { name: "invoices",       router: createInvoicesRouter(baseDeps()) },
    { name: "requisitions",   router: createRequisitionsRouter(baseDeps()) },
    { name: "settings",       router: createSettingsRouter(baseDeps()) },
    { name: "reporting",      router: createReportingRouter(baseDeps()) },
    { name: "analytics",      router: createAnalyticsRouter(baseDeps()) },
    { name: "vendorPool",     router: createVendorPoolRouter(baseDeps()) },
    { name: "approvals",      router: createApprovalsRouter(baseDeps()) },
    { name: "matching",       router: createMatchingRouter(baseDeps()) },
  ];

  for (const { name, router } of routers) {
    const routes = listRoutes(router);
    for (const { method, path, middlewareCount } of routes) {
      it(`${name}: ${method.toUpperCase()} ${path} has > 0 middleware (got ${middlewareCount})`, () => {
        assert.ok(middlewareCount > 0, `Route ${method} ${path} has no middleware!`);
      });
    }
  }
});
