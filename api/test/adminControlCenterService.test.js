import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveAdminAccess,
  resolveSsoCardAvailability,
  buildAdminControlCenter
} from "../services/adminControlCenterService.js";

function makeSummaryPool() {
  return {
    async query(sql, params) {
      if (sql.includes("SELECT COUNT(*)::int AS total_users")) {
        return { rows: [{ total_users: 12, new_users_30d: 3 }] };
      }
      if (sql.includes("SELECT COUNT(*)::int AS total_orgs")) {
        return { rows: [{ total_orgs: 5 }] };
      }
      if (sql.includes("SELECT COUNT(*)::int AS active_capacity_posts")) {
        return { rows: [{ active_capacity_posts: 7 }] };
      }
      if (sql.includes("SELECT COUNT(*)::int AS requisition_backlog")) {
        return { rows: [{ requisition_backlog: 9 }] };
      }
      if (sql.includes("SELECT COUNT(*)::int AS active_offers")) {
        return { rows: [{ active_offers: 4 }] };
      }
      if (sql.includes("COUNT(DISTINCT actor_id)::int AS audit_actors_30d")) {
        return { rows: [{ audit_events_30d: 44, audit_actors_30d: 8 }] };
      }
      if (sql.includes("SELECT COUNT(*)::int AS configured_sso_orgs")) {
        return { rows: [{ configured_sso_orgs: 2 }] };
      }
      if (sql.includes("SELECT * FROM org_sso_config WHERE org_id = $1")) {
        return { rows: params && params[0] === "org-1" ? [{ org_id: "org-1", is_active: true }] : [] };
      }
      throw new Error("Unexpected SQL in test pool: " + sql);
    }
  };
}

describe("adminControlCenterService — resolveAdminAccess", () => {
  it("treats owner and admin roles as admin workspace access", () => {
    const access = resolveAdminAccess(
      { org_role: "owner", org_id: "org-1", org_name: "Acme GmbH" },
      { orgRole: "owner", orgId: "org-1", orgName: "Acme GmbH" }
    );
    assert.equal(access.is_admin, true);
    assert.equal(access.is_org_admin, true);
    assert.equal(access.can_manage_org_settings, true);
    assert.equal(access.access_level, "owner");
  });

  it("keeps non-admin members in restricted mode", () => {
    const access = resolveAdminAccess(
      { org_role: "member", org_id: "org-2", org_name: "Supplier Pool" },
      { orgRole: "member", orgId: "org-2", orgName: "Supplier Pool" }
    );
    assert.equal(access.is_admin, false);
    assert.equal(access.can_view_workspace, false);
    assert.equal(access.access_level, "restricted");
  });
});

describe("adminControlCenterService — resolveSsoCardAvailability", () => {
  it("marks low-tier plans as enterprise-only even for org admins", () => {
    const result = resolveSsoCardAvailability({
      viewer: { plan: "BASIS" },
      access: { has_org: true, can_manage_org_settings: true },
      configured: false,
      mode: "saml"
    });
    assert.equal(result.state, "enterprise_only");
    assert.equal(result.code, "PLAN_REQUIRED");
  });

  it("soft-locks SSO while runtime is still in stub mode", () => {
    const result = resolveSsoCardAvailability({
      viewer: { plan: "PRO" },
      access: { has_org: true, can_manage_org_settings: true },
      configured: true,
      mode: "stub"
    });
    assert.equal(result.state, "restricted");
    assert.equal(result.code, "SSO_STUB_MODE");
  });
});

describe("adminControlCenterService — buildAdminControlCenter", () => {
  it("builds active primary cards and summary data for admin viewers", async () => {
    const pool = makeSummaryPool();
    const data = await buildAdminControlCenter(pool, {
      id: "user-1",
      email: "owner@acme.de",
      plan: "PRO",
      plan_display_label: "PRO",
      org_id: "org-1",
      org_name: "Acme GmbH",
      org_role: "owner"
    }, {
      orgId: "org-1",
      orgName: "Acme GmbH",
      orgRole: "owner"
    });

    assert.equal(data.cards.users_orgs.state, "active");
    assert.equal(data.cards.audit_log.state, "active");
    assert.equal(data.cards.platform_metrics.state, "active");
    assert.equal(data.cards.workflows.state, "planned");
    assert.equal(data.summary.requisition_backlog, 9);
    assert.equal(data.summary.audit_events_30d, 44);
    assert.ok(data.context.access.allowed_tabs.includes("metrics"));
    assert.equal(data.cards.users_orgs.summary[0].value, 12);
  });

  it("keeps non-admin viewers in soft-locked hub mode without workspace tabs", async () => {
    const pool = makeSummaryPool();
    const data = await buildAdminControlCenter(pool, {
      id: "user-2",
      email: "member@acme.de",
      plan: "BASIS",
      plan_display_label: "Basis",
      org_id: "org-2",
      org_name: "Acme GmbH",
      org_role: "member"
    }, {
      orgId: "org-2",
      orgName: "Acme GmbH",
      orgRole: "member"
    });

    assert.equal(data.cards.users_orgs.state, "admin_only");
    assert.equal(data.cards.audit_log.state, "admin_only");
    assert.equal(data.cards.platform_metrics.state, "restricted");
    assert.equal(data.context.access.allowed_tabs.length, 0);
    assert.equal(data.cards.users_orgs.primary_action.href, "/public/organization.html?tab=members");
  });
});
