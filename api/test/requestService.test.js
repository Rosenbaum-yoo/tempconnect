/**
 * Request Service unit tests.
 * Covers lookup helpers, CRUD, status updates, broadcast,
 * compliance, reservations — all with mock pool (no DB required).
 *
 * Run: node --test --test-force-exit test/requestService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/requestService.js";

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

function capturePool() {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 1 }] };
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// Lookup helpers
// ═══════════════════════════════════════════════════════════════

describe("requestService — lookup helpers", () => {
  it("getActiveCapacity returns row when found", async () => {
    const row = { id: 10, agency_id: 5 };
    const result = await svc.getActiveCapacity(returnPool([row]), 10);
    assert.deepStrictEqual(result, row);
  });

  it("getActiveCapacity returns null when not found", async () => {
    const result = await svc.getActiveCapacity(returnPool([]), 99);
    assert.strictEqual(result, null);
  });

  it("getActiveListing returns row when found", async () => {
    const row = { id: 7, owner_id: 3, type: "SUPPLY" };
    const result = await svc.getActiveListing(returnPool([row]), 7);
    assert.deepStrictEqual(result, row);
  });

  it("getActiveListing returns null when not found", async () => {
    assert.strictEqual(await svc.getActiveListing(returnPool([]), 1), null);
  });

  it("getUserContact returns email and company", async () => {
    const row = { email: "a@b.de", company_name: "Test GmbH", phone: "+49123" };
    const result = await svc.getUserContact(returnPool([row]), 1);
    assert.strictEqual(result.email, "a@b.de");
    assert.strictEqual(result.company_name, "Test GmbH");
  });

  it("getUserContact returns null when not found", async () => {
    assert.strictEqual(await svc.getUserContact(returnPool([]), 1), null);
  });

  it("getListingMeta returns category and region", async () => {
    const row = { category: "Pflege", region: "Berlin" };
    assert.deepStrictEqual(await svc.getListingMeta(returnPool([row]), 1), row);
  });

  it("getCapacityMeta returns role and region", async () => {
    const row = { role: "Pflege", region: "Hamburg" };
    assert.deepStrictEqual(await svc.getCapacityMeta(returnPool([row]), 1), row);
  });
});

// ═══════════════════════════════════════════════════════════════
// Admin pagination (platform-wide list — 300-customer safety)
// ═══════════════════════════════════════════════════════════════

describe("requestService — listRequestsAdmin (admin pagination)", () => {
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

  it("returns { items, total } with a bounded COUNT query (status uppercased)", async () => {
    const pool = recordingPool({ rows: [{ id: "r-1" }] }, { rows: [{ total: 5 }] });
    const result = await svc.listRequestsAdmin(pool, { limit: 10, offset: 0, status: "sent" });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, "r-1");
    assert.equal(result.total, 5);
    assert.match(pool.calls[0].sql, /FROM requests r/);
    assert.match(pool.calls[0].sql, /LIMIT \$\d+ OFFSET \$\d+/);
    assert.match(pool.calls[1].sql, /COUNT\(\*\)::int AS total/);
    assert.deepEqual(pool.calls[1].params, ["SENT"]);
  });

  it("clamps oversized limit to 200 and omits status filter when absent", async () => {
    const pool = recordingPool({ rows: [] }, { rows: [{ total: 0 }] });
    const result = await svc.listRequestsAdmin(pool, { limit: 5000, offset: 0 });
    assert.equal(result.total, 0);
    assert.equal(pool.calls[0].params[0], 200);
    assert.deepEqual(pool.calls[1].params, []);
  });
});

// ═══════════════════════════════════════════════════════════════
// Request CRUD
// ═══════════════════════════════════════════════════════════════

describe("requestService — CRUD", () => {
  it("createCapacityRequest inserts and returns row", async () => {
    const row = { id: 100, capacity_id: 5, requester_id: 1, status: "PENDING" };
    const result = await svc.createCapacityRequest(returnPool([row]), {
      capacity_id: 5, requester_id: 1, receiver_id: 2, message: "test",
      priority: "normal", sla_minutes: 60, sla_respond_by: new Date().toISOString()
    });
    assert.strictEqual(result.id, 100);
  });

  it("createListingRequest inserts and returns row", async () => {
    const row = { id: 200, listing_id: 3, requester_id: 1, status: "PENDING" };
    const result = await svc.createListingRequest(returnPool([row]), {
      listing_id: 3, requester_id: 1, receiver_id: 2, message: "hi", priority: "high"
    });
    assert.strictEqual(result.id, 200);
  });

  it("getRequestById returns row when found", async () => {
    const row = { id: 5, requester_id: 1, receiver_id: 2, status: "PENDING" };
    const result = await svc.getRequestById(returnPool([row]), 5);
    assert.strictEqual(result.id, 5);
  });

  it("getRequestById returns null when not found", async () => {
    assert.strictEqual(await svc.getRequestById(returnPool([]), 99), null);
  });

  it("getFullRequest returns all columns", async () => {
    const row = { id: 5, requester_id: 1, message: "full request" };
    assert.deepStrictEqual(await svc.getFullRequest(returnPool([row]), 5), row);
  });

  it("getRequestDetail returns joined data", async () => {
    const row = { id: 5, listing_category: "Pflege", capacity_role: "Fachkraft" };
    assert.strictEqual((await svc.getRequestDetail(returnPool([row]), 5)).listing_category, "Pflege");
  });

  it("getRequestDetail returns null when not found", async () => {
    assert.strictEqual(await svc.getRequestDetail(returnPool([]), 99), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// Compliance and SLA
// ═══════════════════════════════════════════════════════════════

describe("requestService — compliance & SLA", () => {
  it("getRequestComplianceAndEvents returns merged data", async () => {
    const pool = {
      query: async (sql) => {
        if (sql.includes("request_compliance")) return { rows: [{ compliance_status: "GREEN", compliance_reasons: [] }] };
        return { rows: [{ id: 1, event_type: "SLA_START" }] };
      }
    };
    const result = await svc.getRequestComplianceAndEvents(pool, 5);
    assert.strictEqual(result.compliance_status, "GREEN");
    assert.strictEqual(result.sla_events.length, 1);
  });

  it("getRequestComplianceAndEvents handles empty data", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const result = await svc.getRequestComplianceAndEvents(pool, 5);
    assert.strictEqual(result.compliance_status, null);
    assert.deepStrictEqual(result.compliance_reasons, []);
    assert.deepStrictEqual(result.sla_events, []);
  });

  it("getRequestSla returns SLA fields", async () => {
    const row = { id: 5, sla_minutes: 60, sla_respond_by: "2026-01-01", sla_status: "RUNNING" };
    assert.strictEqual((await svc.getRequestSla(returnPool([row]), 5)).sla_minutes, 60);
  });
});

// ═══════════════════════════════════════════════════════════════
// Request lists
// ═══════════════════════════════════════════════════════════════

describe("requestService — lists", () => {
  it("getSentRequests returns rows", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    assert.strictEqual((await svc.getSentRequests(returnPool(rows), 1)).length, 2);
  });

  it("getReceivedRequests returns rows", async () => {
    const rows = [{ id: 10 }];
    assert.strictEqual((await svc.getReceivedRequests(returnPool(rows), 1)).length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Status updates
// ═══════════════════════════════════════════════════════════════

describe("requestService — status updates", () => {
  it("updateRequestStatus with ACCEPTED and email saves contact info", async () => {
    const pool = capturePool();
    await svc.updateRequestStatus(pool, 5, "ACCEPTED", "a@b.de", "+49123");
    assert.ok(pool.calls[0].sql.includes("contact_email"));
    assert.deepStrictEqual(pool.calls[0].params, ["ACCEPTED", "a@b.de", "+49123", 5]);
  });

  it("updateRequestStatus without email uses simple update", async () => {
    const pool = capturePool();
    await svc.updateRequestStatus(pool, 5, "DECLINED", null, null);
    assert.ok(pool.calls[0].sql.includes("SET status"));
    assert.deepStrictEqual(pool.calls[0].params, ["DECLINED", 5]);
  });

  it("updateRequestStatus ACCEPTED without email uses simple update", async () => {
    const pool = capturePool();
    await svc.updateRequestStatus(pool, 5, "ACCEPTED", null, null);
    assert.ok(!pool.calls[0].sql.includes("contact_email"));
  });

  it("fillRelatedRequests updates matching requests", async () => {
    const pool = capturePool();
    await svc.fillRelatedRequests(pool, 3, 1, 5);
    assert.ok(pool.calls[0].sql.includes("FILLED"));
    assert.deepStrictEqual(pool.calls[0].params, [3, 1, 5]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Broadcast
// ═══════════════════════════════════════════════════════════════

describe("requestService — broadcast", () => {
  it("findBroadcastTargets returns matching listings", async () => {
    const rows = [{ listing_id: 10, receiver_id: 5, qty: 3 }];
    const result = await svc.findBroadcastTargets(returnPool(rows), 1, "SUPPLY", {});
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].listing_id, 10);
  });

  it("findBroadcastTargets applies category and region filters", async () => {
    const pool = capturePool();
    await svc.findBroadcastTargets(pool, 1, "DEMAND", { category: "Pflege", region: "Berlin" });
    const sql = pool.calls[0].sql;
    assert.ok(sql.includes("ILIKE"));
  });

  it("findBroadcastTargets applies notdienst and min_qty filters", async () => {
    const pool = capturePool();
    await svc.findBroadcastTargets(pool, 1, "SUPPLY", { notdienst_only: true, min_qty: 3 });
    const sql = pool.calls[0].sql;
    assert.ok(sql.includes("notdienst"));
    assert.ok(sql.includes("qty"));
  });

  it("findBroadcastTargets applies radius filter", async () => {
    const pool = capturePool();
    await svc.findBroadcastTargets(pool, 1, "SUPPLY", {
      center_lat: 52.52, center_lng: 13.40, radius_km: 50
    });
    const sql = pool.calls[0].sql;
    assert.ok(sql.includes("6371"));
  });

  it("insertBroadcastRequest inserts a row", async () => {
    const pool = capturePool();
    await svc.insertBroadcastRequest(pool, 10, 1, 5, "Broadcast msg", "normal");
    assert.deepStrictEqual(pool.calls[0].params, [10, 1, 5, "Broadcast msg", "normal"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Compliance policies
// ═══════════════════════════════════════════════════════════════

describe("requestService — compliance policies", () => {
  it("createCompliancePolicy inserts and returns policy", async () => {
    const policy = { id: 1, company_id: 5, role_pattern: "*", strict_mode: true };
    const pool = sequencePool(
      { rows: [] },    // INSERT
      { rows: [policy] } // SELECT
    );
    const result = await svc.createCompliancePolicy(pool, 5, {
      role_pattern: "*", required_fields: ["name"], required_certifications: ["cert1"], strict_mode: true
    });
    assert.strictEqual(result.id, 1);
    assert.strictEqual(result.strict_mode, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Reservations
// ═══════════════════════════════════════════════════════════════

describe("requestService — reservations", () => {
  it("linkReservationToRequest calls UPDATE", async () => {
    const pool = capturePool();
    await svc.linkReservationToRequest(pool, 5, 10);
    assert.ok(pool.calls[0].sql.includes("UPDATE capacity_reservations"));
    assert.deepStrictEqual(pool.calls[0].params, [5, 10]);
  });

  it("getReservationByStatus returns matching reservation", async () => {
    const row = { id: 42 };
    const result = await svc.getReservationByStatus(returnPool([row]), 5, "active");
    assert.strictEqual(result.id, 42);
  });

  it("getReservationByStatus returns null when none found", async () => {
    assert.strictEqual(await svc.getReservationByStatus(returnPool([]), 5, "active"), null);
  });

  it("getRequestForReserve returns request subset", async () => {
    const row = { id: 5, requester_id: 1, capacity_id: 10, status: "PENDING", quantity: 2 };
    const result = await svc.getRequestForReserve(returnPool([row]), 5);
    assert.strictEqual(result.quantity, 2);
  });

  it("getRequestForReserve returns null when not found", async () => {
    assert.strictEqual(await svc.getRequestForReserve(returnPool([]), 99), null);
  });

  it("hasActiveReservationForRequest returns true when exists", async () => {
    assert.strictEqual(await svc.hasActiveReservationForRequest(returnPool([{ id: 1 }]), 5), true);
  });

  it("hasActiveReservationForRequest returns false when none", async () => {
    assert.strictEqual(await svc.hasActiveReservationForRequest(returnPool([]), 5), false);
  });
});
