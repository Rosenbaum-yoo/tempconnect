import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = path.join(__dirname, "..", "routes", "workers.js");
const quelle = fs.readFileSync(ROUTE, "utf8");
const ohneKommentare = quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Zieht den Router mit Attrappen hoch und gibt den Import-Handler zurueck. */
async function importHandler(pool, service) {
  const mod = await import("../routes/workers.js");
  const factory = mod.createWorkersRouter || mod.default;
  const router = factory({
    pool,
    logger: { info() {}, warn() {}, error() {} },
    requireAuth: (req, _res, next) => next(),
    workerService: service
  });
  const layer = router.stack.find(
    (s) => s.route && s.route.path === "/workers/import" && s.route.methods.post
  );
  assert.ok(layer, "Route /workers/import nicht montiert");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe("P10/D2 · Struktur: eine Pruefstelle, Teilimport", () => {
  it("das Schema prueft nur noch den Umschlag", () => {
    assert.match(ohneKommentare, /workers:\s*z\.array\(z\.unknown\(\)\)/,
      "z.array(importItemSchema) liess eine einzige schlechte Zeile ALLES verwerfen");
    assert.ok(!/workers:\s*z\.array\(importItemSchema\)/.test(ohneKommentare));
  });

  it("jede Zeile wird einzeln geprueft", () => {
    // ANGEPASST (P10/D4): vorher wurde auf `safeParse(roh)` geprueft. Seit D4
    // laeuft die Zeile erst durch die Umwandlung und heisst dann `daten` — der
    // Variablenname war nie die Zusicherung, die Einzelpruefung ist es.
    assert.match(ohneKommentare, /importItemSchema\.safeParse\(/);
    assert.match(ohneKommentare, /function pruefeZeilen/);
  });

  it("die echte CSV-Zeile wird mitgefuehrt und zurueckuebersetzt", () => {
    assert.match(ohneKommentare, /_row/,
      "ohne die echte Zeile zeigt jede Meldung auf den Array-Index");
    assert.match(ohneKommentare, /zeilenNummern\[Number\(n\) - 1\]/,
      "der Dienst nummeriert seine EIGENE Liste — das muss zurueckuebersetzt werden");
  });

  it("ohne gueltige Zeile gibt es trotzdem einen Bericht, kein 400", () => {
    assert.match(ohneKommentare, /gueltig\.length\s*\?/,
      "ein 400 wuerde die Oberflaeche zurueck auf die Wand werfen, die D1 abgetragen hat");
  });
});

/* ── Verhalten: die Zerlegung wird wirklich ausgefuehrt ─────────────────── */

import { pruefeZeilen } from "../routes/workers.js";

const gut = (n) => ({ _row: n, email: `a${n}@example.de`, first_name: "Anna", last_name: "Beispiel" });

describe("P10/D2 · Gute Zeilen kommen durch, schlechte werden benannt", () => {
  it("Gate D2: 100 Zeilen, 3 fehlerhaft — 97 gehen durch, 3 werden gemeldet", () => {
    const zeilen = [];
    for (let i = 2; i <= 101; i++) zeilen.push(gut(i));
    zeilen[10] = { _row: 12, email: "keine-mail", first_name: "A", last_name: "B" };
    zeilen[30] = { _row: 32, email: "c@example.de", first_name: "", last_name: "B" };
    /*
     * ANGEPASST (P10/D4). Diese Zeile war frueher wegen "12.03.1988"
     * fehlerhaft. Seit den toleranten Feldregeln wird genau dieser Wert
     * umgewandelt statt abgelehnt — er taugt nicht mehr als Beispiel fuer einen
     * Fehler. Ein zweistelliges Jahr bleibt bewusst mehrdeutig und damit
     * ungueltig. Die Zusicherungen darunter sind unveraendert: 97 gute Zeilen
     * kommen durch, die Meldungen nennen die echten CSV-Zeilen.
     */
    zeilen[60] = { _row: 62, email: "d@example.de", first_name: "A", last_name: "B", date_of_birth: "12.03.88" };

    const r = pruefeZeilen(zeilen);
    assert.equal(r.gueltig.length, 97, "vorher waeren ALLE 100 verworfen worden");
    assert.equal(r.zeilenNummern.length, 97, "zu jeder gueltigen Zeile gehoert ihre CSV-Nummer");
    assert.deepEqual([...new Set(r.fehler.map((f) => f.row))].sort((a, b) => a - b), [12, 32, 62],
      "die Meldungen muessen die echten CSV-Zeilen nennen, nicht Array-Indizes");
  });

  it("jeder Fehler nennt Zeile, Feld und Grund", () => {
    // ANGEPASST (P10/D4): "12.03.1988" wird jetzt umgewandelt. Ein
    // zweistelliges Jahr bleibt ungueltig — 1988 oder 2088 ist bei einem
    // Geburtsdatum kein Detail. Alle Zusicherungen unveraendert.
    const r = pruefeZeilen([{ _row: 7, email: "x@y.de", first_name: "A", last_name: "B", date_of_birth: "12.03.88" }]);
    assert.equal(r.gueltig.length, 0);
    assert.equal(r.fehler[0].row, 7);
    assert.equal(r.fehler[0].field, "date_of_birth");
    assert.ok(r.fehler[0].message, "ohne Begruendung ist die Meldung wertlos");
    assert.equal(r.fehler[0].email, "x@y.de", "die Adresse hilft beim Wiederfinden");
  });

  it("ohne _row wird auf die Position zurueckgegriffen, statt zu raten", () => {
    const r = pruefeZeilen([{ email: "kaputt", first_name: "A", last_name: "B" }]);
    assert.equal(r.fehler[0].row, 1);
  });

  it("Hilfsfelder wandern nicht in den Import", () => {
    const r = pruefeZeilen([gut(5)]);
    assert.ok(!("_row" in r.gueltig[0]),
      "_row ist eine Transportangabe, kein Stammdatenfeld — es darf nicht in der Datenbank landen");
    assert.equal(r.zeilenNummern[0], 5);
  });
});
