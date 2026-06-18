/**
 * Phase 5 Verfeinerung — Such-Moderation (Faekal-/Vulgaersprache).
 * screenQuery nutzt den echten contentModerationService; record/list/resolve via Mock-Pool.
 * Run: node --test --test-force-exit test/searchModerationService.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/searchModerationService.js";

function capturePool(responder) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return responder ? responder(sql, params) : { rows: [] }; } };
}

describe("searchModerationService — screen/record/list/resolve", () => {
  it("screenQuery flaggt Faekal-/Vulgaersprache (inkl. Leetspeak/Evasion)", () => {
    const a = svc.screenQuery("scheisse pflege");
    assert.equal(a.flagged, true);
    assert.equal(a.severity, "medium");
    assert.ok(a.matches.some((m) => m.word === "scheisse"));

    const leet = svc.screenQuery("sch31sse");      // Leetspeak
    assert.equal(leet.flagged, true);

    const hard = svc.screenQuery("du hurensohn");   // high
    assert.equal(hard.flagged, true);
    assert.equal(hard.severity, "high");
  });

  it("screenQuery laesst saubere Suchbegriffe durch", () => {
    assert.equal(svc.screenQuery("pflegefachkraft hamburg").flagged, false);
    assert.equal(svc.screenQuery("stapler logistik").flagged, false);
    assert.equal(svc.screenQuery("elektrofachkraft").flagged, false);
  });

  it("recordFlaggedQuery: Upsert (ON CONFLICT) + normalisierte query_norm + Begriffe geclamped", async () => {
    const pool = capturePool(() => ({ rows: [{ id: "f1" }] }));
    const ok = await svc.recordFlaggedQuery(pool, {
      userId: "u1", orgId: "o1", query: "  ScheiSSE  Pflege ", severity: "medium",
      matchedTerms: ["scheisse"], ip: "1.2.3.4", userAgent: "UA",
    });
    assert.equal(ok, true);
    const c = pool.calls[0];
    assert.match(c.sql, /INSERT INTO flagged_search_queries/);
    assert.match(c.sql, /ON CONFLICT \(user_id, query_norm\) DO UPDATE/, "bounded Upsert");
    assert.match(c.sql, /hit_count\s*=\s*flagged_search_queries\.hit_count \+ 1/);
    assert.equal(c.params[0], "u1");
    assert.equal(c.params[3], "scheisse pflege", "query_norm lower+trim+collapse");
    assert.deepEqual(c.params[5], ["scheisse"], "matched_terms als Array");
  });

  it("recordFlaggedQuery ohne Text -> kein Write", async () => {
    const pool = capturePool();
    assert.equal(await svc.recordFlaggedQuery(pool, { query: "   " }), false);
    assert.equal(pool.calls.length, 0);
  });

  it("listFlaggedQueries: offene zuerst, jüngste zuerst, Status-Filter, JOIN auf user/org", async () => {
    const pool = capturePool((sql) => sql.includes("COUNT") ? { rows: [{ total: 3 }] } : { rows: [{ id: "f1" }] });
    const out = await svc.listFlaggedQueries(pool, { status: "open", limit: 999 });
    assert.equal(out.total, 3);
    assert.equal(out.limit, 200, "Limit auf max 200 geclamped");
    const listSql = pool.calls[0].sql;
    assert.match(listSql, /LEFT JOIN users u/);
    assert.match(listSql, /LEFT JOIN organizations o/);
    assert.match(listSql, /ORDER BY \(f\.status = 'open'\) DESC, f\.last_seen_at DESC/);
    assert.match(listSql, /\$1::text IS NULL OR f\.status = \$1/);
    assert.equal(pool.calls[0].params[0], "open");
  });

  it("resolveFlaggedQuery: action->status Mapping + Audit-relevante RETURNING", async () => {
    const pool = capturePool(() => ({ rows: [{ id: "f1", status: "dismissed" }] }));
    const d = await svc.resolveFlaggedQuery(pool, { id: "f1", actorId: "staff1", action: "dismiss", note: "Fehlalarm" });
    assert.equal(d.ok, true);
    assert.equal(pool.calls[0].params[1], "dismissed", "dismiss -> dismissed");

    const pool2 = capturePool(() => ({ rows: [{ id: "f2", status: "actioned" }] }));
    await svc.resolveFlaggedQuery(pool2, { id: "f2", actorId: "staff1", action: "action", note: "bestätigt" });
    assert.equal(pool2.calls[0].params[1], "actioned", "action -> actioned");
  });

  it("resolveFlaggedQuery: ungueltige action + nicht gefunden", async () => {
    const pool = capturePool(() => ({ rows: [] }));
    assert.deepEqual(await svc.resolveFlaggedQuery(pool, { id: "x", action: "evil" }), { ok: false, error: "INVALID_ACTION" });
    const nf = await svc.resolveFlaggedQuery(pool, { id: "x", action: "dismiss" });
    assert.deepEqual(nf, { ok: false, error: "NOT_FOUND" });
  });
});
