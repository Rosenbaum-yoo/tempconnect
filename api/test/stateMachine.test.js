/**
 * State machine: assertTransition, invalid transitions return 409 with
 * { error: "invalid_transition", entityType, from, to }.
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  assertTransition,
  TransitionError,
  REQUEST_TRANSITIONS,
  RESERVATION_TRANSITIONS,
  OFFER_TRANSITIONS
} from "../services/stateMachine.js";

describe("stateMachine.assertTransition", () => {
  describe("REQUEST", () => {
    it("allows SENT -> ACCEPTED, DECLINED, CANCELED", () => {
      assert.doesNotThrow(() => assertTransition("REQUEST", "SENT", "ACCEPTED"));
      assert.doesNotThrow(() => assertTransition("REQUEST", "SENT", "DECLINED"));
      assert.doesNotThrow(() => assertTransition("REQUEST", "SENT", "CANCELED"));
    });

    it("rejects SENT -> FINALIZED", () => {
      assert.throws(
        () => assertTransition("REQUEST", "SENT", "FINALIZED"),
        (e) => e.name === "TransitionError" && e.entityType === "REQUEST" && e.from === "SENT" && e.to === "FINALIZED"
      );
    });

    it("allows ACCEPTED -> FINALIZED, FILLED, CANCELED", () => {
      assert.doesNotThrow(() => assertTransition("REQUEST", "ACCEPTED", "FINALIZED"));
      assert.doesNotThrow(() => assertTransition("REQUEST", "ACCEPTED", "FILLED"));
      assert.doesNotThrow(() => assertTransition("REQUEST", "ACCEPTED", "CANCELED"));
    });

    it("rejects DECLINED -> ACCEPTED", () => {
      assert.throws(
        () => assertTransition("REQUEST", "DECLINED", "ACCEPTED"),
        (e) => e.entityType === "REQUEST" && e.from === "DECLINED" && e.to === "ACCEPTED"
      );
    });

    it("rejects FINALIZED -> CANCELED", () => {
      assert.throws(
        () => assertTransition("REQUEST", "FINALIZED", "CANCELED"),
        (e) => e.entityType === "REQUEST" && e.from === "FINALIZED" && e.to === "CANCELED"
      );
    });
  });

  describe("RESERVATION", () => {
    it("allows active -> converted, expired", () => {
      assert.doesNotThrow(() => assertTransition("RESERVATION", "active", "converted"));
      assert.doesNotThrow(() => assertTransition("RESERVATION", "active", "expired"));
    });

    it("rejects converted -> expired", () => {
      assert.throws(
        () => assertTransition("RESERVATION", "converted", "expired"),
        (e) => e.entityType === "RESERVATION" && e.from === "converted" && e.to === "expired"
      );
    });

    it("rejects expired -> active", () => {
      assert.throws(
        () => assertTransition("RESERVATION", "expired", "active"),
        (e) => e.entityType === "RESERVATION" && e.from === "expired" && e.to === "active"
      );
    });
  });

  describe("OFFER", () => {
    it("rejects invalid from-status (pending is not in lifecycle)", () => {
      assert.throws(
        () => assertTransition("OFFER", "pending", "accepted"),
        (e) => e.entityType === "OFFER" && e.from === "pending" && e.to === "accepted"
      );
    });
  });

  describe("TransitionError", () => {
    it("has entityType, from, to for 409 response", () => {
      try {
        assertTransition("REQUEST", "SENT", "FILLED");
        assert.fail("expected throw");
      } catch (e) {
        assert.ok(e instanceof TransitionError);
        assert.strictEqual(e.name, "TransitionError");
        assert.strictEqual(e.entityType, "REQUEST");
        assert.strictEqual(e.from, "SENT");
        assert.strictEqual(e.to, "FILLED");
        const body = { error: "invalid_transition", entityType: e.entityType, from: e.from, to: e.to };
        assert.deepStrictEqual(body, { error: "invalid_transition", entityType: "REQUEST", from: "SENT", to: "FILLED" });
      }
    });
  });
});

describe("Allowed transitions maps", () => {
  it("REQUEST_TRANSITIONS matches REQUEST entity", () => {
    assert.ok(REQUEST_TRANSITIONS.SENT.includes("ACCEPTED"));
    assert.ok(REQUEST_TRANSITIONS.ACCEPTED.includes("FINALIZED"));
    assert.strictEqual(REQUEST_TRANSITIONS.DECLINED?.length, 0);
  });

  it("RESERVATION_TRANSITIONS has active -> converted, expired", () => {
    assert.ok(RESERVATION_TRANSITIONS.active.includes("converted"));
    assert.ok(RESERVATION_TRANSITIONS.active.includes("expired"));
    assert.strictEqual(RESERVATION_TRANSITIONS.converted?.length, 0);
  });

  it("OFFER_TRANSITIONS has full lifecycle", () => {
    assert.ok(OFFER_TRANSITIONS.draft.includes("sent"));
    assert.ok(OFFER_TRANSITIONS.sent.includes("accepted"));
    assert.ok(OFFER_TRANSITIONS.sent.includes("rejected"));
    assert.strictEqual(OFFER_TRANSITIONS.accepted?.length, 0);
    assert.strictEqual(OFFER_TRANSITIONS.rejected?.length, 0);
    assert.strictEqual(OFFER_TRANSITIONS.withdrawn?.length, 0);
  });
});
