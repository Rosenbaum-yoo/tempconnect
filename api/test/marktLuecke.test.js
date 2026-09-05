/**
 * Das Nachfragesignal fuer die Zeitarbeitsfirma (N7.1, 2026-09-05).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS DER PLAN ANNAHM, UND WAS GEMESSEN DASTAND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * N7.1 verspricht den Satz
 *
 *     "Im Raum Muenster werden 34 Pflegekraefte gesucht, verfuegbar sind 6."
 *
 * und der Plan sagt: "Aus `capacity-discovery`, von der anderen Seite gelesen".
 *
 * DAS TRIFFT NICHT ZU. `capacityDiscoveryService` liest ausschliesslich
 * `capacity_posts` — die ANGEBOTSSEITE. Die Nachfrage liegt in einer eigenen
 * Tabelle, `demand_requests` (Mig 014). Aus einer Tabelle laesst sich die
 * andere Zahl nicht lesen, egal von welcher Seite man sie betrachtet.
 *
 * Die zweite Haelfte ist deshalb neu gebaut — spiegelbildlich zu
 * `aggregateByRole`, damit die beiden Zahlen ueberhaupt vergleichbar sind.
 *
 * Abnahme aus dem Plan (N7.1): **die Zahl stimmt mit den offenen Bedarfen
 * ueberein.**
 *
 * Run: node --test --test-force-exit test/marktLuecke.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  aggregateDemandByRole, getMarktLuecke
} from "../services/capacityDiscoveryService.js";

/* ── Vorrichtung ─────────────────────────────────────────────────────── */

function musterPool({ nachfrage = [], angebot = [] } = {}) {
  const abfragen = [];
  return {
    abfragen,
    query: async (sql, params = []) => {
      const s = String(sql);
      abfragen.push({ sql: s, params });
      if (/FROM\s+demand_requests/i.test(s)) return { rows: nachfrage };
      if (/FROM\s+capacity_posts/i.test(s)) return { rows: angebot };
      return { rows: [] };
    }
  };
}

const NACHFRAGE = (role, kopf, anfragen = 1, city = "Muenster") =>
  ({ role, request_count: anfragen, total_headcount: kopf, cities: [city] });
const ANGEBOT = (role, kopf, eintraege = 1, city = "Muenster") =>
  ({ role, entry_count: eintraege, total_headcount: kopf, cities: [city] });

/* ── 1. Die Nachfrageseite ───────────────────────────────────────────── */

describe("N7.1 · die Nachfrage kommt aus der Nachfrage-Tabelle", () => {
  it("gefragt wird `demand_requests`, nicht `capacity_posts`", async () => {
    const pool = musterPool();
    await aggregateDemandByRole(pool, {});
    assert.equal(pool.abfragen.length, 1);
    assert.match(pool.abfragen[0].sql, /FROM\s+demand_requests/i,
      "die Nachfrage wird aus der Angebotstabelle gelesen — dann steht in beiden "
      + "Zahlen dasselbe, und die Luecke ist immer null");
  });

  it("nur OFFENE Bedarfe zaehlen", async () => {
    /* Ein erfuellter oder geschlossener Bedarf ist keine Nachfrage mehr. Ihn
       mitzuzaehlen hiesse, der Firma eine Luecke zu zeigen, die es nicht gibt —
       und danach stellt sie jemanden ein, den niemand sucht. */
    const pool = musterPool();
    await aggregateDemandByRole(pool, {});
    assert.match(pool.abfragen[0].sql, /dr\.status = 'open'/,
      "erfuellte und geschlossene Bedarfe zaehlen mit");
  });

  it("die Koepfe werden summiert, nicht die Anfragen gezaehlt", async () => {
    /* Drei Anfragen zu je zwoelf Pflegekraeften sind 36 gesuchte Menschen, nicht
       drei. Die Firma stellt Menschen ein, keine Anfragen. */
    const pool = musterPool();
    await aggregateDemandByRole(pool, {});
    assert.match(pool.abfragen[0].sql, /SUM\(dr\.headcount\)::int AS total_headcount/,
      "es wird nicht ueber die Kopfzahl summiert");
    assert.match(pool.abfragen[0].sql, /COUNT\(\*\)::int AS request_count/,
      "die Zahl der Anfragen fehlt — sie erklaert, ob 36 aus einer oder aus "
      + "zwanzig Bestellungen kommen");
  });

  it("der Ortsfilter ist schreibweisen-unabhaengig und gebunden", async () => {
    const pool = musterPool();
    await aggregateDemandByRole(pool, { city: "MÜNSTER" });
    const { sql, params } = pool.abfragen[0];
    assert.match(sql, /LOWER\(dr\.location_city\) = LOWER\(\$1\)/,
      "'Münster' und 'münster' waeren zwei verschiedene Orte");
    assert.equal(params[0], "MÜNSTER", "der Ort wurde nicht gebunden");
  });

  it("die Menge ist gedeckelt", async () => {
    const pool = musterPool();
    await aggregateDemandByRole(pool, { limit: 9999 });
    assert.equal(pool.abfragen[0].params.at(-1), 100,
      "ohne Deckel kann ein Aufruf die ganze Tabelle aggregieren");
  });
});

/* ── 2. Die Luecke ───────────────────────────────────────────────────── */

describe("N7.1 · gesucht und verfuegbar nebeneinander", () => {
  it("die Abnahme aus dem Plan: 34 gesucht, 6 verfuegbar", async () => {
    const pool = musterPool({
      nachfrage: [NACHFRAGE("Pflegekraft", 34, 3)],
      angebot: [ANGEBOT("Pflegekraft", 6, 2)]
    });
    const [zeile] = await getMarktLuecke(pool, { city: "Muenster" });

    assert.equal(zeile.role, "Pflegekraft");
    assert.equal(zeile.gesucht, 34);
    assert.equal(zeile.verfuegbar, 6);
    assert.equal(zeile.luecke, 28, "die Luecke ist die Zahl, wegen der die Firma hinsieht");
    assert.equal(zeile.anfragen, 3, "aus wie vielen Bestellungen die 34 kommen");
  });

  it("eine Rolle OHNE Angebot faellt nicht heraus", async () => {
    /*
     * Der wichtigste Fall. Genau die Rollen mit `verfuegbar: 0` sind die
     * Antwort auf die teuerste Frage der Firma — wen stelle ich als Naechstes
     * ein. Ein innerer Verbund haette sie stillschweigend verschluckt.
     */
    const [zeile] = await getMarktLuecke(musterPool({
      nachfrage: [NACHFRAGE("Schweisser", 12)],
      angebot: []
    }), {});
    assert.equal(zeile.role, "Schweisser");
    assert.equal(zeile.gesucht, 12);
    assert.equal(zeile.verfuegbar, 0);
    assert.equal(zeile.luecke, 12);
  });

  it("eine Rolle OHNE Nachfrage faellt auch nicht heraus", async () => {
    /* Die Gegenrichtung: "wir bieten 20 an, gesucht wird niemand" ist genauso
       eine Information — nur eine unangenehme. */
    const [zeile] = await getMarktLuecke(musterPool({
      nachfrage: [],
      angebot: [ANGEBOT("Staplerfahrer", 20)]
    }), {});
    assert.equal(zeile.role, "Staplerfahrer");
    assert.equal(zeile.gesucht, 0);
    assert.equal(zeile.verfuegbar, 20);
    assert.equal(zeile.luecke, -20);
  });

  it("verschiedene Schreibweisen derselben Rolle treffen sich", async () => {
    const [zeile, ...rest] = await getMarktLuecke(musterPool({
      nachfrage: [NACHFRAGE("Pflegekraft", 30)],
      angebot: [ANGEBOT("pflegekraft", 4)]
    }), {});
    assert.equal(rest.length, 0,
      "'Pflegekraft' und 'pflegekraft' stehen als zwei Zeilen da — die Firma liest "
      + "dann zwei halbe Wahrheiten statt einer ganzen");
    assert.equal(zeile.gesucht, 30);
    assert.equal(zeile.verfuegbar, 4);
  });

  it("die groesste Luecke steht oben", async () => {
    const zeilen = await getMarktLuecke(musterPool({
      nachfrage: [NACHFRAGE("A", 10), NACHFRAGE("B", 50), NACHFRAGE("C", 20)],
      angebot: [ANGEBOT("A", 1), ANGEBOT("B", 45), ANGEBOT("C", 0)]
    }), {});
    assert.deepEqual(zeilen.map((z) => z.role), ["C", "A", "B"],
      "sortiert wird nach der Luecke (20, 9, 5), nicht nach der Nachfrage");
  });

  it("DER ORT GILT FUER BEIDE HAELFTEN", async () => {
    /*
     * Der Grund, warum das ein Endpunkt ist und nicht zwei. Wer die Zahlen
     * getrennt holt, filtert sie irgendwann verschieden — und dann steht in der
     * Oberflaeche "34 gesucht in Muenster, 6 verfuegbar bundesweit". Das ist
     * kein Vergleich, sondern eine Irrefuehrung mit zwei richtigen Zahlen.
     */
    const pool = musterPool();
    await getMarktLuecke(pool, { city: "Kiel" });
    const nachfrage = pool.abfragen.find((a) => /demand_requests/i.test(a.sql));
    const angebot = pool.abfragen.find((a) => /capacity_posts/i.test(a.sql));
    assert.ok(nachfrage && angebot, "es wurde nicht auf beiden Seiten gefragt");
    assert.ok(nachfrage.params.includes("Kiel"),
      "die Nachfrageseite wurde nicht auf den Ort eingeschraenkt");
    assert.ok(angebot.params.includes("Kiel"),
      "die Angebotsseite wurde nicht auf den Ort eingeschraenkt — die beiden "
      + "Zahlen meinen dann verschiedene Gebiete");
  });
});

/* ── 3. Der Weg nach draussen ────────────────────────────────────────── */

describe("N7.1 · der Endpunkt reicht beides durch", () => {
  it("die Route ist montiert und gibt beide Zahlen aus", async () => {
    const { createCapacityDiscoveryRouter } = await import("../routes/capacityDiscovery.js");
    const pool = musterPool({
      nachfrage: [NACHFRAGE("Pflegekraft", 34, 3)],
      angebot: [ANGEBOT("Pflegekraft", 6, 2)]
    });
    const router = createCapacityDiscoveryRouter({ pool, requireAuth: (_q, _s, n) => n() });

    let handler = null;
    for (const l of router.stack) {
      if (l.route?.path === "/capacity-discovery/marktluecke" && l.route.methods.get) {
        handler = l.route.stack[l.route.stack.length - 1].handle;
      }
    }
    assert.ok(handler, "die Route ist nicht montiert — der Motor bleibt unsichtbar");

    let rumpf = null;
    await handler({ query: { city: "Muenster" } }, { json: (b) => { rumpf = b; } });
    assert.equal(rumpf.items[0].gesucht, 34);
    assert.equal(rumpf.items[0].verfuegbar, 6);
    assert.equal(rumpf.items[0].luecke, 28);
  });
});
