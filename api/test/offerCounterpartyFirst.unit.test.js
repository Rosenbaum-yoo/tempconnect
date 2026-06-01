/**
 * Unit tests: Counterparty-first offer logic.
 * Tests computeOfferNextAction(), OFFER_VIEWER_LABELS, and OFFER_TRANSITIONS.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeOfferNextAction,
  OFFER_VIEWER_LABELS
} from "../services/marketplaceService.js";
import {
  OFFER_TRANSITIONS,
  assertTransition,
  TransitionError
} from "../services/stateMachine.js";

const SUPPLIER = "supplier-uuid";
const REQUESTER = "requester-uuid";
const THIRD_PARTY = "third-party-uuid";

function makeOffer(status) {
  return { id: "offer-1", supplier_company_id: SUPPLIER, requester_company_id: REQUESTER, status };
}

/* ── OFFER_TRANSITIONS ─────────────────────────────── */

describe("OFFER_TRANSITIONS", () => {
  it("draft allows sent and withdrawn", () => {
    assert.deepStrictEqual(OFFER_TRANSITIONS.draft, ["sent", "withdrawn"]);
  });

  it("sent allows accepted, rejected, countered, withdrawn", () => {
    assert.deepStrictEqual(OFFER_TRANSITIONS.sent, ["accepted", "rejected", "countered", "withdrawn"]);
  });

  it("countered allows sent and withdrawn", () => {
    assert.deepStrictEqual(OFFER_TRANSITIONS.countered, ["sent", "withdrawn"]);
  });

  it("terminal states have no transitions", () => {
    assert.deepStrictEqual(OFFER_TRANSITIONS.accepted, []);
    assert.deepStrictEqual(OFFER_TRANSITIONS.rejected, []);
    assert.deepStrictEqual(OFFER_TRANSITIONS.withdrawn, []);
  });

  it("assertTransition passes for valid transitions", () => {
    assert.doesNotThrow(() => assertTransition("OFFER", "draft", "sent"));
    assert.doesNotThrow(() => assertTransition("OFFER", "sent", "accepted"));
    assert.doesNotThrow(() => assertTransition("OFFER", "sent", "countered"));
    assert.doesNotThrow(() => assertTransition("OFFER", "countered", "sent"));
  });

  it("assertTransition throws for invalid transitions", () => {
    assert.throws(() => assertTransition("OFFER", "accepted", "sent"), TransitionError);
    assert.throws(() => assertTransition("OFFER", "rejected", "accepted"), TransitionError);
    assert.throws(() => assertTransition("OFFER", "withdrawn", "sent"), TransitionError);
    assert.throws(() => assertTransition("OFFER", "draft", "accepted"), TransitionError);
  });
});

/* ── computeOfferNextAction ────────────────────────── */

describe("computeOfferNextAction", () => {

  /* draft */
  it("draft: supplier sees action_required with send/withdraw", () => {
    const r = computeOfferNextAction(makeOffer("draft"), SUPPLIER);
    assert.equal(r.actor_required, "supplier");
    assert.equal(r.viewer_mode, "sender");
    assert.equal(r.viewer_state, "action_required");
    assert.ok(r.actions.includes("send"));
    assert.ok(r.actions.includes("withdraw"));
    assert.ok(r.viewer_label.includes("Entwurf"));
  });

  it("draft: requester sees waiting_on_counterparty", () => {
    const r = computeOfferNextAction(makeOffer("draft"), REQUESTER);
    assert.equal(r.viewer_state, "waiting_on_counterparty");
    assert.equal(r.actions.length, 0); // no actions for requester on draft
  });

  /* sent */
  it("sent: requester sees action_required with accept/reject/counter", () => {
    const r = computeOfferNextAction(makeOffer("sent"), REQUESTER);
    assert.equal(r.actor_required, "requester");
    assert.equal(r.viewer_state, "action_required");
    assert.ok(r.actions.includes("accept"));
    assert.ok(r.actions.includes("reject"));
    assert.ok(r.actions.includes("counter"));
    assert.ok(r.viewer_label.includes("Entscheidung"));
  });

  it("sent: supplier sees waiting_on_counterparty with withdraw", () => {
    const r = computeOfferNextAction(makeOffer("sent"), SUPPLIER);
    assert.equal(r.viewer_state, "waiting_on_counterparty");
    assert.ok(r.actions.includes("withdraw"));
    assert.ok(!r.actions.includes("accept"));
    assert.ok(r.viewer_label.includes("wartet"));
  });

  /* countered */
  it("countered: supplier sees action_required with send/withdraw", () => {
    const r = computeOfferNextAction(makeOffer("countered"), SUPPLIER);
    assert.equal(r.actor_required, "supplier");
    assert.equal(r.viewer_state, "action_required");
    assert.ok(r.actions.includes("send"));
    assert.ok(r.actions.includes("withdraw"));
    assert.ok(r.viewer_label.includes("Gegenangebot erhalten"));
  });

  it("countered: requester sees waiting_on_counterparty", () => {
    const r = computeOfferNextAction(makeOffer("countered"), REQUESTER);
    assert.equal(r.viewer_state, "waiting_on_counterparty");
    assert.ok(r.actions.includes("wait"));
    assert.ok(r.viewer_label.includes("wartet"));
  });

  /* accepted */
  it("accepted: both see closed with view_followup", () => {
    const s = computeOfferNextAction(makeOffer("accepted"), SUPPLIER);
    const req = computeOfferNextAction(makeOffer("accepted"), REQUESTER);
    assert.equal(s.viewer_state, "closed");
    assert.equal(req.viewer_state, "closed");
    assert.equal(s.actor_required, "none");
    assert.ok(s.actions.includes("view_followup"));
    assert.ok(req.actions.includes("view_followup"));
  });

  /* rejected */
  it("rejected: both see closed with view", () => {
    const s = computeOfferNextAction(makeOffer("rejected"), SUPPLIER);
    assert.equal(s.viewer_state, "closed");
    assert.ok(s.actions.includes("view"));
    assert.ok(!s.actions.includes("accept"));
  });

  /* withdrawn */
  it("withdrawn: both see closed with view", () => {
    const s = computeOfferNextAction(makeOffer("withdrawn"), SUPPLIER);
    const req = computeOfferNextAction(makeOffer("withdrawn"), REQUESTER);
    assert.equal(s.viewer_state, "closed");
    assert.equal(req.viewer_state, "closed");
    assert.ok(!s.actions.includes("withdraw"));
    assert.ok(!req.actions.includes("accept"));
  });

  /* third party */
  it("third party has no meaningful actions", () => {
    const r = computeOfferNextAction(makeOffer("sent"), THIRD_PARTY);
    assert.ok(!r.actions.includes("accept"));
    assert.ok(!r.actions.includes("send"));
  });

  /* viewer_label present for all statuses */
  it("viewer_label is always a non-empty string", () => {
    for (const st of ["draft", "sent", "countered", "accepted", "rejected", "withdrawn"]) {
      const s = computeOfferNextAction(makeOffer(st), SUPPLIER);
      assert.ok(typeof s.viewer_label === "string" && s.viewer_label.length > 0, `viewer_label for ${st}/supplier`);
      const r = computeOfferNextAction(makeOffer(st), REQUESTER);
      assert.ok(typeof r.viewer_label === "string" && r.viewer_label.length > 0, `viewer_label for ${st}/requester`);
    }
  });
});

/* ── OFFER_VIEWER_LABELS ───────────────────────────── */

describe("OFFER_VIEWER_LABELS", () => {
  it("has entries for all status × mode combinations", () => {
    const statuses = ["draft", "sent", "countered", "accepted", "rejected", "withdrawn"];
    const modes = ["sender", "receiver"];
    for (const s of statuses) {
      for (const m of modes) {
        const key = `${s}.${m}`;
        assert.ok(OFFER_VIEWER_LABELS[key], `Missing label for ${key}`);
      }
    }
  });

  it("sender and receiver see different labels for sent status", () => {
    assert.notEqual(OFFER_VIEWER_LABELS["sent.sender"], OFFER_VIEWER_LABELS["sent.receiver"]);
  });

  it("sender and receiver see different labels for countered status", () => {
    assert.notEqual(OFFER_VIEWER_LABELS["countered.sender"], OFFER_VIEWER_LABELS["countered.receiver"]);
  });

  it("sender and receiver see different labels for withdrawn status", () => {
    assert.notEqual(OFFER_VIEWER_LABELS["withdrawn.sender"], OFFER_VIEWER_LABELS["withdrawn.receiver"]);
  });
});
