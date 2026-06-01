/**
 * Structural regression tests for platform-wide entitlement route gates.
 *
 * These tests catch accidental removal of hard backend gates on mutating
 * POST/PATCH/DELETE endpoints. Frontend DOM locks are UX only.
 *
 * Run: node --test --test-force-exit api/test/entitlementRouteGates.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Disable dev-env feature gate bypass so these tests verify real plan-gating logic.
process.env.FEATURE_GATE_BYPASS = "false";

const ROOT = process.cwd();
// Inside Docker the cwd is /app (the api dir), not the project root.
// Detect by checking whether 'api/routes' exists relative to ROOT.
const HAS_API_SUBDIR = fs.existsSync(path.join(ROOT, "api"));
// Strip the leading 'api/' prefix when running from within the api dir.
function resolvePath(relativePath) {
  if (!HAS_API_SUBDIR) return path.join(ROOT, relativePath.replace(/^api\//, ""));
  return path.join(ROOT, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(resolvePath(relativePath), "utf8");
}

function expectTokens(relativePath, tokens) {
  const source = read(relativePath);
  for (const token of tokens) {
    assert.ok(source.includes(token), `${relativePath}: missing "${token}"`);
  }
}

describe("mutating target routes keep hard entitlement gates", () => {
  it("vendor_pool mutations require supplier_management and supplier quota", () => {
    expectTokens("api/routes/vendorPool.js", [
      'requireOrgFeature("supplier_management"',
      'requireOrgLimit("suppliers"',
      'router.post("/vendor-pool", requireAuth, supplierManagementGate, supplierLimitGate',
      'router.patch("/vendor-pool/:id/tier", requireAuth, supplierManagementGate',
      'router.patch("/vendor-pool/:id/status", requireAuth, supplierManagementGate',
      'router.delete("/vendor-pool/:id", requireAuth, supplierManagementGate'
    ]);
  });

  it("rate-card mutations require rate_card_management", () => {
    expectTokens("api/routes/rateCards.js", [
      'requireOrgFeature("rate_card_management"',
      'router.post("/rate-cards", requireAuth, featureGate',
      'router.patch("/rate-cards/:id", requireAuth, featureGate',
      'router.post("/rate-cards/:id/activate", requireAuth, featureGate',
      'router.post("/rate-cards/:id/archive", requireAuth, featureGate'
    ]);
  });

  it("integrations mutations require integrations feature", () => {
    expectTokens("api/routes/integrations.js", [
      'requireOrgFeature("integrations"',
      'router.post("/integrations", requireAuth, featureGate',
      'router.patch("/integrations/:id", requireAuth, featureGate',
      'router.delete("/integrations/:id", requireAuth, featureGate',
      'router.post("/integrations/:id/test", requireAuth, featureGate',
      'router.post("/integrations/retry-failed", requireAuth, featureGate'
    ]);
  });

  it("multi-org/users/sites routes enforce org feature and slot/user/site quotas", () => {
    expectTokens("api/routes/organizations.js", [
      'requireOrgFeature("org_settings"',
      'requireOrgLimit("users"',
      'requireOrgLimit("sites"',
      'requireOrgLimit("multi_org_slots"',
      'router.post("/organizations", requireAuth, parentOrgBoundary, whenParentOrg(orgSettingsGate), whenParentOrg(multiOrgSlotsGate)',
      'router.post("/organizations/:id/locations", requireAuth, sameOrgParam, sitesLimitGate',
      'router.post("/organizations/:id/members", requireAuth, sameOrgParam, usersLimitGate'
    ]);
  });

  it("listing/capacity creation enforces listing limits", () => {
    expectTokens("api/routes/listings.js", [
      'requireOrgLimit("listings"',
      'router.post("/listings", requireAuth, legacyAccess, listingsLimitGate'
    ]);
    expectTokens("api/routes/capacityExchange.js", [
      'requireOrgLimit("listings"',
      'router.post("/capacity-exchange/entries", requireAuth, ceBasic, listingsLimitGate',
      'router.post("/capacity-exchange/entries/:id/activate", requireAuth, ceBasic, listingsLimitGate',
      'router.post("/capacity-exchange/entries/:id/reactivate", requireAuth, ceBasic, listingsLimitGate'
    ]);
  });

  it("spend analytics remains feature-gated even though it is read/reporting only today", () => {
    expectTokens("api/routes/spendAnalytics.js", [
      'requireOrgFeature("spend_analytics"',
      'router.get("/spend-analytics/summary", requireAuth, featureGate'
    ]);
  });

  it("POST /org/locations hat sitesLimitGate im orgControlCenter", () => {
    expectTokens("routes/orgControlCenter.js", [
      'requireOrgLimit("sites"',
      'sitesLimitGate',
      'router.post("/org/locations", requireAuth, ensureOrg, sitesLimitGate'
    ]);
  });
});
