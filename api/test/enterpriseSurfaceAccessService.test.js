import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveEnterpriseSurfaceAccess } from "../services/enterpriseSurfaceAccessService.js";

describe("enterpriseSurfaceAccessService", () => {
  it("grants full buyer and governance surfaces to a PRO company owner", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      role: "company",
      orgType: "company",
      orgRole: "owner"
    });

    assert.deepEqual(
      {
        vendorPool: access.vendor_pool.mode,
        scorecard: access.supplier_scorecard.mode,
        spend: access.spend_analytics.mode,
        executive: access.executive_dashboard.mode,
        compliance: access.compliance_overview.mode,
        governance: access.data_governance.mode,
        rateCards: access.rate_cards.mode
      },
      {
        vendorPool: "full",
        scorecard: "full",
        spend: "full",
        executive: "full",
        compliance: "full",
        governance: "full",
        rateCards: "full"
      }
    );
    assert.equal(access.spend_analytics.canExport, true);
    assert.equal(access.compliance_overview.canUpload, true);
    assert.equal(access.data_governance.canAnonymize, true);
  });

  it("keeps finance users read-only on procurement surfaces but allows executive spend access", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      role: "company",
      orgType: "company",
      orgRole: "finance"
    });

    assert.equal(access.vendor_pool.mode, "read_only");
    assert.equal(access.vendor_pool.canManage, false);
    assert.equal(access.supplier_scorecard.mode, "read_only");
    assert.equal(access.supplier_scorecard.canAnnotate, false);
    assert.equal(access.spend_analytics.mode, "full");
    assert.equal(access.spend_analytics.canWrite, false);
    assert.equal(access.rate_cards.mode, "full");
    assert.equal(access.compliance_overview.mode, "read_only");
    assert.equal(access.data_governance.mode, "role_locked");
  });

  it("models supplier-user compliance access as upload-only soft lock", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      role: "company",
      orgType: "company",
      orgRole: "supplier_user"
    });

    assert.equal(access.compliance_overview.mode, "role_locked");
    assert.equal(access.compliance_overview.canRead, false);
    assert.equal(access.compliance_overview.canUpload, true);
    assert.equal(access.compliance_overview.canVerify, false);
    assert.equal(access.compliance_overview.canDelete, false);
  });

  it("soft-locks buyer-only control surfaces for agency organizations while leaving compliance role-governed", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      role: "agency",
      orgType: "agency",
      orgRole: "owner"
    });

    assert.equal(access.vendor_pool.mode, "org_locked");
    assert.equal(access.supplier_scorecard.mode, "org_locked");
    assert.equal(access.spend_analytics.mode, "org_locked");
    assert.equal(access.executive_dashboard.mode, "org_locked");
    assert.equal(access.rate_cards.mode, "org_locked");
    assert.equal(access.compliance_overview.mode, "full");
  });

  it("plan-locks spend, governance, and rate cards below PRO even for company owners", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "DEMO",
      role: "company",
      orgType: "company",
      orgRole: "owner"
    });

    assert.equal(access.vendor_pool.mode, "full");
    assert.equal(access.supplier_scorecard.mode, "full");
    assert.equal(access.spend_analytics.mode, "plan_locked");
    assert.equal(access.data_governance.mode, "plan_locked");
    assert.equal(access.rate_cards.mode, "plan_locked");
  });
});
