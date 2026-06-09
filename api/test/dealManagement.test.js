/**
 * Deal Management Tests
 * Phase 12: Tests fuer den professionellen Deal-Flow
 * - My-Deals Historienlogik
 * - Deal Progress Berechnung
 * - Agreement Action-Required fuer beide Seiten
 * - Feed-Reservierung (is_active Flag)
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { getActionRequired } from "../services/dealAgreementService.js";
import { getOfferDealProgress, getNextAction } from "../services/dealProgressHelper.js";
import { getDealHistoryBucket, normalizeDealHistoryBucket } from "../services/dealHistoryService.js";

// ── My-Deals Historienlogik ──

describe("Deal Management: History-Buckets", () => {
  // 6.5: 'aktiviert' zaehlt erst als abgeschlossen, wenn das Einsatz-Enddatum vorbei ist.
  const PAST_END = "2000-01-01";    // Einsatz vorbei -> completed
  const FUTURE_END = "2999-12-31";  // Einsatz laeuft noch -> active/in Prozess
  const deals = [
    { status: "sent", agreement_status: "none" },
    { status: "accepted", agreement_status: "pending_confirmation" },
    { status: "accepted", agreement_status: "confirmed" },
    { status: "accepted", agreement_status: "activated", end_date: PAST_END },
    { status: "accepted", agreement_status: "activated", end_date: FUTURE_END },
    { status: "rejected", agreement_status: "none" },
    { status: "accepted", agreement_status: "cancelled" },
    { status: "withdrawn", agreement_status: "none" }
  ];

  function bucket(bucketName) {
    return deals.filter((deal) => getDealHistoryBucket(deal) === bucketName);
  }

  it("active bucket: nicht-terminale + laufende Einsaetze (aktiviert mit Zukunfts-Enddatum bleibt aktiv)", () => {
    const active = bucket("active");
    assert.strictEqual(active.length, 4); // sent, pending_confirmation, confirmed, activated+future-end
  });

  it("completed bucket: nur aktivierte Deals mit vergangenem Einsatz-Enddatum", () => {
    const completed = bucket("completed");
    assert.strictEqual(completed.length, 1);
    assert.strictEqual(completed[0].agreement_status, "activated");
    assert.strictEqual(completed[0].end_date, PAST_END);
  });

  it("cancelled bucket shows rejected, withdrawn, cancelled, expired", () => {
    const cancelled = bucket("cancelled");
    assert.strictEqual(cancelled.length, 3); // rejected, cancelled, withdrawn
  });

  it("buckets partition the deal history without overlap", () => {
    const allBuckets = deals.map((deal) => getDealHistoryBucket(deal));
    assert.deepStrictEqual(allBuckets, [
      "active",
      "active",
      "active",
      "completed",
      "active",
      "cancelled",
      "cancelled",
      "cancelled"
    ]);
  });

  it("normalizes known bucket query values and rejects unknown ones", () => {
    assert.strictEqual(normalizeDealHistoryBucket("completed", "all"), "completed");
    assert.strictEqual(normalizeDealHistoryBucket("all", "active"), "all");
    assert.strictEqual(normalizeDealHistoryBucket("bogus", "all"), "all");
  });
});

// ── Deal Progress (Offer-basiert) ──

describe("Deal Management: Offer Deal Progress", () => {
  it("draft offer = 5%", () => {
    const p = getOfferDealProgress({ status: "draft", agreement_status: "none" });
    assert.strictEqual(p.pct, 5);
    assert.strictEqual(p.phase, "negotiation");
  });

  it("sent offer = 20%", () => {
    const p = getOfferDealProgress({ status: "sent", agreement_status: "none" });
    assert.strictEqual(p.pct, 20);
  });

  it("accepted offer without agreement = 50%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "none" });
    assert.strictEqual(p.pct, 50);
  });

  it("pending_confirmation = 60%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "pending_confirmation" });
    assert.strictEqual(p.pct, 60);
    assert.strictEqual(p.phase, "agreement");
  });

  it("confirmed = 75%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "confirmed" });
    assert.strictEqual(p.pct, 75);
  });

  it("activated = 100%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "activated" });
    assert.strictEqual(p.pct, 100);
  });

  it("cancelled = 0%", () => {
    const p = getOfferDealProgress({ status: "accepted", agreement_status: "cancelled" });
    assert.strictEqual(p.pct, 0);
  });

  it("null offer returns 0%", () => {
    const p = getOfferDealProgress(null);
    assert.strictEqual(p.pct, 0);
  });
});

// ── Next Action (Request-basiert) ──

describe("Deal Management: Next Action Map", () => {
  it("SENT -> receiver must respond", () => {
    const na = getNextAction("SENT");
    assert.strictEqual(na.actor, "receiver");
    assert.strictEqual(na.action, "respond");
  });

  it("ACCEPTED -> requester must confirm", () => {
    const na = getNextAction("ACCEPTED");
    assert.strictEqual(na.actor, "requester");
  });

  it("COMPLETED -> null (terminal)", () => {
    assert.strictEqual(getNextAction("COMPLETED"), null);
  });

  it("DECLINED -> null (terminal)", () => {
    assert.strictEqual(getNextAction("DECLINED"), null);
  });
});

// ── Gegenseiten-Logik (Action Required) ──

describe("Deal Management: Counterparty Action Logic", () => {
  const REQ = "requester-id";
  const SUP = "supplier-id";

  it("accepted + no agreement: requester must create agreement", () => {
    const offer = { status: "accepted", agreement_status: "none", requester_company_id: REQ, supplier_company_id: SUP };
    assert.strictEqual(getActionRequired(offer, REQ), "action_required");
    assert.strictEqual(getActionRequired(offer, SUP), "waiting");
  });

  it("pending_confirmation: supplier must confirm", () => {
    const offer = { status: "accepted", agreement_status: "pending_confirmation", requester_company_id: REQ, supplier_company_id: SUP };
    assert.strictEqual(getActionRequired(offer, SUP), "action_required");
    assert.strictEqual(getActionRequired(offer, REQ), "waiting");
  });

  it("confirmed: requester must activate", () => {
    const offer = { status: "accepted", agreement_status: "confirmed", requester_company_id: REQ, supplier_company_id: SUP };
    assert.strictEqual(getActionRequired(offer, REQ), "action_required");
  });

  it("activated: both completed", () => {
    const offer = { status: "accepted", agreement_status: "activated", requester_company_id: REQ, supplier_company_id: SUP };
    assert.strictEqual(getActionRequired(offer, REQ), "completed");
    assert.strictEqual(getActionRequired(offer, SUP), "completed");
  });

  it("cancelled: both see cancelled", () => {
    const offer = { status: "accepted", agreement_status: "cancelled", requester_company_id: REQ, supplier_company_id: SUP };
    assert.strictEqual(getActionRequired(offer, REQ), "cancelled");
    assert.strictEqual(getActionRequired(offer, SUP), "cancelled");
  });
});

// ── Feed Reservierung ──

describe("Deal Management: Feed Reservierung", () => {
  it("is_active=false should exclude from feed", () => {
    // Simuliert Feed-Filterlogik: WHERE cp.status = 'active' AND cp.is_active = TRUE
    const entries = [
      { id: 1, status: "active", is_active: true },
      { id: 2, status: "active", is_active: false },  // reserviert nach Deal
      { id: 3, status: "reserved", is_active: false },
      { id: 4, status: "active", is_active: true }
    ];
    const feedVisible = entries.filter(e => e.status === "active" && e.is_active === true);
    assert.strictEqual(feedVisible.length, 2);
    assert.ok(!feedVisible.some(e => e.id === 2)); // reservierter Eintrag nicht im Feed
  });
});
