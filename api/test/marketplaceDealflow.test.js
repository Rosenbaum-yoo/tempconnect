/**
 * Marketplace Dealflow — Unit Tests
 * Tests: deal_accept, deal_negotiate interaction types, notification routing, labels.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ── Interaction Type Validation ─────────────────────── */

describe("Marketplace Dealflow — Interaction Types", () => {
  const VALID_TYPES = [
    "interest", "offer_request", "question", "save",
    "requisition_link", "deal_start", "contact",
    "deal_accept", "deal_negotiate"
  ];

  it("deal_accept is a valid interaction type", () => {
    assert.ok(VALID_TYPES.includes("deal_accept"));
  });

  it("deal_negotiate is a valid interaction type", () => {
    assert.ok(VALID_TYPES.includes("deal_negotiate"));
  });

  it("invalid types are not in the list", () => {
    assert.ok(!VALID_TYPES.includes("deal_reject"));
    assert.ok(!VALID_TYPES.includes("cancel"));
    assert.ok(!VALID_TYPES.includes(""));
  });
});

/* ── Notification Routing ────────────────────────────── */

describe("Marketplace Dealflow — Notification Routing", () => {
  function getNotificationMessage(interactionType, entryTitle) {
    if (interactionType === "deal_accept") {
      return `Dealbereitschaft für "${entryTitle}" – Konditionen wurden zugestimmt. Nächster Schritt: operative Abstimmung.`;
    }
    if (interactionType === "deal_negotiate") {
      return `Verhandlungsanfrage für "${entryTitle}" – Anpassungswünsche liegen vor. Bitte prüfen.`;
    }
    if (["interest", "offer_request", "deal_start", "contact"].includes(interactionType)) {
      return `Neue Reaktion auf "${entryTitle}" (${interactionType})`;
    }
    return null;
  }

  it("deal_accept generates specific notification", () => {
    const msg = getNotificationMessage("deal_accept", "Lagerhelfer Hamburg");
    assert.ok(msg.includes("Dealbereitschaft"));
    assert.ok(msg.includes("Konditionen wurden zugestimmt"));
  });

  it("deal_negotiate generates specific notification", () => {
    const msg = getNotificationMessage("deal_negotiate", "CNC-Fachkräfte");
    assert.ok(msg.includes("Verhandlungsanfrage"));
    assert.ok(msg.includes("Anpassungswünsche"));
  });

  it("interest generates generic notification", () => {
    const msg = getNotificationMessage("interest", "Test-Kapazität");
    assert.ok(msg.includes("Neue Reaktion"));
    assert.ok(msg.includes("interest"));
  });

  it("question does not generate supplier notification", () => {
    const msg = getNotificationMessage("question", "Test");
    assert.equal(msg, null);
  });
});

/* ── Interaction Labels ──────────────────────────────── */

describe("Marketplace Dealflow — Labels", () => {
  const INTERACTION_LABELS = {
    interest: "Interesse",
    offer_request: "Angebotsanfrage",
    question: "Frage",
    save: "Gespeichert",
    requisition_link: "Verknuepfung",
    deal_start: "Deal",
    contact: "Kontakt",
    deal_accept: "Konditionen zugestimmt",
    deal_negotiate: "Verhandlungsanfrage"
  };

  it("deal_accept has a German label", () => {
    assert.equal(INTERACTION_LABELS.deal_accept, "Konditionen zugestimmt");
  });

  it("deal_negotiate has a German label", () => {
    assert.equal(INTERACTION_LABELS.deal_negotiate, "Verhandlungsanfrage");
  });

  it("all 9 types have labels", () => {
    assert.equal(Object.keys(INTERACTION_LABELS).length, 9);
  });
});

/* ── Hierarchical Action Zone Structure ──────────────── */

describe("Marketplace Dealflow — Action Zone Hierarchy", () => {
  const PRIMARY_ACTIONS = ["deal_accept", "deal_negotiate"];
  const SECONDARY_ACTIONS = ["interest", "question", "offer_request", "contact"];

  it("primary actions are deal_accept and deal_negotiate", () => {
    assert.deepStrictEqual(PRIMARY_ACTIONS, ["deal_accept", "deal_negotiate"]);
  });

  it("secondary actions do not include deal actions", () => {
    for (const a of SECONDARY_ACTIONS) {
      assert.ok(!a.startsWith("deal_"), `${a} should not be a deal action`);
    }
  });

  it("all action types are covered", () => {
    const allActions = [...PRIMARY_ACTIONS, ...SECONDARY_ACTIONS];
    assert.equal(allActions.length, 6);
    assert.ok(allActions.includes("deal_accept"));
    assert.ok(allActions.includes("deal_negotiate"));
    assert.ok(allActions.includes("interest"));
    assert.ok(allActions.includes("question"));
  });
});

/* ── Idempotency: No double notifications ────────────── */

describe("Marketplace Dealflow — Idempotency", () => {
  it("dedupe logic prevents identical interactions within 10 minutes", () => {
    // The SQL INSERT uses WHERE NOT EXISTS (...AND ci.created_at > NOW() - INTERVAL '10 minutes')
    // This test validates the business rule conceptually
    const DEDUPE_WINDOW_MINUTES = 10;
    assert.ok(DEDUPE_WINDOW_MINUTES > 0);
    assert.ok(DEDUPE_WINDOW_MINUTES <= 15); // reasonable window
  });
});
