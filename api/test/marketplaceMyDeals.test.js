import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";
import { createMarketplaceRouter } from "../routes/marketplace.js";

function createTestApp(userId, pool) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId };
    next();
  });
  const noop = (_req, _res, next) => next();
  app.use("/api", createMarketplaceRouter({
    pool,
    requireAuth: noop,
    requireFeature: () => noop,
    sendMail: async () => true,
    getUserAndPlan: async () => ({ id: userId, role: "company", plan: "PRO" }),
    logger: { error() {}, warn() {}, info() {} }
  }));
  return app;
}

function makeMyDealsPool() {
  const baseDeal = {
    id: "offer-1",
    status: "accepted",
    agreement_status: "pending_confirmation",
    agreement_ref: "EV-2026-000001",
    agreement_version: 1,
    offered_quantity: 3,
    offered_hourly_rate: 42.5,
    start_confirmed: "2026-04-01",
    end_date: "2026-04-30",
    created_at: "2026-04-01T08:00:00.000Z",
    updated_at: "2026-04-02T09:30:00.000Z",
    activated_at: null,
    assignment_id: null,
    capacity_post_id: "capacity-1",
    demand_title: "Zustimmung: Schweisserpool Hamburg",
    demand_role: "Schweisser",
    demand_location: "Hamburg",
    demand_start: "2026-04-01",
    demand_end: "2026-04-30",
    demand_headcount: 3,
    requester_company_id: "company-1",
    requester_company_name: "Nordbau GmbH",
    supplier_company_name: "Staff GmbH",
    supplier_company_id: "supplier-1",
    capacity_title: "Schweisserpool Hamburg",
    capacity_role: "Schweisser",
    capacity_location: "Hamburg",
    capacity_headcount: 5,
    capacity_status: "active",
    capacity_availability_from: "2026-04-01",
    capacity_availability_to: "2026-04-30"
  };
  return {
    query: async (sql, params) => {
      if (sql.includes("FROM offers o") && sql.includes("AS deal_history_sort_at")) {
        const viewerId = params[0];
        if (viewerId !== "supplier-1" && viewerId !== "company-1") {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [baseDeal], rowCount: 1 };
      }
      if (sql.includes("cp.id AS capacity_post_id") && sql.includes("WHERE cp.id = ANY($1)")) {
        return {
          rows: [{
            capacity_post_id: "capacity-1",
            committed_headcount: 3,
            active_offer_count: 1,
            assigned_headcount: 1,
            staffing_reserved_headcount: 1,
            counterparty_user_ids: ["company-1"]
          }],
          rowCount: 1
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}

function makeMyDealsHistoryMetaPool() {
  const completedDeal = {
    id: "offer-completed-legacy",
    status: "accepted",
    agreement_status: "activated",
    agreement_ref: "EV-2025-000321",
    agreement_version: 2,
    offered_quantity: 4,
    offered_hourly_rate: 39,
    start_confirmed: "2025-12-01",
    end_date: "2025-12-31",
    created_at: "2025-11-20T08:00:00.000Z",
    updated_at: "2025-12-12T09:30:00.000Z",
    activated_at: "2025-12-12T09:30:00.000Z",
    assignment_id: "assignment-1",
    capacity_post_id: null,
    demand_title: "Altbestand Schweisser Winterprojekt",
    demand_role: "Schweisser",
    demand_location: "Bremen",
    demand_start: "2025-12-01",
    demand_end: "2025-12-31",
    demand_headcount: 4,
    requester_company_id: "company-1",
    requester_company_name: "Nordbau GmbH",
    supplier_company_name: "Legacy Staff GmbH",
    supplier_company_id: "supplier-legacy",
    capacity_title: null,
    capacity_role: null,
    capacity_location: null,
    capacity_headcount: null,
    capacity_status: null,
    capacity_availability_from: null,
    capacity_availability_to: null
  };
  const activeDeal = {
    id: "offer-active-current",
    status: "accepted",
    agreement_status: "confirmed",
    agreement_ref: "EV-2026-000888",
    agreement_version: 1,
    offered_quantity: 2,
    offered_hourly_rate: 44,
    start_confirmed: "2026-04-20",
    end_date: "2026-05-20",
    created_at: "2026-04-10T08:00:00.000Z",
    updated_at: "2026-04-15T08:30:00.000Z",
    activated_at: null,
    assignment_id: null,
    capacity_post_id: null,
    demand_title: "Akutbedarf Industriemechaniker",
    demand_role: "Industriemechaniker",
    demand_location: "Hamburg",
    demand_start: "2026-04-20",
    demand_end: "2026-05-20",
    demand_headcount: 2,
    requester_company_id: "company-1",
    requester_company_name: "Nordbau GmbH",
    supplier_company_name: "Current Staff GmbH",
    supplier_company_id: "supplier-current",
    capacity_title: null,
    capacity_role: null,
    capacity_location: null,
    capacity_headcount: null,
    capacity_status: null,
    capacity_availability_from: null,
    capacity_availability_to: null
  };
  return {
    query: async (sql) => {
      if (sql.includes("COUNT(*) FILTER (WHERE")) {
        return {
          rows: [{
            active_count: 125,
            completed_count: 2,
            cancelled_count: 1,
            all_count: 128,
            active_headcount: 260,
            completed_headcount: 6,
            cancelled_headcount: 1,
            all_headcount: 267,
            action_required_count: 7
          }],
          rowCount: 1
        };
      }
      if (sql.includes("FROM offers o") && sql.includes("AS deal_history_sort_at")) {
        if (sql.includes("= 'activated'")) {
          return { rows: [completedDeal], rowCount: 1 };
        }
        if (sql.includes("NOT IN ('activated','cancelled','expired')")) {
          return { rows: [activeDeal], rowCount: 1 };
        }
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}
describe("GET /marketplace/my-deals", () => {
  it("returns capacity-origin enrichment and supplier-side action state", async () => {
    const app = createTestApp("supplier-1", makeMyDealsPool());

    const res = await supertest(app)
      .get("/api/marketplace/my-deals")
      .expect(200);

    assert.equal(res.body.length, 1);
    const deal = res.body[0];
    assert.equal(deal.viewer_role, "supplier");
    assert.equal(deal.counterparty_name, "Nordbau GmbH");
    assert.equal(deal.action_required, "action_required");
    assert.equal(deal.subject_type, "capacity");
    assert.equal(deal.subject_title, "Schweisserpool Hamburg");
    assert.equal(deal.deal_headcount, 3);
    assert.equal(deal.capacity_remaining_headcount, 2);
    assert.equal(deal.capacity_committed_headcount, 3);
    assert.equal(deal.capacity_commercial_status, "partially_committed");
    assert.equal(deal.capacity_is_partially_committed, true);
    assert.equal(deal.capacity_is_fully_committed, false);
  });
  it("returns requester-side counterparty mapping for the same capacity-origin deal", async () => {
    const app = createTestApp("company-1", makeMyDealsPool());

    const res = await supertest(app)
      .get("/api/marketplace/my-deals")
      .expect(200);

    assert.equal(res.body.length, 1);
    const deal = res.body[0];
    assert.equal(deal.viewer_role, "requester");
    assert.equal(deal.counterparty_name, "Staff GmbH");
    assert.equal(deal.action_required, "waiting");
    assert.equal(deal.subject_type, "capacity");
    assert.equal(deal.subject_title, "Schweisserpool Hamburg");
    assert.equal(deal.capacity_remaining_headcount, 2);
    assert.equal(deal.capacity_has_active_deal, true);
  });

  it("returns paginated completed-deal metadata so older activations remain available despite many active deals", async () => {
    const app = createTestApp("company-1", makeMyDealsHistoryMetaPool());

    const res = await supertest(app)
      .get("/api/marketplace/my-deals?include_meta=1&status=completed&limit=1&offset=0")
      .expect(200);

    assert.equal(res.body.items.length, 1);
    assert.deepStrictEqual(res.body.counts, {
      active: 125,
      completed: 2,
      cancelled: 1,
      all: 128
    });
    assert.deepStrictEqual(res.body.headcounts, {
      active: 260,
      completed: 6,
      cancelled: 1,
      all: 267
    });
    assert.deepStrictEqual(res.body.kpis, { action_required: 7 });
    assert.deepStrictEqual(res.body.filters, {
      status: "completed",
      q: null
    });
    assert.equal(res.body.pagination.total, 2);
    assert.equal(res.body.pagination.has_more, true);

    const deal = res.body.items[0];
    assert.equal(deal.deal_history_bucket, "completed");
    assert.equal(deal.action_required, "completed");
    assert.equal(deal.subject_type, "demand");
    assert.equal(deal.subject_title, "Altbestand Schweisser Winterprojekt");
    assert.equal(deal.agreement_ref, "EV-2025-000321");
    assert.equal(deal.counterparty_name, "Legacy Staff GmbH");
  });
});
