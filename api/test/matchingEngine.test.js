/**
 * Matching Engine Unit Tests
 *
 * Tests haversineKm() and scoreMatch() scoring logic in isolation.
 * No database required — pure function tests.
 *
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { haversineKm, scoreMatch } from "../services/matchingEngine.js";

// ─────────────────────────────────────────────────────────────
// haversineKm
// ─────────────────────────────────────────────────────────────

describe("haversineKm", () => {
  it("same coordinates returns ~0 km", () => {
    const d = haversineKm(52.52, 13.405, 52.52, 13.405);
    assert.ok(d < 0.01, `Expected ~0, got ${d}`);
  });

  it("Berlin to Hamburg is approximately 254 km", () => {
    // Berlin: 52.52, 13.405 | Hamburg: 53.55, 9.99
    const d = haversineKm(52.52, 13.405, 53.55, 9.99);
    assert.ok(d > 240 && d < 270, `Expected ~254 km, got ${d}`);
  });

  it("Berlin to Munich is approximately 504 km", () => {
    // Munich: 48.137, 11.576
    const d = haversineKm(52.52, 13.405, 48.137, 11.576);
    assert.ok(d > 490 && d < 520, `Expected ~504 km, got ${d}`);
  });

  it("handles string coordinates (from DB)", () => {
    const d = haversineKm("52.52", "13.405", "52.52", "13.405");
    assert.ok(d < 0.01);
  });

  it("returns a positive number for non-identical coordinates", () => {
    const d = haversineKm(50.0, 8.0, 51.0, 9.0);
    assert.ok(d > 0);
  });
});

// ─────────────────────────────────────────────────────────────
// scoreMatch — role factor
// ─────────────────────────────────────────────────────────────

describe("scoreMatch — role scoring", () => {
  const baseCap = { skill_tags: [], location_city: null };
  const baseDemand = { skill_tags: [] };

  it("exact role match scores 30 points", () => {
    const { score, reasons } = scoreMatch(
      { ...baseDemand, role: "Lagerhelfer" },
      { ...baseCap, role: "Lagerhelfer" }
    );
    const r = reasons.find(r => r.factor === "role");
    assert.strictEqual(r.points, 30);
    assert.ok(score >= 30);
  });

  it("case-insensitive role match scores 30 points", () => {
    const { reasons } = scoreMatch(
      { ...baseDemand, role: "LAGERHELFER" },
      { ...baseCap, role: "lagerhelfer" }
    );
    const r = reasons.find(r => r.factor === "role");
    assert.strictEqual(r.points, 30);
  });

  it("partial role match scores 15 points (50% of 30)", () => {
    const { reasons } = scoreMatch(
      { ...baseDemand, role: "Lager" },
      { ...baseCap, role: "Lagerhelfer" }
    );
    const r = reasons.find(r => r.factor === "role");
    assert.strictEqual(r.points, 15);
  });

  it("non-matching role scores 0", () => {
    const { reasons } = scoreMatch(
      { ...baseDemand, role: "Elektriker" },
      { ...baseCap, role: "Staplerfahrer" }
    );
    const r = reasons.find(r => r.factor === "role");
    assert.strictEqual(r.points, 0);
  });
});

// ─────────────────────────────────────────────────────────────
// scoreMatch — skill factor
// ─────────────────────────────────────────────────────────────

describe("scoreMatch — skill scoring", () => {
  it("full overlap (3/3 tags) scores max skill points", () => {
    const { reasons } = scoreMatch(
      { skill_tags: ["gabelstapler", "lager", "nachtschicht"] },
      { skill_tags: ["gabelstapler", "lager", "nachtschicht"] }
    );
    const r = reasons.find(r => r.factor === "skills");
    assert.ok(r && r.points > 0);
    assert.strictEqual(r.points, r.max); // full score
  });

  it("partial overlap (1/3 tags) scores proportionally", () => {
    const { reasons } = scoreMatch(
      { skill_tags: ["gabelstapler", "lager", "nachtschicht"] },
      { skill_tags: ["gabelstapler", "schweissen", "montage"] }
    );
    const r = reasons.find(r => r.factor === "skills");
    assert.ok(r && r.points > 0 && r.points < r.max);
  });

  it("no overlap scores 0 skill points", () => {
    const { reasons } = scoreMatch(
      { skill_tags: ["gabelstapler"] },
      { skill_tags: ["schweissen"] }
    );
    const r = reasons.find(r => r.factor === "skills");
    assert.ok(r && r.points === 0);
  });

  it("skill matching is case-insensitive", () => {
    const { reasons } = scoreMatch(
      { skill_tags: ["Gabelstapler"] },
      { skill_tags: ["gabelstapler"] }
    );
    const r = reasons.find(r => r.factor === "skills");
    assert.ok(r && r.points > 0);
  });
});

// ─────────────────────────────────────────────────────────────
// scoreMatch — location factor
// ─────────────────────────────────────────────────────────────

describe("scoreMatch — location scoring", () => {
  it("same coordinates scores max location points (25)", () => {
    const { reasons } = scoreMatch(
      { latitude: 52.52, longitude: 13.405, radius_km: 50 },
      { location_lat: 52.52, location_lng: 13.405, radius_km: 50 }
    );
    const r = reasons.find(r => r.factor === "location");
    assert.ok(r && r.points > 0, "Expected location score");
    assert.strictEqual(r.points, r.max);
  });

  it("location outside radius scores 0", () => {
    // Berlin demand, Munich capacity, radius 50 km — dist ~504 km
    const { reasons } = scoreMatch(
      { latitude: 52.52, longitude: 13.405, radius_km: 50 },
      { location_lat: 48.137, location_lng: 11.576, radius_km: 50 }
    );
    const r = reasons.find(r => r.factor === "location");
    assert.ok(r && r.points === 0);
  });

  it("city-based fallback scores partial points when no coords", () => {
    const { reasons } = scoreMatch(
      { location_city: "Berlin" },
      { location_city: "Berlin" }
    );
    const r = reasons.find(r => r.factor === "location");
    assert.ok(r && r.points > 0, "Expected partial location score from city match");
  });

  it("city mismatch without coords scores 0", () => {
    const { reasons } = scoreMatch(
      { location_city: "Berlin" },
      { location_city: "München" }
    );
    const r = reasons.find(r => r.factor === "location");
    // No location factor expected at all (or 0 points)
    if (r) {
      assert.strictEqual(r.points, 0);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// scoreMatch — availability factor
// ─────────────────────────────────────────────────────────────

describe("scoreMatch — availability scoring", () => {
  it("overlapping date ranges scores availability points (10)", () => {
    const { reasons } = scoreMatch(
      { start_date: "2026-04-01", end_date: "2026-06-30" },
      { availability_from: "2026-03-01", availability_to: "2026-05-31" }
    );
    const r = reasons.find(r => r.factor === "availability");
    assert.ok(r && r.points === 10);
  });

  it("non-overlapping dates scores 0", () => {
    const { reasons } = scoreMatch(
      { start_date: "2026-01-01", end_date: "2026-01-31" },
      { availability_from: "2026-03-01", availability_to: "2026-06-30" }
    );
    const r = reasons.find(r => r.factor === "availability");
    assert.ok(r && r.points === 0);
  });

  it("no dates — no availability reason added", () => {
    const { reasons } = scoreMatch({}, {});
    const r = reasons.find(r => r.factor === "availability");
    assert.ok(!r, "No availability reason expected when no dates provided");
  });
});

// ─────────────────────────────────────────────────────────────
// scoreMatch — supplier verified bonus
// ─────────────────────────────────────────────────────────────

describe("scoreMatch — verified supplier bonus", () => {
  it("verified supplier adds 5 points", () => {
    const withVerified = scoreMatch({}, {}, { supplierVerified: true });
    const withoutVerified = scoreMatch({}, {}, { supplierVerified: false });
    const r = withVerified.reasons.find(r => r.factor === "verified");
    assert.ok(r && r.points === 5);
    assert.strictEqual(withVerified.score - withoutVerified.score, 5);
  });

  it("unverified supplier adds 0 points", () => {
    const { reasons } = scoreMatch({}, {}, { supplierVerified: false });
    const r = reasons.find(r => r.factor === "verified");
    assert.ok(!r, "No verified reason expected for unverified supplier");
  });
});

// ─────────────────────────────────────────────────────────────
// scoreMatch — vendor pool bonus
// ─────────────────────────────────────────────────────────────

describe("scoreMatch — vendor pool tier bonus", () => {
  it("PREFERRED tier adds full 5 points", () => {
    const { reasons } = scoreMatch({}, {}, { vendorPoolTier: "PREFERRED" });
    const r = reasons.find(r => r.factor === "vendorPool");
    assert.ok(r && r.points === 5);
  });

  it("STANDARD tier adds partial points (2-3)", () => {
    const { reasons } = scoreMatch({}, {}, { vendorPoolTier: "STANDARD" });
    const r = reasons.find(r => r.factor === "vendorPool");
    assert.ok(r && r.points > 0 && r.points < 5);
  });

  it("no tier adds 0 vendor pool points", () => {
    const { reasons } = scoreMatch({}, {});
    const r = reasons.find(r => r.factor === "vendorPool");
    assert.ok(!r, "No vendor pool reason expected without tier");
  });
});

// ─────────────────────────────────────────────────────────────
// scoreMatch — max score capped at 100
// ─────────────────────────────────────────────────────────────

describe("scoreMatch — score boundaries", () => {
  it("perfect match never exceeds 100", () => {
    const { score } = scoreMatch(
      {
        role: "Lagerhelfer",
        skill_tags: ["gabelstapler", "lager", "nachtschicht", "montage", "logistik"],
        latitude: 52.52, longitude: 13.405, radius_km: 50,
        start_date: "2026-04-01", end_date: "2026-06-30"
      },
      {
        role: "Lagerhelfer",
        skill_tags: ["gabelstapler", "lager", "nachtschicht", "montage", "logistik"],
        location_lat: 52.52, location_lng: 13.405, radius_km: 50,
        availability_from: "2026-03-01", availability_to: "2026-07-31"
      },
      { supplierVerified: true, vendorPoolTier: "PREFERRED" }
    );
    assert.ok(score <= 100, `Score ${score} exceeds 100`);
  });

  it("zero-info match returns score >= 0", () => {
    const { score } = scoreMatch({}, {});
    assert.ok(score >= 0);
  });

  it("returns a reasons array", () => {
    const { reasons } = scoreMatch(
      { role: "Elektriker" },
      { role: "Elektriker" }
    );
    assert.ok(Array.isArray(reasons));
    assert.ok(reasons.length > 0);
  });

  it("each reason has factor, points, max, detail fields", () => {
    const { reasons } = scoreMatch(
      { role: "Elektriker", skill_tags: ["schaltschrank"] },
      { role: "Elektriker", skill_tags: ["schaltschrank"] }
    );
    for (const r of reasons) {
      assert.ok("factor" in r, "reason missing factor");
      assert.ok("points" in r, "reason missing points");
      assert.ok("max" in r, "reason missing max");
      assert.ok("detail" in r, "reason missing detail");
      assert.ok(r.points <= r.max, `points ${r.points} exceed max ${r.max}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// scoreMatch — custom weights
// ─────────────────────────────────────────────────────────────

describe("scoreMatch — custom weights override", () => {
  it("custom weights are respected", () => {
    const { reasons } = scoreMatch(
      { role: "Lagerhelfer" },
      { role: "Lagerhelfer" },
      { weights: { role: 50 } }
    );
    const r = reasons.find(r => r.factor === "role");
    assert.strictEqual(r.points, 50);
  });
});
