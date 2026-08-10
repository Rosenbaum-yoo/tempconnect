/**
 * P10 Spur D / Welle D3 — der Wizard hat keine eigene Liste mehr.
 *
 * WORUM ES GEHT
 * In D4 musste noch ein Vergleichstest zwei Kopien derselben Regel
 * zusammenhalten (Land -> ISO, im Browser und im Server). Das ist eine
 * Sicherung, keine Loesung. Bei den Spaltennamen wird die Doppelung gar nicht
 * erst angelegt: der Server ordnet zu, die Seite zeigt nur an.
 *
 * Dieser Test belegt beides — dass die alte Liste WEG ist und dass die neue
 * Anzeige wirklich aus der Serverantwort entsteht. Die Anzeigefunktionen werden
 * dafuer ausgefuehrt, nicht im Quelltext gesucht.
 *
 * Run: node --test --test-force-exit test/csvSpaltentabelle.browser.test.js
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
/* Kommentare erwaehnen die alte Konstante absichtlich — sie duerfen nicht als
   Treffer zaehlen, sonst prueft der Test die Dokumentation statt den Code. */
const code = quelle
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");

function ausschnitt(kopf) {
  const start = code.indexOf(kopf);
  assert.ok(start >= 0, `${kopf} nicht gefunden`);
  let tiefe = 0, i = code.indexOf("{", start);
  const auf = i;
  for (; i < code.length; i++) {
    if (code[i] === "{") tiefe++;
    else if (code[i] === "}" && --tiefe === 0) break;
  }
  assert.ok(i > auf, `${kopf} nicht abgrenzbar`);
  return code.slice(start, i + 1);
}

/** Der Antwortkoerper, wie ihn POST /workers/import/map-columns liefert. */
const ANTWORT = {
  fields: [
    { field_key: "email",         label_key: "mit.field.emailReq",     is_required: true,  sort_order: 10 },
    { field_key: "first_name",    label_key: "mit.field.firstNameReq", is_required: true,  sort_order: 20 },
    { field_key: "last_name",     label_key: "mit.field.lastNameReq",  is_required: true,  sort_order: 30 },
    { field_key: "date_of_birth", label_key: "mit.field.birthDate",    is_required: false, sort_order: 40 }
  ],
  mapping:   { "Nachname": "last_name", "Gebdatum": "date_of_birth", "Spalte7": "email" },
  matched:   [
    { header: "Nachname", field_key: "last_name",     alias_label: "Nachname", via: "alias" },
    { header: "Gebdatum", field_key: "date_of_birth", alias_label: "Gebdatum", via: "alias" },
    { header: "Spalte7",  field_key: "email",         via: "inhalt", anteil: 100 }
  ],
  unmatched: ["Kostenstelle"],
  ambiguous: [{ header: "Name", field_key: "last_name", alias_label: "Name" }],
  missing_required: ["first_name"]
};

function sandbox({ katalog = ANTWORT, mapping = null, gemerkt = [], headers = null } = {}) {
  const gitter = { innerHTML: "" };
  const ctx = {
    document: { getElementById: () => gitter },
    esc: (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    TCi18n: {
      t: (key, vars) => {
        const w = {
          "mit.field.emailReq": "E-Mail *", "mit.field.firstNameReq": "Vorname *",
          "mit.field.lastNameReq": "Nachname *", "mit.field.birthDate": "Geburtsdatum",
          "mit.csv.colCsv": "Spalte", "mit.csv.colTarget": "Zielfeld",
          "mit.csv.doNotImport": "nicht importieren", "mit.csv.sample": "Beispiel: {value}",
          "mit.csv.mapViaContent": "am Inhalt erkannt ({percent} %)",
          "mit.csv.mapViaOwn": "Ihre gemerkte Schreibweise",
          "mit.csv.mapAmbiguous": "mehrdeutig – uebernommen als {field}",
          "mit.csv.rememberAlias": "Schreibweise merken",
          "mit.csv.rememberHint": "beim naechsten Mal automatisch",
          "mit.csv.rememberDone": "Schreibweise gemerkt"
        };
        let s = w[key] || key;
        for (const k in (vars || {})) s = s.replace("{" + k + "}", vars[k]);
        return s;
      }
    },
    _csvData: {
      headers: headers || ["Nachname", "Name", "Gebdatum", "Spalte7", "Kostenstelle"],
      rows:    [{ "Nachname": "Beck", "Name": "Beck", "Gebdatum": "12.03.1988", "Spalte7": "a@b.de", "Kostenstelle": "KST-1" }],
      mapping: mapping || { ...ANTWORT.mapping },
      katalog,
      gemerkt
    }
  };
  vm.createContext(ctx);
  for (const kopf of [
    "function csvFelder(", "function csvTrefferFuer(", "function csvFieldLabel(",
    "function csvFieldName(", "function csvFieldNameByKey(",
    "function csvMappingHinweis(", "function csvRenderMapping("
  ]) vm.runInContext(ausschnitt(kopf), ctx);
  return { ctx, gitter };
}

const suite = vorhanden ? describe : describe.skip;

suite("P10/D3 · Die alte Liste ist wirklich weg", () => {
  it("es gibt keine hartkodierte Feldliste mehr", () => {
    assert.ok(!/var CSV_FIELDS\s*=/.test(code),
      "solange die Liste hier steht, kann sie veralten — genau das war der Defekt");
  });

  it("es gibt keine hartkodierten Spalten-Synonyme mehr", () => {
    assert.ok(!/aliases:\s*\[/.test(code),
      "Synonyme gehoeren in die Tabelle: eine neue Schreibweise soll ein INSERT sein, kein Deploy");
  });

  it("die eigene Zuordnungslogik ist ausgebaut", () => {
    assert.ok(!/function csvAutoMap\(/.test(code),
      "zwei Zuordnungslogiken waeren wieder zwei Wahrheiten");
  });

  it("die Zuordnung wird beim Server geholt", () => {
    assert.match(code, /api\("\/workers\/import\/map-columns"/,
      "ohne diesen Aufruf hat die Seite gar keine Feldliste mehr");
  });

  it("die Proben werden mitgeschickt — sonst gibt es keine Inhaltserkennung", () => {
    assert.match(code, /function csvSpaltenProben\(/);
    assert.match(code, /columns:\s*csvSpaltenProben\(\)/);
  });

  it("eine Aenderung im Auswahlfeld laedt NICHT neu", () => {
    /*
     * csvUpdateMapping muss neu zeichnen, nicht neu holen. Sonst kaeme die
     * Serverzuordnung zurueck und ueberschriebe genau die Korrektur, die der
     * Nutzer gerade von Hand gemacht hat.
     */
    const fn = ausschnitt("function csvUpdateMapping(");
    assert.match(fn, /csvRenderMapping\(\)/);
    assert.ok(!/csvBuildMapping\(\)/.test(fn),
      "ein Nachladen wuerde die Handkorrektur des Nutzers verwerfen");
  });

  it("ein gesetzter Katalog wird nicht zweimal geholt", () => {
    const fn = ausschnitt("function csvBuildMapping(");
    assert.match(fn, /if \(_csvData\.katalog\)/);
  });

  it("eine neue Datei verwirft den alten Katalog", () => {
    const fn = ausschnitt("function csvReset(");
    assert.match(fn, /katalog: null/,
      "sonst zeigt die zweite Datei die Zuordnung der ersten");
  });

  it("es gibt keinen stillen Rueckfall auf eine eingebaute Liste", () => {
    const fn = ausschnitt("function csvBuildMapping(");
    assert.match(fn, /mit\.csv\.mapRetry/,
      "der etablierte Weg ist Fehler zeigen und erneut versuchen, nicht heimlich alte Werte nehmen");
  });

  it("ohne Katalog wird NICHT geprueft", () => {
    /*
     * Seit die Zuordnung vom Server kommt, ist der Zustand "Datei gelesen,
     * Antwort noch unterwegs" real erreichbar. Eine leere Feldliste bedeutet
     * keine Pflichtfelder und keine Werte — also lauter fehlerfreie LEERE
     * Datensaetze. Genau dieses Loch hat der Umbau aufgerissen.
     */
    const fn = ausschnitt("function csvRunValidation(");
    assert.match(fn, /if \(!csvFelder\(\)\.length\)/,
      "ohne diese Sperre importiert ein zu frueher Klick leere Datensaetze");
    const sperre = fn.indexOf("csvFelder().length");
    const pruefung = fn.indexOf("_csvData.rows.forEach");
    assert.ok(sperre >= 0 && sperre < pruefung, "die Sperre muss VOR der Pruefschleife stehen");
  });
});

suite("P10/D3 · Die Anzeige entsteht aus der Serverantwort", () => {
  it("die Auswahlfelder listen die Felder des Servers", () => {
    const { ctx, gitter } = sandbox();
    ctx.csvRenderMapping();
    for (const label of ["E-Mail *", "Vorname *", "Nachname *", "Geburtsdatum"]) {
      assert.ok(gitter.innerHTML.includes(label), `${label} fehlt in der Auswahl`);
    }
    assert.match(gitter.innerHTML, /value="date_of_birth" selected/,
      "die Zuordnung des Servers muss vorausgewaehlt sein");
  });

  it("sagt, wenn eine Spalte am Inhalt erkannt wurde", () => {
    const { ctx, gitter } = sandbox();
    ctx.csvRenderMapping();
    assert.match(gitter.innerHTML, /am Inhalt erkannt \(100 %\)/,
      "eine Zuordnung, die niemand nachvollziehen kann, ist eine Zumutung");
  });

  it("erklaert, warum eine mehrdeutige Spalte leer bleibt", () => {
    const { ctx, gitter } = sandbox();
    ctx.csvRenderMapping();
    assert.match(gitter.innerHTML, /mehrdeutig – uebernommen als Nachname/,
      "ohne Begruendung wirkt die leere Spalte wie ein Fehler");
  });

  it("bietet das Merken erst an, wenn eine unbekannte Spalte zugeordnet wurde", () => {
    const ohne = sandbox();
    ohne.ctx.csvRenderMapping();
    assert.ok(!/Schreibweise merken/.test(ohne.gitter.innerHTML),
      "solange die Spalte gar keinem Feld zugeordnet ist, gibt es nichts zu merken");

    const mit = sandbox({ mapping: { ...ANTWORT.mapping, "Kostenstelle": "notes" } });
    mit.ctx.csvRenderMapping();
    assert.match(mit.gitter.innerHTML, /Schreibweise merken/);
  });

  it("zeigt nach dem Merken den Vollzug statt des Knopfs", () => {
    const { ctx, gitter } = sandbox({
      mapping: { ...ANTWORT.mapping, "Kostenstelle": "notes" },
      gemerkt: ["Kostenstelle"]
    });
    ctx.csvRenderMapping();
    assert.match(gitter.innerHTML, /Schreibweise gemerkt/);
    assert.ok(!/Schreibweise merken<\/button>/.test(gitter.innerHTML));
  });

  it("weist die eigene Schreibweise als solche aus", () => {
    const { ctx, gitter } = sandbox({
      katalog: { ...ANTWORT, matched: [{ header: "Nachname", field_key: "last_name", via: "alias_eigen" }] }
    });
    ctx.csvRenderMapping();
    assert.match(gitter.innerHTML, /Ihre gemerkte Schreibweise/);
  });

  it("escaped Spaltenueberschriften — sie stammen aus einer fremden Datei", () => {
    const { ctx, gitter } = sandbox({
      headers: ["<script>alert(1)</script>"],
      mapping: {},
      katalog: { ...ANTWORT, matched: [], unmatched: [], ambiguous: [] }
    });
    ctx.csvRenderMapping();
    assert.ok(!/<script>/.test(gitter.innerHTML),
      "eine Spaltenueberschrift ist Fremdeingabe und muss escaped werden");
    assert.match(gitter.innerHTML, /&lt;script&gt;/);
  });

  it("stuerzt nicht ab, solange der Katalog noch fehlt", () => {
    const { ctx } = sandbox({ katalog: null, mapping: {} });
    assert.doesNotThrow(() => ctx.csvRenderMapping(),
      "zwischen Dateiwahl und Serverantwort darf die Seite nicht brechen");
  });
});

suite("P10/D3 · Alle neuen Texte stehen in beiden Sprachen", () => {
  it("DE und EN", () => {
    for (const key of [
      "mit.csv.mapLoading", "mit.csv.mapError", "mit.csv.mapRetry",
      "mit.csv.mapViaContent", "mit.csv.mapViaOwn", "mit.csv.mapAmbiguous",
      "mit.csv.rememberAlias", "mit.csv.rememberHint", "mit.csv.rememberDone",
      "mit.csv.rememberFailed", "mit.csv.mapNotReady"
    ]) {
      const treffer = quelle.split(`'${key}'`).length - 1;
      assert.ok(treffer >= 2, `${key} steht ${treffer}-mal — erwartet DE und EN`);
    }
  });
});
