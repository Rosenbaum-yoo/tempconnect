/**
 * entitlementService + entitlementGuard tests.
 *
 * Verifiziert:
 *   - Plan -> Limits + Features Mapping
 *   - Pilot-Override (DEMO + pilot_status='active' -> INDIVIDUELL)
 *   - subscription_status -> active/canceling/canceled/past_due
 *   - canUseFeature: erlaubt / FEATURE_NOT_ENABLED / FEATURE_PENDING_APPROVAL / SUBSCRIPTION_INACTIVE
 *   - assertFeatureAccess wirft Error mit code
 *   - middleware: requireOrgFeature (200/403/409), requireActiveSubscription, requireOrgLimit (429), requireSameOrg (FORBIDDEN_CROSS_ORG)
 *
 * Run: node --test --test-force-exit api/test/entitlementService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as ent from "../services/entitlementService.js";
import {
  requireActiveSubscription,
  requireOrgFeature,
  requireOrgLimit,
  requireSameOrg
} from "../middleware/entitlementGuard.js";

// Disable dev-env feature gate bypass so these tests verify real plan-gating logic.
process.env.FEATURE_GATE_BYPASS = "false";

// ── Mock-Pool: liefert vordefinierte Antworten in Reihenfolge ──

function sequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (idx >= responses.length) {
        throw new Error(`Unexpected query #${idx + 1}: ${String(sql).slice(0, 80)}`);
      }
      const r = responses[idx++];
      if (r instanceof Error) throw r;
      return r;
    }
  };
}

// Helper: ein Snapshot-Pool fuer plan=PRO, active subscription, owner present.
function poolForOrg({ plan = "PRO", pilotStatus = null, billingMode = null,
                      subscription = { status: "active" }, ownerId = "user-owner",
                      activeAddons = [], activeAddonRows = null, pendingRequests = [],
                      orgOverrides = {} } = {}) {
  return sequencePool(
    // 1. orgRow
    { rows: [{ id: "org-1", name: "ACME", type: "company", plan, pilot_status: pilotStatus,
               feature_bundle: pilotStatus === "active" ? "enterprise_full" : "standard",
               account_type: "live", individual_tier_auto: null, employee_count_approx: null,
               billing_mode: billingMode, customer_stage: pilotStatus === "active" ? "pilot" : "regular",
               pilot_started_at: null, pilot_ended_at: null, converted_at: null,
               parent_org_id: null, is_active: true,
               custom_limit_users: null, custom_limit_sites: null, custom_limit_listings: null,
               custom_limit_suppliers: null, custom_limit_multi_org_slots: null,
               ...orgOverrides }] },
    // 2. activeAddons -> SELECT desired_addons
    { rows: activeAddonRows || (activeAddons.length ? [{ desired_addons: activeAddons }] : []) },
    // 3. pendingRequests
    { rows: pendingRequests },
    // 4. ownerUser (loadOwnerSubscription -> loadOwnerUser)
    ownerId ? { rows: [{ id: ownerId, email: "owner@acme.de" }] } : { rows: [] },
    // 5. ownerSubscription
    subscription ? { rows: [subscription] } : { rows: [] }
  );
}

// ── getOrganizationEntitlements ────────────────────────────────

describe("getOrganizationEntitlements", () => {
  it("DEMO snapshot wenn keine orgId", async () => {
    const pool = sequencePool();
    const snap = await ent.getOrganizationEntitlements(pool, null);
    assert.equal(snap.effective_plan, "DEMO");
    assert.equal(snap.subscription.active, false);
    assert.equal(snap.reason, "NO_ORG_CONTEXT");
  });

  it("PRO active subscription mit korrekten Features + Limits", async () => {
    const pool = poolForOrg({ plan: "PRO" });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.effective_plan, "PRO");
    assert.equal(snap.subscription.active, true);
    assert.equal(snap.subscription.status, "active");
    assert.equal(snap.features.advanced_matching.allowed, true);
    assert.equal(snap.features.assignments.allowed, false); // assignments nur fuer INDIVIDUELL
    assert.equal(snap.limits.plan_max_requests_send, -1);  // unlimited
    assert.equal(snap.limits.plan_max_listings, -1);
  });

  it("DEMO + Pilot-Override hebt auf INDIVIDUELL + setzt Pilot=true", async () => {
    const pool = poolForOrg({ plan: "DEMO", pilotStatus: "active" });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.effective_plan, "INDIVIDUELL");
    assert.equal(snap.pilot.active, true);
    assert.equal(snap.subscription.status, "pilot");
    assert.equal(snap.feature_bundle, "enterprise_full");
    assert.equal(snap.features.assignments.allowed, true);
    assert.equal(snap.features.compliance.allowed, true);
  });

  it("canceled subscription -> active=false", async () => {
    const pool = poolForOrg({ plan: "PLUS", subscription: { status: "canceled" } });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.subscription.active, false);
    assert.equal(snap.subscription.status, "canceled");
  });

  it("past_due ohne current_period_end -> Hard-Lock (active=false)", async () => {
    const pool = poolForOrg({ plan: "PLUS", subscription: { status: "past_due" } });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.subscription.active, false);
    assert.equal(snap.subscription.status, "past_due");
  });

  it("past_due + current_period_end gestern -> Soft-Lock (active=true, past_due_grace, WAVE_09)", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString(); // -1 Tag
    const pool = poolForOrg({ plan: "PLUS", subscription: { status: "past_due", current_period_end: yesterday } });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    // Innerhalb Kulanzfrist (14 Tage): Zugang aktiv, Warnstatus gesetzt
    assert.equal(snap.subscription.active, true, "Kulanzfrist: erwartet active=true");
    assert.equal(snap.subscription.status, "past_due_grace");
    assert.ok(snap.subscription.reason && snap.subscription.reason.includes("aktiv bis"), "reason soll Cutoff enthalten");
  });

  it("past_due + current_period_end vor 15 Tagen -> Hard-Lock (active=false, WAVE_09)", async () => {
    const longAgo = new Date(Date.now() - 15 * 86400000).toISOString(); // -15 Tage
    const pool = poolForOrg({ plan: "PLUS", subscription: { status: "past_due", current_period_end: longAgo } });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    // Kulanzfrist abgelaufen: Hard-Lock
    assert.equal(snap.subscription.active, false, "Kulanzfrist abgelaufen: erwartet active=false");
    assert.equal(snap.subscription.status, "past_due");
  });

  it("INDIVIDUELL + billing_mode='individual_contract' -> aktiv ohne Subscription", async () => {
    const pool = poolForOrg({ plan: "INDIVIDUELL", billingMode: "individual_contract", subscription: null, ownerId: "user-1" });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.effective_plan, "INDIVIDUELL");
    assert.equal(snap.subscription.active, true);
    assert.equal(snap.subscription.status, "individual_contract");
    assert.equal(snap.limits.multi_org, true);
    assert.equal(snap.limits.seats_included, 50);
  });

  it("liest aktive Add-ons aus org_active_addons und schaltet zugeordnete Features frei", async () => {
    const pool = poolForOrg({
      plan: "BASIS",
      activeAddonRows: [{
        key: "api",
        name: "API & Webhooks",
        price_cents: 9900,
        interval: "month",
        source: "staff_activation",
        source_request_id: "req-1",
        activated_at: "2026-04-01T00:00:00.000Z"
      }]
    });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.features.integrations.allowed, true);
    assert.equal(snap.features.integrations.via_addon, "api");
    assert.deepEqual(snap.active_addons.map((a) => a.key), ["api"]);
    assert.equal(snap.active_addons[0].source, "staff_activation");
  });

  it("laesst Add-on-Feature ohne aktiven Add-on-Eintrag gesperrt", async () => {
    const pool = poolForOrg({ plan: "BASIS" });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.features.integrations.allowed, false);
    assert.deepEqual(snap.active_addons, []);
  });

  it("setzt echte Multi-Org-Slot-Anzahl ueber multitenant Add-on und Custom-Limit", async () => {
    const pool = poolForOrg({
      plan: "INDIVIDUELL",
      activeAddonRows: [{ key: "multitenant", name: "Multi-Org", source: "staff_activation" }],
      orgOverrides: { custom_limit_multi_org_slots: 9 }
    });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.limits.plan_max_multi_org_slots, 9);
    assert.equal(snap.features.org_settings.allowed, true);
    assert.equal(snap.features.departments.allowed, true);
    assert.equal(snap.features.multi_location.allowed, true);
  });
});

// ── Betreiber-Kill-Switch (Suspension, Mig 127) ────────────────
// access_suspended_at hat hoechste Prioritaet in computeSubscriptionStatus:
// es ueberschreibt pilot, individual_contract und jeden subscription.status.
// Soft-Lock: active=false (Features aus), Login/Session unberuehrt.
describe("Org-Access-Suspension (Kill-Switch)", () => {
  it("gesperrte Org -> active=false, status='suspended', Grund durchgereicht", async () => {
    const pool = poolForOrg({ plan: "PRO", orgOverrides: {
      access_suspended_at: "2026-06-05T00:00:00Z",
      access_suspended_reason: "Nichtzahlung Rechnung #123"
    } });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.subscription.active, false);
    assert.equal(snap.subscription.status, "suspended");
    assert.equal(snap.subscription.pilot, false);
    assert.equal(snap.subscription.reason, "Nichtzahlung Rechnung #123");
  });

  it("Suspension ueberschreibt aktiven Pilot (hoechste Prioritaet)", async () => {
    const pool = poolForOrg({ plan: "DEMO", pilotStatus: "active", orgOverrides: {
      access_suspended_at: "2026-06-05T00:00:00Z"
    } });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.subscription.status, "suspended", "Pilot darf Sperre nicht aushebeln");
    assert.equal(snap.subscription.active, false);
    assert.equal(snap.subscription.pilot, false);
  });

  it("Suspension ueberschreibt individual_contract", async () => {
    const pool = poolForOrg({ plan: "INDIVIDUELL", billingMode: "individual_contract",
      subscription: null, ownerId: "user-1", orgOverrides: {
        access_suspended_at: "2026-06-05T00:00:00Z"
      } });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.equal(snap.subscription.status, "suspended");
    assert.equal(snap.subscription.active, false);
  });

  it("Default-Grund wenn kein expliziter reason gesetzt", async () => {
    const pool = poolForOrg({ plan: "PRO", orgOverrides: {
      access_suspended_at: "2026-06-05T00:00:00Z", access_suspended_reason: null
    } });
    const snap = await ent.getOrganizationEntitlements(pool, "org-1");
    assert.ok(/gesperrt/i.test(snap.subscription.reason), "Default-Sperr-Hinweis erwartet");
  });

  it("canUseFeature auf gesperrter Org -> SUBSCRIPTION_INACTIVE (Feature trotz Plan aus)", async () => {
    const pool = poolForOrg({ plan: "PRO", orgOverrides: {
      access_suspended_at: "2026-06-05T00:00:00Z"
    } });
    const r = await ent.canUseFeature(pool, "org-1", "advanced_matching");
    assert.equal(r.allowed, false);
    assert.equal(r.code, "SUBSCRIPTION_INACTIVE");
  });
});

describe("getUsageAgainstLimits", () => {
  it("liefert harte Quota-Metriken fuer User, Sites, Listings, Supplier und Multi-Org-Slots", async () => {
    const orgRow = {
      id: "org-1",
      name: "ACME",
      type: "company",
      plan: "BASIS",
      pilot_status: null,
      feature_bundle: "standard",
      account_type: "live",
      individual_tier_auto: null,
      employee_count_approx: null,
      billing_mode: null,
      customer_stage: "regular",
      pilot_started_at: null,
      pilot_ended_at: null,
      converted_at: null,
      parent_org_id: null,
      is_active: true,
      custom_limit_users: 10,
      custom_limit_sites: 3,
      custom_limit_listings: 5,
      custom_limit_suppliers: 2,
      custom_limit_multi_org_slots: 4
    };
    const pool = sequencePool(
      { rows: [orgRow] },
      { rows: [] },
      { rows: [{ cnt: 11 }] },
      { rows: [{ cnt: 4 }] },
      { rows: [{ cnt: 6 }] },
      { rows: [{ cnt: 3 }] },
      { rows: [{ cnt: 5 }] },
      { rows: [{ id: "owner-1" }] },
      { rows: [{ cnt: 4 }] },
      { rows: [{ cnt: 5 }] }
    );

    const usage = await ent.getUsageAgainstLimits(pool, "org-1");

    assert.deepEqual(usage.users, { current: 11, limit: 10, allowed: false });
    assert.deepEqual(usage.sites, { current: 4, limit: 3, allowed: false });
    assert.deepEqual(usage.listings, { current: 6, limit: 5, allowed: false });
    assert.deepEqual(usage.suppliers, { current: 3, limit: 2, allowed: false });
    assert.deepEqual(usage.multi_org_slots, { current: 5, limit: 4, allowed: false });
    assert.deepEqual(usage.requests_send, { current: 4, limit: 5, allowed: true });
    assert.deepEqual(usage.requests_receive, { current: 5, limit: 5, allowed: false });
  });
});
// ── canUseFeature / assertFeatureAccess ────────────────────────

describe("canUseFeature", () => {
  it("PRO + advanced_matching -> allowed", async () => {
    const pool = poolForOrg({ plan: "PRO" });
    const r = await ent.canUseFeature(pool, "org-1", "advanced_matching");
    assert.equal(r.allowed, true);
    assert.equal(r.code, "OK");
  });

  it("BASIS + advanced_matching -> FEATURE_NOT_ENABLED", async () => {
    const pool = poolForOrg({ plan: "BASIS" });
    const r = await ent.canUseFeature(pool, "org-1", "advanced_matching");
    assert.equal(r.allowed, false);
    assert.equal(r.code, "FEATURE_NOT_ENABLED");
  });

  it("BASIS + offene Anfrage mit desired_features=[advanced_matching] -> FEATURE_PENDING_APPROVAL", async () => {
    const pool = poolForOrg({
      plan: "BASIS",
      pendingRequests: [{ id: "req-1", desired_features: ["advanced_matching"], status: "submitted" }]
    });
    const r = await ent.canUseFeature(pool, "org-1", "advanced_matching");
    assert.equal(r.allowed, false);
    assert.equal(r.code, "FEATURE_PENDING_APPROVAL");
  });

  it("canceled subscription -> SUBSCRIPTION_INACTIVE auch fuer Feature im Plan", async () => {
    const pool = poolForOrg({ plan: "PRO", subscription: { status: "canceled" } });
    const r = await ent.canUseFeature(pool, "org-1", "advanced_matching");
    assert.equal(r.allowed, false);
    assert.equal(r.code, "SUBSCRIPTION_INACTIVE");
  });

  it("FEATURE_KEY_REQUIRED bei leerem key", async () => {
    const pool = sequencePool();
    const r = await ent.canUseFeature(pool, "org-1", "");
    assert.equal(r.allowed, false);
    assert.equal(r.code, "FEATURE_KEY_REQUIRED");
  });
});

describe("assertFeatureAccess", () => {
  it("wirft Error mit code FEATURE_NOT_ENABLED", async () => {
    const pool = poolForOrg({ plan: "BASIS" });
    await assert.rejects(
      () => ent.assertFeatureAccess(pool, "org-1", "advanced_matching"),
      (e) => { assert.equal(e.code, "FEATURE_NOT_ENABLED"); return true; }
    );
  });

  it("returnt Check wenn allowed", async () => {
    const pool = poolForOrg({ plan: "PRO" });
    const r = await ent.assertFeatureAccess(pool, "org-1", "advanced_matching");
    assert.equal(r.allowed, true);
  });
});

// ── Middleware ─────────────────────────────────────────────────

function mockReq(extras = {}) {
  return {
    session: { userId: "u-1" },
    orgId: "org-1",
    ...extras
  };
}
function mockRes() {
  return {
    _status: 200, _json: null,
    status(c) { this._status = c; return this; },
    json(d) { this._json = d; return this; }
  };
}

describe("requireOrgFeature middleware", () => {
  it("403 SUBSCRIPTION_INACTIVE wenn canceled", async () => {
    const pool = poolForOrg({ plan: "PRO", subscription: { status: "canceled" } });
    const guard = requireOrgFeature("advanced_matching", { pool });
    const req = mockReq();
    const res = mockRes();
    let nextCalled = false;
    await guard(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "SUBSCRIPTION_INACTIVE");
  });

  it("403 FEATURE_NOT_ENABLED wenn Plan zu niedrig", async () => {
    // Doppel-Pool: getOrganizationEntitlements + canUseFeature laden beide den orgRow.
    // Wir mocken einfach pool.query so, dass es bei jedem Aufruf der Reihe folgt:
    // 5 Queries fuer ent + 5 Queries fuer canUseFeature.
    const baseRow = { id: "org-1", name: "ACME", type: "company", plan: "BASIS", pilot_status: null,
      feature_bundle: "standard", account_type: "live", individual_tier_auto: null,
      employee_count_approx: null, billing_mode: null, customer_stage: "regular",
      pilot_started_at: null, pilot_ended_at: null, converted_at: null };
    const sub = { status: "active" };
    const pool = sequencePool(
      // Erste Run fuer requireOrgFeature -> getOrganizationEntitlements
      { rows: [baseRow] }, { rows: [] }, { rows: [] }, { rows: [{ id: "owner" }] }, { rows: [sub] },
      // Zweiter Run fuer canUseFeature -> getOrganizationEntitlements
      { rows: [baseRow] }, { rows: [] }, { rows: [] }, { rows: [{ id: "owner" }] }, { rows: [sub] }
    );
    const guard = requireOrgFeature("advanced_matching", { pool });
    const req = mockReq();
    const res = mockRes();
    let nextCalled = false;
    await guard(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "FEATURE_NOT_ENABLED");
    assert.equal(res._json.error.plan, "BASIS");
  });

  it("401 wenn nicht eingeloggt", async () => {
    const guard = requireOrgFeature("advanced_matching", { pool: sequencePool() });
    const req = { session: null, orgId: "org-1" };
    const res = mockRes();
    await guard(req, res, () => {});
    assert.equal(res._status, 401);
  });

  it("403 ORG_REQUIRED ohne orgId", async () => {
    const guard = requireOrgFeature("advanced_matching", { pool: sequencePool() });
    const req = { session: { userId: "u-1" }, orgId: null };
    const res = mockRes();
    await guard(req, res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "ORG_REQUIRED");
  });
});

describe("requireActiveSubscription middleware", () => {
  it("ruft next() bei active=true", async () => {
    const pool = poolForOrg({ plan: "PRO" });
    const guard = requireActiveSubscription({ pool });
    let called = false;
    const req = mockReq();
    const res = mockRes();
    await guard(req, res, () => { called = true; });
    assert.equal(called, true);
  });

  it("403 SUBSCRIPTION_INACTIVE bei past_due", async () => {
    const pool = poolForOrg({ plan: "PRO", subscription: { status: "past_due" } });
    const guard = requireActiveSubscription({ pool });
    const res = mockRes();
    await guard(mockReq(), res, () => {});
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "SUBSCRIPTION_INACTIVE");
  });
});

describe("requireSameOrg middleware", () => {
  it("FORBIDDEN_CROSS_ORG bei abweichender orgId", () => {
    const guard = requireSameOrg((req) => req.params.orgId);
    const res = mockRes();
    let called = false;
    guard({ session: { userId: "u-1" }, orgId: "org-A", params: { orgId: "org-B" } }, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res._status, 403);
    assert.equal(res._json.error.code, "FORBIDDEN_CROSS_ORG");
  });

  it("ruft next() bei gleicher orgId", () => {
    const guard = requireSameOrg((req) => req.params.orgId);
    let called = false;
    guard({ session: { userId: "u-1" }, orgId: "org-A", params: { orgId: "org-A" } }, mockRes(), () => { called = true; });
    assert.equal(called, true);
  });
});

describe("isFeaturePendingApproval", () => {
  it("true wenn Anfrage mit desired_features-Match offen ist", async () => {
    const pool = sequencePool({ rows: [{}] });
    const r = await ent.isFeaturePendingApproval(pool, "org-1", "advanced_matching");
    assert.equal(r, true);
  });
  it("false bei leerer Antwort", async () => {
    const pool = sequencePool({ rows: [] });
    const r = await ent.isFeaturePendingApproval(pool, "org-1", "advanced_matching");
    assert.equal(r, false);
  });
  it("false ohne org/feature", async () => {
    const pool = sequencePool();
    assert.equal(await ent.isFeaturePendingApproval(pool, null, "x"), false);
    assert.equal(await ent.isFeaturePendingApproval(pool, "org", null), false);
  });
});
