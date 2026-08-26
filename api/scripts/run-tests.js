#!/usr/bin/env node
/**
 * TempConnect Test Runner
 * Zentralisiert die reale Suite-Selektion, damit neue Testdateien nicht
 * manuell in mehreren npm-Skripten nachgetragen werden müssen.
 *
 * Suites:
 *   --suite=non-integration  => alle *.test.js außerhalb von test/integration/
 *   --suite=integration      => alle *.test.js unter test/integration/
 *   --suite=all              => alle *.test.js unter test/
 *   --suite=ci               => wie non-integration (CI-Kurzform, force-exit inklusive)
 *   --suite=security         => test/security/ + *security*.test.js + *rbac*.test.js + *auth*.test.js
 *   --suite=tenant           => *orgBoundary*.test.js + *org-boundary*.test.js + *tenant*.test.js
 *   --suite=pilot            => *pilot*.test.js
 *   --suite=db-gated         => Dateien, deren Tests sich OHNE DATABASE_URL selbst
 *                               ueberspringen (Audit-Backlog C-6). Im Normallauf melden
 *                               sie nur "skipped" — darunter die Org-Boundary- und
 *                               Cross-Org-Tests. Mit gesetzter DATABASE_URL laufen sie
 *                               echt: `DATABASE_URL=... node scripts/run-tests.js --suite=db-gated`
 */

import { spawn } from "node:child_process";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { neuerScanner, formuliereBefund } from "./lib/nativerAbbruch.mjs";
import { teileNachAbbild } from "./lib/abbildSuite.mjs";

const PROJECT_DIR = join(import.meta.dirname, "..");
const TEST_DIR = join(PROJECT_DIR, "test");
const VALID_SUITES = new Set(["non-integration", "integration", "all", "ci", "security", "tenant", "pilot", "db-gated", "image"]);

function usage() {
  console.log("Usage: node scripts/run-tests.js [--suite=non-integration|integration|all|ci|security|tenant|pilot|db-gated|image] [--retry-on-abort]");
  console.log("");
  console.log("  --suite=image      Nur die Tests, die das AUSGELIEFERTE ABBILD beweisen.");
  console.log("                     Laesst die aus, die den Repo-Checkout lesen (Oberflaeche,");
  console.log("                     Doku, nginx, compose) — den enthaelt das Abbild nicht.");
  console.log("                     Fuer den Pflichtschritt P1-C im Container.");
  console.log("");
  console.log("  --retry-on-abort   Wiederholt den Lauf GENAU EINMAL, wenn ein nativer Abbruch");
  console.log("                     eines Testkindprozesses erkannt wurde (siehe unten). Ohne");
  console.log("                     den Schalter wird der Abbruch nur gemeldet — der Exitcode");
  console.log("                     bleibt in jedem Fall der des Testlaufs.");
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function collectTestFiles(dirPath) {
  const files = [];

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTestFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(normalizePath(relative(PROJECT_DIR, absolutePath)));
    }
  }

  return files;
}

function parseSuite(argv) {
  let suite = "non-integration";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    if (arg === "--suite") {
      suite = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--suite=")) {
      suite = arg.slice("--suite=".length);
      continue;
    }

    /* Hier nur ueberlesen — ausgewertet wird der Schalter unten, wo der Lauf
       stattfindet. parseSuite bricht bei unbekannten Argumenten ab, deshalb
       muss jeder neue Schalter auch hier bekannt sein. */
    if (arg === "--retry-on-abort") {
      continue;
    }

    console.error(`[run-tests] Unknown argument: ${arg}`);
    usage();
    process.exit(1);
  }

  if (!VALID_SUITES.has(suite)) {
    console.error(`[run-tests] Invalid suite: ${suite}`);
    usage();
    process.exit(1);
  }

  return suite;
}

function matchesPattern(file, patterns) {
  const base = file.replace(/\\/g, "/").toLowerCase();
  return patterns.some((p) => base.includes(p));
}

function selectSuite(files, suite) {
  switch (suite) {
    case "integration":
      return files.filter((file) => file.startsWith("test/integration/"));
    case "all":
      return files;
    // ci = non-integration, force-exit already included in spawnSync args
    case "ci":
    case "non-integration":
      return files.filter((file) => !file.startsWith("test/integration/"));
    case "security":
      return files.filter((file) =>
        file.startsWith("test/security/") ||
        matchesPattern(file, ["security", "rbac-hardening", "rbac-middleware", "auth-security"])
      );
    case "tenant":
      return files.filter((file) =>
        matchesPattern(file, ["orgboundary", "org-boundary", "tenant"])
      );
    case "pilot":
      return files.filter((file) =>
        matchesPattern(file, ["pilot"])
      );
    /*
     * Nur, was das AUSGELIEFERTE ABBILD beweist.
     *
     * Der Container enthaelt `api/`, `sql/migrations` und `frontend/public/js`
     * — sonst nichts. Tests, die den Repo-Checkout lesen (Oberflaechen-Markup,
     * Doku, nginx.conf, compose-Dateien, `.env.prod.example`), koennen dort
     * nur scheitern. Sie sind nicht kaputt, sie pruefen eine andere Sache und
     * laufen im vollen Lauf auf dem Host und in CI.
     *
     * Die Auswahl folgt einer gemessenen Eigenschaft statt einer Namensliste —
     * Begruendung und Idiome in `./lib/abbildSuite.mjs`.
     */
    case "image": {
      const { imAbbild, brauchtCheckout } = teileNachAbbild(
        files.filter((file) => !file.startsWith("test/integration/")),
        (datei) => readFileSync(join(PROJECT_DIR, datei), "utf8"),
      );
      /* Kein stiller Schnitt: wer weniger prueft, sagt es. */
      const nachGrund = new Map();
      for (const b of brauchtCheckout) nachGrund.set(b.grund, (nachGrund.get(b.grund) ?? 0) + 1);
      console.log(
        `[run-tests] Suite 'image': ${imAbbild.length} Dateien. ` +
        `${brauchtCheckout.length} ausgelassen, weil sie den Repo-Checkout lesen ` +
        `(${[...nachGrund].map(([g, n]) => `${g}: ${n}`).join(", ")}).`,
      );
      console.log(
        "[run-tests] Diese pruefen Oberflaeche/Doku/Infrastruktur — nicht das Abbild. " +
        "Sie laufen im vollen Lauf: node scripts/run-tests.js",
      );
      return imAbbild;
    }

    // Dateien mit DB-abhaengigen Tests, die sich ohne DATABASE_URL still ueberspringen.
    // Sie sind der einzige Ort, an dem die Mandantentrennung wirklich gegen Postgres
    // geprueft wird — im Normallauf zaehlen sie nur als "skipped" (Audit-Backlog C-6).
    case "db-gated":
      return files.filter((file) =>
        file.startsWith("test/integration/") ||
        matchesPattern(file, [
          "org-boundary", "multi-location-integration", "capacityservice", "idempotency"
        ])
      );
    default:
      return files;
  }
}

const suite = parseSuite(process.argv.slice(2));
const discoveredFiles = collectTestFiles(TEST_DIR).sort();
const selectedFiles = selectSuite(discoveredFiles, suite);

if (selectedFiles.length === 0) {
  console.error(`[run-tests] No test files found for suite '${suite}'.`);
  process.exit(1);
}

// Diagnose-Sonde fuer unbehandelte Promise-Rejections (Audit-Backlog B-2).
//
// Der Flake in `me.route.coverage.test.js` zeigt sich nur im vollen Lauf, nie in
// Teilmengen, und nie auf Zuruf: die Datei faellt als GANZES aus ("test failed"),
// waehrend alle Untertests gruen sind. Wer die Sonde erst bei Auftreten von Hand
// anhaengt, hat den Lauf schon verloren, in dem sie passiert ist.
//
// GEMESSEN AM 2026-08-06 — die Vermutung "Rejection ausserhalb eines Tests" traegt
// nicht. Im fehlgeschlagenen Lauf stand im Protokoll:
//
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
//
// Das ist eine native libuv-Zusicherung beim PROZESSENDE unter Windows: ein Handle
// wird waehrend des Schliessens erneut geschlossen. Ausloeser ist das Zusammenspiel
// von `--test-force-exit` mit noch offenen Handles der Testdatei — der Kindprozess
// stirbt beim Aufraeumen, nachdem alle Tests bereits gruen waren. Es ist also kein
// fehlgeschlagener Test, sondern ein Abbruch danach.
//
// Der unmittelbar folgende Lauf war ohne Aenderung gruen (7832 Tests, 0 Fehler) —
// die Sporadik passt zu einer Wettlaufsituation, nicht zu einem Logikfehler.
// Echte Behebung: offene Handles der Datei vor dem Ende schliessen; dann kann
// `--test-force-exit` dort nichts mehr abschneiden. Bis dahin gilt: taucht genau
// diese Zeile auf, ist der Lauf zu wiederholen und NICHT als roter Test zu werten.
// Ein Lauf, der ohne sie rot ist, ist dagegen echt.
//
// SEIT 2026-08-23 MUSS DAS NIEMAND MEHR SELBST FINDEN. Die Regel stand zwei
// Wochen lang genau hier — als Kommentar in einer Datei, die beim Lesen eines
// roten Laufs niemand aufschlaegt. Sie setzt voraus, dass jemand 15000 Zeilen
// Ausgabe nach einer Zeile absucht, von deren Existenz er nichts weiss; am
// 2026-08-22 galt der Lauf deshalb zweimal als rot. Der Runner liest die Ausgabe
// jetzt mit (`./lib/nativerAbbruch.mjs`) und sagt es von sich aus.
//
// Die Sonde installiert nur Ereignis-Handler und kostet nichts, solange nichts
// passiert. NODE_OPTIONS statt eines eigenen `--import`-Arguments, weil node:test
// pro Testdatei einen Kindprozess startet — nur ueber die Umgebung erreicht die
// Sonde auch diese.
//
// Abschalten: TC_TEST_PROBE=0
const probePath = join(import.meta.dirname, "unhandled-rejection-probe.mjs");
const testEnv = { ...process.env };
if (process.env.TC_TEST_PROBE !== "0" && existsSync(probePath)) {
  const probeUrl = pathToFileURL(probePath).href;
  testEnv.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} --import ${probeUrl}`.trim();
}

// ── Der Lauf: durchreichen UND mitlesen ────────────────────────────────────
//
// Bis 2026-08-23 lief das als `spawnSync` mit `stdio: "inherit"`. Das ist die
// einfachste Form und hat einen Preis: der Runner sieht seine eigene Ausgabe
// nie. Um den nativen Abbruch oben zu erkennen, muss er sie lesen — also
// gepipet, chunkweise SOFORT weitergeschrieben und nebenbei gescannt.
//
// Vier Dinge daran sind nicht optional, sondern haben je einen Grund:
//
//  1. `pipe(…, { end: false })` — sonst schliesst der endende Kindstrom unsere
//     eigene Ausgabe mit, und alles, was danach kommt (der Befund!), ist weg.
//  2. `pipe` statt eines blossen `write` im data-Ereignis: `pipe` beachtet den
//     Rueckstau. Bei 15000 Zeilen in eine langsame Senke (Datei, CI-Log) waere
//     ungebremstes Schreiben ein wachsender Puffer im Arbeitsspeicher.
//  3. `FORCE_COLOR`, wenn unsere eigene Ausgabe ein Terminal ist: das Kind sieht
//     jetzt eine Pipe und faerbt sonst nicht mehr ein. Der Bericht saehe im
//     Terminal ploetzlich grau aus — eine Verschlechterung, die niemand bestellt
//     hat.
//  4. `--test-reporter=spec` festgenagelt. Der Default HAENGT VON DER
//     NODE-FASSUNG AB, und der Umbau macht das erst relevant: das Kind sieht
//     jetzt immer eine Pipe. Gemessen am 2026-08-23 — Node 24.11 (lokal) waehlt
//     `spec`, Node 20.20 (`api/Dockerfile`, beide CI-Workflows) waehlt `tap`.
//     Unter TAP kennt der Detektor kein einziges seiner Muster wieder: die
//     Abbruchzeile kommt dort mit `# `-Praefix, der Abschlussblock fehlt ganz.
//     Ohne dieses Argument waere die Erkennung im Container und in CI stumm —
//     also genau dort, wo das Release-Gate laeuft. Nichts wertet die Ausgabe
//     maschinell aus (geprueft: kein Workflow-Schritt parst sie), das Pinnen
//     kostet daher nichts und macht das Format ueberall gleich.
//  5. `process.exitCode` statt `process.exit()` am Ende: `process.exit()` kann
//     noch nicht geschriebene Ausgabe abschneiden, wenn stdout eine Pipe ist —
//     und ausgerechnet der Befund steht ganz am Schluss.
//  6. Der Befund geht nach STDOUT, nicht nach stderr. Der Bericht von node:test
//     steht auf stdout; wer einen Volllauf durchsuchbar machen will, schreibt
//     `npm test > lauf.log` — und haette den Befund darin sonst nicht. Genau
//     diese Datei aber ist der Ort, an dem man ihn sucht.
const farbigeAusgabe = Boolean(process.stdout.isTTY);
if (farbigeAusgabe && !testEnv.FORCE_COLOR && !testEnv.NO_COLOR) {
  testEnv.FORCE_COLOR = "1";
}

/*
 * Abgebrochene Senke (`… | head -5`) darf den Runner nicht umbringen.
 *
 * Mit `stdio: "inherit"` war das kein Thema: das EPIPE traf den Kindprozess.
 * Jetzt schreiben WIR, und ein unbehandeltes 'error' auf process.stdout waere
 * ein Absturz mit Stapelabzug — an einer Stelle, an der vorher schlicht nichts
 * passierte. Diese Handler ersetzen kein Verhalten, sie stellen das alte wieder
 * her.
 */
for (const senke of [process.stdout, process.stderr]) {
  senke.on("error", (e) => {
    if (e && (e.code === "EPIPE" || e.code === "ERR_STREAM_DESTROYED")) return;
    /* Kein `throw`: das waere eine uncaughtException und riss den Exitcode des
       Testlaufs mit sich — der Lauf haette dann gar kein Ergebnis mehr. */
    console.error(`[run-tests] Schreibfehler auf der Ausgabe: ${e?.message ?? e}`);
    process.exitCode = 1;
  });
}

function starteLauf() {
  return new Promise((fertig) => {
    const scanner = neuerScanner();
    let erledigt = false;
    const beenden = (status, signal, fehler) => {
      if (erledigt) return;
      erledigt = true;
      scanner.abschliessen();
      fertig({ status, signal, fehler, befund: scanner.beurteilen() });
    };

    const kind = spawn(
      process.execPath,
      ["--test", "--test-force-exit", "--test-reporter=spec", ...selectedFiles],
      {
        cwd: PROJECT_DIR,
        env: testEnv,
        stdio: ["inherit", "pipe", "pipe"],
      },
    );

    let fehler = null;
    /* Auch aufloesen, nicht nur merken: schlaegt `spawn` selbst fehl (falscher
       Pfad, ENOENT), darf der Runner nicht auf ein `close` warten, das je nach
       Node-Fassung ausbleiben kann. Ein Haenger waere schlimmer als der Fehler. */
    kind.on("error", (e) => {
      fehler = e;
      beenden(null, null, e);
    });

    /* Der Kanal muss mit: stdout und stderr sind zwei getrennte Pipes, deren
       Chunks verschraenkt eintreffen. Mit einem gemeinsamen Zeilenpuffer wuerde
       ein stderr-Schnipsel eine halbe stdout-Zeile zerreissen. */
    for (const [strom, senke, kanal] of [
      [kind.stdout, process.stdout, "stdout"],
      [kind.stderr, process.stderr, "stderr"],
    ]) {
      if (!strom) continue;
      strom.pipe(senke, { end: false });
      strom.on("data", (chunk) => scanner.aufnehmen(chunk, kanal));
      strom.on("error", (e) => { fehler = fehler || e; });
    }

    /* `close` statt `exit`: erst dann sind beide Stroeme leergelaufen. Bei
       `exit` fehlten die letzten Zeilen — und der Abbruch steht genau dort. */
    kind.on("close", (status, signal) => beenden(status, signal, fehler));
  });
}

let lauf = await starteLauf();

if (lauf.fehler) {
  console.error(`[run-tests] Failed to execute Node test runner: ${lauf.fehler.message}`);
  process.exitCode = 1;
} else {
  const befundText = formuliereBefund(lauf.befund, { status: lauf.status });
  if (befundText) process.stdout.write(befundText);

  /*
   * Wiederholen nur auf ausdruecklichen Wunsch, und nur bei erkanntem Abbruch.
   *
   * Automatisch zu wiederholen ist eine Entscheidung mit zwei Gesichtern: sie
   * macht CI belastbar gegen einen bekannten Wettlauf — und sie kann einen NEU
   * eingebauten Handle-Leck-Fehler dauerhaft zudecken, weil der zweite Lauf oft
   * durchgeht. Deshalb ausgeschaltet, ausdruecklich einmalig, und der zweite
   * Lauf sagt laut, dass er ein zweiter ist.
   */
  const wiederholenErlaubt = process.argv.slice(2).includes("--retry-on-abort");

  /* Nicht wiederholen, wenn der Lauf ausser dem Abbruch ECHTE rote Dateien hat.
     Sonst kostet der Schalter drei Minuten fuer ein Ergebnis, das sich nicht
     aendern kann — und schlimmer: der zweite Lauf endet wieder rot, und der
     Eindruck entsteht, "auch das Wiederholen hat nicht geholfen", obwohl der
     Abbruch mit den echten Fehlern nie etwas zu tun hatte. */
  if (wiederholenErlaubt && lauf.befund.abbruch && lauf.befund.weitereRoteDateien.length) {
    console.error("[run-tests] --retry-on-abort: KEINE Wiederholung — der Lauf hat neben dem");
    console.error("[run-tests] Abbruch echte rote Dateien. Die verschwinden dadurch nicht.");
    /* `typeof`-Pruefung, weil `null !== 0` wahr ist: ein per Signal gestorbener
     Lauf hat gar keinen Status und wuerde sonst wiederholt. */
  } else if (wiederholenErlaubt && lauf.befund.abbruch && typeof lauf.status === "number" && lauf.status !== 0) {
    console.error("[run-tests] --retry-on-abort: der Lauf wird EINMAL wiederholt.");
    console.error("[run-tests] Ist der zweite Lauf gruen, war es der bekannte Wettlauf beim");
    console.error("[run-tests] Prozessende. Ist er wieder rot, gilt sein Ergebnis.");
    const zweiter = await starteLauf();
    const zweiterText = formuliereBefund(zweiter.befund, { status: zweiter.status });
    if (zweiterText) process.stdout.write(zweiterText);
    if (zweiter.befund.abbruch) {
      console.error("[run-tests] Auch der zweite Lauf brach nativ ab — das ist kein Zufall mehr.");
      console.error("[run-tests] Die offenen Handles der betroffenen Datei gehoeren geschlossen.");
    }
    lauf = zweiter;
  }

  if (typeof lauf.status === "number") {
    process.exitCode = lauf.status;
  } else {
    console.error(
      `[run-tests] Node test runner exited without a status code${lauf.signal ? ` (Signal ${lauf.signal})` : ""}.`,
    );
    process.exitCode = 1;
  }
}
