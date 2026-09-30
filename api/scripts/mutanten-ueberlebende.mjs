/**
 * Welche Mutanten haben ueberlebt — und an welcher Zeile?
 *
 * Der Stryker-Bericht (`reports/mutation/<bereich>/index.html`) ist gross und
 * laesst sich schlecht ueberfliegen; die Textausgabe des Laufs nennt nur
 * `datei:zeile:spalte` ohne den Quelltext dazu. Beim Schliessen einer Luecke
 * braucht man aber genau das: WELCHE Zeile, WELCHER Mutator, und was steht dort.
 *
 * Dieses Werkzeug liest `mutation.json` und gruppiert die Ueberlebenden je Datei
 * und Zeile, mit der Quellzeile daneben. Damit sieht man in einem Blick, ob sich
 * die Ueberlebenden in Nestern sammeln (dann fehlt eine ganze Probe) oder einzeln
 * verteilt liegen (dann sind es meist gleichwertige Mutanten).
 *
 * ACHTUNG, aus Welle M2.7 gelernt: der Bericht ist ein HINWEIS, kein Urteil.
 * Stryker mutiert Teilausdruecke, nicht ganze Ausdruecke, und ein Fallback eine
 * Zeile weiter kann den Unterschied verschlucken — dann ist der Mutant
 * gleichwertig und durch keine ehrliche Probe zu toeten. Vor jeder Probe, die
 * einen Mutanten toeten soll: von Hand rueckmutieren und pruefen, dass die Suite
 * dabei WIRKLICH rot wird.
 *
 * Lauf:  node scripts/mutanten-ueberlebende.mjs <bereich>
 *        node scripts/mutanten-ueberlebende.mjs trennwand
 * Ohne Argument werden die vorhandenen Bereiche aufgezaehlt.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const BERICHTE = path.join(API, "reports", "mutation");

const bereich = process.argv[2];

function bereicheAuflisten() {
  if (!fs.existsSync(BERICHTE)) return [];
  return fs.readdirSync(BERICHTE)
    .filter((d) => fs.existsSync(path.join(BERICHTE, d, "mutation.json")));
}

if (!bereich) {
  const da = bereicheAuflisten();
  console.log("Aufruf: node scripts/mutanten-ueberlebende.mjs <bereich>\n");
  console.log(da.length
    ? "Gemessene Bereiche:\n  " + da.join("\n  ")
    : "Noch kein Bericht vorhanden. Erst messen: npm run test:mutation:<bereich>");
  process.exit(da.length ? 0 : 1);
}

const datei = path.join(BERICHTE, bereich, "mutation.json");
if (!fs.existsSync(datei)) {
  console.error(`Kein Bericht fuer '${bereich}' unter ${datei}.`);
  console.error("Erst messen:  npm run test:mutation:" + bereich);
  process.exit(1);
}

const bericht = JSON.parse(fs.readFileSync(datei, "utf8"));
const quellen = {};
const ueberlebende = [];
let gesamt = 0;
for (const [name, d] of Object.entries(bericht.files || {})) {
  quellen[name] = (d.source || "").split("\n");
  for (const m of d.mutants || []) {
    gesamt++;
    if (m.status !== "Survived" && m.status !== "NoCoverage") continue;
    ueberlebende.push({ name, zeile: m.location.start.line, mutator: m.mutatorName, status: m.status });
  }
}

console.log(`Bereich: ${bereich}`);
console.log(`Mutanten gesamt: ${gesamt}   ueberlebt: ${ueberlebende.length}`
  + `   (${gesamt ? (100 - (ueberlebende.length / gesamt) * 100).toFixed(2) : "0"} % grob)`);
/* "grob", weil Stryker Zeitablaeufe und Compile-Fehler als getoetet zaehlt und
   sie hier nicht abgezogen werden. Die verbindliche Zahl steht im Lauf selbst. */

const jeDatei = {};
for (const u of ueberlebende) (jeDatei[u.name] = jeDatei[u.name] || []).push(u);

for (const [name, liste] of Object.entries(jeDatei).sort((a, b) => b[1].length - a[1].length)) {
  console.log("\n" + "=".repeat(74) + "\n" + name + `  (${liste.length})`);
  const jeZeile = {};
  for (const u of liste) {
    (jeZeile[u.zeile] = jeZeile[u.zeile] || []).push(u.mutator + (u.status === "NoCoverage" ? "*" : ""));
  }
  for (const [zeile, mutatoren] of Object.entries(jeZeile).sort((a, b) => a[0] - b[0])) {
    const quelle = (quellen[name][zeile - 1] || "").trim().slice(0, 74);
    console.log(`  ${String(zeile).padStart(4)}  ${[...new Set(mutatoren)].join(", ").padEnd(36)} | ${quelle}`);
  }
}

if (ueberlebende.some((u) => u.status === "NoCoverage")) {
  console.log("\n(* = von keiner Probe erreicht — dort fehlt nicht die Schaerfe, sondern der Test)");
}
