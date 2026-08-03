/**
 * Comprehensive behavior tests for services/userService.js
 *
 * Strategy:
 *  - A pattern-routing "trackingPool" records every {sql, params} and dispatches
 *    a response based on SQL substrings. This is robust for multi-helper
 *    functions (getUserAndPlan, exportUserData) where the order of
 *    queries is an implementation detail.
 *  - withTransaction(pool, fn) is exercised for real against the mock pool
 *    (connect() returns {query, release}); BEGIN/COMMIT/ROLLBACK are routed too.
 *  - rbacService / enterpriseSurfaceAccessService / planFeatures are pure and
 *    run for real — we assert on their observable effect (capabilities/plan).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as svc from "../services/userService.js";

/**
 * Build a pool that routes queries by SQL-substring handlers.
 * handlers: array of { match: (sql) => bool, respond: (sql, params) => result }
 * Default response: { rows: [], rowCount: 0 }.
 * Records all non-tx calls in pool.calls.
 */
function trackingPool(handlers = []) {
  const calls = [];
  const txRe = /^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i;
  const queryFn = async (sql, params) => {
    if (typeof sql === "string" && txRe.test(sql)) return { rows: [], rowCount: 0 };
    calls.push({ sql, params });
    for (const h of handlers) {
      if (h.match(sql)) {
        const r = typeof h.respond === "function" ? h.respond(sql, params) : h.respond;
        if (r instanceof Error) throw r;
        return r;
      }
    }
    return { rows: [], rowCount: 0 };
  };
  const pool = {
    calls,
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} })
  };
  return pool;
}

const has = (needle) => (sql) => typeof sql === "string" && sql.includes(needle);

/* ──────────────────────────── PLAN_LIMITS ──────────────────────────── */

describe("PLAN_LIMITS", () => {
  it("exposes canonical plans with expected limit shape", () => {
    assert.equal(svc.PLAN_LIMITS.DEMO.price, 0);
    assert.equal(svc.PLAN_LIMITS.BASIS.requests_send, 5);
    assert.equal(svc.PLAN_LIMITS.PRO.requests_send, -1);
    assert.equal(svc.PLAN_LIMITS.INDIVIDUELL.sla_level, "ENTERPRISE");
  });

  it("aliases ENTERPRISE/INDIVIDUAL/FREE to canonical limit objects", () => {
    assert.equal(svc.PLAN_LIMITS.ENTERPRISE, svc.PLAN_LIMITS.INDIVIDUELL);
    assert.equal(svc.PLAN_LIMITS.INDIVIDUAL, svc.PLAN_LIMITS.INDIVIDUELL);
    assert.equal(svc.PLAN_LIMITS.FREE, svc.PLAN_LIMITS.DEMO);
  });
});

/* ──────────────────────── getLatestSubscription ────────────────────── */

describe("getLatestSubscription", () => {
  it("returns the latest subscription row", async () => {
    const pool = trackingPool([
      { match: has("FROM subscriptions"), respond: { rows: [{ id: "sub-1", plan: "PRO", status: "active" }] } }
    ]);
    const sub = await svc.getLatestSubscription(pool, "u-1");
    assert.equal(sub.id, "sub-1");
    assert.equal(sub.plan, "PRO");
    assert.deepEqual(pool.calls[0].params, ["u-1"]);
  });

  it("returns null when no subscription exists", async () => {
    const pool = trackingPool([{ match: has("FROM subscriptions"), respond: { rows: [] } }]);
    assert.equal(await svc.getLatestSubscription(pool, "u-1"), null);
  });
});

/* ─────────────────────── schedulePlanCancellation ──────────────────── */

describe("schedulePlanCancellation", () => {
  it("returns null when there is no subscription", async () => {
    const pool = trackingPool([{ match: has("FROM subscriptions"), respond: { rows: [] } }]);
    const result = await svc.schedulePlanCancellation(pool, { userId: "u-1" });
    assert.equal(result, null);
  });

  it("is a no-op (returns existing) when already canceling", async () => {
    const sub = { id: "s1", status: "canceling" };
    const pool = trackingPool([{ match: has("FROM subscriptions"), respond: { rows: [sub] } }]);
    const result = await svc.schedulePlanCancellation(pool, { userId: "u-1" });
    assert.equal(result, sub);
    // no UPDATE should have been issued
    assert.equal(pool.calls.some((c) => has("UPDATE subscriptions")(c.sql)), false);
  });

  it("is a no-op (returns existing) when already canceled", async () => {
    const sub = { id: "s1", status: "canceled" };
    const pool = trackingPool([{ match: has("FROM subscriptions"), respond: { rows: [sub] } }]);
    const result = await svc.schedulePlanCancellation(pool, { userId: "u-1" });
    assert.equal(result, sub);
  });

  it("transitions active -> canceling and passes actor/source/reason params", async () => {
    const active = { id: "s1", status: "active" };
    const updated = { id: "s1", status: "canceling", cancel_reason: "too pricey" };
    const pool = trackingPool([
      { match: has("FROM subscriptions"), respond: { rows: [active] } },
      { match: has("UPDATE subscriptions"), respond: { rows: [updated] } }
    ]);
    const result = await svc.schedulePlanCancellation(pool, {
      userId: "u-1", actorUserId: "actor-9", source: "staff", reason: "too pricey"
    });
    assert.equal(result.status, "canceling");
    const upd = pool.calls.find((c) => has("UPDATE subscriptions")(c.sql));
    assert.deepEqual(upd.params, ["s1", "actor-9", "staff", "too pricey"]);
  });

  it("uses default source 'self_service' and null actor/reason", async () => {
    const pool = trackingPool([
      { match: has("FROM subscriptions"), respond: { rows: [{ id: "s1", status: "active" }] } },
      { match: has("UPDATE subscriptions"), respond: { rows: [{ id: "s1", status: "canceling" }] } }
    ]);
    await svc.schedulePlanCancellation(pool, { userId: "u-1" });
    const upd = pool.calls.find((c) => has("UPDATE subscriptions")(c.sql));
    assert.deepEqual(upd.params, ["s1", null, "self_service", null]);
  });

  it("falls back to the loaded subscription when UPDATE returns no row", async () => {
    const active = { id: "s1", status: "active" };
    const pool = trackingPool([
      { match: has("FROM subscriptions"), respond: { rows: [active] } },
      { match: has("UPDATE subscriptions"), respond: { rows: [] } }
    ]);
    const result = await svc.schedulePlanCancellation(pool, { userId: "u-1" });
    assert.equal(result, active);
  });
});

/* ─────────────────────── cancelPlanImmediately ─────────────────────── */

describe("cancelPlanImmediately", () => {
  it("returns null when no subscription", async () => {
    const pool = trackingPool([{ match: has("FROM subscriptions"), respond: { rows: [] } }]);
    assert.equal(await svc.cancelPlanImmediately(pool, { userId: "u-1" }), null);
  });

  it("cancels current sub, inserts DEMO sub, returns original subscription", async () => {
    const sub = { id: "s1", status: "active", plan: "PRO" };
    const pool = trackingPool([
      { match: has("FROM subscriptions"), respond: { rows: [sub] } }
    ]);
    const result = await svc.cancelPlanImmediately(pool, {
      userId: "u-1", actorUserId: "a-1", source: "self_service", reason: "done"
    });
    assert.equal(result, sub);

    const upd = pool.calls.find((c) => has("UPDATE subscriptions")(c.sql));
    assert.equal(upd.params[0], "s1");
    assert.deepEqual(upd.params.slice(1), ["a-1", "self_service", "done"]);

    const ins = pool.calls.find((c) => has("INSERT INTO subscriptions")(c.sql));
    assert.ok(ins, "should insert a replacement subscription");
    assert.deepEqual(ins.params, ["u-1", "DEMO", "active"]);

    // no org update when orgId not supplied
    assert.equal(pool.calls.some((c) => has("UPDATE organizations")(c.sql)), false);
  });

  it("also downgrades the org plan to DEMO when orgId is supplied", async () => {
    const pool = trackingPool([
      { match: has("FROM subscriptions"), respond: { rows: [{ id: "s1", status: "active" }] } }
    ]);
    await svc.cancelPlanImmediately(pool, { userId: "u-1", orgId: "org-7" });
    const orgUpd = pool.calls.find((c) => has("UPDATE organizations")(c.sql));
    assert.ok(orgUpd, "org should be downgraded");
    assert.deepEqual(orgUpd.params, ["org-7"]);
    assert.ok(orgUpd.sql.includes("plan = 'DEMO'"));
  });
});

/* ────────────────────── finalizeCancellationIfDue ──────────────────── */

describe("finalizeCancellationIfDue", () => {
  it("returns subscription unchanged when none exists (null)", async () => {
    const pool = trackingPool([{ match: has("FROM subscriptions"), respond: { rows: [] } }]);
    assert.equal(await svc.finalizeCancellationIfDue(pool, "u-1"), null);
  });

  it("does nothing when status is not 'canceling'", async () => {
    const sub = { id: "s1", status: "active", cancel_at: new Date(Date.now() - 1000).toISOString() };
    const pool = trackingPool([{ match: has("FROM subscriptions"), respond: { rows: [sub] } }]);
    const result = await svc.finalizeCancellationIfDue(pool, "u-1");
    assert.equal(result, sub);
    assert.equal(pool.calls.some((c) => has("UPDATE subscriptions")(c.sql)), false);
  });

  it("does nothing when cancel_at is missing", async () => {
    const sub = { id: "s1", status: "canceling", cancel_at: null };
    const pool = trackingPool([{ match: has("FROM subscriptions"), respond: { rows: [sub] } }]);
    const result = await svc.finalizeCancellationIfDue(pool, "u-1");
    assert.equal(result, sub);
  });

  it("does nothing when cancel_at is in the future", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const sub = { id: "s1", status: "canceling", cancel_at: future };
    const pool = trackingPool([{ match: has("FROM subscriptions"), respond: { rows: [sub] } }]);
    const result = await svc.finalizeCancellationIfDue(pool, "u-1");
    assert.equal(result, sub);
    assert.equal(pool.calls.some((c) => has("UPDATE subscriptions")(c.sql)), false);
  });

  it("does nothing when cancel_at is an invalid date", async () => {
    const sub = { id: "s1", status: "canceling", cancel_at: "not-a-date" };
    const pool = trackingPool([{ match: has("FROM subscriptions"), respond: { rows: [sub] } }]);
    const result = await svc.finalizeCancellationIfDue(pool, "u-1");
    assert.equal(result, sub);
  });

  it("finalizes when due: marks canceled, inserts DEMO, reloads subscription", async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const due = { id: "s1", status: "canceling", cancel_at: past };
    const reloaded = { id: "s1", status: "canceled", plan: "PRO" };
    let loadCount = 0;
    const pool = trackingPool([
      {
        match: has("FROM subscriptions"),
        respond: () => {
          loadCount += 1;
          // first load = due sub (FOR UPDATE), second load = reloaded result
          return { rows: [loadCount === 1 ? due : reloaded] };
        }
      }
    ]);
    const result = await svc.finalizeCancellationIfDue(pool, "u-1", { orgId: "org-1" });
    assert.equal(result.status, "canceled");

    const upd = pool.calls.find((c) => has("UPDATE subscriptions")(c.sql) && c.sql.includes("'canceled'"));
    assert.deepEqual(upd.params, ["s1"]);

    const ins = pool.calls.find((c) => has("INSERT INTO subscriptions")(c.sql));
    assert.deepEqual(ins.params, ["u-1", "DEMO", "active"]);

    const orgUpd = pool.calls.find((c) => has("UPDATE organizations")(c.sql));
    assert.deepEqual(orgUpd.params, ["org-1"]);
  });

  it("finalizes without org update when orgId absent", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const pool = trackingPool([
      { match: has("FROM subscriptions"), respond: { rows: [{ id: "s1", status: "canceling", cancel_at: past }] } }
    ]);
    await svc.finalizeCancellationIfDue(pool, "u-1");
    assert.equal(pool.calls.some((c) => has("UPDATE organizations")(c.sql)), false);
  });
});

/* ──────────────────────────── getUserAndPlan ───────────────────────── */

function userAndPlanPool(overrides = {}) {
  const {
    userRow = {
      id: "u-1", role: "company", email: "a@b.de", company_name: "Acme",
      is_demo: false, org_id: null, customer_stage: "live", employee_count: null
    },
    subRow = null,
    ratingRow = { avg_rating: "4.5", rating_count: "12" },
    usageRow = { sent_count: "3", received_count: "1", listings_count: "2" },
    orgRow = null,
    finalizeReloadRow = undefined
  } = overrides;

  let finalized = false;
  const pool = trackingPool([
    { match: has("FROM users WHERE id=$1"), respond: { rows: userRow ? [userRow] : [] } },
    {
      match: has("FROM subscriptions"),
      respond: () => {
        // After the finalize UPDATE has fired, subsequent loads return the
        // reloaded (canceled) row; before that, the original sub is returned.
        if (finalizeReloadRow !== undefined && finalized) return { rows: [finalizeReloadRow] };
        return { rows: subRow ? [subRow] : [] };
      }
    },
    {
      match: (sql) => has("UPDATE subscriptions")(sql) && sql.includes("'canceled'"),
      respond: () => { finalized = true; return { rows: [], rowCount: 1 }; }
    },
    { match: has("FROM ratings WHERE rated_id=$1"), respond: { rows: [ratingRow] } },
    { match: has("AS sent_count"), respond: { rows: [usageRow] } },
    { match: has("FROM org_memberships"), respond: { rows: orgRow ? [orgRow] : [] } }
  ]);
  return pool;
}

describe("getUserAndPlan", () => {
  it("returns null when the user does not exist", async () => {
    const pool = userAndPlanPool({ userRow: null });
    assert.equal(await svc.getUserAndPlan(pool, "missing"), null);
  });

  it("returns DEMO plan + parsed ratings/usage when no subscription and no org", async () => {
    const pool = userAndPlanPool();
    const result = await svc.getUserAndPlan(pool, "u-1");
    assert.equal(result.plan, "DEMO");
    assert.equal(result.plan_source, "subscription");
    assert.equal(result.limits, svc.PLAN_LIMITS.DEMO);
    assert.equal(result.avg_rating, 4.5);
    assert.equal(result.rating_count, 12);
    assert.deepEqual(result.usage, { sent_count: 3, received_count: 1, listings_count: 2 });
    assert.equal(result.subscription, null);
    assert.equal(result.sub_status, "active");
    assert.equal(result.account_type, "live");
  });

  it("derives plan from the org plan and normalizes ENTERPRISE -> INDIVIDUELL", async () => {
    const pool = userAndPlanPool({
      orgRow: {
        org_id: "org-1", role_key: "org_admin", org_name: "Org One", org_type: "agency",
        org_plan: "ENTERPRISE", account_type: "live", feature_bundle: "standard"
      }
    });
    const result = await svc.getUserAndPlan(pool, "u-1");
    assert.equal(result.plan, "INDIVIDUELL");
    assert.equal(result.plan_source, "organization");
    assert.equal(result.org_role, "org_admin");
    assert.equal(result.org_name, "Org One");
    assert.equal(result.org_type, "agency");
  });

  it("applies pilot override: active pilot org gets INDIVIDUELL + enterprise_full bundle", async () => {
    const pool = userAndPlanPool({
      orgRow: {
        org_id: "org-1", role_key: "org_admin", org_name: "Pilot Co", org_type: "agency",
        org_plan: "BASIS", account_type: "live", feature_bundle: "standard",
        pilot_status: "active", has_used_pilot: true
      }
    });
    const result = await svc.getUserAndPlan(pool, "u-1");
    assert.equal(result.plan, "INDIVIDUELL");
    assert.equal(result.plan_source, "pilot_override");
    assert.equal(result.feature_bundle, "enterprise_full");
    assert.equal(result.pilot.pilot_status, "active");
    assert.equal(result.pilot.has_used_pilot, true);
  });

  it("does NOT apply pilot override for demo users even if pilot_status active", async () => {
    const pool = userAndPlanPool({
      userRow: {
        id: "u-1", role: "company", email: "a@b.de", is_demo: true,
        org_id: null, customer_stage: "demo"
      },
      orgRow: {
        org_id: "org-1", role_key: "org_admin", org_name: "X", org_type: "agency",
        org_plan: "BASIS", pilot_status: "active"
      }
    });
    const result = await svc.getUserAndPlan(pool, "u-1");
    assert.notEqual(result.plan_source, "pilot_override");
    assert.equal(result.plan, "BASIS");
    assert.equal(result.account_type, "demo");
  });

  it("exposes subscription block with normalized display plan when sub exists", async () => {
    const pool = userAndPlanPool({
      subRow: { id: "s1", plan: "FREE", status: "active", current_period_end: "2026-12-01" }
    });
    const result = await svc.getUserAndPlan(pool, "u-1");
    assert.ok(result.subscription);
    assert.equal(result.subscription.plan, "DEMO"); // FREE normalized for display
    assert.equal(result.subscription.status, "active");
    assert.equal(result.subscription.current_period_end, "2026-12-01");
  });

  it("auto-finalizes a due 'canceling' subscription during read", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const pool = userAndPlanPool({
      subRow: { id: "s1", plan: "PRO", status: "canceling", cancel_at: past },
      finalizeReloadRow: { id: "s1", plan: "DEMO", status: "canceled" }
    });
    const result = await svc.getUserAndPlan(pool, "u-1");
    // After finalization the reloaded sub is canceled/DEMO
    assert.equal(result.sub_status, "canceled");
    // The finalize path issues an UPDATE to 'canceled'
    assert.ok(pool.calls.some((c) => has("UPDATE subscriptions")(c.sql) && c.sql.includes("'canceled'")));
  });

  it("does not finalize when cancel_at is in the future", async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const pool = userAndPlanPool({
      subRow: { id: "s1", plan: "PRO", status: "canceling", cancel_at: future }
    });
    const result = await svc.getUserAndPlan(pool, "u-1");
    assert.equal(result.sub_status, "canceling");
    assert.equal(pool.calls.some((c) => has("UPDATE subscriptions")(c.sql)), false);
  });

  it("computes capabilities from org role permissions", async () => {
    const pool = userAndPlanPool({
      orgRow: {
        org_id: "org-1", role_key: "org_admin", org_name: "Org", org_type: "agency",
        org_plan: "PRO", feature_bundle: "standard", account_type: "live"
      }
    });
    const result = await svc.getUserAndPlan(pool, "u-1");
    assert.equal(typeof result.capabilities, "object");
    assert.equal(typeof result.capabilities.worker_view, "boolean");
    assert.ok(result.surface_access && typeof result.surface_access === "object");
  });

  it("passes orgId from opts into the org_memberships query", async () => {
    const pool = userAndPlanPool({
      orgRow: {
        org_id: "org-99", role_key: "org_admin", org_name: "Scoped", org_type: "agency",
        org_plan: "PLUS", feature_bundle: "standard", account_type: "live"
      }
    });
    await svc.getUserAndPlan(pool, "u-1", { orgId: "org-99" });
    const om = pool.calls.find((c) => has("FROM org_memberships")(c.sql));
    assert.deepEqual(om.params, ["u-1", "org-99"]);
  });

  it("survives an org_membership query error (non-critical try/catch) and falls back", async () => {
    const pool = trackingPool([
      { match: has("FROM users WHERE id=$1"), respond: { rows: [{ id: "u-1", role: "company", is_demo: false, org_id: null, customer_stage: "live" }] } },
      { match: has("FROM subscriptions"), respond: { rows: [] } },
      { match: has("FROM ratings WHERE rated_id=$1"), respond: { rows: [{ avg_rating: null, rating_count: "0" }] } },
      { match: has("AS sent_count"), respond: { rows: [{}] } },
      { match: has("FROM org_memberships"), respond: new Error("boom") }
    ]);
    const result = await svc.getUserAndPlan(pool, "u-1");
    assert.equal(result.org_role, null);
    assert.equal(result.plan, "DEMO");
    assert.equal(result.avg_rating, 0);
    assert.deepEqual(result.usage, { sent_count: 0, received_count: 0, listings_count: 0 });
  });
});

/* ───────────────────────── password helpers ───────────────────────── */

describe("getUserPasswordHash", () => {
  it("returns the row with the password hash", async () => {
    const pool = trackingPool([
      { match: has("password_hash FROM users"), respond: { rows: [{ id: "u-1", password_hash: "xx" }] } }
    ]);
    const row = await svc.getUserPasswordHash(pool, "u-1");
    assert.deepEqual(row, { id: "u-1", password_hash: "xx" });
    assert.deepEqual(pool.calls[0].params, ["u-1"]);
  });

  it("returns null when user not found", async () => {
    const pool = trackingPool([{ match: has("FROM users"), respond: { rows: [] } }]);
    assert.equal(await svc.getUserPasswordHash(pool, "u-1"), null);
  });
});

describe("changePassword", () => {
  it("updates password_hash with new hash and userId in order", async () => {
    const pool = trackingPool([{ match: has("UPDATE users SET password_hash"), respond: { rowCount: 1, rows: [] } }]);
    await svc.changePassword(pool, "u-1", "newhash");
    assert.deepEqual(pool.calls[0].params, ["newhash", "u-1"]);
  });
});

/* ─────────────────────────── exportUserData ────────────────────────── */

describe("exportUserData", () => {
  it("returns null when user does not exist", async () => {
    const pool = trackingPool([{ match: has("FROM users WHERE id=$1"), respond: { rows: [] } }]);
    assert.equal(await svc.exportUserData(pool, "u-1"), null);
  });

  it("aggregates all related data into the DSGVO export envelope", async () => {
    const pool = trackingPool([
      { match: has("FROM users WHERE id=$1"), respond: { rows: [{ id: "u-1", email: "a@b.de" }] } },
      { match: has("FROM listings WHERE owner_id=$1"), respond: { rows: [{ id: "l-1" }] } },
      { match: has("FROM subscriptions WHERE user_id=$1"), respond: { rows: [{ plan: "PRO" }] } },
      { match: has("FROM requests WHERE requester_id=$1"), respond: { rows: [{ id: "r-sent" }] } },
      { match: has("FROM requests WHERE receiver_id=$1"), respond: { rows: [{ id: "r-recv" }] } },
      { match: has("FROM ratings WHERE rater_id=$1"), respond: { rows: [{ id: "rg" }] } },
      { match: has("FROM ratings WHERE rated_id=$1"), respond: { rows: [{ id: "rr" }] } }
    ]);
    const out = await svc.exportUserData(pool, "u-1");
    assert.equal(out.purpose, "DSGVO Art. 20 – Datenübertragbarkeit");
    assert.ok(typeof out.export_date === "string" && out.export_date.includes("T"));
    assert.deepEqual(out.user, { id: "u-1", email: "a@b.de" });
    assert.deepEqual(out.listings, [{ id: "l-1" }]);
    assert.deepEqual(out.subscriptions, [{ plan: "PRO" }]);
    assert.deepEqual(out.requests_sent, [{ id: "r-sent" }]);
    assert.deepEqual(out.requests_received, [{ id: "r-recv" }]);
    assert.deepEqual(out.ratings_given, [{ id: "rg" }]);
    assert.deepEqual(out.ratings_received, [{ id: "rr" }]);
  });
});

/* ───────────────────── changePlan / cancelPlan ─────────────────────── */

describe("changePlan", () => {
  it("inserts an active subscription with the normalized plan", async () => {
    const pool = trackingPool([{ match: has("INSERT INTO subscriptions"), respond: { rows: [], rowCount: 1 } }]);
    await svc.changePlan(pool, "u-1", "PRO");
    const ins = pool.calls.find((c) => has("INSERT INTO subscriptions")(c.sql));
    assert.deepEqual(ins.params, ["u-1", "PRO", "active"]);
    // PRO billing interval => '1 month'
    assert.ok(ins.sql.includes("INTERVAL '1 month'"));
  });

  it("normalizes a legacy plan key (FREE -> DEMO) on insert", async () => {
    const pool = trackingPool([{ match: has("INSERT INTO subscriptions"), respond: { rows: [] } }]);
    await svc.changePlan(pool, "u-1", "FREE");
    const ins = pool.calls.find((c) => has("INSERT INTO subscriptions")(c.sql));
    assert.deepEqual(ins.params, ["u-1", "DEMO", "active"]);
    // DEMO billing interval => '14 days'
    assert.ok(ins.sql.includes("INTERVAL '14 days'"));
  });
});

describe("cancelPlan", () => {
  it("inserts a FREE->DEMO active subscription", async () => {
    const pool = trackingPool([{ match: has("INSERT INTO subscriptions"), respond: { rows: [] } }]);
    await svc.cancelPlan(pool, "u-1");
    const ins = pool.calls.find((c) => has("INSERT INTO subscriptions")(c.sql));
    assert.deepEqual(ins.params, ["u-1", "DEMO", "active"]);
  });
});

/* deleteUser wurde entfernt (2026-08-03): Der Hard-Delete war nur noch als
   HGB-§257-verletzender Fallback in DELETE /me verdrahtet — Anonymisierung
   (dataGovernanceService.anonymizeUser) ist der einzige Loeschpfad. */

/* ─────────────────────────── updateProfile ─────────────────────────── */

describe("updateProfile", () => {
  it("maps profile fields to the UPDATE params in order with userId last", async () => {
    const pool = trackingPool([{ match: has("UPDATE users SET company_name"), respond: { rows: [] } }]);
    await svc.updateProfile(pool, "u-1", {
      company_name: "Acme", phone: "123", contact_person: "Jo",
      street: "Main", postal_code: "25554", city: "Wilster",
      vat_id: "DE1", handelsregister_number: "HRB1"
    });
    assert.deepEqual(pool.calls[0].params, [
      "Acme", "123", "Jo", "Main", "25554", "Wilster", "DE1", "HRB1", "u-1"
    ]);
  });

  it("coerces missing/falsy fields to null", async () => {
    const pool = trackingPool([{ match: has("UPDATE users SET company_name"), respond: { rows: [] } }]);
    await svc.updateProfile(pool, "u-1", {});
    assert.deepEqual(pool.calls[0].params, [
      null, null, null, null, null, null, null, null, "u-1"
    ]);
  });
});

/* ────────────────────── onboarding + geo helpers ───────────────────── */

describe("markOnboardingComplete", () => {
  it("sets onboarding_completed = TRUE for the user", async () => {
    const pool = trackingPool([{ match: has("onboarding_completed = TRUE"), respond: { rows: [] } }]);
    await svc.markOnboardingComplete(pool, "u-1");
    assert.ok(pool.calls[0].sql.includes("onboarding_completed = TRUE"));
    assert.deepEqual(pool.calls[0].params, ["u-1"]);
  });
});

describe("resetOnboarding", () => {
  it("sets onboarding_completed = FALSE for the user", async () => {
    const pool = trackingPool([{ match: has("onboarding_completed = FALSE"), respond: { rows: [] } }]);
    await svc.resetOnboarding(pool, "u-1");
    assert.ok(pool.calls[0].sql.includes("onboarding_completed = FALSE"));
    assert.deepEqual(pool.calls[0].params, ["u-1"]);
  });
});

describe("updateUserGeo", () => {
  it("updates latitude/longitude with lat, lng, userId order", async () => {
    const pool = trackingPool([{ match: has("SET latitude=$1, longitude=$2"), respond: { rows: [] } }]);
    await svc.updateUserGeo(pool, "u-1", 53.9, 9.4);
    assert.deepEqual(pool.calls[0].params, [53.9, 9.4, "u-1"]);
  });
});

describe("clearUserGeo", () => {
  it("nulls latitude/longitude for the user", async () => {
    const pool = trackingPool([{ match: has("latitude=NULL, longitude=NULL"), respond: { rows: [] } }]);
    await svc.clearUserGeo(pool, "u-1");
    assert.ok(pool.calls[0].sql.includes("latitude=NULL, longitude=NULL"));
    assert.deepEqual(pool.calls[0].params, ["u-1"]);
  });
});
