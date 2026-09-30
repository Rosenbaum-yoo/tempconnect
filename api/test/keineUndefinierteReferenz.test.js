/**
 * Der Waechter gegen die vergessene Einbindung.
 *
 * DER ANLASS (2026-09-01, vom Owner gemeldet): die Live-Belegschaft antwortete
 * mit 500. Ursache: `routes/workers.js` rief `todayDE()` auf, eingebunden war
 * aber nur `fristLabelDE`. Ein `ReferenceError` zur Laufzeit — die Seite blieb
 * leer, die Konsole zeigte drei 500er, und in der Suite war alles gruen.
 *
 * DER ZWEITE FUND MACHT DEN FALL ERST VOLLSTAENDIG: in DERSELBEN Funktion fehlte
 * auch `auegFrist`. Wer nur den ersten Fehler behebt — und genau das haette ich
 * getan —, liefert eine Seite aus, die beim naechsten Aufruf wieder 500 wirft.
 * Gefunden hat den zweiten nicht das Lesen, sondern der Linter.
 *
 * WAS DIESER TEST ANDERS MACHT ALS `npm run lint`
 * Das Werkzeug war die ganze Zeit da: ESLint ist eingerichtet, `no-undef` steht
 * auf `error`, das Skript `lint` existiert. NUR RIEF ES NIEMAND — der Testlauf
 * kennt es nicht. Ein Werkzeug, das man starten muss, um etwas zu merken, merkt
 * nichts.
 *
 * Der volle Lauf faellt heute mit 1444 Befunden durch (184 Fehler, 1260
 * Warnungen) — ihn ins Gate zu haengen hiesse, das Gate abzuschalten. Deshalb
 * prueft dieser Test AUSSCHLIESSLICH `no-undef`: die eine Regel, deren Verstoss
 * kein Schoenheitsfehler ist, sondern ein 500er beim Nutzer.
 *
 * Run: node --test --test-force-exit test/keineUndefinierteReferenz.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeApi() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, "eslint.config.js"))
        && fs.existsSync(path.join(dir, "routes"))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const API = findeApi();

/* ESLint ist eine Entwicklungs-Abhaengigkeit. Im ausgelieferten Abbild fehlt sie
 * — dort soll dieser Test sich melden und nicht scheitern. */
let ESLint = null;
try {
  ({ ESLint } = await import("eslint"));
} catch {
  ESLint = null;
}

/**
 * Die Verzeichnisse, in denen eine undefinierte Referenz einen Nutzer trifft.
 *
 * `workers` und `queue` kamen am 2026-09-01 dazu (gegengeprueft): dort laufen die
 * BullMQ-Takte. Ein vergessener Import wirft dort KEINEN 500er beim Nutzer — der
 * Arbeiterprozess faellt still aus, und niemand sieht eine Fehlermeldung. Das ist
 * nicht harmloser als ein 500er, sondern schlechter zu bemerken. Gemessen waren es
 * 7 Dateien ohne Aufsicht, mit 0 Befunden — die Luecke war real, der Schaden nicht.
 *
 * Vorsicht beim Erweitern: `lintFiles` WIRFT, wenn ein genanntes Verzeichnis
 * existiert, aber vollstaendig ignoriert ist (`types` ist so ein Fall). Der
 * `existsSync`-Filter unten schuetzt davor nicht.
 */
const PRODUKTIV = ["routes", "services", "utils", "config", "middleware", "db", "workers", "queue", "jobs"];

describe("Keine undefinierte Referenz — der vergessene Import wird zum 500er",
  { skip: (!API && "api/ nicht gefunden") || (!ESLint && "eslint nicht installiert") }, () => {

  async function befunde(pfade) {
    const linter = new ESLint({
      cwd: API,
      // Nur diese eine Regel zaehlt hier. Der Rest des Regelwerks ist Sache von
      // `npm run lint` — und dort heute noch nicht gruen.
      overrideConfig: [{ rules: { "no-undef": "error" } }]
    });
    const vorhanden = pfade.filter((p) => fs.existsSync(path.join(API, p)));
    const ergebnisse = await linter.lintFiles(vorhanden);
    return ergebnisse.flatMap((e) =>
      e.messages
        .filter((m) => m.ruleId === "no-undef")
        // Der Stryker-Sandkasten ist eine Kopie und kein Quellcode.
        .filter(() => !e.filePath.includes(".stryker-tmp"))
        .map((m) => `${path.relative(API, e.filePath)}:${m.line} ${m.message}`)
    );
  }

  it("der Produktionscode kennt jede Kennung, die er benutzt", async () => {
    const gefunden = await befunde(PRODUKTIV);
    assert.deepEqual(gefunden, [],
      "Diese Kennungen sind nicht eingebunden. Zur Laufzeit ist das ein "
      + "ReferenceError — also ein 500er beim Nutzer, nicht eine Warnung:\n  "
      + gefunden.join("\n  "));
  });

  it("auch die Testdateien — sonst schweigt ein Waechter genau dann, wenn er reden soll", async () => {
    /* Gefunden am 2026-09-01: die Fehlermeldung eines Integritaets-Waechters in
     * `visibilityMatrix.test.js` benutzte zwei Namen, die es nicht gab. Der
     * Waechter haette bei einem kaputten Mount einen ReferenceError geworfen
     * statt zu erklaeren, was fehlt — er konnte nur in dem Moment versagen, fuer
     * den er gebaut wurde. */
    const gefunden = await befunde(["test", "scripts"]);
    assert.deepEqual(gefunden, [],
      "In Tests und Skripten:\n  " + gefunden.join("\n  "));
  });

  it("er wuerde eine vergessene Einbindung bemerken", async () => {
    /* SELBSTTEST. Genau der Fall von `routes/workers.js`, im Kleinen: ein
     * Aufruf ohne Einbindung. Ein Waechter, der nie anschlaegt, ist von einem
     * kaputten nicht zu unterscheiden. */
    const linter = new ESLint({
      cwd: API,
      overrideConfig: [{ rules: { "no-undef": "error" } }]
    });
    const [ergebnis] = await linter.lintText(
      "export function heute() { return todayDE(); }\n",
      { filePath: path.join(API, "services", "erfundener-dienst.js") }
    );
    const treffer = ergebnis.messages.filter((m) => m.ruleId === "no-undef");
    assert.equal(treffer.length, 1, "der fehlende Import muss auffallen");
    assert.match(treffer[0].message, /todayDE/);
  });

  it("er haelt einen richtig eingebundenen Aufruf fuer richtig", async () => {
    /* Die Gegenprobe: ein Waechter, der ALLES anklagt, wird abgeschaltet. */
    const linter = new ESLint({
      cwd: API,
      overrideConfig: [{ rules: { "no-undef": "error" } }]
    });
    const [ergebnis] = await linter.lintText(
      'import { todayDE } from "../utils/dateDE.js";\n'
      + "export function heute() { return todayDE(); }\n",
      { filePath: path.join(API, "services", "erfundener-dienst.js") }
    );
    assert.deepEqual(ergebnis.messages.filter((m) => m.ruleId === "no-undef"), []);
  });
});
