/**
 * Der Detektor fuer den nativen Abbruch — und die Sorgfalt, die er braucht.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WORUM ES GEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `scripts/lib/nativerAbbruch.mjs` liest die Ausgabe eines Testlaufs mit und
 * erkennt, wenn ein Testkindprozess unter Windows beim Aufraeumen nativ
 * abgestuerzt ist. Der Runner gibt danach eine Empfehlung aus — und das ist der
 * Grund, warum dieser Test ausfuehrlicher ist als das Modul dahinter: die
 * Empfehlung ist eine Aussage ueber die GUELTIGKEIT eines Testlaufs. Wer sie zu
 * breit formuliert, hat ein Werkzeug gebaut, mit dem man rote Laeufe
 * wegwiederholt.
 *
 * Die Faelle pruefen beide Richtungen gleich hart:
 *   - erkennt er den echten Abbruch?           (sonst war die Arbeit umsonst)
 *   - schweigt er, wenn kein Abbruch da ist?   (sonst ist die Arbeit schaedlich)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE VORLAGEN SIND GEMESSEN, NICHT AUSGEDACHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der erste Entwurf dieses Tests bestand alle selbst ausgedachten Faelle — und
 * verfehlte drei Eigenschaften des echten spec-Reporters, die den Detektor im
 * Ernstfall blind gemacht haetten:
 *
 *   1. Bei FORCE_COLOR (das `run-tests.js` im Terminal SELBST setzt) sind die
 *      Zeilen ANSI-umhuellt: `[31m✖ datei [90m(2209ms)[39m`.
 *      Ein auf `^✖` verankertes Muster trifft dort nie — ausgerechnet in der
 *      Lage, in der der Flake auftritt.
 *   2. Der Reporter meldet jeden Fehlschlag ZWEIMAL: im Strom und im Block
 *      `✖ failing tests:`. Wer beide zaehlt, listet dieselbe Datei als
 *      abgestuerzt UND als echten Fehler.
 *   3. Rote Untertests der obersten Ebene stehen ebenfalls uneingerueckt.
 *
 * Die Vorlagen unten sind deshalb Auszuege aus echten Laeufen (Node 24.11),
 * nicht aus der Vorstellung. Fall V1 haelt genau das fest.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIE SIGNATUR HIER ZUSAMMENGESETZT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Stuende die Zeile woertlich in dieser Datei, waere sie eine Falle mit Ansage:
 * schlaegt ein Test hier fehl, druckt node:test den Vergleichswert — und der
 * Runner, der genau diese Ausgabe mitliest, meldete einen nativen Abbruch, den
 * es nie gab. Das ist kein hypothetischer Fall: `releaseSecretScan.test.js` hat
 * exakt das schon einmal erlebt ("die gepflanzten Werte dieser Datei sind
 * formecht — und haetten damit JEDES Release scheitern lassen").
 *
 * Run: node --test --test-force-exit test/nativerAbbruch.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SIGNATUREN,
  neuerScanner,
  beurteileAusgabe,
  formuliereBefund,
} from "../scripts/lib/nativerAbbruch.mjs";

/* Zusammengesetzt — siehe Kopf. Die beiden Haelften sind einzeln harmlos. */
const HALB_A = "Assertion failed: !(handle->flags & UV_HANDLE_CLOS";
const HALB_B = "ING), file src\\win\\async.c, line 76";
const ABBRUCH = HALB_A + HALB_B;

const ESC = String.fromCharCode(27);
const rot = (s) => `${ESC}[31m${s}${ESC}[39m`;
const grau = (s) => `${ESC}[90m${s}${ESC}[39m`;

/** Ein Eintrag im Abschlussblock, wie der spec-Reporter ihn schreibt. */
function eintrag(datei, titel, koerper, { farbig = false } = {}) {
  const kopf = `✖ ${titel} (6682.1556ms)`;
  return [
    `test at ${datei}:1:1`,
    farbig ? `${ESC}[31m✖ ${titel} ${grau("(6682.1556ms)")}${ESC}[39m` : kopf,
    `  ${koerper}`,
  ].join("\n");
}

/**
 * Auszug aus dem Lauf vom 2026-08-22: gruene Untertests, die native Zeile, und
 * der Abschlussblock, in dem node:test die Datei als Ganzes rot meldet.
 */
function echterLauf({ farbig = false } = {}) {
  return [
    "▶ POST /me/totp/disable",
    "  ✔ 400 INVALID_TOKEN when token not 6 chars (0.9644ms)",
    "✔ POST /me/totp/disable (2.2221ms)",
    ABBRUCH,
    "✖ test\\me.route.coverage.test.js (6682.1556ms)",
    "ℹ tests 9535",
    "ℹ fail 1",
    "",
    farbig ? rot("✖ failing tests:") : "✖ failing tests:",
    "",
    eintrag("test\\me.route.coverage.test.js", "test\\me.route.coverage.test.js", "'test failed'", { farbig }),
    "",
  ].join("\n");
}

describe("Nativer Abbruch — erkennen, ohne rote Laeufe wegzuwiederholen", () => {

  /* ═══════════════════════════════════════════════════════════════════════
   * Erkennen
   * ═══════════════════════════════════════════════════════════════════════ */

  it("E1: erkennt den Abbruch und ordnet ihn ueber den Abschlussblock zu", () => {
    const b = beurteileAusgabe(echterLauf());
    assert.equal(b.abbruch, true, "der Abbruch wurde nicht erkannt");
    assert.equal(b.treffer.length, 1);
    assert.equal(b.treffer[0].id, "uv-handle-closing");
    assert.deepEqual(b.abgestuerzteDateien, ["test\\me.route.coverage.test.js"]);
    assert.deepEqual(b.weitereRoteDateien, [],
      "dieselbe Datei darf nicht zusaetzlich als echter Fehler gelten — der Reporter " +
      "meldet sie zweimal (Strom + Abschlussblock), das ist EIN Fehler");
  });

  it("E2: erkennt sie auch, wenn die Ausgabe eingefaerbt ist (FORCE_COLOR)", () => {
    /* Der Runner setzt FORCE_COLOR=1 selbst, sobald er in ein Terminal
       schreibt. Ohne ANSI-Bereinigung waere der Detektor genau dort blind, wo
       der Flake beobachtet wird — der Testfall ohne Farbe haette das gedeckt. */
    const b = beurteileAusgabe(echterLauf({ farbig: true }));
    assert.equal(b.abbruch, true);
    assert.deepEqual(b.abgestuerzteDateien, ["test\\me.route.coverage.test.js"],
      "in eingefaerbter Ausgabe wurde die abgestuerzte Datei nicht erkannt");
    assert.deepEqual(b.weitereRoteDateien, []);
  });

  it("E3: findet die Signatur auch, wenn sie ueber Chunk-Grenzen zerfaellt", () => {
    const text = echterLauf();
    for (const stelle of [10, text.indexOf(ABBRUCH) + 20, text.indexOf(ABBRUCH) + 1, text.length - 5]) {
      const s = neuerScanner();
      s.aufnehmen(text.slice(0, stelle));
      s.aufnehmen(text.slice(stelle));
      s.abschliessen();
      assert.equal(s.beurteilen().abbruch, true, `Teilung bei ${stelle} hat den Treffer verschluckt`);
    }
  });

  it("E4: findet sie auch Zeichen fuer Zeichen zerlegt", () => {
    const s = neuerScanner();
    for (const zeichen of echterLauf()) s.aufnehmen(zeichen);
    s.abschliessen();
    assert.equal(s.beurteilen().abbruch, true);
  });

  it("E5: eine letzte Zeile ohne Zeilenumbruch geht nicht verloren", () => {
    const s = neuerScanner();
    s.aufnehmen("irgendwas\n" + ABBRUCH);
    assert.equal(s.beurteilen().abbruch, false, "vor abschliessen() darf der Rest nicht zaehlen");
    s.abschliessen();
    assert.equal(s.beurteilen().abbruch, true, "abschliessen() hat den Rest nicht ausgewertet");
  });

  it("E6: CRLF aendert nichts (die Ausgabe kommt von Windows)", () => {
    const b = beurteileAusgabe(echterLauf().split("\n").join("\r\n"));
    assert.equal(b.abbruch, true);
    assert.deepEqual(b.abgestuerzteDateien, ["test\\me.route.coverage.test.js"]);
  });

  it("E7: stdout und stderr haben getrennte Zeilenpuffer", () => {
    /* Im Runner kommt die Signatur ueber stderr, der Bericht ueber stdout —
       zwei Pipes, verschraenkte Chunks. Mit EINEM Puffer klebte ein
       stderr-Schnipsel mitten in eine halbe stdout-Zeile und machte beide
       unlesbar. Hier wird genau dieser Interleave nachgestellt. */
    const s = neuerScanner();
    s.aufnehmen("✖ failing tests:\ntest at test\\x.test.js:1:1\n✖ test\\x.te", "stdout");
    s.aufnehmen(ABBRUCH + "\n", "stderr");
    s.aufnehmen("st.js (12ms)\n  'test failed'\n", "stdout");
    s.abschliessen();
    const b = s.beurteilen();
    assert.equal(b.abbruch, true, "die stderr-Signatur ging verloren");
    assert.deepEqual(b.abgestuerzteDateien, ["test\\x.test.js"],
      "die stdout-Zeile wurde durch den stderr-Chunk zerrissen");
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Schweigen — die wichtigere Haelfte
   * ═══════════════════════════════════════════════════════════════════════ */

  it("S1: ein gruener Lauf loest nichts aus", () => {
    const b = beurteileAusgabe(["▶ irgendwas", "  ✔ tut was (1ms)", "ℹ fail 0"].join("\n"));
    assert.equal(b.abbruch, false);
    assert.deepEqual(b.abgestuerzteDateien, []);
    assert.equal(formuliereBefund(b), null);
  });

  it("S2: ein echter roter Test ohne Abbruch bleibt ein echter roter Test", () => {
    const b = beurteileAusgabe([
      "✖ failing tests:",
      eintrag("test\\irgendwas.test.js", "tut nicht was es soll", "AssertionError: 1 !== 2"),
    ].join("\n"));
    assert.equal(b.abbruch, false, "ohne native Signatur darf nie ein Abbruch gemeldet werden");
    assert.deepEqual(b.weitereRoteDateien, ["test\\irgendwas.test.js"]);
    assert.equal(formuliereBefund(b), null, "ohne Abbruch gibt es keinen Befundtext");
  });

  it("S3: eingerueckt zaehlt nicht — eine Fundstelle in einer Fehlermeldung loest nicht aus", () => {
    const b = beurteileAusgabe([
      "✖ failing tests:",
      eintrag("test\\x.test.js", "irgendein Test", "AssertionError: Vergleich fehlgeschlagen"),
      "      " + ABBRUCH,
    ].join("\n"));
    assert.equal(b.abbruch, false,
      "eine eingerueckte Fundstelle wurde als nativer Abbruch gewertet — damit koennte " +
      "ein fehlgeschlagener Test sich selbst als 'einfach wiederholen' abstempeln");
  });

  it("S4: eine aehnliche, aber andere native Zusicherung loest nicht aus", () => {
    const b = beurteileAusgabe([
      "Assertion failed: (uv__stream_fd(stream) >= 0), file src/unix/stream.c, line 1500",
      "✖ failing tests:",
      eintrag("test\\andere.test.js", "test\\andere.test.js", "'test failed'"),
    ].join("\n"));
    assert.equal(b.abbruch, false,
      "eine unbekannte native Zusicherung darf nicht als bekannter Wettlauf gelten");
    assert.deepEqual(b.weitereRoteDateien, ["test\\andere.test.js"],
      "sie bleibt ein echter roter Lauf");
  });

  it("S5: ein Totalausfall OHNE Signatur ist ein echter Fehler, kein Flake", () => {
    /* Gemessen: eine Datei, die beim Import wirft, erzeugt EXAKT denselben
       Eintrag wie ein nativer Abbruch (`'test failed'`). Die Signatur ist der
       einzige Unterschied — fehlt sie, ist es ein echter Fehler. */
    const b = beurteileAusgabe([
      "✖ failing tests:",
      eintrag("test\\wirft-beim-laden.test.js", "test\\wirft-beim-laden.test.js", "'test failed'"),
    ].join("\n"));
    assert.equal(b.abbruch, false);
    assert.deepEqual(b.abgestuerzteDateien, []);
    assert.deepEqual(b.weitereRoteDateien, ["test\\wirft-beim-laden.test.js"]);
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Der gemischte Fall — hier entscheidet sich, ob das Werkzeug schadet
   * ═══════════════════════════════════════════════════════════════════════ */

  it("M1: echte Fehler neben dem Abbruch werden getrennt ausgewiesen", () => {
    const b = beurteileAusgabe([
      ABBRUCH,
      "✖ failing tests:",
      eintrag("test\\echt-kaputt.test.js", "rechnet falsch", "AssertionError: 1 !== 2"),
      eintrag("test\\abgestuerzt.test.js", "test\\abgestuerzt.test.js", "'test failed'"),
      eintrag("test\\noch-einer.test.js", "auch kaputt", "AssertionError: 3 !== 4"),
    ].join("\n"));

    assert.equal(b.abbruch, true);
    assert.deepEqual(b.abgestuerzteDateien, ["test\\abgestuerzt.test.js"],
      "nur der Totalausfall gilt als abgestuerzt — nicht die Nachbarn in der Ausgabe");
    assert.deepEqual(b.weitereRoteDateien.sort(),
      ["test\\echt-kaputt.test.js", "test\\noch-einer.test.js"].sort());
  });

  it("M2: der Befundtext warnt ausdruecklich, wenn es echte Fehler daneben gibt", () => {
    const text = formuliereBefund(beurteileAusgabe([
      ABBRUCH,
      "✖ failing tests:",
      eintrag("test\\echt-kaputt.test.js", "rechnet falsch", "AssertionError: 1 !== 2"),
      eintrag("test\\abgestuerzt.test.js", "test\\abgestuerzt.test.js", "'test failed'"),
    ].join("\n")));

    assert.ok(text, "es gab einen Abbruch, also muss es einen Befund geben");
    assert.match(text, /echt-kaputt\.test\.js/, "die echte rote Datei wird nicht genannt");
    assert.match(text, /Wiederholen beseitigt sie nicht/,
      "der Text verfuehrt zum Wegwiederholen eines echten Fehlers");
    assert.doesNotMatch(text, /Naechster Schritt: den Lauf WIEDERHOLEN/,
      "bei echten Fehlern daneben darf 'wiederholen' nicht der naechste Schritt sein");
  });

  it("M3: der Befundtext behauptet nie, die abgestuerzte Datei sei in Ordnung", () => {
    const text = formuliereBefund(beurteileAusgabe(echterLauf()));
    assert.ok(text);
    assert.match(text, /KEINEN Befund erbracht/);
    assert.match(text, /Das heisst NICHT, dass sie in Ordnung ist/,
      "die Einschraenkung fehlt — ein Abbruch mitten in der Datei verschluckt rote Untertests");
    assert.match(text, /WIEDERHOLEN/);
  });

  it("M4: bei mehreren Totalausfaellen wird nicht geraten, sondern die Mehrdeutigkeit benannt", () => {
    const b = beurteileAusgabe([
      ABBRUCH,
      "✖ failing tests:",
      eintrag("test\\a.test.js", "test\\a.test.js", "'test failed'"),
      eintrag("test\\b.test.js", "test\\b.test.js", "'test failed'"),
    ].join("\n"));

    assert.deepEqual(b.abgestuerzteDateien, [],
      "mit zwei Kandidaten und einer Signatur darf sich der Detektor keinen aussuchen");
    assert.deepEqual(b.verdaechtigeDateien.sort(), ["test\\a.test.js", "test\\b.test.js"]);
    const text = formuliereBefund(b);
    assert.match(text, /nicht raten|Nicht raten/i);
    assert.match(text, /a\.test\.js/);
    assert.match(text, /b\.test\.js/);
  });

  it("M5: ein Treffer ohne jeden Totalausfall wird gemeldet, nicht verschluckt", () => {
    const b = beurteileAusgabe([ABBRUCH, "ℹ pass 10", "ℹ fail 0"].join("\n"));
    assert.equal(b.abbruch, true, "der Treffer darf nicht verloren gehen, nur weil nichts folgt");
    assert.deepEqual(b.abgestuerzteDateien, []);
    assert.match(formuliereBefund(b), /keiner ausgefallenen Datei zuordnen/);
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Das Ausgabeformat, von dem alles abhaengt
   * ═══════════════════════════════════════════════════════════════════════ */

  it("V1: rote Untertests der obersten Ebene gelten nicht als Datei", () => {
    /* Gemessen an Node 24.11: `✖ oberste Ebene faellt (1.8ms)` steht ohne
       Einrueckung. Ein Detektor, der "uneingerueckt" mit "Datei" gleichsetzt,
       fuellt seine Listen mit Testnamen. */
    const b = beurteileAusgabe([
      "✖ oberste Ebene faellt (1.843ms)",
      "✖ failing tests:",
      eintrag("test\\x.test.js", "oberste Ebene faellt", "AssertionError: 1 !== 2"),
    ].join("\n"));
    assert.deepEqual(b.weitereRoteDateien, ["test\\x.test.js"],
      "es darf nur die Datei genannt werden, nicht der Testname");
  });

  it("V2: der Abschlussblock zaehlt nicht doppelt", () => {
    /* Der Reporter meldet jeden Fehlschlag zweimal. Wird das zweite Vorkommen
       als eigener Fehler gezaehlt, steht dieselbe Datei in beiden Listen und
       der Befund widerspricht sich selbst. */
    const b = beurteileAusgabe(echterLauf());
    const doppelt = b.abgestuerzteDateien.filter((d) => b.weitereRoteDateien.includes(d));
    assert.deepEqual(doppelt, [], "dieselbe Datei steht in beiden Listen");
    assert.equal(b.eintraege.length, 1, `${b.eintraege.length} Eintraege statt 1`);
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Zweite Stufe — nativ gestorben, Ursache unbekannt
   * ═══════════════════════════════════════════════════════════════════════ */

  it("W1: ein unbekannter nativer Absturz wird gemeldet — aber NICHT zum Wiederholen", () => {
    /* Ohne diese Stufe faellt jeder andere native Absturz wortlos als
       gewoehnlicher roter Lauf durch, und der naechste Mensch durchsucht wieder
       15000 Zeilen nach etwas, das noch niemand benannt hat. Mit ihr darf der
       Text aber auf keinen Fall "wiederholen" sagen: die Ursache ist unbekannt,
       ein gruener zweiter Lauf belegt dann gar nichts. */
    const b = beurteileAusgabe([
      "FATAL ERROR: Reached heap limit Allocation failed",
      "✖ failing tests:",
      eintrag("test\\speicher.test.js", "test\\speicher.test.js", "'test failed'"),
    ].join("\n"));

    assert.equal(b.abbruch, false, "ein unbekannter Absturz ist NICHT der belegte Wettlauf");
    assert.equal(b.verdacht.length, 1);
    assert.deepEqual(b.abgestuerzteDateien, [], "ohne belegte Signatur wird nichts zugeordnet");
    assert.deepEqual(b.weitereRoteDateien, ["test\\speicher.test.js"],
      "die Datei bleibt ein echter roter Befund");

    const text = formuliereBefund(b);
    assert.ok(text, "ein nativer Absturz darf nicht wortlos durchgehen");
    assert.match(text, /Ursache nicht bekannt/);
    assert.doesNotMatch(text, /WIEDERHOLEN/,
      "bei unbekannter Ursache darf nicht zum Wiederholen geraten werden");
  });

  it("W2: die belegte Signatur landet nicht zusaetzlich im Verdacht", () => {
    /* `Assertion failed: ` ist auch ein Verdachtsmuster. Wuerde beides greifen,
       stuende derselbe Absturz in zwei Listen und der Befund zaehlte doppelt. */
    const b = beurteileAusgabe(echterLauf());
    assert.equal(b.abbruch, true);
    assert.deepEqual(b.verdacht, [], "die belegte Signatur wurde zusaetzlich als Verdacht gezaehlt");
  });

  it("W3: ein gruener Lauf erzeugt auch keine Verdachtsmeldung", () => {
    const b = beurteileAusgabe(["▶ x", "  ✔ y (1ms)", "ℹ fail 0"].join("\n"));
    assert.deepEqual(b.verdacht, []);
    assert.equal(formuliereBefund(b), null);
  });

  it("B1: eine Chunk-Grenze MITTEN IN EINEM ZEICHEN aendert nichts", () => {
    /*
     * Der Zeilenrest faengt zerschnittene ZEILEN ab — nicht zerschnittene
     * ZEICHEN. `✖` ist drei Bytes; faellt die Grenze hinein, machte
     * `chunk.toString("utf8")` aus jeder Haelfte ein Ersatzzeichen, die Zeile
     * begann mit `���` und `EINTRAG_TITEL` traf nicht mehr. Gemessen am
     * 2026-08-23: die abgestuerzte Datei wurde dadurch als "unabhaengig vom
     * Abbruch rot" ausgewiesen — die eine Aussage, die dieses Modul nie machen
     * darf. Bei rund 2500 Chunks im Volllauf ist das eine Frage der Zeit.
     *
     * Deshalb hier nicht eine Stichprobe, sondern JEDE moegliche Byte-Grenze.
     */
    const roh = Buffer.from(echterLauf(), "utf8");
    const kaputt = [];
    for (let i = 1; i < roh.length; i++) {
      const s = neuerScanner();
      s.aufnehmen(roh.subarray(0, i));
      s.aufnehmen(roh.subarray(i));
      s.abschliessen();
      const b = s.beurteilen();
      if (!b.abbruch ||
          b.abgestuerzteDateien.length !== 1 ||
          b.weitereRoteDateien.length !== 0) {
        kaputt.push(i);
      }
    }
    assert.deepEqual(kaputt, [],
      `Bei diesen Byte-Grenzen bricht die Erkennung: ${kaputt.slice(0, 10).join(", ")}` +
      (kaputt.length > 10 ? ` … (${kaputt.length} insgesamt)` : "") +
      "\nEin StringDecoder je Kanal loest das — toString() je Chunk nicht.");
  });

  it("B1b: absoluter Titel und relative Herkunft sind dieselbe Datei", () => {
    /*
     * Gemessen am 2026-08-23 im Container (Node 20.20): die `test at`-Zeile
     * nennt den Pfad relativ, die `✖`-Zeile darunter absolut. Node 24.11
     * schreibt beide relativ. Ein Gleichheitsvergleich haelt den Totalausfall
     * unter Node 20 deshalb fuer einen gewoehnlichen roten Test — und der
     * Befund sagte "unabhaengig vom Abbruch rot" ueber genau die Datei, die
     * abgestuerzt ist. Das ist die Umkehrung der Aussage.
     */
    const b = beurteileAusgabe([
      ABBRUCH,
      "✖ failing tests:",
      "test at test/attrappe.test.js:1:1",
      "✖ /tmp/sk/api/test/attrappe.test.js (170.907952ms)",
      "  'test failed'",
    ].join("\n"));

    assert.equal(b.abbruch, true);
    assert.deepEqual(b.abgestuerzteDateien, ["test/attrappe.test.js"],
      "absoluter Titel und relative Herkunft wurden nicht als dieselbe Datei erkannt");
    assert.deepEqual(b.weitereRoteDateien, [],
      "die abgestuerzte Datei wurde zusaetzlich als echter Fehler ausgewiesen");
    assert.match(formuliereBefund(b, { status: 1 }), /KEINEN Befund erbracht/);
  });

  it("B2: ein GRUENER Lauf mit gedruckter Signatur meldet keinen Abbruch", () => {
    /* Die Zeichenkette kann auch harmlos in die Ausgabe geraten — ein Test, der
       sie als Vorlage benutzt und ausgibt. Ohne diese Sperre stuende
       "WIEDERHOLEN" ueber einem Lauf, dem nichts fehlt; beim naechsten echten
       roten Lauf glaubt dann niemand mehr hin. Die Datei, die diese Zeichenkette
       garantiert enthaelt, ist ausgerechnet dieser Test. */
    const b = beurteileAusgabe([ABBRUCH, "ℹ pass 10", "ℹ fail 0"].join("\n"));
    assert.equal(b.abbruch, true, "der Treffer selbst bleibt ein Treffer");

    const beiGruen = formuliereBefund(b, { status: 0 });
    assert.ok(beiGruen, "auch bei gruenem Lauf gehoert ein kurzer Hinweis ausgegeben");
    assert.doesNotMatch(beiGruen, /WIEDERHOLEN/,
      "ueber einem gruenen Lauf darf nie 'wiederholen' stehen");
    assert.doesNotMatch(beiGruen, /NATIVER ABBRUCH ERKANNT/,
      "ein gruener Lauf hatte keinen Abbruch — der Alarmtext gehoert dort nicht hin");
    assert.match(beiGruen, /gruen/);

    const beiRot = formuliereBefund(b, { status: 1 });
    assert.match(beiRot, /NATIVER ABBRUCH ERKANNT/,
      "bei rotem Lauf muss der volle Befund weiterhin kommen");
  });

  it("D1: es gibt ueberhaupt Signaturen, und jede ist verankert", () => {
    assert.ok(SIGNATUREN.length >= 1, "keine einzige Signatur definiert");
    for (const s of SIGNATUREN) {
      assert.ok(s.id && s.beschreibung, `Signatur ohne id/beschreibung: ${s.id}`);
      assert.match(s.muster.source, /^\^/,
        `Signatur ${s.id} ist nicht auf Spaltenanfang verankert — damit koennte eine ` +
        "eingerueckte Fundstelle in einer Fehlermeldung sie ausloesen");
    }
  });

  it("D2: haelt eine grosse Ausgabe ohne Zeilenumbrueche aus", () => {
    const s = neuerScanner();
    for (let i = 0; i < 200; i++) s.aufnehmen("x".repeat(1000));
    s.aufnehmen("\n" + ABBRUCH + "\n");
    s.abschliessen();
    assert.equal(s.beurteilen().abbruch, true);
  });

  it("D3: viele rote Dateien sprengen den Befund nicht", () => {
    const zeilen = ["✖ failing tests:"];
    for (let i = 0; i < 2000; i++) zeilen.push(eintrag(`test\\datei${i}.test.js`, "faellt", "AssertionError: x"));
    const b = beurteileAusgabe(zeilen.join("\n"));
    assert.ok(b.eintraege.length <= 500, `${b.eintraege.length} Eintraege — die Obergrenze greift nicht`);
    assert.ok(b.eintraege.length > 0, "es wurde gar nichts gesammelt");
  });
});
