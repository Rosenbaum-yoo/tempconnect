import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { browseFeed, getEntryById } from "../services/capacityExchangeService.js";

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function buildVisibilityPool({ supplyRows = [], commercialStates = [] }) {
  return {
    query: async (sql, params = []) => {
      if (sql.includes("SELECT COUNT(*)::int AS cnt") && sql.includes("FROM capacity_posts cp")) {
        return { rows: [{ cnt: supplyRows.length }], rowCount: 1 };
      }
      if (sql.includes("FROM demand_requests") && sql.includes("COUNT(*)::int AS cnt")) {
        return { rows: [{ cnt: 0 }], rowCount: 1 };
      }
      if (sql.includes("FROM capacity_posts cp") && sql.includes("ORDER BY sort_date DESC")) {
        return { rows: cloneRows(supplyRows), rowCount: supplyRows.length };
      }
      if (sql.includes("FROM demand_requests dr") && sql.includes("ORDER BY COALESCE(dr.updated_at, dr.created_at) DESC")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("cp.id AS capacity_post_id")) {
        const ids = Array.isArray(params[0]) ? params[0] : [];
        const rows = commercialStates
          .filter((row) => ids.includes(row.capacity_post_id))
          .map((row) => ({ ...row }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("SELECT") && sql.includes("FROM capacity_posts cp") && sql.includes("WHERE cp.id = $1")) {
        const row = supplyRows.find((entry) => entry.id === params[0]);
        return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes("FROM capacity_interactions")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM supplier_reputation")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM subscriptions")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}

function buildSupplyRow(overrides = {}) {
  const now = "2026-04-15T10:00:00.000Z";
  return {
    id: "capacity-1",
    title: "Schweisserpool Hamburg",
    role: "Schweisser",
    skill_tags: [],
    headcount: 4,
    availability_from: "2026-04-15",
    availability_to: "2026-04-30",
    location_city: "Hamburg",
    location_postal: "20095",
    location_lat: null,
    location_lng: null,
    radius_km: 25,
    price_type: null,
    price_min: null,
    price_max: null,
    price_hint: null,
    is_active: false,
    is_search_agent: false,
    status: "reserved",
    worker_category: "blue_collar",
    compliance_status: "complete",
    shift_model: null,
    employment_type: "temporary",
    priority_level: "normal",
    visibility_status: "public",
    supplier_company_id: "agency-1",
    supplier_company_name: "Staff GmbH",
    supplier_role: "agency",
    supplier_email: "ops@staff.example",
    org_name: "Staff GmbH",
    supplier_logo_url: null,
    last_confirmed_at: now,
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

describe("capacity commercial visibility after deal close", () => {
  it("shows fully reserved capacity in the company feed only to the actual counterparty", async () => {
    const reservedRow = buildSupplyRow();
    const pool = buildVisibilityPool({
      supplyRows: [reservedRow],
      commercialStates: [{
        capacity_post_id: "capacity-1",
        committed_headcount: 4,
        active_offer_count: 1,
        assigned_headcount: 2,
        staffing_reserved_headcount: 1,
        counterparty_user_ids: ["company-1"]
      }]
    });

    const counterpartyFeed = await browseFeed(pool, {
      viewer_role: "company",
      viewer_user_id: "company-1",
      page: 1,
      limit: 25
    });
    assert.equal(counterpartyFeed.items.length, 1);
    assert.equal(counterpartyFeed.items[0].id, "capacity-1");
    assert.equal(counterpartyFeed.items[0].remaining_headcount, 0);
    assert.equal(counterpartyFeed.items[0].commercial_status, "reserved");

    const unrelatedFeed = await browseFeed(pool, {
      viewer_role: "company",
      viewer_user_id: "company-2",
      page: 1,
      limit: 25
    });
    assert.equal(unrelatedFeed.items.length, 0);
  });

  it("keeps partially committed capacity in the public company feed with remaining headcount", async () => {
    const partialRow = buildSupplyRow({
      id: "capacity-2",
      headcount: 5,
      status: "active",
      is_active: true
    });
    const pool = buildVisibilityPool({
      supplyRows: [partialRow],
      commercialStates: [{
        capacity_post_id: "capacity-2",
        committed_headcount: 3,
        active_offer_count: 1,
        assigned_headcount: 1,
        staffing_reserved_headcount: 1,
        counterparty_user_ids: ["company-1"]
      }]
    });

    const feed = await browseFeed(pool, {
      viewer_role: "company",
      viewer_user_id: "company-9",
      page: 1,
      limit: 25
    });

    assert.equal(feed.items.length, 1);
    assert.equal(feed.items[0].id, "capacity-2");
    assert.equal(feed.items[0].status, "active");
    assert.equal(feed.items[0].remaining_headcount, 2);
    assert.equal(feed.items[0].commercial_status, "partially_committed");
    assert.equal(feed.items[0].is_partially_committed, true);
    assert.equal(feed.items[0].is_fully_committed, false);
  });

  it("keeps reserved capacity detail visible to supplier and deal counterparty but hides it from outsiders", async () => {
    const reservedRow = buildSupplyRow();
    const pool = buildVisibilityPool({
      supplyRows: [reservedRow],
      commercialStates: [{
        capacity_post_id: "capacity-1",
        committed_headcount: 4,
        active_offer_count: 1,
        assigned_headcount: 2,
        staffing_reserved_headcount: 1,
        counterparty_user_ids: ["company-1"]
      }]
    });

    const supplierDetail = await getEntryById(pool, "capacity-1", "agency-1");
    assert.ok(supplierDetail);
    assert.equal(supplierDetail.commercial_visibility, "counterparty_only");
    assert.equal(supplierDetail.commercial_status, "reserved");

    const counterpartyDetail = await getEntryById(pool, "capacity-1", "company-1");
    assert.ok(counterpartyDetail);
    assert.equal(counterpartyDetail.committed_headcount, 4);

    const outsiderDetail = await getEntryById(pool, "capacity-1", "company-2");
    assert.equal(outsiderDetail, null);
  });
});
