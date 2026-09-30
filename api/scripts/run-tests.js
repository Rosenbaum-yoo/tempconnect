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
import {
  klaerungslauf,
  formuliereKlaerung,
  waehleZuKlaerende,
  fasseUrteileZusammen,
} from "./lib/klaerungslauf.mjs";
import { neuerSkipZaehler, formuliereSkips } from "./lib/uebersprungen.mjs";
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
  console.log("");
  console.log("  --verlange-datenbank  Macht uebersprungene DATENBANKTESTS zum Fehler. Ohne");
  console.log("                     DATABASE_URL ueberspringen sich rund 18 Tests still — sie");
  console.log("                     pruefen Zeilensperren, Transaktionen und echte");
  console.log("                     Eindeutigkeit, also genau das, was kein Mock zeigen kann.");
  console.log("                     Der Lauf sieht ohne sie gruen aus und beweist weniger.");
  console.log("                     Fuer Release- und CI-Laeufe. Nur die DB-Dateien:");
  console.log("                     DATABASE_URL=… node scripts/run-tests.js --suite=db-gated");
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
    if (arg === "--retry-on-abort" || arg === "--verlange-datenbank") {
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

/*
 * "13 skipped" ist eine Zahl, mit der niemand etwas anfangen kann.
 *
 * BEFUND (2026-08-25): Jeder Gate-Lauf dieser Welle meldete am Ende
 * `skipped 13` — und keiner nannte, WELCHE Dateien das sind, WARUM sie
 * schweigen oder WIE man sie faehrt. Es sind die DB-gebundenen Vorgangsketten:
 * der einzige Ort, an dem die Mandantentrennung und die Flows wirklich gegen
 * Postgres laufen. Ohne `DATABASE_URL` ueberspringen sie sich selbst — still
 * und gruen.
 *
 * Eine Zahl ohne Namen liest man beim zwoelften Mal nicht mehr. Deshalb steht
 * die Diagnose VOR dem Lauf und nennt den Befehl gleich mit: der Wahlschalter
 * `db-gated` existiert seit Audit-Backlog C-6 — nur wusste es niemand mehr.
 */
const dbKonfiguriert = Boolean(
  process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD)
);
if (!dbKonfiguriert && suite !== "db-gated") {
  const stumm = selectSuite(discoveredFiles, "db-gated");
  if (stumm.length > 0) {
    const beispiele = stumm.slice(0, 3).join(", ")
      + (stumm.length > 3 ? ` (+${stumm.length - 3} weitere)` : "");
    console.error(`[run-tests] HINWEIS: keine DATABASE_URL — ${stumm.length} Datei(en) sind DB-gebunden.`);
    console.error("[run-tests]          Die Tests darin, die wirklich Postgres brauchen, ueberspringen sich STILL");
    console.error("[run-tests]          und erscheinen am Ende nur als Zahl hinter 'skipped'. Es ist der einzige Ort,");
    console.error("[run-tests]          an dem Mandantentrennung und Vorgangsketten gegen eine echte Datenbank laufen.");
    console.error(`[run-tests]          Betroffen: ${beispiele}`);
    console.error("[run-tests]          Im Container fahren (NICHT nach /app kopieren — das ist der Hauptbaum):");
    console.error("[run-tests]            docker cp api/. tempconnect_api:/tmp/wtN/");
    console.error("[run-tests]            docker exec tempconnect_api sh -c \"ln -sfn /app/node_modules /tmp/wtN/node_modules && cd /tmp/wtN && node scripts/run-tests.js db-gated\"");
  }
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
    /* Zweiter Mitleser, eigene Frage: der Scanner sucht den Tod des Laufs, der
       Zaehler das, was der Lauf ausgelassen hat. Getrennt, weil die beiden
       Fragen bei der naechsten Aenderung nicht aneinander haengen sollen —
       siehe ./lib/uebersprungen.mjs */
    const skips = neuerSkipZaehler();
    let erledigt = false;
    const beenden = (status, signal, fehler) => {
      if (erledigt) return;
      erledigt = true;
      scanner.abschliessen();
      skips.abschliessen();
      fertig({ status, signal, fehler, befund: scanner.beurteilen(), skips: skips.beurteilen() });
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
      strom.on("data", (chunk) => { scanner.aufnehmen(chunk, kanal); skips.aufnehmen(chunk); });
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

  /*
   * KLAERUNGSLAUF (ergaenzt 2026-08-29) — vor der Wiederholung, weil er die
   * Frage beantwortet, die die Wiederholung nur wuerfelt.
   *
   * Ein Abbruch sagt nicht, ob die Datei in Ordnung ist. Die Wiederholung fuhr
   * bisher die ganze Suite erneut und schloss aus "beim zweiten Mal gruen" auf
   * "war der Wettlauf" — ein Umkehrschluss, der bei einer Datei versagt, die
   * den Wettlauf REPRODUZIERBAR verliert. Genau das war am 2026-08-29 der Fall:
   * `me.route.coverage.test.js` brach zweimal ab und galt damit faelschlich als
   * Datei mit offenen Handles. Ohne das Flag lief sie 68/68 gruen durch und
   * beendete sich in 1,1 Sekunden von selbst.
   *
   * Der Klaerungslauf faehrt deshalb genau diese Datei ohne `--test-force-exit`.
   * Das kostet Sekunden statt Minuten und trennt Wettlauf, echtes Handle-Leck
   * und echten Testfehler sauber voneinander. Details: ./lib/klaerungslauf.mjs
   *
   * Er laeuft ohne Schalter, anders als die Wiederholung: die kann ein neues
   * Leck zudecken, weil der zweite Lauf den Wettlauf oft gewinnt. Der
   * Klaerungslauf nimmt das Flag WEG und macht ein Leck damit sichtbar.
   *
   * Auch bei weiteren roten Dateien — sonst bliebe ausgerechnet die
   * abgestuerzte Datei ungeprueft, und ein echter Fehler in ihr faende sich
   * hinter dem Abbruch versteckt.
   */
  let klaerung = null;
  /* Beide Listen des Detektors — Begruendung in waehleZuKlaerende(). */
  const zuKlaeren = waehleZuKlaerende(lauf.befund);
  if (zuKlaeren.length) {
    console.error(`[run-tests] Klaerungslauf fuer ${zuKlaeren.join(", ")} — ohne --test-force-exit.`);
    /* Nacheinander, nicht gemeinsam: ein gemeinsamer Lauf haette wieder EIN
       Ergebnis fuer mehrere Dateien — dieselbe Mehrdeutigkeit, nur an anderer
       Stelle. Sequenziell statt parallel, weil zwei Testlaeufe auf derselben
       Datenbank einander die Zeilen unter den Fuessen wegziehen. */
    const urteile = [];
    for (const datei of zuKlaeren) {
      const u = await klaerungslauf({
        dateien: [datei],
        projektVerzeichnis: PROJECT_DIR,
        umgebung: testEnv,
      });
      process.stdout.write(formuliereKlaerung(u, [datei]));
      urteile.push(u);
    }
    klaerung = fasseUrteileZusammen(urteile);
  }

  /* Nicht wiederholen, wenn der Lauf ausser dem Abbruch ECHTE rote Dateien hat.
     Sonst kostet der Schalter drei Minuten fuer ein Ergebnis, das sich nicht
     aendern kann — und schlimmer: der zweite Lauf endet wieder rot, und der
     Eindruck entsteht, "auch das Wiederholen hat nicht geholfen", obwohl der
     Abbruch mit den echten Fehlern nie etwas zu tun hatte. */
  /* Hat der Klaerungslauf die Datei entlastet, ist die Frage beantwortet — eine
     Voll-Wiederholung wuerde nur dieselbe Antwort teurer einholen. */
  const geklaert = klaerung && klaerung.ergebnis === "sauber";

  if (geklaert && wiederholenErlaubt) {
    console.error("[run-tests] --retry-on-abort: keine Wiederholung noetig, der Klaerungslauf");
    console.error("[run-tests] hat die abgebrochene Datei bereits entlastet.");
  } else if (wiederholenErlaubt && lauf.befund.abbruch && lauf.befund.weitereRoteDateien.length) {
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

  /*
   * WAS DER LAUF NICHT BEWIESEN HAT (ergaenzt 2026-08-29).
   *
   * Am 2026-08-29 meldete ein Volllauf "10204 Tests, 1 Fehler" und sah damit
   * belastbar aus. Er war es nicht: 18 Tests hatten sich mangels DATABASE_URL
   * uebersprungen, darunter die beiden, die den Rechnungs-Nummernkreis und die
   * Ausstellerrolle gegen echte Zeilen pruefen. Mit Datenbank lief derselbe
   * Stand als 10259 Tests — 55 Zusicherungen Unterschied, ohne dass eine
   * einzige Zeile der Ausgabe darauf hingewiesen haette.
   *
   * CLAUDE.md §0.9 sagt es deutlich: ein Test, der unter dem offiziellen
   * Laeufer nicht real ausfuehrt, zaehlt nicht als gruen. Die Regel stand da,
   * aber nichts erzwang sie — ein uebersprungener Test sieht in der Ausgabe
   * genauso unauffaellig aus wie ein bestandener.
   */
  const datenbankGesetzt = !!(process.env.DATABASE_URL || process.env.DB_HOST);
  const verlangeDatenbank = process.argv.slice(2).includes("--verlange-datenbank");
  const skipText = formuliereSkips(lauf.skips, { datenbankGesetzt, verlangt: verlangeDatenbank });
  if (skipText) process.stdout.write(skipText);

  /* Rot nur auf ausdruecklichen Wunsch: der Lauf ohne Datenbank ist ein
     legitimes Werkzeug — schneller, und fuer die meiste Arbeit ausreichend. Er
     darf nur nicht so aussehen wie der vollstaendige. Fuer Release und CI
     macht der Schalter daraus einen Fehler. */
  const datenbankLuecke = verlangeDatenbank && lauf.skips && lauf.skips.datenbankSkips > 0;
  if (datenbankLuecke) {
    console.error("[run-tests] --verlange-datenbank: der Lauf ist ROT, weil datenbankgebundene");
    console.error("[run-tests] Tests uebersprungen wurden. Sie zaehlen nicht als gruen.");
  }

  /*
   * Das Gesamtergebnis nach einem geklaerten Abbruch.
   *
   * Gruen nur unter ZWEI Bedingungen zugleich: der Klaerungslauf hat die
   * abgestuerzte Datei vollstaendig und gruen gefahren, UND der Hauptlauf hatte
   * ausser dem Abbruch keine rote Datei. Dann ist jede Datei der Suite real
   * gelaufen und real gruen — das ist kein Wegschauen, sondern ein staerkerer
   * Beweis als der abgebrochene Lauf ihn hatte.
   *
   * Gibt es weitere rote Dateien, bleibt der Lauf rot. Die Klaerung sagt dann
   * nur, dass der Abbruch nicht zu ihnen gehoert.
   */
  if (datenbankLuecke) {
    /* Vor allem anderen: eine Luecke im Nachweis darf nicht von einer geklaerten
       Abbruchmeldung ueberstimmt werden. "Gruen bis auf die Tests, die gar nicht
       liefen" ist keine gruene Aussage. */
    process.exitCode = 1;
  } else if (geklaert && !lauf.befund.weitereRoteDateien.length) {
    console.error("[run-tests] Der Lauf gilt als GRUEN: die einzige rote Meldung war der");
    console.error("[run-tests] Abbruch, und die betroffene Datei ist im Klaerungslauf real");
    console.error("[run-tests] und vollstaendig gruen durchgelaufen.");
    process.exitCode = 0;
  } else if (typeof lauf.status === "number") {
    process.exitCode = lauf.status;
  } else {
    console.error(
      `[run-tests] Node test runner exited without a status code${lauf.signal ? ` (Signal ${lauf.signal})` : ""}.`,
    );
    process.exitCode = 1;
  }
}
