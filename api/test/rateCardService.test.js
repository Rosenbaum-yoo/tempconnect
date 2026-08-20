/**
 * Rate Card Service unit tests.
 * Covers CRUD, lifecycle (activate/archive/expireBatch),
 * specificity-based lookup, compliance check, and dashboard stats.
 *
 * Run: node --test --test-force-exit test/rateCardService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/rateCardService.js";

// ── Mock helpers ──────────────────────────────────────────────

function returnPool(rows = []) {
  return { query: async () => ({ rows }) };
}

function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) return { rows: [] };
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function recordingSequencePool(...responses) {
  let idx = 0;
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (idx >= responses.length) return { rows: [] };
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// createRateCard
// ═══════════════════════════════════════════════════════════════

describe("rateCardService — createRateCard", () => {
  it("inserts a draft rate card and returns it", async () => {
    const created = {
      id: "rc-1", org_id: "org-1", role_category: "Schweißer",
      target_rate_cents: 3500, max_rate_cents: 4500, status: "draft"
    };
    const pool = returnPool([created]);
    const result = await svc.createRateCard(pool, {
      orgId: "org-1", roleCategory: "Schweißer",
      targetRateCents: 3500, maxRateCents: 4500,
      validFrom: "2026-01-01"
    });
    assert.strictEqual(result.id, "rc-1");
    assert.strictEqual(result.role_category, "Schweißer");
    assert.strictEqual(result.status, "draft");
  });

  it("passes optional fields (region, supplier, location)", async () => {
    const created = {
      id: "rc-2", org_id: "org-1", role_category: "Pflege",
      region: "Bayern", supplier_org_id: "sup-1", location_id: "loc-1",
      target_rate_cents: 2800, max_rate_cents: 3500, status: "draft"
    };
    const pool = returnPool([created]);
    const result = await svc.createRateCard(pool, {
      orgId: "org-1", roleCategory: "Pflege",
      targetRateCents: 2800, maxRateCents: 3500,
      validFrom: "2026-02-01", region: "Bayern",
      supplierOrgId: "sup-1", locationId: "loc-1"
    });
    assert.strictEqual(result.region, "Bayern");
    assert.strictEqual(result.supplier_org_id, "sup-1");
    assert.strictEqual(result.location_id, "loc-1");
  });
});

// ═══════════════════════════════════════════════════════════════
// updateRateCard
// ═══════════════════════════════════════════════════════════════

describe("rateCardService — updateRateCard", () => {
  it("updates allowed fields and returns updated row", async () => {
    const updated = {
      id: "rc-1", role_category: "Fachkraft", target_rate_cents: 4000,
      max_rate_cents: 5000, status: "draft"
    };
    const pool = returnPool([updated]);
    const result = await svc.updateRateCard(pool, "rc-1", {
      target_rate_cents: 4000, max_rate_cents: 5000
    }, "user-1");
    assert.strictEqual(result.target_rate_cents, 4000);
  });

  it("returns current card when no fields provided", async () => {
    // updateRateCard calls getRateCard when sets.length === 0
    const existing = {
      id: "rc-1", role_category: "Schweißer",
      target_rate_cents: 3500, max_rate_cents: 4500
    };
    const pool = returnPool([existing]);
    const result = await svc.updateRateCard(pool, "rc-1", {}, "user-1");
    assert.strictEqual(result.id, "rc-1");
    assert.strictEqual(result.target_rate_cents, 3500);
  });

  it("returns null when card not found", async () => {
    const pool = returnPool([]);
    const result = await svc.updateRateCard(pool, "missing", {
      target_rate_cents: 5000
    }, "user-1");
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// getRateCard
// ═══════════════════════════════════════════════════════════════

describe("rateCardService — getRateCard", () => {
  it("returns card with joined metadata", async () => {
    const row = {
      id: "rc-1", org_name: "Test GmbH", supplier_name: "Agency AG",
      location_name: "Standort München", department_name: "Produktion",
      contract_title: "Rahmenvertrag 2026"
    };
    const pool = returnPool([row]);
    const result = await svc.getRateCard(pool, "rc-1");
    assert.strictEqual(result.org_name, "Test GmbH");
    assert.strictEqual(result.supplier_name, "Agency AG");
  });

  it("returns null when not found", async () => {
    const result = await svc.getRateCard(returnPool([]), "missing");
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// listRateCards
// ═══════════════════════════════════════════════════════════════

describe("rateCardService — listRateCards", () => {
  it("returns paginated list with total count", async () => {
    const items = [
      { id: "rc-1", role_category: "Schweißer", status: "active" },
      { id: "rc-2", role_category: "Pflege", status: "draft" }
    ];
    const pool = sequencePool(
      { rows: items },
      { rows: [{ total: 2 }] }
    );
    const result = await svc.listRateCards(pool, "org-1");
    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.total, 2);
  });

  it("applies status filter", async () => {
    const pool = sequencePool(
      { rows: [{ id: "rc-1", status: "active" }] },
      { rows: [{ total: 1 }] }
    );
    const result = await svc.listRateCards(pool, "org-1", { status: "active" });
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].status, "active");
  });

  it("applies role category filter", async () => {
    const pool = sequencePool(
      { rows: [] },
      { rows: [{ total: 0 }] }
    );
    const result = await svc.listRateCards(pool, "org-1", { roleCategory: "Nonexistent" });
    assert.strictEqual(result.total, 0);
  });

  it("returns empty list for org with no cards", async () => {
    const pool = sequencePool(
      { rows: [] },
      { rows: [{ total: 0 }] }
    );
    const result = await svc.listRateCards(pool, "org-empty");
    assert.strictEqual(result.items.length, 0);
    assert.strictEqual(result.total, 0);
  });

  it("filters rate cards by at-risk compliance checks in the last 30 days", async () => {
    const pool = recordingSequencePool(
      { rows: [{ id: "rc-risk", status: "active" }] },
      { rows: [{ total: 1 }] }
    );
    const result = await svc.listRateCards(pool, "org-1", { complianceStatus: "at_risk" });
    assert.strictEqual(result.total, 1);
    assert.match(pool.calls[0].sql, /rate_card_checks/);
    assert.match(pool.calls[0].sql, /warning', 'non_compliant/);
  });

  it("filters rate cards by a specific compliance status in the last 30 days", async () => {
    const pool = recordingSequencePool(
      { rows: [{ id: "rc-warning", status: "active" }] },
      { rows: [{ total: 1 }] }
    );
    const result = await svc.listRateCards(pool, "org-1", { complianceStatus: "warning" });
    assert.strictEqual(result.total, 1);
    assert.match(pool.calls[0].sql, /checked_at >= NOW\(\) - INTERVAL '30 days'/);
    assert.ok(pool.calls[0].params.includes("warning"));
  });

  it("filters active rate cards by overlap with a requested date window", async () => {
    const pool = recordingSequencePool(
      { rows: [{ id: "rc-active-window", status: "active" }] },
      { rows: [{ total: 1 }] }
    );
    const result = await svc.listRateCards(pool, "org-1", {
      status: "active",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30"
    });
    assert.strictEqual(result.total, 1);
    assert.match(pool.calls[0].sql, /rc\.valid_from <=/);
    assert.match(pool.calls[0].sql, /COALESCE\(rc\.valid_to/);
    assert.ok(pool.calls[0].params.includes("2026-04-01"));
    assert.ok(pool.calls[0].params.includes("2026-04-30"));
  });
});

// ═══════════════════════════════════════════════════════════════
// activateRateCard
// ═══════════════════════════════════════════════════════════════

describe("rateCardService — activateRateCard", () => {
  it("activates a draft card", async () => {
    const activated = { id: "rc-1", status: "active" };
    const pool = returnPool([activated]);
    const result = await svc.activateRateCard(pool, "rc-1", "user-1", "org-1");
    assert.strictEqual(result.status, "active");
  });

  it("returns null when card is not in draft status", async () => {
    const pool = returnPool([]);
    const result = await svc.activateRateCard(pool, "rc-1", "user-1", "org-1");
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// archiveRateCard
// ═══════════════════════════════════════════════════════════════

describe("rateCardService — archiveRateCard", () => {
  it("archives an active card", async () => {
    const archived = { id: "rc-1", status: "archived" };
    const pool = returnPool([archived]);
    const result = await svc.archiveRateCard(pool, "rc-1", "user-1", "org-1");
    assert.strictEqual(result.status, "archived");
  });

  it("returns null when card cannot be archived", async () => {
    const pool = returnPool([]);
    const result = await svc.archiveRateCard(pool, "rc-expired", "user-1", "org-1");
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// expireBatch
// ═══════════════════════════════════════════════════════════════

describe("rateCardService — expireBatch", () => {
  it("returns count of expired cards", async () => {
    const pool = { query: async () => ({ rowCount: 5 }) };
    const result = await svc.expireBatch(pool);
    assert.strictEqual(result, 5);
  });

  it("returns 0 when no cards to expire", async () => {
    const pool = { query: async () => ({ rowCount: 0 }) };
    const result = await svc.expireBatch(pool);
    assert.strictEqual(result, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// findApplicableRateCard (Specificity Lookup)
// ═══════════════════════════════════════════════════════════════

describe("rateCardService — findApplicableRateCard", () => {
  it("returns the most specific active card", async () => {
    const card = {
      id: "rc-best", role_category: "Schweißer",
      supplier_org_id: "sup-1", location_id: "loc-1",
      target_rate_cents: 3500, max_rate_cents: 4500, status: "active"
    };
    const pool = returnPool([card]);
    const result = await svc.findApplicableRateCard(pool, {
      orgId: "org-1", supplierOrgId: "sup-1",
      role: "Schweißer", locationId: "loc-1"
    });
    assert.strictEqual(result.id, "rc-best");
  });

  it("returns null when no card matches", async () => {
    const pool = returnPool([]);
    const result = await svc.findApplicableRateCard(pool, {
      orgId: "org-1", role: "Unknown Role"
    });
    assert.strictEqual(result, null);
  });

  it("works with only org and role (global fallback)", async () => {
    const card = {
      id: "rc-global", role_category: "Pflege",
      supplier_org_id: null, region: null, location_id: null,
      target_rate_cents: 2500, max_rate_cents: 3000, status: "active"
    };
    const pool = returnPool([card]);
    const result = await svc.findApplicableRateCard(pool, {
      orgId: "org-1", role: "Pflege"
    });
    assert.strictEqual(result.id, "rc-global");
  });

  it("uses provided date for validity check", async () => {
    const card = {
      id: "rc-dated", role_category: "Schweißer",
      valid_from: "2025-01-01", valid_to: "2025-12-31",
      target_rate_cents: 3000, max_rate_cents: 4000, status: "active"
    };
    const pool = returnPool([card]);
    const result = await svc.findApplicableRateCard(pool, {
      orgId: "org-1", role: "Schweißer", date: "2025-06-15"
    });
    assert.strictEqual(result.id, "rc-dated");
  });

  it("applies region matching", async () => {
    const card = {
      id: "rc-region", role_category: "Pflege",
      region: "Bayern", target_rate_cents: 2800, max_rate_cents: 3500
    };
    const pool = returnPool([card]);
    const result = await svc.findApplicableRateCard(pool, {
      orgId: "org-1", role: "Pflege", region: "Bayern"
    });
    assert.strictEqual(result.id, "rc-region");
  });
});

// ═══════════════════════════════════════════════════════════════
// checkRateCompliance
// ═══════════════════════════════════════════════════════════════

describe("rateCardService — checkRateCompliance", () => {
  it("returns 'compliant' when actual <= target", async () => {
    const card = {
      id: "rc-1", role_category: "Schweißer",
      target_rate_cents: 3500, max_rate_cents: 4500,
      min_rate_cents: 2000, supplier_org_id: null, region: null
    };
    const pool = returnPool([card]);
    const result = await svc.checkRateCompliance(pool, {
      orgId: "org-1", role: "Schweißer",
      actualRateCents: 3200, persist: false
    });
    assert.strictEqual(result.compliance_status, "compliant");
    assert.strictEqual(result.deviation_cents, -300);
    assert.ok(result.deviation_pct < 0);
  });

  it("returns 'warning' when actual > target but <= max", async () => {
    const card = {
      id: "rc-1", role_category: "Schweißer",
      target_rate_cents: 3500, max_rate_cents: 4500,
      min_rate_cents: null, supplier_org_id: null, region: null
    };
    const pool = returnPool([card]);
    const result = await svc.checkRateCompliance(pool, {
      orgId: "org-1", role: "Schweißer",
      actualRateCents: 4000, persist: false
    });
    assert.strictEqual(result.compliance_status, "warning");
    assert.strictEqual(result.deviation_cents, 500);
  });

  it("returns 'non_compliant' when actual > max", async () => {
    const card = {
      id: "rc-1", role_category: "Schweißer",
      target_rate_cents: 3500, max_rate_cents: 4500,
      min_rate_cents: null, supplier_org_id: null, region: null
    };
    const pool = returnPool([card]);
    const result = await svc.checkRateCompliance(pool, {
      orgId: "org-1", role: "Schweißer",
      actualRateCents: 5000, persist: false
    });
    assert.strictEqual(result.compliance_status, "non_compliant");
    assert.strictEqual(result.deviation_cents, 1500);
  });

  it("returns 'no_card' when no applicable rate card exists", async () => {
    const pool = returnPool([]);
    const result = await svc.checkRateCompliance(pool, {
      orgId: "org-1", role: "Unbekannt",
      actualRateCents: 3000, persist: false
    });
    assert.strictEqual(result.compliance_status, "no_card");
    assert.strictEqual(result.rate_card, null);
  });

  it("persists compliance check when entity context provided", async () => {
    const card = {
      id: "rc-1", role_category: "Pflege",
      target_rate_cents: 2500, max_rate_cents: 3000,
      min_rate_cents: null, supplier_org_id: null, region: null
    };
    const pool = sequencePool(
      { rows: [card] },                       // findApplicableRateCard
      { rows: [{ id: "check-1" }] }           // INSERT into rate_card_checks
    );
    const result = await svc.checkRateCompliance(pool, {
      orgId: "org-1", role: "Pflege",
      actualRateCents: 2500,
      entityType: "timesheet", entityId: "ts-1",
      checkedBy: "user-1", persist: true
    });
    assert.strictEqual(result.compliance_status, "compliant");
    assert.strictEqual(result.check_id, "check-1");
  });

  it("calculates correct deviation percentage", async () => {
    const card = {
      id: "rc-1", role_category: "Test",
      target_rate_cents: 2000, max_rate_cents: 3000,
      min_rate_cents: null, supplier_org_id: null, region: null
    };
    const pool = returnPool([card]);
    const result = await svc.checkRateCompliance(pool, {
      orgId: "org-1", role: "Test",
      actualRateCents: 2500, persist: false
    });
    // deviation = 500 / 2000 * 100 = 25%
    assert.strictEqual(result.deviation_pct, 25);
    assert.strictEqual(result.deviation_cents, 500);
  });

  it("handles exact target rate as compliant", async () => {
    const card = {
      id: "rc-1", role_category: "Test",
      target_rate_cents: 3000, max_rate_cents: 4000,
      min_rate_cents: null, supplier_org_id: null, region: null
    };
    const pool = returnPool([card]);
    const result = await svc.checkRateCompliance(pool, {
      orgId: "org-1", role: "Test",
      actualRateCents: 3000, persist: false
    });
    assert.strictEqual(result.compliance_status, "compliant");
    assert.strictEqual(result.deviation_cents, 0);
    assert.strictEqual(result.deviation_pct, 0);
  });

  it("handles exact max rate as warning", async () => {
    const card = {
      id: "rc-1", role_category: "Test",
      target_rate_cents: 3000, max_rate_cents: 4000,
      min_rate_cents: null, supplier_org_id: null, region: null
    };
    const pool = returnPool([card]);
    const result = await svc.checkRateCompliance(pool, {
      orgId: "org-1", role: "Test",
      actualRateCents: 4000, persist: false
    });
    assert.strictEqual(result.compliance_status, "warning");
  });
});

// ═══════════════════════════════════════════════════════════════
// getRateCardStats
// ═══════════════════════════════════════════════════════════════

describe("rateCardService — getRateCardStats", () => {
  it("returns card counts and compliance summary", async () => {
    const stats = {
      total: 12, active: 5, draft: 3, expired: 2,
      archived: 2, role_categories: 4, vendor_specific: 2
    };
    const compliance = {
      total_checks: 30, compliant: 20, warnings: 7, non_compliant: 3
    };
    const pool = sequencePool(
      { rows: [stats] },
      { rows: [compliance] }
    );
    const result = await svc.getRateCardStats(pool, "org-1");
    assert.strictEqual(result.cards.total, 12);
    assert.strictEqual(result.cards.active, 5);
    assert.strictEqual(result.compliance_30d.total_checks, 30);
    assert.strictEqual(result.compliance_30d.non_compliant, 3);
  });

  it("returns empty stats for org with no data", async () => {
    const pool = sequencePool(
      { rows: [{ total: 0, active: 0, draft: 0, expired: 0, archived: 0, role_categories: 0, vendor_specific: 0 }] },
      { rows: [{ total_checks: 0, compliant: 0, warnings: 0, non_compliant: 0 }] }
    );
    const result = await svc.getRateCardStats(pool, "org-empty");
    assert.strictEqual(result.cards.total, 0);
    assert.strictEqual(result.compliance_30d.total_checks, 0);
  });

  it("applies card scope filters to stats and compliance summaries", async () => {
    const pool = recordingSequencePool(
      { rows: [{ total: 2, active: 2, draft: 0, expired: 0, archived: 0, role_categories: 1, vendor_specific: 1 }] },
      { rows: [{ total_checks: 3, compliant: 2, warnings: 1, non_compliant: 0 }] }
    );
    const result = await svc.getRateCardStats(pool, "org-1", {
      status: "active",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30"
    });
    assert.strictEqual(result.cards.active, 2);
    assert.strictEqual(result.compliance_30d.total_checks, 3);
    assert.match(pool.calls[0].sql, /rc\.valid_from <=/);
    assert.match(pool.calls[0].sql, /COALESCE\(rc\.valid_to/);
    assert.match(pool.calls[1].sql, /JOIN rate_cards rc/);
    assert.ok(pool.calls[1].params.includes("2026-04-01"));
    assert.ok(pool.calls[1].params.includes("2026-04-30"));
  });
});

// ═══════════════════════════════════════════════════════════════
// Org-Grenze (Befund E-1, 2026-08-19)
// ═══════════════════════════════════════════════════════════════
//
// Der orgId-Parameter allein beweist nichts — ein Service, der ihn entgegen
// nimmt und ignoriert, besteht jeden Aufruf-Test. Geprueft wird deshalb, dass
// er (a) fehlend zum Abbruch fuehrt und (b) im SQL landet.

describe("rateCardService — Org-Grenze bei activate/archive", () => {
  function spion() {
    const calls = [];
    return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: "rc-1" }] }; } };
  }

  it("activateRateCard bricht ohne Org-Kontext ab, statt plattformweit zu schreiben", async () => {
    const pool = spion();
    await assert.rejects(() => svc.activateRateCard(pool, "rc-1", "user-1", null), /Organisation/);
    assert.strictEqual(pool.calls.length, 0, "es darf keine Abfrage abgesetzt worden sein");
  });

  it("archiveRateCard bricht ohne Org-Kontext ab", async () => {
    const pool = spion();
    await assert.rejects(() => svc.archiveRateCard(pool, "rc-1", "user-1", undefined), /Organisation/);
    assert.strictEqual(pool.calls.length, 0);
  });

  it("die Org steht in der WHERE-Klausel, nicht nur in der Signatur", async () => {
    for (const fn of ["activateRateCard", "archiveRateCard"]) {
      const pool = spion();
      await svc[fn](pool, "rc-1", "user-1", "org-7");
      assert.ok(/org_id\s*=\s*\$\d/.test(pool.calls[0].sql), fn + ": org_id fehlt im SQL");
      assert.ok(pool.calls[0].params.includes("org-7"), fn + ": orgId wird nicht als Parameter uebergeben");
    }
  });
});
