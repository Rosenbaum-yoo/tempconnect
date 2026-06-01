#!/usr/bin/env node
/**
 * Critical coverage gate for commercial subscription files.
 *
 * Runs after `c8 ...` has produced coverage/coverage-summary.json.
 * Keeps global gates realistic while enforcing a higher floor on the files
 * that carry subscription revenue, entitlement and enterprise-request logic.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_DIR = join(import.meta.dirname, "..");
const SUMMARY_PATH = process.env.COVERAGE_SUMMARY_PATH || join(PROJECT_DIR, "coverage", "coverage-summary.json");

const TARGETS = [
  {
    label: "subscriptionRequestService",
    suffix: "services/subscriptionRequestService.js",
    thresholds: { lines: 60, statements: 60, functions: 55, branches: 50 }
  },
  {
    label: "entitlementService",
    suffix: "services/entitlementService.js",
    thresholds: { lines: 60, statements: 60, functions: 55, branches: 50 }
  },
  {
    label: "subscriptionDocumentService",
    suffix: "services/subscriptionDocumentService.js",
    thresholds: { lines: 55, statements: 55, functions: 50, branches: 45 }
  },
  {
    label: "publicPlans/catalog",
    suffix: "routes/publicPlans.js",
    thresholds: { lines: 70, statements: 70, functions: 70, branches: 50 }
  },
  {
    label: "planCatalog",
    suffix: "config/planCatalog.js",
    thresholds: { lines: 85, statements: 85, functions: 80, branches: 75 }
  },
  {
    label: "strategicCollaborationService",
    suffix: "services/strategicCollaborationService.js",
    thresholds: { lines: 70, statements: 70, functions: 60, branches: 55 }
  }
];

const TARGET_PATH = [
  "Current hard floor: global c8 40/70/60/40 plus critical file gates above.",
  "Next target: raise critical services toward 60% where below 60 and 70% for request/document/catalog.",
  "Later target: 70% critical floor once HTTP/integration suites are stable.",
  "Live-goal target: 80%+ on state-machine, entitlement and document-output logic."
];

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function readSummary() {
  try {
    return JSON.parse(readFileSync(SUMMARY_PATH, "utf8"));
  } catch (err) {
    console.error(`[coverage-critical] Cannot read ${SUMMARY_PATH}: ${err.message}`);
    process.exit(1);
  }
}

function findEntry(summary, suffix) {
  const normalizedSuffix = normalizePath(suffix);
  for (const [file, data] of Object.entries(summary)) {
    if (file === "total") continue;
    if (normalizePath(file).endsWith(normalizedSuffix)) return data;
  }
  return null;
}

function pct(entry, metric) {
  const value = Number(entry?.[metric]?.pct);
  return Number.isFinite(value) ? value : 0;
}

const summary = readSummary();
const failures = [];

console.log("[coverage-critical] Commercial critical coverage gates");
for (const target of TARGETS) {
  const entry = findEntry(summary, target.suffix);
  if (!entry) {
    failures.push(`${target.label}: coverage entry not found (${target.suffix})`);
    console.log(`- ${target.label}: MISSING (${target.suffix})`);
    continue;
  }

  const parts = [];
  for (const [metric, threshold] of Object.entries(target.thresholds)) {
    const actual = pct(entry, metric);
    parts.push(`${metric} ${actual.toFixed(2)}% >= ${threshold}%`);
    if (actual < threshold) {
      failures.push(`${target.label}.${metric}: ${actual.toFixed(2)}% < ${threshold}%`);
    }
  }
  console.log(`- ${target.label}: ${parts.join(", ")}`);
}

console.log("[coverage-critical] staged target path:");
for (const line of TARGET_PATH) console.log(`  ${line}`);

if (failures.length > 0) {
  console.error("[coverage-critical] failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("[coverage-critical] ok");
