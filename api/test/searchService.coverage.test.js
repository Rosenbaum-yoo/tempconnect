/**
 * Coverage suite for services/searchService.js
 *
 * Environment note: the `meilisearch` npm package is NOT installed in this repo
 * (DB-fallback is the production/pilot reality). Therefore `getClient()` always
 * resolves to `null`:
 *   - with no MEILISEARCH_URL  -> early-return null (logged, no import attempt)
 *   - with    MEILISEARCH_URL  -> dynamic import("meilisearch") throws -> catch -> null
 * Both null-paths are exercised here. The Meilisearch *success* branches
 * (searchMeilisearch / index/remove/reindex with a live client, initIndexes,
 * getSearchStatus available:true) require either the package installed or a
 * loader mock and are listed as uncoverable for a pure unit test.
 *
 * Because getClient() caches its result in module-level state
 * (_client/_clientChecked), tests that need a *fresh* getClient evaluation use a
 * cache-busted dynamic import ("../services/searchService.js?v=N"). The shared
 * `config` singleton object is the same instance across those copies, so flipping
 * config.MEILISEARCH_URL is observed by every fresh module instance.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

import * as svc from "../services/searchService.js";
import { config } from "../config/index.js";

/* ── tracking pool: records every {sql,params}; routes by SQL substring ── */
function trackingPool(handler) {
  const calls = [];
  const queryFn = async (sql, params) => {
    calls.push({ sql, params });
    const res = handler ? handler(sql, params) : null;
    if (res instanceof Error) throw res;
    return res || { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query: queryFn,
    connect: async () => ({ query: queryFn, release: () => {} })
  };
}

let busterCounter = 0;
async function freshService() {
  busterCounter += 1;
  return import(`../services/searchService.js?v=${busterCounter}`);
}

describe("searchService — getAvailableIndexes", () => {
  it("returns the five canonical index names", () => {
    const idx = svc.getAvailableIndexes();
    assert.deepEqual(
      idx.sort(),
      ["capacity_posts", "companies", "requisitions", "skills", "suppliers"].sort()
    );
  });

  it("returns a fresh array reference each call (not the internal config)", () => {
    const a = svc.getAvailableIndexes();
    const b = svc.getAvailableIndexes();
    assert.notEqual(a, b); // Object.keys() produces a new array
    assert.deepEqual(a, b);
  });
});

describe("searchService — search (DB fallback, type=all)", () => {
  it("queries requisitions+capacity_posts+companies when viewerOrgId set", async () => {
    const pool = trackingPool((sql) => {
      if (/FROM requisitions/.test(sql) && /SELECT id/.test(sql)) return { rows: [{ id: "r1", _index: "requisitions" }] };
      if (/FROM requisitions/.test(sql) && /COUNT/.test(sql)) return { rows: [{ c: 1 }] };
      if (/FROM capacity_posts/.test(sql) && /SELECT id/.test(sql)) return { rows: [{ id: "c1", _index: "capacity_posts" }] };
      if (/FROM capacity_posts/.test(sql) && /COUNT/.test(sql)) return { rows: [{ c: 2 }] };
      if (/FROM organizations/.test(sql) && /COUNT/.test(sql)) return { rows: [{ c: 3 }] };
      if (/FROM organizations/.test(sql)) return { rows: [{ id: "o1", _index: "companies" }] };
      return { rows: [] };
    });

    const out = await svc.search(pool, "pflege", { type: "all", viewerOrgId: "org-1" });

    assert.equal(out.source, "database");
    assert.equal(out.results.length, 3);
    assert.equal(out.total, 6); // 1 + 2 + 3
    assert.equal(typeof out.durationMs, "number");
    // requisitions branch only runs when viewerOrgId present
    assert.ok(pool.calls.some(c => /FROM requisitions/.test(c.sql)));
    assert.ok(pool.calls.some(c => /FROM capacity_posts/.test(c.sql)));
    assert.ok(pool.calls.some(c => /FROM organizations/.test(c.sql)));
  });

  it("SKIPS requisitions entirely when no viewerOrgId (org-private safety)", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const out = await svc.search(pool, "pflege", { type: "all" });

    assert.equal(out.source, "database");
    assert.ok(!pool.calls.some(c => /FROM requisitions/.test(c.sql)),
      "requisitions must not be queried without viewerOrgId");
    // capacity_posts + companies still run (2 SELECT + 2 COUNT = 4 queries)
    assert.ok(pool.calls.some(c => /FROM capacity_posts/.test(c.sql)));
    assert.ok(pool.calls.some(c => /FROM organizations/.test(c.sql)));
  });

  it("passes viewerOrgId as the org_id SQL param for requisitions", async () => {
    const pool = trackingPool((sql) =>
      /FROM requisitions/.test(sql) && /COUNT/.test(sql) ? { rows: [{ c: 0 }] } : { rows: [] });
    await svc.search(pool, "abc", { type: "all", viewerOrgId: "ORG-XYZ" });

    const reqSelect = pool.calls.find(c => /FROM requisitions/.test(c.sql) && /SELECT id/.test(c.sql));
    assert.ok(reqSelect, "requisitions SELECT issued");
    // params: [like, query, limit, offset, viewerOrgId]
    assert.equal(reqSelect.params[4], "ORG-XYZ");
    assert.equal(reqSelect.params[1], "abc"); // raw query for trigram
    assert.equal(reqSelect.params[0], "%abc%"); // ILIKE term
  });
});

describe("searchService — search (DB fallback, single type)", () => {
  it("queries only capacity_posts for type=capacity_posts", async () => {
    const pool = trackingPool((sql) =>
      /COUNT/.test(sql) ? { rows: [{ c: 5 }] } : { rows: [{ id: "c1" }] });
    const out = await svc.search(pool, "berlin", { type: "capacity_posts" });

    assert.equal(out.total, 5);
    assert.equal(out.results.length, 1);
    assert.ok(pool.calls.every(c => /capacity_posts/.test(c.sql)));
    assert.ok(!pool.calls.some(c => /organizations/.test(c.sql)));
  });

  it("returns empty result set for an unknown type (no domain match)", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "x" }] }));
    const out = await svc.search(pool, "q", { type: "does_not_exist" });

    assert.equal(out.results.length, 0);
    assert.equal(out.total, 0);
    assert.equal(pool.calls.length, 0, "no SQL issued for unknown domain");
  });

  it("skips requisitions single-type without viewerOrgId (domain is null)", async () => {
    const pool = trackingPool(() => ({ rows: [{ id: "r" }] }));
    const out = await svc.search(pool, "q", { type: "requisitions" });

    assert.equal(out.results.length, 0);
    assert.equal(out.total, 0);
    assert.equal(pool.calls.length, 0);
  });

  it("queries requisitions single-type WHEN viewerOrgId present", async () => {
    const pool = trackingPool((sql) =>
      /COUNT/.test(sql) ? { rows: [{ c: 4 }] } : { rows: [{ id: "r1" }] });
    const out = await svc.search(pool, "q", { type: "requisitions", viewerOrgId: "org-9" });

    assert.equal(out.total, 4);
    assert.equal(out.results.length, 1);
    assert.ok(pool.calls.every(c => /requisitions/.test(c.sql)));
  });
});

describe("searchService — search options & escaping", () => {
  it("clamps limit to a maximum of 100", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.search(pool, "q", { type: "capacity_posts", limit: 9999 });
    const sel = pool.calls.find(c => /SELECT id/.test(c.sql));
    // params: [like, query, limit, offset]
    assert.equal(sel.params[2], 100);
  });

  it("defaults limit=20 and offset=0", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.search(pool, "q", { type: "capacity_posts" });
    const sel = pool.calls.find(c => /SELECT id/.test(c.sql));
    assert.equal(sel.params[2], 20);
    assert.equal(sel.params[3], 0);
  });

  it("honours explicit offset", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.search(pool, "q", { type: "capacity_posts", offset: 40 });
    const sel = pool.calls.find(c => /SELECT id/.test(c.sql));
    assert.equal(sel.params[3], 40);
  });

  it("escapes %, _ and backslash in the ILIKE term", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.search(pool, "50%_a\\b", { type: "capacity_posts" });
    const sel = pool.calls.find(c => /SELECT id/.test(c.sql));
    // each special char gets a backslash prefix, wrapped in %...%
    assert.equal(sel.params[0], "%50\\%\\_a\\\\b%");
    // raw query (param index 1) is untouched for trigram operator
    assert.equal(sel.params[1], "50%_a\\b");
  });

  it("coerces a non-string query safely (number)", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    await svc.search(pool, 12345, { type: "capacity_posts" });
    const sel = pool.calls.find(c => /SELECT id/.test(c.sql));
    assert.equal(sel.params[0], "%12345%");
  });
});

describe("searchService — search error resilience", () => {
  it("swallows a per-domain query error and still returns a shaped response", async () => {
    const pool = trackingPool((sql) => {
      if (/FROM capacity_posts/.test(sql)) return new Error("boom");
      if (/FROM organizations/.test(sql) && /COUNT/.test(sql)) return { rows: [{ c: 7 }] };
      if (/FROM organizations/.test(sql)) return { rows: [{ id: "o1" }] };
      return { rows: [] };
    });

    const out = await svc.search(pool, "q", { type: "all" });
    // capacity_posts errored -> contributes nothing; companies still counted
    assert.equal(out.source, "database");
    assert.equal(out.total, 7);
    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].id, "o1");
  });

  it("treats a missing count row as 0 (optional chaining branch)", async () => {
    const pool = trackingPool((sql) =>
      /COUNT/.test(sql) ? { rows: [] } : { rows: [{ id: "c1" }] });
    const out = await svc.search(pool, "q", { type: "capacity_posts" });
    assert.equal(out.results.length, 1);
    assert.equal(out.total, 0);
  });
});

describe("searchService — client-null branches (no MEILISEARCH_URL)", () => {
  it("indexDocument returns null when no search engine", async () => {
    assert.equal(await svc.indexDocument("capacity_posts", { id: "1" }), null);
  });

  it("removeDocument returns null when no search engine", async () => {
    assert.equal(await svc.removeDocument("capacity_posts", "1"), null);
  });

  it("getSearchStatus reports database_fallback when no client", async () => {
    const st = await svc.getSearchStatus();
    assert.equal(st.available, false);
    assert.equal(st.engine, "database_fallback");
    assert.equal(st.info, null);
  });

  it("reindexAll returns Not-available when no client", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const out = await svc.reindexAll(pool, "companies");
    assert.equal(out.indexed, 0);
    assert.equal(out.durationMs, 0);
    assert.equal(out.error, "Not available");
    assert.equal(pool.calls.length, 0, "no reindex query when client unavailable");
  });

  it("reindexAll returns Not-available for unknown index even though client null", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const out = await svc.reindexAll(pool, "no_such_index");
    assert.equal(out.error, "Not available");
  });

  it("reindexAll returns Not-available for skills (reindexQuery null)", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const out = await svc.reindexAll(pool, "skills");
    assert.equal(out.error, "Not available");
  });

  it("reindexAllIndexes skips skills and returns empty/not-available map", async () => {
    const pool = trackingPool(() => ({ rows: [] }));
    const out = await svc.reindexAllIndexes(pool);
    // skills has reindexQuery=null -> excluded from the result map
    assert.ok(!("skills" in out));
    // the four reindexable indexes are present, each Not-available (no client)
    for (const name of ["companies", "suppliers", "capacity_posts", "requisitions"]) {
      assert.ok(name in out, `${name} present`);
      assert.equal(out[name].error, "Not available");
    }
  });
});

describe("searchService — getClient import-failure branch (MEILISEARCH_URL set)", () => {
  // meilisearch is not installed, so a fresh getClient with URL set takes the
  // dynamic-import catch path -> _client stays null -> still DB fallback.
  before(() => { config.MEILISEARCH_URL = "http://meili.invalid:7700"; });

  it("falls back to DB even with a URL configured (import fails)", async () => {
    const fresh = await freshService();
    const pool = trackingPool((sql) =>
      /COUNT/.test(sql) ? { rows: [{ c: 1 }] } : { rows: [{ id: "c1" }] });
    const out = await fresh.search(pool, "q", { type: "capacity_posts" });
    assert.equal(out.source, "database");
    assert.equal(out.total, 1);
  });

  it("getSearchStatus still reports unavailable after failed import", async () => {
    const fresh = await freshService();
    const st = await fresh.getSearchStatus();
    assert.equal(st.available, false);
    // engine is database_fallback because client ended up null
    assert.equal(st.engine, "database_fallback");
  });

  it("indexDocument still returns null after failed import", async () => {
    const fresh = await freshService();
    assert.equal(await fresh.indexDocument("companies", [{ id: "1" }, { id: "2" }]), null);
  });
});
