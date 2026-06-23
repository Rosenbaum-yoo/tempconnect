/**
 * Comprehensive behaviour suite for services/matchingEngine.js
 *
 * Covers every exported function (haversineKm, scoreMatch, classifyMatch,
 * matchRequisition, autoMatchRequisition, matchCapacityToRequisitions,
 * findMatches, matchWorkerToAssignments, logMatch) plus the internal
 * reputation helper via matchWorkerToAssignments.
 *
 * Pure scoring functions are asserted directly. DB-driven functions are
 * driven by a substring-routing tracking pool so the whole call graph runs.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as svc from "../services/matchingEngine.js";

/**
 * Substring-routing pool. `routes` is an array of { match, rows } pairs.
 * The first route whose `match` substring appears in the SQL wins.
 * Records every non-tx query as { sql, params } for shape assertions.
 */
function trackingPool(routes = []) {
  const calls = [];
  const TX = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);
  const queryFn = async (sql, params) => {
    if (typeof sql === "string" && TX.has(sql.trim().toUpperCase())) {
      return { rows: [], rowCount: 0 };
    }
    calls.push({ sql, params });
    for (const r of routes) {
      if (sql.includes(r.match)) {
        if (r.error) throw r.error;
        const rows = typeof r.rows === "function" ? r.rows(params) : (r.rows || []);
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} })
  };
}

/* ──────────────────────────────────────────────────────────
 * haversineKm
 * ────────────────────────────────────────────────────────── */
describe("haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    assert.equal(svc.haversineKm(52.52, 13.405, 52.52, 13.405), 0);
  });

  it("computes a known distance (Berlin↔Hamburg ≈ 255 km)", () => {
    const d = svc.haversineKm(52.52, 13.405, 53.5511, 9.9937);
    assert.ok(d > 250 && d < 260, `expected ~255 km, got ${d}`);
  });

  it("is symmetric (A→B == B→A)", () => {
    const ab = svc.haversineKm(48.137, 11.575, 50.110, 8.682);
    const ba = svc.haversineKm(50.110, 8.682, 48.137, 11.575);
    assert.ok(Math.abs(ab - ba) < 1e-9);
  });

  it("coerces string inputs numerically", () => {
    const d = svc.haversineKm("52.52", "13.405", "53.5511", "9.9937");
    assert.ok(d > 250 && d < 260);
  });
});

/* ──────────────────────────────────────────────────────────
 * classifyMatch
 * ────────────────────────────────────────────────────────── */
describe("classifyMatch", () => {
  it("classifies boundaries", () => {
    assert.equal(svc.classifyMatch(80), "excellent");
    assert.equal(svc.classifyMatch(100), "excellent");
    assert.equal(svc.classifyMatch(79), "good");
    assert.equal(svc.classifyMatch(60), "good");
    assert.equal(svc.classifyMatch(59), "fair");
    assert.equal(svc.classifyMatch(40), "fair");
    assert.equal(svc.classifyMatch(39), "weak");
    assert.equal(svc.classifyMatch(0), "weak");
  });
});

/* ──────────────────────────────────────────────────────────
 * scoreMatch
 * ────────────────────────────────────────────────────────── */
describe("scoreMatch", () => {
  it("awards full role weight on exact role match", () => {
    const { score, reasons } = svc.scoreMatch({ role: "Elektriker" }, { role: "elektriker" });
    const role = reasons.find(r => r.factor === "role");
    assert.equal(role.points, 30);
    assert.equal(role.max, 30);
    assert.equal(score, 30);
  });

  it("awards half role weight on partial (substring) role match", () => {
    const { reasons } = svc.scoreMatch({ role: "elektro" }, { role: "elektroniker" });
    const role = reasons.find(r => r.factor === "role");
    assert.equal(role.points, 15);
    assert.match(role.detail, /teilweise/);
  });

  it("awards zero role points on mismatch but still reports the factor", () => {
    const { reasons } = svc.scoreMatch({ role: "koch" }, { role: "fahrer" });
    const role = reasons.find(r => r.factor === "role");
    assert.equal(role.points, 0);
    assert.match(role.detail, /nicht passend/);
  });

  it("omits role factor entirely when one side is empty", () => {
    const { reasons } = svc.scoreMatch({ role: "" }, { role: "koch" });
    assert.equal(reasons.find(r => r.factor === "role"), undefined);
  });

  it("scores skill overlap proportionally and counts overlap", () => {
    const { reasons } = svc.scoreMatch(
      { skill_tags: ["a", "b", "c", "d"] },
      { skill_tags: ["a", "B", "x"] }
    );
    const skills = reasons.find(r => r.factor === "skills");
    // overlap = a,b = 2; maxTags = min(5,4)=4 → round(2/4*25)=13 (12.5 rounds to 13)
    assert.equal(skills.points, 13);
    assert.match(skills.detail, /2\/4 Skills/);
  });

  it("caps skill points at the skills weight on full overlap", () => {
    const { reasons } = svc.scoreMatch(
      { skill_tags: ["a", "b"] },
      { skill_tags: ["a", "b"] }
    );
    const skills = reasons.find(r => r.factor === "skills");
    assert.equal(skills.points, 25);
  });

  it("scores location by distance within radius", () => {
    const { reasons } = svc.scoreMatch(
      { latitude: 52.52, longitude: 13.405, radius_km: 1000 },
      { location_lat: 52.52, location_lng: 13.405 }
    );
    const loc = reasons.find(r => r.factor === "location");
    assert.equal(loc.points, 25); // dist 0 → full weight
    assert.match(loc.detail, /0 km Entfernung/);
  });

  it("gives zero location points when beyond radius", () => {
    const { reasons } = svc.scoreMatch(
      { latitude: 52.52, longitude: 13.405, radius_km: 10 },
      { location_lat: 53.5511, location_lng: 9.9937, radius_km: 10 }
    );
    const loc = reasons.find(r => r.factor === "location");
    assert.equal(loc.points, 0);
    assert.match(loc.detail, /Zu weit/);
  });

  it("falls back to city match when coordinates absent", () => {
    const { reasons } = svc.scoreMatch(
      { location_city: "Berlin" },
      { location_city: "berlin" }
    );
    const loc = reasons.find(r => r.factor === "location");
    assert.equal(loc.points, Math.round(25 * 0.6)); // 15
    assert.match(loc.detail, /Stadt/);
  });

  it("scores availability overlap as full weight", () => {
    const { reasons } = svc.scoreMatch(
      { start_date: "2026-01-10", end_date: "2026-01-20" },
      { availability_from: "2026-01-05", availability_to: "2026-01-25" }
    );
    const av = reasons.find(r => r.factor === "availability");
    assert.equal(av.points, 10);
  });

  it("scores availability zero when periods disjoint", () => {
    const { reasons } = svc.scoreMatch(
      { start_date: "2026-03-10", end_date: "2026-03-20" },
      { availability_from: "2026-01-05", availability_to: "2026-01-25" }
    );
    const av = reasons.find(r => r.factor === "availability");
    assert.equal(av.points, 0);
    assert.match(av.detail, /passt nicht/);
  });

  it("adds verified bonus when supplierVerified", () => {
    const { reasons } = svc.scoreMatch({}, {}, { supplierVerified: true });
    assert.ok(reasons.find(r => r.factor === "verified" && r.points === 5));
  });

  it("gives full vendorPool bonus for PREFERRED and half for others", () => {
    const pref = svc.scoreMatch({}, {}, { vendorPoolTier: "PREFERRED" });
    const std = svc.scoreMatch({}, {}, { vendorPoolTier: "STANDARD" });
    assert.equal(pref.reasons.find(r => r.factor === "vendorPool").points, 5);
    assert.equal(std.reasons.find(r => r.factor === "vendorPool").points, 3); // round(5*0.5)=3
  });

  it("scales compliance bonus and caps at 7", () => {
    const half = svc.scoreMatch({}, {}, { complianceScore: 50 });
    const full = svc.scoreMatch({}, {}, { complianceScore: 100 });
    assert.equal(half.reasons.find(r => r.factor === "compliance").points, 4); // round(3.5)=4
    assert.equal(full.reasons.find(r => r.factor === "compliance").points, 7);
  });

  it("ignores compliance when zero/absent", () => {
    const { reasons } = svc.scoreMatch({}, {}, { complianceScore: 0 });
    assert.equal(reasons.find(r => r.factor === "compliance"), undefined);
  });

  it("handles rateCompatible true / false branches distinctly", () => {
    const ok = svc.scoreMatch({}, {}, { rateCompatible: true });
    const bad = svc.scoreMatch({}, {}, { rateCompatible: false });
    assert.equal(ok.reasons.find(r => r.factor === "rate").points, 5);
    assert.equal(bad.reasons.find(r => r.factor === "rate").points, 0);
  });

  it("adds urgency boost", () => {
    const { reasons } = svc.scoreMatch({}, {}, { urgencyBoost: true });
    assert.ok(reasons.find(r => r.factor === "urgency" && r.points === 5));
  });

  it("handles workerCountMatch true / false branches", () => {
    const ok = svc.scoreMatch({}, {}, { workerCountMatch: true });
    const bad = svc.scoreMatch({}, {}, { workerCountMatch: false });
    assert.equal(ok.reasons.find(r => r.factor === "workerCount").points, 3);
    assert.equal(bad.reasons.find(r => r.factor === "workerCount").points, 0);
  });

  it("scales reputation bonus and caps at 8", () => {
    const { reasons } = svc.scoreMatch({}, {}, { reputationScore: 100 });
    assert.equal(reasons.find(r => r.factor === "reputation").points, 8);
  });

  it("adds preferredFirst boost only when tier is PREFERRED", () => {
    const on = svc.scoreMatch({}, {}, { preferredFirst: true, vendorPoolTier: "PREFERRED" });
    const off = svc.scoreMatch({}, {}, { preferredFirst: true, vendorPoolTier: "STANDARD" });
    assert.equal(on.reasons.find(r => r.factor === "preferredFirst").points, svc.PREFERRED_FIRST_BOOST);
    assert.equal(off.reasons.find(r => r.factor === "preferredFirst"), undefined);
  });

  it("derives smartRank label from score when none supplied", () => {
    const exc = svc.scoreMatch({}, {}, { smartRankScore: 90 });
    const sol = svc.scoreMatch({}, {}, { smartRankScore: 55 });
    const lbl = svc.scoreMatch({}, {}, { smartRankScore: 90, smartRankLabel: "TopPick" });
    assert.match(exc.reasons.find(r => r.factor === "smartRank").detail, /Exzellent/);
    assert.match(sol.reasons.find(r => r.factor === "smartRank").detail, /Solide/);
    assert.match(lbl.reasons.find(r => r.factor === "smartRank").detail, /TopPick/);
  });

  it("caps total score at 100 when many bonuses stack", () => {
    const { score } = svc.scoreMatch(
      { role: "x", skill_tags: ["a"], latitude: 1, longitude: 1, radius_km: 1000, start_date: "2026-01-01" },
      { role: "x", skill_tags: ["a"], location_lat: 1, location_lng: 1, availability_from: "2026-01-01" },
      {
        supplierVerified: true, vendorPoolTier: "PREFERRED", complianceScore: 100,
        rateCompatible: true, urgencyBoost: true, workerCountMatch: true,
        reputationScore: 100, preferredFirst: true, smartRankScore: 100
      }
    );
    assert.equal(score, 100);
  });

  it("respects custom weights override", () => {
    const { reasons } = svc.scoreMatch({ role: "x" }, { role: "x" }, { weights: { role: 50 } });
    assert.equal(reasons.find(r => r.factor === "role").points, 50);
  });
});

/* ──────────────────────────────────────────────────────────
 * matchRequisition
 * ────────────────────────────────────────────────────────── */
describe("matchRequisition", () => {
  it("queries only active capacity posts", async () => {
    const pool = trackingPool([{ match: "capacity_posts", rows: [] }]);
    await svc.matchRequisition(pool, { role: "x" });
    assert.match(pool.calls[0].sql, /is_active = TRUE/);
  });

  it("filters out matches below minScore and sorts descending", async () => {
    const caps = [
      { id: "low", supplier_company_id: "s1", role: "fahrer" },          // no role match → score 0 filtered
      { id: "hi", supplier_company_id: "s2", role: "koch" }              // exact → 30
    ];
    const pool = trackingPool([{ match: "capacity_posts", rows: caps }]);
    const res = await svc.matchRequisition(pool, { role: "koch" }, { minScore: 1 });
    assert.equal(res.length, 1);
    assert.equal(res[0].capacity_post.id, "hi");
    assert.equal(res[0].score, 30);
  });

  it("applies verified + vendor-pool opts per supplier", async () => {
    const caps = [{ id: "c1", supplier_company_id: "s1", role: "koch" }];
    const pool = trackingPool([{ match: "capacity_posts", rows: caps }]);
    const res = await svc.matchRequisition(pool, { role: "koch" }, {
      verifiedSupplierIds: new Set(["s1"]),
      vendorPoolMap: new Map([["s1", "PREFERRED"]])
    });
    assert.ok(res[0].reasons.find(r => r.factor === "verified"));
    assert.ok(res[0].reasons.find(r => r.factor === "vendorPool" && r.points === 5));
  });

  it("honours topN limit", async () => {
    const caps = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, supplier_company_id: "s", role: "koch" }));
    const pool = trackingPool([{ match: "capacity_posts", rows: caps }]);
    const res = await svc.matchRequisition(pool, { role: "koch" }, { topN: 2 });
    assert.equal(res.length, 2);
  });

  it("returns empty array when no capacity posts", async () => {
    const pool = trackingPool([{ match: "capacity_posts", rows: [] }]);
    const res = await svc.matchRequisition(pool, { role: "koch" });
    assert.deepEqual(res, []);
  });
});

/* ──────────────────────────────────────────────────────────
 * autoMatchRequisition
 * ────────────────────────────────────────────────────────── */
describe("autoMatchRequisition", () => {
  it("upserts a candidate row per match with score + serialised reasons", async () => {
    const caps = [{ id: "cap1", supplier_company_id: "s1", role: "koch" }];
    const pool = trackingPool([
      { match: "capacity_posts", rows: caps },
      { match: "requisition_candidates", rows: [] }
    ]);
    const res = await svc.autoMatchRequisition(pool, "req-7", { role: "koch" });
    assert.equal(res.candidateCount, 1);
    assert.equal(res.matchCount, 1);
    const insert = pool.calls.find(c => c.sql.includes("requisition_candidates"));
    assert.match(insert.sql, /ON CONFLICT/);
    assert.equal(insert.params[0], "req-7");
    assert.equal(insert.params[1], "cap1");
    assert.equal(insert.params[2], 30);
    // reasons serialised as JSON string
    assert.equal(typeof insert.params[3], "string");
    assert.ok(JSON.parse(insert.params[3]).some(r => r.factor === "role"));
  });

  it("inserts nothing when there are no matches", async () => {
    const pool = trackingPool([{ match: "capacity_posts", rows: [] }]);
    const res = await svc.autoMatchRequisition(pool, "req-x", { role: "koch" });
    assert.equal(res.candidateCount, 0);
    assert.equal(pool.calls.filter(c => c.sql.includes("requisition_candidates")).length, 0);
  });
});

/* ──────────────────────────────────────────────────────────
 * matchCapacityToRequisitions (reverse matching)
 * ────────────────────────────────────────────────────────── */
describe("matchCapacityToRequisitions", () => {
  it("returns [] when capacity post not found", async () => {
    const pool = trackingPool([{ match: "FROM capacity_posts WHERE id", rows: [] }]);
    const res = await svc.matchCapacityToRequisitions(pool, "missing");
    assert.deepEqual(res, []);
    // should not have queried requisitions after early return
    assert.equal(pool.calls.length, 1);
  });

  it("scores both requisitions and demand_requests and tags type", async () => {
    const pool = trackingPool([
      { match: "FROM capacity_posts WHERE id", rows: [{ id: "cap", role: "koch" }] },
      { match: "FROM requisitions WHERE status IN", rows: [{ id: "r1", role: "koch" }] },
      { match: "FROM demand_requests WHERE status = 'open'", rows: [{ id: "d1", role: "koch" }] }
    ]);
    const res = await svc.matchCapacityToRequisitions(pool, "cap");
    const types = res.map(r => r.type).sort();
    assert.deepEqual(types, ["demand_request", "requisition"]);
    assert.ok(res.every(r => r.score >= 30));
  });

  it("drops entries below minScore", async () => {
    const pool = trackingPool([
      { match: "FROM capacity_posts WHERE id", rows: [{ id: "cap", role: "koch" }] },
      { match: "FROM requisitions WHERE status IN", rows: [{ id: "r1", role: "fahrer" }] },
      { match: "FROM demand_requests WHERE status = 'open'", rows: [] }
    ]);
    const res = await svc.matchCapacityToRequisitions(pool, "cap", { minScore: 1 });
    assert.deepEqual(res, []);
  });
});

/* ──────────────────────────────────────────────────────────
 * findMatches
 * ────────────────────────────────────────────────────────── */
describe("findMatches", () => {
  it("returns [] when demand_request not found", async () => {
    const pool = trackingPool([{ match: "FROM demand_requests WHERE id", rows: [] }]);
    const res = await svc.findMatches(pool, "nope");
    assert.deepEqual(res, []);
  });

  it("maps demand_request columns and delegates to matchRequisition", async () => {
    const pool = trackingPool([
      { match: "FROM demand_requests WHERE id", rows: [{ id: "d1", role: "koch", location_lat: 52.52, location_lng: 13.405 }] },
      { match: "capacity_posts WHERE is_active", rows: [{ id: "cap", supplier_company_id: "s", role: "koch", location_lat: 52.52, location_lng: 13.405, radius_km: 100 }] }
    ]);
    const res = await svc.findMatches(pool, "d1");
    assert.equal(res.length, 1);
    assert.equal(res[0].capacity_post.id, "cap");
    // role(30) + location full(25) since dist 0 → score >= 55
    assert.ok(res[0].score >= 55);
  });
});

/* ──────────────────────────────────────────────────────────
 * matchWorkerToAssignments (+ getReputationScore)
 * ────────────────────────────────────────────────────────── */
describe("matchWorkerToAssignments", () => {
  it("returns [] when worker not found", async () => {
    const pool = trackingPool([{ match: "FROM workers WHERE id", rows: [] }]);
    const res = await svc.matchWorkerToAssignments(pool, "ghost");
    assert.deepEqual(res, []);
  });

  it("scores worker against demands+requisitions and adds reputation bonus", async () => {
    const pool = trackingPool([
      { match: "FROM workers WHERE id", rows: [{ id: "w1", role: "koch", org_id: "o1" }] },
      { match: "FROM supplier_reputation", rows: [{ overall_score: 8 }] }, // repBonus = round(8/2)=4
      { match: "FROM demand_requests WHERE status = 'open'", rows: [{ id: "d1", role: "koch" }] },
      { match: "FROM requisitions WHERE status IN", rows: [{ id: "r1", role: "koch" }] }
    ]);
    const res = await svc.matchWorkerToAssignments(pool, "w1");
    assert.equal(res.length, 2);
    // each should carry the reputation reason and score = 30(role) + 4(rep) = 34
    for (const m of res) {
      const rep = m.reasons.find(r => r.factor === "reputation");
      assert.equal(rep.points, 4);
      assert.equal(m.score, 34);
    }
  });

  it("skips reputation reason when score is zero (no org / not found)", async () => {
    const pool = trackingPool([
      { match: "FROM workers WHERE id", rows: [{ id: "w1", role: "koch" }] }, // no org_id
      { match: "FROM supplier_reputation", rows: [] },
      { match: "FROM demand_requests WHERE status = 'open'", rows: [{ id: "d1", role: "koch" }] },
      { match: "FROM requisitions WHERE status IN", rows: [] }
    ]);
    const res = await svc.matchWorkerToAssignments(pool, "w1");
    assert.equal(res.length, 1);
    assert.equal(res[0].reasons.find(r => r.factor === "reputation"), undefined);
    assert.equal(res[0].score, 30);
  });

  it("swallows reputation query errors and proceeds with bonus 0", async () => {
    const pool = trackingPool([
      { match: "FROM workers WHERE id", rows: [{ id: "w1", role: "koch", org_id: "o1" }] },
      { match: "FROM supplier_reputation", error: new Error("db down") },
      { match: "FROM demand_requests WHERE status = 'open'", rows: [{ id: "d1", role: "koch" }] },
      { match: "FROM requisitions WHERE status IN", rows: [] }
    ]);
    const res = await svc.matchWorkerToAssignments(pool, "w1");
    assert.equal(res.length, 1);
    assert.equal(res[0].score, 30); // no reputation bonus
  });

  it("honours topN and minScore", async () => {
    const demands = Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, role: "koch" }));
    const pool = trackingPool([
      { match: "FROM workers WHERE id", rows: [{ id: "w1", role: "koch" }] },
      { match: "FROM supplier_reputation", rows: [] },
      { match: "FROM demand_requests WHERE status = 'open'", rows: demands },
      { match: "FROM requisitions WHERE status IN", rows: [] }
    ]);
    const res = await svc.matchWorkerToAssignments(pool, "w1", { topN: 2 });
    assert.equal(res.length, 2);
  });
});

/* ──────────────────────────────────────────────────────────
 * logMatch
 * ────────────────────────────────────────────────────────── */
describe("logMatch", () => {
  it("inserts into match_logs with defaults applied", async () => {
    const pool = trackingPool([{ match: "match_logs", rows: [] }]);
    await svc.logMatch(pool, { source_id: "s", target_id: "t", score: 42, reasons: [{ factor: "role" }] });
    const call = pool.calls.find(c => c.sql.includes("match_logs"));
    assert.ok(call);
    assert.equal(call.params[0], "demand_capacity"); // default match_type
    assert.equal(call.params[1], "s");
    assert.equal(call.params[2], "t");
    assert.equal(call.params[3], 42);
    assert.equal(typeof call.params[4], "string"); // reasons JSON
    assert.deepEqual(JSON.parse(call.params[4]), [{ factor: "role" }]);
    assert.equal(call.params[5], "suggested"); // default outcome
    assert.equal(call.params[6], null); // default org_id
  });

  it("uses provided match_type / outcome / org_id / score default", async () => {
    const pool = trackingPool([{ match: "match_logs", rows: [] }]);
    await svc.logMatch(pool, { source_id: "s", target_id: "t", match_type: "worker_demand", outcome: "hired", org_id: "o9" });
    const call = pool.calls.find(c => c.sql.includes("match_logs"));
    assert.equal(call.params[0], "worker_demand");
    assert.equal(call.params[3], 0); // score default
    assert.equal(call.params[5], "hired");
    assert.equal(call.params[6], "o9");
  });

  it("never throws even if the insert fails (non-critical)", async () => {
    const pool = trackingPool([{ match: "match_logs", error: new Error("boom") }]);
    await assert.doesNotReject(() => svc.logMatch(pool, { source_id: "s", target_id: "t" }));
  });
});
