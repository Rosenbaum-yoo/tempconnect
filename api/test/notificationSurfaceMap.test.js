/**
 * notificationSurfaceMap — type → Hub-Surface Mapping + Fold-Logik.
 *
 * Sichert die einzige Wahrheitsquelle, die ungelesene Benachrichtigungen den
 * Enterprise-Hub-Cards zuordnet. Bricht, wenn ein neuer notificationMatrix-Typ
 * auf eine nicht-existente Card zeigt oder die total/surfaces-Invariante kippt.
 *
 * Run: node --test --test-force-exit test/notificationSurfaceMap.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { surfaceForType, summarizeBySurface, SURFACE_KEYS } from "../services/notificationSurfaceMap.js";

// data-surface Keys, die in enterprise.html als Hub-Card existieren.
const REAL_HUB_SURFACES = [
  "marketplace", "requisitions", "deals", "assignments",
  "vendor_pool", "my_company", "trust_center", "bounties"
];

describe("notificationSurfaceMap — surfaceForType", () => {
  it("requisition-Typen → requisitions", () => {
    assert.equal(surfaceForType("requisition_approval"), "requisitions");
    assert.equal(surfaceForType("requisition_filled"), "requisitions");
    assert.equal(surfaceForType("requisition_cancelled"), "requisitions");
  });

  it("offer + deal-Lifecycle → deals", () => {
    assert.equal(surfaceForType("offer_received"), "deals");
    assert.equal(surfaceForType("offer_counter_received"), "deals");
    assert.equal(surfaceForType("offer_withdrawn"), "deals");
    assert.equal(surfaceForType("deal_confirmed"), "deals");
    assert.equal(surfaceForType("deal_staffing_ready"), "deals");
    assert.equal(surfaceForType("deal_assignment_started"), "deals");
    assert.equal(surfaceForType("deal_accepted"), "deals");
    assert.equal(surfaceForType("deal_offer_sent"), "deals");
    assert.equal(surfaceForType("deal_completed"), "deals");
    assert.equal(surfaceForType("deal_cancelled"), "deals");
  });

  it("milestone → bounties", () => {
    assert.equal(surfaceForType("milestone"), "bounties");
  });

  it("capacity/demand/emergency → marketplace", () => {
    assert.equal(surfaceForType("capacity_match"), "marketplace");
    assert.equal(surfaceForType("capacity_interest"), "marketplace");
    assert.equal(surfaceForType("demand_match"), "marketplace");
    assert.equal(surfaceForType("emergency_request"), "marketplace");
    assert.equal(surfaceForType("emergency_escalation"), "marketplace");
  });

  it("vendor_pool-Typen → vendor_pool", () => {
    assert.equal(surfaceForType("vendor_pool_change"), "vendor_pool");
    assert.equal(surfaceForType("vendor_pool_blocked"), "vendor_pool");
  });

  it("compliance-Typen → trust_center", () => {
    assert.equal(surfaceForType("compliance_expiring"), "trust_center");
    assert.equal(surfaceForType("compliance_expired"), "trust_center");
    assert.equal(surfaceForType("compliance_verified"), "trust_center");
  });

  it("sla-Typen → my_company", () => {
    assert.equal(surfaceForType("sla_warning"), "my_company");
    assert.equal(surfaceForType("sla_breached"), "my_company");
  });

  it("timesheet-Typen → assignments", () => {
    assert.equal(surfaceForType("timesheet_submitted"), "assignments");
    assert.equal(surfaceForType("timesheet_approved"), "assignments");
    assert.equal(surfaceForType("timesheet_signed"), "assignments");
  });

  it("bell-only / unbekannte / leere Typen → null", () => {
    assert.equal(surfaceForType("general"), null);
    assert.equal(surfaceForType("system"), null);
    assert.equal(surfaceForType("voellig_unbekannt"), null);
    assert.equal(surfaceForType(""), null);
    assert.equal(surfaceForType(null), null);
    assert.equal(surfaceForType(undefined), null);
  });

  it("jeder gemappte Surface-Key ist eine existierende Hub-Card", () => {
    for (const key of SURFACE_KEYS) {
      assert.ok(REAL_HUB_SURFACES.includes(key), `${key} muss eine echte Hub-Card-Surface sein`);
    }
  });
});

describe("notificationSurfaceMap — summarizeBySurface", () => {
  it("faltet gruppierte Rows in Per-Surface-Counts", () => {
    const rows = [
      { type: "requisition_approval", n: 2 },
      { type: "requisition_filled", n: 1 },
      { type: "offer_received", n: 3 },
      { type: "vendor_pool_change", n: 1 }
    ];
    const { surfaces, total } = summarizeBySurface(rows);
    assert.equal(surfaces.requisitions, 3);
    assert.equal(surfaces.deals, 3);
    assert.equal(surfaces.vendor_pool, 1);
    assert.equal(total, 7);
  });

  it("zaehlt unmapped Typen im total, aber nicht in surfaces", () => {
    const rows = [
      { type: "general", n: 4 },
      { type: "system", n: 1 },
      { type: "sla_breached", n: 2 }
    ];
    const { surfaces, total } = summarizeBySurface(rows);
    assert.equal(surfaces.my_company, 2);
    assert.equal(surfaces.general, undefined);
    assert.equal(total, 7);
    assert.deepEqual(Object.keys(surfaces), ["my_company"]);
  });

  it("addiert mehrere Typen derselben Surface", () => {
    const rows = [
      { type: "offer_received", n: 1 },
      { type: "deal_confirmed", n: 2 },
      { type: "offer_withdrawn", n: 1 }
    ];
    const { surfaces, total } = summarizeBySurface(rows);
    assert.equal(surfaces.deals, 4);
    assert.equal(total, 4);
  });

  it("akzeptiert numerische String-Counts (pg COUNT)", () => {
    const { surfaces, total } = summarizeBySurface([{ type: "requisition_filled", n: "5" }]);
    assert.equal(surfaces.requisitions, 5);
    assert.equal(total, 5);
  });

  it("ignoriert Null-/Negativ-Counts", () => {
    const { surfaces, total } = summarizeBySurface([
      { type: "offer_received", n: 0 },
      { type: "sla_warning", n: -3 }
    ]);
    assert.equal(surfaces.deals, undefined);
    assert.equal(surfaces.my_company, undefined);
    assert.equal(total, 0);
  });

  it("ist robust gegen leere/nullische Eingabe", () => {
    assert.deepEqual(summarizeBySurface([]), { surfaces: {}, total: 0 });
    assert.deepEqual(summarizeBySurface(null), { surfaces: {}, total: 0 });
    assert.deepEqual(summarizeBySurface(undefined), { surfaces: {}, total: 0 });
  });
});
