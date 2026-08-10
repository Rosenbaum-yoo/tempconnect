/**
 * P10 Spur D / Welle D1 — der Import sagt, was los ist.
 *
 * DER DEFEKT
 * `POST /workers/import` prueft mit Zod und antwortet bei einem Verstoss mit
 * { error: "VALIDATION", details: [...] } — jeder Eintrag mit `path`
 * ["workers", <index>, "<feld>"] und einer Begruendung (api/routes/workers.js:320).
 * Die Seite hat `details` nie angefasst: der Nutzer sah das Wort "VALIDATION"
 * und eine leere Box. Der Server wusste die Antwort, die Oberflaeche verschwieg sie.
 *
 * ZWEI UEBERSETZUNGEN, DIE STIMMEN MUESSEN
 *   Index -> CSV-Zeile   Der Server zaehlt das GESENDETE Array. Ungueltige Zeilen
 *                        werden vorher herausgefiltert — ohne die parallel
 *                        mitgefuehrten Zeilennummern zeigt der Hinweis auf die
 *                        falsche Zeile. Das waere schlimmer als gar keiner.
 *   Feld  -> Spaltenkopf Der Nutzer kennt "Gebdatum", nicht "date_of_birth".
 *
 * Die Logik wird hier WIRKLICH ausgefuehrt (vm-Sandbox mit gestellter Umgebung),
 * nicht nur im Quelltext gesucht.
 *
 * Run: node --test --test-force-exit test/csvImportFehler.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _ROOT_DOCKER = process.cwd();
const _ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const SEITE_REL = "frontend/public/js/pages/mitarbeiter.js";
const ROOT = fs.existsSync(path.join(_ROOT_DOCKER, SEITE_REL)) ? _ROOT_DOCKER : _ROOT_LOCAL;
const SEITE = path.join(ROOT, SEITE_REL);

const vorhanden = fs.existsSync(SEITE);
const quelle = vorhanden ? fs.readFileSync(SEITE, "utf8") : "";

/** Schneidet eine Funktion aus dem Seitenskript, um sie einzeln auszufuehren. */
function funktionsQuelle(name) {
  const start = quelle.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Funktion ${name} nicht gefunden`);
  let tiefe = 0, i = quelle.indexOf("{", start);
  const anfangKlammer = i;
  for (; i < quelle.length; i++) {
    if (quelle[i] === "{") tiefe++;
    else if (quelle[i] === "}" && --tiefe === 0) break;
  }
  assert.ok(i > anfangKlammer, `Funktion ${name} nicht abgrenzbar`);
  return quelle.slice(start, i + 1);
}

/** Baut eine Sandbox mit genau den Umgebungsteilen, die die Funktionen brauchen. */
function sandbox({ mapping = {} } = {}) {
  const ctx = {
    _csvData: { mapping },
    esc: (s) => String(s == null ? "" : s),
    TCi18n: {
      t: (key, vars) => {
        const texte = {
          "mit.csv.errRowLabel": "Zeile {row}",
          "mit.csv.errRowUnknown": "Zeile unbekannt",
          "mit.csv.errMore": "… und {count} weitere",
          "mit.csv.errRowsInvalid": "{count} Zeile(n) wurden vom Server abgelehnt"
        };
        let s = texte[key] || key;
        for (const k in (vars || {})) s = s.replace("{" + k + "}", vars[k]);
        return s;
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(funktionsQuelle("csvSpalteFuerFeld"), ctx);
  vm.runInContext(funktionsQuelle("csvFehlerListe"), ctx);
  return ctx;
}

const suite = vorhanden ? describe : describe.skip;

suite("P10/D1 · Der Import nennt Zeile, Spalte und Grund", () => {

  it("uebersetzt den Server-Index in die echte CSV-Zeile", () => {
    // Zeilen 2 und 5 der Datei wurden gesendet (3 und 4 waren schon im Browser
    // als fehlerhaft aussortiert). Der Server meckert ueber Eintrag 1 — das ist
    // Zeile 5, nicht Zeile 1.
    const ctx = sandbox();
    const details = [{ path: ["workers", 1, "date_of_birth"], message: "Invalid" }];
    const res = ctx.csvFehlerListe(details, [2, 5]);

    assert.ok(res, "es wurde keine Liste erzeugt");
    assert.equal(res.anzahl, 1);
    assert.match(res.html, /Zeile 5/,
      "ohne die parallel mitgefuehrten Zeilennummern zeigt der Hinweis auf die falsche Zeile");
    assert.ok(!/Zeile 1\b/.test(res.html), "der Array-Index darf nicht als Zeile durchschlagen");
  });

  it("nennt die Spalte so, wie sie in der Datei steht", () => {
    const ctx = sandbox({ mapping: { "Gebdatum": "date_of_birth", "E-Mail": "email" } });
    const res = ctx.csvFehlerListe(
      [{ path: ["workers", 0, "date_of_birth"], message: "Format erwartet JJJJ-MM-TT" }],
      [7]
    );
    assert.match(res.html, /Gebdatum/,
      "der Nutzer kennt seine Spaltenueberschrift, nicht den internen Feldnamen");
    assert.match(res.html, /Format erwartet JJJJ-MM-TT/, "der Grund muss mitkommen");
  });

  it("faellt auf den Feldnamen zurueck, wenn keine Spalte gemappt ist", () => {
    const ctx = sandbox({ mapping: {} });
    const res = ctx.csvFehlerListe([{ path: ["workers", 0, "email"], message: "ungueltig" }], [3]);
    assert.match(res.html, /email/, "lieber der interne Name als gar keine Angabe");
  });

  it("kommt mit fehlender Zeilenzuordnung klar, statt eine falsche zu erfinden", () => {
    const ctx = sandbox();
    const res = ctx.csvFehlerListe([{ path: ["workers", 9, "email"], message: "x" }], [2]);
    assert.match(res.html, /Zeile unbekannt/,
      "eine erfundene Zeilennummer waere schlimmer als das Eingestaendnis");
  });

  it("deckelt lange Listen und sagt, wie viele fehlen", () => {
    const ctx = sandbox();
    const viele = Array.from({ length: 25 }, (_, i) => ({
      path: ["workers", i, "email"], message: "ungueltig"
    }));
    const res = ctx.csvFehlerListe(viele, viele.map((_, i) => i + 2));
    assert.equal(res.anzahl, 25, "die Gesamtzahl muss stimmen, auch wenn nicht alles gezeigt wird");
    assert.match(res.html, /und 5 weitere/);
  });

  it("gibt null zurueck, wenn nichts Verwertbares dabei ist", () => {
    const ctx = sandbox();
    assert.equal(ctx.csvFehlerListe(null, []), null);
    assert.equal(ctx.csvFehlerListe([], []), null);
    assert.equal(ctx.csvFehlerListe("VALIDATION", []), null,
      "eine Zeichenkette ist keine Fehlerliste — dann bleibt es bei der alten Meldung");
  });
});

suite("P10/D1 · Die Seite wirft die Auskunft nicht mehr weg", () => {
  it("der Fehlerzweig liest details", () => {
    assert.match(quelle, /csvFehlerListe\(e\.details/,
      "genau das war der Defekt: der Server liefert details, die Seite ignorierte sie");
  });

  it("die Zeilennummern werden parallel zum gesendeten Array gefuehrt", () => {
    assert.match(quelle, /gesendeteZeilen/);
    assert.match(quelle, /_errors\.length === 0[\s\S]{0,120}return r\._row/,
      "dieselbe Filterregel wie beim Aufbau der Nutzlast — sonst laufen die Indizes auseinander");
  });

  it("alle neuen Texte stehen in beiden Sprachen", () => {
    for (const key of [
      "mit.csv.errRowsInvalid", "mit.csv.errRowLabel",
      "mit.csv.errRowUnknown", "mit.csv.errMore"
    ]) {
      const treffer = quelle.split(`'${key}'`).length - 1;
      assert.ok(treffer >= 2,
        `${key} steht ${treffer}-mal — erwartet mindestens zweimal (DE und EN)`);
    }
  });
});
