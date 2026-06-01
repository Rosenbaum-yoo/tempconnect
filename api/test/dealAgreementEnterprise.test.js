/**
 * Deal Agreement Enterprise Tests
 * - AGREEMENT state machine transitions (valid + invalid)
 * - Cancel / Expire lifecycle
 * - getActionRequired: alle Status inkl. cancelled/expired/accepted-none
 * - Idempotenz: doppelte Aktivierung
 * - getOfferDealProgress: Agreement-Phase-Progress
 * - computeContentHash
 *
 * Run: node --test --test-force-exit test/dealAgreementEnterprise.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { assertTransition, TransitionError, AGREEMENT_TRANSITIONS } from "../services/stateMachine.js";
import { getActionRequired } from "../services/dealAgreementService.js";
import { getOfferDealProgress } from "../services/dealProgressHelper.js";
import { computeContentHash } from "../services/dealDossierService.js";

// ── AGREEMENT State Machine ─────────────────────────────────────────

describe("AGREEMENT state machine transitions", () => {
  it("none → pending_confirmation is valid", () => {
    assert.doesNotThrow(() => assertTransition("AGREEMENT", "none", "pending_confirmation"));
  });

  it("pending_confirmation → confirmed is valid", () => {
    assert.doesNotThrow(() => assertTransition("AGREEMENT", "pending_confirmation", "confirmed"));
  });

  it("confirmed → activated is valid", () => {
    assert.doesNotThrow(() => assertTransition("AGREEMENT", "confirmed", "activated"));
  });

  it("pending_confirmation → cancelled is valid", () => {
    assert.doesNotThrow(() => assertTransition("AGREEMENT", "pending_confirmation", "cancelled"));
  });

  it("confirmed → cancelled is valid", () => {
    assert.doesNotThrow(() => assertTransition("AGREEMENT", "confirmed", "cancelled"));
  });

  it("pending_confirmation → expired is valid", () => {
    assert.doesNotThrow(() => assertTransition("AGREEMENT", "pending_confirmation", "expired"));
  });

  // Invalid transitions
  it("none → confirmed is INVALID (must go through pending_confirmation)", () => {
    assert.throws(
      () => assertTransition("AGREEMENT", "none", "confirmed"),
      (err) => err instanceof TransitionError
    );
  });

  it("none → activated is INVALID", () => {
    assert.throws(
      () => assertTransition("AGREEMENT", "none", "activated"),
      (err) => err instanceof TransitionError
    );
  });

  // Welle 7 Phase 9: aktivierte Deals koennen explizit storniert werden
  // (Storno-Pfad dreht Staffing-Reservations und Assignment zurueck)
  it("activated → cancelled is VALID (Welle 7 Phase 9 Storno-Pfad)", () => {
    assert.doesNotThrow(() => assertTransition("AGREEMENT", "activated", "cancelled"));
  });

  it("cancelled → confirmed is INVALID (terminal)", () => {
    assert.throws(
      () => assertTransition("AGREEMENT", "cancelled", "confirmed"),
      (err) => err instanceof TransitionError
    );
  });

  it("expired → pending_confirmation is INVALID (terminal)", () => {
    assert.throws(
      () => assertTransition("AGREEMENT", "expired", "pending_confirmation"),
      (err) => err instanceof TransitionError
    );
  });

  it("confirmed → expired is INVALID (only pending_confirmation can expire)", () => {
    assert.throws(
      () => assertTransition("AGREEMENT", "confirmed", "expired"),
      (err) => err instanceof TransitionError
    );
  });

  it("all expected statuses are defined", () => {
    const keys = Object.keys(AGREEMENT_TRANSITIONS);
    assert.ok(keys.includes("none"));
    assert.ok(keys.includes("pending_confirmation"));
    assert.ok(keys.includes("confirmed"));
    assert.ok(keys.includes("activated"));
    assert.ok(keys.includes("cancelled"));
    assert.ok(keys.includes("expired"));
    assert.strictEqual(keys.length, 6);
  });
});

// ── getActionRequired: Enterprise-vollstaendig ────────────────────────

describe("getActionRequired: Enterprise-Status", () => {
  const R = "requester-1";
  const S = "supplier-1";
  const base = { requester_company_id: R, supplier_company_id: S };

  it("rejected → closed", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "rejected", agreement_status: "none" }, R), "closed");
  });

  it("withdrawn → closed", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "withdrawn", agreement_status: "none" }, S), "closed");
  });

  it("cancelled agreement → cancelled", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "cancelled" }, R), "cancelled");
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "cancelled" }, S), "cancelled");
  });

  it("expired agreement → expired", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "expired" }, R), "expired");
  });

  it("accepted + none → requester action_required (create agreement)", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "none" }, R), "action_required");
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "none" }, S), "waiting");
  });

  it("accepted + null agreement_status → requester action_required", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "accepted" }, R), "action_required");
  });

  it("pending_confirmation → supplier action_required", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "pending_confirmation" }, S), "action_required");
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "pending_confirmation" }, R), "waiting");
  });

  it("confirmed → requester action_required (activate)", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "confirmed" }, R), "action_required");
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "confirmed" }, S), "waiting");
  });

  it("activated → completed", () => {
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "activated" }, R), "completed");
    assert.strictEqual(getActionRequired({ ...base, status: "accepted", agreement_status: "activated" }, S), "completed");
  });
});

// ── getOfferDealProgress ────────────────────────────────────────────

describe("getOfferDealProgress", () => {
  it("null → 0%", () => {
    const p = getOfferDealProgress(null);
    assert.strictEqual(p.pct, 0);
  });

  it("sent → negotiation phase", () => {
    const p = getOfferDealProgress({ status: "sent", agreement_status: "none" });
    assert.strictEqual(p.phase, "negotiation");
    assert.ok(p.pct > 0 && p.pct < 50);
  });

  it("countered → negotiation phase", () => {
    const p = getOfferDealProgress({ status: "countered", agreement_status: "none" });
    assert.strictEqual(p.phase, "negotiation");
  });

  it("pending_confirmation → agreement phase 60%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "pending_confirmation" });
    assert.strictEqual(p.phase, "agreement");
    assert.strictEqual(p.pct, 60);
  });

  it("confirmed → agreement phase 75%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "confirmed" });
    assert.strictEqual(p.pct, 75);
  });

  it("activated → 100%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "activated" });
    assert.strictEqual(p.pct, 100);
  });

  it("cancelled → 0%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "cancelled" });
    assert.strictEqual(p.pct, 0);
  });

  it("rejected → terminal", () => {
    const p = getOfferDealProgress({ status: "rejected" });
    assert.strictEqual(p.phase, "terminal");
  });
});

// ── computeContentHash ──────────────────────────────────────────────

describe("computeContentHash", () => {
  it("returns null for null/undefined", () => {
    assert.strictEqual(computeContentHash(null), null);
    assert.strictEqual(computeContentHash(undefined), null);
  });

  it("returns consistent SHA-256 hex", () => {
    const h1 = computeContentHash("<html>test</html>");
    const h2 = computeContentHash("<html>test</html>");
    assert.strictEqual(h1, h2);
    assert.strictEqual(h1.length, 64); // SHA-256 = 64 hex chars
  });

  it("different content produces different hash", () => {
    const h1 = computeContentHash("<html>A</html>");
    const h2 = computeContentHash("<html>B</html>");
    assert.notStrictEqual(h1, h2);
  });
});
