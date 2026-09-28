/**
 * ═══════════════════════════════════════════════════════════════════════════
 * sqlScanner — SQL aus JavaScript herausholen, ohne sich zu verschlucken
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Diese Funktionen standen bis zum 2026-09-28 in `test/sqlSchemaWaechter.test.js`
 * und wurden woertlich hierher verschoben — nicht umgeschrieben. Der Anlass war
 * Welle Z, Z17: ein ZWEITER Waechter
 * (`test/identitaetenNichtVermischen.test.js`) braucht genau denselben Scanner.
 * Ihn dort nachzubauen waere die Parallelstruktur, die dieses Projekt verbietet,
 * und zwar die schlimmste Sorte: zwei Scanner driften auseinander, und der
 * schwaechere von beiden meldet dann gruen, wo der andere rot waere.
 *
 * Aus einer Testdatei zu importieren war die Alternative und ist keine: bei
 * `node --test` registriert die importierte Datei ihre eigenen Pruefungen im
 * importierenden Lauf, sie liefen doppelt und die Zaehlung waere falsch.
 *
 * Dass der Scanner nach dem Verschieben noch dasselbe tut, belegt die
 * Selbstprobe des urspruenglichen Waechters: er findet die beiden Funde vom
 * 2026-08-13 in einer Nachbildung wieder. Sie laeuft unveraendert weiter.
 *
 * WAS DER SCANNER KANN, und warum er das koennen muss (aus dem urspruenglichen
 * Kommentar uebernommen, weil die Gruende gemessen sind):
 *   - JS-Kommentare ueberspringen. Das Repo dokumentiert seine SQL-Entscheidungen
 *     ausfuehrlich, INKLUSIVE absichtlich falscher Gegenbeispiele. Wer die mit
 *     prueft, meldet die Dokumentation als Fehler.
 *   - '/"-Strings als eigene Klasse fuehren: 18,3 Prozent der SQL-Literale stehen
 *     in doppelten Anfuehrungszeichen, darunter die komplette DSGVO-Schicht.
 *   - Regex-Literale erkennen, damit ein /['"]/ den Scanner nicht aus dem Tritt
 *     bringt.
 *   - Verschachtelte Templates innerhalb von ${...} mit eigener Klammer-,
 *     String- und Template-Tiefe ueberspringen.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/* Pfadaufloesung relativ zu DIESER Datei, nicht zu process.cwd() — sonst
   uebersieht der Scanner je nach Startverzeichnis lautlos den ganzen Korpus,
   und die Wache ist leer gruen. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* Das Modul liegt in test/lib/, der Waechter erwartete api/ — eine Ebene mehr. */
const MODUL_API_DIR = path.resolve(__dirname, "..", "..");


export const KORPUS = ["services", "routes", "routes/occ", "middleware", "jobs", "db", "config", "utils"];

export function hatQuellen(apiDir) {
  try {
    return fs.readdirSync(path.join(apiDir, "services")).filter((f) => f.endsWith(".js")).length >= 20;
  } catch { return false; }
}

export const API_KANDIDATEN = [MODUL_API_DIR, process.cwd()];
export const API_DIR = API_KANDIDATEN.find(hatQuellen) || API_KANDIDATEN[0];
export const SCHEMA_DATEI = path.join(API_DIR, "test", "fixtures", "schema.json");

export const M_I = "\u0001";   // maskierte Interpolation ${...}
export const M_S = "\u0002";   // maskiertes SQL-String-Literal

export function entschaerfe(s) {
  return s.replace(/\\n/g, "\n").replace(/\\t/g, " ").replace(/\\r/g, " ").replace(/\\(.)/g, "$1");
}

export function jsLiterale(src) {
  const out = [];
  let i = 0, zeile = 1, vorher = "start";
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { zeile++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") zeile++; i++; }
      i += 2; continue;
    }
    if (c === "/" && (vorher === "op" || vorher === "start")) {
      const start = i; i++;
      let inClass = false, ok = false;
      while (i < n) {
        const d = src[i];
        if (d === "\\") { i += 2; continue; }
        if (d === "\n") break;
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) { ok = true; i++; break; }
        i++;
      }
      if (!ok) i = start + 1;
      vorher = "wert"; continue;
    }
    if (c === "'" || c === '"') {
      const q = c, startZ = zeile; let buf = ""; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { buf += src[i] + (src[i + 1] || ""); i += 2; continue; }
        if (src[i] === "\n") zeile++;
        buf += src[i]; i++;
      }
      i++;
      out.push({ text: entschaerfe(buf), zeile: startZ });
      vorher = "wert"; continue;
    }
    if (c === "`") {
      const startZ = zeile; let buf = ""; i++;
      while (i < n) {
        const d = src[i];
        if (d === "\\") { buf += d + (src[i + 1] || ""); i += 2; continue; }
        if (d === "`") { i++; break; }
        if (d === "$" && src[i + 1] === "{") {
          // ${...} mit eigener Klammer-, String- und Template-Tiefe ueberspringen
          let tiefe = 1; i += 2;
          while (i < n && tiefe > 0) {
            const e = src[i];
            if (e === "\n") zeile++;
            if (e === "{") tiefe++;
            else if (e === "}") tiefe--;
            else if (e === "`" || e === "'" || e === '"') {
              const q2 = e; i++;
              while (i < n && src[i] !== q2) {
                if (src[i] === "\\") { i += 2; continue; }
                if (src[i] === "\n") zeile++;
                i++;
              }
            }
            i++;
          }
          buf += M_I; continue;
        }
        if (d === "\n") zeile++;
        buf += d; i++;
      }
      out.push({ text: entschaerfe(buf), zeile: startZ });
      vorher = "wert"; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const w = src.slice(i, j);
      vorher = /^(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/.test(w) ? "op" : "wert";
      i = j; continue;
    }
    if (/[0-9]/.test(c)) { let j = i; while (j < n && /[0-9.eExXa-fA-F_]/.test(src[j])) j++; i = j; vorher = "wert"; continue; }
    vorher = (c === ")" || c === "]" || c === "}") ? "wert" : "op";
    i++;
  }
  return out;
}


export function normalisiere(sql) {
  let out = "", i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") { while (i < n && sql[i] !== "\n") i++; out += " "; continue; }
    if (c === "/" && sql[i + 1] === "*") {
      i += 2; while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++; i += 2; out += " "; continue;
    }
    if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      out += `'${M_S}'`; continue;
    }
    if (c === "$" && sql[i + 1] === "$") {
      i += 2; while (i < n && !(sql[i] === "$" && sql[i + 1] === "$")) i++; i += 2; out += `'${M_S}'`; continue;
    }
    if (c === '"') { i++; let b = ""; while (i < n && sql[i] !== '"') { b += sql[i]; i++; } i++; out += b; continue; }
    if (c === "\n" || c === "\t" || c === "\r") { out += " "; i++; continue; }
    out += c; i++;
  }
  return out;
}


export function quellDateien() {
  const out = [];
  for (const d of KORPUS) {
    const p = path.join(API_DIR, d);
    let eintraege;
    try { eintraege = fs.readdirSync(p); } catch { continue; }
    for (const f of eintraege) if (f.endsWith(".js")) out.push(path.join(p, f));
  }
  return out;
}

/* Woerter, die hinter FROM/JOIN stehen koennen, ohne eine Tabelle zu sein.
   `LATERAL` ist der wichtigste: ohne ihn liest die Alias-Aufloesung
   "JOIN LATERAL (" als Tabelle `LATERAL` mit dem Alias `(`. */
const KEIN_TABELLENNAME = new Set([
  "lateral", "select", "on", "as", "where", "left", "right", "inner", "outer",
  "cross", "full", "join", "set", "values", "using", "and", "or", "not",
  "distinct", "only", "true", "false", "null", "unnest", "generate_series"
]);

export function aliasKarte(sql) {
  const karte = new Map();
  const re = /\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)\s+(?:AS\s+)?([a-z_][a-z0-9_]*)\b/gi;
  let m;
  while ((m = re.exec(sql))) {
    const tab = m[1].toLowerCase();
    const alias = m[2].toLowerCase();
    if (KEIN_TABELLENNAME.has(tab) || KEIN_TABELLENNAME.has(alias)) continue;
    /* Der ERSTE Treffer gilt: eine Unterabfrage darf den Alias der aeusseren
       nicht ueberschreiben, sonst stuft die Pruefung sie falsch ein. */
    if (!karte.has(alias)) karte.set(alias, tab);
  }
  return karte;
}
