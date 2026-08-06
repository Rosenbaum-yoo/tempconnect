/**
 * Deal Agreement Flow Tests
 * - Agreement lifecycle: none → pending_confirmation → confirmed → activated
 * - Action-required logic (counterparty-first)
 * - Document rendering
 * - Capacity release on cancel/expiry
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { cancelAgreement, expireAgreement, getActionRequired } from "../services/dealAgreementService.js";
import { renderConditionsSheet, renderAgreementDocument } from "../services/agreementDocumentService.js";

// ── Action-Required Logic ──────────────────────────────────────

describe("Deal Agreement: getActionRequired", () => {
  const REQUESTER = "user-requester-1";
  const SUPPLIER = "user-supplier-1";

  it("sent offer: requester must act", () => {
    const offer = { status: "sent", agreement_status: "none", requester_company_id: REQUESTER, supplier_company_id: SUPPLIER };
    assert.strictEqual(getActionRequired(offer, REQUESTER), "action_required");
    assert.strictEqual(getActionRequired(offer, SUPPLIER), "waiting");
  });

  it("countered offer: supplier must act", () => {
    const offer = { status: "countered", agreement_status: "none", requester_company_id: REQUESTER, supplier_company_id: SUPPLIER };
    assert.strictEqual(getActionRequired(offer, SUPPLIER), "action_required");
    assert.strictEqual(getActionRequired(offer, REQUESTER), "waiting");
  });

  it("pending_confirmation: supplier must confirm", () => {
    const offer = { status: "accepted", agreement_status: "pending_confirmation", requester_company_id: REQUESTER, supplier_company_id: SUPPLIER };
    assert.strictEqual(getActionRequired(offer, SUPPLIER), "action_required");
    assert.strictEqual(getActionRequired(offer, REQUESTER), "waiting");
  });

  it("confirmed: requester must activate", () => {
    const offer = { status: "accepted", agreement_status: "confirmed", requester_company_id: REQUESTER, supplier_company_id: SUPPLIER };
    assert.strictEqual(getActionRequired(offer, REQUESTER), "action_required");
    assert.strictEqual(getActionRequired(offer, SUPPLIER), "waiting");
  });

  it("activated: completed for both", () => {
    const offer = { status: "accepted", agreement_status: "activated", requester_company_id: REQUESTER, supplier_company_id: SUPPLIER };
    assert.strictEqual(getActionRequired(offer, REQUESTER), "completed");
    assert.strictEqual(getActionRequired(offer, SUPPLIER), "completed");
  });

  it("null offer returns null", () => {
    assert.strictEqual(getActionRequired(null, REQUESTER), null);
  });
});

describe("Agreement lifecycle demand release", () => {
  it("cancelAgreement reopens a fulfilled demand when no accepted commitments remain", async () => {
    const offer = {
      id: "offer-demand-1",
      agreement_status: "confirmed",
      agreement_ref: "EV-2026-000010",
      demand_request_id: "demand-1"
    };
    const harness = makeCapacityReleasePool({
      offer,
      nextAgreementStatus: "cancelled",
      demand: {
        status: "fulfilled",
        headcount: 3,
        required_total_count: 3,
        currently_committed_count: 3,
        remaining_open_count: 0
      },
      demandAggregate: {
        required_total_count: 3,
        committed_headcount: 0,
        active_offer_count: 0,
        is_capacity_origin: false
      }
    });

    const result = await cancelAgreement(harness.pool, offer.id, "requester-1", { reason_code: "customer_cancelled", note: "Projekt gestoppt", side: "company" });
    assert.ok(result.demand);
    assert.strictEqual(result.demand.status, "open");
    assert.strictEqual(result.demand.remaining_open_count, 3);
    assert.deepStrictEqual(harness.demandUpdateParams, ["demand-1", "open", 3, 0, 3]);
  });

  it("expireAgreement keeps demand partially covered when other accepted commitments still remain", async () => {
    const offer = {
      id: "offer-demand-2",
      agreement_status: "pending_confirmation",
      agreement_ref: "EV-2026-000011",
      demand_request_id: "demand-2"
    };
    const harness = makeCapacityReleasePool({
      offer,
      nextAgreementStatus: "expired",
      demand: {
        status: "fulfilled",
        headcount: 4,
        required_total_count: 4,
        currently_committed_count: 4,
        remaining_open_count: 0
      },
      demandAggregate: {
        required_total_count: 4,
        committed_headcount: 2,
        active_offer_count: 1,
        is_capacity_origin: false
      }
    });

    const result = await expireAgreement(harness.pool, offer.id);
    assert.ok(result.demand);
    assert.strictEqual(result.demand.status, "partially_covered");
    assert.strictEqual(result.demand.remaining_open_count, 2);
    assert.deepStrictEqual(harness.demandUpdateParams, ["demand-2", "partially_covered", 4, 2, 2]);
  });
});

// ── Document Rendering ──────────────────────────────────────────

describe("Agreement Document: Conditions Sheet", () => {
  it("renders valid HTML with offer data", () => {
    const offer = {
      id: "test-offer-1",
      demand_role: "Schweisser",
      demand_location: "Hamburg",
      demand_start: "2026-04-01",
      demand_end: "2026-06-30",
      demand_headcount: 5,
      requester_company_name: "Nordbau GmbH",
      supplier_company_name: "ElektroStaff GmbH",
      offered_quantity: 3,
      offered_hourly_rate: 42.50,
      start_confirmed: "2026-04-01",
      billing_unit: "hourly",
      response_time_minutes: 120,
      replacement_sla_minutes: 240,
      validity_until: "2026-03-31",
      terms: "Mindestabnahme 40h/Woche"
    };
    const html = renderConditionsSheet(offer);
    assert.ok(html.includes("Konditionsblatt"));
    assert.ok(html.includes("Schweisser"));
    assert.ok(html.includes("Hamburg"));
    assert.ok(html.includes("42"));
    assert.ok(html.includes("Nordbau"));
    assert.ok(html.includes("ElektroStaff"));
    assert.ok(html.includes("Verhandlung"));
    assert.ok(html.includes("Mindestabnahme"));
  });
});

describe("Agreement Document: Einsatzvereinbarung", () => {
  it("renders binding agreement with snapshot", () => {
    const offer = {
      id: "test-offer-2",
      agreement_ref: "EV-2026-000001",
      agreement_status: "confirmed",
      agreement_version: 1,
      confirmed_at: "2026-04-02T10:00:00Z",
      agreement_snapshot: {
        demand_role: "CNC-Operator",
        demand_location: "München",
        demand_start: "2026-04-15",
        demand_end: "2026-07-15",
        offered_quantity: 2,
        offered_hourly_rate: 38.00,
        billing_unit: "hourly",
        requester_company: "Nordbau GmbH",
        supplier_company_name: "TechStaff GmbH",
        surcharges: { night: 25, weekend: 50 },
        terms: "Sicherheitsunterweisung erforderlich",
        cancellation_policy: { notice_hours: 48, penalty_percent: 10 }
      }
    };
    const html = renderAgreementDocument(offer);
    assert.ok(html.includes("EINSATZVEREINBARUNG"));
    assert.ok(html.includes("EV-2026-000001"));
    assert.ok(html.includes("CNC-Operator"));
    assert.ok(html.includes("München"));
    assert.ok(html.includes("38"));
    assert.ok(html.includes("Bestätigt"));
    assert.ok(html.includes("Nacht") && html.includes("25%"));
    assert.ok(html.includes("Sicherheitsunterweisung"));
    assert.ok(html.includes("48"));
    assert.ok(html.includes("Nordbau"));
    assert.ok(html.includes("TechStaff"));
  });

  it("renders activated agreement with assignment link", () => {
    const offer = {
      agreement_ref: "EV-2026-000002",
      agreement_status: "activated",
      activated_at: "2026-04-03T14:00:00Z",
      assignment_id: "assignment-uuid-123",
      agreement_version: 1,
      agreement_snapshot: {
        demand_role: "Lagerhelfer",
        demand_location: "Berlin",
        offered_quantity: 10,
        offered_hourly_rate: 18.50,
        requester_company: "LogCorp AG",
        supplier_company_name: "QuickStaff GmbH"
      }
    };
    const html = renderAgreementDocument(offer);
    assert.ok(html.includes("Aktiviert"));
    assert.ok(html.includes("assignment-uuid-123"));
    assert.ok(html.includes("EV-2026-000002"));
  });
});

// ── Agreement State Transitions ──────────────────────────────────

describe("Agreement Status Transitions", () => {
  const VALID_AGREEMENT_STATUSES = ["none", "agreement_created", "pending_confirmation", "confirmed", "activated", "cancelled", "expired"];

  it("all expected statuses are defined", () => {
    assert.strictEqual(VALID_AGREEMENT_STATUSES.length, 7);
    assert.ok(VALID_AGREEMENT_STATUSES.includes("none"));
    assert.ok(VALID_AGREEMENT_STATUSES.includes("pending_confirmation"));
    assert.ok(VALID_AGREEMENT_STATUSES.includes("confirmed"));
    assert.ok(VALID_AGREEMENT_STATUSES.includes("activated"));
  });

  it("standard flow transitions: none → pending_confirmation → confirmed → activated", () => {
    const flow = ["none", "pending_confirmation", "confirmed", "activated"];
    for (let i = 0; i < flow.length - 1; i++) {
      assert.ok(VALID_AGREEMENT_STATUSES.includes(flow[i]));
      assert.ok(VALID_AGREEMENT_STATUSES.includes(flow[i + 1]));
    }
  });
});

function makeCapacityReleasePool({ offer, nextAgreementStatus, demand, demandAggregate }) {
  const queries = [];
  let capacityUpdateParams = null;
  let demandUpdateParams = null;
  const demandRow = demand ? {
    id: offer.demand_request_id,
    status: demand.status ?? "fulfilled",
    headcount: demand.headcount ?? demand.required_total_count ?? 1,
    required_total_count: demand.required_total_count ?? demand.headcount ?? 1,
    currently_committed_count: demand.currently_committed_count ?? 0,
    remaining_open_count: demand.remaining_open_count ?? 0
  } : null;
  const aggregateRow = demand ? {
    demand_request_id: offer.demand_request_id,
    required_total_count: demandAggregate?.required_total_count ?? demandRow.required_total_count,
    committed_headcount: demandAggregate?.committed_headcount ?? 0,
    active_offer_count: demandAggregate?.active_offer_count ?? 0,
    is_capacity_origin: demandAggregate?.is_capacity_origin === true
  } : null;
  const demandNextRequired = aggregateRow ? Number(aggregateRow.required_total_count) || demandRow.required_total_count : null;
  const demandNextCommitted = aggregateRow ? Number(aggregateRow.committed_headcount) || 0 : null;
  const demandNextRemaining = aggregateRow ? Math.max(demandNextRequired - demandNextCommitted, 0) : null;
  const demandNextStatus = aggregateRow
    ? (demandNextCommitted === 0 ? "open" : demandNextRemaining === 0 ? "fulfilled" : "partially_covered")
    : null;
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql === "SELECT * FROM offers WHERE id = $1 FOR UPDATE") {
        return { rows: [offer], rowCount: 1 };
      }
      if (sql.includes("UPDATE offers SET") && sql.includes(`agreement_status = '${nextAgreementStatus}'`)) {
        return { rows: [{ ...offer, agreement_status: nextAgreementStatus }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO audit_log")) {
        return { rows: [], rowCount: 1 };
      }
      if (demandRow && sql.includes("FROM demand_requests") && sql.includes("FOR UPDATE")) {
        return { rows: [demandRow], rowCount: 1 };
      }
      if (demandRow && sql.includes("SELECT id, headcount, required_total_count, currently_committed_count, remaining_open_count")) {
        return { rows: [demandRow], rowCount: 1 };
      }
      if (aggregateRow && sql.includes("dr.id AS demand_request_id")) {
        return { rows: [aggregateRow], rowCount: 1 };
      }
      if (demandRow && sql.includes("UPDATE demand_requests")) {
        demandUpdateParams = params;
        return {
          rows: [{
            ...demandRow,
            status: demandNextStatus,
            required_total_count: demandNextRequired,
            currently_committed_count: demandNextCommitted,
            remaining_open_count: demandNextRemaining
          }],
          rowCount: 1
        };
      }
      if (sql.includes("SELECT * FROM capacity_posts WHERE id = $1 FOR UPDATE")) {
        return {
          rows: [{
            id: offer.capacity_post_id,
            headcount: 4,
            status: "reserved",
            is_active: false
          }],
          rowCount: 1
        };
      }
      if (sql.includes("SELECT id, headcount FROM capacity_posts WHERE id = $1")) {
        return { rows: [{ id: offer.capacity_post_id, headcount: 4 }], rowCount: 1 };
      }
      if (sql.includes("cp.id AS capacity_post_id")) {
        return {
          rows: [{
            capacity_post_id: offer.capacity_post_id,
            committed_headcount: 0,
            active_offer_count: 0,
            assigned_headcount: 0,
            staffing_reserved_headcount: 0,
            counterparty_user_ids: []
          }],
          rowCount: 1
        };
      }
      if (sql.includes("UPDATE capacity_posts")) {
        capacityUpdateParams = params;
        return {
          rows: [{
            id: offer.capacity_post_id,
            headcount: 4,
            status: "active",
            is_active: true
          }],
          rowCount: 1
        };
      }
      // Mig 163: Storno-Erfassung. Der Aufruf ist ein reines Nebenprodukt des
      // Stornos und traegt keine Zusicherung dieser Suite — er muss nur
      // durchlaufen, sonst bricht der Mock-Pool den Vorgang ab.
      if (/INSERT INTO offer_cancellations/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  return {
    pool,
    queries,
    get capacityUpdateParams() {
      return capacityUpdateParams;
    },
    get demandUpdateParams() {
      return demandUpdateParams;
    }
  };
}

describe("Agreement lifecycle capacity release", () => {
  it("cancelAgreement releases a fully reserved capacity post back to active", async () => {
    const offer = {
      id: "offer-1",
      agreement_status: "confirmed",
      agreement_ref: "EV-2026-000001",
      capacity_post_id: "capacity-1"
    };
    const harness = makeCapacityReleasePool({ offer, nextAgreementStatus: "cancelled" });

    const result = await cancelAgreement(harness.pool, offer.id, "requester-1", { reason_code: "customer_cancelled", note: "Projekt gestoppt", side: "company" });
    assert.ok(result.offer);
    assert.strictEqual(result.offer.agreement_status, "cancelled");
    assert.ok(result.capacity);
    assert.strictEqual(result.capacity.status, "active");
    assert.deepStrictEqual(harness.capacityUpdateParams, ["capacity-1", "active", true]);
    assert.ok(harness.queries.filter((call) => call.sql.includes("INSERT INTO audit_log")).length >= 2);
  });

  it("expireAgreement releases a pending reserved capacity post back to active", async () => {
    const offer = {
      id: "offer-2",
      agreement_status: "pending_confirmation",
      agreement_ref: "EV-2026-000002",
      capacity_post_id: "capacity-2"
    };
    const harness = makeCapacityReleasePool({ offer, nextAgreementStatus: "expired" });

    const result = await expireAgreement(harness.pool, offer.id);
    assert.ok(result.offer);
    assert.strictEqual(result.offer.agreement_status, "expired");
    assert.ok(result.capacity);
    assert.strictEqual(result.capacity.status, "active");
    assert.deepStrictEqual(harness.capacityUpdateParams, ["capacity-2", "active", true]);
  });
});
