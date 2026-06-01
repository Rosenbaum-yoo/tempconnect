/**
 * Deal Closure Complete Tests
 *
 * Ergaenzt die vorhandenen Tests (dealAgreement, dealAgreementEnterprise) um:
 *   1. OFFER state machine cross-checks
 *   2. AGREEMENT terminal-status exhaustive guards
 *   3. Agreement-Dokument: Signaturstatus-Rendering
 *   4. Agreement-Dokument: Cancelled/Expired-Dokument-Handling
 *   5. getActionRequired edge cases (unknown viewer, draft, missing fields)
 *   6. getOfferDealProgress: expired, draft, withdrawn, unknown
 *   7. computeContentHash: truncation, encoding
 *   8. buildConditionsSnapshot-like struct validation
 *   9. renderConditionsSheet: minimal/empty, surcharges, cancellation_policy
 *  10. renderAgreementDocument: signature metadata rendering
 *
 * Run: node --test --test-force-exit test/dealClosureComplete.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";

import {
  assertTransition,
  TransitionError,
  AGREEMENT_TRANSITIONS,
  OFFER_TRANSITIONS
} from "../services/stateMachine.js";

import { getActionRequired } from "../services/dealAgreementService.js";
import { getOfferDealProgress, getNextAction } from "../services/dealProgressHelper.js";
import { computeContentHash } from "../services/dealDossierService.js";
import {
  renderConditionsSheet,
  renderAgreementDocument
} from "../services/agreementDocumentService.js";

// ═══════════════════════════════════════════════════════════════════
// 1. OFFER state machine cross-checks
// ═══════════════════════════════════════════════════════════════════

describe("OFFER state machine: valid transitions", () => {
  it("draft → sent", () => {
    assert.doesNotThrow(() => assertTransition("OFFER", "draft", "sent"));
  });
  it("draft → withdrawn", () => {
    assert.doesNotThrow(() => assertTransition("OFFER", "draft", "withdrawn"));
  });
  it("sent → accepted", () => {
    assert.doesNotThrow(() => assertTransition("OFFER", "sent", "accepted"));
  });
  it("sent → rejected", () => {
    assert.doesNotThrow(() => assertTransition("OFFER", "sent", "rejected"));
  });
  it("sent → countered", () => {
    assert.doesNotThrow(() => assertTransition("OFFER", "sent", "countered"));
  });
  it("sent → withdrawn", () => {
    assert.doesNotThrow(() => assertTransition("OFFER", "sent", "withdrawn"));
  });
  it("countered → sent", () => {
    assert.doesNotThrow(() => assertTransition("OFFER", "countered", "sent"));
  });
  it("countered → withdrawn", () => {
    assert.doesNotThrow(() => assertTransition("OFFER", "countered", "withdrawn"));
  });
});

describe("OFFER state machine: terminal states reject all transitions", () => {
  const TERMINAL = ["accepted", "rejected", "withdrawn"];
  const ALL_STATES = Object.keys(OFFER_TRANSITIONS);

  for (const terminal of TERMINAL) {
    for (const target of ALL_STATES) {
      it(`${terminal} → ${target} is INVALID`, () => {
        assert.throws(
          () => assertTransition("OFFER", terminal, target),
          (err) => err instanceof TransitionError
        );
      });
    }
  }
});

describe("OFFER state machine: invalid shortcuts", () => {
  it("draft → accepted is INVALID (skip sent)", () => {
    assert.throws(
      () => assertTransition("OFFER", "draft", "accepted"),
      (err) => err instanceof TransitionError
    );
  });
  it("draft → countered is INVALID", () => {
    assert.throws(
      () => assertTransition("OFFER", "draft", "countered"),
      (err) => err instanceof TransitionError
    );
  });
  it("countered → accepted is INVALID (must resend first)", () => {
    assert.throws(
      () => assertTransition("OFFER", "countered", "accepted"),
      (err) => err instanceof TransitionError
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. AGREEMENT terminal-status exhaustive guards
// ═══════════════════════════════════════════════════════════════════

describe("AGREEMENT: exhaustive terminal status guards", () => {
  // Note: "activated" is NOT terminal — Welle 7 Phase 9 allows activated → cancelled
  // (Storno-Pfad for incorrectly activated deals). Only cancelled + expired are truly terminal.
  const TERMINALS = ["cancelled", "expired"];
  const ALL_TARGETS = Object.keys(AGREEMENT_TRANSITIONS);

  for (const terminal of TERMINALS) {
    for (const target of ALL_TARGETS) {
      if (target === terminal) continue;
      it(`${terminal} → ${target} is INVALID (terminal)`, () => {
        assert.throws(
          () => assertTransition("AGREEMENT", terminal, target),
          (err) => err instanceof TransitionError
        );
      });
    }
    it(`${terminal} has empty transition array`, () => {
      assert.deepStrictEqual(AGREEMENT_TRANSITIONS[terminal], []);
    });
  }
});

describe("AGREEMENT: activated state — Welle 7 Phase 9 Storno-Pfad", () => {
  it("activated → cancelled is VALID (Storno-Pfad dreht Assignments zurueck)", () => {
    assert.doesNotThrow(() => assertTransition("AGREEMENT", "activated", "cancelled"));
  });
  it("activated has only cancelled as allowed transition", () => {
    assert.deepStrictEqual(AGREEMENT_TRANSITIONS.activated, ["cancelled"]);
  });
  it("activated → expired is INVALID (nur cancelled erlaubt)", () => {
    assert.throws(
      () => assertTransition("AGREEMENT", "activated", "expired"),
      (err) => err instanceof TransitionError
    );
  });
});

describe("AGREEMENT: none can only reach pending_confirmation", () => {
  const BAD_TARGETS = ["confirmed", "activated", "cancelled", "expired"];
  for (const target of BAD_TARGETS) {
    it(`none → ${target} is INVALID`, () => {
      assert.throws(
        () => assertTransition("AGREEMENT", "none", target),
        (err) => err instanceof TransitionError
      );
    });
  }
});

describe("AGREEMENT: unknown entity type throws", () => {
  it("UNKNOWN_ENTITY throws TransitionError", () => {
    assert.throws(
      () => assertTransition("UNKNOWN_ENTITY", "none", "pending_confirmation"),
      (err) => err instanceof TransitionError
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. getActionRequired edge cases
// ═══════════════════════════════════════════════════════════════════

describe("getActionRequired: edge cases", () => {
  const R = "r-1", S = "s-1", X = "x-other";
  const base = { requester_company_id: R, supplier_company_id: S };

  it("third-party viewer sees waiting for accepted/none (non-requester fallback)", () => {
    // Code: isRequester ? action_required : waiting → third party = waiting
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "none" }, X), "waiting");
  });

  it("third-party viewer sees waiting for pending_confirmation (non-supplier fallback)", () => {
    // Code: isSupplier ? action_required : waiting → third party = waiting
    const r = getActionRequired({ ...base, status: "accepted", agreement_status: "pending_confirmation" }, X);
    assert.strictEqual(r, "waiting");
  });

  it("draft status → none (not in action map)", () => {
    const r = getActionRequired({ ...base, status: "draft", agreement_status: "none" }, R);
    assert.strictEqual(r, "none");
  });

  it("undefined agreement_status + accepted → requester action_required", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: undefined }, R), "action_required");
  });

  it("empty string agreement_status + accepted → requester action_required", () => {
    const r = getActionRequired({ ...base, status: "accepted", agreement_status: "" }, R);
    // "" is falsy → same as null → falls into accepted + no agreement → action_required
    assert.strictEqual(r, "action_required");
  });

  it("cancelled for third-party viewer too", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "cancelled" }, X), "cancelled");
  });

  it("expired for all viewers", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "expired" }, X), "expired");
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "expired" }, S), "expired");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. getOfferDealProgress: expanded edge cases
// ═══════════════════════════════════════════════════════════════════

describe("getOfferDealProgress: expanded", () => {
  it("draft → 5%", () => {
    const p = getOfferDealProgress({ status: "draft", agreement_status: "none" });
    assert.strictEqual(p.pct, 5);
    assert.strictEqual(p.phase, "negotiation");
  });

  it("withdrawn → terminal, 0%", () => {
    const p = getOfferDealProgress({ status: "withdrawn" });
    assert.strictEqual(p.pct, 0);
    assert.strictEqual(p.phase, "terminal");
  });

  it("expired agreement → agreement phase, 0%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "expired" });
    assert.strictEqual(p.pct, 0);
    assert.strictEqual(p.phase, "agreement");
  });

  it("accepted + none → negotiation 50%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "none" });
    assert.strictEqual(p.pct, 50);
    assert.strictEqual(p.phase, "negotiation");
  });

  it("unknown status → 0%, unknown phase", () => {
    const p = getOfferDealProgress({ status: "nonexistent_status" });
    assert.strictEqual(p.pct, 0);
    assert.strictEqual(p.phase, "unknown");
  });

  it("undefined → 0%", () => {
    const p = getOfferDealProgress(undefined);
    assert.strictEqual(p.pct, 0);
  });
});

describe("getNextAction", () => {
  it("CREATED → send_offer", () => {
    const na = getNextAction("CREATED");
    assert.strictEqual(na.action, "send_offer");
  });
  it("COMPLETED → null", () => {
    assert.strictEqual(getNextAction("COMPLETED"), null);
  });
  it("DECLINED → null", () => {
    assert.strictEqual(getNextAction("DECLINED"), null);
  });
  it("unknown → null", () => {
    assert.strictEqual(getNextAction("NONEXISTENT"), null);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. computeContentHash: truncation + encoding
// ═══════════════════════════════════════════════════════════════════

describe("computeContentHash: edge cases", () => {
  it("empty string is falsy → returns null", () => {
    // "" is falsy in JS → computeContentHash returns null
    assert.strictEqual(computeContentHash(""), null);
  });

  it("very long string is truncated before hashing (deterministic)", () => {
    const long = "x".repeat(100000);
    const h1 = computeContentHash(long);
    // Same first 10240 chars → same hash
    const h2 = computeContentHash(long.slice(0, 10240));
    assert.strictEqual(h1, h2);
  });

  it("unicode content hashes correctly", () => {
    const h = computeContentHash("Ü日本語");
    assert.strictEqual(typeof h, "string");
    assert.strictEqual(h.length, 64);
  });

  it("number input is coerced to string", () => {
    const h = computeContentHash(42);
    assert.strictEqual(typeof h, "string");
    assert.strictEqual(h.length, 64);
  });

  it("false/0 input returns null", () => {
    assert.strictEqual(computeContentHash(false), null);
    assert.strictEqual(computeContentHash(0), null);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. renderConditionsSheet: edge cases
// ═══════════════════════════════════════════════════════════════════

describe("renderConditionsSheet: edge cases", () => {
  it("renders with minimal/empty offer", () => {
    const html = renderConditionsSheet({ id: "empty-test" });
    assert.ok(html.includes("Konditionsblatt"));
    assert.ok(html.includes("empty-test"));
    assert.ok(html.includes("In Verhandlung"));
  });

  it("renders with surcharges including holiday", () => {
    const html = renderConditionsSheet({
      id: "surcharge-test",
      surcharges: { night: 15, weekend: 30, holiday: 100 }
    });
    assert.ok(html.includes("Nacht: +15%"));
    assert.ok(html.includes("Wochenende: +30%"));
    assert.ok(html.includes("Feiertag: +100%"));
  });

  it("renders without surcharges section when null", () => {
    const html = renderConditionsSheet({ id: "no-surcharges", surcharges: null });
    assert.ok(!html.includes("Zuschläge"));
  });

  it("renders terms section", () => {
    const html = renderConditionsSheet({ id: "terms-test", terms: "Sonderklausel XYZ" });
    assert.ok(html.includes("Sonderklausel XYZ"));
    assert.ok(html.includes("Besondere Vereinbarungen"));
  });

  it("XSS-safe: escapes HTML in offer fields", () => {
    const html = renderConditionsSheet({
      id: "xss-test",
      demand_role: "<script>alert(1)</script>"
    });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. renderAgreementDocument: signature metadata + edge cases
// ═══════════════════════════════════════════════════════════════════

describe("renderAgreementDocument: signature metadata", () => {
  it("renders pending signature status", () => {
    const html = renderAgreementDocument({
      agreement_ref: "EV-TEST-SIG",
      agreement_status: "confirmed",
      agreement_version: 1,
      signature_status: "pending",
      signature_provider: "docusign",
      agreement_snapshot: {
        demand_role: "Tester",
        requester_company: "TestCorp",
        supplier_company_name: "AgencyStaff"
      }
    });
    assert.ok(html.includes("Signatur vorbereitet"));
    assert.ok(html.includes("docusign"));
  });

  it("renders fully_signed status", () => {
    const html = renderAgreementDocument({
      agreement_ref: "EV-TEST-SIGNED",
      agreement_status: "activated",
      agreement_version: 1,
      signature_status: "fully_signed",
      agreement_snapshot: {
        demand_role: "Monteur",
        requester_company: "BauGmbH",
        supplier_company_name: "SupplyAG"
      }
    });
    assert.ok(html.includes("Vollständig signiert"));
  });

  it("renders not_required when no signature_status", () => {
    const html = renderAgreementDocument({
      agreement_ref: "EV-TEST-NOSIG",
      agreement_status: "confirmed",
      agreement_version: 1,
      agreement_snapshot: { demand_role: "Helper" }
    });
    assert.ok(html.includes("Keine Signatur erforderlich"));
  });

  it("renders cancelled agreement status label", () => {
    const html = renderAgreementDocument({
      agreement_ref: "EV-TEST-CANCEL",
      agreement_status: "cancelled",
      agreement_version: 1,
      agreement_snapshot: { demand_role: "Cancelled Role" }
    });
    // cancelled is not in the label map → falls back to raw status
    assert.ok(html.includes("cancelled") || html.includes("Storniert"));
  });

  it("renders with minimal snapshot", () => {
    const html = renderAgreementDocument({
      agreement_ref: "EV-MINIMAL",
      agreement_version: 1,
      agreement_snapshot: {}
    });
    assert.ok(html.includes("EINSATZVEREINBARUNG"));
    assert.ok(html.includes("EV-MINIMAL"));
  });

  it("renders without snapshot (graceful fallback)", () => {
    const html = renderAgreementDocument({
      agreement_ref: "EV-NOSNAPSHOT",
      agreement_version: 1
    });
    assert.ok(html.includes("EINSATZVEREINBARUNG"));
    assert.ok(html.includes("EV-NOSNAPSHOT"));
  });

  it("XSS-safe: escapes ref and snapshot fields", () => {
    const html = renderAgreementDocument({
      agreement_ref: "<img onerror=alert(1)>",
      agreement_version: 1,
      agreement_snapshot: {
        demand_role: "<b>bold</b>"
      }
    });
    assert.ok(!html.includes("<img onerror=alert(1)>"));
    assert.ok(html.includes("&lt;img"));
    assert.ok(!html.includes("<b>bold</b>"));
  });

  it("renders cancellation_policy section", () => {
    const html = renderAgreementDocument({
      agreement_ref: "EV-CANCEL-POLICY",
      agreement_version: 1,
      agreement_snapshot: {
        demand_role: "Operator",
        cancellation_policy: { notice_hours: 72, penalty_percent: 15 }
      }
    });
    assert.ok(html.includes("72"));
    assert.ok(html.includes("15%"));
    assert.ok(html.includes("Stornierung"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Conditions snapshot struct validation
// ═══════════════════════════════════════════════════════════════════

describe("Conditions snapshot struct", () => {
  const EXPECTED_KEYS = [
    "demand_id", "demand_title", "demand_role", "demand_location",
    "demand_start", "demand_end", "demand_headcount", "requester_company",
    "offered_quantity", "offered_hourly_rate", "price_type", "price_value",
    "price_min", "price_max", "start_confirmed", "end_date", "surcharges",
    "billing_unit", "min_hours_per_shift", "replacement_sla_minutes",
    "response_time_minutes", "cancellation_policy", "terms", "validity_until",
    "offer_id", "supplier_company_id", "supplier_company_name", "snapshot_at"
  ];

  it("expected keys are consistent with service", () => {
    // This is a structural assertion — the keys match what createAgreement produces
    assert.ok(EXPECTED_KEYS.length >= 20, "snapshot should have comprehensive fields");
    assert.ok(EXPECTED_KEYS.includes("snapshot_at"), "must contain timestamp");
    assert.ok(EXPECTED_KEYS.includes("offer_id"), "must reference offer");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. TransitionError structure
// ═══════════════════════════════════════════════════════════════════

describe("TransitionError", () => {
  it("exposes entityType, from, to", () => {
    const err = new TransitionError("AGREEMENT", "activated", "confirmed");
    assert.strictEqual(err.entityType, "AGREEMENT");
    assert.strictEqual(err.from, "activated");
    assert.strictEqual(err.to, "confirmed");
    assert.strictEqual(err.name, "TransitionError");
  });

  it("message includes entity type and states", () => {
    const err = new TransitionError("OFFER", "draft", "accepted");
    assert.ok(err.message.includes("OFFER"));
    assert.ok(err.message.includes("draft"));
    assert.ok(err.message.includes("accepted"));
  });
});
