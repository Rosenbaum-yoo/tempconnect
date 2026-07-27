/**
 * Activity-Feed-Route + Match-Alert-Anreicherung (P4.4).
 *
 * Zwei Dinge, die hier nicht schiefgehen duerfen:
 *   1. **Org-Boundary.** Ohne Org-Kontext lief `queryEvents` frueher ohne WHERE — also
 *      plattformweit. Solange die Tabelle leer war, fiel das niemandem auf; mit den
 *      Ereignissen aus P1–P4 waere es ein Datenleck ueber Mandantengrenzen hinweg.
 *   2. **Kein Endpunkt ohne Ziel.** Jeder Eintrag traegt Beschriftung, Symbol und
 *      Deep-Link vom Server — nicht aus einer Label-Tabelle je Oberflaeche.
 *
 * Run: node --test --test-force-exit test/activityFeed.route.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createActivityFeedRouter } from "../routes/activityFeed.js";
import { enrichMatchAlerts } from "../services/matchAlertService.js";

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

function trackingPool(rows = []) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      return { rows, rowCount: rows.length };
    }
  };
}

function mockRes() {
  const res = { _status: 200, _json: null };
  res.status = (c) => { res._status = c; return res; };
  res.json = (b) => { res._json = b; return res; };
  return res;
}

/** Letzten Handler des Route-Stacks holen (Middleware wird uebersprungen). */
function getHandler(router, method, routePath) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

const eventRow = (over = {}) => ({
  id: "ev1",
  event_type: "match_found",
  actor_id: null,
  org_id: "org-1",
  entity_type: "capacity_post",
  entity_id: "CP1",
  created_at: "2026-07-26T08:00:00.000Z",
  actor_name: null,
  ...over
});

describe("GET /activity-feed — Org-Boundary", () => {
  it("filtert auf die aktive Organisation", async () => {
    const pool = trackingPool([eventRow()]);
    const handler = getHandler(createActivityFeedRouter({ pool, requireAuth: (_q, _s, n) => n(), logger: mockLogger() }), "get", "/activity-feed");
    const res = mockRes();
    await handler({ orgId: "org-1", session: { userId: "u1" }, query: {} }, res);

    assert.equal(res._status, 200);
    const sql = pool.calls[0].sql;
    assert.match(sql, /pe\.org_id = \$1 OR pe\.target_org_id = \$1/);
    assert.equal(pool.calls[0].params[0], "org-1");
    assert.equal(res._json.data.scope, "org");
  });

  it("liest ohne Org NUR die eigenen Vorgaenge — nie plattformweit", async () => {
    const pool = trackingPool([eventRow({ org_id: null, actor_id: "u1" })]);
    const handler = getHandler(createActivityFeedRouter({ pool, requireAuth: (_q, _s, n) => n(), logger: mockLogger() }), "get", "/activity-feed");
    const res = mockRes();
    await handler({ orgId: null, session: { userId: "u1" }, query: {} }, res);

    const sql = pool.calls[0].sql;
    assert.match(sql, /pe\.actor_id = \$1/, "ohne Org wird auf den Akteur eingegrenzt");
    assert.equal(pool.calls[0].params[0], "u1");
    assert.ok(!/WHERE\s+LIMIT/i.test(sql), "niemals eine Abfrage ohne Einschraenkung");
    assert.equal(res._json.data.scope, "own");
  });

  it("deckelt das Limit", async () => {
    const pool = trackingPool([]);
    const handler = getHandler(createActivityFeedRouter({ pool, requireAuth: (_q, _s, n) => n(), logger: mockLogger() }), "get", "/activity-feed");
    await handler({ orgId: "org-1", session: { userId: "u1" }, query: { limit: "5000" } }, mockRes());
    const params = pool.calls[0].params;
    assert.equal(params[params.length - 1], 100);
  });
});

describe("GET /activity-feed — Darstellung kommt vom Server", () => {
  it("liefert Beschriftung, Symbol und Deep-Link je Eintrag", async () => {
    const pool = trackingPool([eventRow()]);
    const handler = getHandler(createActivityFeedRouter({ pool, requireAuth: (_q, _s, n) => n(), logger: mockLogger() }), "get", "/activity-feed");
    const res = mockRes();
    await handler({ orgId: "org-1", session: { userId: "u1" }, query: {} }, res);

    const item = res._json.data.items[0];
    assert.equal(item.label, "Match gefunden");
    assert.ok(item.icon);
    assert.equal(item.link_path, "/public/capacity_exchange_detail.html?id=CP1&type=supply");
  });

  it("antwortet bei einem Fehler sauber statt zu haengen", async () => {
    const pool = { query: async () => { throw new Error("db down"); } };
    const handler = getHandler(createActivityFeedRouter({ pool, requireAuth: (_q, _s, n) => n(), logger: mockLogger() }), "get", "/activity-feed");
    const res = mockRes();
    await handler({ orgId: "org-1", session: { userId: "u1" }, query: {} }, res);
    assert.equal(res._status, 500);
    assert.equal(res._json.success, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Match-Alerts: aus einer Zeile wird ein Hinweis mit Ziel
// ═══════════════════════════════════════════════════════════════

describe("enrichMatchAlerts — kein Hinweis ohne Aussage und Ziel", () => {
  const reasons = [
    { factor: "role", points: 30, max: 30, meta: { mode: "exact", role: "Pflegekraft" } },
    { factor: "skills", points: 19, max: 25, meta: { overlap: 3, required: 4 } }
  ];

  it("baut Titel, Begruendung und Deep-Link aus dem Gegenstueck", () => {
    const [a] = enrichMatchAlerts([{
      id: "ma1", match_score: 72, match_reasons: reasons,
      counterpart_type: "capacity_post", counterpart_id: "CP1",
      counterpart_title: "3 Pflegekräfte", counterpart_role: "Pflegekraft", counterpart_city: "Kiel"
    }]);

    assert.equal(a.title, "Personalangebot: 3 Pflegekräfte");
    assert.match(a.message, /Pflegekraft, Kiel/);
    assert.match(a.message, /Rolle „Pflegekraft" passt genau/);
    assert.equal(a.link_path, "/public/capacity_exchange_detail.html?id=CP1&type=supply");
    assert.equal(a.match_quality, "good");
  });

  it("benennt die Gegenrichtung korrekt", () => {
    const [a] = enrichMatchAlerts([{
      id: "ma2", match_score: 90, match_reasons: reasons,
      counterpart_type: "requisition", counterpart_id: "RQ1", counterpart_title: "Nachtdienst"
    }]);
    assert.equal(a.title, "Arbeitsplatzangebot: Nachtdienst");
    assert.equal(a.link_path, "/public/requisitions.html?focus_id=RQ1");
    assert.equal(a.match_quality, "excellent");
  });

  it("vertraegt reasons als JSON-String (JSONB ohne Parsing)", () => {
    const [a] = enrichMatchAlerts([{
      id: "ma3", match_score: 55, match_reasons: JSON.stringify(reasons),
      counterpart_type: "demand_request", counterpart_id: "DR1", counterpart_title: "Bedarf"
    }]);
    assert.match(a.message, /Rolle/);
  });

  it("faellt fuer Alt-Alarme aus Suchauftraegen sinnvoll zurueck", () => {
    const [a] = enrichMatchAlerts([{ id: "ma4", match_count: 3, job_title: "Pflege Kiel" }]);
    assert.equal(a.title, "Suchauftrag: Pflege Kiel");
    assert.equal(a.link_path, null);
  });

  it("bleibt bei voellig leeren Zeilen lesbar", () => {
    const [a] = enrichMatchAlerts([{ id: "ma5", match_count: 0 }]);
    assert.equal(a.title, "Match: 0 Treffer");
    assert.equal(a.message, "");
  });

  it("laesst Nicht-Listen unveraendert", () => {
    assert.equal(enrichMatchAlerts(null), null);
    assert.equal(enrichMatchAlerts(undefined), undefined);
  });
});
