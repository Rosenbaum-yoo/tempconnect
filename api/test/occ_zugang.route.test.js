/**
 * Der Zugangs-Nachweis des Owner Control Center — jetzt lesbar.
 *
 * BEFUND 2026-08-26 (Durchlauf 3: geschrieben und nie gelesen):
 * `owner_control_access_audit` wurde an zwei Stellen BESCHRIEBEN und von
 * nirgends gelesen. In der laufenden Datenbank standen 25 Zeilen, darunter
 * **23 abgewiesene Zugriffsversuche** zwischen dem 20.05. und dem 21.07. —
 * aufgezeichnet, und fuer niemanden sichtbar. Die CLAUDE.md fuehrt Audit als
 * nicht verhandelbaren Pfeiler; ein Protokoll, das niemand lesen kann,
 * erfuellt ihn zur Haelfte.
 *
 * Geprueft wird der ECHTE Handler mit einem SQL-dispatchenden Pool — Vorbild
 * `occ_dataExplorer.route.coverage.test.js`.
 *
 * Run: node --test --test-force-exit test/occ_zugang.route.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOccAuditRouter } from "../routes/occ/audit.js";

/* ── Werkzeug ──────────────────────────────────────────────────────────── */

function pool(regeln = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql: String(sql), params: params || [] });
    for (const r of regeln) {
      if (r.match(String(sql))) return r.respond(params || []);
    }
    return { rows: [] };
  };
  return {
    calls,
    query,
    connect: async () => ({ query, release() {} }),
    find(teil) { return calls.filter((c) => c.sql.includes(teil)); }
  };
}

function deps(p) {
  return { pool: p, logger: { warn() {}, info() {}, error() {} } };
}

function handler(router, method, pfad) {
  for (const layer of router.stack) {
    if (!layer.route || layer.route.path !== pfad) continue;
    if (!layer.route.methods[method]) continue;
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  }
  throw new Error("Route " + method + " " + pfad + " nicht gefunden");
}

function req(query = {}) {
  return { session: { userId: "owner-1" }, user: { id: "owner-1" }, params: {}, query, body: {}, headers: {} };
}

function res() {
  const r = { _status: 200, _json: null };
  r.status = (c) => { r._status = c; return r; };
  r.json = (b) => { r._json = b; return r; };
  return r;
}

const ZAEHLT = (s) => s.includes("COUNT(*)::int AS n");
const LISTET = (s) => s.includes("FROM owner_control_access_audit a");

/* ── Proben ────────────────────────────────────────────────────────────── */

describe("OCC · der Zugangs-Nachweis ist ueberhaupt abrufbar", () => {
  it("die Route ist am Router registriert", () => {
    /* Ohne sie waere der ganze Rest eine Uebung: der Endpunkt existiert nur,
     * wenn er auch am Router haengt. Genau diese Verwechslung — gebaut, aber
     * nicht montiert — ist die Fehlerklasse dieser Welle. */
    const router = createOccAuditRouter(deps(pool()));
    const wege = new Set(
      router.stack.filter((l) => l.route)
        .map((l) => Object.keys(l.route.methods)[0] + " " + l.route.path)
    );
    assert.ok(wege.has("get /audit/access"), "get /audit/access fehlt");
    assert.ok(wege.has("get /audit/feed"), "der bestehende Feed darf nicht verschwinden");
  });

  it("liest die Zugangs-Tabelle, nicht das allgemeine Audit", () => {
    /* Die beiden beantworten verschiedene Fragen: `audit_log` sagt, WAS die
     * Eigentuemer getan haben; diese Tabelle sagt, WER ueberhaupt hereinkam
     * oder abgewiesen wurde. Wer hier auf audit_log zeigt, verliert genau die
     * abgewiesenen Versuche — es entsteht ja keine Sitzung. */
    const p = pool([
      { match: ZAEHLT, respond: () => ({ rows: [{ n: 25 }] }) },
      { match: LISTET, respond: () => ({ rows: [] }) }
    ]);
    const router = createOccAuditRouter(deps(p));
    return handler(router, "get", "/audit/access")(req(), res()).then(() => {
      assert.ok(p.find("owner_control_access_audit").length > 0,
        "die Zugangs-Tabelle wurde nicht abgefragt");
      assert.equal(p.find("FROM audit_log").length, 0,
        "hier gehoert das allgemeine Audit nicht hin");
    });
  });

  it("nennt die Zahl der Abweisungen getrennt", async () => {
    /* Sie ist der Grund, aus dem man diese Liste oeffnet. Muesste man sie
     * erblaettern, waere sie so gut wie nicht da. */
    const p = pool([
      { match: (s) => s.includes("action = 'access_denied'"), respond: () => ({ rows: [{ n: 23 }] }) },
      { match: ZAEHLT, respond: () => ({ rows: [{ n: 25 }] }) },
      { match: LISTET, respond: () => ({ rows: [] }) }
    ]);
    const r = res();
    await handler(createOccAuditRouter(deps(p)), "get", "/audit/access")(req(), r);
    assert.equal(r._json.data.abgewiesen, 23);
    assert.equal(r._json.data.total, 25);
  });

  it("blaettert richtig: eine Zeile mehr bedeutet has_more", async () => {
    const zeilen = Array.from({ length: 31 }, (_, i) => ({ id: "a" + i, action: "access_denied" }));
    const p = pool([
      { match: ZAEHLT, respond: () => ({ rows: [{ n: 100 }] }) },
      { match: LISTET, respond: () => ({ rows: zeilen }) }
    ]);
    const r = res();
    await handler(createOccAuditRouter(deps(p)), "get", "/audit/access")(req(), r);
    assert.equal(r._json.data.items.length, 30, "die Zusatzzeile darf nicht ausgeliefert werden");
    assert.equal(r._json.data.has_more, true);
  });

  it("ein unbekannter Filter blendet NICHT alles aus", async () => {
    /* Eine freie Zeichenkette als Filter waere eine Falle: ein Tippfehler
     * ergaebe eine leere Liste, die aussieht wie "es gab keine Versuche". */
    const p = pool([
      { match: ZAEHLT, respond: () => ({ rows: [{ n: 25 }] }) },
      { match: LISTET, respond: () => ({ rows: [] }) }
    ]);
    const r = res();
    await handler(createOccAuditRouter(deps(p)), "get", "/audit/access")(req({ action: "acess_denied" }), r);
    const liste = p.find("FROM owner_control_access_audit a")[0];
    assert.ok(!liste.sql.includes("a.action = $"),
      "ein unbekannter Wert darf keine WHERE-Bedingung erzeugen");
    assert.equal(r._json.success, true);
  });

  it("ein bekannter Filter greift und bindet den Wert", async () => {
    const p = pool([
      { match: ZAEHLT, respond: () => ({ rows: [{ n: 23 }] }) },
      { match: LISTET, respond: () => ({ rows: [] }) }
    ]);
    await handler(createOccAuditRouter(deps(pool())), "get", "/audit/access")(req(), res());
    const r = res();
    await handler(createOccAuditRouter(deps(p)), "get", "/audit/access")(req({ action: "access_denied" }), r);
    const liste = p.find("FROM owner_control_access_audit a")[0];
    assert.match(liste.sql, /a\.action = \$1/);
    assert.ok(liste.params.includes("access_denied"));
  });

  it("Zero-State statt 500: faellt die Abfrage, kommt eine leere Liste", async () => {
    /* Pfeiler 2 der CLAUDE.md. Ein Audit-Fenster, das mit 500 antwortet, ist
     * im Zweifel genau dann kaputt, wenn man es braucht. */
    const p = {
      calls: [],
      query: async () => { throw new Error("Tabelle fehlt"); },
      connect: async () => ({ query: async () => { throw new Error("x"); }, release() {} }),
      find: () => []
    };
    const r = res();
    await handler(createOccAuditRouter(deps(p)), "get", "/audit/access")(req(), r);
    assert.equal(r._status, 200);
    assert.equal(r._json.success, true);
    assert.deepEqual(r._json.data.items, []);
    assert.equal(r._json.data.abgewiesen, 0);
  });
});
