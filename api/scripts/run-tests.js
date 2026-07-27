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
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

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

const result = spawnSync(
  process.execPath,
  ["--test", "--test-force-exit", ...selectedFiles],
  {
    cwd: PROJECT_DIR,
    env: process.env,
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
