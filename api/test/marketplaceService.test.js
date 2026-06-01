/**
 * Marketplace Service unit tests.
 * Tests offer state machine, SLA logic, demand creation, cron jobs.
 * Uses mock pool — no database required.
 *
 * Run: node --test --test-force-exit test/marketplaceService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  updateOfferStatus, counterOffer, withdrawOffer, acceptOffer,
  syncDemandCommercialState,
  createDemandRequest, markDemandSlaMet,
  recordDemandMatchingAttempt, recordDemandNotificationSent,
  demandSlaScan, notdienstEscalationDemands, markMatchesNotified,
  getVerifiedSupplierIds
} from "../services/marketplaceService.js";

// ── Mock factories ────────────────────────────────────────────
function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) throw new Error(`Unexpected query #${idx + 1}`);
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

const UUID = "00000000-0000-4000-8000-000000000001";
const UUID2 = "00000000-0000-4000-8000-000000000002";

function buildDemandSyncHarness({ offer, demand, aggregate, updatedOffer, extraQueryHandler }) {
  const calls = [];
  const demandRow = {
    id: offer.demand_request_id,
    status: demand.status ?? "open",
    headcount: demand.headcount ?? demand.required_total_count ?? 1,
    required_total_count: demand.required_total_count ?? demand.headcount ?? 1,
    currently_committed_count: demand.currently_committed_count ?? 0,
    remaining_open_count: demand.remaining_open_count ?? Math.max((demand.required_total_count ?? demand.headcount ?? 1) - (demand.currently_committed_count ?? 0), 0)
  };
  const aggregateRow = {
    demand_request_id: offer.demand_request_id,
    required_total_count: aggregate.required_total_count ?? demandRow.required_total_count,
    committed_headcount: aggregate.committed_headcount ?? 0,
    active_offer_count: aggregate.active_offer_count ?? 0,
    is_capacity_origin: aggregate.is_capacity_origin === true
  };
  const nextRequired = Number(aggregateRow.required_total_count) || demandRow.required_total_count;
  const nextCommitted = Number(aggregateRow.committed_headcount) || 0;
  const nextRemaining = Math.max(nextRequired - nextCommitted, 0);
  const nextStatus = nextCommitted === 0 ? "open" : nextRemaining === 0 ? "fulfilled" : "partially_covered";
  const updatedDemand = {
    ...demandRow,
    status: nextStatus,
    required_total_count: nextRequired,
    currently_committed_count: nextCommitted,
    remaining_open_count: nextRemaining
  };

  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (typeof extraQueryHandler === "function") {
        const maybe = extraQueryHandler({ sql, params, calls });
        if (maybe !== undefined) return maybe;
      }
      if (sql.includes("FROM offers o")) {
        return { rows: [offer], rowCount: 1 };
      }
      if (sql.includes("UPDATE offers SET status = $1")) {
        return { rows: [updatedOffer || { ...offer, status: "accepted" }], rowCount: 1 };
      }
      if (sql.includes("FROM demand_requests") && sql.includes("FOR UPDATE")) {
        return { rows: [demandRow], rowCount: 1 };
      }
      if (sql.includes("SELECT id, headcount, required_total_count, currently_committed_count, remaining_open_count")) {
        return { rows: [demandRow], rowCount: 1 };
      }
      if (sql.includes("dr.id AS demand_request_id")) {
        return { rows: [aggregateRow], rowCount: 1 };
      }
      if (sql.includes("UPDATE demand_requests")) {
        return { rows: [updatedDemand], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  return { pool, calls, updatedDemand };
}

// ═══════════════════════════════════════════════════════════════
// updateOfferStatus — state machine + access control
// ═══════════════════════════════════════════════════════════════

describe("updateOfferStatus — state transitions", () => {
  const BASE_OFFER = {
    id: UUID, status: "draft",
    supplier_company_id: "supplier-1",
    requester_company_id: "requester-1",
    demand_request_id: UUID2
  };

  it("draft→sent by supplier succeeds", async () => {
    const pool = sequencePool(
      { rows: [BASE_OFFER] },          // getOfferById
      { rows: [{ ...BASE_OFFER, status: "sent" }] }  // UPDATE
    );
    const result = await updateOfferStatus(pool, UUID, "sent", "supplier-1");
    assert.ok(result.offer);
    assert.strictEqual(result.offer.status, "sent");
  });

  it("draft→sent by non-supplier returns FORBIDDEN", async () => {
    const pool = sequencePool({ rows: [BASE_OFFER] });
    const result = await updateOfferStatus(pool, UUID, "sent", "requester-1");
    assert.strictEqual(result.error, "FORBIDDEN");
  });

  it("sent→accepted by requester succeeds + leaves demand only partially covered until staffing fills slots", async () => {
    const sentOffer = { ...BASE_OFFER, status: "sent" };
    const harness = buildDemandSyncHarness({
      offer: sentOffer,
      demand: { status: "open", headcount: 4, required_total_count: 4 },
      aggregate: { required_total_count: 4, committed_headcount: 2, active_offer_count: 1 }
    });
    const result = await updateOfferStatus(harness.pool, UUID, "accepted", "requester-1");
    assert.ok(result.offer);
    assert.strictEqual(result.offer.status, "accepted");
    assert.ok(result.demand);
    assert.strictEqual(result.demand.status, "partially_covered");
    assert.strictEqual(result.demand.currently_committed_count, 2);
    assert.strictEqual(result.demand.remaining_open_count, 2);
  });

  it("sent→accepted recalculates demand_requests from committed quantity instead of hardcoding fulfilled", async () => {
    const sentOffer = { ...BASE_OFFER, status: "sent" };
    const harness = buildDemandSyncHarness({
      offer: sentOffer,
      demand: { status: "fulfilled", headcount: 4, required_total_count: 4, currently_committed_count: 4, remaining_open_count: 0 },
      aggregate: { required_total_count: 4, committed_headcount: 2, active_offer_count: 1 }
    });
    const result = await updateOfferStatus(harness.pool, UUID, "accepted", "requester-1");
    assert.ok(result.offer);
    const demandUpdate = harness.calls.find((call) => call.sql.includes("UPDATE demand_requests"));
    assert.ok(demandUpdate, "Expected demand status update query");
    assert.match(demandUpdate.sql, /required_total_count = \$3/);
    assert.match(demandUpdate.sql, /currently_committed_count = \$4/);
    assert.match(demandUpdate.sql, /remaining_open_count = \$5/);
    assert.deepStrictEqual(demandUpdate.params, [UUID2, "partially_covered", 4, 2, 2]);
    assert.strictEqual(result.demand.status, "partially_covered");
  });

  it("sent→accepted by supplier returns FORBIDDEN", async () => {
    const sentOffer = { ...BASE_OFFER, status: "sent" };
    const pool = sequencePool({ rows: [sentOffer] });
    const result = await updateOfferStatus(pool, UUID, "accepted", "supplier-1");
    assert.strictEqual(result.error, "FORBIDDEN");
  });

  it("sent→rejected by requester succeeds", async () => {
    const sentOffer = { ...BASE_OFFER, status: "sent" };
    const pool = sequencePool(
      { rows: [sentOffer] },
      { rows: [{ ...sentOffer, status: "rejected" }] }
    );
    const result = await updateOfferStatus(pool, UUID, "rejected", "requester-1");
    assert.ok(result.offer);
  });

  it("draft→accepted is INVALID_TRANSITION", async () => {
    const pool = sequencePool({ rows: [BASE_OFFER] });
    const result = await updateOfferStatus(pool, UUID, "accepted", "requester-1");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
    assert.strictEqual(result.current, "draft");
    assert.strictEqual(result.requested, "accepted");
  });

  it("accepted→sent is INVALID_TRANSITION (terminal state)", async () => {
    const acceptedOffer = { ...BASE_OFFER, status: "accepted" };
    const pool = sequencePool({ rows: [acceptedOffer] });
    const result = await updateOfferStatus(pool, UUID, "sent", "supplier-1");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });

  it("NOT_FOUND when offer doesn't exist", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await updateOfferStatus(pool, UUID, "sent", "anyone");
    assert.strictEqual(result.error, "NOT_FOUND");
  });

  it("draft→withdrawn by supplier succeeds", async () => {
    const pool = sequencePool(
      { rows: [BASE_OFFER] },
      { rows: [{ ...BASE_OFFER, status: "withdrawn" }] }
    );
    const result = await updateOfferStatus(pool, UUID, "withdrawn", "supplier-1");
    assert.ok(result.offer);
    assert.strictEqual(result.offer.status, "withdrawn");
  });

  it("sent→countered by requester succeeds", async () => {
    const sentOffer = { ...BASE_OFFER, status: "sent" };
    const pool = sequencePool(
      { rows: [sentOffer] },
      { rows: [{ ...sentOffer, status: "countered" }] }
    );
    const result = await updateOfferStatus(pool, UUID, "countered", "requester-1");
    assert.ok(result.offer);
  });

  it("countered→sent by supplier succeeds (re-submit)", async () => {
    const counteredOffer = { ...BASE_OFFER, status: "countered" };
    const pool = sequencePool(
      { rows: [counteredOffer] },
      { rows: [{ ...counteredOffer, status: "sent" }] }
    );
    const result = await updateOfferStatus(pool, UUID, "sent", "supplier-1");
    assert.ok(result.offer);
  });

  it("sent→accepted with linked capacity returns CAPACITY_UNAVAILABLE when remaining headcount is insufficient", async () => {
    const sentOffer = {
      ...BASE_OFFER,
      status: "sent",
      capacity_post_id: "capacity-1",
      offered_quantity: 3,
      demand_headcount: 3
    };
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes("FROM offers o")) {
          return { rows: [sentOffer], rowCount: 1 };
        }
        if (sql.includes("SELECT id FROM capacity_posts WHERE id = $1 FOR UPDATE")) {
          return { rows: [{ id: "capacity-1" }], rowCount: 1 };
        }
        if (sql.includes("SELECT id, headcount FROM capacity_posts WHERE id = $1")) {
          return { rows: [{ id: "capacity-1", headcount: 2 }], rowCount: 1 };
        }
        if (sql.includes("cp.id AS capacity_post_id")) {
          return {
            rows: [{
              capacity_post_id: "capacity-1",
              committed_headcount: 0,
              active_offer_count: 0,
              assigned_headcount: 0,
              staffing_reserved_headcount: 0,
              counterparty_user_ids: []
            }],
            rowCount: 1
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }
    };

    const result = await updateOfferStatus(pool, UUID, "accepted", "requester-1");
    assert.strictEqual(result.error, "CAPACITY_UNAVAILABLE");
    assert.strictEqual(result.requested_headcount, 3);
    assert.strictEqual(result.remaining_headcount, 2);
    assert.ok(!calls.some((call) => call.sql.includes("UPDATE offers SET status = $1")));
  });

  it("sent→accepted with linked capacity syncs the capacity post to reserved when fully committed", async () => {
    const sentOffer = {
      ...BASE_OFFER,
      status: "sent",
      capacity_post_id: "capacity-1",
      offered_quantity: 2,
      demand_headcount: 2
    };
    const calls = [];
    let offerAccepted = false;
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes("FROM offers o")) {
          return { rows: [sentOffer], rowCount: 1 };
        }
        if (sql.includes("SELECT id FROM capacity_posts WHERE id = $1 FOR UPDATE")) {
          return { rows: [{ id: "capacity-1" }], rowCount: 1 };
        }
        if (sql.includes("SELECT * FROM capacity_posts WHERE id = $1 FOR UPDATE")) {
          return {
            rows: [{
              id: "capacity-1",
              headcount: 2,
              status: "active",
              is_active: true
            }],
            rowCount: 1
          };
        }
        if (sql.includes("SELECT id, headcount FROM capacity_posts WHERE id = $1")) {
          return { rows: [{ id: "capacity-1", headcount: 2 }], rowCount: 1 };
        }
        if (sql.includes("cp.id AS capacity_post_id")) {
          return {
            rows: [{
              capacity_post_id: "capacity-1",
              committed_headcount: offerAccepted ? 2 : 0,
              active_offer_count: offerAccepted ? 1 : 0,
              assigned_headcount: 0,
              staffing_reserved_headcount: 0,
              counterparty_user_ids: ["requester-1"]
            }],
            rowCount: 1
          };
        }
        if (sql.includes("UPDATE offers SET status = $1")) {
          offerAccepted = true;
          return { rows: [{ ...sentOffer, status: "accepted" }], rowCount: 1 };
        }
        if (sql.includes("FROM demand_requests") && sql.includes("FOR UPDATE")) {
          return {
            rows: [{
              id: UUID2,
              status: "open",
              headcount: 2,
              required_total_count: 2,
              currently_committed_count: 0,
              remaining_open_count: 2
            }],
            rowCount: 1
          };
        }
        if (sql.includes("SELECT id, headcount, required_total_count, currently_committed_count, remaining_open_count")) {
          return {
            rows: [{
              id: UUID2,
              headcount: 2,
              required_total_count: 2,
              currently_committed_count: 0,
              remaining_open_count: 2
            }],
            rowCount: 1
          };
        }
        if (sql.includes("dr.id AS demand_request_id")) {
          return {
            rows: [{
              demand_request_id: UUID2,
              required_total_count: 2,
              committed_headcount: 2,
              active_offer_count: 1,
              is_capacity_origin: true
            }],
            rowCount: 1
          };
        }
        if (sql.includes("UPDATE demand_requests")) {
          return {
            rows: [{
              id: UUID2,
              status: "fulfilled",
              headcount: 2,
              required_total_count: 2,
              currently_committed_count: 2,
              remaining_open_count: 0
            }],
            rowCount: 1
          };
        }
        if (sql.includes("UPDATE capacity_posts")) {
          return {
            rows: [{
              id: "capacity-1",
              headcount: 2,
              status: "reserved",
              is_active: false
            }],
            rowCount: 1
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }
    };

    const result = await updateOfferStatus(pool, UUID, "accepted", "requester-1");
    assert.ok(result.offer);
    assert.strictEqual(result.offer.status, "accepted");
    const capacityUpdate = calls.find((call) => call.sql.includes("UPDATE capacity_posts"));
    assert.ok(capacityUpdate, "Expected capacity status sync query");
    assert.deepStrictEqual(capacityUpdate.params, ["capacity-1", "reserved", false]);
  });
});

// ═══════════════════════════════════════════════════════════════
// counterOffer
// ═══════════════════════════════════════════════════════════════

describe("counterOffer — requester counter-proposal", () => {
  const SENT_OFFER = {
    id: UUID, status: "sent",
    supplier_company_id: "supplier-1",
    requester_company_id: "requester-1",
    demand_request_id: UUID2
  };

  it("succeeds when requester counters a sent offer", async () => {
    const pool = sequencePool(
      { rows: [SENT_OFFER] },
      { rows: [{ ...SENT_OFFER, status: "countered", notes: "Preis zu hoch" }] }
    );
    const result = await counterOffer(pool, UUID, "requester-1", { notes: "Preis zu hoch" });
    assert.ok(result.offer);
    assert.strictEqual(result.offer.status, "countered");
  });

  it("FORBIDDEN when supplier tries to counter", async () => {
    const pool = sequencePool({ rows: [SENT_OFFER] });
    const result = await counterOffer(pool, UUID, "supplier-1", {});
    assert.strictEqual(result.error, "FORBIDDEN");
  });

  it("INVALID_TRANSITION when offer is draft (not sent)", async () => {
    const draftOffer = { ...SENT_OFFER, status: "draft" };
    const pool = sequencePool({ rows: [draftOffer] });
    const result = await counterOffer(pool, UUID, "requester-1", {});
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });

  it("NOT_FOUND when offer missing", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await counterOffer(pool, UUID, "requester-1", {});
    assert.strictEqual(result.error, "NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// withdrawOffer
// ═══════════════════════════════════════════════════════════════

describe("withdrawOffer — supplier withdrawal", () => {
  it("succeeds from draft state", async () => {
    const offer = { id: UUID, status: "draft", supplier_company_id: "s1", requester_company_id: "r1", demand_request_id: UUID2 };
    const pool = sequencePool(
      { rows: [offer] },
      { rows: [{ ...offer, status: "withdrawn" }] }
    );
    const result = await withdrawOffer(pool, UUID, "s1");
    assert.ok(result.offer);
  });

  it("succeeds from sent state", async () => {
    const offer = { id: UUID, status: "sent", supplier_company_id: "s1", requester_company_id: "r1", demand_request_id: UUID2 };
    const pool = sequencePool(
      { rows: [offer] },
      { rows: [{ ...offer, status: "withdrawn" }] }
    );
    const result = await withdrawOffer(pool, UUID, "s1");
    assert.ok(result.offer);
  });

  it("succeeds from countered state", async () => {
    const offer = { id: UUID, status: "countered", supplier_company_id: "s1", requester_company_id: "r1", demand_request_id: UUID2 };
    const pool = sequencePool(
      { rows: [offer] },
      { rows: [{ ...offer, status: "withdrawn" }] }
    );
    const result = await withdrawOffer(pool, UUID, "s1");
    assert.ok(result.offer);
  });

  it("FORBIDDEN when requester tries to withdraw", async () => {
    const offer = { id: UUID, status: "sent", supplier_company_id: "s1", requester_company_id: "r1", demand_request_id: UUID2 };
    const pool = sequencePool({ rows: [offer] });
    const result = await withdrawOffer(pool, UUID, "r1");
    assert.strictEqual(result.error, "FORBIDDEN");
  });

  it("INVALID_TRANSITION from accepted (terminal)", async () => {
    const offer = { id: UUID, status: "accepted", supplier_company_id: "s1", requester_company_id: "r1", demand_request_id: UUID2 };
    const pool = sequencePool({ rows: [offer] });
    const result = await withdrawOffer(pool, UUID, "s1");
    assert.strictEqual(result.error, "INVALID_TRANSITION");
  });

  it("NOT_FOUND when offer missing", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await withdrawOffer(pool, UUID, "s1");
    assert.strictEqual(result.error, "NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// acceptOffer (delegates to updateOfferStatus)
// ═══════════════════════════════════════════════════════════════

describe("acceptOffer — shortcut for updateOfferStatus", () => {
  it("delegates to updateOfferStatus with 'accepted'", async () => {
    const offer = { id: UUID, status: "sent", supplier_company_id: "s1", requester_company_id: "r1", demand_request_id: UUID2 };
    const harness = buildDemandSyncHarness({
      offer,
      demand: { status: "open", headcount: 1, required_total_count: 1 },
      aggregate: { required_total_count: 1, committed_headcount: 1, active_offer_count: 1 },
      updatedOffer: { ...offer, status: "accepted" }
    });
    const result = await acceptOffer(harness.pool, UUID, "r1");
    assert.ok(result.offer);
    assert.strictEqual(result.offer.status, "accepted");
    assert.strictEqual(result.demand.status, "fulfilled");
  });
});

describe("syncDemandCommercialState — canonical demand reactivation", () => {
  it("reopens a fulfilled demand when no active accepted offers remain", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes("FROM demand_requests") && sql.includes("FOR UPDATE")) {
          return {
            rows: [{
              id: UUID2,
              status: "fulfilled",
              headcount: 3,
              required_total_count: 3,
              currently_committed_count: 3,
              remaining_open_count: 0
            }],
            rowCount: 1
          };
        }
        if (sql.includes("SELECT id, headcount, required_total_count, currently_committed_count, remaining_open_count")) {
          return {
            rows: [{
              id: UUID2,
              headcount: 3,
              required_total_count: 3,
              currently_committed_count: 3,
              remaining_open_count: 0
            }],
            rowCount: 1
          };
        }
        if (sql.includes("dr.id AS demand_request_id")) {
          return {
            rows: [{
              demand_request_id: UUID2,
              required_total_count: 3,
              committed_headcount: 0,
              active_offer_count: 0,
              is_capacity_origin: false
            }],
            rowCount: 1
          };
        }
        if (sql.includes("UPDATE demand_requests")) {
          return {
            rows: [{
              id: UUID2,
              status: "open",
              headcount: 3,
              required_total_count: 3,
              currently_committed_count: 0,
              remaining_open_count: 3
            }],
            rowCount: 1
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }
    };

    const result = await syncDemandCommercialState(pool, UUID2);
    assert.strictEqual(result.status, "open");
    assert.strictEqual(result.remaining_open_count, 3);
    assert.strictEqual(result.currently_committed_count, 0);
    const demandUpdate = calls.find((call) => call.sql.includes("UPDATE demand_requests"));
    assert.deepStrictEqual(demandUpdate.params, [UUID2, "open", 3, 0, 3]);
  });

  it("does not reopen terminal closed demand even when commitments drop to zero", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes("FROM demand_requests") && sql.includes("FOR UPDATE")) {
          return {
            rows: [{
              id: UUID2,
              status: "closed",
              headcount: 2,
              required_total_count: 2,
              currently_committed_count: 2,
              remaining_open_count: 0
            }],
            rowCount: 1
          };
        }
        if (sql.includes("SELECT id, headcount, required_total_count, currently_committed_count, remaining_open_count")) {
          return {
            rows: [{
              id: UUID2,
              headcount: 2,
              required_total_count: 2,
              currently_committed_count: 2,
              remaining_open_count: 0
            }],
            rowCount: 1
          };
        }
        if (sql.includes("dr.id AS demand_request_id")) {
          return {
            rows: [{
              demand_request_id: UUID2,
              required_total_count: 2,
              committed_headcount: 0,
              active_offer_count: 0,
              is_capacity_origin: false
            }],
            rowCount: 1
          };
        }
        if (sql.includes("UPDATE demand_requests")) {
          throw new Error("Closed demand must not be reopened");
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }
    };

    const result = await syncDemandCommercialState(pool, UUID2);
    assert.strictEqual(result.status, "closed");
    assert.strictEqual(result.commercial_status, "open");
    assert.ok(!calls.some((call) => call.sql.includes("UPDATE demand_requests")));
  });
});

// ═══════════════════════════════════════════════════════════════
// createDemandRequest — SLA logic per plan
// ═══════════════════════════════════════════════════════════════

describe("createDemandRequest — SLA assignment by plan", () => {
  it("FREE plan → no SLA fields", async () => {
    const pool = sequencePool({
      rows: [{
        id: UUID, sla_status: null, sla_minutes: null, sla_due_at: null,
        sla_started_at: null, title: "Test", role: "Helfer"
      }]
    });
    const result = await createDemandRequest(pool, "user-1", "FREE", {
      title: "Test", role: "Helfer", start_date: "2026-04-01", location_city: "Berlin"
    });
    assert.strictEqual(result.sla_status, null);
    assert.strictEqual(result.sla_minutes, null);
  });

  it("PLUS plan → SLA RUNNING with default 120 minutes", async () => {
    const pool = sequencePool({
      rows: [{
        id: UUID, sla_status: "RUNNING", sla_minutes: 120, sla_due_at: new Date(),
        sla_started_at: new Date(), title: "Test", role: "Helfer"
      }]
    });
    const result = await createDemandRequest(pool, "user-1", "PLUS", {
      title: "Test", role: "Helfer", start_date: "2026-04-01", location_city: "Berlin"
    });
    assert.strictEqual(result.sla_status, "RUNNING");
    assert.strictEqual(result.sla_minutes, 120);
  });

  it("PRO plan with notdienst urgency → 30 min SLA", async () => {
    const pool = sequencePool({
      rows: [{
        id: UUID, sla_status: "RUNNING", sla_minutes: 30, sla_due_at: new Date(),
        sla_started_at: new Date(), title: "Notdienst", role: "Helfer"
      }]
    });
    const result = await createDemandRequest(pool, "user-1", "PRO", {
      title: "Notdienst", role: "Helfer", start_date: "2026-04-01",
      location_city: "Berlin", urgency: "notdienst"
    });
    assert.strictEqual(result.sla_status, "RUNNING");
    assert.strictEqual(result.sla_minutes, 30);
  });

  it("custom sla_minutes override for PLUS plan", async () => {
    const pool = sequencePool({
      rows: [{
        id: UUID, sla_status: "RUNNING", sla_minutes: 60, sla_due_at: new Date(),
        sla_started_at: new Date(), title: "Test", role: "Helfer"
      }]
    });
    const result = await createDemandRequest(pool, "user-1", "PLUS", {
      title: "Test", role: "Helfer", start_date: "2026-04-01",
      location_city: "Berlin", sla_minutes: 60
    });
    assert.strictEqual(result.sla_status, "RUNNING");
    assert.strictEqual(result.sla_minutes, 60);
  });
});

// ═══════════════════════════════════════════════════════════════
// markDemandSlaMet
// ═══════════════════════════════════════════════════════════════

describe("markDemandSlaMet — terminal SLA transition", () => {
  it("marks RUNNING demand as MET", async () => {
    const pool = sequencePool(
      { rows: [{ id: UUID }], rowCount: 1 },  // UPDATE RETURNING
      { rows: [] }                              // writeDemandSlaEvent
    );
    const result = await markDemandSlaMet(pool, UUID);
    assert.strictEqual(result.updated, true);
  });

  it("returns false when demand is not RUNNING", async () => {
    const pool = sequencePool({ rows: [], rowCount: 0 });
    const result = await markDemandSlaMet(pool, UUID);
    assert.strictEqual(result.updated, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// recordDemandMatchingAttempt — idempotent first-update
// ═══════════════════════════════════════════════════════════════

describe("recordDemandMatchingAttempt — idempotent", () => {
  it("records on first call", async () => {
    const pool = sequencePool(
      { rows: [{ id: UUID }], rowCount: 1 },  // UPDATE first_matching_attempt_at
      { rows: [] }                              // INSERT sla_event
    );
    const result = await recordDemandMatchingAttempt(pool, UUID, { count: 5 });
    assert.strictEqual(result.recorded, true);
  });

  it("returns false on subsequent calls (already set)", async () => {
    const pool = sequencePool({ rows: [], rowCount: 0 });
    const result = await recordDemandMatchingAttempt(pool, UUID, {});
    assert.strictEqual(result.recorded, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// recordDemandNotificationSent — idempotent
// ═══════════════════════════════════════════════════════════════

describe("recordDemandNotificationSent — idempotent", () => {
  it("records on first call", async () => {
    const pool = sequencePool(
      { rows: [{ id: UUID }], rowCount: 1 },
      { rows: [] }
    );
    const result = await recordDemandNotificationSent(pool, UUID, {});
    assert.strictEqual(result.recorded, true);
  });

  it("returns false on subsequent calls", async () => {
    const pool = sequencePool({ rows: [], rowCount: 0 });
    const result = await recordDemandNotificationSent(pool, UUID, {});
    assert.strictEqual(result.recorded, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// demandSlaScan — cron: RUNNING → BREACHED
// ═══════════════════════════════════════════════════════════════

describe("demandSlaScan — batch SLA breach detection", () => {
  it("breaches overdue demands", async () => {
    const pool = sequencePool(
      { rows: [{ id: UUID }, { id: UUID2 }] },       // SELECT overdue
      { rows: [{ id: UUID }], rowCount: 1 },          // UPDATE #1
      { rows: [] },                                    // writeSlaEvent #1
      { rows: [{ id: UUID2 }], rowCount: 1 },         // UPDATE #2
      { rows: [] }                                     // writeSlaEvent #2
    );
    const result = await demandSlaScan(pool, 100);
    assert.strictEqual(result.breached, 2);
  });

  it("returns 0 when no overdue demands", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await demandSlaScan(pool, 100);
    assert.strictEqual(result.breached, 0);
  });

  it("caps batch size at 500", async () => {
    let capturedLimit = null;
    const pool = {
      query: async (_sql, params) => {
        if (capturedLimit === null) capturedLimit = params?.[0];
        return { rows: [], rowCount: 0 };
      }
    };
    await demandSlaScan(pool, 9999);
    assert.strictEqual(capturedLimit, 500);
  });
});

// ═══════════════════════════════════════════════════════════════
// notdienstEscalationDemands — stage escalation
// ═══════════════════════════════════════════════════════════════

describe("notdienstEscalationDemands — escalation stages", () => {
  it("returns 0 when no notdienst demands exist", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await notdienstEscalationDemands(pool, 50);
    assert.strictEqual(result.escalated, 0);
  });

  it("skips demands already at escalation_level >= 2", async () => {
    const pool = sequencePool({
      rows: [{ id: UUID, created_at: new Date(Date.now() - 30 * 60 * 1000), escalation_level: 2 }]
    });
    const result = await notdienstEscalationDemands(pool, 50);
    assert.strictEqual(result.escalated, 0);
  });

  it("escalates level 0→1 after stage2 threshold", async () => {
    const oldDate = new Date(Date.now() - 15 * 60 * 1000); // 15 min ago (> 10 min threshold)
    const pool = sequencePool(
      { rows: [{ id: UUID, created_at: oldDate, escalation_level: 0 }] },
      { rows: [{ id: UUID }], rowCount: 1 },  // UPDATE escalation
      { rows: [] }                              // writeSlaEvent
    );
    const result = await notdienstEscalationDemands(pool, 50);
    assert.strictEqual(result.escalated, 1);
  });

  it("escalates level 1→2 after stage3 threshold", async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 1000); // 25 min ago (> 20 min threshold)
    const pool = sequencePool(
      { rows: [{ id: UUID, created_at: oldDate, escalation_level: 1 }] },
      { rows: [{ id: UUID }], rowCount: 1 },
      { rows: [] }
    );
    const result = await notdienstEscalationDemands(pool, 50);
    assert.strictEqual(result.escalated, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// markMatchesNotified
// ═══════════════════════════════════════════════════════════════

describe("markMatchesNotified — bulk notification update", () => {
  it("does nothing when array is empty", async () => {
    let queryCalled = false;
    const pool = { query: async () => { queryCalled = true; return { rows: [] }; } };
    await markMatchesNotified(pool, UUID, []);
    assert.strictEqual(queryCalled, false);
  });

  it("does nothing when array is null/undefined", async () => {
    let queryCalled = false;
    const pool = { query: async () => { queryCalled = true; return { rows: [] }; } };
    await markMatchesNotified(pool, UUID, null);
    assert.strictEqual(queryCalled, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// getVerifiedSupplierIds
// ═══════════════════════════════════════════════════════════════

describe("getVerifiedSupplierIds — returns Set of verified IDs", () => {
  it("returns Set with verified company_ids", async () => {
    const pool = sequencePool({
      rows: [{ company_id: "c1" }, { company_id: "c2" }]
    });
    const result = await getVerifiedSupplierIds(pool);
    assert.ok(result instanceof Set);
    assert.strictEqual(result.size, 2);
    assert.ok(result.has("c1"));
    assert.ok(result.has("c2"));
  });

  it("returns empty Set when no verified suppliers", async () => {
    const pool = sequencePool({ rows: [] });
    const result = await getVerifiedSupplierIds(pool);
    assert.strictEqual(result.size, 0);
  });
});
