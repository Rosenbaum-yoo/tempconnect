/**
 * Listing Analytics Service unit tests — pure logic functions, no DB required.
 * Tests: computeConversionFunnel rates and edge cases.
 *
 * Run: node --test --test-force-exit test/listingAnalyticsService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { computeConversionFunnel } from "../services/listingAnalyticsService.js";

// ─────────────────────────────────────────────────────────────────
// computeConversionFunnel
// ─────────────────────────────────────────────────────────────────

describe("computeConversionFunnel — conversion rate calculation", () => {
  it("all zeros → all rates null", () => {
    const r = computeConversionFunnel({ view_count: 0, click_count: 0, match_count: 0, deal_count: 0 });
    assert.strictEqual(r.click_rate, null);
    assert.strictEqual(r.match_rate, null);
    assert.strictEqual(r.deal_rate, null);
  });

  it("perfect funnel: 100 views → 50 clicks → 25 matches → 10 deals", () => {
    const r = computeConversionFunnel({ view_count: 100, click_count: 50, match_count: 25, deal_count: 10 });
    assert.strictEqual(r.click_rate, 50);    // 50/100
    assert.strictEqual(r.match_rate, 50);    // 25/50
    assert.strictEqual(r.deal_rate, 40);     // 10/25
  });

  it("100% conversion at each step", () => {
    const r = computeConversionFunnel({ view_count: 10, click_count: 10, match_count: 10, deal_count: 10 });
    assert.strictEqual(r.click_rate, 100);
    assert.strictEqual(r.match_rate, 100);
    assert.strictEqual(r.deal_rate, 100);
  });

  it("views but no clicks → click_rate=0, others null", () => {
    const r = computeConversionFunnel({ view_count: 50, click_count: 0, match_count: 0, deal_count: 0 });
    assert.strictEqual(r.click_rate, 0);
    assert.strictEqual(r.match_rate, null);
    assert.strictEqual(r.deal_rate, null);
  });

  it("handles fractional rates with 2 decimal precision", () => {
    const r = computeConversionFunnel({ view_count: 3, click_count: 1, match_count: 0, deal_count: 0 });
    assert.strictEqual(r.click_rate, 33.33);
  });

  it("null/undefined stats treated as zeros", () => {
    const r = computeConversionFunnel(null);
    assert.strictEqual(r.view_count, 0);
    assert.strictEqual(r.click_count, 0);
    assert.strictEqual(r.click_rate, null);
  });

  it("preserves raw counts in output", () => {
    const r = computeConversionFunnel({ view_count: 200, click_count: 80, match_count: 15, deal_count: 3 });
    assert.strictEqual(r.view_count, 200);
    assert.strictEqual(r.click_count, 80);
    assert.strictEqual(r.match_count, 15);
    assert.strictEqual(r.deal_count, 3);
  });

  it("string numbers from DB are handled", () => {
    const r = computeConversionFunnel({ view_count: "100", click_count: "25", match_count: "5", deal_count: "1" });
    assert.strictEqual(r.click_rate, 25);
    assert.strictEqual(r.match_rate, 20);
    assert.strictEqual(r.deal_rate, 20);
  });
});
