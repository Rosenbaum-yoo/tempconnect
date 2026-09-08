/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WELLE N2.4 — DIE TREFFER-VORSCHAU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Mit diesen Angaben: 23 Kraefte" — und die Zahl aendert sich mit jedem
 * Schritt.
 *
 * SIE KOMMT AUS DEMSELBEN ENDPUNKT, dessen Ergebnis der Kunde spaeter sieht
 * (`/capacity-exchange/feed`, `limit=1`, nur `total` gelesen). Ein eigener
 * Zaehler waere eine zweite Wahrheit ueber denselben Markt.
 *
 * DIE ZAHL WURDE ERST BELASTBAR GEMACHT — beides in dieser Sitzung:
 *   N2.4  `total` addierte beide Marktseiten (ein Unternehmen las 23, sah 6)
 *   N2.4b der Umkreis lief nach dem `LIMIT`, die Zahl kannte ihn nicht
 * Ohne diese zwei Reparaturen waere die Vorschau eine huebsche Luege gewesen.
 *
 * Diese Datei FUEHRT die Vorschau aus — mit Netz-Attrappe und handgebautem
 * DOM. Eine Probe, die nur den Quelltext liest, bliebe gruen, wenn nie
 * gezeichnet wird, der Platzhalter woertlich stehen bleibt oder jede
 * Tastenpause denselben Ort erneut bei einem fremden Dienst erfragt.
 *
 * Lauf: node --test --test-force-exit test/trefferVorschau.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SEITE = path.resolve(HIER, "..", "..", "frontend", "public", "marketplace_demand_create.html");
const da = fs.existsSync(SEITE);
const html = da ? fs.readFileSync(SEITE, "utf8") : "";

const PUNKT = { lat: 53.5083, lng: 10.1967 };

/** Der Assistenten-Block in einer Sandbox, mit Netz-Attrappe. */
function vorschau({ antworten = {}, feedTotal = 23, feedWirft = false } = {}) {
  const von = html.indexOf("var SCHRITTE = [");
  const bis = html.indexOf("window.__tcAssistent");
  assert.ok(von > 0 && bis > von, "der Assistent liegt nicht mehr, wo er lag");
  const quelle = html.slice(von, bis);
  assert.ok(quelle.includes("function holeTreffer"), "die Vorschau liegt nicht in diesem Block");

  const felder = {};
  ["location_city", "location_postal", "radius_km", "role", "skill_tags"].forEach((id) => {
    felder[id] = { id, value: "", addEventListener() {}, dispatchEvent() {} };
  });
  const ziel = {
    id: "asTreffer", hidden: false, innerHTML: "", _attr: {},
    setAttribute(a, v) { this._attr[a] = String(v); },
    removeAttribute(a) { delete this._attr[a]; },
    addEventListener() {}
  };

  const wege = [];
  const sandkasten = {
    document: {
      readyState: "loading",
      getElementById: (id) => (id === "asTreffer" ? ziel : (felder[id] || null)),
      querySelector: () => null,
      createElement: () => ({ textContent: "", innerHTML: "" }),
      addEventListener: () => {}
    },
    window: {}, Event: function () {}, Number, String, Math, Object, Array, JSON, RegExp,
    encodeURIComponent, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    fetch: (url) => {
      const s = String(url);
      wege.push(s);
      if (s.indexOf("/capacity-exchange/feed") >= 0) {
        if (feedWirft) return Promise.reject(new Error("Netz weg"));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ total: feedTotal, items: [] }) });
      }
      const treffer = Object.prototype.hasOwnProperty.call(antworten, s) ? antworten[s] : null;
      return Promise.resolve({ ok: treffer !== null, json: () => Promise.resolve(treffer) });
    }
  };
  vm.createContext(sandkasten);
  vm.runInContext(quelle
    + "\nglobalThis._treffer = holeTreffer;"
    + "\nglobalThis._punkt = punktFuer;"
    + "\nglobalThis._zeige = zeigeTreffer;",
    sandkasten, { filename: "trefferVorschau" });

  return { sandkasten, felder, ziel, wege };
}

const FREI_MIT_PLZ = "/api/geo/coordinates?q=21031%20Hamburg";
const FREI_NUR_ORT = "/api/geo/coordinates?q=Hamburg";
const STRUKTUR = "/api/geo/coordinates?postal_code=21031&city=Hamburg";

/* ═══════════════════════════════════════════════════════════════════════
   1. DER PUNKT WIRD WIE AM SERVER BESTIMMT
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.4 · der Ort wird genauso aufgeloest wie spaeter am Server", { skip: !da && "Seite fehlt" }, () => {

  it("mit PLZ der Freitext '<PLZ> <Ort>' — dieselbe Form wie marktGeoService", async () => {
    /*
     * Zaehlte die Vorschau gegen einen anderen Punkt als den, den der
     * angelegte Bedarf bekommt, waere sie eine Zahl ueber einen anderen Ort.
     */
    const v = vorschau({ antworten: { [FREI_MIT_PLZ]: PUNKT } });
    const p = await v.sandkasten._punkt("21031", "Hamburg");
    assert.deepStrictEqual(p, PUNKT);
    assert.deepStrictEqual(v.wege, [FREI_MIT_PLZ]);

    const dienst = fs.readFileSync(path.resolve(HIER, "..", "services", "marktGeoService.js"), "utf8");
    assert.match(dienst, /geocodeQuery\(ort \? `\$\{plz\} \$\{ort\}` : String\(plz\)\)/,
      "der Server baut die Freitext-Frage anders — die Vorschau zaehlt dann woanders");
  });

  it("ohne PLZ nur der Ort", async () => {
    const v = vorschau({ antworten: { [FREI_NUR_ORT]: PUNKT } });
    await v.sandkasten._punkt("", "Hamburg");
    assert.deepStrictEqual(v.wege, [FREI_NUR_ORT]);
  });

  it("findet der Freitext nichts, kommt der strukturierte Weg", async () => {
    const v = vorschau({ antworten: { [STRUKTUR]: PUNKT } });
    const p = await v.sandkasten._punkt("21031", "Hamburg");
    assert.deepStrictEqual(p, PUNKT);
    assert.deepStrictEqual(v.wege, [FREI_MIT_PLZ, STRUKTUR], "die Reihenfolge stimmt nicht");
  });

  it("ein Ort wird EINMAL aufgeloest — auch wenn er unbekannt ist", async () => {
    /* Sonst fragt jede Tastenpause denselben Ort erneut bei einem fremden
       Dienst, der ausdruecklich um Zurueckhaltung bittet. */
    const v = vorschau();
    await v.sandkasten._punkt("21031", "Hamburg");
    const nachErstem = v.wege.length;
    await v.sandkasten._punkt("21031", "Hamburg");
    await v.sandkasten._punkt("21031", "Hamburg");
    assert.strictEqual(v.wege.length, nachErstem,
      "ein unbekannter Ort wurde " + v.wege.length + "-mal gefragt");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. GEZAEHLT WIRD MIT DEMSELBEN ENDPUNKT
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.4 · die Zahl kommt aus dem Feed", { skip: !da && "Seite fehlt" }, () => {

  function bereit(extra = {}) {
    const v = vorschau({ antworten: { [FREI_MIT_PLZ]: PUNKT }, ...extra });
    v.felder.location_city.value = "Hamburg";
    v.felder.location_postal.value = "21031";
    v.felder.radius_km.value = "25";
    return v;
  }

  it("gefragt wird der Feed mit limit=1 — Punkt, Umkreis, Rolle und Faehigkeiten fahren mit", async () => {
    const v = bereit();
    v.felder.role.value = "Pflegefachkraft";
    v.felder.skill_tags.value = "Pflege, Nachtdienst";
    await v.sandkasten._treffer();

    const feed = v.wege.filter((w) => w.indexOf("/capacity-exchange/feed") >= 0);
    assert.strictEqual(feed.length, 1, "der Feed wurde nicht genau einmal gefragt");
    const u = feed[0];
    assert.ok(u.indexOf("limit=1") >= 0, "es wird eine ganze Seite geholt statt nur der Zahl");
    assert.ok(u.indexOf("latitude=53.5083") >= 0, "der Punkt fehlt");
    assert.ok(u.indexOf("longitude=10.1967") >= 0, "der Punkt fehlt");
    assert.ok(u.indexOf("radius_km=25") >= 0, "der Umkreis fehlt — dann zaehlt sie etwas anderes");
    assert.ok(u.indexOf("role=Pflegefachkraft") >= 0, "die Rolle fehlt");
    assert.ok(u.indexOf("skill_tags=") >= 0, "die Faehigkeiten fehlen");
  });

  it("die Zahl aus `total` steht auf dem Schirm", async () => {
    const v = bereit({ feedTotal: 23 });
    await v.sandkasten._treffer();
    assert.strictEqual(v.ziel.hidden, false, "die Zahl bleibt verborgen");
    assert.ok(v.ziel.innerHTML.indexOf("23") >= 0, "die Zahl fehlt: " + v.ziel.innerHTML);
    assert.ok(v.ziel.innerHTML.indexOf("{n}") < 0, "der Platzhalter steht woertlich da");
  });

  it("eine Kraft ist Einzahl, keine ist ein Hinweis", async () => {
    const eins = bereit({ feedTotal: 1 });
    await eins.sandkasten._treffer();
    assert.ok(/<b>1<\/b> Kraft/.test(eins.ziel.innerHTML), "Einzahl fehlt: " + eins.ziel.innerHTML);

    const keins = bereit({ feedTotal: 0 });
    await keins.sandkasten._treffer();
    assert.ok(keins.ziel.innerHTML.indexOf("niemand") >= 0, "die Null sagt nichts: " + keins.ziel.innerHTML);
    assert.strictEqual(keins.ziel._attr["data-leer"], "ja", "die Null ist nicht als solche gekennzeichnet");
    assert.ok(/Radius|Fähigkeiten/.test(keins.ziel.innerHTML),
      "bei null Treffern fehlt der Hinweis, was hilft");
  });

  it("eine juengere Antwort gewinnt — auch wenn die aeltere SPAETER eintrifft", async () => {
    /*
     * ERST NACH EINER RUECKMUTATION RICHTIG.
     *
     * Die erste Fassung stiess zweimal an und prueft die Zahl — aber beide
     * Laeufe lieferten dieselbe. Damit konnte sie alt und neu nicht
     * unterscheiden: das Entfernen der Wettlauf-Sperre blieb unbemerkt.
     *
     * Jetzt antwortet der erste Aufruf ANDERS und SPAETER als der zweite.
     * Genau das passiert beim Tippen: die Antwort auf "Ham" trifft nach der
     * Antwort auf "Hamburg" ein. Ohne Sperre stuende am Ende die Zahl zum
     * halb getippten Ort.
     */
    const v = bereit();
    let ruf = 0;
    const aufloeser = [];
    v.sandkasten.fetch = (url) => {
      const s = String(url);
      v.wege.push(s);
      if (s.indexOf("/capacity-exchange/feed") < 0) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(PUNKT) });
      }
      const meins = ++ruf;
      return new Promise((fertig) => {
        aufloeser.push(() => fertig({
          ok: true,
          json: () => Promise.resolve({ total: meins === 1 ? 111 : 222, items: [] })
        }));
      });
    };

    /*
     * DIE REIHENFOLGE IST HIER DIE SACHE — und sie hat einen zweiten Anlauf
     * gebraucht. Es gibt ZWEI Wettlauf-Sperren: eine gleich nach der
     * Ortsaufloesung und eine nach der Feed-Antwort. Wer beide Aufrufe
     * unmittelbar hintereinander anstoesst, prueft nur die ERSTE — der
     * aeltere Lauf bricht dann ab, bevor er den Feed ueberhaupt fragt.
     *
     * Die INNERE Sperre greift nur, wenn der aeltere Lauf schon beim Feed
     * steht, waehrend der juengere startet. Genau das wird hier gebaut:
     * warten, bis Anfrage 1 unterwegs ist, DANN erst die zweite anstossen.
     */
    const alt = v.sandkasten._treffer();
    for (let i = 0; i < 20 && aufloeser.length < 1; i++) {
      await new Promise((f) => setImmediate(f));
    }
    assert.strictEqual(aufloeser.length, 1, "die erste Abfrage ist nicht beim Feed angekommen");

    const neu = v.sandkasten._treffer();
    for (let i = 0; i < 20 && aufloeser.length < 2; i++) {
      await new Promise((f) => setImmediate(f));
    }
    assert.strictEqual(aufloeser.length, 2, "es wurden nicht zwei Abfragen gestellt");
    aufloeser[1]();            // die JUENGERE antwortet zuerst
    await new Promise((f) => setImmediate(f));
    aufloeser[0]();            // die AELTERE trifft danach ein
    await Promise.all([alt, neu]);

    assert.ok(v.ziel.innerHTML.indexOf("222") >= 0,
      "die juengere Zahl steht nicht da: " + v.ziel.innerHTML);
    assert.ok(v.ziel.innerHTML.indexOf("111") < 0,
      "die aeltere Antwort hat die juengere ueberschrieben");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. LIEBER NICHTS SAGEN ALS ETWAS ANDERES ZAEHLEN
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.4 · was die Vorschau NICHT tut", { skip: !da && "Seite fehlt" }, () => {

  it("ohne Ort und PLZ wird gar nicht gefragt", async () => {
    const v = vorschau();
    await v.sandkasten._treffer();
    assert.deepStrictEqual(v.wege, []);
    assert.strictEqual(v.ziel.hidden, true);
  });

  it("ohne aufloesbaren Punkt KEINE Zahl — nicht ersatzweise ohne Umkreis zaehlen", async () => {
    /*
     * Der Kern der Ehrlichkeit hier. Ohne Punkt liesse sich der Feed sehr wohl
     * fragen — nur zaehlte er dann ALLE Kraefte der Plattform, waehrend der
     * Satz darueber "im Umkreis" behauptet. Eine falsche Zahl ist schlimmer
     * als keine.
     */
    const v = vorschau();   // der Geocoder findet nichts
    v.felder.location_city.value = "Nirgendwo";
    await v.sandkasten._treffer();
    assert.strictEqual(v.wege.filter((w) => w.indexOf("/capacity-exchange/feed") >= 0).length, 0,
      "es wurde ohne Punkt gezaehlt");
    assert.strictEqual(v.ziel.hidden, true, "es steht eine Zahl da, die etwas anderes meint");
  });

  it("ein Netzfehler beim Feed zeigt nichts an, statt eine alte Zahl stehen zu lassen", async () => {
    const v = vorschau({ antworten: { [FREI_MIT_PLZ]: PUNKT }, feedWirft: true });
    v.felder.location_city.value = "Hamburg";
    v.felder.location_postal.value = "21031";
    await assert.doesNotReject(() => v.sandkasten._treffer());
    assert.strictEqual(v.ziel.hidden, true);
  });

  it("eine Antwort ohne `total` erzeugt keine Zahl", async () => {
    const v = vorschau({ antworten: { [FREI_MIT_PLZ]: PUNKT } });
    v.felder.location_city.value = "Hamburg";
    v.felder.location_postal.value = "21031";
    v.sandkasten.fetch = (url) => {
      const s = String(url);
      v.wege.push(s);
      if (s.indexOf("/capacity-exchange/feed") >= 0) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(PUNKT) });
    };
    await v.sandkasten._treffer();
    assert.strictEqual(v.ziel.hidden, true, "aus einer Antwort ohne Zahl wurde eine Zahl");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. DER KATALOGWAEHLER MELDET SEINE AUSWAHL
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.4 · ein per Skript gesetzter Wert muss sich melden", () => {

  it("skillPicker loest `change` aus, wenn er zurueckschreibt", () => {
    /*
     * Ein per Skript gesetzter Wert loest von sich aus KEIN `change` aus. Ohne
     * dieses Ereignis bekaeme die Vorschau von einer Faehigkeits-Auswahl nie
     * etwas mit — sie muesste pollen. Das Ereignis gehoert an die Stelle, die
     * den Wert aendert.
     */
    const waehler = path.resolve(HIER, "..", "..", "frontend", "public", "js", "skillPicker.js");
    if (!fs.existsSync(waehler)) return;
    const quelle = fs.readFileSync(waehler, "utf8");
    const block = /function schreibeZurueck\(\)[\s\S]*?\n    \}/.exec(quelle);
    assert.ok(block, "schreibeZurueck fehlt");
    assert.match(block[0], /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/,
      "der Waehler schreibt, ohne es zu melden");
    assert.ok(block[0].indexOf("feld.value =") < block[0].indexOf("dispatchEvent"),
      "gemeldet wird, bevor geschrieben ist");
  });

  it("die Vorschau hoert auf genau die Felder, die die Zahl aendern", { skip: !da && "Seite fehlt" }, () => {
    const block = /\["location_city", "location_postal", "radius_km", "role", "skill_tags"\]\.forEach/;
    assert.match(html, block, "es wird nicht auf alle zahl-relevanten Felder gehoert");
  });
});
