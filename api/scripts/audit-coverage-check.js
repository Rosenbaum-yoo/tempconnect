#!/usr/bin/env node
/**
 * Audit-Coverage-Check — statische Analyse aller Route-Dateien.
 * Prüft, dass jeder POST/PUT/PATCH/DELETE-Handler einen Audit-Marker hat:
 *   - res.locals.audit   (Auto-Middleware-Pattern)
 *   - writeAudit         (direkter Service-Aufruf)
 *   - writeAuditEnhanced (erweiterter Service-Aufruf)
 *
 * Ausnahmen (allowlist): Endpunkte, die bewusst keinen Audit-Log brauchen,
 * z.B. csrf, health, proofs-Stubs, interne Cron-Jobs, reine Status-Reads.
 *
 * Aufruf: node scripts/audit-coverage-check.js
 * Exit 0  = alle abgedeckt
 * Exit 1  = Violations gefunden
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const ROUTES_DIR = join(import.meta.dirname, "..", "routes");

/** Dateien, die komplett von der Pruefung ausgenommen sind */
const ALLOWLIST_FILES = new Set([
  // CSRF-Token-Ausgabe, kein State-Change
  "csrf.js",
  // Health/Ready/Status — Infrastruktur, kein Business-State
  "health.js",
  // Plan-Info — rein lesend (GET)
  "plans.js",
  // Proofs — Stub, 501 NOT_IMPLEMENTED
  "proofs.js",
  // Geo — rein lesend
  "geo.js",
  // Interne Cron-Jobs — System-Level, kein User-Context
  "internal.js",
]);

/** Einzelne Routen-Pfade, die keinen Audit brauchen (z.B. Webhooks ohne Session) */
const ALLOWLIST_ROUTES = new Set([
  "/payment/webhook/stripe",
  "/payment/webhook/paypal",
]);

/** Regex-Muster zum Erkennen von Mutation-Route-Registrierungen */
const MUTATION_RE = /router\.(post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

/** Regex-Muster zum Erkennen von Audit-Markern im Handler-Body */
const AUDIT_PATTERNS = [
  /res\.locals\.audit\s*=/,
  /writeAudit\s*\(/,
  /writeAuditEnhanced\s*\(/,
  /audit\s*\(req\s*,/,   // Lokale audit(req, ...) Wrapper (z.B. companyProfile.js)
];

/**
 * Extrahiert alle Mutation-Endpunkte aus einer Route-Datei
 * und prüft, ob im zugehörigen Handler-Block ein Audit-Marker vorhanden ist.
 */
/**
 * Erkennt delegierte Handler: wenn der Inline-Handler einen Funktionsaufruf wie
 * `handleTransition(req, res, ...)` oder `mutateStatus(req, res, ...)` enthaelt,
 * wird die Zielfunktion im gesamten Datei-Source auf Audit-Marker geprueft.
 */
const DELEGATE_RE = /=>\s*([a-zA-Z_]+)\s*\(\s*req\s*,\s*res/;

function checkFile(filePath) {
  const src = readFileSync(filePath, "utf-8");
  const violations = [];

  let match;
  MUTATION_RE.lastIndex = 0;
  while ((match = MUTATION_RE.exec(src)) !== null) {
    const method = match[1].toUpperCase();
    const route = match[2];
    const matchIndex = match.index;

    // Allowlisted Route?
    if (ALLOWLIST_ROUTES.has(route)) continue;

    // Finde den Handler-Block: ab dem Match bis zur naechsten Route-Registrierung
    const restOfFile = src.slice(matchIndex);
    const nextRouteMatch = restOfFile.slice(match[0].length).search(/router\.(get|post|put|patch|delete)\s*\(/i);
    const handlerBlock = nextRouteMatch >= 0
      ? restOfFile.slice(0, match[0].length + nextRouteMatch)
      : restOfFile;

    let hasAudit = AUDIT_PATTERNS.some(pat => pat.test(handlerBlock));

    // Pruefe delegierte Handler: z.B. `=> mutateStatus(req, res, "closed")`
    if (!hasAudit) {
      const delegateMatch = handlerBlock.match(DELEGATE_RE);
      if (delegateMatch) {
        const fnName = delegateMatch[1];
        // Suche die Funktion im gesamten Source
        const fnBodyStart = src.indexOf(`function ${fnName}(`) !== -1
          ? src.indexOf(`function ${fnName}(`)
          : src.indexOf(`async function ${fnName}(`);
        if (fnBodyStart >= 0) {
          const fnBody = src.slice(fnBodyStart, fnBodyStart + 2000);
          hasAudit = AUDIT_PATTERNS.some(pat => pat.test(fnBody));
        }
      }
    }

    // 501 Stubs brauchen kein Audit
    const isStub = /status\(501\)/.test(handlerBlock);

    if (!hasAudit && !isStub) {
      const lineNo = src.slice(0, matchIndex).split("\n").length;
      violations.push({ method, route, line: lineNo });
    }
  }

  return violations;
}

// ── Main ─────────────────────────────────────────────────────────
const files = readdirSync(ROUTES_DIR).filter(f => f.endsWith(".js") && !ALLOWLIST_FILES.has(f));
let totalEndpoints = 0;
let totalViolations = 0;
const results = [];

for (const file of files.sort()) {
  const filePath = join(ROUTES_DIR, file);
  const violations = checkFile(filePath);

  // Zähle alle Mutation-Endpunkte
  const src = readFileSync(filePath, "utf-8");
  MUTATION_RE.lastIndex = 0;
  let count = 0;
  while (MUTATION_RE.exec(src) !== null) count++;
  totalEndpoints += count;

  if (violations.length > 0) {
    totalViolations += violations.length;
    results.push({ file, violations });
  }
}

// ── Ausgabe ──────────────────────────────────────────────────────
console.log("╔══════════════════════════════════════════════════════╗");
console.log("║       AUDIT-COVERAGE CHECK — TempConnect            ║");
console.log("╚══════════════════════════════════════════════════════╝\n");

if (results.length === 0) {
  console.log(`✅  Alle ${totalEndpoints} Mutation-Endpunkte haben Audit-Coverage.`);
  console.log(`    (${ALLOWLIST_FILES.size} Dateien + ${ALLOWLIST_ROUTES.size} Routen auf der Allowlist)\n`);
  process.exit(0);
} else {
  console.log(`❌  ${totalViolations} Violation(s) in ${results.length} Datei(en):\n`);
  for (const { file, violations } of results) {
    console.log(`  📄 ${file}`);
    for (const v of violations) {
      console.log(`     Zeile ${v.line}: ${v.method} ${v.route} — kein Audit-Marker`);
    }
    console.log();
  }
  console.log(`Gesamt: ${totalEndpoints} Endpunkte geprüft, ${totalViolations} ohne Audit.\n`);
  process.exit(1);
}
