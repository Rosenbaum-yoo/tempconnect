/**
 * Die Verdrahtung im Runner — einmal durch die echte Kette.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES DIESEN TEST GIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `nativerAbbruch.test.js` prueft den Detektor als Funktion: Text rein, Befund
 * raus. Das ist die halbe Wahrheit. Die andere Haelfte ist die Kette dahinter —
 * `run-tests.js` muss die Ausgabe des Kindprozesses ueberhaupt MITLESEN
 * (gepipet statt durchgereicht), sie chunkweise in den Scanner geben, den
 * richtigen Kanal mitliefern und den Befund am Ende ausgeben, ohne ihn durch
 * ein vorzeitiges `process.exit()` abzuschneiden.
 *
 * Jedes einzelne dieser Glieder kann verschwinden, ohne dass ein Unit-Test es
 * merkt. Dann ist der Detektor perfekt und wird nie aufgerufen — und der
 * naechste Absturz laeuft wieder als "roter Test" durch, obwohl alles gebaut
 * ist. Genau diese Sorte Luecke ist in diesem Repo schon einmal teuer geworden
 * (die Benachrichtigungsschicht war vollstaendig und hatte null Aufrufer).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM IN EINEM SANDKASTEN UND NICHT IM REPO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Attrappe muss einen Totalausfall erzeugen — eine Datei, die als Ganzes
 * rot wird. Laege sie unter `api/test/`, sammelte `collectTestFiles` sie ein
 * (es steigt rekursiv durch ALLES, was auf `.test.js` endet, auch unter
 * `fixtures/`) und die echte Suite waere ab dem ersten Commit dauerhaft rot.
 *
 * Also: eine Kopie des Runners in `os.tmpdir()`, mit einem eigenen, winzigen
 * `test/`-Verzeichnis. Damit die Kopie nicht stillschweigend veraltet, prueft
 * V0 zwei Dinge — dass die kopierten Dateien byteweise den Originalen
 * entsprechen, und dass `run-tests.js` keine relative Abhaengigkeit hat, die
 * hier zu kopieren vergessen wurde.
 *
 * Run: node --test --test-force-exit test/runTestsVerdrahtung.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");

/* Zusammengesetzt, damit die Zeile nirgends woertlich im Quelltext steht:
 * druckt ein fehlgeschlagener Test sie als Vergleichswert, meldete der echte
 * Runner einen Abbruch, den es nie gab. Siehe Kopf von nativerAbbruch.test.js. */
const SIGNATUR =
  "Assertion failed: !(handle->flags & UV_HANDLE_CLOS" +
  "ING), file src\\win\\async.c, line 76";

/**
 * Die Dateien, die der Sandkasten braucht — relativ zu `api/`.
 *
 * `abbildSuite.mjs` steht hier, weil V0 beim ersten Container-Lauf genau das
 * gemeldet hat: `run-tests.js` bekam einen neuen relativen Import, der
 * Sandkasten kopierte ihn nicht, und der verschachtelte Lauf starb am Import
 * statt an der Sache. Der Driftschutz hat funktioniert — das ist der Beleg.
 */
const KOPIEN = [
  "scripts/run-tests.js",
  "scripts/lib/nativerAbbruch.mjs",
  "scripts/lib/abbildSuite.mjs",
  /* Seit 2026-08-29: der Klaerungslauf, den run-tests.js nach einem erkannten
     Abbruch faehrt. Wieder hat V0 die Luecke gemeldet, bevor sie schaden
     konnte — genau wie bei abbildSuite.mjs oben. */
  "scripts/lib/klaerungslauf.mjs",
];

describe("Verdrahtung: run-tests.js liest seine eigene Ausgabe mit", () => {
  let sandkasten = null;
  let ergebnis = null;

  before(() => {
    sandkasten = fs.mkdtempSync(path.join(os.tmpdir(), "run-tests-verdrahtung-"));
    const sApi = path.join(sandkasten, "api");

    for (const rel of KOPIEN) {
      const ziel = path.join(sApi, rel);
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.copyFileSync(path.join(API, rel), ziel);
    }

    /*
     * Die Attrappe stellt das BEOBACHTBARE des echten Absturzes nach: die
     * Signatur auf stderr ab Spalte 0, und ein Prozessende mit Status != 0,
     * OHNE roten Untertest. node:test meldet die Datei dann als Ganzes rot
     * ("'test failed'") — genau die Form, die der Detektor zuordnen muss.
     *
     * Der echte libuv-Absturz laesst sich nicht auf Zuruf erzeugen; seine
     * Physik prueft dieser Test auch nicht, sondern die Kette darum herum.
     */
    fs.mkdirSync(path.join(sApi, "test"), { recursive: true });
    fs.writeFileSync(path.join(sApi, "test", "attrappe.test.js"), [
      'import { it } from "node:test";',
      `process.stderr.write("\\n" + ${JSON.stringify(SIGNATUR)} + "\\n");`,
      'it("laeuft gruen durch", () => {});',
      'process.on("exit", () => { process.exitCode = 3; });',
      "",
    ].join("\n"));

    /*
     * NODE_TEST_CONTEXT muss weg. node:test setzt die Variable in jedem
     * Testprozess; erbt der verschachtelte Runner sie, schaltet der innere
     * Lauf in den Kind-Berichtsmodus und schreibt NICHTS auf stdout — der Test
     * pruefte dann eine leere Ausgabe und waere gruen, ohne etwas zu belegen.
     * NODE_OPTIONS ebenso: sonst haengt die Sonde des aeusseren Laufs mit dran.
     */
    const umgebung = { ...process.env, TC_TEST_PROBE: "0" };
    delete umgebung.NODE_TEST_CONTEXT;
    delete umgebung.NODE_OPTIONS;

    ergebnis = spawnSync(
      process.execPath,
      [path.join(sApi, "scripts", "run-tests.js"), "--suite=all"],
      { cwd: sApi, env: umgebung, encoding: "utf8" },
    );
  });

  after(() => {
    if (sandkasten) fs.rmSync(sandkasten, { recursive: true, force: true });
  });

  it("V0: der Sandkasten ist eine echte Kopie und vollstaendig", () => {
    /* Ohne diese Pruefung koennte der Sandkasten stillschweigend veralten:
       eine neue relative Abhaengigkeit in run-tests.js, hier nicht kopiert,
       und der Lauf scheitert am Import statt an der Sache — oder schlimmer,
       er prueft eine alte Fassung. */
    for (const rel of KOPIEN) {
      assert.equal(
        fs.readFileSync(path.join(sandkasten, "api", rel), "utf8"),
        fs.readFileSync(path.join(API, rel), "utf8"),
        `${rel} im Sandkasten weicht vom Original ab`);
    }

    const quelle = fs.readFileSync(path.join(API, "scripts/run-tests.js"), "utf8");
    /* Auch der Nebenwirkungs-Import `import "./x.mjs"` zaehlt — er hat kein
       `from`. Die erste Fassung dieses Musters hat genau den uebersehen, und die
       Rueckmutation lief dann in einen Importfehler statt in diesen Test. */
    const relativeImporte = [
      ...quelle.matchAll(/from\s+["'](\.[^"']+)["']/g),
      ...quelle.matchAll(/^\s*import\s+["'](\.[^"']+)["']/gm),
      ...quelle.matchAll(/import\s*\(\s*["'](\.[^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    const kopiert = KOPIEN.map((k) => path.basename(k));
    const fehlend = relativeImporte.filter((i) => !kopiert.includes(path.basename(i)));
    assert.deepEqual(fehlend, [],
      "run-tests.js importiert diese Dateien relativ, der Sandkasten kopiert sie aber nicht.\n" +
      "Ergaenze sie in KOPIEN — sonst prueft dieser Test bald nur noch einen Importfehler.");
  });

  it("V0b: der Runner nagelt den Reporter fest", () => {
    /*
     * Der ganze Detektor liest das Format des `spec`-Reporters. Dessen Auswahl
     * haengt aber von der Node-Fassung ab, und seit dem Umbau sieht das Kind
     * immer eine Pipe: Node 24.11 (lokal) waehlt `spec`, Node 20.20
     * (`api/Dockerfile`, beide CI-Workflows) waehlt `tap`. Unter TAP kennt der
     * Detektor kein einziges seiner Muster wieder — die Erkennung waere im
     * Container und in CI stumm, also dort, wo das Release-Gate laeuft.
     *
     * Faellt das Argument weg, ist nichts rot ausser diesem Test. Deshalb gibt
     * es ihn.
     */
    const quelle = fs.readFileSync(path.join(API, "scripts/run-tests.js"), "utf8");
    assert.match(quelle, /"--test-reporter=spec"/,
      "run-tests.js gibt den Reporter nicht mehr vor. Ohne ihn haengt das " +
      "Ausgabeformat an der Node-Fassung, und der Detektor liest unter TAP nichts.");
  });

  it("V1: der Lauf kommt ueberhaupt zustande und die Ausgabe wird durchgereicht", () => {
    /* Erst belegen, dass etwas gemessen wurde. Ein Test, der auf einer leeren
       Ausgabe nach Zeichenketten sucht, ist immer gruen und beweist nichts. */
    assert.equal(ergebnis.error, undefined, `Start fehlgeschlagen: ${ergebnis.error?.message}`);
    const alles = ergebnis.stdout + ergebnis.stderr;
    assert.ok(alles.length > 100, `nur ${alles.length} Zeichen Ausgabe — der Tee reicht nichts durch`);
    assert.match(ergebnis.stdout, /ℹ tests \d+/,
      "der node:test-Bericht selbst fehlt in der weitergereichten Ausgabe");
    assert.match(ergebnis.stdout, /attrappe\.test\.js/,
      "die Attrappe wurde gar nicht ausgefuehrt");
  });

  it("V2: der Abbruch wird erkannt und der Befund ausgegeben", () => {
    const alles = ergebnis.stdout + ergebnis.stderr;
    assert.match(alles, /NATIVER ABBRUCH ERKANNT/,
      "run-tests.js hat die Signatur nicht gemeldet — die Kette Pipe → Scanner → Befund " +
      "ist unterbrochen. Der Detektor allein nuetzt dann nichts.");
    assert.match(alles, /attrappe\.test\.js/);
    assert.match(alles, /KEINEN Befund erbracht/,
      "der Befund benennt nicht, dass der Lauf fuer die Datei ohne Ergebnis blieb");
  });

  it("V3: der Befund steht am Ende und wird nicht abgeschnitten", () => {
    /* `process.exit()` statt `process.exitCode` wuerde bei gepiptem stdout die
       letzten Schreibvorgaenge abschneiden — und der Befund steht ganz hinten. */
    const alles = ergebnis.stdout + ergebnis.stderr;
    assert.match(alles, /Ende schliessen, dann kann `--test-force-exit` dort nichts abschneiden\./,
      "die letzte Zeile des Befunds fehlt — die Ausgabe wurde abgeschnitten");
  });

  it("V4: der Exitcode bleibt der des Testlaufs", () => {
    /* Der Runner darf einen roten Lauf nicht gruen faerben, nur weil er den
       Grund kennt. Die Empfehlung ersetzt keine Entscheidung. */
    assert.notEqual(ergebnis.status, 0,
      "der Lauf war rot, der Runner meldet aber Erfolg — damit wuerde ein Abbruch " +
      "in CI unsichtbar durchgehen");
  });
});
