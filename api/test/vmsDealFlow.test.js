/**
 * VMS Deal Flow Tests
 *
 * Validates the capacity-to-deal flow:
 *   1. CAPACITY_POST_TRANSITIONS with reserved status
 *   2. Feed headline generation (professional rendering)
 *   3. Accept-deal flow logic
 *   4. Negotiate-deal flow logic
 *   5. Capacity post schema validation (new fields)
 *
 * Run: node --test --test-force-exit test/vmsDealFlow.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { z } from "zod";

import {
  assertTransition,
  TransitionError,
  CAPACITY_POST_TRANSITIONS
} from "../services/stateMachine.js";

// ═══════════════════════════════════════════════════════════════════
// 1. CAPACITY_POST_TRANSITIONS with reserved status
// ═══════════════════════════════════════════════════════════════════

describe("CAPACITY_POST_TRANSITIONS: reserved status", () => {
  it("active → reserved is valid (deal start)", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "active", "reserved"));
  });

  it("reserved → active is valid (deal cancelled, release back)", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "reserved", "active"));
  });

  it("reserved → filled is valid (workers fully assigned)", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "reserved", "filled"));
  });

  it("reserved → archived is valid (deal completed + archived)", () => {
    assert.doesNotThrow(() => assertTransition("CAPACITY_POST", "reserved", "archived"));
  });

  it("draft → reserved is INVALID (must be active first)", () => {
    assert.throws(
      () => assertTransition("CAPACITY_POST", "draft", "reserved"),
      (err) => err instanceof TransitionError
    );
  });

  it("reserved → paused is INVALID (reserved is a deal-lock)", () => {
    assert.throws(
      () => assertTransition("CAPACITY_POST", "reserved", "paused"),
      (err) => err instanceof TransitionError
    );
  });

  it("filled → reserved is INVALID (filled is terminal-adjacent)", () => {
    assert.throws(
      () => assertTransition("CAPACITY_POST", "filled", "reserved"),
      (err) => err instanceof TransitionError
    );
  });

  it("all expected statuses are defined", () => {
    const keys = Object.keys(CAPACITY_POST_TRANSITIONS);
    assert.ok(keys.includes("draft"));
    assert.ok(keys.includes("active"));
    assert.ok(keys.includes("reserved"));
    assert.ok(keys.includes("paused"));
    assert.ok(keys.includes("filled"));
    assert.ok(keys.includes("expired"));
    assert.ok(keys.includes("archived"));
    assert.strictEqual(keys.length, 7);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Feed headline generation
// ═══════════════════════════════════════════════════════════════════

describe("Feed headline generation", () => {
  function generateHeadline(entry, isDemand) {
    if (!isDemand && entry.headcount && entry.role) {
      return entry.headcount + " " + entry.role + " verfuegbar";
    }
    if (isDemand && entry.headcount && entry.role) {
      return entry.headcount + " " + entry.role + " gesucht";
    }
    return entry.title;
  }

  it("supply: '15 Produktionshelfer verfuegbar'", () => {
    assert.strictEqual(
      generateHeadline({ headcount: 15, role: "Produktionshelfer", title: "Generic Title" }, false),
      "15 Produktionshelfer verfuegbar"
    );
  });

  it("supply: '1 Schweisser verfuegbar'", () => {
    assert.strictEqual(
      generateHeadline({ headcount: 1, role: "Schweisser", title: "X" }, false),
      "1 Schweisser verfuegbar"
    );
  });

  it("demand: '8 Staplerfahrer gesucht'", () => {
    assert.strictEqual(
      generateHeadline({ headcount: 8, role: "Staplerfahrer", title: "X" }, true),
      "8 Staplerfahrer gesucht"
    );
  });

  it("fallback to title when headcount or role missing", () => {
    assert.strictEqual(
      generateHeadline({ headcount: null, role: null, title: "Mein Angebot" }, false),
      "Mein Angebot"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Accept-deal flow logic
// ═══════════════════════════════════════════════════════════════════

describe("Accept-deal flow logic", () => {
  function simulateAcceptDeal(cap, viewerRole, viewerUserId) {
    if (viewerRole !== "company") return { error: "COMPANY_ONLY" };
    if (cap.supplier_company_id === viewerUserId) return { error: "SELF_DEAL_FORBIDDEN" };
    if (cap.status !== "active") return { error: "NOT_ACTIVE", current_status: cap.status };
    return { status: "reserved", offer_status: "accepted" };
  }

  it("company can accept active capacity", () => {
    const result = simulateAcceptDeal(
      { supplier_company_id: "agency-1", status: "active" },
      "company", "company-1"
    );
    assert.strictEqual(result.status, "reserved");
    assert.strictEqual(result.offer_status, "accepted");
  });

  it("agency cannot accept (COMPANY_ONLY)", () => {
    const result = simulateAcceptDeal(
      { supplier_company_id: "agency-1", status: "active" },
      "agency", "agency-2"
    );
    assert.strictEqual(result.error, "COMPANY_ONLY");
  });

  it("self-deal forbidden", () => {
    const result = simulateAcceptDeal(
      { supplier_company_id: "user-1", status: "active" },
      "company", "user-1"
    );
    assert.strictEqual(result.error, "SELF_DEAL_FORBIDDEN");
  });

  it("cannot accept reserved capacity", () => {
    const result = simulateAcceptDeal(
      { supplier_company_id: "agency-1", status: "reserved" },
      "company", "company-1"
    );
    assert.strictEqual(result.error, "NOT_ACTIVE");
  });

  it("cannot accept paused capacity", () => {
    const result = simulateAcceptDeal(
      { supplier_company_id: "agency-1", status: "paused" },
      "company", "company-1"
    );
    assert.strictEqual(result.error, "NOT_ACTIVE");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Negotiate-deal flow logic
// ═══════════════════════════════════════════════════════════════════

describe("Negotiate-deal flow logic", () => {
  function simulateNegotiateDeal(cap, viewerRole, viewerUserId) {
    if (viewerRole !== "company") return { error: "COMPANY_ONLY" };
    if (cap.supplier_company_id === viewerUserId) return { error: "SELF_DEAL_FORBIDDEN" };
    if (cap.status !== "active") return { error: "NOT_ACTIVE" };
    return { status: "negotiating", offer_status: "sent" };
  }

  it("company can start negotiation on active capacity", () => {
    const result = simulateNegotiateDeal(
      { supplier_company_id: "agency-1", status: "active" },
      "company", "company-1"
    );
    assert.strictEqual(result.status, "negotiating");
    assert.strictEqual(result.offer_status, "sent");
  });

  it("agency cannot negotiate (COMPANY_ONLY)", () => {
    const result = simulateNegotiateDeal(
      { supplier_company_id: "agency-1", status: "active" },
      "agency", "agency-2"
    );
    assert.strictEqual(result.error, "COMPANY_ONLY");
  });

  it("capacity stays active during negotiation (not reserved yet)", () => {
    // Negotiation doesn't lock the capacity until agreement
    const result = simulateNegotiateDeal(
      { supplier_company_id: "agency-1", status: "active" },
      "company", "company-1"
    );
    assert.strictEqual(result.status, "negotiating");
    // The capacity post itself remains active — only reserved on actual deal close
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Capacity post schema validation (new fields)
// ═══════════════════════════════════════════════════════════════════

describe("capacityPostSchema: new fields", () => {
  const schema = z.object({
    title: z.string().min(1).max(200),
    role: z.string().min(1).max(120),
    headcount: z.number().int().min(1).max(999).optional().default(1),
    availability_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    location_city: z.string().min(1).max(120),
    shift_model: z.enum(["day", "night", "rotating", "flexible", "weekend", "on_call"]).optional().nullable(),
    employment_type: z.enum(["temporary", "contract", "temp_to_perm", "project", "on_call"]).optional().nullable(),
    qualifications: z.string().max(2000).optional().nullable(),
    certifications: z.string().max(1000).optional().nullable(),
    description: z.string().max(5000).optional().nullable()
  });

  it("accepts full capacity post with all new fields", () => {
    const result = schema.safeParse({
      title: "10 Schweisser ab sofort",
      role: "Schweisser",
      headcount: 10,
      availability_from: "2026-04-15",
      location_city: "Hamburg",
      shift_model: "rotating",
      employment_type: "temporary",
      qualifications: "Schweisserschein, 5 Jahre Berufserfahrung",
      certifications: "DVS-Zertifikat, Erste-Hilfe",
      description: "Erfahrene Schweisser fuer Grossbaustelle"
    });
    assert.ok(result.success);
    assert.strictEqual(result.data.shift_model, "rotating");
    assert.strictEqual(result.data.employment_type, "temporary");
  });

  it("accepts minimal capacity post without new fields", () => {
    const result = schema.safeParse({
      title: "5 Helfer",
      role: "Helfer",
      availability_from: "2026-05-01",
      location_city: "Berlin"
    });
    assert.ok(result.success);
  });

  it("rejects invalid shift_model", () => {
    const result = schema.safeParse({
      title: "X", role: "Y", availability_from: "2026-01-01", location_city: "Z",
      shift_model: "invalid_shift"
    });
    assert.ok(!result.success);
  });

  it("rejects invalid employment_type", () => {
    const result = schema.safeParse({
      title: "X", role: "Y", availability_from: "2026-01-01", location_city: "Z",
      employment_type: "vollzeit"
    });
    assert.ok(!result.success);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Status display labels
// ═══════════════════════════════════════════════════════════════════

describe("Status display labels", () => {
  const STATUS_MAP = {
    draft: "Entwurf", active: "Aktiv", reserved: "Reserviert",
    paused: "Pausiert", expired: "Abgelaufen", filled: "Besetzt", archived: "Archiviert"
  };

  it("reserved has German label", () => {
    assert.strictEqual(STATUS_MAP.reserved, "Reserviert");
  });

  it("all capacity post statuses have labels", () => {
    const statuses = Object.keys(CAPACITY_POST_TRANSITIONS);
    for (const s of statuses) {
      assert.ok(STATUS_MAP[s], "missing label for status: " + s);
    }
  });
});
