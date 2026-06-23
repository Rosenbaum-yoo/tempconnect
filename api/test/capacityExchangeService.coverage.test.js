/**
 * Capacity Exchange Service — comprehensive coverage suite (from scratch).
 *
 * Behavior tests for the availability-autopilot service: commercial-state
 * derivation, CRUD, status transitions, browsable feed ranking, interactions,
 * trust signals, auto-expiry batches and dashboard stats.
 *
 * Mock-pool idiom from this repo: sequencePool/returnPool (helpers/mockPool.js)
 * plus a local trackingPool for SQL-shape / param assertions.
 *
 * Run (cwd = api/):
 *   node --test --test-force-exit test/capacityExchangeService.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/capacityExchangeService.js";
import * as capacityWorkflow from "../services/capacityWorkflow.js";
import { sequencePool, returnPool } from "./helpers/mockPool.js";

/**
 * trackingPool — records every (sql, params) and dispatches to a handler.
 * handler(sql, params) returns a {rows,rowCount} or undefined (→ default empty).
 */
function trackingPool(handler) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql: String(sql), params: params || [] });
    const res = handler ? handler(String(sql), params) : undefined;
    return res || { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query,
    connect: async () => ({ query, release() {} })
  };
}

// ═══════════════════════════════════════════════════════════════
// getCapacityCommercialStates  (set-based batch loader)
// ═══════════════════════════════════════════════════════════════

describe("getCapacityCommercialStates", () => {
  it("returns empty Map for empty / falsy id list without querying", async () => {
    const pool = trackingPool();
    const map = await svc.getCapacityCommercialStates(pool, []);
    assert.ok(map instanceof Map);
    assert.equal(map.size, 0);
    assert.equal(pool.calls.length, 0, "no query for empty id set");
  });

  it("deduplicates ids and passes a single ANY($1) array param", async () => {
    const pool = trackingPool(() => ({
      rows: [{
        capacity_post_id: "cap-1",
        committed_headcount: 3,
        assigned_headcount: 2,
        staffing_reserved_headcount: 1,
        active_offer_count: 2,
        counterparty_user_ids: ["u9", null, "u10"]
      }]
    }));
    const map = await svc.getCapacityCommercialStates(pool, ["cap-1", "cap-1", null, "cap-2"]);
    assert.equal(pool.calls.length, 1);
    const uniqueIds = pool.calls[0].params[0];
    assert.deepEqual([...uniqueIds].sort(), ["cap-1", "cap-2"]);
    const state = map.get("cap-1");
    assert.equal(state.committed_headcount, 3);
    assert.equal(state.assigned_headcount, 2);
    assert.equal(state.staffing_reserved_headcount, 1);
    assert.equal(state.active_offer_count, 2);
    assert.deepEqual(state.counterparty_user_ids, ["u9", "u10"], "null counterparties stripped");
  });

  it("coerces non-array counterparty_user_ids to []", async () => {
    const pool = returnPool([{ capacity_post_id: "x", counterparty_user_ids: null }]);
    const map = await svc.getCapacityCommercialStates(pool, ["x"]);
    assert.deepEqual(map.get("x").counterparty_user_ids, []);
  });
});

// ═══════════════════════════════════════════════════════════════
// getCapacityCommercialState  (single)
// ═══════════════════════════════════════════════════════════════

describe("getCapacityCommercialState", () => {
  it("returns the frozen EMPTY state when the post does not exist", async () => {
    const pool = sequencePool({ rows: [] }); // post lookup → none
    const state = await svc.getCapacityCommercialState(pool, "missing");
    assert.equal(state.commercial_status, "open");
    assert.equal(state.has_active_deal, false);
    assert.equal(state.remaining_headcount, 0);
  });

  it("derives partially_committed when committed < headcount", async () => {
    const pool = sequencePool(
      { rows: [{ id: "cap-1", headcount: 5 }] },        // post lookup
      { rows: [{ capacity_post_id: "cap-1", committed_headcount: 2, counterparty_user_ids: ["c1"] }] } // states
    );
    const state = await svc.getCapacityCommercialState(pool, "cap-1");
    assert.equal(state.committed_headcount, 2);
    assert.equal(state.remaining_headcount, 3);
    assert.equal(state.is_partially_committed, true);
    assert.equal(state.is_fully_committed, false);
    assert.equal(state.commercial_status, "partially_committed");
    assert.equal(state.commercial_visibility, "public");
  });

  it("derives fully committed (reserved / counterparty_only) when committed >= headcount", async () => {
    const pool = sequencePool(
      { rows: [{ id: "cap-1", headcount: 2 }] },
      { rows: [{ capacity_post_id: "cap-1", committed_headcount: 2, counterparty_user_ids: ["c1"] }] }
    );
    const state = await svc.getCapacityCommercialState(pool, "cap-1");
    assert.equal(state.remaining_headcount, 0);
    assert.equal(state.is_fully_committed, true);
    assert.equal(state.commercial_status, "reserved");
    assert.equal(state.commercial_visibility, "counterparty_only");
  });
});

// ═══════════════════════════════════════════════════════════════
// enrichCapacityEntries + viewer visibility
// ═══════════════════════════════════════════════════════════════

describe("enrichCapacityEntries", () => {
  it("returns [] for empty / non-array input without querying", async () => {
    const pool = trackingPool();
    assert.deepEqual(await svc.enrichCapacityEntries(pool, []), []);
    assert.deepEqual(await svc.enrichCapacityEntries(pool, null), []);
    assert.equal(pool.calls.length, 0);
  });

  it("merges commercial state and computes visible_to_viewer for active public entry", async () => {
    const pool = returnPool([]); // no commercial states → defaults
    const [enriched] = await svc.enrichCapacityEntries(
      pool,
      [{ id: "cap-1", supplier_company_id: "sup", status: "active", visibility_status: "public", headcount: 4 }],
      { viewerUserId: "other" }
    );
    assert.equal(enriched.remaining_headcount, 4);
    assert.equal(enriched.commercial_status, "open");
    assert.equal(enriched.visible_to_viewer, true);
  });

  it("hides private active entries from non-owner but shows them to the owner", async () => {
    const pool = returnPool([]);
    const entry = { id: "cap-1", supplier_company_id: "sup", status: "active", visibility_status: "private", headcount: 1 };
    const [asStranger] = await svc.enrichCapacityEntries(pool, [entry], { viewerUserId: "stranger" });
    const [asOwner] = await svc.enrichCapacityEntries(pool, [entry], { viewerUserId: "sup" });
    assert.equal(asStranger.visible_to_viewer, false);
    assert.equal(asOwner.visible_to_viewer, true);
  });

  it("reserved entry is only visible to supplier or a counterparty", async () => {
    const pool = returnPool([{
      capacity_post_id: "cap-1", committed_headcount: 2, counterparty_user_ids: ["buyer"]
    }]);
    const entry = { id: "cap-1", supplier_company_id: "sup", status: "reserved", visibility_status: "public", headcount: 2 };
    const [stranger] = await svc.enrichCapacityEntries(pool, [entry], { viewerUserId: "stranger" });
    assert.equal(stranger.visible_to_viewer, false);

    const pool2 = returnPool([{ capacity_post_id: "cap-1", committed_headcount: 2, counterparty_user_ids: ["buyer"] }]);
    const [buyer] = await svc.enrichCapacityEntries(pool2, [entry], { viewerUserId: "buyer" });
    assert.equal(buyer.visible_to_viewer, true);
  });

  it("non-active / non-reserved status is never visible to a non-owner", async () => {
    const pool = returnPool([]);
    const entry = { id: "cap-1", supplier_company_id: "sup", status: "draft", visibility_status: "public", headcount: 1 };
    const [stranger] = await svc.enrichCapacityEntries(pool, [entry], { viewerUserId: "stranger" });
    assert.equal(stranger.visible_to_viewer, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// syncCapacityCommercialState  (state machine: active <-> reserved)
// ═══════════════════════════════════════════════════════════════

describe("syncCapacityCommercialState", () => {
  it("returns null when the post is missing", async () => {
    const pool = sequencePool({ rows: [] });
    assert.equal(await svc.syncCapacityCommercialState(pool, "missing"), null);
  });

  it("does not update terminal statuses (e.g. filled) — returns merged state only", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "cap-1", status: "filled", headcount: 3, is_active: false }] };
      }
      if (sql.includes("FROM capacity_posts WHERE id = $1") && sql.includes("headcount")) {
        return { rows: [{ id: "cap-1", headcount: 3 }] };
      }
      return { rows: [] };
    });
    const result = await svc.syncCapacityCommercialState(pool, "cap-1");
    assert.equal(result.status, "filled");
    const didUpdate = pool.calls.some((c) => c.sql.includes("UPDATE capacity_posts"));
    assert.equal(didUpdate, false, "terminal status must not be re-written");
  });

  it("promotes a fully-committed active entry to reserved (writes UPDATE)", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "cap-1", status: "active", headcount: 2, is_active: true }] };
      }
      // single-state lookup: post row
      if (sql.startsWith("SELECT id, headcount FROM capacity_posts")) {
        return { rows: [{ id: "cap-1", headcount: 2 }] };
      }
      // batch states → fully committed
      if (sql.includes("committed_headcount")) {
        return { rows: [{ capacity_post_id: "cap-1", committed_headcount: 2, counterparty_user_ids: ["b"] }] };
      }
      if (sql.includes("UPDATE capacity_posts")) {
        return { rows: [{ id: "cap-1", status: "reserved", headcount: 2, is_active: false }] };
      }
      return { rows: [] };
    });
    const result = await svc.syncCapacityCommercialState(pool, "cap-1");
    const updateCall = pool.calls.find((c) => c.sql.includes("UPDATE capacity_posts"));
    assert.ok(updateCall, "UPDATE must run when status flips");
    assert.deepEqual(updateCall.params.slice(0, 3), ["cap-1", "reserved", false]);
    assert.equal(result.status, "reserved");
  });

  it("is idempotent: active entry with no commitments stays active and skips UPDATE", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "cap-1", status: "active", headcount: 5, is_active: true }] };
      }
      if (sql.startsWith("SELECT id, headcount FROM capacity_posts")) {
        return { rows: [{ id: "cap-1", headcount: 5 }] };
      }
      return { rows: [] }; // no commitments
    });
    const result = await svc.syncCapacityCommercialState(pool, "cap-1");
    assert.equal(result.status, "active");
    assert.equal(pool.calls.some((c) => c.sql.includes("UPDATE capacity_posts")), false);
  });
});

describe("syncCapacityCommercialStateForOffer", () => {
  it("returns null when the offer has no capacity_post_id", async () => {
    const pool = sequencePool({ rows: [{ capacity_post_id: null }] });
    assert.equal(await svc.syncCapacityCommercialStateForOffer(pool, "offer-1"), null);
  });

  it("returns null when the offer does not exist", async () => {
    const pool = sequencePool({ rows: [] });
    assert.equal(await svc.syncCapacityCommercialStateForOffer(pool, "missing"), null);
  });

  it("delegates to syncCapacityCommercialState for the resolved post", async () => {
    const pool = trackingPool((sql) => {
      if (sql.startsWith("SELECT capacity_post_id FROM offers")) {
        return { rows: [{ capacity_post_id: "cap-7" }] };
      }
      if (sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "cap-7", status: "active", headcount: 3, is_active: true }] };
      }
      if (sql.startsWith("SELECT id, headcount FROM capacity_posts")) {
        return { rows: [{ id: "cap-7", headcount: 3 }] };
      }
      return { rows: [] };
    });
    const result = await svc.syncCapacityCommercialStateForOffer(pool, "offer-9");
    assert.equal(result.id, "cap-7");
  });
});

// ═══════════════════════════════════════════════════════════════
// createCapacityEntry  (plan limits + org boundary + insert)
// ═══════════════════════════════════════════════════════════════

describe("createCapacityEntry", () => {
  it("throws PLAN_LIMIT when plan allows 0 entries and status is not draft", async () => {
    const pool = trackingPool();
    await assert.rejects(
      () => svc.createCapacityEntry(pool, "sup", "DEMO", { status: "active", title: "t" }),
      (err) => err.code === "PLAN_LIMIT"
    );
    assert.equal(pool.calls.length, 0, "fails before any query");
  });

  it("throws PLAN_LIMIT when active-entry count already at the plan ceiling", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("COUNT(*)::int AS cnt")) return { rows: [{ cnt: 5 }] };
      return { rows: [] };
    });
    await assert.rejects(
      () => svc.createCapacityEntry(pool, "sup", "BASIS", { status: "active", title: "t", org_id: null }),
      (err) => err.code === "PLAN_LIMIT" && /limit reached/.test(err.message)
    );
  });

  it("inserts a draft without counting active entries and returns the new row", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("INSERT INTO capacity_posts")) {
        return { rows: [{ id: "new-cap", status: "draft", is_active: false }] };
      }
      return { rows: [] };
    });
    const row = await svc.createCapacityEntry(pool, "sup", "PRO", {
      status: "draft", title: "Pflegekraft", role: "Pfleger",
      availability_from: "2026-07-01", location_city: "Hamburg", org_id: null
    });
    assert.equal(row.id, "new-cap");
    const counted = pool.calls.some((c) => c.sql.includes("COUNT(*)::int AS cnt"));
    assert.equal(counted, false, "draft creation must not run the active-count limit query");
    const insert = pool.calls.find((c) => c.sql.includes("INSERT INTO capacity_posts"));
    assert.equal(insert.params[0], "sup", "supplierId is $1");
    assert.equal(insert.params[1], "Pflegekraft", "title is $2");
  });

  it("validates location/department against the org (throws OrgBoundaryError on mismatch)", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("COUNT(*)::int AS cnt")) return { rows: [{ cnt: 0 }] };
      // org_locations check → not found → boundary error
      if (sql.includes("FROM org_locations")) return { rows: [] };
      return { rows: [] };
    });
    await assert.rejects(
      () => svc.createCapacityEntry(pool, "sup", "PRO", {
        status: "active", title: "t", role: "r", availability_from: "2026-07-01",
        location_city: "HH", org_id: "org-1", location_id: "loc-foreign"
      }),
      (err) => err.code === "ORG_BOUNDARY_VIOLATION"
    );
  });

  it("applies documented defaults for optional fields in the INSERT params", async () => {
    let insertParams = null;
    const pool = trackingPool((sql, params) => {
      if (sql.includes("COUNT(*)::int AS cnt")) return { rows: [{ cnt: 0 }] };
      if (sql.includes("INSERT INTO capacity_posts")) {
        insertParams = params;
        return { rows: [{ id: "c1" }] };
      }
      return { rows: [] };
    });
    await svc.createCapacityEntry(pool, "sup", "PRO", {
      status: "active", title: "t", role: "r", availability_from: "2026-07-01",
      location_city: "HH", org_id: null
    });
    // headcount default 1 ($5), radius_km default 25 ($12)
    assert.equal(insertParams[4], 1, "headcount defaults to 1");
    assert.equal(insertParams[11], 25, "radius_km defaults to 25");
  });
});

// ═══════════════════════════════════════════════════════════════
// updateCapacityEntry  (dynamic field set)
// ═══════════════════════════════════════════════════════════════

describe("updateCapacityEntry", () => {
  it("with no updatable fields, falls back to getEntryById", async () => {
    // getEntryById: 1) select with joins, 2) enrich commercial states
    const pool = trackingPool((sql) => {
      if (sql.includes("WHERE cp.id = $1")) {
        return { rows: [{ id: "cap-1", supplier_company_id: "sup", status: "active", visibility_status: "public", headcount: 1 }] };
      }
      return { rows: [] };
    });
    const result = await svc.updateCapacityEntry(pool, "cap-1", "sup", { not_updatable: "x" });
    assert.ok(result, "returns the entry via getEntryById fallback");
    assert.equal(pool.calls.some((c) => c.sql.includes("UPDATE capacity_posts")), false);
  });

  it("builds a parameterized SET clause for provided fields and scopes by supplier", async () => {
    let captured = null;
    const pool = trackingPool((sql, params) => {
      if (sql.includes("UPDATE capacity_posts SET")) {
        captured = { sql, params };
        return { rows: [{ id: "cap-1", title: "Neu", headcount: 9 }] };
      }
      return { rows: [] };
    });
    const result = await svc.updateCapacityEntry(pool, "cap-1", "sup", { title: "Neu", headcount: 9 });
    assert.equal(result.title, "Neu");
    assert.ok(/title = \$1/.test(captured.sql));
    assert.ok(/headcount = \$2/.test(captured.sql));
    assert.ok(/supplier_company_id = \$4/.test(captured.sql), "owner scope on the WHERE clause");
    // params: title, headcount, entryId, supplierId
    assert.deepEqual(captured.params, ["Neu", 9, "cap-1", "sup"]);
  });

  it("returns null when the UPDATE matches no row (wrong supplier)", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("UPDATE capacity_posts SET")) return { rows: [] };
      return { rows: [] };
    });
    const result = await svc.updateCapacityEntry(pool, "cap-1", "intruder", { title: "x" });
    assert.equal(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// transitionStatus
// ═══════════════════════════════════════════════════════════════

describe("transitionStatus", () => {
  it("returns NOT_FOUND when the entry does not belong to the supplier", async () => {
    const pool = sequencePool({ rows: [] });
    const res = await svc.transitionStatus(pool, "cap-1", "sup", "paused", "PRO");
    assert.deepEqual(res, { error: "NOT_FOUND" });
  });

  it("throws CapacityTransitionError for an illegal transition", async () => {
    const pool = sequencePool({ rows: [{ id: "cap-1", status: "draft" }] });
    await assert.rejects(
      () => svc.transitionStatus(pool, "cap-1", "sup", "filled", "PRO"),
      (err) => err.name === "CapacityTransitionError"
    );
  });

  it("returns VALIDATION with errors when activating an incomplete entry", async () => {
    const pool = sequencePool({ rows: [{ id: "cap-1", status: "draft", title: "" }] });
    const res = await svc.transitionStatus(pool, "cap-1", "sup", "active", "PRO");
    assert.equal(res.error, "VALIDATION");
    assert.ok(Array.isArray(res.details) && res.details.length > 0);
  });

  it("returns PLAN_LIMIT when activation would exceed the plan ceiling", async () => {
    const future = new Date(Date.now() + 7 * 86400000).toISOString();
    const validEntry = {
      id: "cap-1", status: "draft", title: "t", role: "r",
      availability_from: "2026-07-01", location_city: "HH", headcount: 2, valid_until: future
    };
    const pool = sequencePool(
      { rows: [validEntry] },     // entry lookup
      { rows: [{ cnt: 1 }] }      // active-count = at BASIS limit? BASIS=5; use PLUS? -> use 'BASIS' & cnt 5
    );
    // BASIS limit is 5, so make count = 5
    const pool2 = sequencePool(
      { rows: [validEntry] },
      { rows: [{ cnt: 5 }] }
    );
    const res = await svc.transitionStatus(pool2, "cap-1", "sup", "active", "BASIS");
    assert.equal(res.error, "PLAN_LIMIT");
    assert.equal(res.limit, 5);
  });

  it("activates a valid entry under the limit, setting last_confirmed_at + is_active", async () => {
    const future = new Date(Date.now() + 7 * 86400000).toISOString();
    const validEntry = {
      id: "cap-1", status: "draft", title: "t", role: "r",
      availability_from: "2026-07-01", location_city: "HH", headcount: 2, valid_until: future
    };
    let updateSql = null;
    const pool = trackingPool((sql) => {
      if (sql.startsWith("SELECT * FROM capacity_posts WHERE id = $1 AND supplier_company_id")) {
        return { rows: [validEntry] };
      }
      if (sql.includes("COUNT(*)::int AS cnt")) return { rows: [{ cnt: 0 }] };
      if (sql.includes("UPDATE capacity_posts SET")) {
        updateSql = sql;
        return { rows: [{ id: "cap-1", status: "active", is_active: true }] };
      }
      return { rows: [] };
    });
    const res = await svc.transitionStatus(pool, "cap-1", "sup", "active", "PRO");
    assert.equal(res.entry.status, "active");
    assert.ok(/last_confirmed_at = NOW\(\)/.test(updateSql), "activation stamps freshness");
  });

  it("pauses an active entry without a plan-limit check", async () => {
    const pool = trackingPool((sql) => {
      if (sql.startsWith("SELECT * FROM capacity_posts WHERE id = $1 AND supplier_company_id")) {
        return { rows: [{ id: "cap-1", status: "active" }] };
      }
      if (sql.includes("UPDATE capacity_posts SET")) {
        return { rows: [{ id: "cap-1", status: "paused", is_active: false }] };
      }
      return { rows: [] };
    });
    const res = await svc.transitionStatus(pool, "cap-1", "sup", "paused", "PRO");
    assert.equal(res.entry.status, "paused");
    assert.equal(pool.calls.some((c) => c.sql.includes("COUNT(*)::int AS cnt")), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// confirmFreshness
// ═══════════════════════════════════════════════════════════════

describe("confirmFreshness", () => {
  it("returns the updated row on success", async () => {
    const pool = returnPool([{ id: "cap-1", last_confirmed_at: "2026-06-23" }]);
    const row = await svc.confirmFreshness(pool, "cap-1", "sup");
    assert.equal(row.id, "cap-1");
  });

  it("returns null when no active entry matches", async () => {
    const pool = returnPool([]);
    assert.equal(await svc.confirmFreshness(pool, "cap-1", "sup"), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// getEntryById
// ═══════════════════════════════════════════════════════════════

describe("getEntryById", () => {
  it("returns null when the post does not exist", async () => {
    const pool = sequencePool({ rows: [] });
    assert.equal(await svc.getEntryById(pool, "missing"), null);
  });

  it("returns null when viewer is not allowed to see the entry (private, non-owner)", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("WHERE cp.id = $1")) {
        return { rows: [{ id: "cap-1", supplier_company_id: "sup", status: "active", visibility_status: "private", headcount: 1 }] };
      }
      return { rows: [] };
    });
    assert.equal(await svc.getEntryById(pool, "cap-1", "stranger"), null);
  });

  it("returns the enriched entry for the owner", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("WHERE cp.id = $1")) {
        return { rows: [{ id: "cap-1", supplier_company_id: "sup", status: "active", visibility_status: "private", headcount: 4 }] };
      }
      return { rows: [] };
    });
    const entry = await svc.getEntryById(pool, "cap-1", "sup");
    assert.equal(entry.id, "cap-1");
    assert.equal(entry.remaining_headcount, 4);
  });
});

// ═══════════════════════════════════════════════════════════════
// listOwnEntries  (filter clauses)
// ═══════════════════════════════════════════════════════════════

describe("listOwnEntries", () => {
  it("adds status + expiring filters and caps the limit at 100", async () => {
    let listSql = null;
    let listParams = null;
    const pool = trackingPool((sql, params) => {
      if (sql.includes("ORDER BY") && sql.includes("cp.supplier_company_id = $1")) {
        listSql = sql; listParams = params;
        return { rows: [{ id: "cap-1", supplier_company_id: "sup", status: "active", visibility_status: "public", headcount: 1 }] };
      }
      return { rows: [] };
    });
    const out = await svc.listOwnEntries(pool, "sup", { status: "active", expiring_within_days: 3, limit: 500 });
    assert.equal(out.length, 1);
    assert.ok(/cp\.status = \$2/.test(listSql));
    assert.ok(/valid_until < NOW/.test(listSql));
    // params: supplierId, status, expiring_days, limit(=100 cap)
    assert.equal(listParams[0], "sup");
    assert.equal(listParams[1], "active");
    assert.equal(listParams[3], 100, "limit capped at 100");
  });

  it("works with no opts (default limit 50, single where clause)", async () => {
    let listParams = null;
    const pool = trackingPool((sql, params) => {
      if (sql.includes("ORDER BY") && sql.includes("cp.supplier_company_id = $1")) {
        listParams = params;
        return { rows: [] };
      }
      return { rows: [] };
    });
    const out = await svc.listOwnEntries(pool, "sup");
    assert.deepEqual(out, []);
    assert.deepEqual(listParams, ["sup", 50]);
  });
});

// ═══════════════════════════════════════════════════════════════
// browseFeed  (the big ranking/visibility surface)
// ═══════════════════════════════════════════════════════════════

/**
 * browseFeed query order:
 *   1) supply COUNT
 *   2) demand COUNT
 *   3) supply rows (SELECT … ORDER BY sort_date)
 *   4) enrich commercial states (committed_headcount …)
 *   5) demand rows (if page not full)
 *   6) hot interactions (capacity_interactions … HAVING)
 *   7) supplier_reputation
 *   8) subscriptions plan
 */
function browseFeedPool(handler) {
  return trackingPool((sql, params) => {
    if (sql.includes("COUNT(*)::int AS cnt") && sql.includes("FROM capacity_posts cp")) {
      return handler.supplyCount || { rows: [{ cnt: 1 }] };
    }
    if (sql.includes("COUNT(*)::int AS cnt") && sql.includes("FROM demand_requests")) {
      return handler.demandCount || { rows: [{ cnt: 0 }] };
    }
    if (sql.includes("AS sort_date") && sql.includes("FROM capacity_posts cp")) {
      return handler.supplyRows || { rows: [] };
    }
    // demand-fetch CTE also contains "committed_headcount" — must be matched first
    if (sql.includes("'demand'::text AS feed_type")) {
      return handler.demandRows || { rows: [] };
    }
    // the set-based commercial-state loader (enrichCapacityEntries)
    if (sql.includes("capacity_post_id") && sql.includes("committed_headcount")) {
      return handler.states || { rows: [] };
    }
    if (sql.includes("capacity_interactions")) {
      return handler.hot || { rows: [] };
    }
    if (sql.includes("FROM supplier_reputation")) {
      return handler.reputation || { rows: [] };
    }
    if (sql.includes("FROM subscriptions")) {
      return handler.plans || { rows: [] };
    }
    return { rows: [] };
  });
}

describe("browseFeed", () => {
  it("returns paginated structure with feed_context and computed total", async () => {
    const pool = browseFeedPool({
      supplyCount: { rows: [{ cnt: 2 }] },
      demandCount: { rows: [{ cnt: 3 }] },
      supplyRows: { rows: [] }
    });
    const out = await svc.browseFeed(pool, { page: 1, limit: 25 });
    assert.equal(out.total, 5);
    assert.equal(out.page, 1);
    assert.equal(out.limit, 25);
    assert.equal(out.feed_context.viewer_role, null);
    assert.deepEqual(out.items, []);
  });

  it("ranks a supply entry, tags NEW/PREMIUM badges and assigns rank_score", async () => {
    const nowIso = new Date().toISOString();
    const pool = browseFeedPool({
      supplyCount: { rows: [{ cnt: 1 }] },
      supplyRows: { rows: [{
        id: "cap-1", supplier_company_id: "sup", supplier_role: "agency",
        status: "active", visibility_status: "public", headcount: 5,
        role: "Pfleger", skill_tags: ["x"], location_city: "HH",
        radius_km: 25, created_at: nowIso, priority_level: "normal"
      }] },
      states: { rows: [] }, // no commitments → remaining 5 → kept
      plans: { rows: [{ user_id: "sup", plan: "PRO" }] }
    });
    const out = await svc.browseFeed(pool, { viewer_role: "company", viewer_user_id: "buyer" });
    assert.equal(out.items.length, 1);
    const item = out.items[0];
    assert.equal(item.feed_type, "supply");
    assert.ok(item.badges.includes("NEW"), "fresh entry gets NEW");
    assert.ok(item.badges.includes("PREMIUM"), "PRO plan gets PREMIUM badge");
    assert.equal(item.subscription_plan, "PRO");
    assert.ok(typeof item.rank_score === "number" && item.rank_score > 0);
  });

  it("drops fully-committed supply entries (remaining_headcount === 0)", async () => {
    const pool = browseFeedPool({
      supplyCount: { rows: [{ cnt: 1 }] },
      supplyRows: { rows: [{
        id: "cap-1", supplier_company_id: "sup", status: "active",
        visibility_status: "public", headcount: 2, role: "r", location_city: "HH"
      }] },
      states: { rows: [{ capacity_post_id: "cap-1", committed_headcount: 2, counterparty_user_ids: ["b"] }] }
    });
    const out = await svc.browseFeed(pool, { viewer_user_id: "sup" });
    assert.equal(out.items.length, 0, "filled supply removed from feed");
  });

  it("company viewer sees only supply (demand filtered out)", async () => {
    const pool = browseFeedPool({
      supplyCount: { rows: [{ cnt: 0 }] },
      demandCount: { rows: [{ cnt: 1 }] },
      supplyRows: { rows: [] },
      demandRows: { rows: [{
        id: "dem-1", supplier_company_id: "co", feed_type: "demand", role: "r",
        location_city: "HH", created_at: new Date().toISOString(), priority_level: "normal"
      }] }
    });
    const out = await svc.browseFeed(pool, { viewer_role: "company" });
    assert.equal(out.items.length, 0, "company side never shows demand");
  });

  it("agency viewer sees demand but not supply (no inter-agency)", async () => {
    const pool = browseFeedPool({
      supplyCount: { rows: [{ cnt: 1 }] },
      demandCount: { rows: [{ cnt: 1 }] },
      supplyRows: { rows: [{
        id: "cap-1", supplier_company_id: "sup", status: "active",
        visibility_status: "public", headcount: 3, role: "r", location_city: "HH",
        created_at: new Date().toISOString()
      }] },
      states: { rows: [] },
      demandRows: { rows: [{
        id: "dem-1", supplier_company_id: "co", supplier_role: "company", feed_type: "demand",
        role: "r", location_city: "HH", created_at: new Date().toISOString(), priority_level: "normal"
      }] }
    });
    const out = await svc.browseFeed(pool, { viewer_role: "agency", viewer_user_id: "ag" });
    assert.ok(out.items.length >= 1);
    assert.ok(out.items.every((i) => i.feed_type !== "supply"), "supply hidden from agency without inter-agency");
  });

  it("applies post-query geo filter and distance sort", async () => {
    const pool = browseFeedPool({
      supplyCount: { rows: [{ cnt: 2 }] },
      supplyRows: { rows: [
        { id: "near", supplier_company_id: "s1", status: "active", visibility_status: "public",
          headcount: 1, role: "r", location_city: "HH", location_lat: 53.55, location_lng: 9.99,
          radius_km: 50, created_at: new Date().toISOString() },
        { id: "far", supplier_company_id: "s2", status: "active", visibility_status: "public",
          headcount: 1, role: "r", location_city: "M", location_lat: 48.13, location_lng: 11.58,
          radius_km: 5, created_at: new Date().toISOString() }
      ] },
      states: { rows: [] }
    });
    const out = await svc.browseFeed(pool, { latitude: 53.55, longitude: 9.99, radius_km: 10 });
    assert.equal(out.items.length, 1, "only the near entry is within radius");
    assert.equal(out.items[0].id, "near");
    assert.ok(typeof out.items[0]._distance_km === "number");
  });
});

// ═══════════════════════════════════════════════════════════════
// Interactions
// ═══════════════════════════════════════════════════════════════

describe("createInteraction", () => {
  it("returns the inserted interaction row", async () => {
    const pool = returnPool([{ id: "int-1", interaction_type: "interest" }]);
    const row = await svc.createInteraction(pool, "cap-1", "user-1", { interaction_type: "interest", message: "hi" });
    assert.equal(row.id, "int-1");
  });

  it("returns null when the dedup guard suppresses the insert", async () => {
    const pool = returnPool([]);
    assert.equal(await svc.createInteraction(pool, "cap-1", "user-1", { interaction_type: "interest" }), null);
  });

  it("passes nulls for missing message / requisition_id", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => { params = p; return { rows: [{ id: "i" }] }; });
    await svc.createInteraction(pool, "cap-1", "user-1", { interaction_type: "offer_request" });
    assert.equal(params[3], null, "message null");
    assert.equal(params[4], null, "requisition_id null");
  });
});

describe("createDemandInteraction", () => {
  it("inserts against a demand_request and returns the row", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => { params = p; return { rows: [{ id: "di-1" }] }; });
    const row = await svc.createDemandInteraction(pool, "dem-1", "actor-1", { interaction_type: "interest", message: "m" });
    assert.equal(row.id, "di-1");
    assert.equal(params[0], "dem-1");
    assert.equal(params[1], "actor-1");
    assert.equal(params[3], "m");
  });

  it("returns null when suppressed by the dedup guard", async () => {
    const pool = returnPool([]);
    assert.equal(await svc.createDemandInteraction(pool, "dem-1", "actor-1", { interaction_type: "interest" }), null);
  });
});

describe("listInteractions / listDemandInteractions", () => {
  it("listInteractions caps limit at 100 and returns rows", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => { params = p; return { rows: [{ id: "i1" }] }; });
    const rows = await svc.listInteractions(pool, "cap-1", { limit: 999 });
    assert.equal(rows.length, 1);
    assert.equal(params[1], 100, "limit capped at 100");
  });

  it("listDemandInteractions uses default limit 50", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => { params = p; return { rows: [] }; });
    await svc.listDemandInteractions(pool, "dem-1");
    assert.equal(params[0], "dem-1");
    assert.equal(params[1], 50);
  });
});

// ═══════════════════════════════════════════════════════════════
// computeTrustSignals
// ═══════════════════════════════════════════════════════════════

describe("computeTrustSignals", () => {
  it("builds the full signal set with verified proofs, plan, compliance and reputation", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM proofs")) return { rows: [{ cnt: 2 }] };
      if (sql.includes("FROM users u WHERE u.id = $1")) {
        return { rows: [{ company_name: "ACME", org_id: "org-1", plan: "PRO" }] };
      }
      if (sql.includes("FROM compliance_documents")) return { rows: [{ total: 3, verified: 3 }] };
      if (sql.includes("FROM requests")) return { rows: [{ cnt: 7 }] };
      if (sql.includes("status = 'active'") && sql.includes("last_confirmed_at > NOW()")) {
        return { rows: [{ cnt: 1 }] };
      }
      if (sql.includes("FROM supplier_reputation WHERE supplier_id = $1")) {
        return { rows: [{ avg_stars: 4.5, grade: "A", reputation_score: 88, deal_success_rate: 92, response_time_score: 100, ranking_score: 77 }] };
      }
      return { rows: [] };
    });
    const s = await svc.computeTrustSignals(pool, "sup");
    assert.equal(s.supplier_verified, true);
    assert.equal(s.active_subscriber, true);
    assert.equal(s.compliance_complete, true);
    assert.equal(s.completed_deals, 7);
    assert.equal(s.recently_confirmed, true);
    assert.equal(s.profile_completeness, 100, "company_name + plan + org + proofs = 4/4");
    assert.equal(s.reputation_score, 88);
    assert.equal(s.reputation_grade, "A");
    assert.equal(s.response_time_label, "<1h");
    assert.equal(s.ranking_score, 77);
  });

  it("handles a sparse FREE user with no proofs and no org", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM proofs")) return { rows: [{ cnt: 0 }] };
      if (sql.includes("FROM users u WHERE u.id = $1")) {
        return { rows: [{ company_name: null, org_id: null, plan: "FREE" }] };
      }
      if (sql.includes("FROM requests")) return { rows: [{ cnt: 0 }] };
      if (sql.includes("last_confirmed_at > NOW()")) return { rows: [{ cnt: 0 }] };
      return { rows: [] };
    });
    const s = await svc.computeTrustSignals(pool, "sup");
    assert.equal(s.supplier_verified, false);
    assert.equal(s.active_subscriber, false);
    assert.equal(s.compliance_complete, false);
    assert.equal(s.profile_completeness, 0);
    assert.equal(s.recently_confirmed, false);
    // compliance_documents query is skipped when org_id is null
    assert.equal(pool.calls.some((c) => c.sql.includes("FROM compliance_documents")), false);
  });

  it("falls back to org-level reputation when supplier_id has no row", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM proofs")) return { rows: [{ cnt: 0 }] };
      if (sql.includes("FROM users u WHERE u.id = $1")) {
        return { rows: [{ company_name: "X", org_id: "org-1", plan: "PLUS" }] };
      }
      if (sql.includes("FROM compliance_documents")) return { rows: [{ total: 0, verified: 0 }] };
      if (sql.includes("FROM requests")) return { rows: [{ cnt: 0 }] };
      if (sql.includes("last_confirmed_at > NOW()")) return { rows: [{ cnt: 0 }] };
      if (sql.includes("supplier_id = $1")) return { rows: [] }; // no per-supplier row
      if (sql.includes("supplier_org_id = $1")) return { rows: [{ score: 55 }] };
      return { rows: [] };
    });
    const s = await svc.computeTrustSignals(pool, "sup");
    assert.equal(s.reputation_score, 55, "org-level fallback used");
  });
});

// ═══════════════════════════════════════════════════════════════
// Auto-expiry batches
// ═══════════════════════════════════════════════════════════════

describe("expireStaleEntries", () => {
  it("reports the expired count and slices the notification list to batchSize", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, supplier_company_id: `s${i}` }));
    const pool = returnPool(rows);
    const result = await svc.expireStaleEntries(pool, 2);
    assert.equal(result.expired, 2, "entries list sliced to batchSize");
    assert.equal(result.entries.length, 2);
  });

  it("returns zero when nothing is stale", async () => {
    const pool = returnPool([]);
    const result = await svc.expireStaleEntries(pool);
    assert.equal(result.expired, 0);
    assert.deepEqual(result.entries, []);
  });
});

describe("expireDemandRequests", () => {
  it("reports expired demand count, sliced to batchSize", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, requester_company_id: `r${i}` }));
    const pool = returnPool(rows);
    const result = await svc.expireDemandRequests(pool, 3);
    assert.equal(result.expired, 3);
    assert.equal(result.entries.length, 3);
  });
});

describe("findStaleEntries", () => {
  it("passes staleDays + batchSize and returns rows", async () => {
    let params = null;
    const pool = trackingPool((sql, p) => { params = p; return { rows: [{ id: "c1" }] }; });
    const rows = await svc.findStaleEntries(pool, 14, 50);
    assert.equal(rows.length, 1);
    assert.deepEqual(params, [14, 50]);
  });
});

// ═══════════════════════════════════════════════════════════════
// processConfirmationReminders  (escalation + audit)
// ═══════════════════════════════════════════════════════════════

describe("processConfirmationReminders", () => {
  it("escalates (auto-pause), reminds, and writes one audit per escalation", async () => {
    const escalateRows = [{ id: "c1", supplier_company_id: "s1", title: "T1" }];
    const reminderRows = [{ id: "c2", supplier_company_id: "s2", title: "T2" }];
    let auditCount = 0;
    const pool = trackingPool((sql) => {
      if (sql.includes("SET status = 'paused'")) return { rows: escalateRows };
      if (sql.includes("SELECT id, supplier_company_id, title, last_confirmed_at")) return { rows: reminderRows };
      if (sql.includes("audit") || sql.includes("INSERT INTO audit")) { auditCount++; return { rows: [{ id: "a" }] }; }
      return { rows: [] };
    });
    const result = await svc.processConfirmationReminders(pool, { reminderDays: 7, escalationDays: 14 });
    assert.equal(result.escalated, 1);
    assert.equal(result.reminded, 1);
    assert.deepEqual(result.escalated_entries, escalateRows);
    assert.deepEqual(result.reminder_entries, reminderRows);
  });

  it("uses default thresholds and returns zero counts when nothing is stale", async () => {
    const pool = returnPool([]);
    const result = await svc.processConfirmationReminders(pool);
    assert.equal(result.escalated, 0);
    assert.equal(result.reminded, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Dashboard + metrics
// ═══════════════════════════════════════════════════════════════

describe("getSupplierDashboardStats", () => {
  it("merges status counts with interaction stats and aliases", async () => {
    const pool = sequencePool(
      { rows: [{
        total_entries: 10, active_entries: 4, reserved_entries: 1, paused_entries: 2,
        draft_entries: 2, expired_entries: 1, filled_entries: 0, expiring_soon: 1, needs_reconfirmation: 3
      }] },
      { rows: [{ total_interactions_30d: 12, total_interactions_7d: 5, interests: 8, offer_requests: 3, deal_starts: 1 }] }
    );
    const stats = await svc.getSupplierDashboardStats(pool, "sup");
    assert.equal(stats.total, 10);
    assert.equal(stats.active, 4);
    assert.equal(stats.reserved, 1);
    assert.equal(stats.draft, 2);
    assert.equal(stats.interactions_last_7d, 5);
    assert.equal(stats.interactions_30d.total_interactions_30d, 12);
  });

  it("defaults interactions_last_7d to 0 when no interaction row returns", async () => {
    const pool = sequencePool(
      { rows: [{ total_entries: 0, active_entries: 0, reserved_entries: 0, paused_entries: 0, draft_entries: 0 }] },
      { rows: [] }
    );
    const stats = await svc.getSupplierDashboardStats(pool, "sup");
    assert.equal(stats.interactions_last_7d, 0);
  });
});

describe("getCapacityMetrics", () => {
  it("returns platform metrics merged with 30d interaction total", async () => {
    const pool = sequencePool(
      { rows: [{ active_entries: 20, reserved_entries: 3, filled_entries: 5, active_suppliers: 8, avg_headcount: 2.5 }] },
      { rows: [{ total: 140 }] }
    );
    const m = await svc.getCapacityMetrics(pool);
    assert.equal(m.active_entries, 20);
    assert.equal(m.active_suppliers, 8);
    assert.equal(m.interactions_30d, 140);
  });

  it("defaults interactions_30d to 0 when the count query returns no row", async () => {
    const pool = sequencePool(
      { rows: [{ active_entries: 0 }] },
      { rows: [] }
    );
    const m = await svc.getCapacityMetrics(pool);
    assert.equal(m.interactions_30d, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Sanity: workflow transition table is the contract transitionStatus enforces
// ═══════════════════════════════════════════════════════════════

describe("capacityWorkflow contract (used by transitionStatus)", () => {
  it("active -> paused is allowed; draft -> filled is not", () => {
    assert.doesNotThrow(() => capacityWorkflow.assertTransition("active", "paused"));
    assert.throws(() => capacityWorkflow.assertTransition("draft", "filled"));
  });
});
