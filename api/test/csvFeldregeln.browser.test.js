/**
 * P10 Spur D / Welle D4 — eine Regel, zwei Orte, kein Auseinanderdriften.
 *
 * WARUM ES DIESEN TEST GIBT
 * Die toleranten Feldregeln stehen zwangslaeufig zweimal: im Browser (damit die
 * Vorschau zeigt, was wirklich passiert) und im Server (die einzige Pruefstelle,
 * die zaehlt). Zwei Kopien derselben Regel driften — immer. Genau daraus ist der
 * urspruengliche Defekt entstanden: der Wizard meldete "gueltig", der Server
 * lehnte ab.
 *
 * Dieser Test fuehrt BEIDE Umsetzungen an derselben Falltabelle aus und
 * vergleicht das Ergebnis. Weicht eine Seite ab, wird er rot — egal welche.
 *
 * Run: node --test --test-force-exit test/csvFeldregeln.browser.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { normalisiereZeile } from "../routes/workers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _ROOT_DOCKER = process.cwd();
const _ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const SEITE_REL = "frontend/public/js/pages/mitarbeiter.js";
const ROOT = fs.existsSync(path.join(_ROOT_DOCKER, SEITE_REL)) ? _ROOT_DOCKER : _ROOT_LOCAL;
const SEITE = path.join(ROOT, SEITE_REL);

const vorhanden = fs.existsSync(SEITE);
const quelle = vorhanden ? fs.readFileSync(SEITE, "utf8") : "";

/** Schneidet eine Funktion oder ein Objektliteral aus dem Seitenskript. */
function ausschnitt(kopf) {
  const start = quelle.indexOf(kopf);
  assert.ok(start >= 0, `${kopf} nicht gefunden`);
  let tiefe = 0, i = quelle.indexOf("{", start);
  const auf = i;
  for (; i < quelle.length; i++) {
    if (quelle[i] === "{") tiefe++;
    else if (quelle[i] === "}" && --tiefe === 0) break;
  }
  assert.ok(i > auf, `${kopf} nicht abgrenzbar`);
  return quelle.slice(start, i + 1);
}

/** Die Browser-Regeln in einer Sandbox, mit gestelltem Woerterbuch. */
function browserRegeln() {
  const ctx = { TCi18n: { t: (key, vars) => `${key}:${JSON.stringify(vars || {})}` } };
  vm.createContext(ctx);
  vm.runInContext(ausschnitt("var CSV_LAND_NACH_ISO = {") + ";", ctx);
  vm.runInContext(ausschnitt("function csvNormalisiereZeile("), ctx);
  return ctx;
}

/*
 * Die gemeinsame Falltabelle. Jeder Eintrag beschreibt einen realen Export.
 * Was hier steht, muss auf BEIDEN Seiten dasselbe ergeben.
 */
const FAELLE = [
  { was: "deutsches Datum",        ein: { date_of_birth: "12.03.1988" } },
  { was: "Datum mit Schraegstrich", ein: { date_of_birth: "12/03/1988" } },
  { was: "einstelliger Tag",       ein: { date_of_birth: "1.3.1988" } },
  { was: "ISO bleibt ISO",         ein: { date_of_birth: "1988-03-12" } },
  { was: "zweistelliges Jahr",     ein: { date_of_birth: "12.03.88" } },
  { was: "Land ausgeschrieben",    ein: { country: "Deutschland" } },
  { was: "Land englisch",          ein: { country: "Poland" } },
  { was: "Land klein",             ein: { country: "de" } },
  { was: "Land unbekannt",         ein: { country: "Absurdistan" } },
  { was: "PLZ mit Nullverlust",    ein: { country: "Deutschland", postal_code: "1067" } },
  { was: "PLZ Oesterreich",        ein: { country: "Oesterreich", postal_code: "1010" } },
  { was: "PLZ ohne Land",          ein: { postal_code: "1067" } },
  { was: "PLZ vollstaendig",       ein: { country: "DE", postal_code: "01067" } },
  { was: "E-Mail gross",           ein: { email: "Anna.Beck@Firma.DE" } },
  { was: "E-Mail im Anzeigenamen", ein: { email: "Anna Beck <anna@firma.de>" } },
  { was: "E-Mail mit mailto",      ein: { email: "mailto:anna@firma.de" } },
  { was: "E-Mail unbrauchbar",     ein: { email: "anna(at)firma.de" } },
  { was: "alles zusammen",         ein: { email: " A@B.DE ", date_of_birth: "05.05.1975",
                                          country: "Schweiz", postal_code: "8001" } }
];

const FELDER = ["email", "date_of_birth", "country", "postal_code"];

const suite = vorhanden ? describe : describe.skip;

suite("P10/D4 · Browser und Server wandeln identisch um", () => {
  const ctx = vorhanden ? browserRegeln() : null;

  for (const fall of FAELLE) {
    it(`stimmt ueberein: ${fall.was}`, () => {
      // Server: leere Felder werden zu null, der Browser laesst "" stehen.
      // Fuer den Vergleich beides auf "" vereinheitlichen.
      const serverErg = normalisiereZeile({ ...fall.ein });
      const browserDaten = { ...fall.ein };
      const browserHinweise = ctx.csvNormalisiereZeile(browserDaten);

      for (const feld of FELDER) {
        if (!(feld in fall.ein)) continue;
        assert.equal(
          browserDaten[feld] ?? "", serverErg.daten[feld] ?? "",
          `Feld ${feld}: Browser sagt "${browserDaten[feld]}", Server sagt "${serverErg.daten[feld]}" ` +
          `— genau so entstehen zwei Wahrheiten`
        );
      }

      assert.equal(
        browserHinweise.length, serverErg.hinweise.length,
        `unterschiedlich viele Hinweise (Browser ${browserHinweise.length}, ` +
        `Server ${serverErg.hinweise.length}) — eine Seite verschweigt eine Aenderung`
      );
    });
  }

  it("kennt auf beiden Seiten dieselben Laender", () => {
    const browserMap = vm.runInContext("CSV_LAND_NACH_ISO", ctx);
    const namen = Object.keys(browserMap);
    assert.ok(namen.length >= 30, `nur ${namen.length} Laender im Browser`);
    for (const name of namen) {
      const server = normalisiereZeile({ country: name });
      assert.equal(server.daten.country, browserMap[name],
        `"${name}": Browser sagt ${browserMap[name]}, Server sagt ${server.daten.country}`);
    }
  });

  it("die Seite prueft erst NACH dem Umwandeln", () => {
    /*
     * Reihenfolge-Falle: wuerde die Vorschau die Rohwerte pruefen und erst
     * danach umwandeln, markierte sie "Anna Beck <anna@firma.de>" rot, obwohl
     * der Import die Zeile annimmt. Der Aufruf muss vor der Pruefschleife stehen.
     */
    const iNorm = quelle.indexOf("rec._notices = csvNormalisiereZeile(rec._data)");
    const iPruef = quelle.indexOf("mit.csv.errInvalidEmail", iNorm);
    assert.ok(iNorm > 0, "die Vorschau wandelt gar nicht um");
    assert.ok(iPruef > iNorm, "die Pruefung laeuft vor der Umwandlung — falsche Reihenfolge");
  });

  it("alle neuen Texte stehen in beiden Sprachen", () => {
    for (const key of [
      "mit.csv.noticeEmail", "mit.csv.noticeDate", "mit.csv.noticeCountry",
      "mit.csv.noticePostal", "mit.csv.rowConverted", "mit.csv.kpiConverted"
    ]) {
      const treffer = quelle.split(`'${key}'`).length - 1;
      assert.ok(treffer >= 2, `${key} steht ${treffer}-mal — erwartet DE und EN`);
    }
  });

  it("der Nutzer sieht jede Umwandlung vor dem Import", () => {
    /*
     * Nicht im Quelltext gesucht, sondern die Tabelle wirklich gebaut: eine
     * Zeile mit Umwandlung, eine ohne. Nur die erste darf den Hinweis tragen.
     */
    const zelle = { innerHTML: "" };
    const ctx2 = {
      document: { getElementById: () => zelle },
      esc: (s) => String(s == null ? "" : s),
      TCi18n: { t: (k) => k },
      _csvData: {
        dupInfo: {},
        validated: [
          { _row: 2, _errors: [], _notices: ["Land Deutschland → DE"],
            _data: { email: "a@b.de", first_name: "Anna", last_name: "Beck" } },
          { _row: 3, _errors: [], _notices: [],
            _data: { email: "c@d.de", first_name: "Bo", last_name: "Cell" } }
        ]
      }
    };
    vm.createContext(ctx2);
    vm.runInContext(ausschnitt("function csvRenderValidationTable("), ctx2);
    ctx2.csvRenderValidationTable();

    assert.match(zelle.innerHTML, /Land Deutschland → DE/,
      "die Umwandlung steht nirgends — eine stille Korrektur an Personendaten");
    assert.match(zelle.innerHTML, /mit\.csv\.rowConverted/);
    assert.equal(zelle.innerHTML.split("csv-val-note").length - 1, 1,
      "nur die umgewandelte Zeile darf den Hinweis tragen, nicht jede");
  });

  it("der Hinweis wird escaped — er enthaelt Werte aus der Datei", () => {
    const zelle = { innerHTML: "" };
    const ctx3 = {
      document: { getElementById: () => zelle },
      esc: (s) => String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      TCi18n: { t: (k) => k },
      _csvData: {
        dupInfo: {},
        validated: [{ _row: 2, _errors: [], _notices: ["<script>alert(1)</script>"],
          _data: { email: "a@b.de", first_name: "A", last_name: "B" } }]
      }
    };
    vm.createContext(ctx3);
    vm.runInContext(ausschnitt("function csvRenderValidationTable("), ctx3);
    ctx3.csvRenderValidationTable();
    assert.ok(!/<script>/.test(zelle.innerHTML),
      "der Hinweistext stammt aus einer hochgeladenen Datei — er MUSS escaped werden");
    assert.match(zelle.innerHTML, /&lt;script&gt;/);
  });
});
