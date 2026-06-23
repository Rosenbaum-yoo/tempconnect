/**
 * Marketplace Service — COMPLEMENTARY coverage suite.
 *
 * Targets the surface NOT exercised by marketplaceService.test.js:
 *   - capacity_posts CRUD: createCapacityPost (incl. extras UPDATE + fail-soft),
 *     listCapacityPosts (filters), getCapacityPostById (scoped / unscoped)
 *   - demand reads: getDemandById, listDemandRequests (filters),
 *     getDemandCommercialStates (empty / dedupe / mapping),
 *     getDemandCommercialState (missing → EMPTY)
 *   - SLA events: writeDemandSlaEvent, recordDemandSlaStarted, getDemandSlaEvents
 *   - matching: runInitialMatching (scoring, top-25 cap, zero-score skip),
 *     getDemandMatches
 *   - offers: createOffer, listOffersForDemand, getOfferById (forUpdate),
 *     computeOfferNextAction (pure VM), OFFER_VIEWER_LABELS
 *
 * Asserts BEHAVIOR: return values, SQL shape, bound params, ordering, branches.
 * No DB — mock/tracking pools only.
 *
 * Run: node --test --test-force-exit test/marketplaceService.coverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createCapacityPost, listCapacityPosts, getCapacityPostById,
  getDemandById, listDemandRequests,
  getDemandCommercialStates, getDemandCommercialState,
  writeDemandSlaEvent, recordDemandSlaStarted, getDemandSlaEvents,
  runInitialMatching, getDemandMatches,
  createOffer, listOffersForDemand, getOfferById,
  computeOfferNextAction, OFFER_VIEWER_LABELS
} from "../services/marketplaceService.js";

const UUID = "00000000-0000-4000-8000-000000000001";
const UUID2 = "00000000-0000-4000-8000-000000000002";

/**
 * Tracking pool: records every query and dispatches to a handler that
 * matches on SQL substrings. Returns {rows:[],rowCount:0} by default.
 */
function trackingPool(handler) {
  const calls = [];
  const query = async (sql, params) => {
    const s = String(sql);
    calls.push({ sql: s, params: params || [] });
    const out = handler ? handler(s, params || [], calls) : undefined;
    return out === undefined ? { rows: [], rowCount: 0 } : out;
  };
  const pool = {
    calls,
    query,
    connect: async () => ({ query, release() {} })
  };
  return pool;
}

// ═══════════════════════════════════════════════════════════════
// createCapacityPost
// ═══════════════════════════════════════════════════════════════

describe("createCapacityPost", () => {
  it("inserts with defaults and applies extras UPDATE when extra fields present", async () => {
    const row = { id: "cap-1", title: "Pflege" };
    const pool = trackingPool((sql) => {
      if (sql.includes("INSERT INTO capacity_posts")) return { rows: [row], rowCount: 1 };
      if (sql.includes("UPDATE capacity_posts SET")) return { rows: [], rowCount: 1 };
      return undefined;
    });

    const result = await createCapacityPost(pool, "supplier-1", {
      title: "Pflege",
      role: "Pflegekraft",
      shift_model: "3-Schicht",
      employment_type: "Vollzeit",
      qualifications: "examiniert",
      certifications: "G42",
      description: "Langtext"
    });

    assert.deepStrictEqual(result, row);
    // INSERT params: supplierId first, defaults applied (headcount→1, radius_km→25)
    const insert = pool.calls.find((c) => c.sql.includes("INSERT INTO capacity_posts"));
    assert.strictEqual(insert.params[0], "supplier-1");
    assert.strictEqual(insert.params[1], "Pflege");      // title
    assert.strictEqual(insert.params[4], 1);              // headcount default
    assert.strictEqual(insert.params[11], 25);            // radius_km default
    assert.strictEqual(insert.params[15], false);         // is_search_agent default
    // extras UPDATE ran with row.id first param + all 5 mapped columns
    const upd = pool.calls.find((c) => c.sql.includes("UPDATE capacity_posts SET"));
    assert.ok(upd, "expected extras UPDATE");
    assert.match(upd.sql, /shift_model = \$2/);
    assert.match(upd.sql, /employment_type = \$3/);
    assert.match(upd.sql, /qualification_summary = \$4/);
    assert.match(upd.sql, /certifications_summary = \$5/);
    assert.match(upd.sql, /description = \$6/);
    assert.deepStrictEqual(upd.params, ["cap-1", "3-Schicht", "Vollzeit", "examiniert", "G42", "Langtext"]);
  });

  it("skips extras UPDATE entirely when no optional fields supplied", async () => {
    const row = { id: "cap-2" };
    const pool = trackingPool((sql) => {
      if (sql.includes("INSERT INTO capacity_posts")) return { rows: [row], rowCount: 1 };
      return undefined;
    });
    await createCapacityPost(pool, "supplier-1", { title: "x", availability_from: "2026-01-01" });
    assert.ok(!pool.calls.some((c) => c.sql.includes("UPDATE capacity_posts SET")),
      "no extras → no UPDATE");
    assert.strictEqual(pool.calls.length, 1);
  });

  it("fail-soft: still returns row when extras UPDATE throws (column missing)", async () => {
    const row = { id: "cap-3", title: "t" };
    const pool = trackingPool((sql) => {
      if (sql.includes("INSERT INTO capacity_posts")) return { rows: [row], rowCount: 1 };
      if (sql.includes("UPDATE capacity_posts SET")) throw new Error('column "shift_model" does not exist');
      return undefined;
    });
    const result = await createCapacityPost(pool, "s", { shift_model: "früh" });
    assert.deepStrictEqual(result, row, "swallows UPDATE error, returns insert row");
  });
});

// ═══════════════════════════════════════════════════════════════
// listCapacityPosts
// ═══════════════════════════════════════════════════════════════

describe("listCapacityPosts", () => {
  it("base query filters active + remaining headcount > 0 and applies default limit 100", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM capacity_posts")) return { rows: [{ id: "c1" }], rowCount: 1 };
      return undefined;
    });
    const rows = await listCapacityPosts(pool);
    assert.deepStrictEqual(rows, [{ id: "c1" }]);
    const q = pool.calls[0];
    assert.match(q.sql, /WHERE cp\.status = 'active'/);
    assert.match(q.sql, /remaining_headcount|committed_headcount/);
    assert.match(q.sql, /ORDER BY cp\.updated_at DESC/);
    assert.strictEqual(q.params[q.params.length - 1], 100); // limit
  });

  it("applies supplier/city/role filters in order with explicit limit", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM capacity_posts")) return { rows: [], rowCount: 0 };
      return undefined;
    });
    await listCapacityPosts(pool, {
      supplier_company_id: "sup-1",
      location_city: "Hamburg",
      role: "Pflege",
      limit: 5
    });
    const q = pool.calls[0];
    assert.match(q.sql, /cp\.supplier_company_id = \$1/);
    assert.match(q.sql, /LOWER\(cp\.location_city\) = LOWER\(\$2\)/);
    assert.match(q.sql, /LOWER\(cp\.role\) LIKE LOWER\(\$3\)/);
    // params: supplier, city, role(wrapped %..%), limit
    assert.deepStrictEqual(q.params, ["sup-1", "Hamburg", "%Pflege%", 5]);
  });
});

// ═══════════════════════════════════════════════════════════════
// getCapacityPostById
// ═══════════════════════════════════════════════════════════════

describe("getCapacityPostById", () => {
  it("returns the row when found (unscoped, single param)", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM capacity_posts")) return { rows: [{ id: "c1" }], rowCount: 1 };
      return undefined;
    });
    const row = await getCapacityPostById(pool, "c1");
    assert.deepStrictEqual(row, { id: "c1" });
    assert.deepStrictEqual(pool.calls[0].params, ["c1"]);
    assert.ok(!pool.calls[0].sql.includes("supplier_company_id = $2"));
  });

  it("adds supplier ownership scope when supplierId provided", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "c1" }], rowCount: 1 }));
    await getCapacityPostById(pool, "c1", "sup-9");
    assert.match(pool.calls[0].sql, /AND cp\.supplier_company_id = \$2/);
    assert.deepStrictEqual(pool.calls[0].params, ["c1", "sup-9"]);
  });

  it("returns null when not found", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    const row = await getCapacityPostById(pool, "missing");
    assert.strictEqual(row, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// getDemandById
// ═══════════════════════════════════════════════════════════════

describe("getDemandById", () => {
  it("returns row with is_capacity_origin projection", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM demand_requests dr")) {
        return { rows: [{ id: UUID, is_capacity_origin: false }], rowCount: 1 };
      }
      return undefined;
    });
    const row = await getDemandById(pool, UUID);
    assert.strictEqual(row.id, UUID);
    assert.match(pool.calls[0].sql, /is_capacity_origin/);
    assert.deepStrictEqual(pool.calls[0].params, [UUID]);
  });

  it("returns null when demand not found", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    assert.strictEqual(await getDemandById(pool, "x"), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// listDemandRequests
// ═══════════════════════════════════════════════════════════════

describe("listDemandRequests", () => {
  it("no opts → only default limit param, ordered by created_at DESC", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM demand_requests dr")) return { rows: [{ id: "d1" }], rowCount: 1 };
      return undefined;
    });
    const rows = await listDemandRequests(pool);
    assert.deepStrictEqual(rows, [{ id: "d1" }]);
    assert.match(pool.calls[0].sql, /ORDER BY dr\.created_at DESC/);
    assert.deepStrictEqual(pool.calls[0].params, [100]);
  });

  it("requester + status filters bind params in order", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    await listDemandRequests(pool, { requester_company_id: "req-1", status: "open", limit: 10 });
    const q = pool.calls[0];
    assert.match(q.sql, /dr\.requester_company_id = \$1/);
    assert.match(q.sql, /dr\.status = \$2/);
    assert.deepStrictEqual(q.params, ["req-1", "open", 10]);
  });

  it("commercially_open_only adds remaining-open guard clause", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    await listDemandRequests(pool, { commercially_open_only: true });
    assert.match(pool.calls[0].sql, /dr\.status IN \('open','partially_covered'\)/);
    assert.match(pool.calls[0].sql, /remaining_open_count/);
  });

  it("exclude_capacity_origin adds NOT EXISTS subquery", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    await listDemandRequests(pool, { exclude_capacity_origin: true });
    assert.match(pool.calls[0].sql, /NOT EXISTS/);
    assert.match(pool.calls[0].sql, /o_origin\.capacity_post_id IS NOT NULL/);
  });
});

// ═══════════════════════════════════════════════════════════════
// getDemandCommercialStates  (batch aggregate)
// ═══════════════════════════════════════════════════════════════

describe("getDemandCommercialStates", () => {
  it("returns empty Map without querying when no ids", async () => {
    let queried = false;
    const pool = trackingPool(() => { queried = true; return { rows: [], rowCount: 0 }; });
    const map = await getDemandCommercialStates(pool, []);
    assert.ok(map instanceof Map);
    assert.strictEqual(map.size, 0);
    assert.strictEqual(queried, false);
  });

  it("deduplicates ids and filters falsy before passing as ANY($1) array", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("dr.id AS demand_request_id")) return { rows: [], rowCount: 0 };
      return undefined;
    });
    await getDemandCommercialStates(pool, [UUID, UUID, null, "", UUID2, undefined]);
    assert.match(pool.calls[0].sql, /WHERE dr\.id = ANY\(\$1\)/);
    assert.deepStrictEqual(pool.calls[0].params[0], [UUID, UUID2]);
  });

  it("maps rows into normalized state objects keyed by demand_request_id", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("dr.id AS demand_request_id")) {
        return {
          rows: [{
            demand_request_id: UUID,
            required_total_count: 4,
            committed_headcount: 2,
            active_offer_count: 1,
            is_capacity_origin: true
          }],
          rowCount: 1
        };
      }
      return undefined;
    });
    const map = await getDemandCommercialStates(pool, [UUID]);
    assert.strictEqual(map.size, 1);
    assert.deepStrictEqual(map.get(UUID), {
      required_total_count: 4,
      committed_headcount: 2,
      active_offer_count: 1,
      is_capacity_origin: true
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// getDemandCommercialState  (single, derived view-model)
// ═══════════════════════════════════════════════════════════════

describe("getDemandCommercialState", () => {
  it("returns EMPTY frozen state when demand row not found", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM demand_requests")) return { rows: [], rowCount: 0 };
      return undefined;
    });
    const state = await getDemandCommercialState(pool, "missing");
    assert.strictEqual(state.commercial_status, "open");
    assert.strictEqual(state.required_total_count, 1);
    assert.strictEqual(state.committed_headcount, 0);
    assert.strictEqual(state.is_fully_covered, false);
    // only the existence-check query ran (no aggregate query for missing demand)
    assert.strictEqual(pool.calls.length, 1);
  });

  it("derives partially_covered state from aggregate", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("SELECT id, headcount, required_total_count")) {
        return { rows: [{ id: UUID, headcount: 4, required_total_count: 4, currently_committed_count: 0, remaining_open_count: 4 }], rowCount: 1 };
      }
      if (sql.includes("dr.id AS demand_request_id")) {
        return { rows: [{ demand_request_id: UUID, required_total_count: 4, committed_headcount: 2, active_offer_count: 1, is_capacity_origin: false }], rowCount: 1 };
      }
      return undefined;
    });
    const state = await getDemandCommercialState(pool, UUID);
    assert.strictEqual(state.required_total_count, 4);
    assert.strictEqual(state.committed_headcount, 2);
    assert.strictEqual(state.remaining_open_count, 2);
    assert.strictEqual(state.is_partially_covered, true);
    assert.strictEqual(state.is_fully_covered, false);
    assert.strictEqual(state.commercial_status, "partially_covered");
    assert.strictEqual(state.commercial_visibility, "public");
  });

  it("fully covered demand → fulfilled status", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("SELECT id, headcount, required_total_count")) {
        return { rows: [{ id: UUID, headcount: 2, required_total_count: 2, currently_committed_count: 0, remaining_open_count: 2 }], rowCount: 1 };
      }
      if (sql.includes("dr.id AS demand_request_id")) {
        return { rows: [{ demand_request_id: UUID, required_total_count: 2, committed_headcount: 2, active_offer_count: 1, is_capacity_origin: true }], rowCount: 1 };
      }
      return undefined;
    });
    const state = await getDemandCommercialState(pool, UUID);
    assert.strictEqual(state.is_fully_covered, true);
    assert.strictEqual(state.remaining_open_count, 0);
    assert.strictEqual(state.commercial_status, "fulfilled");
    assert.strictEqual(state.commercial_visibility, "counterparty_only"); // is_capacity_origin
  });
});

// ═══════════════════════════════════════════════════════════════
// SLA events: writeDemandSlaEvent / recordDemandSlaStarted / getDemandSlaEvents
// ═══════════════════════════════════════════════════════════════

describe("writeDemandSlaEvent", () => {
  it("stringifies object payloads as JSON", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 1 }));
    await writeDemandSlaEvent(pool, UUID, "SLA_STARTED", { at: "2026-01-01" });
    const q = pool.calls[0];
    assert.match(q.sql, /INSERT INTO demand_sla_events/);
    assert.strictEqual(q.params[0], UUID);
    assert.strictEqual(q.params[1], "SLA_STARTED");
    assert.strictEqual(q.params[2], JSON.stringify({ at: "2026-01-01" }));
  });

  it("passes non-object payload through unchanged", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 1 }));
    await writeDemandSlaEvent(pool, UUID, "X", "raw-string");
    assert.strictEqual(pool.calls[0].params[2], "raw-string");
  });

  it("defaults payload to empty-object JSON when omitted", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 1 }));
    await writeDemandSlaEvent(pool, UUID, "X");
    assert.strictEqual(pool.calls[0].params[2], "{}");
  });
});

describe("recordDemandSlaStarted", () => {
  it("writes a SLA_STARTED event carrying an ISO timestamp", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 1 }));
    await recordDemandSlaStarted(pool, UUID);
    const q = pool.calls[0];
    assert.strictEqual(q.params[1], "SLA_STARTED");
    const payload = JSON.parse(q.params[2]);
    assert.ok(!Number.isNaN(Date.parse(payload.at)), "payload.at is an ISO date");
  });
});

describe("getDemandSlaEvents", () => {
  it("returns ordered events for the demand", async () => {
    const events = [{ id: 1, event_type: "SLA_STARTED" }, { id: 2, event_type: "SLA_MET" }];
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM demand_sla_events")) return { rows: events, rowCount: 2 };
      return undefined;
    });
    const rows = await getDemandSlaEvents(pool, UUID);
    assert.deepStrictEqual(rows, events);
    assert.match(pool.calls[0].sql, /ORDER BY created_at ASC/);
    assert.deepStrictEqual(pool.calls[0].params, [UUID]);
  });
});

// ═══════════════════════════════════════════════════════════════
// runInitialMatching — deterministic scoring + persistence
// ═══════════════════════════════════════════════════════════════

describe("runInitialMatching", () => {
  const demand = {
    id: UUID,
    role: "Pflegekraft",
    skill_tags: ["intensiv", "beatmung"],
    start_date: "2026-04-01",
    end_date: "2026-04-30",
    location_lat: 53.55,
    location_lng: 9.99,
    radius_km: 25
  };

  it("scores candidates, persists matches via upsert, returns counts", async () => {
    const cap = {
      id: "cap-1",
      supplier_company_id: "sup-1",
      role: "Pflegekraft",                 // +30
      skill_tags: ["intensiv", "beatmung"], // +5 +5
      availability_from: "2026-03-01",
      availability_to: "2026-05-01",        // overlap +20
      location_lat: 53.56,                  // ~1km → +25 (25 - floor(0/10))
      location_lng: 9.99,
      radius_km: 25
    };
    const inserts = [];
    const pool = trackingPool((sql, params) => {
      if (sql.includes("FROM capacity_posts cp")) return { rows: [cap], rowCount: 1 };
      if (sql.includes("INSERT INTO matches")) { inserts.push(params); return { rows: [], rowCount: 1 }; }
      return undefined;
    });

    const result = await runInitialMatching(pool, demand, new Set(["sup-1"])); // verified +10
    assert.strictEqual(result.candidateCount, 1);
    assert.strictEqual(result.matchCount, 1);
    assert.strictEqual(result.matches.length, 1);
    // 30 + 10(skills) + 20(avail) + 25(distance) + 10(verified) = 95
    assert.strictEqual(result.matches[0].score, 95);
    // persisted via ON CONFLICT upsert with demand id + cap id + score
    assert.strictEqual(inserts.length, 1);
    assert.strictEqual(inserts[0][0], UUID);
    assert.strictEqual(inserts[0][1], "cap-1");
    assert.strictEqual(inserts[0][2], 95);
    const insertSql = pool.calls.find((c) => c.sql.includes("INSERT INTO matches")).sql;
    assert.match(insertSql, /ON CONFLICT \(demand_request_id, capacity_post_id\)/);
  });

  it("skips zero-score candidates (no insert) but counts them as candidates", async () => {
    const mismatch = {
      id: "cap-x",
      supplier_company_id: "sup-x",
      role: "Bürokraft",                    // no role match
      skill_tags: ["excel"],                // no skill overlap
      availability_from: "2027-01-01",      // no availability overlap (after demand window)
      availability_to: "2027-02-01",
      location_lat: 48.13,                  // Munich — far, outside radius
      location_lng: 11.58,
      radius_km: 25
    };
    let insertCalled = false;
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM capacity_posts cp")) return { rows: [mismatch], rowCount: 1 };
      if (sql.includes("INSERT INTO matches")) { insertCalled = true; return { rows: [], rowCount: 1 }; }
      return undefined;
    });
    const result = await runInitialMatching(pool, demand, new Set());
    assert.strictEqual(result.candidateCount, 1);
    assert.strictEqual(result.matchCount, 0);
    assert.strictEqual(insertCalled, false, "zero-score candidate must not be persisted");
  });

  it("caps persisted matches at 25 even with more scoring candidates, sorted desc", async () => {
    // 30 candidates all matching role (score 30 each) → only top 25 inserted
    const caps = Array.from({ length: 30 }, (_, n) => ({
      id: `cap-${n}`,
      supplier_company_id: `sup-${n}`,
      role: "Pflegekraft",
      skill_tags: [],
      availability_from: "2030-01-01", // no avail overlap → no +20
      availability_to: "2030-02-01",
      location_lat: null, location_lng: null,
      location_city: null
    }));
    let insertCount = 0;
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM capacity_posts cp")) return { rows: caps, rowCount: caps.length };
      if (sql.includes("INSERT INTO matches")) { insertCount++; return { rows: [], rowCount: 1 }; }
      return undefined;
    });
    const result = await runInitialMatching(pool, demand, new Set());
    assert.strictEqual(result.candidateCount, 30);
    assert.strictEqual(result.matchCount, 25);
    assert.strictEqual(insertCount, 25);
    assert.ok(result.matches.every((m) => m.score === 30));
  });

  it("city match path (+15) scores when no coordinates present", async () => {
    const cityDemand = {
      id: UUID, role: "Helfer", skill_tags: [],
      start_date: "2026-04-01", end_date: "2026-04-02",
      location_city: "Hamburg"
    };
    const cap = {
      id: "cap-city", supplier_company_id: "sup-c",
      role: "Helfer", skill_tags: [],
      availability_from: "2026-03-01", availability_to: "2026-05-01",
      location_city: "hamburg" // case-insensitive +15
    };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM capacity_posts cp")) return { rows: [cap], rowCount: 1 };
      if (sql.includes("INSERT INTO matches")) return { rows: [], rowCount: 1 };
      return undefined;
    });
    const result = await runInitialMatching(pool, cityDemand, new Set());
    // 30 role + 20 avail + 15 city = 65
    assert.strictEqual(result.matches[0].score, 65);
  });

  it("uses end_date/start_date as availability bounds in the candidate query", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM capacity_posts cp")) return { rows: [], rowCount: 0 };
      return undefined;
    });
    await runInitialMatching(pool, demand);
    const q = pool.calls[0];
    assert.match(q.sql, /availability_from <= \$1/);
    assert.match(q.sql, /availability_to IS NULL OR availability_to >= \$2/);
    assert.deepStrictEqual(q.params, ["2026-04-30", "2026-04-01"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// getDemandMatches
// ═══════════════════════════════════════════════════════════════

describe("getDemandMatches", () => {
  it("returns matches ordered by score desc", async () => {
    const rows = [{ id: "m1", match_score: 90 }, { id: "m2", match_score: 50 }];
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM matches m")) return { rows, rowCount: 2 };
      return undefined;
    });
    const result = await getDemandMatches(pool, UUID);
    assert.deepStrictEqual(result, rows);
    assert.match(pool.calls[0].sql, /ORDER BY m\.match_score DESC NULLS LAST/);
    assert.deepStrictEqual(pool.calls[0].params, [UUID]);
  });
});

// ═══════════════════════════════════════════════════════════════
// createOffer
// ═══════════════════════════════════════════════════════════════

describe("createOffer", () => {
  it("inserts offer as draft with demand + supplier ids and JSON-encodes structured fields", async () => {
    const created = { id: "off-1", status: "draft" };
    const pool = trackingPool((sql) => {
      if (sql.includes("INSERT INTO offers")) return { rows: [created], rowCount: 1 };
      return undefined;
    });
    const result = await createOffer(pool, "sup-1", UUID, {
      price_type: "hourly",
      attachments: [{ name: "f.pdf" }],
      surcharges: { night: 10 },
      compliance_check: { ok: true },
      cancellation_policy: { window: 24 }
    });
    assert.deepStrictEqual(result, created);
    const q = pool.calls[0];
    assert.match(q.sql, /INSERT INTO offers/);
    assert.match(q.sql, /'draft'/);
    assert.strictEqual(q.params[0], UUID);     // demand_request_id
    assert.strictEqual(q.params[1], "sup-1");  // supplier_company_id
    // structured fields JSON-encoded
    assert.strictEqual(q.params[7], JSON.stringify([{ name: "f.pdf" }]));      // attachments
    assert.strictEqual(q.params[13], JSON.stringify({ night: 10 }));          // surcharges
    assert.strictEqual(q.params[21], JSON.stringify({ ok: true }));           // compliance_check
    assert.strictEqual(q.params[22], JSON.stringify({ window: 24 }));         // cancellation_policy
  });

  it("leaves optional structured fields null when absent", async () => {
    const pool = trackingPool((sql) => {
      if (sql.includes("INSERT INTO offers")) return { rows: [{ id: "off-2" }], rowCount: 1 };
      return undefined;
    });
    await createOffer(pool, "sup-1", UUID, {});
    const q = pool.calls[0];
    assert.strictEqual(q.params[7], null);   // attachments
    assert.strictEqual(q.params[13], null);  // surcharges
    assert.strictEqual(q.params[21], null);  // compliance_check
  });
});

// ═══════════════════════════════════════════════════════════════
// listOffersForDemand
// ═══════════════════════════════════════════════════════════════

describe("listOffersForDemand", () => {
  it("returns offers ordered by created_at desc for the demand", async () => {
    const offers = [{ id: "o1" }, { id: "o2" }];
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM offers o")) return { rows: offers, rowCount: 2 };
      return undefined;
    });
    const result = await listOffersForDemand(pool, UUID);
    assert.deepStrictEqual(result, offers);
    assert.match(pool.calls[0].sql, /ORDER BY o\.created_at DESC/);
    assert.deepStrictEqual(pool.calls[0].params, [UUID]);
  });
});

// ═══════════════════════════════════════════════════════════════
// getOfferById
// ═══════════════════════════════════════════════════════════════

describe("getOfferById", () => {
  it("returns the joined offer row when found", async () => {
    const offer = { id: "o1", status: "sent", requester_company_id: "r1" };
    const pool = trackingPool((sql) => {
      if (sql.includes("FROM offers o")) return { rows: [offer], rowCount: 1 };
      return undefined;
    });
    const result = await getOfferById(pool, "o1");
    assert.deepStrictEqual(result, offer);
    assert.deepStrictEqual(pool.calls[0].params, ["o1"]);
    assert.ok(!pool.calls[0].sql.includes("FOR UPDATE"));
  });

  it("appends FOR UPDATE OF o when forUpdate option set", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "o1" }], rowCount: 1 }));
    await getOfferById(pool, "o1", { forUpdate: true });
    assert.match(pool.calls[0].sql, /FOR UPDATE OF o/);
  });

  it("returns null when offer missing", async () => {
    const pool = trackingPool(() => ({ rows: [], rowCount: 0 }));
    assert.strictEqual(await getOfferById(pool, "nope"), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// computeOfferNextAction — pure counterparty view-model
// ═══════════════════════════════════════════════════════════════

describe("computeOfferNextAction", () => {
  const supplier = "sup-1";
  const requester = "req-1";
  const offerBase = { supplier_company_id: supplier, requester_company_id: requester };

  it("draft viewed by supplier: action_required, send+withdraw", () => {
    const vm = computeOfferNextAction({ ...offerBase, status: "draft" }, supplier);
    assert.strictEqual(vm.viewer_mode, "sender");
    assert.strictEqual(vm.actor_required, "supplier");
    assert.strictEqual(vm.viewer_state, "action_required");
    assert.deepStrictEqual(vm.actions, ["send", "withdraw"]);
    assert.strictEqual(vm.viewer_label, OFFER_VIEWER_LABELS["draft.sender"]);
  });

  it("sent viewed by requester: action_required, accept/reject/counter", () => {
    const vm = computeOfferNextAction({ ...offerBase, status: "sent" }, requester);
    assert.strictEqual(vm.viewer_mode, "receiver");
    assert.strictEqual(vm.actor_required, "requester");
    assert.strictEqual(vm.viewer_state, "action_required");
    assert.deepStrictEqual(vm.actions, ["accept", "reject", "counter"]);
  });

  it("sent viewed by supplier: waiting_on_counterparty, withdraw only", () => {
    const vm = computeOfferNextAction({ ...offerBase, status: "sent" }, supplier);
    assert.strictEqual(vm.viewer_state, "waiting_on_counterparty");
    assert.deepStrictEqual(vm.actions, ["withdraw"]);
  });

  it("countered viewed by supplier: their turn, send+withdraw", () => {
    const vm = computeOfferNextAction({ ...offerBase, status: "countered" }, supplier);
    assert.strictEqual(vm.viewer_state, "action_required");
    assert.deepStrictEqual(vm.actions, ["send", "withdraw"]);
  });

  it("countered viewed by requester: waiting, wait action", () => {
    const vm = computeOfferNextAction({ ...offerBase, status: "countered" }, requester);
    assert.strictEqual(vm.viewer_state, "waiting_on_counterparty");
    assert.deepStrictEqual(vm.actions, ["wait"]);
  });

  it("accepted is closed with view_followup action for either party", () => {
    const vm = computeOfferNextAction({ ...offerBase, status: "accepted" }, requester);
    assert.strictEqual(vm.actor_required, "none");
    assert.strictEqual(vm.viewer_state, "closed");
    assert.deepStrictEqual(vm.actions, ["view_followup"]);
  });

  it("rejected/withdrawn are closed with view action", () => {
    const rej = computeOfferNextAction({ ...offerBase, status: "rejected" }, supplier);
    assert.strictEqual(rej.viewer_state, "closed");
    assert.deepStrictEqual(rej.actions, ["view"]);
    const wd = computeOfferNextAction({ ...offerBase, status: "withdrawn" }, requester);
    assert.deepStrictEqual(wd.actions, ["view"]);
  });

  it("unknown viewer (neither party) defaults to receiver mode, no actions", () => {
    const vm = computeOfferNextAction({ ...offerBase, status: "sent" }, "stranger");
    assert.strictEqual(vm.viewer_mode, "receiver");
    assert.deepStrictEqual(vm.actions, []); // not requester → no requester actions
    assert.strictEqual(vm.viewer_state, "waiting_on_counterparty");
  });

  it("unknown status falls back to none/closed with raw status label", () => {
    const vm = computeOfferNextAction({ ...offerBase, status: "weird" }, requester);
    assert.strictEqual(vm.actor_required, "none");
    assert.strictEqual(vm.viewer_state, "closed");
    assert.strictEqual(vm.viewer_label, "weird"); // no label entry → raw status
    assert.deepStrictEqual(vm.actions, []);
  });

  it("defaults status to draft when offer.status missing", () => {
    const vm = computeOfferNextAction({ ...offerBase }, supplier);
    assert.strictEqual(vm.actor_required, "supplier");
    assert.deepStrictEqual(vm.actions, ["send", "withdraw"]);
  });

  it("handles null offer without throwing (defensive)", () => {
    const vm = computeOfferNextAction(null, "anyone");
    assert.strictEqual(vm.viewer_mode, "receiver");
    assert.strictEqual(vm.actor_required, "supplier"); // default status draft
  });
});
