import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as svc from "../services/pilotPolicyService.js";

/**
 * Local tracking pool: records every { sql, params } and dispatches via a
 * handler keyed by SQL substrings. More robust than ordered sequencePool for
 * multi-helper functions whose call graph hits several distinct queries.
 *
 * handler(sql, params) -> { rows } | Error  (Error is thrown)
 * Default response: { rows: [] }.
 */
function trackingPool(handler = () => ({ rows: [] })) {
  const calls = [];
  const queryFn = async (sql, params) => {
    calls.push({ sql, params });
    const res = handler(sql, params, calls.length);
    if (res instanceof Error) throw res;
    return res || { rows: [] };
  };
  return {
    calls,
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} })
  };
}

const has = (sql, frag) => sql.toUpperCase().includes(frag.toUpperCase());

describe("pilotPolicyService — getOrganizationPilotState", () => {
  it("returns the first row when org exists", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "o1", pilot_status: "active" }] }));
    const out = await svc.getOrganizationPilotState(pool, "o1");
    assert.deepEqual(out, { id: "o1", pilot_status: "active" });
    assert.equal(pool.calls.length, 1);
    assert.deepEqual(pool.calls[0].params, ["o1"]);
    assert.ok(has(pool.calls[0].sql, "FROM organizations"));
  });

  it("returns null when org not found", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const out = await svc.getOrganizationPilotState(pool, "missing");
    assert.equal(out, null);
  });
});

describe("pilotPolicyService — resolveOrgFamily", () => {
  it("maps recursive rows to an array of ids", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "root" }, { id: "child" }] }));
    const ids = await svc.resolveOrgFamily(pool, "child");
    assert.deepEqual(ids, ["root", "child"]);
    assert.deepEqual(pool.calls[0].params, ["child"]);
    assert.ok(has(pool.calls[0].sql, "RECURSIVE"));
  });

  it("returns empty array when no family found", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    assert.deepEqual(await svc.resolveOrgFamily(pool, "x"), []);
  });
});

describe("pilotPolicyService — canActivatePilot", () => {
  it("ORG_NOT_FOUND when family is empty", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "RECURSIVE")) return { rows: [] };
      return { rows: [] };
    });
    const r = await svc.canActivatePilot(pool, "o1");
    assert.deepEqual(r, { allowed: false, reason: "ORG_NOT_FOUND" });
    // family query short-circuits — second query never fires
    assert.equal(pool.calls.length, 1);
  });

  it("PILOT_BLOCKED_IN_FAMILY when a family org is blocked", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "RECURSIVE")) return { rows: [{ id: "a" }, { id: "b" }] };
      return { rows: [{ id: "b", pilot_status: "blocked", has_used_pilot: false, pilot_exception_allowed: false }] };
    });
    const r = await svc.canActivatePilot(pool, "a");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "PILOT_BLOCKED_IN_FAMILY");
    assert.equal(r.blocked_org_id, "b");
    // second query bound to family ids via ANY()
    assert.ok(has(pool.calls[1].sql, "ANY($1::uuid[])"));
    assert.deepEqual(pool.calls[1].params, [["a", "b"]]);
  });

  it("PILOT_ALREADY_USED when used and no exception", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "RECURSIVE")) return { rows: [{ id: "a" }] };
      return { rows: [{ id: "a", pilot_status: "ended", has_used_pilot: true, pilot_exception_allowed: false }] };
    });
    const r = await svc.canActivatePilot(pool, "a");
    assert.deepEqual(r, { allowed: false, reason: "PILOT_ALREADY_USED" });
  });

  it("allowed when used but exception granted (reusable)", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "RECURSIVE")) return { rows: [{ id: "a" }] };
      return { rows: [{ id: "a", pilot_status: "exception", has_used_pilot: true, pilot_exception_allowed: true }] };
    });
    const r = await svc.canActivatePilot(pool, "a");
    assert.deepEqual(r, { allowed: true, reason: null });
  });

  it("allowed when never used", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "RECURSIVE")) return { rows: [{ id: "a" }] };
      return { rows: [{ id: "a", pilot_status: "eligible", has_used_pilot: false, pilot_exception_allowed: false }] };
    });
    const r = await svc.canActivatePilot(pool, "a");
    assert.deepEqual(r, { allowed: true, reason: null });
  });

  it("normalizes schema-missing DB error (42P01) to PILOT_POLICY_SCHEMA_MISSING", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "RECURSIVE")) {
        const e = new Error("relation does not exist");
        e.code = "42P01";
        return e;
      }
      return { rows: [] };
    });
    await assert.rejects(
      () => svc.canActivatePilot(pool, "a"),
      (e) => {
        assert.equal(e.code, "PILOT_POLICY_SCHEMA_MISSING");
        assert.deepEqual(e.details, { db_code: "42P01" });
        return true;
      }
    );
  });
});

describe("pilotPolicyService — activatePilotForOrganization", () => {
  function eligiblePool(extraHandler) {
    return trackingPool((sql, params, n) => {
      if (has(sql, "RECURSIVE")) return { rows: [{ id: "a" }] };
      if (has(sql, "WHERE ID = ANY")) {
        return { rows: [{ id: "a", pilot_status: "eligible", has_used_pilot: false, pilot_exception_allowed: false }] };
      }
      if (extraHandler) return extraHandler(sql, params, n);
      return { rows: [] };
    });
  }

  it("activates an eligible org and returns the new state with source/actor", async () => {
    const pool = eligiblePool((sql) => {
      if (has(sql, "UPDATE organizations")) {
        return { rows: [{ id: "a", pilot_status: "active", has_used_pilot: true, pilot_started_at: "2026-01-01", customer_stage: "pilot", billing_mode: "pilot_contract" }] };
      }
      return { rows: [] };
    });
    const out = await svc.activatePilotForOrganization(pool, { orgId: "a", actorUserId: "u1", source: "staff" });
    assert.equal(out.pilot_status, "active");
    assert.equal(out.has_used_pilot, true);
    assert.equal(out.source, "staff");
    assert.equal(out.actor_user_id, "u1");
    // UPDATE bound to orgId
    const upd = pool.calls.find((c) => has(c.sql, "UPDATE organizations"));
    assert.deepEqual(upd.params, ["a"]);
    assert.ok(has(upd.sql, "pilot_status = 'active'"));
  });

  it("defaults source to 'internal' and actor to null", async () => {
    const pool = eligiblePool((sql) => {
      if (has(sql, "UPDATE organizations")) {
        return { rows: [{ id: "a", pilot_status: "active" }] };
      }
      return { rows: [] };
    });
    const out = await svc.activatePilotForOrganization(pool, { orgId: "a" });
    assert.equal(out.source, "internal");
    assert.equal(out.actor_user_id, null);
  });

  it("throws PILOT_NOT_ELIGIBLE when not eligible", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "RECURSIVE")) return { rows: [{ id: "a" }] };
      return { rows: [{ id: "a", pilot_status: "ended", has_used_pilot: true, pilot_exception_allowed: false }] };
    });
    await assert.rejects(
      () => svc.activatePilotForOrganization(pool, { orgId: "a" }),
      (e) => {
        assert.equal(e.code, "PILOT_NOT_ELIGIBLE");
        assert.equal(e.details.reason, "PILOT_ALREADY_USED");
        return true;
      }
    );
  });

  it("throws ORG_NOT_FOUND when UPDATE returns no row", async () => {
    const pool = eligiblePool((sql) => {
      if (has(sql, "UPDATE organizations")) return { rows: [] };
      return { rows: [] };
    });
    await assert.rejects(
      () => svc.activatePilotForOrganization(pool, { orgId: "a" }),
      (e) => e.code === "ORG_NOT_FOUND"
    );
  });
});

describe("pilotPolicyService — endPilotForOrganization", () => {
  it("ORG_NOT_FOUND when org missing", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await assert.rejects(
      () => svc.endPilotForOrganization(pool, { orgId: "a" }),
      (e) => e.code === "ORG_NOT_FOUND"
    );
  });

  it("skips when pilot not active", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM organizations")) return { rows: [{ id: "a", pilot_status: "ended" }] };
      return { rows: [] };
    });
    const out = await svc.endPilotForOrganization(pool, { orgId: "a" });
    assert.deepEqual(out, { skipped: true, reason: "NOT_ACTIVE" });
    // only the state read happened, no UPDATE
    assert.equal(pool.calls.length, 1);
  });

  it("ends active pilot, sets stage live and returns actor/reason", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "UPDATE organizations")) {
        return { rows: [{ id: "a", pilot_status: "ended", pilot_ended_at: "now", customer_stage: "live", billing_mode: "standard_catalog" }] };
      }
      if (has(sql, "FROM organizations")) return { rows: [{ id: "a", pilot_status: "active" }] };
      return { rows: [] };
    });
    const out = await svc.endPilotForOrganization(pool, { orgId: "a", actorUserId: "u9", reason: "manual" });
    assert.equal(out.pilot_status, "ended");
    assert.equal(out.customer_stage, "live");
    assert.equal(out.actor_user_id, "u9");
    assert.equal(out.reason, "manual");
    const upd = pool.calls.find((c) => has(c.sql, "UPDATE organizations"));
    assert.ok(has(upd.sql, "customer_stage = 'live'"));
    assert.deepEqual(upd.params, ["a"]);
  });
});

describe("pilotPolicyService — convertPilotForOrganization", () => {
  it("ORG_NOT_FOUND when org missing", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await assert.rejects(
      () => svc.convertPilotForOrganization(pool, { orgId: "a" }),
      (e) => e.code === "ORG_NOT_FOUND"
    );
  });

  it("converts active pilot with explicit INDIVIDUAL plan → INDIVIDUELL + individual_contract", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM organizations")) return { rows: [{ id: "a", pilot_status: "active" }] };
      if (has(sql, "UPDATE organizations")) {
        return { rows: [{ id: "a", pilot_status: "converted", converted_at: "now", customer_stage: "live", billing_mode: "individual_contract" }] };
      }
      if (has(sql, "FROM org_memberships")) return { rows: [{ user_id: "u-owner" }] };
      if (has(sql, "INSERT INTO subscriptions")) return { rows: [] };
      return { rows: [] };
    });
    const out = await svc.convertPilotForOrganization(pool, { orgId: "a", actorUserId: "u1", plan: "INDIVIDUAL" });
    assert.equal(out.pilot_status, "converted");
    assert.equal(out.plan, "INDIVIDUAL");
    assert.equal(out.billing_mode, "individual_contract");
    assert.equal(out.actor_user_id, "u1");
    // UPDATE params: orgId, billingMode, normalizedPlan
    const upd = pool.calls.find((c) => has(c.sql, "UPDATE organizations"));
    assert.equal(upd.params[0], "a");
    assert.equal(upd.params[1], "individual_contract");
    assert.equal(upd.params[2], "INDIVIDUELL");
    // subscription created for owner with INDIVIDUELL plan
    const ins = pool.calls.find((c) => has(c.sql, "INSERT INTO subscriptions"));
    assert.ok(ins, "subscription INSERT must run when converted");
    assert.deepEqual(ins.params, ["u-owner", "INDIVIDUELL"]);
  });

  it("uses target_plan_after_pilot from DB when plan not passed", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM organizations")) return { rows: [{ id: "a", pilot_status: "active", target_plan_after_pilot: "PRO" }] };
      if (has(sql, "UPDATE organizations")) return { rows: [{ id: "a", pilot_status: "converted" }] };
      if (has(sql, "FROM org_memberships")) return { rows: [{ user_id: "u-owner" }] };
      return { rows: [] };
    });
    const out = await svc.convertPilotForOrganization(pool, { orgId: "a" });
    assert.equal(out.plan, "PRO");
    assert.equal(out.billing_mode, "standard_catalog"); // PRO is not INDIVIDUAL/ENTERPRISE
    const upd = pool.calls.find((c) => has(c.sql, "UPDATE organizations"));
    assert.equal(upd.params[2], "PRO");
    const ins = pool.calls.find((c) => has(c.sql, "INSERT INTO subscriptions"));
    assert.deepEqual(ins.params, ["u-owner", "PRO"]);
  });

  it("FREE plan normalizes to DEMO for the org plan column", async () => {
    let updParams = null;
    const pool = trackingPool((sql, params) => {
      if (has(sql, "FROM organizations")) return { rows: [{ id: "a", pilot_status: "active" }] };
      if (has(sql, "UPDATE organizations")) { updParams = params; return { rows: [{ id: "a", pilot_status: "converted" }] }; }
      if (has(sql, "FROM org_memberships")) return { rows: [] }; // no owner → no subscription
      return { rows: [] };
    });
    const out = await svc.convertPilotForOrganization(pool, { orgId: "a", plan: "FREE" });
    assert.equal(updParams[2], "DEMO");
    assert.equal(out.billing_mode, "standard_catalog");
    // no owner member → no subscription INSERT
    assert.ok(!pool.calls.some((c) => has(c.sql, "INSERT INTO subscriptions")));
  });

  it("does not create subscription when pilot was not active (status unchanged)", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM organizations")) return { rows: [{ id: "a", pilot_status: "ended" }] };
      if (has(sql, "UPDATE organizations")) return { rows: [{ id: "a", pilot_status: "ended" }] };
      return { rows: [] };
    });
    const out = await svc.convertPilotForOrganization(pool, { orgId: "a", plan: "PRO" });
    assert.equal(out.pilot_status, "ended");
    assert.ok(!pool.calls.some((c) => has(c.sql, "INSERT INTO subscriptions")));
  });

  it("subscription failure is best-effort and does not break conversion", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "FROM organizations")) return { rows: [{ id: "a", pilot_status: "active" }] };
      if (has(sql, "UPDATE organizations")) return { rows: [{ id: "a", pilot_status: "converted" }] };
      if (has(sql, "FROM org_memberships")) return { rows: [{ user_id: "u-owner" }] };
      if (has(sql, "INSERT INTO subscriptions")) return new Error("subscriptions table down");
      return { rows: [] };
    });
    const out = await svc.convertPilotForOrganization(pool, { orgId: "a", plan: "BASIS" });
    assert.equal(out.pilot_status, "converted"); // conversion still returned
  });
});

describe("pilotPolicyService — setPilotException", () => {
  it("rejects missing reason", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await assert.rejects(
      () => svc.setPilotException(pool, { orgId: "a", actorUserId: "u", allowed: true, reason: "" }),
      (e) => e.code === "PILOT_EXCEPTION_REASON_REQUIRED"
    );
    assert.equal(pool.calls.length, 0); // validation happens before any query
  });

  it("rejects too-short reason (<10 trimmed chars)", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await assert.rejects(
      () => svc.setPilotException(pool, { orgId: "a", actorUserId: "u", allowed: true, reason: "   short  " }),
      (e) => e.code === "PILOT_EXCEPTION_REASON_REQUIRED"
    );
  });

  it("sets exception, trims reason, coerces allowed to boolean, returns next_status", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => {
      params = p;
      return { rows: [{ id: "a", pilot_status: "exception", has_used_pilot: true, pilot_exception_allowed: true, pilot_exception_reason: "valid reason here", pilot_exception_granted_by: "u", pilot_exception_granted_at: "now" }] };
    });
    const out = await svc.setPilotException(pool, { orgId: "a", actorUserId: "u", allowed: 1, reason: "  valid reason here  " });
    assert.equal(out.pilot_status, "exception");
    assert.equal(out.next_status, "exception");
    assert.deepEqual(params, ["a", true, "valid reason here", "u"]);
  });

  it("actorUserId defaults to null in params", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => {
      params = p;
      return { rows: [{ id: "a", pilot_status: "blocked" }] };
    });
    await svc.setPilotException(pool, { orgId: "a", actorUserId: undefined, allowed: false, reason: "documented reason text" });
    assert.equal(params[1], false);
    assert.equal(params[3], null);
  });

  it("ORG_NOT_FOUND when UPDATE returns no row", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await assert.rejects(
      () => svc.setPilotException(pool, { orgId: "a", actorUserId: "u", allowed: true, reason: "documented reason text" }),
      (e) => e.code === "ORG_NOT_FOUND"
    );
  });

  it("normalizes schema error (42703) thrown by the UPDATE", async () => {
    const pool = trackingPool(() => {
      const e = new Error("column missing");
      e.code = "42703";
      return e;
    });
    await assert.rejects(
      () => svc.setPilotException(pool, { orgId: "a", actorUserId: "u", allowed: true, reason: "documented reason text" }),
      (e) => e.code === "PILOT_POLICY_SCHEMA_MISSING"
    );
  });
});

describe("pilotPolicyService — assertValidPilotStatus", () => {
  it("passes for each valid status", () => {
    for (const s of ["eligible", "active", "ended", "converted", "blocked", "exception"]) {
      assert.doesNotThrow(() => svc.assertValidPilotStatus(s));
    }
  });

  it("throws INVALID_PILOT_STATUS for unknown status", () => {
    assert.throws(
      () => svc.assertValidPilotStatus("bogus"),
      (e) => e.code === "INVALID_PILOT_STATUS"
    );
  });
});

describe("pilotPolicyService — expireStalePilots", () => {
  it("returns count and ids of expired pilots", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => {
      params = p;
      return { rows: [{ id: "p1" }, { id: "p2" }] };
    });
    const out = await svc.expireStalePilots(pool);
    assert.deepEqual(out, { expired: 2, ids: ["p1", "p2"] });
    // bound to PILOT_MAX_MONTHS (3)
    assert.deepEqual(params, [3]);
  });

  it("returns zero when nothing stale", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const out = await svc.expireStalePilots(pool, 50);
    assert.deepEqual(out, { expired: 0, ids: [] });
  });

  it("normalizes schema error", async () => {
    const pool = trackingPool(() => {
      const e = new Error("no table");
      e.code = "42P01";
      return e;
    });
    await assert.rejects(
      () => svc.expireStalePilots(pool),
      (e) => e.code === "PILOT_POLICY_SCHEMA_MISSING"
    );
  });
});

describe("pilotPolicyService — listAllPilots", () => {
  it("returns rows with default limit 500 and PILOT_MAX_MONTHS param", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => {
      params = p;
      return { rows: [{ org_id: "a", pilot_status: "active", remaining_days: 30 }] };
    });
    const out = await svc.listAllPilots(pool);
    assert.equal(out.length, 1);
    assert.equal(out[0].org_id, "a");
    assert.deepEqual(params, [3, 500]); // [PILOT_MAX_MONTHS, limit]
  });

  it("honors a custom limit", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => { params = p; return { rows: [] }; });
    await svc.listAllPilots(pool, { limit: 10 });
    assert.deepEqual(params, [3, 10]);
  });

  it("normalizes schema error", async () => {
    const pool = trackingPool(() => {
      const e = new Error("missing");
      e.code = "42703";
      return e;
    });
    await assert.rejects(
      () => svc.listAllPilots(pool),
      (e) => e.code === "PILOT_POLICY_SCHEMA_MISSING"
    );
  });
});

describe("pilotPolicyService — extendPilotForOrganization", () => {
  it("extends an active pilot and clamps months to 1..12", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => {
      params = p;
      return { rows: [{ id: "a", pilot_status: "active", pilot_started_at: "future" }] };
    });
    const out = await svc.extendPilotForOrganization(pool, { orgId: "a", months: 99, actorUserId: "u" });
    assert.equal(out.extended_months, 12); // clamped to 12
    assert.equal(out.actor_user_id, "u");
    assert.equal(out.pilot_status, "active");
    assert.deepEqual(params, ["a", 12]);
  });

  it("clamps non-positive / invalid months to 1", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => { params = p; return { rows: [{ id: "a", pilot_status: "active" }] }; });
    await svc.extendPilotForOrganization(pool, { orgId: "a", months: 0 });
    assert.equal(params[1], 1);

    const pool2 = trackingPool((sql, p) => { params = p; return { rows: [{ id: "a", pilot_status: "active" }] }; });
    await svc.extendPilotForOrganization(pool2, { orgId: "a", months: "garbage" });
    assert.equal(params[1], 1);
  });

  it("defaults months to 1 when omitted", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => { params = p; return { rows: [{ id: "a", pilot_status: "active" }] }; });
    const out = await svc.extendPilotForOrganization(pool, { orgId: "a" });
    assert.equal(out.extended_months, 1);
    assert.equal(params[1], 1);
  });

  it("throws PILOT_NOT_ACTIVE when org exists but is not active", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "UPDATE organizations")) return { rows: [] }; // no active row updated
      if (has(sql, "FROM organizations")) return { rows: [{ id: "a", pilot_status: "ended" }] }; // exists
      return { rows: [] };
    });
    await assert.rejects(
      () => svc.extendPilotForOrganization(pool, { orgId: "a", months: 1 }),
      (e) => e.code === "PILOT_NOT_ACTIVE"
    );
  });

  it("throws ORG_NOT_FOUND when org does not exist at all", async () => {
    const pool = trackingPool((sql) => {
      if (has(sql, "UPDATE organizations")) return { rows: [] };
      if (has(sql, "FROM organizations")) return { rows: [] }; // missing
      return { rows: [] };
    });
    await assert.rejects(
      () => svc.extendPilotForOrganization(pool, { orgId: "a", months: 1 }),
      (e) => e.code === "ORG_NOT_FOUND"
    );
  });
});
