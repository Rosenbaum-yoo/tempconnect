/**
 * Instant Match Tests
 *
 * Covers:
 *  1. Bonus-Faktoren 7-10 (compliance, rate, urgency, workerCount)
 *  2. classifyMatch quality labels
 *  3. instantMatchFromParams enrichment (mock pool)
 *  4. instantMatchForRequisition routing (mock pool)
 *
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreMatch, classifyMatch } from "../services/matchingEngine.js";
import { instantMatchFromParams, instantMatchForRequisition } from "../services/instantMatchService.js";

// ── helpers ──────────────────────────────────────────────────

const baseDemand = { role: "Lagerhelfer", skill_tags: ["gabelstapler"], latitude: 52.52, longitude: 13.405, radius_km: 50, start_date: "2026-04-01", end_date: "2026-06-30" };
const baseCap   = { role: "Lagerhelfer", skill_tags: ["gabelstapler"], location_lat: 52.52, location_lng: 13.405, radius_km: 50, availability_from: "2026-03-01", availability_to: "2026-07-31" };

/** Minimal mock pool that returns preconfigured rows per query substring */
function mockPool(queryMap = {}) {
  return {
    query(sql, params) {
      for (const [key, rows] of Object.entries(queryMap)) {
        if (sql.includes(key)) return Promise.resolve({ rows });
      }
      return Promise.resolve({ rows: [] });
    }
  };
}

// ═════════════════════════════════════════════════════════════
// 1. scoreMatch — Bonus Factor 7: Compliance
// ═════════════════════════════════════════════════════════════

describe("scoreMatch — compliance bonus (factor 7)", () => {
  it("complianceScore 100 adds 7 points", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { complianceScore: 100 });
    const r = reasons.find(r => r.factor === "compliance");
    assert.ok(r);
    assert.equal(r.points, 7);
    assert.equal(r.max, 7);
  });

  it("complianceScore 50 adds ~4 points", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { complianceScore: 50 });
    const r = reasons.find(r => r.factor === "compliance");
    assert.ok(r);
    assert.equal(r.points, 4); // round(50/100*7) = 4
  });

  it("complianceScore 0 adds no compliance reason", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { complianceScore: 0 });
    const r = reasons.find(r => r.factor === "compliance");
    assert.ok(!r, "No compliance reason expected for 0%");
  });

  it("missing complianceScore adds no compliance reason", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, {});
    const r = reasons.find(r => r.factor === "compliance");
    assert.ok(!r);
  });
});

// ═════════════════════════════════════════════════════════════
// 2. scoreMatch — Bonus Factor 8: Rate Compatibility
// ═════════════════════════════════════════════════════════════

describe("scoreMatch — rate compatibility (factor 8)", () => {
  it("rateCompatible true adds 5 points", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { rateCompatible: true });
    const r = reasons.find(r => r.factor === "rate");
    assert.ok(r);
    assert.equal(r.points, 5);
  });

  it("rateCompatible false adds 0 points", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { rateCompatible: false });
    const r = reasons.find(r => r.factor === "rate");
    assert.ok(r);
    assert.equal(r.points, 0);
  });

  it("rateCompatible undefined adds no rate reason", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, {});
    const r = reasons.find(r => r.factor === "rate");
    assert.ok(!r);
  });
});

// ═════════════════════════════════════════════════════════════
// 3. scoreMatch — Bonus Factor 9: Urgency Boost
// ═════════════════════════════════════════════════════════════

describe("scoreMatch — urgency boost (factor 9)", () => {
  it("urgencyBoost true adds 5 points", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { urgencyBoost: true });
    const r = reasons.find(r => r.factor === "urgency");
    assert.ok(r);
    assert.equal(r.points, 5);
  });

  it("urgencyBoost false/undefined adds no urgency reason", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { urgencyBoost: false });
    const r = reasons.find(r => r.factor === "urgency");
    assert.ok(!r);
  });
});

// ═════════════════════════════════════════════════════════════
// 4. scoreMatch — Bonus Factor 10: Worker Count Match
// ═════════════════════════════════════════════════════════════

describe("scoreMatch — workerCount match (factor 10)", () => {
  it("workerCountMatch true adds 3 points", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { workerCountMatch: true });
    const r = reasons.find(r => r.factor === "workerCount");
    assert.ok(r);
    assert.equal(r.points, 3);
  });

  it("workerCountMatch false adds 0 points", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, { workerCountMatch: false });
    const r = reasons.find(r => r.factor === "workerCount");
    assert.ok(r);
    assert.equal(r.points, 0);
  });

  it("workerCountMatch undefined adds no reason", () => {
    const { reasons } = scoreMatch(baseDemand, baseCap, {});
    const r = reasons.find(r => r.factor === "workerCount");
    assert.ok(!r);
  });
});

// ═════════════════════════════════════════════════════════════
// 5. scoreMatch — all 10 factors combined, capped at 100
// ═════════════════════════════════════════════════════════════

describe("scoreMatch — combined 10-factor cap", () => {
  it("all 10 factors active never exceeds 100", () => {
    const { score } = scoreMatch(
      baseDemand,
      baseCap,
      {
        supplierVerified: true,
        vendorPoolTier: "PREFERRED",
        complianceScore: 100,
        rateCompatible: true,
        urgencyBoost: true,
        workerCountMatch: true
      }
    );
    assert.ok(score <= 100, `Score ${score} should not exceed 100`);
  });

  it("all 10 factors produce a high score (>=80)", () => {
    const { score } = scoreMatch(
      baseDemand,
      baseCap,
      {
        supplierVerified: true,
        vendorPoolTier: "PREFERRED",
        complianceScore: 100,
        rateCompatible: true,
        urgencyBoost: true,
        workerCountMatch: true
      }
    );
    assert.ok(score >= 80, `Expected excellent score, got ${score}`);
  });
});

// ═════════════════════════════════════════════════════════════
// 6. classifyMatch
// ═════════════════════════════════════════════════════════════

describe("classifyMatch", () => {
  it("score 100 => excellent", () => assert.equal(classifyMatch(100), "excellent"));
  it("score 80  => excellent", () => assert.equal(classifyMatch(80), "excellent"));
  it("score 79  => good",      () => assert.equal(classifyMatch(79), "good"));
  it("score 60  => good",      () => assert.equal(classifyMatch(60), "good"));
  it("score 59  => fair",      () => assert.equal(classifyMatch(59), "fair"));
  it("score 40  => fair",      () => assert.equal(classifyMatch(40), "fair"));
  it("score 39  => weak",      () => assert.equal(classifyMatch(39), "weak"));
  it("score 0   => weak",      () => assert.equal(classifyMatch(0), "weak"));
});

// ═════════════════════════════════════════════════════════════
// 7. instantMatchFromParams — enrichment
// ═════════════════════════════════════════════════════════════

describe("instantMatchFromParams", () => {
  const cap1 = {
    id: "cp-1",
    supplier_company_id: "org-s1",
    supplier_name: "Tempo GmbH",
    role: "Lagerhelfer",
    skill_tags: ["gabelstapler"],
    location_lat: 52.52, location_lng: 13.405, radius_km: 50,
    availability_from: "2026-03-01", availability_to: "2026-07-31",
    hourly_rate: 20, workers_count: 5, is_active: true
  };

  const pool = mockPool({
    capacity_posts: [cap1],
    compliance_documents: [{ supplier_org_id: "org-s1", green_count: 5, total_count: 5 }],
    supplier_reputation: [{ org_id: "org-s1", overall_score: 85 }],
    vendor_pool: [{ supplier_org_id: "org-s1", tier: "PREFERRED" }],
    "organizations WHERE id": [{ id: "org-s1", is_verified: true, name: "Tempo GmbH" }]
  });

  it("returns matches array with enriched fields", async () => {
    const result = await instantMatchFromParams(pool, baseDemand, "org-buyer", {
      topN: 10, minScore: 1, budgetPerHour: 25, workersNeeded: 3, urgency: "HIGH"
    });
    assert.ok(Array.isArray(result.matches));
    assert.ok(result.matches.length > 0);
    const m = result.matches[0];
    assert.ok(typeof m.score === "number");
    assert.ok(["excellent","good","fair","weak"].includes(m.quality_label));
    assert.ok(Array.isArray(m.highlights));
    assert.ok(m.supplier_info);
    assert.ok(typeof m.supplier_info.id === "string");
    assert.ok(typeof m.supplier_info.verified === "boolean");
  });

  it("returns quality_summary counts", async () => {
    const result = await instantMatchFromParams(pool, baseDemand, "org-buyer", { topN: 10, minScore: 1 });
    assert.ok(result.quality_summary);
    assert.ok(typeof result.quality_summary.excellent === "number");
    assert.ok(typeof result.quality_summary.good === "number");
    assert.ok(typeof result.quality_summary.fair === "number");
    assert.ok(typeof result.quality_summary.weak === "number");
  });

  it("returns empty when no capacity posts", async () => {
    const emptyPool = mockPool({ capacity_posts: [] });
    const result = await instantMatchFromParams(emptyPool, baseDemand, "org-buyer");
    assert.equal(result.matches.length, 0);
    assert.equal(result.total, 0);
  });

  it("minScore filters out low matches", async () => {
    const result = await instantMatchFromParams(pool, baseDemand, "org-buyer", { minScore: 999 });
    assert.equal(result.matches.length, 0);
  });

  it("topN limits returned matches", async () => {
    // create pool with many caps
    const manyCaps = Array.from({ length: 10 }, (_, i) => ({
      ...cap1, id: `cp-${i}`, supplier_company_id: `org-s${i}`
    }));
    const bigPool = mockPool({
      capacity_posts: manyCaps,
      compliance_documents: [],
      supplier_reputation: [],
      vendor_pool: [],
      "organizations WHERE id": manyCaps.map(c => ({ id: c.supplier_company_id, is_verified: false, name: `Supplier ${c.id}` }))
    });
    const result = await instantMatchFromParams(bigPool, baseDemand, "org-buyer", { topN: 3, minScore: 1 });
    assert.ok(result.matches.length <= 3);
  });
});

// ═════════════════════════════════════════════════════════════
// 8. instantMatchForRequisition — routing
// ═════════════════════════════════════════════════════════════

describe("instantMatchForRequisition", () => {
  it("returns REQUISITION_NOT_FOUND when requisition does not exist", async () => {
    const pool = mockPool({ requisitions: [] });
    const result = await instantMatchForRequisition(pool, "nonexistent", "org-1");
    assert.equal(result.error, "REQUISITION_NOT_FOUND");
  });

  it("returns ORG_BOUNDARY_VIOLATION on org mismatch", async () => {
    const pool = mockPool({
      requisitions: [{ id: "r-1", org_id: "org-A", role: "Lagerhelfer", skill_tags: [], org_name: "Test" }],
      capacity_posts: []
    });
    const result = await instantMatchForRequisition(pool, "r-1", "org-B");
    assert.equal(result.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("returns matches for valid requisition", async () => {
    const pool = mockPool({
      requisitions: [{
        id: "r-1", org_id: "org-A", role: "Lagerhelfer", skill_tags: ["gabelstapler"],
        latitude: 52.52, longitude: 13.405, radius_km: 50,
        start_date: "2026-04-01", end_date: "2026-06-30",
        org_name: "Test GmbH"
      }],
      capacity_posts: [{
        id: "cp-1", supplier_company_id: "org-s1", role: "Lagerhelfer",
        skill_tags: ["gabelstapler"], location_lat: 52.52, location_lng: 13.405,
        radius_km: 50, availability_from: "2026-03-01", availability_to: "2026-07-31",
        is_active: true
      }],
      compliance_documents: [],
      supplier_reputation: [],
      vendor_pool: [],
      "organizations WHERE id": [{ id: "org-s1", is_verified: false, name: "Supplier GmbH" }]
    });
    const result = await instantMatchForRequisition(pool, "r-1", "org-A");
    assert.ok(!result.error);
    assert.ok(Array.isArray(result.matches));
    assert.ok(result.total >= 0);
  });
});
