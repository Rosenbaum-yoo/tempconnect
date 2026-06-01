/**
 * Capacity Service unit tests.
 * Covers haversine, search, CRUD, reserve, accept, decline,
 * finalize, expiry batch — with mock pool + client.
 *
 * Run: node --test --test-force-exit test/capacityService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/capacityService.js";

// ── Mock helpers ──────────────────────────────────────────────

function returnPool(rows = []) {
  return { query: async () => ({ rows }) };
}

function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) return { rows: [] };
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

/** Mock pool with connect() returning a mock client for transaction tests */
function transactionPool(clientResponses) {
  let idx = 0;
  const client = {
    query: async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (idx >= clientResponses.length) return { rows: [] };
      const resp = clientResponses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    },
    release: () => {}
  };
  return {
    connect: async () => client,
    query: async () => ({ rows: [] })
  };
}

// ═══════════════════════════════════════════════════════════════
// searchCapacities
// ═══════════════════════════════════════════════════════════════

describe("capacityService — searchCapacities", () => {
  it("returns paginated result with default params", async () => {
    const pool = sequencePool(
      { rows: [{ total: 1 }] },  // count
      { rows: [{                   // list
        id: 1, agency_id: 5, role: "Pflege", region: "Berlin",
        available_from: "2026-01-01", available_workers: 3,
        available_effective: 2, tags: ["Pflege"], hourly_rate_cents: 2500,
        note: null, is_active: true, latitude: null, longitude: null,
        radius_km: 25, city: "Berlin", postal_code: "10115",
        agency_company_name: "Test GmbH",
        created_at: "2026-01-01", updated_at: "2026-01-01"
      }] }
    );
    const result = await svc.searchCapacities(pool, {});
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].role, "Pflege");
  });

  it("applies region and role filters", async () => {
    const pool = sequencePool(
      { rows: [{ total: 0 }] },
      { rows: [] }
    );
    const result = await svc.searchCapacities(pool, { region: "Hamburg", role: "Fachkraft" });
    assert.strictEqual(result.total, 0);
  });

  it("applies available_min filter", async () => {
    const pool = sequencePool(
      { rows: [{ total: 5 }] },    // initial count
      { rows: [{ total: 2 }] },    // filtered count
      { rows: [] }                   // list
    );
    const result = await svc.searchCapacities(pool, { available_min: 3 });
    assert.strictEqual(result.total, 2);
  });

  it("applies immediate availability window filter", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params: params || [] });
        if (sql.includes("SELECT COUNT(*)::int AS total")) {
          return { rows: [{ total: 0 }] };
        }
        return { rows: [] };
      }
    };
    await svc.searchCapacities(pool, { availability_window: "immediate", available_from: "2026-04-15" });
    const listCall = calls.find((c) => c.sql.includes("FROM capacities c") && c.sql.includes("ORDER BY c.available_from"));
    assert.ok(listCall, "Expected list query to be executed");
    assert.match(listCall.sql, /c\.available_from <=/);
    assert.ok(listCall.params.includes("2026-04-16"));
  });

  it("applies Haversine radius filter post-query", async () => {
    const pool = sequencePool(
      { rows: [{ total: 2 }] },
      { rows: [
        { id: 1, latitude: 52.52, longitude: 13.40, radius_km: 25, available_workers: 3, available_effective: 3,
          tags: [], agency_company_name: "A", created_at: "2026-01-01", updated_at: "2026-01-01" },
        { id: 2, latitude: 48.13, longitude: 11.58, radius_km: 25, available_workers: 5, available_effective: 5,
          tags: [], agency_company_name: "B", created_at: "2026-01-01", updated_at: "2026-01-01" }
      ] }
    );
    // Berlin coords, 50km radius — only Berlin capacity should match
    const result = await svc.searchCapacities(pool, { latitude: 52.52, longitude: 13.40, radius_km: 50 });
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].id, 1);
    assert.ok(result.items[0].distance_km != null);
  });

  it("excludes items with null lat/lng from radius filter", async () => {
    const pool = sequencePool(
      { rows: [{ total: 1 }] },
      { rows: [{ id: 1, latitude: null, longitude: null, available_workers: 2, available_effective: 2,
                 tags: [], agency_company_name: "X", created_at: "2026-01-01", updated_at: "2026-01-01" }] }
    );
    const result = await svc.searchCapacities(pool, { latitude: 52.52, longitude: 13.40, radius_km: 50 });
    assert.strictEqual(result.items.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getCapacityById
// ═══════════════════════════════════════════════════════════════

describe("capacityService — getCapacityById", () => {
  it("returns capacity when active", async () => {
    const row = { id: 1, agency_id: 5, is_active: true, available_workers: 3, available_effective: 2 };
    const result = await svc.getCapacityById(returnPool([row]), 1);
    assert.strictEqual(result.id, 1);
    assert.strictEqual(result.available_effective, 2);
  });

  it("returns null when not found", async () => {
    assert.strictEqual(await svc.getCapacityById(returnPool([]), 99), null);
  });

  it("returns null for inactive capacity if viewer is not owner", async () => {
    const row = { id: 1, agency_id: 5, is_active: false, available_workers: 3, available_effective: 2 };
    assert.strictEqual(await svc.getCapacityById(returnPool([row]), 1, 99), null);
  });

  it("returns inactive capacity for owner", async () => {
    const row = { id: 1, agency_id: 5, is_active: false, available_workers: 3, available_effective: 2 };
    const result = await svc.getCapacityById(returnPool([row]), 1, 5);
    assert.strictEqual(result.id, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// createCapacity
// ═══════════════════════════════════════════════════════════════

describe("capacityService — createCapacity", () => {
  it("inserts and returns capacity with effective", async () => {
    const insertRow = { id: 10, agency_id: 5, role: "Pflege", is_active: true,
                        available_workers: 3, available_effective: 3 };
    const pool = sequencePool(
      { rows: [insertRow] },  // INSERT
      { rows: [{ ...insertRow, agency_company_name: "Test GmbH" }] }  // getCapacityById
    );
    const result = await svc.createCapacity(pool, 5, {
      role: "Pflege", region: "Berlin", available_from: "2026-01-01", available_workers: 3
    });
    assert.strictEqual(result.id, 10);
  });
});

// ═══════════════════════════════════════════════════════════════
// updateCapacity
// ═══════════════════════════════════════════════════════════════

describe("capacityService — updateCapacity", () => {
  it("updates allowed fields", async () => {
    const updated = { id: 10, role: "Fachkraft", is_active: true,
                      agency_id: 5, available_workers: 5, available_effective: 5 };
    const pool = sequencePool(
      { rows: [updated] },   // UPDATE
      { rows: [{ ...updated, agency_company_name: "Test" }] }  // getCapacityById
    );
    const result = await svc.updateCapacity(pool, 10, 5, { role: "Fachkraft" });
    assert.strictEqual(result.role, "Fachkraft");
  });

  it("returns existing when no fields provided", async () => {
    const row = { id: 10, is_active: true, agency_id: 5, available_workers: 3, available_effective: 3 };
    const result = await svc.updateCapacity(returnPool([row]), 10, 5, {});
    assert.strictEqual(result.id, 10);
  });

  it("returns null when capacity not found or not owner", async () => {
    const pool = sequencePool({ rows: [] }); // UPDATE returns 0 rows
    assert.strictEqual(await svc.updateCapacity(pool, 99, 5, { role: "X" }), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// reserve
// ═══════════════════════════════════════════════════════════════

describe("capacityService — reserve", () => {
  it("creates reservation when sufficient capacity", async () => {
    const reservation = { id: "res-1", capacity_id: 1, quantity: 2, status: "active" };
    const pool = transactionPool([
      { rows: [{ id: 1, available_workers: 5 }] },    // SELECT FOR UPDATE
      { rows: [{ reserved: 1 }] },                     // SUM reservations
      { rows: [reservation] }                           // INSERT
    ]);
    const result = await svc.reserve(pool, 1, 2);
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.reservation.id, "res-1");
  });

  it("returns NOT_FOUND when capacity doesn't exist", async () => {
    const pool = transactionPool([
      { rows: [] }  // SELECT FOR UPDATE returns nothing
    ]);
    const result = await svc.reserve(pool, 99, 1);
    assert.strictEqual(result.error, "NOT_FOUND");
    assert.strictEqual(result.reservation, null);
  });

  it("returns INSUFFICIENT_CAPACITY when not enough", async () => {
    const pool = transactionPool([
      { rows: [{ id: 1, available_workers: 3 }] },
      { rows: [{ reserved: 2 }] }   // effective = 1, but need 2
    ]);
    const result = await svc.reserve(pool, 1, 2);
    assert.strictEqual(result.error, "INSUFFICIENT_CAPACITY");
  });
});

// ═══════════════════════════════════════════════════════════════
// acceptRequest
// ═══════════════════════════════════════════════════════════════

describe("capacityService — acceptRequest", () => {
  it("accepts request and reduces capacity", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, capacity_id: 1, quantity: 2, status: "SENT", receiver_id: 10 }] }, // req
      { rows: [{ id: 1, available_workers: 5 }] },   // capacity
      { rows: [{ reserved: 0 }] },                     // reservations sum
      { rows: [] },                                     // update reservations
      { rows: [] },                                     // update capacities
      { rows: [] },                                     // update request
      { rows: [{ id: 5, status: "ACCEPTED" }] }        // SELECT updated
    ]);
    const result = await svc.acceptRequest(pool, 5, 10);
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.request.status, "ACCEPTED");
  });

  it("returns NOT_FOUND when request missing", async () => {
    const pool = transactionPool([{ rows: [] }]);
    const result = await svc.acceptRequest(pool, 99, 10);
    assert.strictEqual(result.error, "NOT_FOUND");
  });

  it("returns FORBIDDEN when user is not receiver", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, capacity_id: 1, quantity: 1, status: "SENT", receiver_id: 10 }] }
    ]);
    const result = await svc.acceptRequest(pool, 5, 99);
    assert.strictEqual(result.error, "FORBIDDEN");
  });

  it("returns INVALID_STATE for non-PENDING request", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, capacity_id: 1, quantity: 1, status: "ACCEPTED", receiver_id: 10 }] }
    ]);
    const result = await svc.acceptRequest(pool, 5, 10);
    assert.strictEqual(result.error, "INVALID_STATE");
  });

  it("returns NOT_CAPACITY_REQUEST when no capacity_id", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, capacity_id: null, quantity: 1, status: "SENT", receiver_id: 10 }] }
    ]);
    const result = await svc.acceptRequest(pool, 5, 10);
    assert.strictEqual(result.error, "NOT_CAPACITY_REQUEST");
  });

  it("returns INSUFFICIENT_CAPACITY when capacity depleted", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, capacity_id: 1, quantity: 3, status: "SENT", receiver_id: 10 }] },
      { rows: [{ id: 1, available_workers: 2 }] },
      { rows: [{ reserved: 1 }] }  // effective = 1, need 3
    ]);
    const result = await svc.acceptRequest(pool, 5, 10);
    assert.strictEqual(result.error, "INSUFFICIENT_CAPACITY");
  });
});

// ═══════════════════════════════════════════════════════════════
// releaseReservationAndSetStatus
// ═══════════════════════════════════════════════════════════════

describe("capacityService — releaseReservationAndSetStatus", () => {
  it("declines request and expires reservation", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, requester_id: 1, receiver_id: 10, status: "SENT" }] },
      { rows: [] },  // expire reservations
      { rows: [] }   // update request status
    ]);
    const result = await svc.releaseReservationAndSetStatus(pool, 5, "DECLINED", 10);
    assert.strictEqual(result.ok, true);
  });

  it("allows requester to cancel", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, requester_id: 1, receiver_id: 10, status: "SENT" }] },
      { rows: [] },
      { rows: [] }
    ]);
    const result = await svc.releaseReservationAndSetStatus(pool, 5, "CANCELED", 1);
    assert.strictEqual(result.ok, true);
  });

  it("returns FORBIDDEN for unauthorized user", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, requester_id: 1, receiver_id: 10, status: "SENT" }] }
    ]);
    const result = await svc.releaseReservationAndSetStatus(pool, 5, "DECLINED", 99);
    assert.strictEqual(result.error, "FORBIDDEN");
  });

  it("returns NOT_FOUND when request missing", async () => {
    const pool = transactionPool([{ rows: [] }]);
    const result = await svc.releaseReservationAndSetStatus(pool, 99, "DECLINED", 10);
    assert.strictEqual(result.error, "NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// finalizeRequest
// ═══════════════════════════════════════════════════════════════

describe("capacityService — finalizeRequest", () => {
  it("finalizes ACCEPTED request and fills siblings", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, requester_id: 1, receiver_id: 10, status: "ACCEPTED", capacity_id: 1, listing_id: null }] },
      { rows: [] },                                     // fill siblings
      { rows: [] },                                     // finalize request
      { rows: [{ id: 5, status: "FINALIZED" }] }       // SELECT updated
    ]);
    const result = await svc.finalizeRequest(pool, 5, 1);
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.request.status, "FINALIZED");
  });

  it("finalizes listing request fills by listing_id", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, requester_id: 1, receiver_id: 10, status: "ACCEPTED", capacity_id: null, listing_id: 20 }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: 5, status: "FINALIZED" }] }
    ]);
    const result = await svc.finalizeRequest(pool, 5, 1);
    assert.strictEqual(result.error, null);
  });

  it("returns FORBIDDEN for non-requester", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, requester_id: 1, receiver_id: 10, status: "ACCEPTED", capacity_id: 1 }] }
    ]);
    const result = await svc.finalizeRequest(pool, 5, 99);
    assert.strictEqual(result.error, "FORBIDDEN");
  });

  it("returns MUST_BE_ACCEPTED_FIRST for non-ACCEPTED", async () => {
    const pool = transactionPool([
      { rows: [{ id: 5, requester_id: 1, receiver_id: 10, status: "SENT", capacity_id: 1 }] }
    ]);
    const result = await svc.finalizeRequest(pool, 5, 1);
    assert.strictEqual(result.error, "MUST_BE_ACCEPTED_FIRST");
  });

  it("returns NOT_FOUND when request missing", async () => {
    const pool = transactionPool([{ rows: [] }]);
    const result = await svc.finalizeRequest(pool, 99, 1);
    assert.strictEqual(result.error, "NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════
// expireReservationsBatch
// ═══════════════════════════════════════════════════════════════

describe("capacityService — expireReservationsBatch", () => {
  it("expires active reservations past TTL", async () => {
    const pool = transactionPool([
      { rows: [{ id: "r1", capacity_id: 1 }, { id: "r2", capacity_id: 2 }] }, // SELECT expired
      { rows: [] }  // UPDATE
    ]);
    const result = await svc.expireReservationsBatch(pool, 100);
    assert.strictEqual(result.expired, 2);
  });

  it("returns 0 when none expired", async () => {
    const pool = transactionPool([
      { rows: [] }  // SELECT finds nothing
    ]);
    const result = await svc.expireReservationsBatch(pool);
    assert.strictEqual(result.expired, 0);
  });
});
