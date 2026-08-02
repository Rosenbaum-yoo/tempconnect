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
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  // No-Op Stub — kein State-Change, nur Logging
  "/demo/reset",
  // Read-Only POST — Duplikat-Check ohne Mutation
  "/workers/check-duplicates",
  // UI-Convenience — Benachrichtigungs-Lesemarkierung, keine Business-Mutation
  "/worker/notifications/:id/read",
  "/worker/notifications/read-all",
  // Public telemetry ingest — kein User-Context, kein Business-State-Change (analytics.js)
  "/analytics/track-public",
  // Anonyme Profil-View-Telemetrie (IP/UA nur gehasht, kein Akteur) — gleiche
  // Begruendung wie track-public (profileAnalytics.js)
  "/profile-analytics/events",
  // Session-Cache-Reset — kein DB-Write, nur req.session._locationCache löschen (me.js)
  "/me/active-location",
  // Öffentliches Lead-/Voranmelde-Formular (anti-spam via Honeypot + Rate-Limit, kein
  // Akteur/Session) — der Prereg-Record + SCC-Sicht sind der Nachweis, kein privilegierter
  // State-Change. Gleiche Begründung wie track-public (pilotPreregistration.js)
  "/pilot-preregistration",
  // Self-Cleanup der EIGENEN Such-Historie — nicht-sensible Nutzerdaten, kein Audit nötig (search.js)
  "/search/recent",
]);

/** Regex-Muster zum Erkennen von Mutation-Route-Registrierungen */
const MUTATION_RE = /router\.(post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

/** Regex-Muster zum Erkennen von Audit-Markern im Handler-Body */
const AUDIT_PATTERNS = [
  /res\.locals\.audit\s*=/,
  /writeAudit\s*\(/,
  /writeAuditEnhanced\s*\(/,
  /audit\s*\(req\s*,/,          // Lokale audit(req, ...) Wrapper (z.B. companyProfile.js)
  /writeStaffAudit\s*\(/,       // Staff Control Center — eigener Audit-Service (staffControlCenter.js)
  /insertSupportAudit\s*\(/,    // Support Operations Center — direkte Audit-Log-Insertion (support.js)
  /supportVendorAudit\s*\(/,    // SCC Support-Vendor-Wrapper → writeStaffAudit (staffControlCenter.js)
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

/**
 * Erkennt Handler, die als blosse Funktions-REFERENZ registriert werden statt als
 * Inline-Arrow — z.B. `router.patch("/x/:id", gate, scope, json, applyUpdate);`
 * (scim.js teilt sich PUT/PATCH einen gemeinsamen applyUpdate-Handler).
 * Ohne diese Erkennung meldet das Gate solche Endpunkte faelschlich als "kein Audit",
 * obwohl der Audit-Aufruf in der referenzierten Funktion steht.
 *
 * `[^)]*?` kann keine Klammer ueberspringen — Inline-Arrows (`async (req, res) => {`)
 * matchen daher bewusst NICHT und laufen weiter ueber die normale Block-Pruefung.
 */
const DIRECT_HANDLER_RE = /^\s*router\.(?:post|put|patch|delete)\s*\([^)]*?,\s*([a-zA-Z_$][\w$]*)\s*\)\s*;?\s*$/;

/**
 * Liefert den vollstaendigen Rumpf einer benannten Funktion (brace-matched).
 * Unterstuetzt `function f(){}`, `async function f(){}` und `const f = async (…) => {}`.
 *
 * Bewusst brace-matched statt fixem Zeichenfenster: ein zu kurzes Fenster uebersieht
 * Audit-Aufrufe am Ende langer Handler (false negative), ein zu langes zieht den
 * Audit-Aufruf der NAECHSTEN Funktion herein und meldet ungeprueft "abgedeckt"
 * (false positive) — fuer ein Security-Gate das gefaehrlichere Versagen.
 *
 * @returns {string|null} Funktionsrumpf oder null, wenn die Funktion nicht auffindbar ist
 */
function resolveFunctionBody(src, fnName) {
  const escaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declRe = new RegExp(
    `(?:async\\s+)?function\\s+${escaped}\\s*\\(|` +
    `(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?(?:function\\b|\\()`,
    "m"
  );
  const decl = declRe.exec(src);
  if (!decl) return null;

  // Erst die Parameterliste ueberspringen, dann den Rumpf suchen — sonst wuerde ein
  // destrukturiertes Argument (`function f({ a, b }) {`) faelschlich als Rumpf gelesen.
  const parenOpen = src.indexOf("(", decl.index);
  if (parenOpen < 0) return null;
  let parenDepth = 0;
  let parenClose = -1;
  for (let i = parenOpen; i < src.length; i++) {
    if (src[i] === "(") parenDepth++;
    else if (src[i] === ")") { parenDepth--; if (parenDepth === 0) { parenClose = i; break; } }
  }
  if (parenClose < 0) return null;

  const bodyStart = src.indexOf("{", parenClose);
  if (bodyStart < 0) return null;

  let depth = 0;
  for (let i = bodyStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(bodyStart, i + 1);
    }
  }
  return src.slice(bodyStart); // unbalanciert → Rest der Datei (konservativ)
}

/**
 * Liefert den vollstaendigen Aufruf `router.post( … )` ab `startIndex` — inklusive
 * verschachtelter Klammern, aber ohne alles, was NACH der schliessenden Klammer folgt.
 *
 * Klammern in String-Literalen (Route-Pfade, SQL) und in KOMMENTAREN werden nicht
 * mitgezaehlt: Nummerierte Schritt-Kommentare wie `// 1)` sind im Code verbreitet und
 * wuerden den Handler sonst mittendrin beenden (der Audit-Aufruf dahinter ginge verloren).
 *
 * @returns {string|null} Aufruftext oder null bei unbalancierter Klammerung
 */
function extractCallArguments(src, startIndex) {
  const open = src.indexOf("(", startIndex);
  if (open < 0) return null;
  let depth = 0;
  let quote = null;      // ' " ` — aktives String-Literal
  let comment = null;    // "line" | "block"
  let inRegex = false;   // /…/ Regex-Literal
  let lastSignificant = ""; // letztes bedeutungstragendes Zeichen (fuer Regex-Erkennung)

  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (comment === "line") { if (ch === "\n") comment = null; continue; }
    if (comment === "block") { if (ch === "*" && next === "/") { comment = null; i++; } continue; }
    if (inRegex) {
      if (ch === "\\") { i++; continue; }
      if (ch === "[") { // Zeichenklasse: / darin beendet die Regex nicht
        while (i < src.length && src[i] !== "]") { if (src[i] === "\\") i++; i++; }
        continue;
      }
      if (ch === "/") { inRegex = false; lastSignificant = "/"; }
      continue;
    }
    if (quote) {
      if (ch === "\\") { i++; continue; }
      if (ch === quote) { quote = null; lastSignificant = "x"; }
      continue;
    }

    if (ch === "/" && next === "/") { comment = "line"; i++; continue; }
    if (ch === "/" && next === "*") { comment = "block"; i++; continue; }
    // Regex-Literal vs. Division: nach Operator/Klammer-auf/Komma steht ein Literal,
    // nach Wert/Bezeichner/Klammer-zu eine Division. Ohne das verwechselt der Scanner
    // das Ende von `/^\//` mit einem Zeilenkommentar und verliert die Klammerbilanz.
    if (ch === "/" && (lastSignificant === "" || "(,=:[!&|?{};+-*%<>~^".includes(lastSignificant))) {
      inRegex = true;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return src.slice(startIndex, i + 1); }

    if (!/\s/.test(ch)) lastSignificant = ch;
  }
  return null;
}

/**
 * Ersatz-Blockgrenze, wenn der Klammer-Scanner scheitert: ab der Registrierung bis zur
 * naechsten Route-Registrierung (das urspruengliche Verhalten des Gates).
 */
function fallbackBlock(src, matchIndex, matchText) {
  const restOfFile = src.slice(matchIndex);
  const nextRouteMatch = restOfFile.slice(matchText.length).search(/router\.(get|post|put|patch|delete)\s*\(/i);
  return nextRouteMatch >= 0 ? restOfFile.slice(0, matchText.length + nextRouteMatch) : restOfFile;
}

/** Bezeichner, die zwar wie Funktionsaufrufe aussehen, aber keine sind. */
const NOT_A_CALL = new Set([
  "if", "for", "while", "switch", "catch", "return", "typeof", "await", "function",
  "require", "String", "Number", "Boolean", "Array", "Object", "JSON", "Promise", "Date", "Math"
]);

/**
 * Loest lokale Audit-WRAPPER auf (eine Indirektionsebene).
 * Muster: der Handler ruft keinen Audit-Service direkt auf, sondern eine in derselben
 * Datei definierte Hilfsfunktion, die ihrerseits writeAudit(...) aufruft — z.B.
 * `writeScimAudit(req, {...})` in scim.js.
 *
 * Bewusst generisch statt einer weiteren Namens-Konstante in AUDIT_PATTERNS: der Wrapper
 * muss seinen Audit-Aufruf BEWEISEN (sein Rumpf wird geprueft), waehrend ein Eintrag in
 * AUDIT_PATTERNS jedem gleichnamigen Aufruf blind vertraut.
 */
function hasAuditViaLocalWrapper(src, handlerBlock) {
  const seen = new Set();
  const callRe = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = callRe.exec(handlerBlock)) !== null) {
    const name = m[1];
    if (seen.has(name) || NOT_A_CALL.has(name)) continue;
    seen.add(name);
    const body = resolveFunctionBody(src, name);
    if (body && AUDIT_PATTERNS.some(pat => pat.test(body))) return true;
  }
  return false;
}

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

    // Handler-Block = exakt die Argumentliste DIESER router.X(...)-Registrierung (paren-matched).
    // Frueher: "alles bis zur naechsten Route-Registrierung" — dabei wurden Hilfsfunktionen,
    // die ZWISCHEN zwei Registrierungen stehen, in den vorherigen Block hineingezogen. Ein
    // dortiges writeAudit(...) liess den vorherigen Handler faelschlich als abgedeckt gelten
    // (false negative — das Gate haette eine echte Luecke verschwiegen).
    // Fallback bei unbalancierter Klammerung: die alte Heuristik (bis zur naechsten
    // Registrierung) — bewusst NICHT "Rest der Datei", das waere die permissivste
    // Variante und wuerde bei einem Scanner-Fehler still jede Luecke verstecken.
    const handlerBlock = extractCallArguments(src, matchIndex) ?? fallbackBlock(src, matchIndex, match[0]);

    let hasAudit = AUDIT_PATTERNS.some(pat => pat.test(handlerBlock));

    // Pruefe delegierte Handler. Zwei Formen:
    //   1) Aufruf im Inline-Arrow:  `=> mutateStatus(req, res, "closed")`
    //   2) blosse Referenz:         `router.put("/x/:id", gate, applyUpdate);`
    if (!hasAudit) {
      const delegateMatch = handlerBlock.match(DELEGATE_RE)
        || handlerBlock.match(DIRECT_HANDLER_RE);
      if (delegateMatch) {
        const fnBody = resolveFunctionBody(src, delegateMatch[1]);
        if (fnBody) {
          hasAudit = AUDIT_PATTERNS.some(pat => pat.test(fnBody))
            || hasAuditViaLocalWrapper(src, fnBody);
        }
      }
    }

    // Letzter Schritt: lokaler Audit-Wrapper direkt im Handler (z.B. writeScimAudit(req, …))
    if (!hasAudit) hasAudit = hasAuditViaLocalWrapper(src, handlerBlock);

    // 501 Stubs brauchen kein Audit
    const isStub = /status\(501\)/.test(handlerBlock);

    if (!hasAudit && !isStub) {
      const lineNo = src.slice(0, matchIndex).split("\n").length;
      violations.push({ method, route, line: lineNo });
    }
  }

  return violations;
}

// Fuer Tests: die Scanner-Bausteine sind einzeln pruefbar (test/auditCoverageCheck.test.js).
export { extractCallArguments, resolveFunctionBody, hasAuditViaLocalWrapper, checkFile };

// ── Main ─────────────────────────────────────────────────────────
// Nur ausfuehren, wenn direkt aufgerufen — sonst wuerde ein Test-Import die komplette
// Pruefung starten und via process.exit() den Testlauf abbrechen.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runCheck();

function runCheck() {
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
}
