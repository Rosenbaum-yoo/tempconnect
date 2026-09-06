/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WELLE N2.0 — DER MARKTPLATZ BEKOMMT KOORDINATEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `matchingEngine.scoreMatch` bewertet die Entfernung nur, wenn BEIDE Seiten
 * Koordinaten haben. Fehlt eine, faellt sie auf einen Vergleich der
 * Stadt-ZEICHENKETTE zurueck — exakt geschrieben, 60 % des Ortsgewichts.
 *
 * Gemessen am 2026-09-06 in der laufenden Datenbank:
 *
 *   demand_requests   40 Zeilen,  5 mit Koordinaten,  40 mit Radius
 *   capacity_posts    45 Zeilen,  7 mit Koordinaten,  45 mit Radius
 *
 * `radius_km` wird also bei JEDER Zeile erfasst und praktisch nie benutzt.
 * Der Grund war keine fehlende Faehigkeit: `geoService.geocode()` gibt es
 * laengst, und Registrierung (`auth.js`), Profil (`me.js`) und Inserate
 * (`listings.js`) benutzen es — der Marktplatz als einziger nicht.
 *
 * WARUM DAS GERADE JETZT ZAEHLT: Owner-Vorgabe zu Welle N (Nachtrag
 * 2026-09-06) — der Einsatzort wird ausdruecklich gefragt, mit dem Hinweis
 * "genauere Angaben erhoehen die Trefferqualitaet". Ohne Koordinaten war
 * dieser Satz FALSCH: eine Postleitzahl aenderte am Ergebnis nichts.
 *
 * Lauf: node --test --test-force-exit test/marktBekommtKoordinaten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as marktGeo from "../services/marktGeoService.js";
import { scoreMatch } from "../services/matchingEngine.js";

/* ── Vorrichtung ───────────────────────────────────────────────────────── */

function pool(antwort = { rows: [], rowCount: 0 }) {
  const calls = [];
  const lauf = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    return typeof antwort === "function" ? antwort(String(sql), params) : antwort;
  };
  return { calls, query: lauf, connect: async () => ({ query: lauf, release() {} }) };
}

const stiller = { warn() {}, info() {}, error() {} };

/*
 * Der Kartendienst wird EINGESPEIST. Der erste Entwurf wollte ihn im
 * Modul-Namensraum ersetzen (`Object.defineProperty(geoService, ...)`) — das
 * wirft: ein ES-Modul-Namensraum ist unveraenderlich. Ohne die Naht im Dienst
 * liesse sich der wichtigste Fall dieser Datei ("der fremde Dienst faellt aus,
 * die Anlage laeuft trotzdem") nur gegen das echte Nominatim pruefen.
 */
const nachtragen = (pool, tabelle, zeile, geocode, logger = stiller) =>
  marktGeo.koordinatenNachtragen(pool, tabelle, zeile,
    { geocode, geocodeQuery: geocode, logger });

/* Getrennt, wo eine Probe die BEIDEN Wege unterscheiden muss. */
const nachtragenGetrennt = (pool, tabelle, zeile, wege) =>
  marktGeo.koordinatenNachtragen(pool, tabelle, zeile, { ...wege, logger: stiller });

const ZEILE = { id: "d1", location_city: "Münster", location_postal: "48143", location_lat: null, location_lng: null };

/* ═══════════════════════════════════════════════════════════════════════
   1. DER GRUND — ohne Koordinaten rechnet die Entfernung nicht
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.0 · warum das ueberhaupt gebraucht wird", () => {

  const kap = (ueber = {}) => ({
    role: "Pflegefachkraft", skill_tags: [], location_city: "Münster",
    radius_km: 25, ...ueber
  });
  const bed = (ueber = {}) => ({
    role: "Pflegefachkraft", skill_tags: [], location_city: "Münster",
    radius_km: 25, ...ueber
  });

  it("ohne Koordinaten sind 3 km und 300 km derselbe Treffer", () => {
    /*
     * Der Kern des Befunds. Ohne Punkte auf beiden Seiten kennt die Bewertung
     * nur "gleiche Stadt, gleich geschrieben" — die Entfernung faellt komplett
     * heraus, und der erfasste Radius wirkt nirgends.
     */
    const nah = scoreMatch(bed(), kap());
    const fern = scoreMatch(bed(), kap());
    assert.strictEqual(nah.score, fern.score);
    const grund = nah.reasons.find((r) => r.factor === "location");
    assert.ok(grund, "es gibt keinen Ortsgrund");
    assert.ok(!/km/.test(grund.detail), "es wird eine Entfernung behauptet: " + grund.detail);
  });

  it("MIT Koordinaten entscheidet die Entfernung — und der Radius wirkt", () => {
    // Münster (51.96/7.63) gegen einen Punkt ~5 km und einen ~150 km entfernt.
    const nah = scoreMatch(
      bed({ location_lat: 51.96, location_lng: 7.63 }),
      kap({ location_lat: 51.99, location_lng: 7.69 })
    );
    const fern = scoreMatch(
      bed({ location_lat: 51.96, location_lng: 7.63 }),
      kap({ location_lat: 50.94, location_lng: 6.96 })
    );
    assert.ok(nah.score > fern.score,
      `nah (${nah.score}) muesste besser sein als fern (${fern.score})`);
    const grundNah = nah.reasons.find((r) => r.factor === "location");
    assert.ok(/km/.test(grundNah.detail), "die Entfernung wird nicht benannt: " + grundNah.detail);
    assert.strictEqual(grundNah.meta.withinRadius, true);

    const grundFern = fern.reasons.find((r) => r.factor === "location");
    assert.strictEqual(grundFern.meta.withinRadius, false, "150 km gelten als im Radius");
    assert.strictEqual(grundFern.points, 0);
  });

  it("die Schreibweise entscheidet, solange nur die Stadt zaehlt", () => {
    /* "Münster" und "Muenster" sind fuer den Rueckfall zwei Orte. Genau diese
       Zerbrechlichkeit verschwindet, sobald Koordinaten da sind. */
    const gleich = scoreMatch(bed({ location_city: "Münster" }), kap({ location_city: "Münster" }));
    const anders = scoreMatch(bed({ location_city: "Münster" }), kap({ location_city: "Muenster" }));
    assert.ok(gleich.score > anders.score,
      "die Schreibweise macht keinen Unterschied — dann ist der Befund anders als beschrieben");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. DAS NACHTRAGEN SELBST
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.0 · koordinatenNachtragen", () => {

  it("mit PLZ wird der FREITEXT gefragt — daran haengt der Genauigkeitsgewinn", async () => {
    /*
     * ERST NACH EINER MESSUNG RICHTIG.
     *
     * Die erste Fassung nahm `geocode(plz, ort)` und behauptete, das ergebe
     * einen Punkt IN der Stadt. Gegen den echten Dienst gemessen (2026-09-06)
     * stimmte das in drei von vier Faellen NICHT — Münster, Hamburg und
     * München lieferten mit und ohne PLZ denselben Punkt. Der Hinweis
     * "genauere Angaben erhoehen die Trefferqualitaet" waere damit Zierde
     * gewesen.
     *
     * Der Freitext loest sie auf (3,4–10,6 km Unterschied zur Ortsmitte).
     * Diese Probe haelt fest, dass er auch benutzt wird.
     */
    const frei = [];
    const strukturiert = [];
    const p = pool({ rows: [{ ...ZEILE, location_lat: 51.96, location_lng: 7.63 }], rowCount: 1 });
    await nachtragenGetrennt(p, "demand_requests", ZEILE, {
      geocodeQuery: async (q) => { frei.push(q); return { lat: 51.96, lng: 7.63 }; },
      geocode: async (plz, ort) => { strukturiert.push([plz, ort]); return { lat: 0, lng: 0 }; }
    });
    assert.deepStrictEqual(frei, ["48143 Münster"], "die PLZ geht nicht als Freitext raus");
    assert.deepStrictEqual(strukturiert, [], "der Weg, der die PLZ verschluckt, wurde genommen");
  });

  it("ohne PLZ bleibt es beim Ort — kein sinnloser Freitext", async () => {
    const frei = [];
    const strukturiert = [];
    const p = pool({ rows: [{ id: "d1", location_lat: 1, location_lng: 2 }], rowCount: 1 });
    await nachtragenGetrennt(p, "demand_requests",
      { id: "d1", location_city: "Münster", location_postal: null }, {
        geocodeQuery: async (q) => { frei.push(q); return { lat: 1, lng: 2 }; },
        geocode: async (plz, ort) => { strukturiert.push([plz, ort]); return { lat: 1, lng: 2 }; }
      });
    assert.deepStrictEqual(frei, []);
    assert.deepStrictEqual(strukturiert, [[null, "Münster"]]);
  });

  it("findet der Freitext nichts, rettet der strukturierte Weg den Ortsmittelpunkt", async () => {
    /* Ein Mittelpunkt ist immer noch besser als gar kein Punkt: er schaltet die
       Entfernungsrechnung ueberhaupt erst ein. */
    const p = pool({ rows: [{ ...ZEILE, location_lat: 51.96, location_lng: 7.62 }], rowCount: 1 });
    const zurueck = await nachtragenGetrennt(p, "demand_requests", ZEILE, {
      geocodeQuery: async () => null,
      geocode: async () => ({ lat: 51.96, lng: 7.62 })
    });
    assert.deepStrictEqual(p.calls[0].params, ["d1", 51.96, 7.62]);
    assert.strictEqual(zurueck.location_lat, 51.96);
  });

  it("schreibt die Koordinaten auf die richtige Zeile und gibt sie zurueck", async () => {
    const p = pool({ rows: [{ ...ZEILE, location_lat: 51.96, location_lng: 7.63 }], rowCount: 1 });
    const zurueck = await nachtragen(p, "demand_requests", ZEILE, async () => ({ lat: 51.96, lng: 7.63 }));
    const q = p.calls[0];
    assert.match(q.sql, /UPDATE demand_requests/);
    assert.deepStrictEqual(q.params, ["d1", 51.96, 7.63]);
    assert.strictEqual(zurueck.location_lat, 51.96);
  });

  it("die Marktseite entscheidet die Tabelle", async () => {
    const p = pool({ rows: [{ id: "c1", location_lat: 1, location_lng: 2 }], rowCount: 1 });
    await nachtragen(p, "capacity_posts", { ...ZEILE, id: "c1" }, async () => ({ lat: 1, lng: 2 }));
    assert.match(p.calls[0].sql, /UPDATE capacity_posts/);
  });

  it("eine fremde Tabelle wird abgelehnt, nicht eingesetzt", async () => {
    /* Der Name fliesst UNMASKIERT ins SQL. Die Schranke steht hier, nicht im
       Vertrauen auf alle kuenftigen Aufrufer. */
    const p = pool();
    const zurueck = await nachtragen(p, "users; DROP TABLE users --", ZEILE, async () => ({ lat: 1, lng: 2 }));
    assert.strictEqual(p.calls.length, 0, "es wurde etwas geschrieben");
    assert.strictEqual(zurueck, ZEILE);
  });

  it("wer schon Koordinaten hat, wird nicht gefragt", async () => {
    // Ein Rundlauf zu einem fremden Dienst fuer etwas, das dasteht.
    let gefragt = 0;
    const p = pool();
    const schon = { ...ZEILE, location_lat: 1, location_lng: 2 };
    const zurueck = await nachtragen(p, "demand_requests", schon,
      async () => { gefragt++; return { lat: 9, lng: 9 }; });
    assert.strictEqual(gefragt, 0);
    assert.strictEqual(p.calls.length, 0);
    assert.strictEqual(zurueck.location_lat, 1, "eine vorhandene Angabe wurde ueberschrieben");
  });

  it("ohne Ort und ohne PLZ wird nicht gefragt", async () => {
    let gefragt = 0;
    const p = pool();
    await nachtragen(p, "demand_requests", { id: "d1", location_city: null, location_postal: null },
      async () => { gefragt++; return { lat: 1, lng: 2 }; });
    assert.strictEqual(gefragt, 0);
    assert.strictEqual(p.calls.length, 0);
  });

  it("das Schreiben laesst eine inzwischen gesetzte Angabe stehen", async () => {
    /* Zwischen Lesen und Schreiben kann jemand echte Koordinaten gesetzt
       haben. Dann gilt seine Angabe, nicht die nachtraegliche Schaetzung. */
    const p = pool({ rows: [], rowCount: 0 });
    const zurueck = await nachtragen(p, "demand_requests", ZEILE, async () => ({ lat: 51.96, lng: 7.63 }));
    assert.match(p.calls[0].sql, /location_lat IS NULL/,
      "der Schutz gegen Ueberschreiben fehlt");
    assert.strictEqual(zurueck, ZEILE, "die leere Antwort wurde als Ergebnis genommen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. DIE ANLAGE SCHEITERT NIE AN EINEM FREMDEN DIENST
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.0 · ein Kartendienst darf keinen Bedarf verhindern", () => {

  it("kein Treffer beim Geocoder: die Zeile bleibt gueltig", async () => {
    const p = pool();
    const zurueck = await nachtragen(p, "demand_requests", ZEILE, async () => null);
    assert.strictEqual(zurueck, ZEILE);
    assert.strictEqual(p.calls.length, 0, "es wurde ohne Punkt geschrieben");
  });

  it("der Geocoder wirft: die Zeile bleibt gueltig", async () => {
    /*
     * DIE WICHTIGSTE PROBE DIESER DATEI. Ohne sie waere eine Bedarfsanlage
     * davon abhaengig, dass ein fremder Server in Europa gerade antwortet —
     * der Nutzer haette alles richtig gemacht und bekaeme einen Fehler.
     */
    const p = pool();
    const zurueck = await nachtragen(p, "demand_requests", ZEILE, async () => { throw new Error("Nominatim weg"); });
    assert.strictEqual(zurueck, ZEILE);
  });

  it("die Datenbank wirft beim Nachtragen: die Zeile bleibt gueltig", async () => {
    const p = { calls: [], query: async () => { throw new Error("deadlock"); } };
    const zurueck = await nachtragen(p, "demand_requests", ZEILE, async () => ({ lat: 1, lng: 2 }));
    assert.strictEqual(zurueck, ZEILE);
  });

  it("und ohne Protokollierer wirft es auch nicht", async () => {
    // `logger` ist wahlfrei; ein fehlender darf nicht zum zweiten Fehler werden.
    const p = pool();
    await assert.doesNotReject(() => marktGeo.koordinatenNachtragen(p, "demand_requests", ZEILE,
      { geocode: async () => { throw new Error("x"); } }));
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. DIE VERDRAHTUNG — beide Marktseiten, und vor dem Matching
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.0 · beide Seiten sind verdrahtet", () => {
  /* Statisch geladen, nicht per `await import` in einem `async describe`: das
     hielt beim erzwungenen Ausstieg (`--test-force-exit`) einen Griff offen und
     erzeugte den libuv-Abbruch, den zwei andere Suiten dieses Repos schon
     haben. Die Proben waren dabei gruen — die DATEI galt trotzdem als rot. */
  const HIER = path.dirname(fileURLToPath(import.meta.url));
  const ROUTE = fs.readFileSync(path.resolve(HIER, "..", "routes", "marketplace.js"), "utf8");

  it("der Bedarf wird geokodiert — VOR dem Matching", () => {
    /*
     * Die Reihenfolge ist die Sache. `scheduleMatchTrigger` stoesst die
     * Zuordnung an; kaemen die Koordinaten danach, liefe genau der erste und
     * fuer den Kunden sichtbarste Durchgang noch ohne sie.
     */
    const geo = ROUTE.indexOf('koordinatenNachtragen(pool, "demand_requests"');
    const match = ROUTE.indexOf('scheduleMatchTrigger(pool, { sourceType: "demand_request"');
    assert.ok(geo > 0, "der Bedarf wird nicht geokodiert");
    assert.ok(match > 0, "der Matchtrigger ist weg");
    assert.ok(geo < match, "die Koordinaten kommen erst nach dem Matching");
  });

  it("das Angebot wird ebenso geokodiert", () => {
    // Eine Seite allein bringt nichts: die Entfernung braucht beide.
    assert.ok(ROUTE.includes('koordinatenNachtragen(pool, "capacity_posts"'),
      "nur der Bedarf bekommt Koordinaten — die Entfernung rechnet trotzdem nicht");
  });
});
