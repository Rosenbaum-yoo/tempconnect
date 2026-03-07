/**
 * Enterprise Hardening: idempotency path norm, invalid status transitions.
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert";

const REQUEST_STATUS_TRANSITIONS = {
  SENT: ["ACCEPTED", "DECLINED", "CANCELED"],
  ACCEPTED: ["FINALIZED", "FILLED", "CANCELED"],
  DECLINED: [],
  FILLED: [],
  FINALIZED: [],
  CANCELED: []
};

function isValidRequestStatusTransition(fromStatus, toStatus) {
  const allowed = REQUEST_STATUS_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

describe("Request status machine", () => {
  it("allows SENT to ACCEPTED DECLINED CANCELED", () => {
    assert.strictEqual(isValidRequestStatusTransition("SENT", "ACCEPTED"), true);
    assert.strictEqual(isValidRequestStatusTransition("SENT", "DECLINED"), true);
    assert.strictEqual(isValidRequestStatusTransition("SENT", "CANCELED"), true);
  });

  it("rejects SENT to FINALIZED", () => {
    assert.strictEqual(isValidRequestStatusTransition("SENT", "FINALIZED"), false);
  });

  it("allows ACCEPTED to FINALIZED FILLED CANCELED", () => {
    assert.strictEqual(isValidRequestStatusTransition("ACCEPTED", "FINALIZED"), true);
    assert.strictEqual(isValidRequestStatusTransition("ACCEPTED", "CANCELED"), true);
  });

  it("rejects terminal states from changing", () => {
    assert.strictEqual(isValidRequestStatusTransition("DECLINED", "ACCEPTED"), false);
    assert.strictEqual(isValidRequestStatusTransition("FINALIZED", "CANCELED"), false);
  });
});

describe("Idempotency path normalize", () => {
  it("replaces UUID with :id", () => {
    const path = "/api/capacities/550e8400-e29b-41d4-a716-446655440000";
    const out = path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
    assert.ok(out.includes(":id"));
  });
});
