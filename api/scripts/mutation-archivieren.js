#!/usr/bin/env node
/**
 * Legt aus einem Mutations-Lauf einen DATIERTEN, versionierbaren Auszug ab.
 *
 * WARUM DAS EIN SKRIPT IST
 * Der Rohbericht ist rund 75 MB pro Lauf und gehoert nicht in die
 * Versionsverwaltung. Was hineingehoert, ist der Teil, den eine Pruefung
 * braucht: die Scores und JEDER ueberlebende Mutant mit Datei, Zeile, Spalte
 * und Ersetzung. Genau dieser Auszug ist am 2026-08-14 einmal verloren gegangen
 * — die zitierte Zahl stand nur noch in einer Commit-Nachricht, ihr Bericht war
 * von einem kleinen Einzellauf ueberschrieben. Von Hand archivieren heisst:
 * irgendwann vergisst es jemand.
 *
 * ZWEI REGELN, DIE DAS SKRIPT ERZWINGT
 *   1. Ein bestehendes Datum wird NIE ueberschrieben. Ein Archiv, das man
 *      ueberschreiben kann, ist keins. Wer denselben Tag neu ablegen will,
 *      loescht den Ordner bewusst von Hand.
 *   2. Die Spalte kommt mit. Mehrere Mutanten teilen sich dieselbe Zeile
 *      (in `orgContext.js:187` zwei) — ohne Spalte ist ein Fall nicht
 *      eindeutig, und jede spaetere Einstufung darauf ist geraten.
 *
 * Aufruf:
 *   node scripts/mutation-archivieren.js                 (Aggregat-Lauf, heute)
 *   node scripts/mutation-archivieren.js --bericht reports/mutation/welle/rbacService/mutation.json
 *   node scripts/mutation-archivieren.js --datum 2026-08-15 --name rbac
 *
 * Exit 0 = abgelegt · Exit 1 = kein Bericht, oder das Datum ist schon belegt
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { todayDE } from "../utils/dateDE.js";

const API = join(import.meta.dirname, "..");
const DOCS = join(API, "..", "docs", "qualitaet", "mutation");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const berichtPfad = join(API, arg("bericht", "reports/mutation/welle/aggregat/mutation.json"));
const datum = arg("datum", todayDE());
const name = arg("name", "rbac");

if (!existsSync(berichtPfad)) {
  console.error(`Kein Bericht unter ${berichtPfad}.`);
  console.error("Zuerst messen: node scripts/mutation-welle.js --alle");
  process.exit(1);
}

const zielDir = join(DOCS, `${datum}-${name}`);
if (existsSync(zielDir)) {
  console.error(`${datum}-${name} ist bereits archiviert — ein Archiv wird nicht ueberschrieben.`);
  console.error("Fuer eine bewusste Neuablage den Ordner von Hand loeschen.");
  process.exit(1);
}

const bericht = JSON.parse(readFileSync(berichtPfad, "utf8"));

const dateien = {};
const ueberlebende = [];
let mutanten = 0;
let getoetet = 0;
let timeout = 0;

for (const [datei, f] of Object.entries(bericht.files)) {
  let dGetoetet = 0;
  let dUeberlebt = 0;
  let dTimeout = 0;

  for (const m of f.mutants) {
    mutanten++;
    if (m.status === "Killed") {
      dGetoetet++;
      getoetet++;
    } else if (m.status === "Timeout") {
      dTimeout++;
      timeout++;
    } else if (m.status === "Survived") {
      dUeberlebt++;
      ueberlebende.push({
        datei,
        zeile: m.location.start.line,
        spalte: m.location.start.column,
        mutator: m.mutatorName,
        ersetzt_durch: m.replacement || "",
      });
    }
  }

  // Stryker rechnet Timeouts als getoetet — der Mutant hat sich verraten.
  const bewertet = dGetoetet + dTimeout + dUeberlebt;
  dateien[datei] = {
    getoetet: dGetoetet,
    ueberlebt: dUeberlebt,
    timeout: dTimeout,
    score: bewertet ? Math.round(((dGetoetet + dTimeout) / bewertet) * 10000) / 100 : null,
  };
}

ueberlebende.sort((a, b) => a.datei.localeCompare(b.datei) || a.zeile - b.zeile || a.spalte - b.spalte);

const bewertet = getoetet + timeout + ueberlebende.length;
const ergebnis = {
  erzeugt: datum,
  werkzeug: `stryker ${bericht.schemaVersion || "?"}`,
  quelle: arg("bericht", "reports/mutation/welle/aggregat/mutation.json"),
  dateien,
  ueberlebende,
  gesamt: {
    mutanten,
    getoetet,
    timeout,
    ueberlebt: ueberlebende.length,
    score: bewertet ? Math.round(((getoetet + timeout) / bewertet) * 10000) / 100 : null,
  },
};

mkdirSync(zielDir, { recursive: true });
writeFileSync(join(zielDir, "ergebnis.json"), JSON.stringify(ergebnis, null, 1) + "\n");

console.log(`\nArchiviert: docs/qualitaet/mutation/${datum}-${name}/ergebnis.json\n`);
console.log(`  Mutanten:   ${mutanten}`);
console.log(`  getoetet:   ${getoetet}${timeout ? ` (+${timeout} Zeitueberschreitung)` : ""}`);
console.log(`  ueberlebt:  ${ueberlebende.length}`);
console.log(`  Score:      ${ergebnis.gesamt.score} %\n`);

for (const [datei, d] of Object.entries(dateien).sort((a, b) => b[1].ueberlebt - a[1].ueberlebt)) {
  console.log(`  ${String(d.score).padStart(6)} %  ${String(d.ueberlebt).padStart(3)} ueberlebt  ${datei}`);
}
console.log("\nDer Rohbericht bleibt draussen (rund 75 MB) — nur dieser Auszug wird versioniert.\n");
