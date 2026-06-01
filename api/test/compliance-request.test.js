/**
 * Request Compliance Traffic Light Tests
 *
 * Tests computeForRequest() from services/complianceService.js.
 * This is the fachlich critical compliance engine that evaluates staffing requests
 * and assigns RED / YELLOW / GREEN with specific reason codes.
 *
 * Mock strategy: sequence-based pool. computeForRequest issues up to 3 queries:
 *   1. SELECT from requests WHERE id=$1
 *   2. SELECT from compliance_policies (only when status is NOT RED)
 *   3. INSERT/UPSERT into request_compliance
 *
 * Decision rules:
 *
 * RED (any triggers RED, all reasons accumulate):
 *   - QUANTITY_INVALID:       quantity null/undefined/0/negative
 *   - LOCATION_MISSING:       location_text missing or empty
 *   - SHIFT_SCHEDULE_MISSING: shift_schedule null or empty object
 *   - START_DATE_MISSING:     start_date null
 *   - END_OR_DURATION_MISSING: neither end_date nor duration_days >= 1
 *   - DATES_INVALID:          end_date < start_date (only when both present)
 *
 * YELLOW (checked only when NOT RED; each sets status = YELLOW if still GREEN):
 *   - REQUIRED_CERTIFICATIONS_MISSING: policy demands certs, request has none
 *   - MAX_RATE_MISSING_URGENT:         urgency=urgent + no max_hourly_rate_cents
 *   - NOTES_RECOMMENDED:               role contains "risk" + notes missing
 *
 * GREEN: no rules violated.
 *
 * NOT_FOUND: request doesn't exist → { ok: false, error: "NOT_FOUND" }
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeForRequest } from "../services/complianceService.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REQUEST_ID = "req-001";

/** Minimally valid request — produces GREEN when no policy requires certs. */
const VALID_REQUEST = {
  id: REQUEST_ID,
  requester_id: "company-001",
  capacity_id: "cap-001",
  quantity: 3,
  location_text: "München, Bayern",
  start_date: "2026-04-01",
  end_date: "2026-04-30",
  duration_days: 30,
  shift_schedule: { monday: "08:00-16:00", tuesday: "08:00-16:00" },
  required_certifications: ["AÜG §1"],
  max_hourly_rate_cents: 3500,
  urgency: "normal",
  notes: "Standard-Einsatz",
  role: "Lagerhelfer"
};

// ── Mock factory ──────────────────────────────────────────────────────────────

/**
 * Build a sequence pool where pool.query() returns results in call order.
 * Also captures all queries for assertion.
 */
function sequencePool(...responses) {
  let idx = 0;
  const queries = [];
  return {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (idx >= responses.length) {
        throw new Error(`Unexpected pool.query call #${idx + 1} (only ${responses.length} configured)`);
      }
      return responses[idx++];
    },
    queries
  };
}

/** No policy requiring certs. */
const NO_POLICY = { rows: [] };

/** Policy requiring certifications. */
const POLICY_WITH_CERTS = {
  rows: [{ required_certifications: ["AÜG §1", "Sicherheitsunterweisung"] }]
};

/** Upsert acknowledgment (INSERT INTO request_compliance). */
const UPSERT_OK = { rows: [], rowCount: 1 };

/** Build a request row with selective overrides. */
function makeRequest(overrides = {}) {
  return { ...VALID_REQUEST, ...overrides };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOT_FOUND
// ═══════════════════════════════════════════════════════════════════════════════

describe("computeForRequest — request not found", () => {
  it("returns { ok: false, error: NOT_FOUND } when request does not exist", async () => {
    const pool = sequencePool({ rows: [] }); // empty result
    const result = await computeForRequest(pool, "nonexistent-id");
    assert.deepStrictEqual(result, { ok: false, error: "NOT_FOUND" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GREEN — fully compliant
// ═══════════════════════════════════════════════════════════════════════════════

describe("computeForRequest — GREEN", () => {
  it("returns GREEN with empty reasons when all fields are valid and no policy", async () => {
    const pool = sequencePool(
      { rows: [VALID_REQUEST] },   // request query
      NO_POLICY,                   // compliance_policies query
      UPSERT_OK                    // upsert
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, "GREEN");
    assert.strictEqual(result.reasons.length, 0);
  });

  it("stays GREEN when policy requires certs and request has them", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ required_certifications: ["AÜG §1", "Sicherheitsunterweisung"] })] },
      POLICY_WITH_CERTS,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
  });

  it("stays GREEN when urgency is not 'urgent' even without rate", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ urgency: "normal", max_hourly_rate_cents: null })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
  });

  it("stays GREEN when end_date is null but duration_days satisfies requirement", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ end_date: null, duration_days: 14 })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RED — mandatory field violations (each tested individually)
// ═══════════════════════════════════════════════════════════════════════════════

describe("computeForRequest — RED: QUANTITY_INVALID", () => {
  it("returns RED when quantity is 0", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ quantity: 0 })] },
      UPSERT_OK  // no policy query — RED skips YELLOW checks
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "QUANTITY_INVALID"));
  });

  it("returns RED when quantity is negative", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ quantity: -5 })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "QUANTITY_INVALID"));
  });

  it("returns RED when quantity is null", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ quantity: null })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "QUANTITY_INVALID"));
  });

  it("returns RED when quantity is undefined (not present)", async () => {
    const req = makeRequest();
    delete req.quantity;
    const pool = sequencePool({ rows: [req] }, UPSERT_OK);
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "QUANTITY_INVALID"));
  });
});

describe("computeForRequest — RED: LOCATION_MISSING", () => {
  it("returns RED when location_text is null", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ location_text: null })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "LOCATION_MISSING"));
  });

  it("returns RED when location_text is empty string", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ location_text: "" })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "LOCATION_MISSING"));
  });

  it("returns RED when location_text is whitespace only", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ location_text: "   " })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "LOCATION_MISSING"));
  });
});

describe("computeForRequest — RED: SHIFT_SCHEDULE_MISSING", () => {
  it("returns RED when shift_schedule is null", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ shift_schedule: null })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "SHIFT_SCHEDULE_MISSING"));
  });

  it("returns RED when shift_schedule is empty object", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ shift_schedule: {} })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "SHIFT_SCHEDULE_MISSING"));
  });

  it("passes when shift_schedule has at least one key", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ shift_schedule: { monday: "08:00-16:00" } })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.notStrictEqual(result.status, "RED");
    assert.ok(!result.reasons.some(r => r.code === "SHIFT_SCHEDULE_MISSING"));
  });
});

describe("computeForRequest — RED: START_DATE_MISSING", () => {
  it("returns RED when start_date is null", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ start_date: null })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "START_DATE_MISSING"));
  });
});

describe("computeForRequest — RED: END_OR_DURATION_MISSING", () => {
  it("returns RED when both end_date and duration_days are null", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ end_date: null, duration_days: null })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "END_OR_DURATION_MISSING"));
  });

  it("returns RED when duration_days is 0 and end_date is null", async () => {
    // duration_days 0 → falsy, and < 1, so hasEnd is false
    const pool = sequencePool(
      { rows: [makeRequest({ end_date: null, duration_days: 0 })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "END_OR_DURATION_MISSING"));
  });

  it("passes when duration_days >= 1 even without end_date", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ end_date: null, duration_days: 1 })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.ok(!result.reasons.some(r => r.code === "END_OR_DURATION_MISSING"));
  });
});

describe("computeForRequest — RED: DATES_INVALID", () => {
  it("returns RED when end_date is before start_date", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ start_date: "2026-05-01", end_date: "2026-04-01" })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "DATES_INVALID"));
  });

  it("does not flag DATES_INVALID when start_date equals end_date (same day)", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ start_date: "2026-04-15", end_date: "2026-04-15" })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.ok(!result.reasons.some(r => r.code === "DATES_INVALID"));
  });

  it("does not check date order when start_date is null (START_DATE_MISSING fires instead)", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ start_date: null, end_date: "2026-04-01" })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    assert.ok(result.reasons.some(r => r.code === "START_DATE_MISSING"));
    assert.ok(!result.reasons.some(r => r.code === "DATES_INVALID"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RED — reason accumulation
// ═══════════════════════════════════════════════════════════════════════════════

describe("computeForRequest — RED reason accumulation", () => {
  it("accumulates multiple RED reasons (does not short-circuit)", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({
        quantity: 0,
        location_text: null,
        shift_schedule: null,
        start_date: null,
        end_date: null,
        duration_days: null
      })] },
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    const codes = result.reasons.map(r => r.code);
    assert.ok(codes.includes("QUANTITY_INVALID"), "Should include QUANTITY_INVALID");
    assert.ok(codes.includes("LOCATION_MISSING"), "Should include LOCATION_MISSING");
    assert.ok(codes.includes("SHIFT_SCHEDULE_MISSING"), "Should include SHIFT_SCHEDULE_MISSING");
    assert.ok(codes.includes("START_DATE_MISSING"), "Should include START_DATE_MISSING");
    assert.ok(codes.includes("END_OR_DURATION_MISSING"), "Should include END_OR_DURATION_MISSING");
    assert.strictEqual(result.reasons.length, 5, "Exactly 5 RED reasons for fully empty request");
  });

  it("skips YELLOW checks entirely when any RED condition exists", async () => {
    // This request has both RED (quantity=0) and YELLOW triggers (urgent + no rate)
    // YELLOW checks should NOT be evaluated
    const pool = sequencePool(
      { rows: [makeRequest({
        quantity: 0,
        urgency: "urgent",
        max_hourly_rate_cents: null,
        role: "risk-manager",
        notes: null
      })] },
      UPSERT_OK  // only 2 queries: request + upsert — no policy query
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "RED");
    // Must NOT contain YELLOW codes
    const codes = result.reasons.map(r => r.code);
    assert.ok(!codes.includes("MAX_RATE_MISSING_URGENT"));
    assert.ok(!codes.includes("NOTES_RECOMMENDED"));
    assert.ok(!codes.includes("REQUIRED_CERTIFICATIONS_MISSING"));
    // Pool should have been queried exactly 2 times (request + upsert, no policy)
    assert.strictEqual(pool.queries.length, 2, "No policy query when RED");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — soft compliance warnings
// ═══════════════════════════════════════════════════════════════════════════════

describe("computeForRequest — YELLOW: REQUIRED_CERTIFICATIONS_MISSING", () => {
  it("returns YELLOW when policy requires certs but request has none", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ required_certifications: null })] },
      POLICY_WITH_CERTS,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "YELLOW");
    assert.ok(result.reasons.some(r => r.code === "REQUIRED_CERTIFICATIONS_MISSING"));
  });

  it("returns YELLOW when policy requires certs and request has empty array", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ required_certifications: [] })] },
      POLICY_WITH_CERTS,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "YELLOW");
    assert.ok(result.reasons.some(r => r.code === "REQUIRED_CERTIFICATIONS_MISSING"));
  });

  it("stays GREEN when policy has empty cert list (no requirements)", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ required_certifications: null })] },
      { rows: [{ required_certifications: [] }] },  // policy with empty certs
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
  });

  it("stays GREEN when no policy exists for company", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ required_certifications: null })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
  });
});

describe("computeForRequest — YELLOW: MAX_RATE_MISSING_URGENT", () => {
  it("returns YELLOW when urgency is urgent and max_hourly_rate_cents is null", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ urgency: "urgent", max_hourly_rate_cents: null })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "YELLOW");
    assert.ok(result.reasons.some(r => r.code === "MAX_RATE_MISSING_URGENT"));
  });

  it("returns YELLOW when urgency is urgent and max_hourly_rate_cents is 0", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ urgency: "urgent", max_hourly_rate_cents: 0 })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "YELLOW");
    assert.ok(result.reasons.some(r => r.code === "MAX_RATE_MISSING_URGENT"));
  });

  it("stays GREEN when urgency is 'high' without rate (not 'urgent')", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ urgency: "high", max_hourly_rate_cents: null })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
  });

  it("stays GREEN when urgency is urgent but rate is provided", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ urgency: "urgent", max_hourly_rate_cents: 5000 })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
  });
});

describe("computeForRequest — YELLOW: NOTES_RECOMMENDED", () => {
  it("returns YELLOW when role contains 'risk' and notes are empty", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ role: "Risk-Manager", notes: "" })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "YELLOW");
    assert.ok(result.reasons.some(r => r.code === "NOTES_RECOMMENDED"));
  });

  it("returns YELLOW when role contains 'risk' (case-insensitive) and notes are null", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ role: "High-RISK Operator", notes: null })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "YELLOW");
    assert.ok(result.reasons.some(r => r.code === "NOTES_RECOMMENDED"));
  });

  it("stays GREEN when role contains 'risk' but notes are provided", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ role: "Risk-Manager", notes: "Sicherheitsrelevant" })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
  });

  it("stays GREEN when role does not contain 'risk' even without notes", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ role: "Lagerhelfer", notes: null })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
  });

  it("returns YELLOW when role is 'risky' and notes are whitespace", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ role: "risky-assignment", notes: "   " })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "YELLOW");
    assert.ok(result.reasons.some(r => r.code === "NOTES_RECOMMENDED"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// YELLOW — multiple reasons accumulate but status stays YELLOW
// ═══════════════════════════════════════════════════════════════════════════════

describe("computeForRequest — YELLOW accumulation", () => {
  it("accumulates multiple YELLOW reasons (cert + urgent rate + risk notes)", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({
        required_certifications: null,
        urgency: "urgent",
        max_hourly_rate_cents: null,
        role: "risk-operator",
        notes: null
      })] },
      POLICY_WITH_CERTS,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "YELLOW");
    const codes = result.reasons.map(r => r.code);
    assert.ok(codes.includes("REQUIRED_CERTIFICATIONS_MISSING"));
    // Note: MAX_RATE_MISSING_URGENT uses `status === "GREEN" ? "YELLOW" : status`
    // After cert check, status is already YELLOW, so the conditional preserves YELLOW
    assert.ok(codes.includes("MAX_RATE_MISSING_URGENT"));
    assert.ok(codes.includes("NOTES_RECOMMENDED"));
    assert.strictEqual(result.reasons.length, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Upsert verification — result is persisted to request_compliance
// ═══════════════════════════════════════════════════════════════════════════════

describe("computeForRequest — upsert to request_compliance", () => {
  it("upserts status and reasons as JSON into request_compliance", async () => {
    const pool = sequencePool(
      { rows: [VALID_REQUEST] },
      NO_POLICY,
      UPSERT_OK
    );
    await computeForRequest(pool, REQUEST_ID);
    // Third query should be the upsert
    assert.strictEqual(pool.queries.length, 3);
    const upsertQuery = pool.queries[2];
    assert.ok(upsertQuery.sql.includes("request_compliance"));
    assert.strictEqual(upsertQuery.params[0], REQUEST_ID);
    assert.strictEqual(upsertQuery.params[1], "GREEN");
    assert.strictEqual(upsertQuery.params[2], "[]"); // JSON-stringified empty reasons
  });

  it("persists RED status with all accumulated reason codes", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ quantity: 0, location_text: null })] },
      UPSERT_OK
    );
    await computeForRequest(pool, REQUEST_ID);
    const upsertQuery = pool.queries[1]; // second query = upsert (no policy query when RED)
    assert.strictEqual(upsertQuery.params[1], "RED");
    const reasons = JSON.parse(upsertQuery.params[2]);
    assert.ok(reasons.length >= 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Error handling — pool failures propagate
// ═══════════════════════════════════════════════════════════════════════════════

describe("computeForRequest — error handling", () => {
  it("propagates pool error on request query", async () => {
    const pool = { query: async () => { throw new Error("connection lost"); } };
    await assert.rejects(
      () => computeForRequest(pool, REQUEST_ID),
      (err) => {
        assert.strictEqual(err.message, "connection lost");
        return true;
      }
    );
  });

  it("propagates pool error on policy query (non-RED path)", async () => {
    let callCount = 0;
    const pool = {
      query: async () => {
        callCount++;
        if (callCount === 1) return { rows: [VALID_REQUEST] };
        throw new Error("policy table locked");
      }
    };
    await assert.rejects(
      () => computeForRequest(pool, REQUEST_ID),
      (err) => {
        assert.strictEqual(err.message, "policy table locked");
        return true;
      }
    );
  });

  it("propagates pool error on upsert", async () => {
    let callCount = 0;
    const pool = {
      query: async () => {
        callCount++;
        if (callCount === 1) return { rows: [makeRequest({ quantity: 0 })] }; // RED → skip policy
        throw new Error("disk full");
      }
    };
    await assert.rejects(
      () => computeForRequest(pool, REQUEST_ID),
      (err) => {
        assert.strictEqual(err.message, "disk full");
        return true;
      }
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Boundary / edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("computeForRequest — edge cases", () => {
  it("quantity=1 is valid (boundary: minimum valid)", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ quantity: 1 })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.ok(!result.reasons.some(r => r.code === "QUANTITY_INVALID"));
  });

  it("shift_schedule as string (non-object) passes the object-check", async () => {
    // typeof "Montag bis Freitag" is "string", not "object", so Object.keys check is skipped
    const pool = sequencePool(
      { rows: [makeRequest({ shift_schedule: "Montag bis Freitag" })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.ok(!result.reasons.some(r => r.code === "SHIFT_SCHEDULE_MISSING"));
  });

  it("end_date same day as start_date with duration_days=1 is valid", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ start_date: "2026-04-01", end_date: "2026-04-01", duration_days: 1 })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
  });

  it("role null does not trigger NOTES_RECOMMENDED", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ role: null, notes: null })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.ok(!result.reasons.some(r => r.code === "NOTES_RECOMMENDED"));
  });

  it("max_hourly_rate_cents = 1 (minimum positive) prevents YELLOW for urgent", async () => {
    const pool = sequencePool(
      { rows: [makeRequest({ urgency: "urgent", max_hourly_rate_cents: 1 })] },
      NO_POLICY,
      UPSERT_OK
    );
    const result = await computeForRequest(pool, REQUEST_ID);
    assert.strictEqual(result.status, "GREEN");
    assert.ok(!result.reasons.some(r => r.code === "MAX_RATE_MISSING_URGENT"));
  });
});
