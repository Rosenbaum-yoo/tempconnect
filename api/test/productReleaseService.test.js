/**
 * Product release targeting — unit tests (no DB).
 * Run: node --test --test-force-exit api/test/productReleaseService.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  planTier,
  entryVisibleForUser,
  markAllSeenForUser
} from "../services/productReleaseService.js";

describe("planTier", () => {
  it("ranks plans for min_plan gating", () => {
    assert.equal(planTier("DEMO"), 0);
    assert.equal(planTier("BASIS"), 1);
    assert.equal(planTier("PLUS"), 2);
    assert.equal(planTier("PRO"), 3);
    assert.equal(planTier("ENTERPRISE"), 4);
  });
});

describe("entryVisibleForUser", () => {
  const baseRow = {
    status: "published",
    visibility: "public",
    published_at: new Date(Date.now() - 86400000).toISOString(),
    audiences: [],
    min_plan: null,
    required_feature_key: null
  };

  const companyPlus = {
    userRole: "company",
    orgRole: "owner",
    plan: "PLUS",
    isInternalViewer: false
  };

  it("hides draft from non-internal viewers", () => {
    assert.equal(
      entryVisibleForUser({ ...baseRow, status: "draft" }, companyPlus),
      false
    );
    assert.equal(
      entryVisibleForUser({ ...baseRow, status: "draft" }, { ...companyPlus, isInternalViewer: true }),
      true
    );
  });

  it("hides internal visibility from customers", () => {
    assert.equal(
      entryVisibleForUser({ ...baseRow, visibility: "internal" }, companyPlus),
      false
    );
    assert.equal(
      entryVisibleForUser({ ...baseRow, visibility: "internal" }, { ...companyPlus, isInternalViewer: true }),
      true
    );
  });

  it("enforces min_plan", () => {
    assert.equal(
      entryVisibleForUser({ ...baseRow, min_plan: "PRO" }, companyPlus),
      false
    );
    assert.equal(
      entryVisibleForUser({ ...baseRow, min_plan: "PLUS" }, companyPlus),
      true
    );
  });

  it("filters by audience OR (company tag)", () => {
    assert.equal(
      entryVisibleForUser({ ...baseRow, audiences: ["agency"] }, companyPlus),
      false
    );
    assert.equal(
      entryVisibleForUser({ ...baseRow, audiences: ["company"] }, companyPlus),
      true
    );
  });

  it("matches supplier_user via org role", () => {
    const ctx = { userRole: "company", orgRole: "supplier_user", plan: "PRO", isInternalViewer: false };
    assert.equal(entryVisibleForUser({ ...baseRow, audiences: ["supplier_user"] }, ctx), true);
    assert.equal(entryVisibleForUser({ ...baseRow, audiences: ["company"] }, ctx), true);
  });
});

describe("markAllSeenForUser (bulk ack, no N+1)", () => {
  function recordingPool(...responses) {
    let idx = 0;
    const calls = [];
    return {
      calls,
      query: async (sql, params) => {
        calls.push({ sql, params });
        return responses[idx++] || { rows: [] };
      }
    };
  }

  const getUserAndPlan = async () => ({ plan: "PRO", org_role: null });
  const pubRow = (id) => ({
    id, status: "published", visibility: "public",
    published_at: new Date(Date.now() - 86400000).toISOString(),
    audiences: [], min_plan: null, required_feature_key: null, show_in_app: true
  });

  it("acknowledges all visible published entries in a single bulk INSERT", async () => {
    const pool = recordingPool(
      { rows: [{ id: "u-1", role: "company" }] },   // loadReleaseContext: users
      { rows: [{ internal: false }] },              // loadReleaseContext: internal flag
      { rows: [pubRow("r-1"), pubRow("r-2"), { ...pubRow("r-3"), status: "draft", published_at: null }] },
      { rows: [] }                                  // bulk insert
    );

    const n = await markAllSeenForUser(pool, "u-1", getUserAndPlan);
    assert.equal(n, 2); // only the two published+visible entries (draft filtered out)
    // exactly 4 queries: 2× context + 1× list + 1× bulk insert (NOT 1 insert per entry)
    assert.equal(pool.calls.length, 4);
    const insert = pool.calls[3];
    assert.match(insert.sql, /INSERT INTO user_product_release_ack/);
    assert.match(insert.sql, /UNNEST\(\$2::uuid\[\]\)/);
    assert.deepEqual(insert.params, ["u-1", ["r-1", "r-2"]]);
  });

  it("issues no INSERT when nothing is visible", async () => {
    const pool = recordingPool(
      { rows: [{ id: "u-1", role: "company" }] },
      { rows: [{ internal: false }] },
      { rows: [] } // no entries
    );
    const n = await markAllSeenForUser(pool, "u-1", getUserAndPlan);
    assert.equal(n, 0);
    assert.equal(pool.calls.length, 3); // no 4th insert query
  });
});
