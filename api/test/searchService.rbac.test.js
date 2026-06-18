/**
 * Phase 5 — Plattformweite Suche: RBAC-/Sichtbarkeits-Härtung + Fuzzy (DB-Pfad).
 * Mock-Pool-Tests prüfen die SQL-Form: org-Scope (requisitions), Marktplatz-Sichtbarkeit
 * (capacity_posts), Opt-in-Verzeichnis (companies) und den Trigram-Fuzzy-Operator.
 * Run: node --test --test-force-exit test/searchService.rbac.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as searchService from "../services/searchService.js";

function capturePool(responder) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return responder ? responder(sql, params) : { rows: [] }; } };
}

describe("searchService — RBAC/Sichtbarkeit + Fuzzy (DB-Pfad)", () => {
  it("requisitions: org-privat (org_id = viewerOrgId) + Trigram-Fuzzy", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    await searchService.search(pool, "Pflege", { type: "requisitions", viewerOrgId: "org-1" });
    const sql = pool.calls.map((c) => c.sql).join("\n");
    assert.match(sql, /FROM requisitions/);
    assert.match(sql, /org_id = \$5/, "org-gescoped");
    assert.match(sql, /f_unaccent\(title\) % f_unaccent\(\$2\)/, "Trigram-Fuzzy-Operator (unaccent-gewrappt, Diakritik-insensitiv)");
    const main = pool.calls.find((c) => c.sql.includes("LIMIT"));
    assert.equal(main.params[4], "org-1", "viewerOrgId als Parameter");
  });

  it("requisitions OHNE viewerOrgId -> KEINE Query (kein cross-org-Leak)", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    await searchService.search(pool, "Pflege", { type: "requisitions" });
    assert.equal(pool.calls.length, 0, "keine requisitions-Query ohne Org-Kontext");
  });

  it("capacity_posts: nur aktiv + nicht-privat + nicht-abgelaufen", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    await searchService.search(pool, "Stapler", { type: "capacity_posts", viewerOrgId: "org-1" });
    const sql = pool.calls[0].sql;
    assert.match(sql, /status = 'active'/);
    assert.match(sql, /visibility_status IS NULL OR visibility_status <> 'private'/);
    assert.match(sql, /availability_to IS NULL OR availability_to >= CURRENT_DATE/);
    assert.match(sql, /f_unaccent\(title\) % f_unaccent\(\$2\)/, "Fuzzy (unaccent-gewrappt)");
  });

  it("companies: nur opted-in Orgs (profile_visibility_settings is_public + approved)", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    await searchService.search(pool, "Acme", { type: "companies", viewerOrgId: "org-1" });
    const sql = pool.calls[0].sql;
    assert.match(sql, /FROM organizations o/);
    assert.match(sql, /profile_visibility_settings/);
    assert.match(sql, /is_public = TRUE AND pvs\.status = 'approved'/);
  });

  it("type=all durchsucht requisitions + capacity_posts + companies", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    await searchService.search(pool, "test", { type: "all", viewerOrgId: "org-1" });
    const all = pool.calls.map((c) => c.sql).join("\n");
    assert.match(all, /FROM requisitions/);
    assert.match(all, /FROM capacity_posts/);
    assert.match(all, /FROM organizations/);
  });
});
