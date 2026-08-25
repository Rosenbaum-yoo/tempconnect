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

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const PROJECT_DIR = join(import.meta.dirname, "..");
const TEST_DIR = join(PROJECT_DIR, "test");
const VALID_SUITES = new Set(["non-integration", "integration", "all", "ci", "security", "tenant", "pilot", "db-gated"]);

function usage() {
  console.log("Usage: node scripts/run-tests.js [--suite=non-integration|integration|all|ci|security|tenant|pilot|db-gated]");
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

const result = spawnSync(
  process.execPath,
  ["--test", "--test-force-exit", ...selectedFiles],
  {
    cwd: PROJECT_DIR,
    env: testEnv,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`[run-tests] Failed to execute Node test runner: ${result.error.message}`);
  process.exit(1);
}

if (typeof result.status === "number") {
  process.exit(result.status);
}

console.error("[run-tests] Node test runner exited without a status code.");
process.exit(1);
