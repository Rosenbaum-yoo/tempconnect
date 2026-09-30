/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BEIDE MARKTSEITEN LOESEN EINEN ORT GLEICH AUF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Seit Welle N2.0 geokodiert der Server beim Anlegen (`marktGeoService`), und
 * seit N2.4b rechnet der Umkreis wirklich mit diesen Punkten. Damit wird die
 * Frage wichtig, WIE ein Ort zu einem Punkt wird — und zwar auf beiden Seiten
 * gleich.
 *
 * Gemessen am 2026-09-06/07 gegen den echten Dienst: die STRUKTURIERTE Abfrage
 * (postal_code= + city=) ignoriert die Postleitzahl meistens.
 *
 *   48143 + Münster  vs  nur Münster   0,0 km
 *   21031 + Hamburg  vs  nur Hamburg   0,0 km
 *   81929 + München  vs  nur München   0,0 km
 *   13403 + Berlin   vs  nur Berlin    9,3 km
 *
 * Der FREITEXT loest sie auf — 3,4 bis 10,6 km vom Ortsmittelpunkt.
 *
 * Das Angebotsformular nahm bis zum 2026-09-07 genau umgekehrt: mit PLZ die
 * strukturierte Abfrage. Angebote bekamen damit den Stadtmittelpunkt, waehrend
 * der Server Bedarfe auf den Stadtteil legte. Zwei Reihenfolgen, zwei Punkte
 * fuer denselben Ort — und eine Entfernung, die von beidem abhaengt.
 *
 * Lauf: node --test --test-force-exit test/dieselbeOrtsaufloesung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const FORM = path.resolve(HIER, "..", "..", "frontend", "public", "js", "pages", "capacityExchangeForm.js");
const da = fs.existsSync(FORM);

/** Schneidet `geocode` heraus und laesst es mit einer Netz-Attrappe laufen. */
function aufloeser({ treffer = {} } = {}) {
  const quelle = fs.readFileSync(FORM, "utf8");
  const von = quelle.indexOf("function geocode(city, postal) {");
  assert.ok(von > 0, "geocode liegt nicht mehr, wo es lag");
  /* Bis zur schliessenden Klammer auf derselben Einrueckung. */
  const bis = quelle.indexOf("\n    }", von);
  assert.ok(bis > von, "das Ende von geocode ist nicht auffindbar");
  const ausschnitt = quelle.slice(von, bis + 6);

  const wege = [];
  const sandkasten = {
    API: "/api",
    encodeURIComponent,
    String,
    console,
    fetch: (url) => {
      wege.push(String(url));
      const antwort = Object.prototype.hasOwnProperty.call(treffer, String(url))
        ? treffer[String(url)]
        : null;
      return Promise.resolve({
        ok: antwort !== null,
        json: () => Promise.resolve(antwort)
      });
    }
  };
  vm.createContext(sandkasten);
  vm.runInContext(ausschnitt + "\nglobalThis._geo = geocode;", sandkasten, { filename: "geocode" });
  return { sandkasten, wege };
}

const FREI = "/api/geo/coordinates?q=21031%20Hamburg";
const STRUKTUR = "/api/geo/coordinates?postal_code=21031&city=Hamburg";
const NUR_ORT = "/api/geo/coordinates?q=Hamburg";
const PUNKT = { lat: 53.5083, lng: 10.1967 };

describe("Ortsaufloesung · das Angebotsformular fragt wie der Server", { skip: !da && "Datei fehlt" }, () => {

  it("mit PLZ zuerst den FREITEXT — nur er loest sie auf", async () => {
    /*
     * Der Kern. Vorher lief die strukturierte Abfrage, die die PLZ in drei von
     * vier gemessenen Faellen verschluckt hat.
     */
    const a = aufloeser({ treffer: { [FREI]: PUNKT } });
    const p = await a.sandkasten._geo("Hamburg", "21031");
    assert.deepStrictEqual(p, PUNKT);
    assert.deepStrictEqual(a.wege, [FREI],
      "es wurde nicht der Freitext gefragt: " + a.wege.join(" | "));
  });

  it("findet der Freitext nichts, rettet der strukturierte Weg", async () => {
    /* Ein Ortsmittelpunkt ist besser als gar kein Punkt: er schaltet die
       Entfernungsrechnung ueberhaupt erst ein. */
    const a = aufloeser({ treffer: { [STRUKTUR]: { lat: 53.55, lng: 10.0 } } });
    const p = await a.sandkasten._geo("Hamburg", "21031");
    assert.deepStrictEqual(p, { lat: 53.55, lng: 10.0 });
    assert.deepStrictEqual(a.wege, [FREI, STRUKTUR], "die Reihenfolge stimmt nicht");
  });

  it("ohne PLZ bleibt es beim Ort — kein sinnloser zweiter Versuch", async () => {
    const a = aufloeser({ treffer: { [NUR_ORT]: PUNKT } });
    const p = await a.sandkasten._geo("Hamburg", "");
    assert.deepStrictEqual(p, PUNKT);
    assert.deepStrictEqual(a.wege, [NUR_ORT]);
  });

  it("findet niemand etwas, kommt `null` — kein erfundener Punkt", async () => {
    /* Ein erfundener Punkt waere schlimmer als keiner: die Entfernung rechnete
       dann gegen einen Ort, an dem niemand ist. */
    const a = aufloeser();
    assert.strictEqual(await a.sandkasten._geo("Nirgendwo", "00000"), null);
    assert.strictEqual(a.wege.length, 2, "es wurden nicht beide Wege versucht");
  });

  it("die Freitext-Form ist dieselbe wie im Server", async () => {
    /*
     * `marktGeoService` baut `${plz} ${ort}`. Baut der Browser etwas anderes,
     * bekommt derselbe Ort zwei verschiedene Punkte — je nachdem, wer ihn
     * gerade bestimmt. Genau das soll diese Datei verhindern.
     */
    const dienst = fs.readFileSync(path.resolve(HIER, "..", "services", "marktGeoService.js"), "utf8");
    assert.match(dienst, /geocodeQuery\(ort \? `\$\{plz\} \$\{ort\}` : String\(plz\)\)/,
      "der Server baut die Freitext-Frage anders als gedacht");

    const a = aufloeser({ treffer: { [FREI]: PUNKT } });
    await a.sandkasten._geo("Hamburg", "21031");
    assert.strictEqual(decodeURIComponent(a.wege[0].split("q=")[1]), "21031 Hamburg",
      "der Browser baut die Freitext-Frage anders als der Server");
  });
});
