/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WELLE N2.0b — DAS NACHTRAGE-SKRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Seit N2.0 bekommt jeder NEUE Bedarf und jedes NEUE Angebot Koordinaten. Der
 * Bestand hatte keine — und die Entfernungsbewertung braucht BEIDE Seiten.
 *
 * Gemessen und ausgefuehrt am 2026-09-06 gegen die laufende Datenbank:
 *
 *   vorher   aktive Angebote 13, davon  0 mit Koordinaten
 *            offene Bedarfe   9, davon  0
 *   nachher  aktive Angebote 13, davon 13
 *            offene Bedarfe  11, davon 11
 *
 * Und der Beleg dafuer, dass die Postleitzahl wirklich etwas aendert:
 * "21031 Hamburg" loest auf 53.5083/10.1967 auf, blankes "Hamburg" auf
 * 53.5502/10.0013 — **13,7 km** auseinander. Bei 25 km Umkreis entscheidet
 * das ueber drin oder draussen.
 *
 * Diese Datei bewacht die Regeln des Skripts. Sie fuehrt es aus, mit
 * eingespeistem Frager und Muster-Pool — kein Netz, keine Datenbank.
 *
 * Lauf: node --test --test-force-exit test/koordinatenNachtragenSkript.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { nachtragen, merkenderFrager } from "../scripts/koordinaten-nachtragen.js";

/* ── Vorrichtung ───────────────────────────────────────────────────────── */

function pool(zeilenJeTabelle = {}) {
  const calls = [];
  const lauf = async (sql, params = []) => {
    const s = String(sql);
    calls.push({ sql: s, params });
    if (/^\s*SELECT id, location_city/.test(s)) {
      const tabelle = /FROM (\w+)/.exec(s)?.[1];
      return { rows: (zeilenJeTabelle[tabelle] || []).map((z) => ({ ...z })) };
    }
    if (/^\s*UPDATE/.test(s)) {
      return { rows: [{ id: params[0], location_lat: params[1], location_lng: params[2] }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query: lauf, connect: async () => ({ query: lauf, release() {} }) };
}

/** Ein Frager wie der echte — nur ohne Netz und ohne Wartezeit. */
function frager(punkte = {}) {
  const gemerkt = new Map();
  const gefragt = [];
  let echteAbfragen = 0;
  const einmal = (schluessel, antwort) => async (...args) => {
    const k = schluessel(...args);
    if (gemerkt.has(k)) return gemerkt.get(k);
    gefragt.push(k);
    const p = antwort(...args);
    gemerkt.set(k, p);
    echteAbfragen++;
    return p;
  };
  return {
    gefragt,
    geocode: einmal((plz, ort) => `s|${plz || ""}|${ort || ""}`,
      (plz, ort) => punkte[`${plz || ""}|${ort || ""}`] ?? punkte[`|${ort || ""}`] ?? null),
    geocodeQuery: einmal((q) => `q|${q}`, (q) => punkte[q] ?? null),
    bericht: () => ({ echteAbfragen, verschiedene: gemerkt.size })
  };
}

const still = () => {};

const HH = { id: "a1", location_city: "Hamburg", location_postal: "21031", location_lat: null, location_lng: null };
const HH2 = { ...HH, id: "a2" };
const HH3 = { ...HH, id: "a3" };
const B = { id: "d1", location_city: "Berlin", location_postal: null, location_lat: null, location_lng: null };

const PUNKTE = {
  "21031 Hamburg": { lat: 53.5083, lng: 10.1967 },
  "|Berlin": { lat: 52.5174, lng: 13.3951 }
};

/* ═══════════════════════════════════════════════════════════════════════ */

describe("N2.0b · ein Ort wird einmal gefragt", () => {

  it("drei Zeilen mit demselben Ort kosten EINE Abfrage", async () => {
    /*
     * Der erste Trockenlauf zeigte 22 Zeilen mit sieben verschiedenen Orten —
     * "21031 Hamburg" allein siebenmal. 22 Abfragen fuer 7 Antworten waeren
     * unhoeflich gegenueber einem Dienst, der freiwillig und kostenlos
     * antwortet und genau deshalb um Zurueckhaltung bittet.
     */
    const f = frager(PUNKTE);
    const p = pool({ capacity_posts: [HH, HH2, HH3] });
    const e = await nachtragen({ pool: p, melden: still, frager: f });
    assert.strictEqual(e.gesetzt, 3, "nicht alle drei Zeilen bekamen den Punkt");
    assert.strictEqual(f.bericht().echteAbfragen, 1, "es wurde mehr als einmal gefragt");
  });

  it("verschiedene Orte werden getrennt gefragt", async () => {
    const f = frager(PUNKTE);
    const p = pool({ capacity_posts: [HH], demand_requests: [B] });
    await nachtragen({ pool: p, melden: still, frager: f });
    assert.strictEqual(f.bericht().echteAbfragen, 2);
  });

  it("auch ein NICHT-Treffer wird gemerkt — der Aufwand waechst nicht mit den Zeilen", async () => {
    /*
     * Sonst fragt der Lauf denselben unbekannten Ort siebenmal vergeblich —
     * und wartet zwischen jedem Versuch eine Sekunde.
     *
     * Die Zahl ist ZWEI, nicht eins, und das ist richtig: bei vorhandener PLZ
     * probiert `koordinatenNachtragen` erst den Freitext und dann den
     * strukturierten Weg. Zwei Wege, jeder EINMAL. Meine erste Fassung dieser
     * Probe forderte eins und war damit falsch — nicht der Code.
     *
     * Gemessen wird deshalb die eigentliche Zusicherung: DREI Zeilen kosten
     * nicht mehr als EINE.
     */
    const einZeiler = frager({});
    await nachtragen({ pool: pool({ capacity_posts: [HH] }), melden: still, frager: einZeiler });
    const beiEiner = einZeiler.bericht().echteAbfragen;

    const f = frager({});
    const p = pool({ capacity_posts: [HH, HH2, HH3] });
    const e = await nachtragen({ pool: p, melden: still, frager: f });
    assert.strictEqual(e.gesetzt, 0);
    assert.strictEqual(e.ohneTreffer, 3);
    assert.strictEqual(f.bericht().echteAbfragen, beiEiner,
      `drei Zeilen kosteten ${f.bericht().echteAbfragen} Abfragen, eine kostet ${beiEiner}`);
  });
});

describe("N2.0b · was ausgewaehlt wird", () => {

  it("nur Zeilen OHNE Koordinaten — eine vorhandene Angabe ist nie Ziel", async () => {
    /* Sie kann von Hand gesetzt und genauer sein als jede Schaetzung. */
    const p = pool({ capacity_posts: [HH] });
    await nachtragen({ pool: p, melden: still, frager: frager(PUNKTE) });
    const auswahl = p.calls.find((c) => /SELECT id, location_city/.test(c.sql));
    assert.match(auswahl.sql, /location_lat IS NULL/);
    assert.match(auswahl.sql, /location_lng IS NULL/);
  });

  it("und nur Zeilen mit Ort ODER PLZ — ohne beides gibt es nichts zu fragen", async () => {
    const p = pool({ capacity_posts: [HH] });
    await nachtragen({ pool: p, melden: still, frager: frager(PUNKTE) });
    const auswahl = p.calls.find((c) => /SELECT id, location_city/.test(c.sql));
    assert.match(auswahl.sql, /location_city IS NOT NULL OR location_postal IS NOT NULL/);
  });

  it("standardmaessig nur der LEBENDE Bestand", async () => {
    /*
     * Geschlossene Zeilen zu geokodieren kostet Abfragen bei einem fremden
     * Dienst fuer etwas, das niemand mehr sucht.
     */
    const p = pool({ capacity_posts: [HH] });
    await nachtragen({ pool: p, melden: still, frager: frager(PUNKTE) });
    const abfragen = p.calls.filter((c) => /SELECT id, location_city/.test(c.sql));
    assert.ok(abfragen.some((c) => /status = 'active'/.test(c.sql)), "Angebote nicht auf aktiv begrenzt");
    assert.ok(abfragen.some((c) => /status = 'open'/.test(c.sql)), "Bedarfe nicht auf offen begrenzt");
  });

  it("--alle hebt die Begrenzung auf", async () => {
    const p = pool({ capacity_posts: [HH] });
    await nachtragen({ pool: p, alle: true, melden: still, frager: frager(PUNKTE) });
    const abfragen = p.calls.filter((c) => /SELECT id, location_city/.test(c.sql));
    assert.ok(abfragen.every((c) => !/status =/.test(c.sql)), "die Begrenzung steht noch drin");
  });

  it("beide Marktseiten werden bedient", async () => {
    // Eine Seite allein bringt nichts: die Entfernung braucht beide.
    const p = pool({ capacity_posts: [HH], demand_requests: [B] });
    const e = await nachtragen({ pool: p, melden: still, frager: frager(PUNKTE) });
    assert.strictEqual(e.gesetzt, 2);
    const tabellen = p.calls.filter((c) => /SELECT id, location_city/.test(c.sql))
      .map((c) => /FROM (\w+)/.exec(c.sql)[1]);
    assert.deepStrictEqual(tabellen.sort(), ["capacity_posts", "demand_requests"]);
  });
});

describe("N2.0b · der Trockenlauf", () => {

  it("schreibt nichts und fragt niemanden", async () => {
    /* Ein "Trockenlauf", der einen fremden Dienst befragt, ist keiner. */
    const f = frager(PUNKTE);
    const p = pool({ capacity_posts: [HH, HH2], demand_requests: [B] });
    const e = await nachtragen({ pool: p, trocken: true, melden: still, frager: f });
    assert.strictEqual(e.gefunden, 3, "er zeigt nicht, was er taete");
    assert.strictEqual(e.gesetzt, 0);
    assert.strictEqual(f.bericht().echteAbfragen, 0, "der Trockenlauf hat gefragt");
    assert.strictEqual(p.calls.filter((c) => /^\s*UPDATE/.test(c.sql)).length, 0,
      "der Trockenlauf hat geschrieben");
  });
});

describe("N2.0b · er ist wiederholbar", () => {

  it("ein zweiter Lauf findet nur noch, was offen blieb", async () => {
    /*
     * Die Wiederholbarkeit ist keine Bequemlichkeit: der Lauf haengt an einem
     * fremden Dienst und kann mittendrin abbrechen. Wer dann nicht einfach
     * noch einmal starten kann, muss von Hand herausfinden, wo er stand.
     */
    const f = frager({});   // nichts aufloesbar
    const p = pool({ capacity_posts: [HH] });
    const erste = await nachtragen({ pool: p, melden: still, frager: f });
    assert.strictEqual(erste.ohneTreffer, 1);

    const f2 = frager(PUNKTE);   // jetzt antwortet der Dienst
    const p2 = pool({ capacity_posts: [HH] });
    const zweite = await nachtragen({ pool: p2, melden: still, frager: f2 });
    assert.strictEqual(zweite.gesetzt, 1, "der zweite Lauf holt das Versaeumte nicht nach");
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
 * DER ECHTE SPEICHER — nicht der eingespeiste
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Diese vier Proben gibt es, weil zwei Rueckmutationen ueberlebt haben. Die
 * Proben oben speisen ihren EIGENEN Frager ein und ruehren `merkenderFrager`
 * damit nie an — man konnte den Speicher ausbauen, ohne dass etwas rot wurde.
 * Dieselbe Luecke wie in N4.4: die Naht macht testbar und laesst die
 * Standardfassung unbewacht.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("N2.0b · merkenderFrager selbst", () => {

  function zaehlend(antwort = { lat: 1, lng: 2 }) {
    const rufe = [];
    return {
      rufe,
      geocode: async (plz, ort) => { rufe.push(`s|${plz || ""}|${ort || ""}`); return antwort; },
      geocodeQuery: async (q) => { rufe.push(`q|${q}`); return antwort; }
    };
  }

  it("derselbe Ort wird nur einmal durchgereicht", async () => {
    const echt = zaehlend();
    const f = merkenderFrager(still, echt);
    await f.geocodeQuery("21031 Hamburg");
    await f.geocodeQuery("21031 Hamburg");
    await f.geocodeQuery("21031 Hamburg");
    assert.deepStrictEqual(echt.rufe, ["q|21031 Hamburg"]);
    assert.strictEqual(f.bericht().echteAbfragen, 1);
  });

  it("verschiedene Orte kommen durch", async () => {
    const echt = zaehlend();
    const f = merkenderFrager(still, echt);
    await f.geocodeQuery("21031 Hamburg");
    await f.geocodeQuery("50667 Köln");
    assert.strictEqual(echt.rufe.length, 2);
    assert.strictEqual(f.bericht().verschiedene, 2);
  });

  it("die beiden Wege haben getrennte Schluessel", async () => {
    /* Freitext und strukturierte Abfrage liefern verschiedene Punkte fuer
       denselben Ort (gemessen: 13,7 km). Ein gemeinsamer Schluessel gaebe die
       Antwort des einen Weges auf die Frage des anderen. */
    const echt = zaehlend();
    const f = merkenderFrager(still, echt);
    await f.geocodeQuery("21031 Hamburg");
    await f.geocode("21031", "Hamburg");
    assert.strictEqual(echt.rufe.length, 2, "die beiden Wege teilen sich einen Schluessel");
  });

  it("auch `null` wird gemerkt — ein unbekannter Ort wird nicht wiederholt gefragt", async () => {
    const echt = zaehlend(null);
    const f = merkenderFrager(still, echt);
    for (let i = 0; i < 5; i++) await f.geocodeQuery("Nirgendwo");
    assert.deepStrictEqual(echt.rufe, ["q|Nirgendwo"],
      "ein unbekannter Ort wurde " + echt.rufe.length + "-mal gefragt");
  });
});
