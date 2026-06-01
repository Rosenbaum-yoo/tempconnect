/**
 * Preferred Vendor First / Self-Service Workforce Pool tests.
 * Covers: premium functions, matching factor 12, batch ops, coverage, suggest, workforce capacity.
 *
 * Run: node --test --test-force-exit test/preferredVendor.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getPreferredVendors,
  getPreferredSummary,
  bulkSetPreferred,
  demoteFromPreferred,
  getPoolCoverage,
  suggestForPreferred,
  getWorkforceCapacity,
  VALID_TIERS,
  getEntry,
  changeTier
} from "../services/vendorPoolService.js";
import { scoreMatch, PREFERRED_FIRST_BOOST } from "../services/matchingEngine.js";

// ── Mock helpers ──────────────────────────────────────

function mockPool(queryFn) {
  return { query: queryFn };
}

function returnPool(rows = []) {
  return mockPool(async () => ({ rows, rowCount: rows.length }));
}

function sequencePool(...responses) {
  let idx = 0;
  return mockPool(async () => {
    if (idx >= responses.length) return { rows: [], rowCount: 0 };
    const resp = responses[idx++];
    if (resp instanceof Error) throw resp;
    return resp;
  });
}

// ═══════════════════════════════════════════════════════
// PREFERRED_FIRST_BOOST constant
// ═══════════════════════════════════════════════════════

describe("PREFERRED_FIRST_BOOST — constant", () => {
  it("exports PREFERRED_FIRST_BOOST = 15", () => {
    assert.strictEqual(PREFERRED_FIRST_BOOST, 15);
  });

  it("PREFERRED is a valid tier", () => {
    assert.ok(VALID_TIERS.includes('PREFERRED'));
  });
});

// ═══════════════════════════════════════════════════════
// scoreMatch — Factor 12: Preferred-First Boost
// ═══════════════════════════════════════════════════════

describe("scoreMatch — Factor 12: Preferred-First Boost", () => {
  const demand = { role: 'Schweisser', skill_tags: ['WIG'] };
  const cap = { role: 'Schweisser', skill_tags: ['WIG'] };

  it("adds 15 pts when preferredFirst=true and vendorPoolTier=PREFERRED", () => {
    const { score, reasons } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: 'PREFERRED'
    });
    const pfReason = reasons.find(r => r.factor === 'preferredFirst');
    assert.ok(pfReason, "Should have preferredFirst reason");
    assert.strictEqual(pfReason.points, 15);
    assert.ok(pfReason.detail.includes('Bevorzugter Dienstleister'));
    assert.ok(score >= 15);
  });

  it("does NOT add boost when preferredFirst=false", () => {
    const { reasons } = scoreMatch(demand, cap, {
      preferredFirst: false,
      vendorPoolTier: 'PREFERRED'
    });
    const pfReason = reasons.find(r => r.factor === 'preferredFirst');
    assert.strictEqual(pfReason, undefined);
  });

  it("does NOT add boost when vendorPoolTier is SECONDARY", () => {
    const { reasons } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: 'SECONDARY'
    });
    const pfReason = reasons.find(r => r.factor === 'preferredFirst');
    assert.strictEqual(pfReason, undefined);
  });

  it("does NOT add boost when vendorPoolTier is null", () => {
    const { reasons } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: null
    });
    const pfReason = reasons.find(r => r.factor === 'preferredFirst');
    assert.strictEqual(pfReason, undefined);
  });

  it("PREFERRED vendor ranks higher than non-preferred with preferredFirst", () => {
    const { score: prefScore } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: 'PREFERRED'
    });
    const { score: nonPrefScore } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: null
    });
    assert.ok(prefScore > nonPrefScore, `PREFERRED ${prefScore} should be > non-preferred ${nonPrefScore}`);
    assert.ok(prefScore - nonPrefScore >= 15, "Difference should be at least 15 (boost + vendorPool base)");
  });

  it("combines with vendorPool base factor (Factor 6)", () => {
    const { reasons } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: 'PREFERRED'
    });
    const vpReason = reasons.find(r => r.factor === 'vendorPool');
    const pfReason = reasons.find(r => r.factor === 'preferredFirst');
    assert.ok(vpReason, "vendorPool factor should exist");
    assert.ok(pfReason, "preferredFirst factor should exist");
    // Both contribute
    assert.ok(vpReason.points > 0);
    assert.ok(pfReason.points > 0);
  });
});

// ═══════════════════════════════════════════════════════
// getPreferredVendors
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — getPreferredVendors", () => {
  it("returns preferred vendors with KPI fields", async () => {
    const pool = returnPool([
      {
        id: 'vp-1', tier: 'PREFERRED', supplier_org_name: 'AcmeCorp',
        reputation_score: 88, reputation_grade: 'GOLD', avg_stars: 4.5,
        fill_rate_pct: 90.0, active_capacity_count: 5
      }
    ]);
    const result = await getPreferredVendors(pool, 'org-1');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].tier, 'PREFERRED');
    assert.strictEqual(result[0].reputation_score, 88);
    assert.strictEqual(result[0].active_capacity_count, 5);
  });

  it("SQL includes PREFERRED filter", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getPreferredVendors(pool, 'org-1');
    assert.ok(captured[0].sql.includes("vp.tier = 'PREFERRED'"));
    assert.ok(captured[0].sql.includes("vp.status = 'active'"));
  });

  it("applies category filter", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getPreferredVendors(pool, 'org-1', { category: 'IT' });
    assert.ok(captured[0].params.includes('IT'));
  });

  it("applies location_id filter", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getPreferredVendors(pool, 'org-1', { location_id: 'loc-1' });
    assert.ok(captured[0].params.includes('loc-1'));
  });

  it("returns empty array for empty pool", async () => {
    const pool = returnPool([]);
    const result = await getPreferredVendors(pool, 'org-empty');
    assert.deepStrictEqual(result, []);
  });
});

// ═══════════════════════════════════════════════════════
// getPreferredSummary
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — getPreferredSummary", () => {
  it("returns structured summary with coverage", async () => {
    const pool = sequencePool(
      // Aggregate query
      { rows: [{
        total_preferred: 8,
        avg_reputation: 75.5,
        avg_stars: 4.2,
        avg_deal_success: 82.0,
        categories_covered: 3,
        locations_covered: 5,
        departments_covered: 2
      }] },
      // Top 5
      { rows: [{ id: 'vp-1', supplier_name: 'Best', reputation_score: 95 }] }
    );
    const summary = await getPreferredSummary(pool, 'org-1');
    assert.strictEqual(summary.total_preferred, 8);
    assert.strictEqual(summary.avg_reputation, 75.5);
    assert.strictEqual(summary.avg_stars, 4.2);
    assert.strictEqual(summary.coverage.categories, 3);
    assert.strictEqual(summary.coverage.locations, 5);
    assert.strictEqual(summary.coverage.departments, 2);
    assert.strictEqual(summary.top_performers.length, 1);
  });

  it("handles empty pool gracefully", async () => {
    const pool = returnPool([]);
    const summary = await getPreferredSummary(pool, 'org-empty');
    assert.strictEqual(summary.total_preferred, 0);
    assert.strictEqual(summary.coverage.categories, 0);
    assert.deepStrictEqual(summary.top_performers, []);
  });
});

// ═══════════════════════════════════════════════════════
// bulkSetPreferred
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — bulkSetPreferred", () => {
  it("returns empty array for empty entryIds", async () => {
    const pool = returnPool([]);
    const result = await bulkSetPreferred(pool, 'org-1', [], 'actor-1');
    assert.deepStrictEqual(result, []);
  });

  it("returns empty array for null entryIds", async () => {
    const pool = returnPool([]);
    const result = await bulkSetPreferred(pool, 'org-1', null, 'actor-1');
    assert.deepStrictEqual(result, []);
  });

  it("promotes entries belonging to client", async () => {
    let callCount = 0;
    const pool = mockPool(async (sql, params) => {
      callCount++;
      // getEntry: SELECT vp.*, ...
      if (sql.includes('FROM vendor_pool vp') && sql.includes('WHERE vp.id = $1')) {
        return { rows: [{ id: 'vp-1', client_org_id: 'org-1', tier: 'SECONDARY', status: 'active' }] };
      }
      // changeTier: SELECT old tier
      if (sql.includes('SELECT tier FROM vendor_pool')) {
        return { rows: [{ tier: 'SECONDARY' }] };
      }
      // changeTier: UPDATE
      if (sql.includes('UPDATE vendor_pool SET tier')) {
        return { rows: [{ id: 'vp-1', tier: 'PREFERRED' }] };
      }
      // History write
      return { rows: [] };
    });
    const result = await bulkSetPreferred(pool, 'org-1', ['vp-1'], 'actor-1', 'Batch promote');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].tier, 'PREFERRED');
  });

  it("skips entries from other orgs", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM vendor_pool vp') && sql.includes('WHERE vp.id = $1')) {
        return { rows: [{ id: 'vp-1', client_org_id: 'org-OTHER', tier: 'SECONDARY' }] };
      }
      return { rows: [] };
    });
    const result = await bulkSetPreferred(pool, 'org-1', ['vp-1'], 'actor-1');
    assert.strictEqual(result.length, 0);
  });

  it("skips entries already PREFERRED", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM vendor_pool vp') && sql.includes('WHERE vp.id = $1')) {
        return { rows: [{ id: 'vp-1', client_org_id: 'org-1', tier: 'PREFERRED' }] };
      }
      return { rows: [] };
    });
    const result = await bulkSetPreferred(pool, 'org-1', ['vp-1'], 'actor-1');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].tier, 'PREFERRED'); // already preferred, returned as-is
  });
});

// ═══════════════════════════════════════════════════════
// demoteFromPreferred
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — demoteFromPreferred", () => {
  it("demotes PREFERRED to SECONDARY", async () => {
    const pool = mockPool(async (sql) => {
      // getEntry
      if (sql.includes('FROM vendor_pool vp') && sql.includes('WHERE vp.id = $1')) {
        return { rows: [{ id: 'vp-1', tier: 'PREFERRED', status: 'active' }] };
      }
      // changeTier: SELECT old tier
      if (sql.includes('SELECT tier FROM vendor_pool')) {
        return { rows: [{ tier: 'PREFERRED' }] };
      }
      // changeTier: UPDATE
      if (sql.includes('UPDATE vendor_pool SET tier')) {
        return { rows: [{ id: 'vp-1', tier: 'SECONDARY' }] };
      }
      return { rows: [] };
    });
    const result = await demoteFromPreferred(pool, 'vp-1', 'actor-1', 'Performance drop');
    assert.ok(result);
    assert.strictEqual(result.tier, 'SECONDARY');
  });

  it("returns null for non-PREFERRED entry", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM vendor_pool vp') && sql.includes('WHERE vp.id = $1')) {
        return { rows: [{ id: 'vp-1', tier: 'SECONDARY' }] };
      }
      return { rows: [] };
    });
    const result = await demoteFromPreferred(pool, 'vp-1', 'actor-1');
    assert.strictEqual(result, null);
  });

  it("returns null for nonexistent entry", async () => {
    const pool = returnPool([]);
    const result = await demoteFromPreferred(pool, 'nonexistent', 'actor-1');
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════
// getPoolCoverage
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — getPoolCoverage", () => {
  it("returns covered and gaps", async () => {
    const pool = sequencePool(
      // Preferred coverage
      { rows: [
        { category: 'IT', location_name: 'Berlin', department_name: null, vendor_count: 3 },
        { category: 'Logistik', location_name: 'Hamburg', department_name: null, vendor_count: 2 }
      ] },
      // Gaps
      { rows: [
        { category: 'Pflege', location_name: 'Muenchen', department_name: null, vendor_count: 1, tier: 'SECONDARY' }
      ] }
    );
    const result = await getPoolCoverage(pool, 'org-1');
    assert.strictEqual(result.covered.length, 2);
    assert.strictEqual(result.gaps.length, 1);
    assert.strictEqual(result.covered[0].category, 'IT');
    assert.strictEqual(result.gaps[0].category, 'Pflege');
  });

  it("returns empty arrays for empty pool", async () => {
    const pool = returnPool([]);
    const result = await getPoolCoverage(pool, 'org-empty');
    assert.deepStrictEqual(result.covered, []);
    assert.deepStrictEqual(result.gaps, []);
  });
});

// ═══════════════════════════════════════════════════════
// suggestForPreferred
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — suggestForPreferred", () => {
  it("returns SECONDARY vendors with high reputation as suggestions", async () => {
    const pool = returnPool([
      {
        entry_id: 'vp-10', supplier_org_id: 'org-s1', supplier_name: 'Rising Star',
        tier: 'SECONDARY', category: 'IT', reputation_score: 82,
        grade: 'GOLD', avg_stars: 4.4, deal_success_rate: 90.0, fill_rate_pct: 85.0
      }
    ]);
    const result = await suggestForPreferred(pool, 'org-1', 5);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].tier, 'SECONDARY');
    assert.ok(result[0].reputation_score >= 50);
  });

  it("caps limit at 50", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await suggestForPreferred(pool, 'org-1', 999);
    assert.strictEqual(captured[0].params[1], 50);
  });

  it("SQL filters for reputation >= 50", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await suggestForPreferred(pool, 'org-1');
    assert.ok(captured[0].sql.includes('reputation_score >= 50'));
  });

  it("returns empty array when no qualifying vendors", async () => {
    const pool = returnPool([]);
    const result = await suggestForPreferred(pool, 'org-1');
    assert.deepStrictEqual(result, []);
  });
});

// ═══════════════════════════════════════════════════════
// getWorkforceCapacity
// ═══════════════════════════════════════════════════════

describe("vendorPoolService — getWorkforceCapacity", () => {
  it("returns vendors with capacity aggregation", async () => {
    const pool = returnPool([
      { supplier_org_id: 'org-s1', supplier_name: 'TopStaff', capacity_posts: 5, total_workers: 25, roles: ['Schweisser', 'Elektriker'] },
      { supplier_org_id: 'org-s2', supplier_name: 'FastHire', capacity_posts: 3, total_workers: 12, roles: ['Fahrer'] }
    ]);
    const result = await getWorkforceCapacity(pool, 'org-1');
    assert.strictEqual(result.vendors.length, 2);
    assert.strictEqual(result.totals.total_posts, 8);
    assert.strictEqual(result.totals.total_workers, 37);
  });

  it("handles empty pool", async () => {
    const pool = returnPool([]);
    const result = await getWorkforceCapacity(pool, 'org-empty');
    assert.strictEqual(result.vendors.length, 0);
    assert.strictEqual(result.totals.total_posts, 0);
    assert.strictEqual(result.totals.total_workers, 0);
  });

  it("SQL joins capacity_posts for PREFERRED only", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getWorkforceCapacity(pool, 'org-1');
    assert.ok(captured[0].sql.includes("vp.tier = 'PREFERRED'"));
    assert.ok(captured[0].sql.includes("capacity_posts cp"));
  });
});

// ═══════════════════════════════════════════════════════
// Matching Integration: PREFERRED vs Non-Preferred ranking
// ═══════════════════════════════════════════════════════

describe("Matching Integration — Preferred-First ranking effect", () => {
  const demand = {
    role: 'Elektriker',
    skill_tags: ['Elektro', 'SPS'],
    latitude: 52.52, longitude: 13.405,
    start_date: '2026-04-01', end_date: '2026-06-30'
  };

  it("PREFERRED vendor outranks equally qualified non-preferred", () => {
    const cap = {
      role: 'Elektriker', skill_tags: ['Elektro', 'SPS'],
      location_lat: 52.50, location_lng: 13.40,
      availability_from: '2026-03-15', availability_to: '2026-07-01'
    };
    const { score: prefScore } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: 'PREFERRED',
      supplierVerified: true
    });
    const { score: normalScore } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: null,
      supplierVerified: true
    });
    assert.ok(prefScore > normalScore, `PREFERRED (${prefScore}) should beat normal (${normalScore})`);
  });

  it("PREFERRED vendor outranks SECONDARY vendor with preferredFirst", () => {
    const cap = {
      role: 'Elektriker', skill_tags: ['Elektro'],
      location_lat: 52.50, location_lng: 13.40,
      availability_from: '2026-03-15'
    };
    const { score: prefScore } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: 'PREFERRED'
    });
    const { score: secScore } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: 'SECONDARY'
    });
    assert.ok(prefScore > secScore);
  });

  it("without preferredFirst, PREFERRED advantage is only vendorPool base (5 pts)", () => {
    const cap = {
      role: 'Elektriker', skill_tags: ['Elektro'],
      location_lat: 52.50, location_lng: 13.40,
      availability_from: '2026-03-15'
    };
    const { score: prefScore } = scoreMatch(demand, cap, {
      preferredFirst: false,
      vendorPoolTier: 'PREFERRED'
    });
    const { score: secScore } = scoreMatch(demand, cap, {
      preferredFirst: false,
      vendorPoolTier: 'SECONDARY'
    });
    const diff = prefScore - secScore;
    // Without preferredFirst, PREFERRED gets full 5, SECONDARY gets 2-3 (half)
    assert.ok(diff <= 5 && diff >= 0, `Difference without boost should be <=5 (was ${diff})`);
  });

  it("score is capped at 100 even with all boosts", () => {
    const cap = {
      role: 'Elektriker', skill_tags: ['Elektro', 'SPS'],
      location_lat: 52.52, location_lng: 13.405,
      availability_from: '2026-04-01', availability_to: '2026-06-30'
    };
    const { score } = scoreMatch(demand, cap, {
      preferredFirst: true,
      vendorPoolTier: 'PREFERRED',
      supplierVerified: true,
      complianceScore: 100,
      reputationScore: 100,
      rateCompatible: true,
      urgencyBoost: true,
      workerCountMatch: true
    });
    assert.ok(score <= 100, `Score ${score} should be capped at 100`);
  });
});

// ═══════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════

describe("Preferred Vendor — Edge cases", () => {
  it("getPreferredVendors limits to 200", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await getPreferredVendors(pool, 'org-1', { limit: 500 });
    assert.strictEqual(captured[0].params[captured[0].params.length - 1], 200);
  });

  it("suggestForPreferred minimum limit is 1", async () => {
    const captured = [];
    const pool = mockPool(async (sql, params) => {
      captured.push({ sql, params });
      return { rows: [] };
    });
    await suggestForPreferred(pool, 'org-1', 0);
    assert.strictEqual(captured[0].params[1], 1);
  });

  it("PREFERRED_FIRST_BOOST is a positive number", () => {
    assert.ok(typeof PREFERRED_FIRST_BOOST === 'number');
    assert.ok(PREFERRED_FIRST_BOOST > 0);
  });
});
