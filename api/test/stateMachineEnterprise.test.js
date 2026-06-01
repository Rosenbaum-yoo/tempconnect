/**
 * State Machine — Enterprise Entity Tests
 *
 * Tests REQUISITION, DEAL, CAPACITY_POST, and SUBMISSION lifecycle transitions.
 * The original stateMachine.test.js covers REQUEST/RESERVATION/OFFER.
 *
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  assertTransition,
  TransitionError,
  REQUISITION_TRANSITIONS,
  DEAL_TRANSITIONS,
  CAPACITY_POST_TRANSITIONS,
  SUBMISSION_TRANSITIONS
} from "../services/stateMachine.js";

// ─────────────────────────────────────────────────────────────
// REQUISITION lifecycle
// ─────────────────────────────────────────────────────────────

describe("stateMachine — REQUISITION", () => {
  it("DRAFT -> PENDING_APPROVAL", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "DRAFT", "PENDING_APPROVAL"));
  });

  it("DRAFT -> OPEN (skip approval)", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "DRAFT", "OPEN"));
  });

  it("DRAFT -> CANCELLED", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "DRAFT", "CANCELLED"));
  });

  it("PENDING_APPROVAL -> APPROVED", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "PENDING_APPROVAL", "APPROVED"));
  });

  it("PENDING_APPROVAL -> CANCELLED", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "PENDING_APPROVAL", "CANCELLED"));
  });

  it("APPROVED -> OPEN", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "APPROVED", "OPEN"));
  });

  it("OPEN -> IN_REVIEW", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "OPEN", "IN_REVIEW"));
  });

  it("OPEN -> FILLED", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "OPEN", "FILLED"));
  });

  it("OPEN -> CLOSED", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "OPEN", "CLOSED"));
  });

  it("OPEN -> CANCELLED", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "OPEN", "CANCELLED"));
  });

  it("IN_REVIEW -> SHORTLISTED", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "IN_REVIEW", "SHORTLISTED"));
  });

  it("IN_REVIEW -> OPEN (re-open)", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "IN_REVIEW", "OPEN"));
  });

  it("SHORTLISTED -> FILLED", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "SHORTLISTED", "FILLED"));
  });

  it("FILLED -> CLOSED", () => {
    assert.doesNotThrow(() => assertTransition("REQUISITION", "FILLED", "CLOSED"));
  });

  // Terminal state guards
  it("CLOSED is terminal — rejects any transition", () => {
    assert.throws(
      () => assertTransition("REQUISITION", "CLOSED", "OPEN"),
      (e) => e instanceof TransitionError
    );
    assert.throws(
      () => assertTransition("REQUISITION", "CLOSED", "CANCELLED"),
      (e) => e instanceof TransitionError
    );
  });

  it("CANCELLED is terminal — rejects any transition", () => {
    assert.throws(
      () => assertTransition("REQUISITION", "CANCELLED", "DRAFT"),
      (e) => e instanceof TransitionError
    );
    assert.throws(
      () => assertTransition("REQUISITION", "CANCELLED", "OPEN"),
      (e) => e instanceof TransitionError
    );
  });

  // Invalid backward transitions
  it("FILLED cannot go back to OPEN", () => {
    assert.throws(
      () => assertTransition("REQUISITION", "FILLED", "OPEN"),
      (e) => e instanceof TransitionError && e.entityType === "REQUISITION"
    );
  });

  it("APPROVED cannot skip to IN_REVIEW", () => {
    assert.throws(
      () => assertTransition("REQUISITION", "APPROVED", "IN_REVIEW"),
      (e) => e instanceof TransitionError
    );
  });
});

describe("REQUISITION_TRANSITIONS map structure", () => {
  it("has all 9 statuses", () => {
    const expected = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "OPEN", "IN_REVIEW", "SHORTLISTED", "FILLED", "CLOSED", "CANCELLED"];
    for (const s of expected) {
      assert.ok(s in REQUISITION_TRANSITIONS, `Missing status: ${s}`);
    }
  });

  it("CLOSED and CANCELLED have empty transition arrays", () => {
    assert.deepStrictEqual(REQUISITION_TRANSITIONS.CLOSED, []);
    assert.deepStrictEqual(REQUISITION_TRANSITIONS.CANCELLED, []);
  });

  it("FILLED can only go to CLOSED", () => {
    assert.deepStrictEqual(REQUISITION_TRANSITIONS.FILLED, ["CLOSED"]);
  });
});

// ─────────────────────────────────────────────────────────────
// DEAL lifecycle
// ─────────────────────────────────────────────────────────────

describe("stateMachine — DEAL", () => {
  it("CREATED -> OFFER_SENT", () => {
    assert.doesNotThrow(() => assertTransition("DEAL", "CREATED", "OFFER_SENT"));
  });

  it("CREATED -> CANCELLED", () => {
    assert.doesNotThrow(() => assertTransition("DEAL", "CREATED", "CANCELLED"));
  });

  it("OFFER_SENT -> ACCEPTED", () => {
    assert.doesNotThrow(() => assertTransition("DEAL", "OFFER_SENT", "ACCEPTED"));
  });

  it("OFFER_SENT -> DECLINED", () => {
    assert.doesNotThrow(() => assertTransition("DEAL", "OFFER_SENT", "DECLINED"));
  });

  it("OFFER_SENT -> CANCELLED", () => {
    assert.doesNotThrow(() => assertTransition("DEAL", "OFFER_SENT", "CANCELLED"));
  });

  it("ACCEPTED -> CONFIRMED", () => {
    assert.doesNotThrow(() => assertTransition("DEAL", "ACCEPTED", "CONFIRMED"));
  });

  it("CONFIRMED -> ASSIGNMENT_STARTED", () => {
    assert.doesNotThrow(() => assertTransition("DEAL", "CONFIRMED", "ASSIGNMENT_STARTED"));
  });

  it("ASSIGNMENT_STARTED -> COMPLETED", () => {
    assert.doesNotThrow(() => assertTransition("DEAL", "ASSIGNMENT_STARTED", "COMPLETED"));
  });

  it("ASSIGNMENT_STARTED -> CANCELLED (emergency cancel)", () => {
    assert.doesNotThrow(() => assertTransition("DEAL", "ASSIGNMENT_STARTED", "CANCELLED"));
  });

  // Terminal state guards
  it("COMPLETED is terminal", () => {
    assert.throws(
      () => assertTransition("DEAL", "COMPLETED", "CANCELLED"),
      (e) => e instanceof TransitionError && e.entityType === "DEAL"
    );
  });

  it("DECLINED is terminal", () => {
    assert.throws(
      () => assertTransition("DEAL", "DECLINED", "ACCEPTED"),
      (e) => e instanceof TransitionError
    );
  });

  it("CANCELLED is terminal", () => {
    assert.throws(
      () => assertTransition("DEAL", "CANCELLED", "CREATED"),
      (e) => e instanceof TransitionError
    );
  });

  // Invalid transitions
  it("CREATED cannot jump directly to CONFIRMED", () => {
    assert.throws(
      () => assertTransition("DEAL", "CREATED", "CONFIRMED"),
      (e) => e instanceof TransitionError
    );
  });

  it("CONFIRMED cannot go back to OFFER_SENT", () => {
    assert.throws(
      () => assertTransition("DEAL", "CONFIRMED", "OFFER_SENT"),
      (e) => e instanceof TransitionError
    );
  });
});

describe("DEAL_TRANSITIONS map structure", () => {
  const terminalStatuses = ["COMPLETED", "DECLINED", "CANCELLED"];

  it("has all 8 statuses", () => {
    const expected = ["CREATED", "OFFER_SENT", "ACCEPTED", "CONFIRMED", "ASSIGNMENT_STARTED", "COMPLETED", "DECLINED", "CANCELLED"];
    for (const s of expected) {
      assert.ok(s in DEAL_TRANSITIONS, `Missing DEAL status: ${s}`);
    }
  });

  it("terminal statuses have empty transition arrays", () => {
    for (const s of terminalStatuses) {
      assert.deepStrictEqual(DEAL_TRANSITIONS[s], [], `${s} should be terminal`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// CAPACITY_POST lifecycle
// ─────────────────────────────────────────────────────────────

describe("stateMachine — CAPACITY_POST", () => {
  it("draft -> active", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "draft", "active"));
  });

  it("active -> paused", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "active", "paused"));
  });

  it("active -> filled", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "active", "filled"));
  });

  it("active -> expired", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "active", "expired"));
  });

  it("paused -> active (re-activate)", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "paused", "active"));
  });

  it("paused -> archived", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "paused", "archived"));
  });

  it("expired -> active (re-activate)", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "expired", "active"));
  });

  it("expired -> archived", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "expired", "archived"));
  });

  it("filled -> archived", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "filled", "archived"));
  });

  // Terminal and invalid
  it("archived is terminal", () => {
    assert.throws(
      () => assertTransition("CAPACITY_POST", "archived", "active"),
      (e) => e instanceof TransitionError
    );
  });

  it("draft cannot jump to filled", () => {
    assert.throws(
      () => assertTransition("CAPACITY_POST", "draft", "filled"),
      (e) => e instanceof TransitionError
    );
  });

  it("filled cannot go back to active", () => {
    assert.throws(
      () => assertTransition("CAPACITY_POST", "filled", "active"),
      (e) => e instanceof TransitionError
    );
  });
});

describe("CAPACITY_POST_TRANSITIONS map structure", () => {
  it("has all 6 statuses", () => {
    const expected = ["draft", "active", "paused", "filled", "expired", "archived"];
    for (const s of expected) {
      assert.ok(s in CAPACITY_POST_TRANSITIONS, `Missing status: ${s}`);
    }
  });

  it("archived is terminal", () => {
    assert.deepStrictEqual(CAPACITY_POST_TRANSITIONS.archived, []);
  });
});

// ─────────────────────────────────────────────────────────────
// SUBMISSION lifecycle
// ─────────────────────────────────────────────────────────────

describe("stateMachine — SUBMISSION", () => {
  it("DRAFT -> SUBMITTED", () => {
    assert.doesNotThrow(() => assertTransition("SUBMISSION", "DRAFT", "SUBMITTED"));
  });

  it("DRAFT -> WITHDRAWN", () => {
    assert.doesNotThrow(() => assertTransition("SUBMISSION", "DRAFT", "WITHDRAWN"));
  });

  it("SUBMITTED -> UNDER_REVIEW", () => {
    assert.doesNotThrow(() => assertTransition("SUBMISSION", "SUBMITTED", "UNDER_REVIEW"));
  });

  it("SUBMITTED -> WITHDRAWN", () => {
    assert.doesNotThrow(() => assertTransition("SUBMISSION", "SUBMITTED", "WITHDRAWN"));
  });

  it("UNDER_REVIEW -> ACCEPTED", () => {
    assert.doesNotThrow(() => assertTransition("SUBMISSION", "UNDER_REVIEW", "ACCEPTED"));
  });

  it("UNDER_REVIEW -> REJECTED", () => {
    assert.doesNotThrow(() => assertTransition("SUBMISSION", "UNDER_REVIEW", "REJECTED"));
  });

  it("UNDER_REVIEW -> WITHDRAWN", () => {
    assert.doesNotThrow(() => assertTransition("SUBMISSION", "UNDER_REVIEW", "WITHDRAWN"));
  });

  // Terminal state guards
  it("ACCEPTED is terminal", () => {
    assert.throws(
      () => assertTransition("SUBMISSION", "ACCEPTED", "SUBMITTED"),
      (e) => e instanceof TransitionError
    );
  });

  it("REJECTED is terminal", () => {
    assert.throws(
      () => assertTransition("SUBMISSION", "REJECTED", "SUBMITTED"),
      (e) => e instanceof TransitionError
    );
  });

  it("WITHDRAWN is terminal", () => {
    assert.throws(
      () => assertTransition("SUBMISSION", "WITHDRAWN", "DRAFT"),
      (e) => e instanceof TransitionError
    );
  });

  // Invalid transitions
  it("DRAFT cannot skip to UNDER_REVIEW", () => {
    assert.throws(
      () => assertTransition("SUBMISSION", "DRAFT", "UNDER_REVIEW"),
      (e) => e instanceof TransitionError
    );
  });
});

describe("SUBMISSION_TRANSITIONS map structure", () => {
  const terminalStatuses = ["ACCEPTED", "REJECTED", "WITHDRAWN"];

  it("has all 6 statuses", () => {
    const expected = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"];
    for (const s of expected) {
      assert.ok(s in SUBMISSION_TRANSITIONS, `Missing status: ${s}`);
    }
  });

  it("terminal statuses have empty transition arrays", () => {
    for (const s of terminalStatuses) {
      assert.deepStrictEqual(SUBMISSION_TRANSITIONS[s], [], `${s} should be terminal`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Unknown entity type
// ─────────────────────────────────────────────────────────────

describe("stateMachine — unknown entity type", () => {
  it("throws TransitionError for unknown entity type", () => {
    assert.throws(
      () => assertTransition("UNKNOWN_ENTITY", "foo", "bar"),
      (e) => e instanceof TransitionError && e.entityType === "UNKNOWN_ENTITY"
    );
  });
});
